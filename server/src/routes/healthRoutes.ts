import { Router, Request, Response } from "express";
import { checkDatabaseHealth } from "../db/pool";
import { checkRedisHealth } from "../cache/redis";

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
