/**
 * Phase 11 — Vector Database Types & Abstraction
 *
 * Defines the narrow vector store interface decoupling Qdrant from the rest of the application.
 */

export interface VectorPointPayload {
  organization_id: string;
  document_id: string;
  chunk_id: string;
  title: string;
  source: string;
  source_type: string;
  version: number;
  chunk_index: number;
  text: string;
  created_at?: string;
  [key: string]: unknown;
}

export interface VectorPoint {
  id: string; // Deterministic UUID
  vector: number[];
  payload: VectorPointPayload;
}

export interface VectorSearchParams {
  vector: number[];
  organizationId: string;
  topK?: number;
  scoreThreshold?: number;
}

export interface ScoredVectorResult {
  score: number;
  document_id: string;
  chunk_id: string;
  title: string;
  source: string;
  text: string;
  version?: number;
  chunk_index?: number;
}

export interface VectorSearchResponse {
  results: ScoredVectorResult[];
  total_found: number;
  collection: string;
  duration_ms: number;
}

export interface VectorStoreHealth {
  status: "healthy" | "unhealthy" | "degraded";
  collectionsCount?: number;
  version?: string;
  latency_ms?: number;
  error?: string;
}

/**
 * Narrow Vector Store abstraction.
 * Prevents leaking the raw Qdrant SDK to other platform layers.
 */
export interface VectorStore {
  ensureCollection(collectionName: string, dimensions: number): Promise<void>;
  upsert(collectionName: string, points: VectorPoint[]): Promise<void>;
  search(collectionName: string, params: VectorSearchParams): Promise<ScoredVectorResult[]>;
  deleteByDocument(collectionName: string, organizationId: string, documentId: string): Promise<void>;
  healthCheck(): Promise<VectorStoreHealth>;
}
