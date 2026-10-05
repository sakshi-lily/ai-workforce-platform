import { Router, Request, Response } from "express";
import { checkDatabaseHealth } from "../db/pool";
import { checkRedisHealth } from "../cache/redis";
import { config } from "../config/env";

export const healthRouter = Router();

// Basic process health check
healthRouter.get("/", (_req: Request, res: Response) => {
  res.status(200).json({ status: "ok" });
});

// Database connectivity health check
healthRouter.get("/db", async (_req: Request, res: Response) => {
  const result = await checkDatabaseHealth();

  if (result.connected) {
    res.status(200).json({
      status: "ok",
      database: "connected",
      databaseName: result.database,
      serverVersion: result.serverVersion,
    });
  } else {
    res.status(503).json({
      status: "error",
      database: "disconnected",
      databaseName: result.database,
      message: "Database communication failed",
    });
  }
});

// Redis cache connectivity health check
healthRouter.get("/redis", async (_req: Request, res: Response) => {
  const result = await checkRedisHealth();

  if (result.connected) {
    res.status(200).json({
      status: "ok",
      redis: "connected",
      host: result.host,
      port: result.port,
      latencyMs: result.latencyMs,
    });
  } else {
    res.status(503).json({
      status: "error",
      redis: "disconnected",
      host: result.host,
      port: result.port,
      error: result.error,
      fallback: "Degraded to MySQL",
    });
  }
});

// AI Service readiness health check (verifies configuration without calling LLM)
healthRouter.get("/ai", (_req: Request, res: Response) => {
  const isKeyConfigured = Boolean(config.llm.apiKey && config.llm.apiKey.trim().length > 0);
  res.status(200).json({
    status: "ok",
    ai: "ready",
    provider: config.llm.provider,
    model: config.llm.model,
    mode: isKeyConfigured ? "live" : "developer-simulation",
    timeoutMs: config.llm.timeoutMs,
  });
});

// Phase 11 — Qdrant vector database health check
healthRouter.get("/qdrant", async (_req: Request, res: Response) => {
  const { getVectorStore } = await import("../vector/qdrantClient");
  const store = getVectorStore();
  const health = await store.healthCheck();

  if (health.status === "healthy") {
    res.status(200).json({
      status: "ok",
      qdrant: "connected",
      collection: config.qdrant.collection,
      collectionsCount: health.collectionsCount,
      latencyMs: health.latency_ms,
    });
  } else {
    res.status(503).json({
      status: "error",
      qdrant: "disconnected",
      collection: config.qdrant.collection,
      error: health.error,
      latencyMs: health.latency_ms,
    });
  }
});
