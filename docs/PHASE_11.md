# AI Workforce Platform — Phase 11: Vector Database / Qdrant

**Project:** AI Workforce Platform  
**Phase:** 11 — Vector Database / Qdrant  
**Status:** COMPLETED  
**Previous Phase:** Phase 10 — MySQL Verification  
**Next Phase:** Phase 12 — RAG (Retrieval-Augmented Generation)

---

## 1. Executive Summary

Phase 11 introduces **semantic vector search over internal unstructured corporate knowledge** using:
- **Qdrant 1.13 Vector Database** (native daemon running on port 6333)
- **Dense Embedding Model** (`text-embedding-3-small`, 1536 dimensions, Cosine distance)
- **Deterministic Paragraph Chunker** (~450 chars target, 60 chars overlap, stable IDs)
- **Controlled `vector_search` Tool** (Risk: `READ_ONLY`, Zod-enforced schema)
- **Strict Tenant Isolation** (Host-controlled `organization_id` filter)
- **Watchdogs & Telemetry** (Max 5 vector searches per cycle, duration tracking, MySQL `tool_executions` audit persistence)

### Golden Rule of Phase 11
> **Phase 11 ends at retrieval.** The agent receives relevant chunks as observations. Grounded RAG answer synthesis begins in Phase 12.

---

## 2. Multi-Source Architecture

The platform now coordinates three distinct information sources with clear trust boundaries:

```text
                             AI Workforce Platform
                                      │
          ┌───────────────────────────┼───────────────────────────┐
          │                           │                           │
          ▼                           ▼                           ▼
      Web Search                    MySQL                      Qdrant
   (External Data)           (Structured Truth)         (Semantic Retrieval)
          │                           │                           │
          ▼                           ▼                           ▼
   • Public news & facts       • Customer entities         • Employee handbooks
   • Untrusted data            • Task state & steps        • Security standards
   • No system authority       • Tool execution audits     • Product architecture
                               • Authoritative state       • Support SLAs
```

### Trust Boundary Matrix
| Source | Nature | Role in Platform | Trust Authority |
|---|---|---|---|
| **Web Search** | External | Live facts, market data, public profiles | **Untrusted data** (never system instructions) |
| **MySQL 8.4** | Internal | Durable business entities, CRM, tasks, telemetry | **Authoritative structured truth** |
| **Qdrant** | Internal | Dense vector index over unstructured knowledge chunks | **Internal data index** (informs reasoning, not rules) |

---

## 3. Embedding & Collection Configuration

Vector dimensions and distance metrics are centrally configured in `server/src/embeddings/provider.ts`:

```typescript
export const EMBEDDING_CONFIG = {
  MODEL: "text-embedding-3-small",
  DIMENSIONS: 1536,
  DISTANCE: "Cosine",
  COLLECTION_NAME: "internal_knowledge",
} as const;
```

### Strict Vector Dimension Rule
- Any vector with dimensions $\neq 1536$ is **explicitly rejected** with an error.
- **Zero padding** or **truncation** is strictly prohibited to preserve geometric semantic integrity.

---

## 4. Chunking & Stable Identifiers

Documents are split deterministically using paragraph-aware boundaries:
- **Target Chunk Size:** ~450 characters
- **Context Overlap:** 60 characters
- **Stable Chunk ID Format:** `${documentId}:v${version}:chunk-${index}`
  - Example: `doc-emp-handbook:v1:chunk-000`
- **Deterministic Point UUID:** RFC 4122 v4 UUID generated from `SHA-256(chunkId)`

This ensures **idempotent re-indexing**: re-running ingestion does not create duplicate vectors.

---

## 5. Security & Governance Matrix

| Attack / Tampering Vector | Defense Mechanism | Verified Result |
|---|---|---|
| **Collection Tampering** | LLM input schema strictly rejects `collection` property | `[PASS]` Rejection via Zod `.strict()` |
| **Tenant Tampering** | LLM cannot supply `organization_id`; host injects context | `[PASS]` Host-enforced context |
| **Tenant Isolation Leak** | Qdrant search filter must match `organization_id` | `[PASS]` Tenant A cannot see Tenant B |
| **Raw Vector Injection** | Tool schema only accepts natural-language strings | `[PASS]` Rejection via Zod `.strict()` |
| **Arbitrary Filter Injection** | Tool schema rejects `filter` property | `[PASS]` Rejection via Zod `.strict()` |
| **Context Explosion** | Top-K bounded (1–10), chunk text capped at 1200 chars | `[PASS]` Bound enforced |
| **Prompt Injection in Docs** | Chunks are delivered as data observations, not prompts | `[PASS]` Treated as raw text |
| **Credential Exposure** | Credentials kept in server environment, never sent to UI | `[PASS]` Zero leakage |

---

## 6. Verification Matrix (18/18 Tests Passed)

All 18 scenarios from Section 85 were automated in `server/src/vector/testPhase11.ts`:

```text
[PASS] Scenario 1: Qdrant Health Check
[PASS] Scenario 2: Safe Collection Initialization (internal_knowledge ready)
[PASS] Scenario 3: Dimension Mismatch Explicit Failure (no truncation or padding)
[PASS] Scenario 4: Idempotent Ingestion (deterministic IDs prevent duplicate bloat)
[PASS] Scenario 5: Semantic Retrieval — Remote Work Policy retrieved from Employee Handbook
[PASS] Scenario 6: Semantic Retrieval — Support SLA retrieved from Customer Support Guide
[PASS] Scenario 7: No-Result Test (Mars exploration produces empty results, no hallucinated knowledge)
[PASS] Scenario 8: Tenant Isolation (Tenant A CANNOT see Tenant B's confidential docs; Tenant B can)
[PASS] Scenario 9: Raw Vector Input Rejection (Strict Zod schema rejects 'vector' property)
[PASS] Scenario 10: Collection Tampering Rejection (Strict Zod schema rejects 'collection' override)
[PASS] Scenario 11: Arbitrary Filter Rejection (Host creates filter, LLM filter injection rejected)
[PASS] Scenario 12: Top-K Bounding (Zod rejects top_k > 10 to protect context window)
[PASS] Scenario 13: Empty Query Validation (Zod rejects empty / whitespace query)
[PASS] Scenario 14: Prompt Injection Safety (Retrieved content is strictly data payload, not instruction)
[PASS] Scenario 15: Tool Registry Integration ('vector_search' registered as READ_ONLY)
[PASS] Scenario 16: Tool Execution via Registry (Validates input, executes vector search, validates envelope)
[PASS] Scenario 17: End-to-End Agent Host Execution & MySQL Audit Persistence
[PASS] Scenario 18: Multi-Source Architecture Active (Web Search + MySQL Verification + Vector Search)
```

---

## 7. Frontend Integration

1. **5-Tier Health HUD:**
   - **Tier 1:** Express API (`:3000`)
   - **Tier 2:** MySQL Truth (`:3306`)
   - **Tier 3:** Redis Cache (`:6379`)
   - **Tier 4:** LLM Provider
   - **Tier 5:** Qdrant Vector DB (`:6333`, `internal_knowledge`, latency ~40ms)

2. **Phase 11 Quick Presets:**
   - `📖 Policy: Remote Work Guidelines`
   - `🎧 SLA: Customer Support Protocol`
   - `🔒 Security: Cryptography Standards`
   - `🚀 Out-of-Domain: Mars Policy (Empty)`
   - `🏢 MySQL Verify: sarah@apexcloud.io`
   - `🌐+🏢 Web + MySQL: Apex Cloud`

3. **Retrieval Observation Cards:**
   - Query & top_k badge
   - Cosine similarity scores
   - Source document badges (`employee-handbook.md`, `support-sla-guide.md`, etc.)
   - Chunk text previews
   - Collapsible raw observation JSON inspector
