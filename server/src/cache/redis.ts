import { createClient, RedisClientType } from "redis";
import { config } from "../config/env";

let client: RedisClientType | null = null;
let isConnected = false;

/**
 * Initializes and connects the singleton Redis client.
 * Configured with non-crashing error handlers so that
 * cache failures gracefully degrade to MySQL.
 */
export async function initRedis(): Promise<RedisClientType | null> {
  if (client) {
    return client;
  }

  try {
    const url = `redis://${config.redis.host}:${config.redis.port}`;
    client = createClient({
      url,
      password: config.redis.password,
      socket: {
        reconnectStrategy: (retries) => {
          if (retries > 10) {
            console.warn("[Redis] Maximum reconnection attempts reached. Degrading cache.");
            return false;
          }
          return Math.min(retries * 100, 3000);
        },
      },
    });

    client.on("error", (err) => {
      isConnected = false;
      console.warn("[Redis Error - Non-fatal]", err.message);
    });

    client.on("connect", () => {
      isConnected = true;
      console.log(`[Redis] Connected successfully to ${config.redis.host}:${config.redis.port}`);
    });

    client.on("reconnecting", () => {
      isConnected = false;
      console.log("[Redis] Reconnecting to server...");
    });

    await client.connect();
    isConnected = true;
    return client;
  } catch (error) {
    isConnected = false;
    console.warn("[Redis Init Warning] Could not connect to Redis. Caching will degrade gracefully to MySQL:", error);
    return null;
  }
}

/**
 * Checks whether Redis is ready and responsive via PING.
 */
export async function checkRedisHealth(): Promise<{
  connected: boolean;
  status: string;
  host: string;
  port: number;
  latencyMs?: number;
  error?: string;
}> {
  if (!client || !isConnected) {
    return {
      connected: false,
      status: "disconnected",
      host: config.redis.host,
      port: config.redis.port,
      error: "Redis client is not connected",
    };
  }

  const start = performance.now();
  try {
    const pong = await client.ping();
    const elapsed = Math.round(performance.now() - start);
    return {
      connected: pong === "PONG",
      status: pong === "PONG" ? "connected" : "unexpected_response",
      host: config.redis.host,
      port: config.redis.port,
      latencyMs: elapsed,
    };
  } catch (err) {
    return {
      connected: false,
      status: "error",
      host: config.redis.host,
      port: config.redis.port,
      error: err instanceof Error ? err.message : "PING failed",
    };
  }
}

/**
 * Safe GET from cache. Returns null if missing or on Redis failure.
 */
export async function getCache<T>(key: string): Promise<T | null> {
  if (!client || !isConnected) return null;
  try {
    const cached = await client.get(key);
    if (!cached) return null;
    return JSON.parse(cached) as T;
  } catch (err) {
    console.warn(`[Redis Cache Read Error for key "${key}"]`, err);
    return null;
  }
}

/**
 * Safe SET in cache with TTL. Fails gracefully if Redis is down.
 */
export async function setCache(
  key: string,
  value: unknown,
  ttlSeconds: number = config.redis.ttlSeconds
): Promise<void> {
  if (!client || !isConnected) return;
  try {
    const serialized = JSON.stringify(value);
    await client.set(key, serialized, {
      EX: ttlSeconds,
    });
  } catch (err) {
    console.warn(`[Redis Cache Write Error for key "${key}"]`, err);
  }
}

/**
 * Invalidate a specific cache key.
 */
export async function delCache(key: string): Promise<void> {
  if (!client || !isConnected) return;
  try {
    await client.del(key);
  } catch (err) {
    console.warn(`[Redis Cache Delete Error for key "${key}"]`, err);
  }
}

/**
 * Invalidate keys matching a pattern (e.g. "customers:*").
 */
export async function delCachePattern(pattern: string): Promise<void> {
  if (!client || !isConnected) return;
  try {
    const keys = await client.keys(pattern);
    if (keys.length > 0) {
      await client.del(keys);
    }
  } catch (err) {
    console.warn(`[Redis Cache Pattern Delete Error for pattern "${pattern}"]`, err);
  }
}
