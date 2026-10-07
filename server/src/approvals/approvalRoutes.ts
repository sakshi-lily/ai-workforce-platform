/**
 * AI Workforce Platform — Phase 17: Approval HTTP Routes
 *
 * Exposes governed REST endpoints for listing, viewing, approving,
 * rejecting, and cancelling pending action approvals.
 */

import { Router, Request, Response } from "express";
import { requireAuth } from "../auth/middleware";
import { approvalService } from "./approvalService";
import {
  ApproveActionSchema,
  RejectActionSchema,
  CancelActionSchema,
} from "./approvalTypes";

export const approvalRouter = Router();

/**
 * GET /api/approvals
 * Lists approvals scoped strictly to the authenticated organization.
 */
approvalRouter.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const orgId = req.organizationId!;
    const status = req.query.status as any;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
    const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0;

    const result = await approvalService.listApprovals(orgId, {
      status,
      limit,
      offset,
    });

    res.json({
      status: "success",
      data: {
        approvals: result.approvals,
        total: result.total,
        limit,
        offset,
      },
    });
  } catch (err: any) {
    res.status(500).json({
      status: "error",
      error: {
        code: "LIST_APPROVALS_FAILED",
        message: err.message || "Failed to list approvals.",
      },
    });
  }
});

/**
 * GET /api/approvals/:id
 * Retrieves details for a specific approval. Enforces Anti-IDOR tenant isolation.
 */
approvalRouter.get("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const orgId = req.organizationId!;
    const approval = await approvalService.getApproval(req.params.id, orgId);

    if (!approval) {
      res.status(404).json({
        status: "error",
        error: {
          code: "APPROVAL_NOT_FOUND",
          message: `Approval '${req.params.id}' was not found.`,
        },
      });
      return;
    }

    res.json({
      status: "success",
      data: approval,
    });
  } catch (err: any) {
    res.status(500).json({
      status: "error",
      error: {
        code: "GET_APPROVAL_FAILED",
        message: err.message || "Failed to retrieve approval.",
      },
    });
  }
});

/**
 * POST /api/approvals/:id/approve
 * Approves a pending approval and triggers the authorized action execution.
 */
approvalRouter.post("/:id/approve", requireAuth, async (req: Request, res: Response) => {
  try {
    const parsed = ApproveActionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        status: "error",
        error: {
          code: "INVALID_REQUEST_BODY",
          message: "Validation failed for approval body.",
          details: parsed.error.issues,
        },
      });
      return;
    }

    const { approval, executionResult } = await approvalService.approve(
      req.params.id,
      req.user!,
      parsed.data.note
    );

    res.json({
      status: "success",
      data: {
        approval,
        executionResult,
        message: "Action approved and executed successfully.",
      },
    });
  } catch (err: any) {
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({
      status: "error",
      error: {
        code: err.code || "APPROVE_ACTION_FAILED",
        message: err.message || "Failed to approve action.",
      },
    });
  }
});

/**
 * POST /api/approvals/:id/reject
 * Rejects a pending approval.
 */
approvalRouter.post("/:id/reject", requireAuth, async (req: Request, res: Response) => {
  try {
    const parsed = RejectActionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        status: "error",
        error: {
          code: "INVALID_REQUEST_BODY",
          message: "Validation failed for rejection body.",
          details: parsed.error.issues,
        },
      });
      return;
    }

    const approval = await approvalService.reject(
      req.params.id,
      req.user!,
      parsed.data.reason
    );

    res.json({
      status: "success",
      data: {
        approval,
        message: "Action has been rejected by reviewer.",
      },
    });
  } catch (err: any) {
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({
      status: "error",
      error: {
        code: err.code || "REJECT_ACTION_FAILED",
        message: err.message || "Failed to reject action.",
      },
    });
  }
});

/**
 * POST /api/approvals/:id/cancel
 * Cancels a pending approval.
 */
approvalRouter.post("/:id/cancel", requireAuth, async (req: Request, res: Response) => {
  try {
    const parsed = CancelActionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        status: "error",
        error: {
          code: "INVALID_REQUEST_BODY",
          message: "Validation failed for cancel body.",
          details: parsed.error.issues,
        },
      });
      return;
    }

    const approval = await approvalService.cancel(
      req.params.id,
      req.user!,
      parsed.data.reason
    );

    res.json({
      status: "success",
      data: {
        approval,
        message: "Approval request was cancelled.",
      },
    });
  } catch (err: any) {
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({
      status: "error",
      error: {
        code: err.code || "CANCEL_ACTION_FAILED",
        message: err.message || "Failed to cancel approval.",
      },
    });
  }
});
