import crypto from "crypto";
import { RowDataPacket, ResultSetHeader } from "mysql2/promise";
import { pool } from "../db/pool";
import { generateText, analyzeContent } from "../llm/service";
import { LLMResult, LLMTelemetry, SummarizeAnalysis } from "../llm/types";

export interface AITelemetryRecord {
  id: string;
  task_id: string | null;
  provider: string;
  model: string;
  prompt_type: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  latency_ms: number;
  estimated_cost_usd: number;
  status: "SUCCESS" | "FAILED";
  created_at: string;
}

/**
 * Persists AI execution metrics durably into MySQL `ai_telemetry`.
 */
export async function recordAITelemetry(
  telemetry: LLMTelemetry,
  promptType: "text" | "structured" = "text",
  taskId: string | null = null
): Promise<string> {
  const id = crypto.randomUUID();
  try {
    await pool.query<ResultSetHeader>(
      `INSERT INTO ai_telemetry 
        (id, task_id, provider, model, prompt_type, prompt_tokens, completion_tokens, total_tokens, latency_ms, estimated_cost_usd, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        id,
        taskId,
        telemetry.provider,
        telemetry.model,
        promptType,
        telemetry.inputTokens,
        telemetry.outputTokens,
        telemetry.totalTokens,
        telemetry.latencyMs,
        telemetry.estimatedCostUsd,
        telemetry.status,
      ]
    );
    return id;
  } catch (err) {
    // Non-fatal telemetry persistence degradation: do not fail user request if analytics logging fails
    console.warn("[MySQL Telemetry Persistence Warning]", err);
    return id;
  }
}

/**
 * Executes text generation and records durable telemetry in MySQL.
 */
export async function executeTextGeneration(
  prompt: string,
  systemPrompt?: string,
  taskId: string | null = null
): Promise<LLMResult<string>> {
  const result = await generateText(prompt, systemPrompt);
  await recordAITelemetry(result.telemetry, "text", taskId);
  return result;
}

/**
 * Executes structured analysis, validates with Zod, and records durable telemetry in MySQL.
 */
export async function executeStructuredAnalysis(
  text: string,
  systemPrompt?: string,
  taskId: string | null = null
): Promise<LLMResult<SummarizeAnalysis>> {
  const result = await analyzeContent(text, systemPrompt);
  await recordAITelemetry(result.telemetry, "structured", taskId);
  return result;
}

/**
 * Fetches recent AI execution records from MySQL for observability.
 */
export async function getRecentAITelemetry(limit: number = 10): Promise<AITelemetryRecord[]> {
  const safeLimit = Math.min(Math.max(1, limit), 50);
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT id, task_id, provider, model, prompt_type, prompt_tokens, completion_tokens, total_tokens, 
            latency_ms, estimated_cost_usd, status, created_at
     FROM ai_telemetry
     ORDER BY created_at DESC
     LIMIT ?;`,
    [safeLimit]
  );
  return rows as AITelemetryRecord[];
}
