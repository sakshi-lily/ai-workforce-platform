import dotenv from "dotenv";
import path from "path";

// Load .env file from server root
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

export const config = {
  port: Number(process.env.PORT) || 3000,
  nodeEnv: process.env.NODE_ENV || "development",
  db: {
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD ?? "",
    database: process.env.DB_NAME || "ai_workforce",
    connectionLimit: Number(process.env.DB_CONNECTION_LIMIT) || 10,
    waitForConnections: true,
    queueLimit: 0,
  },
  redis: {
    host: process.env.REDIS_HOST || "127.0.0.1",
    port: Number(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    ttlSeconds: Number(process.env.REDIS_TTL_SECONDS) || 60,
  },
  llm: {
    provider: process.env.LLM_PROVIDER || "openai",
    model: process.env.LLM_MODEL || "gpt-4o-mini",
    apiKey: process.env.LLM_API_KEY || "",
    baseUrl: process.env.LLM_BASE_URL || undefined,
    timeoutMs: Number(process.env.LLM_TIMEOUT_MS) || 30000,
    maxRetries: Number(process.env.LLM_MAX_RETRIES) || 2,
    pricing: {
      // Pricing per 1M tokens (e.g. gpt-4o-mini standard)
      inputPerMillion: 0.15,
      outputPerMillion: 0.60,
    },
  },
  qdrant: {
    url: process.env.QDRANT_URL || "http://127.0.0.1:6333",
    apiKey: process.env.QDRANT_API_KEY || undefined,
    collection: process.env.QDRANT_COLLECTION || "internal_knowledge",
  },
};
