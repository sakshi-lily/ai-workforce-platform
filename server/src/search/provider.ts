import { WebSearchProvider } from "./types";
import { ExternalSearchProvider } from "./providers/externalProvider";
import { MockSearchProvider } from "./providers/mockProvider";

let activeProvider: WebSearchProvider | null = null;

/**
 * Returns the configured web search provider singleton.
 */
export function getWebSearchProvider(): WebSearchProvider {
  if (!activeProvider) {
    if (process.env.BRAVE_SEARCH_API_KEY || process.env.TAVILY_API_KEY || process.env.SEARCH_API_KEY) {
      activeProvider = new ExternalSearchProvider();
    } else {
      activeProvider = new MockSearchProvider();
    }
  }
  return activeProvider;
}

/**
 * Allows overriding provider for automated tests.
 */
export function setWebSearchProvider(provider: WebSearchProvider): void {
  activeProvider = provider;
}
