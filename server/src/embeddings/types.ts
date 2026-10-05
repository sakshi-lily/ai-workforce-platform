/**
 * Phase 11 — Embedding Provider Interfaces
 *
 * Enforces an abstraction boundary so vector generation is replaceable and testable.
 */

export interface EmbeddingProvider {
  /**
   * Human-readable identifier for the provider (e.g. 'openai', 'deterministic-local')
   */
  readonly name: string;

  /**
   * The model name backing this provider (e.g. 'text-embedding-3-small')
   */
  readonly model: string;

  /**
   * Fixed vector dimensionality (must match the Qdrant collection dimension)
   */
  readonly dimensions: number;

  /**
   * Embeds a single text snippet into a normalized vector
   */
  embedText(text: string): Promise<number[]>;

  /**
   * Batch embeds multiple text snippets efficiently
   */
  embedBatch(texts: string[]): Promise<number[][]>;
}

export interface EmbeddingTelemetry {
  model: string;
  dimensions: number;
  promptTokens?: number;
  durationMs: number;
}
