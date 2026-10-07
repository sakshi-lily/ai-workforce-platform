/**
 * Phase 12 — Retrieval-Augmented Generation (RAG) Types
 *
 * Strict interfaces and types decoupling retrieval, context construction,
 * prompt generation, and grounded response validation.
 */

export interface RagSource {
  sourceId: string; // e.g. "S1", "S2"
  documentId: string;
  chunkId: string;
  title: string;
  source: string;
  score: number;
  text: string;
  version?: number;
  chunkIndex?: number;
}

export interface RagContext {
  sources: RagSource[];
  formattedContext: string;
  totalCharacters: number;
  totalChunks: number;
  sourceMap: Record<string, RagSource>;
}

export interface RagQueryOptions {
  question: string;
  organizationId?: string;
  topK?: number;
  scoreThreshold?: number;
  maxContextChunks?: number;
  maxContextChars?: number;
}

export interface RagTelemetry {
  retrievalLatencyMs: number;
  contextBuildingLatencyMs: number;
  generationLatencyMs: number;
  totalLatencyMs: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  model: string;
  provider: string;
}

export interface RagPipelineStep {
  name: string;
  status: "COMPLETED" | "SKIPPED" | "FAILED";
  durationMs: number;
  details?: string;
}

export interface RagResponse {
  question: string;
  answer: string;
  grounded: boolean;
  sources: RagSource[];
  sourceIds: string[];
  insufficientContext: boolean;
  telemetry: RagTelemetry;
  pipeline: RagPipelineStep[];
}
