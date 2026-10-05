import { z } from "zod";

/**
 * Phase 9 — Web Search Zod Schemas
 *
 * Enforces strict input bounding to prevent resource exhaustion or arbitrary payload injection.
 */

export const WebSearchInputSchema = z.object({
  query: z
    .string()
    .trim()
    .min(1, "Search query must contain at least 1 non-whitespace character")
    .max(200, "Search query must not exceed 200 characters"),
  max_results: z
    .number()
    .int("max_results must be an integer")
    .min(1, "max_results must be at least 1")
    .max(10, "max_results cannot exceed 10")
    .optional()
    .default(5),
});

export const WebSearchResultItemSchema = z.object({
  title: z.string().min(1, "Title cannot be empty"),
  url: z.string().url("URL must be a valid HTTP/HTTPS web address"),
  snippet: z.string().min(1, "Snippet cannot be empty"),
  source: z.string().default("Web"),
  domain: z.string().default("internet"),
  published_at: z.string().optional(),
});

export const WebSearchResponseSchema = z.object({
  query: z.string(),
  resultCount: z.number().int().nonnegative(),
  provider: z.string(),
  results: z.array(WebSearchResultItemSchema),
});

export type ValidatedWebSearchInput = z.infer<typeof WebSearchInputSchema>;
export type ValidatedWebSearchResponse = z.infer<typeof WebSearchResponseSchema>;
