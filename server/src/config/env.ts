import dotenv from "dotenv";
import path from "path";
import { z } from "zod";

// Load .env file from server root
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

/**
 * Phase 21: Typed Environment Validation Schema
 */
const EnvSchema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  
  // Database configuration (supports both DB_* and MYSQL_* conventions)
  DB_HOST: z.string().default("127.0.0.1"),
  DB_PORT: z.coerce.number().default(3306),
  DB_USER: z.string().default("root"),
  DB_PASSWORD: z.string().default(""),
  DB_NAME: z.string().default("ai_workforce"),
  DB_CONNECTION_LIMIT: z.coerce.number().default(10),

  // Redis configuration
  REDIS_HOST: z.string().default("127.0.0.1"),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_TTL_SECONDS: z.coerce.number().default(60),

  // Qdrant vector database
  QDRANT_URL: z.string().default("http://127.0.0.1:6333"),
  QDRANT_API_KEY: z.string().optional(),
  QDRANT_COLLECTION: z.string().default("internal_knowledge"),

  // LLM Provider configuration
  LLM_PROVIDER: z.string().default("openai"),
  LLM_MODEL: z.string().default("gpt-4o-mini"),
  LLM_API_KEY: z.string().default(""),
  LLM_BASE_URL: z.string().optional(),
  LLM_TIMEOUT_MS: z.coerce.number().default(30000),
  LLM_MAX_RETRIES: z.coerce.number().default(2),

  // Auth configuration
  JWT_SECRET: z.string().min(8, "JWT_SECRET must be at least 8 characters").default("ai_workforce_platform_dev_secret_jwt_key_2026"),
  JWT_EXPIRES_IN: z.string().default("7d"),
});

// Normalize alias variables before parsing
const rawEnv = {
  ...process.env,
  DB_HOST: process.env.MYSQL_HOST || process.env.DB_HOST,
  DB_PORT: process.env.MYSQL_PORT || process.env.DB_PORT,
  DB_USER: process.env.MYSQL_USER || process.env.DB_USER,
  DB_PASSWORD: process.env.MYSQL_PASSWORD ?? process.env.DB_PASSWORD,
  DB_NAME: process.env.MYSQL_DATABASE || process.env.DB_NAME,
  LLM_API_KEY: process.env.OPENAI_API_KEY || process.env.LLM_API_KEY,
};

const parsedEnv = EnvSchema.safeParse(rawEnv);

if (!parsedEnv.success) {
  console.error("[Config Validation Error] Invalid environment configuration:", parsedEnv.error.format());
}

const validated = parsedEnv.success ? parsedEnv.data : EnvSchema.parse({});

export const config = {
  port: validated.PORT,
  nodeEnv: validated.NODE_ENV,
  db: {
    host: validated.DB_HOST,
    port: validated.DB_PORT,
    user: validated.DB_USER,
    password: validated.DB_PASSWORD,
    database: validated.DB_NAME,
    connectionLimit: validated.DB_CONNECTION_LIMIT,
    waitForConnections: true,
    queueLimit: 0,
  },
  redis: {
    host: validated.REDIS_HOST,
    port: validated.REDIS_PORT,
    password: validated.REDIS_PASSWORD || undefined,
    ttlSeconds: validated.REDIS_TTL_SECONDS,
  },
  llm: {
    provider: validated.LLM_PROVIDER,
    model: validated.LLM_MODEL,
    apiKey: validated.LLM_API_KEY,
    baseUrl: validated.LLM_BASE_URL || undefined,
    timeoutMs: validated.LLM_TIMEOUT_MS,
    maxRetries: validated.LLM_MAX_RETRIES,
    pricing: {
      inputPerMillion: 0.15,
      outputPerMillion: 0.60,
    },
  },
  qdrant: {
    url: validated.QDRANT_URL,
    apiKey: validated.QDRANT_API_KEY || undefined,
    collection: validated.QDRANT_COLLECTION,
  },
  auth: {
    jwtSecret: validated.JWT_SECRET,
    jwtExpiresIn: validated.JWT_EXPIRES_IN,
    saltRounds: 10,
  },
};

/**
 * Validates current environment against production-readiness criteria.
 */
export function validateEnvironment(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (config.nodeEnv === "production") {
    if (config.auth.jwtSecret === "ai_workforce_platform_dev_secret_jwt_key_2026") {
      errors.push("JWT_SECRET is using default development secret in production mode.");
    }
  }
  return { valid: errors.length === 0, errors };
}
