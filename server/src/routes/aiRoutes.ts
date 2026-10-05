import { Router, Request, Response, NextFunction } from "express";
import {
  executeTextGeneration,
  executeStructuredAnalysis,
  getRecentAITelemetry,
} from "../services/aiService";

export const aiRouter = Router();

const MAX_PROMPT_LENGTH = 3000;

// POST /api/ai/generate - Free-form natural language generation with message separation
aiRouter.post("/generate", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { prompt, systemPrompt } = req.body;

    if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
      res.status(400).json({
        status: "error",
        error: {
          code: "INVALID_PROMPT",
          message: "Field 'prompt' is required and must be a non-empty string.",
        },
      });
      return;
    }

    if (prompt.trim().length > MAX_PROMPT_LENGTH) {
      res.status(400).json({
        status: "error",
        error: {
          code: "PROMPT_TOO_LONG",
          message: `Prompt exceeds maximum allowed length of ${MAX_PROMPT_LENGTH} characters.`,
        },
      });
      return;
    }

    const result = await executeTextGeneration(prompt, systemPrompt);

    res.status(200).json({
      status: "success",
      output: result.data,
      telemetry: result.telemetry,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/ai/summarize - Structured JSON analysis with runtime schema validation
aiRouter.post("/summarize", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { text, systemPrompt } = req.body;

    if (!text || typeof text !== "string" || !text.trim()) {
      res.status(400).json({
        status: "error",
        error: {
          code: "INVALID_TEXT",
          message: "Field 'text' is required and must be a non-empty string.",
        },
      });
      return;
    }

    if (text.trim().length > MAX_PROMPT_LENGTH) {
      res.status(400).json({
        status: "error",
        error: {
          code: "TEXT_TOO_LONG",
          message: `Text exceeds maximum allowed length of ${MAX_PROMPT_LENGTH} characters.`,
        },
      });
      return;
    }

    const result = await executeStructuredAnalysis(text, systemPrompt);

    res.status(200).json({
      status: "success",
      output: result.data,
      telemetry: result.telemetry,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/ai/telemetry - Fetch durable telemetry log from MySQL
aiRouter.get("/telemetry", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : 10;
    const records = await getRecentAITelemetry(limit);
    res.status(200).json({
      status: "success",
      count: records.length,
      data: records,
    });
  } catch (error) {
    next(error);
  }
});
