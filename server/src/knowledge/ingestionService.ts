import { getVectorStore } from "../vector/qdrantClient";
import { getEmbeddingProvider } from "../embeddings/provider";
import { chunkText } from "./chunker";
import { KnowledgeDocument, INITIAL_KNOWLEDGE_DOCUMENTS } from "./dataset";
import { VectorPoint } from "../vector/types";
import { config } from "../config/env";

export interface IngestionResult {
  documentId: string;
  organizationId: string;
  title: string;
  chunksCount: number;
  durationMs: number;
  success: boolean;
  error?: string;
}

/**
 * Phase 11 — Knowledge Ingestion Service
 *
 * Owns deterministic extraction, chunking, embedding generation,
 * vector dimension validation, and idempotent Qdrant upserts.
 */
export class KnowledgeIngestionService {
  /**
   * Ingests a single knowledge document into the vector database.
   */
  public async ingestDocument(
    doc: KnowledgeDocument,
    collectionName: string = config.qdrant.collection
  ): Promise<IngestionResult> {
    const start = Date.now();
    try {
      const vectorStore = getVectorStore();
      const embeddingProvider = getEmbeddingProvider();

      // Ensure collection is ready with correct dimensions
      await vectorStore.ensureCollection(collectionName, embeddingProvider.dimensions);

      // 1. Chunk document
      const chunks = chunkText(doc.id, doc.content, doc.version);
      if (chunks.length === 0) {
        return {
          documentId: doc.id,
          organizationId: doc.organizationId,
          title: doc.title,
          chunksCount: 0,
          durationMs: Date.now() - start,
          success: true,
        };
      }

      // 2. Generate embeddings
      const texts = chunks.map((c) => c.text);
      const embeddings = await embeddingProvider.embedBatch(texts);

      // 3. Assemble points with payload metadata
      const points: VectorPoint[] = chunks.map((chunk, idx) => {
        const vector = embeddings[idx];
        if (vector.length !== embeddingProvider.dimensions) {
          throw new Error(
            `Embedding dimension mismatch on chunk ${chunk.chunkId}: got ${vector.length}, expected ${embeddingProvider.dimensions}`
          );
        }

        return {
          id: chunk.pointId,
          vector,
          payload: {
            organization_id: doc.organizationId,
            document_id: doc.id,
            chunk_id: chunk.chunkId,
            title: doc.title,
            source: doc.source,
            source_type: doc.sourceType,
            version: doc.version,
            chunk_index: chunk.chunkIndex,
            text: chunk.text,
            created_at: new Date().toISOString(),
          },
        };
      });

      // 4. Idempotent upsert into Qdrant
      await vectorStore.upsert(collectionName, points);

      return {
        documentId: doc.id,
        organizationId: doc.organizationId,
        title: doc.title,
        chunksCount: chunks.length,
        durationMs: Date.now() - start,
        success: true,
      };
    } catch (err) {
      return {
        documentId: doc.id,
        organizationId: doc.organizationId,
        title: doc.title,
        chunksCount: 0,
        durationMs: Date.now() - start,
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Seeds all initial controlled knowledge documents for testing and development.
   */
  public async seedDefaultDocuments(
    collectionName: string = config.qdrant.collection
  ): Promise<IngestionResult[]> {
    const results: IngestionResult[] = [];
    for (const doc of INITIAL_KNOWLEDGE_DOCUMENTS) {
      const res = await this.ingestDocument(doc, collectionName);
      results.push(res);
    }
    return results;
  }
}

// Global Singleton
export const knowledgeIngestionService = new KnowledgeIngestionService();
