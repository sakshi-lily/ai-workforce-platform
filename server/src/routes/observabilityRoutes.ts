import { Router, Request, Response } from "express";
import { MetricsCollector } from "../observability/metrics";
import { ReadinessScorecardCalculator } from "../evals/readinessScorecard";
import { CanonicalTaskRunner } from "../evals/canonicalTaskRunner";

export const observabilityRouter = Router();

/**
 * GET /api/observability/dashboard
 * Live operational metrics: tasks, success rates, latency percentiles, queue depth.
 */
observabilityRouter.get("/dashboard", (_req: Request, res: Response) => {
  const dashboard = MetricsCollector.getOperationalDashboard();
  res.json({
    status: "ok",
    data: dashboard,
  });
});

/**
 * GET /api/observability/costs
 * Detailed AI token consumption and estimated spend per task.
 */
observabilityRouter.get("/costs", (_req: Request, res: Response) => {
  const costs = MetricsCollector.getCostMetrics();
  res.json({
    status: "ok",
    data: costs,
  });
});

/**
 * GET /api/observability/scorecard
 * Production readiness scorecard across 7 dimensions.
 */
observabilityRouter.get("/scorecard", (_req: Request, res: Response) => {
  const scorecard = ReadinessScorecardCalculator.calculateScorecard();
  res.json({
    status: "ok",
    data: scorecard,
  });
});

/**
 * POST /api/observability/canonical-test
 * Triggers safe deterministic canonical workforce task execution.
 */
observabilityRouter.post("/canonical-test", async (_req: Request, res: Response) => {
  try {
    const result = await CanonicalTaskRunner.executeCanonicalTask();
    res.json({
      status: "ok",
      data: result,
    });
  } catch (err: any) {
    res.status(500).json({
      status: "error",
      message: err.message,
    });
  }
});
