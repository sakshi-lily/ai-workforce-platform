/**
 * AI Workforce Platform — Frontend API Client Configuration
 *
 * In production Docker (Nginx), API_BASE_URL is empty (''), allowing relative
 * `/api/...` requests to be reverse-proxied transparently by Nginx to `http://api:3000/api`.
 * In standalone Vite dev server, defaults to 'http://localhost:3000'.
 */
export const API_BASE_URL =
  import.meta.env.VITE_API_URL !== undefined
    ? import.meta.env.VITE_API_URL
    : import.meta.env.DEV
    ? "http://localhost:3000"
    : "";

/**
 * Normalizes an API path into a fully qualified or relative browser URL.
 */
export function getApiUrl(path: string): string {
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE_URL}${cleanPath}`;
}
