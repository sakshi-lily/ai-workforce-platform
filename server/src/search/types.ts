import { ToolContext } from "../tools/types";

/**
 * Phase 9 — Web Search Types & Interfaces
 *
 * Establishes provider-independent abstractions for external web search retrieval.
 */

export interface WebSearchInput {
  query: string;
  max_results?: number;
}

export interface WebSearchResultItem {
  title: string;
  url: string;
  snippet: string;
  source: string;
  domain: string;
  published_at?: string;
}

export interface WebSearchResponse {
  query: string;
  resultCount: number;
  provider: string;
  results: WebSearchResultItem[];
}

/**
 * Provider abstraction: Decouples the agent from any single commercial or mock search engine.
 */
export interface WebSearchProvider {
  readonly name: string;
  search(input: WebSearchInput, context?: ToolContext): Promise<WebSearchResponse>;
}
