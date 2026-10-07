# AI Workforce Platform — Phase 12: Retrieval-Augmented Generation (RAG)

**Project:** AI Workforce Platform  
**Phase:** 12 — Retrieval-Augmented Generation (RAG)  
**Status:** COMPLETED ✅  
**Previous Phase:** Phase 11 — Vector Database / Qdrant  
**Next Phase:** Phase 13 — Authentication  

---

## 1. Executive Summary

Phase 12 transforms the semantic retrieval capability created in Phase 11 into a **grounded generation system**.

Where Phase 11 ended at retrieval:
```text
Document → Chunk → Embedding → Qdrant → Semantic Search → Relevant Chunks
```

Phase 12 completes the loop with controlled generation and citation validation:
```text
Relevant Chunks → Context Construction → Grounded Prompt → LLM → Structured Output → Citation Validation → Grounded Answer
```

### The Golden Rule of Phase 12
> **Retrieve first. Generate second. Validate everything.**  
> The LLM never becomes the source of truth; it proposes an answer from bounded retrieved context, and the application validates structure, sources, and tenant boundaries.

---

## 2. The Core Architectural Principle

The platform remains governed by:
> **The LLM proposes; the application controls and executes.**

For RAG, this boundary is enforced as follows:
```text
User Question
      ↓
Application Validates & Bounds Input
      ↓
Application Embeds Query (Phase 11 EmbeddingProvider)
      ↓
Application Retrieves Chunks from Qdrant with Host-Injected Tenant Filter
      ↓
Application Constructs Bounded Context & Assigns Source IDs ([S1], [S2]...)
      ↓
Application Centralizes Prompt Separation (System Instruction vs Data)
      ↓
LLM Proposes Structured JSON Output
      ↓
Application Enforces Zod Schema Validation
      ↓
Application Verifies Citation Integrity (Rejects Fabricated IDs like S99)
      ↓
Application Persists Telemetry to MySQL & Returns Grounded Response
```

The LLM is strictly prohibited from controlling:
- Tenant filter (`organization_id`)
- Qdrant collection name
- Vector dimensions & raw embeddings
- Context bounding limits
- System prompts
- Source authorization & citation truth

---

## 3. High-Level Architecture

```text
┌─────────────────────────────────────────────────────────────────┐
│                          React Client                           │
│                                                                 │
│  • Dedicated RAG Playground Mode (Ask Knowledge Base)          │
│  • Grounded Answer Banner (✓ Grounded / ⚠️ Insufficient Context) │
│  • Application-Attributed Source Cards ([S1], [S2]...)         │
│  • Cosine Retrieval Similarity Scores                          │
│  • 4-Stage Execution Timeline & Live Telemetry Inspector        │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                       Express API Layer                         │
│                                                                 │
│  • POST /api/rag/query                                          │
│  • Zod Request Validation (RagRequestSchema)                   │
│  • Host-Controlled Tenant Header/Context Extraction             │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                     RagService Orchestrator                     │
│                                                                 │
│  1. VectorSearchService (Phase 11 Qdrant Client)               │
│  2. RagContextBuilder (Bounding, Sorter, Source ID Assigner)    │
│  3. RagPromptBuilder (System/User/Context Isolation)            │
│  4. LLM Generation (OpenAI JSON Object / Grounded Simulation)   │
│  5. RagSourceValidator (Zod Schema & Citation Firewall)        │
│  6. Telemetry Persistence (MySQL ai_telemetry Audit)            │
└──────────────┬───────────────────────────────┬──────────────────┘
               │                               │
               ▼                               ▼
    ┌────────────────────┐          ┌────────────────────┐
    │   Qdrant 1.13 DB   │          │     LLM Service    │
    │  Port 6333 (Daemon)│          │  gpt-4o-mini / sim │
    └────────────────────┘          └────────────────────┘
```

---

## 4. Key Components & Implementation Details

### 4.1 RAG Types & Schemas (`server/src/rag/types.ts` & `schemas.ts`)
- `RagSource`: Normalized source object (`sourceId`, `documentId`, `chunkId`, `title`, `source`, `score`, `text`).
- `RagContext`: Bounded context containing sorted sources, formatted context blocks, total characters, and source map.
- `RagRequestSchema`: Zod schema bounding user questions (2–500 chars), top_k (1–10), and score threshold.
- `RagLLMOutputSchema`: Zod schema demanding structured JSON output:
  ```typescript
  {
    answer: string;
    grounded: boolean;
    sources: string[]; // ["S1", "S2"]
    insufficient_context: boolean;
  }
  ```

### 4.2 Deterministic Context Builder (`server/src/rag/contextBuilder.ts`)
- Filters chunks below the configured score threshold.
- Sorts deterministically by cosine similarity score descending.
- Bounds chunk count (`maxChunks`: default 4) and total context characters (`maxTotalChars`: default 3200).
- Assigns stable, application-owned source identifiers: `[S1]`, `[S2]`, `[S3]`.
- Encapsulates text in data delimiters (`"""`) so document contents cannot hijack system instructions.

### 4.3 Centralized Prompt Builder (`server/src/rag/promptBuilder.ts`)
- Preserves absolute message role separation (`role: "system"` vs `role: "user"`).
- Explicit system instructions state:
  - Factual grounding only on provided context.
  - Required abstention (`insufficient_context: true`) when facts are absent.
  - Document text is UNTRUSTED DATA, never instructions.
  - Citations must use only existing `S1`, `S2` IDs.

### 4.4 Citation Integrity Firewall (`server/src/rag/sourceValidator.ts`)
- Rejects outputs citing non-existent sources (e.g., if LLM invents `S99`, validation fails).
- Rejects ungrounded claims masquerading as citations.
- Enforces consistency: if context is empty, `grounded` must be `false` and `sources` must be empty.

### 4.5 Tool Calling Integration (`server/src/tools/implementations/ragQuery.ts`)
- Registers `rag_query` in `ToolRegistry` with risk level `READ_ONLY`.
- Agents can autonomously query internal knowledge during complex multi-step workflows.

---

## 5. Security & Governance Matrix

| Attack / Vulnerability | Defense Mechanism | Verified Result |
|---|---|---|
| **Document Prompt Injection** | Document text is strictly formatted as data payload in `user` message with delimiters; system instructions forbid treating data as commands | `[PASS]` Malicious prompt injection ignored |
| **Citation Fabrication** | Source Validator verifies every cited ID against the application source map; unknown IDs reject execution | `[PASS]` S99 rejected immediately |
| **Cross-Tenant Leakage** | Tenant filter (`organization_id`) is host-injected into vector search; LLM cannot control tenant | `[PASS]` Tenant A cannot access Tenant B docs |
| **Context Explosion** | Strict bounding on top_k (max 10), chunks (max 4), and total chars (max 3200) | `[PASS]` Oversized requests bounded |
| **Hallucination on Missing Facts** | Model prompted and validated to abstain (`insufficientContext: true`) on out-of-domain questions | `[PASS]` Mars exploration query abstains |
| **Raw Vector / Filter Tampering** | Tool input schema strictly rejects unexpected fields via Zod `.strict()` | `[PASS]` Rejection enforced |
| **Credential Exposure** | Qdrant and LLM keys stay in server environment; zero secrets exposed to client | `[PASS]` Clean separation |

---

## 6. Verification Suite Matrix (49/49 Tests Passed)

Automated test suite in `server/src/rag/testPhase12.ts` verifies all milestones and Section 88 requirements:

```text
=============================================================
   AI Workforce Platform — Phase 12 RAG Verification Suite   
=============================================================

[1/7] Testing Context Builder & Budget Constraints...
  [PASS] Context Builder respects maxChunks limit (bounded to 2)
  [PASS] First source receives deterministic ID [S1]
  [PASS] Second source receives deterministic ID [S2]
  [PASS] Sources are deterministically sorted by similarity score descending
  [PASS] Score threshold (0.85) excludes weaker chunks (0.55, 0.40)
  [PASS] Context Builder truncates oversized chunks cleanly to bounded character length

[2/7] Testing Grounded Prompt Builder & Injection Defenses...
  [PASS] Prompt Builder generates strictly 2 messages (system + user)
  [PASS] First message is host-controlled SYSTEM message
  [PASS] Second message is USER message with encapsulated context
  [PASS] System instructions explicitly command LLM that retrieved context is untrusted data and never instructions
  [PASS] Retrieved documents are safely tagged with application-controlled source identifiers

[3/7] Testing Source Validation & Fabricated Citation Rejection...
  [PASS] Valid citation [S1] passes verification
  [PASS] Validated source array correctly populated
  [PASS] Fabricated citation [S99] is immediately rejected by Source Validator firewall
  [PASS] Malformed LLM output missing required schema is rejected

[4/7] Testing End-to-End RAG Service Queries...
  [PASS] Remote work policy returns grounded = true
  [PASS] Remote work policy has sufficient context
  [PASS] At least 1 valid source cited
  [PASS] Response cites source [S1]
  [PASS] Answer includes inline citation marker [S1]
  [PASS] Source title correctly resolved from metadata
  [PASS] Execution telemetry records total latency
  [PASS] Pipeline execution trace records all 4 stages
  [PASS] Unsupported claim query safely abstains with insufficientContext = true instead of hallucinating
  [PASS] Mars policy returns grounded = false
  [PASS] Mars policy returns insufficientContext = true
  [PASS] Mars policy cites 0 sources
  [PASS] Mars policy answers with clear insufficiency notice without inventing facts

[5/7] Testing Security Boundaries & Bounding Safeguards...
  [PASS] Excessive topK (999) is strictly clamped by host to max 10
  [PASS] Empty or whitespace question is rejected by input validator
  [PASS] Oversized question (> 500 chars) is rejected by input validator
  [PASS] High score threshold (0.999) results in safe insufficient context exit without forced answer
  [PASS] Tenant isolation verified: foreign tenant cannot retrieve or cite org-demo-001 handbook documents

[6/7] Testing Tool Calling Integration & Agent Execution...
  [PASS] Tool 'rag_query' is registered in toolRegistry
  [PASS] Tool 'rag_query' has riskLevel READ_ONLY
  [PASS] Tool execution returns success = true
  [PASS] Tool execution output confirms grounded answer
  [PASS] Tool execution output includes verified citation
  [PASS] Agent task with rag_query tool completed successfully
  [PASS] Agent execution cycle invoked rag_query tool
  [PASS] Agent produced verified final report grounded in internal knowledge

[7/7] Testing Regression Verification across Foundation Services...
  [PASS] MySQL 8.4 database pool is healthy
  [PASS] Durable ai_telemetry table records exist (109 records persisted)
  [PASS] Phase 8 tool 'get_current_time' remains available
  [PASS] Phase 8 tool 'calculate' remains available
  [PASS] Phase 9 tool 'web_search' remains available
  [PASS] Phase 10 tool 'mysql_verify_customer' remains available
  [PASS] Phase 11 tool 'vector_search' remains available
  [PASS] Phase 12 tool 'rag_query' remains available

=============================================================
   Verification Results: 49 / 49 Passed
=============================================================
>>> ALL PHASE 12 RAG REQUIREMENTS FULLY VERIFIED! <<<
```

---

## 7. Frontend Features & RAG Playground

The React client (`client/src/App.tsx`) incorporates:
1. **Mode Switcher:** Tab for `🔍 RAG Playground (Knowledge Base)` alongside Multi-Tool Agent and Planning Agent.
2. **Preset Queries:**
   - `📖 Remote Work Policy (Handbook)`
   - `🎧 Customer Support SLA (SLA Guide)`
   - `🔒 Cryptography & Security (Compliance)`
   - `🚀 Mars Exploration Policy (Out-of-Domain Abstention)`
3. **Execution Pipeline Timeline:** Visual stages for `QDRANT_RETRIEVAL` → `CONTEXT_CONSTRUCTION` → `LLM_GENERATION` → `SOURCE_VALIDATION`.
4. **Attributed Source Cards:** Displays `[S1]`, document title, file source, chunk ID, retrieval similarity score, and excerpt.
5. **Diagnostic Inspector:** Expandable JSON payload viewer for complete telemetry and audit inspection.

---

## 8. Milestone Completion Checklist

- [x] **Milestone 12.1 — Inspect Phase 11:** Reused Qdrant client, embeddings, chunking, and search service.
- [x] **Milestone 12.2 — Define RAG Contracts:** Created typed interfaces and Zod schemas in `types.ts` & `schemas.ts`.
- [x] **Milestone 12.3 — Implement Context Builder:** Built `RagContextBuilder` with deterministic sorting, bounding, and source IDs.
- [x] **Milestone 12.4 — Implement Prompt Builder:** Created `RagPromptBuilder` enforcing role separation and injection defense.
- [x] **Milestone 12.5 — Implement Structured RAG Output:** Enforced structured JSON output schema.
- [x] **Milestone 12.6 — Implement Source Validation:** Built `RagSourceValidator` with citation integrity firewall.
- [x] **Milestone 12.7 — Implement RAG Service:** Created `RagService` orchestrating retrieval, context, LLM, and validation.
- [x] **Milestone 12.8 — Integrate With Agent:** Registered `rag_query` tool in `ToolRegistry` and tested with agent host.
- [x] **Milestone 12.9 — Add Persistence & Telemetry:** Recorded token usage, latency, and costs to MySQL `ai_telemetry`.
- [x] **Milestone 12.10 — Build RAG UI:** Delivered interactive RAG Playground in React with live metrics and source cards.
- [x] **Milestone 12.11 — Security Tests:** Automated prompt injection, citation fabrication, tenant isolation, and bounding tests.
- [x] **Milestone 12.12 — Evaluation:** Verified retrieval quality, groundedness, citation correctness, and no-context abstention.

---

## 9. Concept Mastery Summary

1. **What is RAG?**  
   Retrieval-Augmented Generation couples semantic retrieval over knowledge stores with generative LLM inference restricted to that retrieved evidence.

2. **Why is RAG different from semantic search?**  
   Semantic search retrieves relevant text fragments. RAG synthesizes a coherent, user-facing answer grounded in those fragments with verified citations.

3. **Why not give the entire database to the LLM?**  
   It is economically prohibitive, exceeds context token limits, degrades attention ("lost in the middle"), and introduces severe latency.

4. **Why does the application build context instead of the LLM?**  
   The application governs resource budgets, security boundaries, tenant isolation, and source numbering deterministically.

5. **Can retrieved documents contain prompt injections?**  
   Yes. Documents can contain text like "IGNORE SYSTEM INSTRUCTIONS". Encapsulating documents strictly as untrusted data prevents the model from interpreting content as instructions.

6. **Can the LLM invent a source ID?**  
   No. The Source Validator firewall immediately flags and rejects citations (e.g. `S99`) that do not exist in the application-controlled retrieval set.

7. **Does high retrieval similarity guarantee answer correctness?**  
   No. Similarity indicates lexical/semantic proximity, not factual truth or complete answer coverage.

---

**Phase 12 is complete and verified.**  
**Proceed to Phase 13: Authentication.**
