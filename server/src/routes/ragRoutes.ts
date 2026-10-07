import { Router, Request, Response } from "express";
import { RagRequestSchema } from "../rag/schemas";
import { ragService } from "../rag/ragService";
import { requireAuth } from "../auth/middleware";

export const ragRouter = Router();

/**
 * Phase 12 & 13 — Grounded RAG Query Endpoint
 *
 * POST /api/rag/query
 * Executes the complete RAG pipeline: retrieval -> context -> LLM -> validation -> grounded response.
 * Strictly tenant-isolated via authenticated user's organizationId.
 */
ragRouter.post("/query", requireAuth, async (req: Request, res: Response): Promise<void> => {
  // 1. Zod Input Validation
  const parseResult = RagRequestSchema.safeParse(req.body);
  if (!parseResult.success) {
    const errorDetails = parseResult.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    res.status(400).json({
      success: false,
      error: {
        code: "INVALID_RAG_REQUEST",
        message: errorDetails,
      },
    });
    return;
  }

  const { question, top_k, score_threshold } = parseResult.data;

  // 2. Host-Controlled Tenant Identity (Derived strictly from req.user, ignoring any client spoofing)
  const tenantId = req.user!.organizationId;

  try {
    const result = await ragService.query({
      question,
      organizationId: tenantId,
      topK: top_k,
      scoreThreshold: score_threshold,
    });

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal RAG pipeline error";
    const isValidation = message.includes("Validation Error") || message.includes("Fabricated citation");

    res.status(isValidation ? 422 : 500).json({
      success: false,
      error: {
        code: isValidation ? "RAG_VALIDATION_ERROR" : "RAG_EXECUTION_FAILED",
        message,
      },
    });
  }
});
