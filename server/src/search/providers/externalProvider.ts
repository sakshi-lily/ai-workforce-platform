import { WebSearchInput, WebSearchProvider, WebSearchResponse, WebSearchResultItem } from "../types";
import { MockSearchProvider } from "./mockProvider";

/**
 * Phase 9 — External Search Provider Adapter
 *
 * Connects to live search APIs (e.g. Brave Search, Tavily, or Serper) when configured via environment variables.
 * Automatically falls back to MockSearchProvider if keys are omitted or network errors occur.
 */
export class ExternalSearchProvider implements WebSearchProvider {
  public readonly name = "external-web-search-provider";
  private fallbackProvider = new MockSearchProvider();
  private apiKey: string | null = null;
  private endpoint: string = "";

  constructor() {
    this.apiKey = process.env.SEARCH_API_KEY || process.env.BRAVE_SEARCH_API_KEY || process.env.TAVILY_API_KEY || null;
    if (process.env.BRAVE_SEARCH_API_KEY) {
      this.endpoint = "https://api.search.brave.com/res/v1/web/search";
    } else if (process.env.TAVILY_API_KEY) {
      this.endpoint = "https://api.tavily.com/search";
    }
  }

  public async search(input: WebSearchInput): Promise<WebSearchResponse> {
    // If no external API key is supplied, use the deterministic provider
    if (!this.apiKey || !this.endpoint) {
      return this.fallbackProvider.search(input);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000); // 8-second HTTP timeout

    try {
      if (this.endpoint.includes("brave.com")) {
        const url = new URL(this.endpoint);
        url.searchParams.set("q", input.query);
        url.searchParams.set("count", String(Math.min(input.max_results || 5, 10)));

        const res = await fetch(url.toString(), {
          headers: {
            "Accept": "application/json",
            "Accept-Encoding": "gzip",
            "X-Subscription-Token": this.apiKey,
          },
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!res.ok) {
          console.warn(`[ExternalSearchProvider] Brave API HTTP ${res.status}, using fallback.`);
          return this.fallbackProvider.search(input);
        }

        const data: any = await res.json();
        const rawResults = data.web?.results || [];

        const normalized: WebSearchResultItem[] = rawResults.slice(0, input.max_results || 5).map((r: any) => {
          let domain = "web";
          try {
            domain = new URL(r.url).hostname;
          } catch {
            domain = "web";
          }

          return {
            title: r.title || "Untitled Result",
            url: r.url,
            snippet: r.description || "No snippet available.",
            source: domain,
            domain,
            published_at: r.page_age || undefined,
          };
        });

        return {
          query: input.query,
          resultCount: normalized.length,
          provider: "brave-search-api",
          results: normalized,
        };
      }

      if (this.endpoint.includes("tavily.com")) {
        const res = await fetch(this.endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            api_key: this.apiKey,
            query: input.query,
            max_results: Math.min(input.max_results || 5, 10),
            search_depth: "basic",
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!res.ok) {
          console.warn(`[ExternalSearchProvider] Tavily API HTTP ${res.status}, using fallback.`);
          return this.fallbackProvider.search(input);
        }

        const data: any = await res.json();
        const rawResults = data.results || [];

        const normalized: WebSearchResultItem[] = rawResults.slice(0, input.max_results || 5).map((r: any) => {
          let domain = "web";
          try {
            domain = new URL(r.url).hostname;
          } catch {
            domain = "web";
          }

          return {
            title: r.title || "Untitled Result",
            url: r.url,
            snippet: r.content || "No snippet available.",
            source: domain,
            domain,
            published_at: r.published_date || undefined,
          };
        });

        return {
          query: input.query,
          resultCount: normalized.length,
          provider: "tavily-search-api",
          results: normalized,
        };
      }

      // Default fallback
      clearTimeout(timeoutId);
      return this.fallbackProvider.search(input);
    } catch (err) {
      clearTimeout(timeoutId);
      console.warn("[ExternalSearchProvider] Request exception:", err instanceof Error ? err.message : err);
      // Resilient fallback to mock
      return this.fallbackProvider.search(input);
    }
  }
}
