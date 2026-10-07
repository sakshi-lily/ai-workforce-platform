import { z } from "zod";

/**
 * Phase 12 — RAG Request Validation Schema
 *
 * Enforces question bounding to prevent prompt explosion and resource abuse.
 */
export const RagRequestSchema = z.object({
  question: z
    .string()
    .trim()
    .min(2, "Question must be at least 2 characters long")
    .max(500, "Question cannot exceed 500 characters"),
  top_k: z
    .number()
    .int("top_k must be an integer")
    .min(1, "top_k must be at least 1")
    .max(10, "top_k cannot exceed 10")
    .optional()
    .default(5),
  score_threshold: z
    .number()
    .min(0, "Score threshold must be >= 0")
    .max(1, "Score threshold must be <= 1")
    .optional(),
  organizationId: z.string().trim().optional(),
});

export type ValidatedRagRequest = z.infer<typeof RagRequestSchema>;

/**
 * Phase 12 — Structured LLM RAG Output Schema
 *
 * The LLM must propose its answer in this exact structured schema.
 * Rejects unstructured hallucinations, missing grounding flags, and fabricated fields.
 */
export const RagLLMOutputSchema = z.object({
  answer: z
    .string()
    .min(2, "Generated answer must not be empty"),
  grounded: z
    .boolean()
    .describe("True if every claim in the answer is backed by the provided retrieved context"),
  sources: z
    .array(z.string().regex(/^S\d+$/, "Source ID must match format 'S1', 'S2', etc."))
    .default([]),
  insufficient_context: z
    .boolean()
    .describe("True if the provided context lacks sufficient facts to answer the question"),
});

export type RagLLMOutput = z.infer<typeof RagLLMOutputSchema>;

/**
 * Enriched Source schema for UI and client responses.
 */
export const RagSourceSchema = z.object({
  sourceId: z.string(),
  documentId: z.string(),
  chunkId: z.string(),
  title: z.string(),
  source: z.string(),
  score: z.number(),
  text: z.string(),
  version: z.number().optional(),
  chunkIndex: z.number().optional(),
});

/**
 * Pipeline timing and telemetry schema.
 */
export const RagTelemetrySchema = z.object({
  retrievalLatencyMs: z.number(),
  contextBuildingLatencyMs: z.number(),
  generationLatencyMs: z.number(),
  totalLatencyMs: z.number(),
  promptTokens: z.number(),
  completionTokens: z.number(),
  totalTokens: z.number(),
  estimatedCostUsd: z.number(),
  model: z.string(),
  provider: z.string(),
});

/**
 * Final Governed RAG Response Schema.
 */
export const RagResponseSchema = z.object({
  question: z.string(),
  answer: z.string(),
  grounded: z.boolean(),
  sources: z.array(RagSourceSchema),
  sourceIds: z.array(z.string()),
  insufficientContext: z.boolean(),
  telemetry: RagTelemetrySchema,
  pipeline: z.array(
    z.object({
      name: z.string(),
      status: z.enum(["COMPLETED", "SKIPPED", "FAILED"]),
      durationMs: z.number(),
      details: z.string().optional(),
    })
  ),
});
