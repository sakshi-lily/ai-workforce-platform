import { Tool, ToolContext } from "../types";
import {
  WebSearchInputSchema,
  WebSearchResponseSchema,
  ValidatedWebSearchInput,
  ValidatedWebSearchResponse,
} from "../../search/schemas";
import { getWebSearchProvider } from "../../search/provider";

/**
 * Phase 9 — Web Search Tool
 *
 * Provides external information-retrieval capability without granting arbitrary network or execution privileges.
 * Risk Level: READ_ONLY (retrieval only, no local mutation).
 */
export const webSearchTool: Tool<ValidatedWebSearchInput, ValidatedWebSearchResponse> = {
  name: "web_search",
  description:
    "Searches the public web for real-time external information, news, leadership profiles, or reference data. Returns relevant titles, source URLs, and snippet observations.",
  riskLevel: "READ_ONLY",
  inputSchema: WebSearchInputSchema,
  outputSchema: WebSearchResponseSchema,

  execute: async (input: ValidatedWebSearchInput, context: ToolContext): Promise<ValidatedWebSearchResponse> => {
    const provider = getWebSearchProvider();

    if (context.logger) {
      context.logger(`[web_search] Task ${context.taskId}: executing query '${input.query}' (max_results: ${input.max_results || 5}) via provider ${provider.name}`);
    }

    const response = await provider.search({
      query: input.query,
      max_results: input.max_results || 5,
    }, context);

    return response;
  },
};
