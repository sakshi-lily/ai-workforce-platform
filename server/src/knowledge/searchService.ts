import { getVectorStore } from "../vector/qdrantClient";
import { getEmbeddingProvider } from "../embeddings/provider";
import { config } from "../config/env";
import { ScoredVectorResult, VectorSearchResponse } from "../vector/types";

export interface SearchOptions {
  query: string;
  organizationId: string;
  topK?: number;
  scoreThreshold?: number;
  collectionName?: string;
}

/**
 * Phase 11 — Vector Search Service
 *
 * Owns query validation, query embedding generation, host-enforced tenant filtering,
 * similarity retrieval, score thresholding, and observation normalization.
 */
export class VectorSearchService {
  /**
   * Executes a semantic vector search scoped to the authenticated tenant.
   */
  public async search(options: SearchOptions): Promise<VectorSearchResponse> {
    const startTime = Date.now();

    // 1. Query Validation & Bounding
    const rawQuery = options.query?.trim();
    if (!rawQuery || rawQuery.length < 2) {
      throw new Error("Search query must be at least 2 characters long.");
    }
    if (rawQuery.length > 500) {
      throw new Error("Search query cannot exceed 500 characters.");
    }

    // 2. Tenant Context Enforcement
    const organizationId = options.organizationId?.trim();
    if (!organizationId) {
      throw new Error("Host-controlled organizationId is required for tenant isolation.");
    }

    // 3. Top-K Bounding (App enforces max = 10, default = 5)
    const rawTopK = options.topK ?? 5;
    const topK = Math.min(Math.max(Math.floor(rawTopK), 1), 10);

    // 4. Server-controlled collection
    const collectionName = options.collectionName || config.qdrant.collection;

    // 5. Generate query embedding via active provider
    const embeddingProvider = getEmbeddingProvider();
    const queryVector = await embeddingProvider.embedText(rawQuery);

    if (queryVector.length !== embeddingProvider.dimensions) {
      throw new Error(
        `Query embedding dimension mismatch: got ${queryVector.length}, expected ${embeddingProvider.dimensions}`
      );
    }

    // 6. Execute bounded similarity search in Qdrant with tenant filter
    const vectorStore = getVectorStore();
    const rawResults: ScoredVectorResult[] = await vectorStore.search(collectionName, {
      vector: queryVector,
      organizationId,
      topK,
      scoreThreshold: options.scoreThreshold,
    });

    const durationMs = Date.now() - startTime;

    return {
      results: rawResults,
      total_found: rawResults.length,
      collection: collectionName,
      duration_ms: durationMs,
    };
  }
}

// Global Singleton
export const vectorSearchService = new VectorSearchService();
