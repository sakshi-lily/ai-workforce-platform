import { Router, Request, Response } from "express";
import { IntelligenceService } from "../intelligence/intelligenceService";
import { RecommendationEngine } from "../intelligence/recommendationEngine";
import { ExperimentEngine } from "../intelligence/experimentEngine";
import { WorkforceVersionManager } from "../intelligence/versionManager";
import { GoldenDatasetEvaluator } from "../intelligence/goldenEvaluator";
import { authService } from "../auth/authService";

export const intelligenceRouter = Router();

// Tenant extraction helper: reads from authenticated JWT, custom header, or default
function getTenantId(req: Request): string {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    try {
      const token = authHeader.substring(7);
      const payload = authService.verifyToken(token);
      if (payload && (payload as any).organizationId) {
        return (payload as any).organizationId;
      }
    } catch {
      // Fallback if token invalid or expired
    }
  }

  const customHeader = req.headers["x-organization-id"];
  if (typeof customHeader === "string" && customHeader.trim()) {
    return customHeader.trim();
  }

  return "org-demo-001";
}

function getUserId(req: Request): string {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    try {
      const token = authHeader.substring(7);
      const payload = authService.verifyToken(token);
      if (payload && payload.userId) {
        return payload.userId;
      }
    } catch {
      // Fallback
    }
  }
  return "usr-engineer-001";
}

// ---------------------------------------------------------------------------
// 1. Workforce Health & Overview Analytics (Section 9, 10, 63)
// ---------------------------------------------------------------------------

intelligenceRouter.get("/health", async (req: Request, res: Response) => {
  try {
    const orgId = getTenantId(req);
    const health = await IntelligenceService.computeWorkforceHealth(orgId);
    res.json({ status: "success", data: health });
  } catch (err: any) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

// ---------------------------------------------------------------------------
// 2. Agent Efficiency Analytics (Section 16, 20, 64)
// ---------------------------------------------------------------------------

intelligenceRouter.get("/agent", async (req: Request, res: Response) => {
  try {
    const orgId = getTenantId(req);
    const metrics = await IntelligenceService.getAgentEfficiency(orgId);
    res.json({ status: "success", data: metrics });
  } catch (err: any) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

// ---------------------------------------------------------------------------
// 3. Tool Effectiveness Analytics (Section 17, 18, 66)
// ---------------------------------------------------------------------------

intelligenceRouter.get("/tools", async (req: Request, res: Response) => {
  try {
    const orgId = getTenantId(req);
    const tools = await IntelligenceService.getToolEffectiveness(orgId);
    res.json({ status: "success", data: tools });
  } catch (err: any) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

// ---------------------------------------------------------------------------
// 4. RAG Quality Analytics & Knowledge Gaps (Section 22, 25, 65)
// ---------------------------------------------------------------------------

intelligenceRouter.get("/rag", async (req: Request, res: Response) => {
  try {
    const orgId = getTenantId(req);
    const ragMetrics = await IntelligenceService.getRAGQuality(orgId);
    res.json({ status: "success", data: ragMetrics });
  } catch (err: any) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

intelligenceRouter.get("/knowledge-gaps", async (req: Request, res: Response) => {
  try {
    const orgId = getTenantId(req);
    const gaps = await IntelligenceService.getKnowledgeGaps(orgId);
    res.json({ status: "success", data: gaps });
  } catch (err: any) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

intelligenceRouter.post("/knowledge-gaps", async (req: Request, res: Response) => {
  try {
    const orgId = getTenantId(req);
    const { query, topic, suggestedAction } = req.body;
    if (!query || !topic) {
      res.status(400).json({ status: "error", message: "query and topic are required." });
      return;
    }
    const gap = await IntelligenceService.recordKnowledgeGap({
      organizationId: orgId,
      query,
      topic,
      suggestedAction,
    });
    res.status(201).json({ status: "success", data: gap });
  } catch (err: any) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

// ---------------------------------------------------------------------------
// 5. Failure Intelligence & Trends (Section 13, 14, 15)
// ---------------------------------------------------------------------------

intelligenceRouter.get("/failures", async (req: Request, res: Response) => {
  try {
    const orgId = getTenantId(req);
    const data = await IntelligenceService.getFailureIntelligence(orgId);
    res.json({ status: "success", data });
  } catch (err: any) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

intelligenceRouter.post("/failures", async (req: Request, res: Response) => {
  try {
    const orgId = getTenantId(req);
    const { taskId, category, rootCause, recovered } = req.body;
    if (!taskId || !category || !rootCause) {
      res.status(400).json({ status: "error", message: "taskId, category, and rootCause are required." });
      return;
    }
    const record = {
      id: `fail-${Date.now().toString(36)}`,
      taskId,
      organizationId: orgId,
      category,
      rootCause,
      recovered: !!recovered,
      timestamp: new Date().toISOString(),
    };
    await IntelligenceService.recordFailure(record);
    res.status(201).json({ status: "success", data: record });
  } catch (err: any) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

// ---------------------------------------------------------------------------
// 6. User Feedback Analytics (Section 26, 27)
// ---------------------------------------------------------------------------

intelligenceRouter.get("/feedback", async (req: Request, res: Response) => {
  try {
    const orgId = getTenantId(req);
    const data = await IntelligenceService.getFeedbackIntelligence(orgId);
    res.json({ status: "success", data });
  } catch (err: any) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

intelligenceRouter.post("/feedback", async (req: Request, res: Response) => {
  try {
    const orgId = getTenantId(req);
    const userId = getUserId(req);
    const { taskId, rating, category, comment } = req.body;
    if (!taskId || !rating || !category) {
      res.status(400).json({ status: "error", message: "taskId, rating, and category are required." });
      return;
    }
    const item = await IntelligenceService.recordFeedback({
      taskId,
      organizationId: orgId,
      userId,
      rating,
      category,
      comment,
    });
    res.status(201).json({ status: "success", data: item });
  } catch (err: any) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

// ---------------------------------------------------------------------------
// 7. Model Comparison & Cost Intelligence (Section 28, 41, 67)
// ---------------------------------------------------------------------------

intelligenceRouter.get("/models", async (_req: Request, res: Response) => {
  try {
    const models = await IntelligenceService.compareModels();
    res.json({ status: "success", data: models });
  } catch (err: any) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

intelligenceRouter.get("/costs", async (req: Request, res: Response) => {
  try {
    const orgId = getTenantId(req);
    const costs = await IntelligenceService.getCostIntelligence(orgId);
    res.json({ status: "success", data: costs });
  } catch (err: any) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

// ---------------------------------------------------------------------------
// 8. Actionable Recommendations (Section 39, 40, 68)
// ---------------------------------------------------------------------------

intelligenceRouter.get("/recommendations", async (req: Request, res: Response) => {
  try {
    const orgId = getTenantId(req);
    const recs = await RecommendationEngine.evaluateAndGenerate(orgId);
    res.json({ status: "success", data: recs });
  } catch (err: any) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

intelligenceRouter.patch("/recommendations/:id/status", async (req: Request, res: Response) => {
  try {
    const orgId = getTenantId(req);
    const actorId = getUserId(req);
    const { id } = req.params;
    const { status } = req.body;
    if (!status) {
      res.status(400).json({ status: "error", message: "status is required." });
      return;
    }
    const updated = await RecommendationEngine.updateStatus({
      id,
      status,
      actorId,
      organizationId: orgId,
    });
    res.json({ status: "success", data: updated });
  } catch (err: any) {
    res.status(404).json({ status: "error", message: err.message });
  }
});

// ---------------------------------------------------------------------------
// 9. Controlled Experiments (Section 34, 36, 38)
// ---------------------------------------------------------------------------

intelligenceRouter.get("/experiments", async (req: Request, res: Response) => {
  try {
    const orgId = getTenantId(req);
    const experiments = await ExperimentEngine.listExperiments(orgId);
    res.json({ status: "success", data: experiments });
  } catch (err: any) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

intelligenceRouter.post("/experiments", async (req: Request, res: Response) => {
  try {
    const orgId = getTenantId(req);
    const actorId = getUserId(req);
    const { name, hypothesis, parameter, baselineVariant, candidateVariant, stopConditions } = req.body;
    if (!name || !hypothesis || !parameter || !baselineVariant || !candidateVariant) {
      res.status(400).json({ status: "error", message: "Missing required experiment fields." });
      return;
    }
    const exp = await ExperimentEngine.createExperiment(
      {
        organizationId: orgId,
        name,
        hypothesis,
        parameter,
        baselineVariant,
        candidateVariant,
        status: "RUNNING",
        stopConditions: stopConditions || ["quality_regression_gt_10_pct"],
      },
      actorId
    );
    res.status(201).json({ status: "success", data: exp });
  } catch (err: any) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

intelligenceRouter.patch("/experiments/:id/decision", async (req: Request, res: Response) => {
  try {
    const actorId = getUserId(req);
    const { id } = req.params;
    const { decision } = req.body;
    if (decision !== "ACCEPTED" && decision !== "REJECTED") {
      res.status(400).json({ status: "error", message: "decision must be 'ACCEPTED' or 'REJECTED'." });
      return;
    }
    const updated = await ExperimentEngine.resolveExperiment(id, decision, actorId);
    res.json({ status: "success", data: updated });
  } catch (err: any) {
    res.status(404).json({ status: "error", message: err.message });
  }
});

// ---------------------------------------------------------------------------
// 10. Traceable Workforce Versions & Lineage (Section 30, 84, 87)
// ---------------------------------------------------------------------------

intelligenceRouter.get("/versions", async (_req: Request, res: Response) => {
  try {
    const versions = await WorkforceVersionManager.listVersions();
    res.json({ status: "success", data: versions });
  } catch (err: any) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

intelligenceRouter.get("/versions/active", async (_req: Request, res: Response) => {
  try {
    const active = await WorkforceVersionManager.getActiveVersion();
    res.json({ status: "success", data: active });
  } catch (err: any) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

intelligenceRouter.post("/versions/activate", async (req: Request, res: Response) => {
  try {
    const orgId = getTenantId(req);
    const actorId = getUserId(req);
    const { version } = req.body;
    if (!version) {
      res.status(400).json({ status: "error", message: "version is required." });
      return;
    }
    const activated = await WorkforceVersionManager.activateVersion(version, actorId, orgId);
    res.json({ status: "success", data: activated });
  } catch (err: any) {
    res.status(400).json({ status: "error", message: err.message });
  }
});

// ---------------------------------------------------------------------------
// 11. Golden Dataset Regression Evaluation (Section 89, 90)
// ---------------------------------------------------------------------------

intelligenceRouter.post("/golden-eval", async (_req: Request, res: Response) => {
  try {
    const report = await GoldenDatasetEvaluator.runEvaluation();
    res.json({ status: "success", data: report });
  } catch (err: any) {
    res.status(500).json({ status: "error", message: err.message });
  }
});
