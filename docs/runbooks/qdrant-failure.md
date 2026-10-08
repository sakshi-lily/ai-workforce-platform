# Runbook: Qdrant Vector Search Outage

## 1. Symptoms
- Semantic search or RAG knowledge queries fail or return fallback responses.
- Tool `vectorSearch` or `ragQuery` throws connection timeout on port 6333.
- RAG evaluation reports `RETRIEVAL_FAILURE`.

## 2. Diagnosis
1. Check Qdrant container / host reachability:
   ```bash
   curl -f http://<QDRANT_HOST>:6333/healthz
   ```
2. Verify collection existence and vector point count:
   ```bash
   curl http://<QDRANT_HOST>:6333/collections/internal_knowledge
   ```
3. Check persistent disk volume usage for `/qdrant/storage`.

## 3. Safe Recovery
1. Restart Qdrant service or container if unresponsive.
2. In the event of storage corruption, recreate the collection schema and run seed indexing:
   ```bash
   npm --prefix server run db:migrate-rds
   ```
3. During outages, the agent degrades gracefully by reporting knowledge unavailability rather than hallucinating facts.

## 4. Verification
1. Run test query against Qdrant health check.
2. Run RAG evaluation suite: `npm run test:phase24`.

## 5. Escalation
- Escalate to AI Engineer if vector indexing or embedding dimensions mismatch.
