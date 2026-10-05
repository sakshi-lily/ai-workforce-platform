import { z } from "zod";
import { Tool, ToolContext } from "../types";
import { vectorSearchService } from "../../knowledge/searchService";

/**
 * Phase 11 — Vector Search Zod Input Schema
 *
 * Rejects collection tampering, raw vectors, arbitrary filters, and excessive top_k.
 * Only accepts bounded natural-language query and optional top_k.
 */
export const VectorSearchInputSchema = z
  .object({
    query: z
      .string()
      .trim()
      .min(2, "Search query must be at least 2 characters")
      .max(500, "Search query cannot exceed 500 characters"),
    top_k: z
      .number()
      .int("top_k must be an integer")
      .min(1, "top_k must be at least 1")
      .max(10, "top_k cannot exceed 10")
      .optional()
      .default(5),
  })
  .strict(); // Rejects unexpected properties like 'vector', 'collection', 'organization_id', 'filter'

export type VectorSearchInput = z.infer<typeof VectorSearchInputSchema>;

export const ScoredChunkSchema = z.object({
  score: z.number(),
  document_id: z.string(),
  chunk_id: z.string(),
  title: z.string(),
  source: z.string(),
  text: z.string(),
  version: z.number().optional(),
  chunk_index: z.number().optional(),
});

export const VectorSearchOutputSchema = z.object({
  results: z.array(ScoredChunkSchema),
  total_found: z.number(),
  duration_ms: z.number(),
});

export type VectorSearchOutput = z.infer<typeof VectorSearchOutputSchema>;

/**
 * Phase 11 — Vector Search Tool
 *
 * Capability: Semantic similarity search over internal unstructured documents (handbooks, guides, architecture, policies).
 * Security: READ_ONLY, strictly host-scoped tenant filter, server-managed embeddings and collections.
 */
export const vectorSearchTool: Tool<VectorSearchInput, VectorSearchOutput> = {
  name: "vector_search",
  description:
    "Performs semantic search over internal unstructured company knowledge documents, employee handbooks, security policies, architecture specs, and SLAs. Returns relevant document chunks with similarity scores. Does NOT execute SQL or search external web.",
  riskLevel: "READ_ONLY",
  inputSchema: VectorSearchInputSchema,
  outputSchema: VectorSearchOutputSchema,

  async execute(input: VectorSearchInput, context: ToolContext): Promise<VectorSearchOutput> {
    // Host-controlled tenant context: the authenticated organization is authoritative.
    const organizationId = context.organizationId || "org-demo-001";

    if (context.logger) {
      context.logger(
        `[vector_search] Task ${context.taskId}: Semantic search for '${input.query}' (top_k: ${input.top_k}) in tenant '${organizationId}'`
      );
    }

    const response = await vectorSearchService.search({
      query: input.query,
      organizationId,
      topK: input.top_k,
    });

    return {
      results: response.results,
      total_found: response.total_found,
      duration_ms: response.duration_ms,
    };
  },
};
