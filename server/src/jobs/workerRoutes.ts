/**
 * AI Workforce Platform — Phase 18: Worker & Job Queue REST Endpoints
 *
 * Provides worker health inspection, queue metrics telemetry, and job status querying.
 */

import { Router, Request, Response } from "express";
import { RowDataPacket } from "mysql2/promise";
import { pool } from "../db/pool";
import { requireAuth } from "../auth/middleware";
import { jobQueue } from "./queue";
import { checkRedisHealth } from "../cache/redis";

export const workerRouter = Router();

/**
 * Public/Operational Worker Health Check
 * GET /api/health/worker
 */
workerRouter.get("/health", async (_req: Request, res: Response): Promise<void> => {
  try {
    const redisHealth = await checkRedisHealth();
    const metrics = await jobQueue.getMetrics();

    const isHealthy = redisHealth.connected;

    res.status(isHealthy ? 200 : 503).json({
      status: isHealthy ? "healthy" : "degraded",
      worker: {
        onlineWorkers: metrics.onlineWorkers,
        activeJobs: metrics.active,
        queuedJobs: metrics.queued,
        delayedJobs: metrics.delayed,
        completedJobs: metrics.completed,
        failedJobs: metrics.failed,
        exhaustedJobs: metrics.exhausted,
      },
      redis: {
        connected: redisHealth.connected,
        latencyMs: redisHealth.latencyMs,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    res.status(500).json({
      status: "unhealthy",
      error: error.message || "Failed to inspect worker health",
    });
  }
});

/**
 * GET /api/jobs
 * Lists background jobs for authenticated user's organization.
 */
workerRouter.get("/", requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const orgId = req.organizationId!;
    const status = req.query.status as string;
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
    const offset = Math.max(Number(req.query.offset) || 0, 0);

    let query = `SELECT * FROM jobs WHERE organization_id = ?`;
    const params: any[] = [orgId];

    if (status) {
      query += ` AND status = ?`;
      params.push(status);
    }

    query += ` ORDER BY created_at DESC LIMIT ? OFFSET ?;`;
    params.push(limit, offset);

    const [rows] = await pool.query<RowDataPacket[]>(query, params);

    const jobs = rows.map((r) => ({
      id: r.id,
      taskId: r.task_id,
      organizationId: r.organization_id,
      type: r.type,
      status: r.status,
      priority: r.priority,
      attempts: r.attempts,
      maxAttempts: r.max_attempts,
      workerId: r.worker_id,
      lastError: r.last_error ? (typeof r.last_error === "string" ? JSON.parse(r.last_error) : r.last_error) : null,
      startedAt: r.started_at,
      completedAt: r.completed_at,
      failedAt: r.failed_at,
      createdAt: r.created_at,
    }));

    res.status(200).json({
      status: "success",
      data: jobs,
    });
  } catch (error: any) {
    res.status(500).json({
      status: "error",
      error: {
        code: "JOBS_FETCH_FAILED",
        message: error.message || "Failed to retrieve background jobs",
      },
    });
  }
});

/**
 * GET /api/jobs/:id
 * Retrieves job details by ID with anti-IDOR scoping.
 */
workerRouter.get("/:id", requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const orgId = req.organizationId!;
    const jobId = req.params.id;

    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT * FROM jobs WHERE id = ? AND organization_id = ? LIMIT 1;`,
      [jobId, orgId]
    );

    if (rows.length === 0) {
      res.status(404).json({
        status: "error",
        error: {
          code: "JOB_NOT_FOUND",
          message: `Job '${jobId}' not found.`,
        },
      });
      return;
    }

    const r = rows[0];
    res.status(200).json({
      status: "success",
      data: {
        id: r.id,
        taskId: r.task_id,
        organizationId: r.organization_id,
        type: r.type,
        status: r.status,
        priority: r.priority,
        payload: typeof r.payload === "string" ? JSON.parse(r.payload) : r.payload,
        attempts: r.attempts,
        maxAttempts: r.max_attempts,
        workerId: r.worker_id,
        lastError: r.last_error ? (typeof r.last_error === "string" ? JSON.parse(r.last_error) : r.last_error) : null,
        startedAt: r.started_at,
        completedAt: r.completed_at,
        failedAt: r.failed_at,
        createdAt: r.created_at,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      status: "error",
      error: {
        code: "JOB_FETCH_FAILED",
        message: error.message || "Failed to retrieve job",
      },
    });
  }
});
