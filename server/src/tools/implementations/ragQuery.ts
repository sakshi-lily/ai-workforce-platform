import { z } from "zod";
import { Tool, ToolContext } from "../types";
import { ragService } from "../../rag/ragService";

/**
 * Phase 12 — Governed RAG Query Tool Input Schema
 *
 * Rejects collection overrides, arbitrary filters, raw vectors, and oversized queries.
 */
export const RagQueryInputSchema = z
  .object({
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
  })
  .strict();

export type RagQueryInput = z.infer<typeof RagQueryInputSchema>;

export const RagQueryOutputSchema = z.object({
  answer: z.string(),
  grounded: z.boolean(),
  sources: z.array(z.string()),
  insufficient_context: z.boolean(),
  source_details: z.array(
    z.object({
      sourceId: z.string(),
      documentId: z.string(),
      chunkId: z.string(),
      title: z.string(),
      source: z.string(),
      score: z.number(),
      text: z.string(),
    })
  ),
  duration_ms: z.number(),
});

export type RagQueryOutput = z.infer<typeof RagQueryOutputSchema>;

/**
 * Phase 12 — Governed RAG Query Tool
 *
 * Capability: Performs complete Retrieval-Augmented Generation over internal corporate knowledge.
 * Security: READ_ONLY, strictly host-controlled tenant filter, server-side context bounding,
 * schema validation, and citation integrity checks.
 */
export const ragQueryTool: Tool<RagQueryInput, RagQueryOutput> = {
  name: "rag_query",
  description:
    "Queries the internal company knowledge base using Retrieval-Augmented Generation (RAG). Retrieves relevant chunks from Qdrant, builds bounded context, and returns a verified, strictly grounded answer with source citations. Read-only.",
  riskLevel: "READ_ONLY",
  inputSchema: RagQueryInputSchema,
  outputSchema: RagQueryOutputSchema,

  async execute(input: RagQueryInput, context: ToolContext = {} as ToolContext): Promise<RagQueryOutput> {
    const organizationId = context?.organizationId || "org-demo-001";

    if (context?.logger) {
      context.logger(
        `[rag_query] Task ${context.taskId || "direct"}: Executing RAG query '${input.question}' for tenant '${organizationId}'`
      );
    }

    const response = await ragService.query({
      question: input.question,
      organizationId,
      topK: input.top_k,
    });

    return {
      answer: response.answer,
      grounded: response.grounded,
      sources: response.sourceIds,
      insufficient_context: response.insufficientContext,
      source_details: response.sources.map((s) => ({
        sourceId: s.sourceId,
        documentId: s.documentId,
        chunkId: s.chunkId,
        title: s.title,
        source: s.source,
        score: s.score,
        text: s.text,
      })),
      duration_ms: response.telemetry.totalLatencyMs,
    };
  },
};
