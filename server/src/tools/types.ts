import { z } from "zod";

/**
 * Risk classification for tool capabilities.
 * Supports governance, authorization, and future human approval (Phase 17).
 */
export type ToolRiskLevel =
  | "READ_ONLY"
  | "LOW_RISK"
  | "MUTATING"
  | "EXTERNAL_SIDE_EFFECT";

/**
 * Trusted host-controlled execution context passed into every tool.
 * The model NEVER supplies these values; they come from session/task identity.
 */
export interface ToolContext {
  userId: string;
  organizationId?: string;
  taskId: string;
  stepId?: string;
  logger?: (msg: string) => void;
}

/**
 * Provider-independent internal Tool definition.
 */
export interface Tool<TInput = unknown, TOutput = unknown> {
  name: string;
  description: string;
  riskLevel: ToolRiskLevel;
  inputSchema: z.ZodType<TInput>;
  outputSchema: z.ZodType<TOutput>;
  execute(input: TInput, context: ToolContext): Promise<TOutput>;
}

/**
 * Lightweight tool metadata summary for discovery and UI.
 */
export interface ToolSummary {
  name: string;
  description: string;
  riskLevel: ToolRiskLevel;
}

/**
 * Normalized Tool Call proposal extracted from the LLM.
 */
export interface NormalizedToolCall {
  tool: string;
  arguments: Record<string, unknown>;
  toolCallId?: string;
}

/**
 * Standardized Tool Result envelope returned as observation to the LLM.
 */
export interface ToolExecutionEnvelope<T = unknown> {
  tool: string;
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

/**
 * MySQL tool_executions representation.
 */
export interface ToolExecutionRecord {
  id: string;
  task_id: string;
  step_id: string | null;
  tool_name: string;
  input_payload: Record<string, unknown>;
  output_payload: string | null;
  duration_ms: number;
  is_error: boolean;
  error_message: string | null;
  created_at: string;
}
