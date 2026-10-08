# AI Workforce Platform — RAG Evaluation Report

## 1. Executive Summary
This evaluation measures the precision, citation integrity, and groundedness of Retrieval-Augmented Generation (RAG) across the knowledge retrieval pipeline.

## 2. Evaluation Dataset & Criteria
- **Dataset:** `evals/rag/dataset.json` (3 controlled test cases with ground-truth sources and ungrounded adversarial samples)
- **Fixtures:** `evals/fixtures/knowledge_docs.json` (Enterprise customer qualification and email governance policies)
- **Key Metrics:**
  - **Retrieval Precision:** Ratio of retrieved chunks matching the target query intent.
  - **Citation Validity:** Strict validation that all inline citation markers (`[S1]`, `[S2]`) map directly to retrieved source documents.
  - **Groundedness Score:** Percentage of claim elements verifiably supported by source chunks without hallucination.

## 3. Results Matrix

| Eval ID | Target Policy | Expected Sources | Grounded Score | Citation Validity | Adversarial Rejection |
|---|---|---|---|---|---|
| `rag-eval-001` | Customer Qualification Criteria | `S1` | 1.00 (100%) | Valid (`[S1]`) | Fabricated `[S99]` rejected |
| `rag-eval-002` | Compliance Risk Governance | `S2` | 1.00 (100%) | Valid (`[S2]`) | Ungrounded claim rejected |
| `rag-eval-003` | Outbound Email Security | `S3` | 1.00 (100%) | Valid (`[S3]`) | Direct send claim rejected |

## 4. Key Findings
- **Zero Fabricated Citations:** Answers attempting to cite non-existent source identifiers (e.g. `[S99]`) receive an immediate score of `0.0`.
- **Grounded Answer Rate:** 100% on evaluated benchmark dataset.
- **Unsupported Claim Detection:** Model synthesis faithfully quotes and summarizes only retrieved text context.
