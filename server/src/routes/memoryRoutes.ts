import { Router, Request, Response } from "express";
import { MemoryService } from "../memory/memoryService";
import { MemoryRepository } from "../memory/memoryRepository";
import { MemoryEvaluator } from "../memory/memoryEvaluator";
import { ContextService } from "../context/contextService";
import {
  CreateMemoryCandidateSchema,
  UpdateMemorySchema,
  MemorySearchFilterSchema,
  MemoryUsageFeedbackSchema,
} from "../memory/schemas";
import { authService } from "../auth/authService";

export const memoryRouter = Router();

function getTenantId(req: Request): string {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    try {
      const payload = authService.verifyToken(authHeader.substring(7));
      if (payload && (payload as any).organizationId) {
        return (payload as any).organizationId;
      }
    } catch {
      // Fallback
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
      const payload = authService.verifyToken(authHeader.substring(7));
      if (payload && payload.userId) {
        return payload.userId;
      }
    } catch {
      // Fallback
    }
  }
  return "usr_demo_admin_001";
}

function getUserRole(req: Request): string {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    try {
      const payload = authService.verifyToken(authHeader.substring(7));
      if (payload && (payload as any).role) {
        return (payload as any).role;
      }
    } catch {
      // Fallback
    }
  }
  return "ADMIN";
}

/**
 * GET /api/memory
 * Lists and filters memories within caller's tenant boundary.
 */
memoryRouter.get("/", async (req: Request, res: Response) => {
  try {
    const orgId = getTenantId(req);
    const userId = getUserId(req);
    const isAdmin = getUserRole(req) === "ADMIN";

    const filter = {
      organizationId: orgId,
      userId: isAdmin && req.query.allUsers === "true" ? undefined : userId,
      scope: req.query.scope as any,
      type: req.query.type as any,
      status: req.query.status as any,
      query: req.query.query as string,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 20,
      offset: req.query.offset ? parseInt(req.query.offset as string) : 0,
    };

    const result = MemoryRepository.find(filter);
    res.json({
      status: "success",
      data: result.records,
      total: result.total,
    });
  } catch (err: any) {
    res.status(400).json({ status: "error", message: err.message });
  }
});

/**
 * GET /api/memory/:memoryId
 * Retrieves a single memory by ID.
 */
memoryRouter.get("/:memoryId", async (req: Request, res: Response) => {
  try {
    const memory = MemoryService.getMemory(
      req.params.memoryId,
      getTenantId(req),
      getUserId(req),
      getUserRole(req) === "ADMIN"
    );
    res.json({ status: "success", data: memory });
  } catch (err: any) {
    const statusCode = err.message.includes("FORBIDDEN") ? 403 : 404;
    res.status(statusCode).json({ status: "error", message: err.message });
  }
});

/**
 * POST /api/memory
 * Creates and validates a new memory candidate.
 */
memoryRouter.post("/", async (req: Request, res: Response) => {
  try {
    const input = {
      ...req.body,
      organizationId: getTenantId(req),
      userId: req.body.scope === "USER" ? getUserId(req) : req.body.userId,
    };

    const record = await MemoryService.createCandidate(input);
    res.status(201).json({ status: "success", data: record });
  } catch (err: any) {
    const statusCode = err.message.includes("RESTRICTED_DATA_REJECTED") ? 422 : 400;
    res.status(statusCode).json({ status: "error", message: err.message });
  }
});

/**
 * PATCH /api/memory/:memoryId
 * Updates or supersedes an existing memory.
 */
memoryRouter.patch("/:memoryId", async (req: Request, res: Response) => {
  try {
    const updated = await MemoryService.updateMemory(
      req.params.memoryId,
      req.body,
      getTenantId(req),
      getUserId(req),
      getUserRole(req) === "ADMIN"
    );
    res.json({ status: "success", data: updated });
  } catch (err: any) {
    const statusCode = err.message.includes("FORBIDDEN") ? 403 : 400;
    res.status(statusCode).json({ status: "error", message: err.message });
  }
});

/**
 * DELETE /api/memory/:memoryId
 * Soft-deletes a memory record.
 */
memoryRouter.delete("/:memoryId", async (req: Request, res: Response) => {
  try {
    const success = await MemoryService.deleteMemory(
      req.params.memoryId,
      getTenantId(req),
      getUserId(req),
      getUserRole(req) === "ADMIN"
    );
    res.json({ status: "success", data: { deleted: success } });
  } catch (err: any) {
    const statusCode = err.message.includes("FORBIDDEN") ? 403 : 404;
    res.status(statusCode).json({ status: "error", message: err.message });
  }
});

/**
 * POST /api/memory/search
 * Performs multi-factor ranked memory search.
 */
memoryRouter.post("/search", async (req: Request, res: Response) => {
  try {
    const filter = {
      ...req.body,
      organizationId: getTenantId(req),
      userId: getUserId(req),
    };
    const results = await MemoryService.search(filter);
    res.json({ status: "success", data: results });
  } catch (err: any) {
    res.status(400).json({ status: "error", message: err.message });
  }
});

/**
 * POST /api/memory/feedback
 * Records memory utility feedback from task execution.
 */
memoryRouter.post("/feedback", async (req: Request, res: Response) => {
  try {
    const parsed = MemoryUsageFeedbackSchema.parse({
      ...req.body,
      organizationId: getTenantId(req),
      userId: getUserId(req),
    });
    MemoryService.recordFeedback(parsed);
    res.json({ status: "success", data: { recorded: true } });
  } catch (err: any) {
    res.status(400).json({ status: "error", message: err.message });
  }
});

/**
 * GET /api/memory/metrics
 * Returns memory health, counts, and utility metrics for the caller's tenant.
 */
memoryRouter.get("/metrics/summary", async (req: Request, res: Response) => {
  try {
    const metrics = MemoryService.getMetrics(getTenantId(req));
    res.json({ status: "success", data: metrics });
  } catch (err: any) {
    res.status(400).json({ status: "error", message: err.message });
  }
});

/**
 * POST /api/memory/eval
 * Runs the 12-scenario golden memory regression benchmark suite.
 */
memoryRouter.post("/eval", async (req: Request, res: Response) => {
  try {
    const summary = await MemoryEvaluator.runEvaluation();
    res.json({ status: "success", data: summary });
  } catch (err: any) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

// ---------------------------------------------------------------------------
// Context Assembly Endpoints
// ---------------------------------------------------------------------------

export const contextRouter = Router();

/**
 * POST /api/context/assemble
 * Assembles a governed, injection-safe, token-budgeted prompt context.
 */
contextRouter.post("/assemble", async (req: Request, res: Response) => {
  try {
    const request = {
      ...req.body,
      organizationId: getTenantId(req),
      userId: getUserId(req),
    };
    const assembled = await ContextService.assembleContext(request);
    res.json({ status: "success", data: assembled });
  } catch (err: any) {
    res.status(400).json({ status: "error", message: err.message });
  }
});
