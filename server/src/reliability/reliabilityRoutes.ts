/**
 * AI Workforce Platform — Phase 19: Reliability & Recovery Endpoints
 *
 * Exposes health/reliability telemetry, circuit breaker metrics, task retry history,
 * and authenticated manual retry execution.
 */

import { Router, Request, Response } from "express";
import { RowDataPacket } from "mysql2/promise";
import { pool } from "../db/pool";
import { circuitBreaker } from "./circuitBreaker";
import { jobQueue } from "../jobs/queue";
import { recoveryService } from "./recoveryService";
import { requireAuth } from "../auth/middleware";

export const reliabilityRouter = Router();

/**
 * GET /api/health/reliability
 * Returns live workforce reliability metrics, circuit breaker states, and provider health.
 */
reliabilityRouter.get("/health/reliability", async (_req: Request, res: Response) => {
  try {
    const queueMetrics = await jobQueue.getMetrics();
    const circuitMetrics = circuitBreaker.getAllMetrics();

    // Query MySQL for task completion & failure rates
    const [counts] = await pool.query<RowDataPacket[]>(`
      SELECT 
        SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) as completed_count,
        SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) as failed_count,
        SUM(CASE WHEN status = 'WAITING_FOR_APPROVAL' THEN 1 ELSE 0 END) as approval_count,
        COUNT(*) as total_count
      FROM tasks;
    `);

    const completed = Number(counts[0]?.completed_count || 0);
    const failed = Number(counts[0]?.failed_count || 0);
    const totalFinished = completed + failed;
    const successRate =
      totalFinished > 0
        ? Math.round((completed / totalFinished) * 1000) / 10
        : 100.0;

    // Check recovered attempts count
    const [attemptsCount] = await pool.query<RowDataPacket[]>(`
      SELECT 
        SUM(CASE WHEN status = 'RECOVERED' THEN 1 ELSE 0 END) as recovered_count,
        SUM(CASE WHEN status = 'EXHAUSTED' THEN 1 ELSE 0 END) as exhausted_count
      FROM job_attempts;
    `);

    const recovered = Number(attemptsCount[0]?.recovered_count || 0);
    const exhausted = Number(attemptsCount[0]?.exhausted_count || 0);

    // Compute overall provider status
    const providers: Record<string, string> = {};
    for (const [provider, metric] of Object.entries(circuitMetrics)) {
      if (metric.state === "OPEN") {
        providers[provider] = "DEGRADED";
      } else if (metric.state === "HALF_OPEN") {
        providers[provider] = "RECOVERING";
      } else {
        providers[provider] = "HEALTHY";
      }
    }

    res.status(200).json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      reliability: {
        successRatePercent: successRate,
        tasksCompleted: completed,
        tasksFailed: failed,
        waitingApproval: Number(counts[0]?.approval_count || 0),
        recoveredCount: recovered,
        exhaustedCount: exhausted,
      },
      queue: { ...queueMetrics, pending: queueMetrics.queued },
      circuitBreakers: circuitMetrics,
      providers: {
        openai: providers.openai || "HEALTHY",
        gmail: providers.gmail || "HEALTHY",
        web_search: providers.web_search || "HEALTHY",
        qdrant: providers.qdrant || "HEALTHY",
      },
    });
  } catch (err: any) {
    console.error("[Reliability Health Route Error]", err);
    res.status(500).json({
      status: "error",
      error: {
        code: "RELIABILITY_HEALTH_ERROR",
        message: err.message || "Failed to calculate reliability metrics",
      },
    });
  }
});

/**
 * GET /api/tasks/:taskId/attempts
 * Returns attempt execution history for a given task (Anti-IDOR protected).
 */
reliabilityRouter.get(
  "/tasks/:taskId/attempts",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const attempts = await recoveryService.getTaskAttempts(
        req.params.taskId,
        req.organizationId!
      );
      res.status(200).json({
        status: "success",
        data: attempts,
      });
    } catch (err: any) {
      const statusCode = err.statusCode || 500;
      res.status(statusCode).json({
        status: "error",
        error: {
          code: err.code || "ATTEMPTS_FETCH_FAILED",
          message: err.message,
        },
      });
    }
  }
);

/**
 * POST /api/tasks/:taskId/retry
 * Authenticated operator endpoint to manually retry a failed task.
 */
reliabilityRouter.post(
  "/tasks/:taskId/retry",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const result = await recoveryService.retryFailedTask(
        req.params.taskId,
        req.organizationId!,
        req.user!
      );
      res.status(202).json({
        status: "success",
        message: "Task manually scheduled for recovery.",
        data: result,
      });
    } catch (err: any) {
      const statusCode = err.statusCode || 500;
      res.status(statusCode).json({
        status: "error",
        error: {
          code: err.code || "RETRY_FAILED",
          message: err.message,
        },
      });
    }
  }
);
