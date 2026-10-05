import { z } from "zod";
import { AGENT_CONFIG } from "./agentConfig";

/**
 * Agent Lifecycle States
 *
 * Enforces the host-controlled state machine:
 * REQUESTED -> RUNNING -> LLM_CALL -> VALIDATING -> COMPLETED
 * Any unrecoverable failure -> FAILED
 */
export type AgentLifecycleState =
  | "REQUESTED"
  | "RUNNING"
  | "LLM_CALL"
  | "VALIDATING"
  | "TOOL_REQUESTED"
  | "TOOL_AUTHORIZED"
  | "TOOL_EXECUTING"
  | "TOOL_COMPLETED"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

/**
 * Zod Schema for an individual planned step.
 */
export const PlanStepSchema = z.object({
  order: z.number().int().positive("Step order must be a positive integer"),
  title: z.string().min(1, "Step title cannot be empty").max(200).optional(),
  description: z.string().min(3, "Step description must be at least 3 characters").max(1000),
});

export type PlanStep = z.infer<typeof PlanStepSchema>;

/**
 * Zod Schema for the complete Agent Execution Plan.
 * The model proposes this structure; the application validates it before persisting steps.
 */
export const AgentPlanSchema = z.object({
  goal: z.string().min(3, "Goal must be at least 3 characters").max(500),
  summary: z.string().min(5, "Summary must be at least 5 characters").max(2000),
  steps: z
    .array(PlanStepSchema)
    .min(AGENT_CONFIG.MIN_PLAN_STEPS, `Plan must have at least ${AGENT_CONFIG.MIN_PLAN_STEPS} step`)
    .max(AGENT_CONFIG.MAX_PLAN_STEPS, `Plan cannot exceed ${AGENT_CONFIG.MAX_PLAN_STEPS} steps`),
});

export type AgentPlan = z.infer<typeof AgentPlanSchema>;

/**
 * Task Input Request DTO
 */
export interface CreateAgentTaskInput {
  task: string;
  title?: string;
  userId?: string;
  priority?: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  mode?: "planning" | "tools";
  allowedTools?: string[];
}

/**
 * Durable Task Entity representation
 */
export interface AgentTaskEntity {
  id: string;
  user_id: string;
  title: string;
  prompt: string;
  status: AgentLifecycleState;
  priority: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  constraints_json: Record<string, unknown> | null;
  final_report: string | null;
  error_message: string | null;
  prompt_tokens: number;
  completion_tokens: number;
  total_cost_usd: number;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Durable Task Step Entity representation
 */
export interface AgentTaskStepEntity {
  id: string;
  task_id: string;
  step_order: number;
  title: string;
  description: string;
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "FAILED" | "SKIPPED";
  tool_name: string | null;
  input_data: Record<string, unknown> | null;
  output_data: Record<string, unknown> | null;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

/**
 * Full Agent Execution Result returned to the caller
 */
export interface AgentExecutionResponse {
  taskId: string;
  status: AgentLifecycleState;
  cycles: number;
  latencyMs: number;
  plan: AgentPlan | null;
  steps: AgentTaskStepEntity[];
  finalAnswer?: string | null;
  toolExecutions?: Array<{
    id: string;
    tool: string;
    arguments: Record<string, unknown>;
    result: unknown;
    durationMs: number;
    success: boolean;
  }>;
  telemetry: {
    model: string;
    totalTokens: number;
    estimatedCostUsd: number;
  } | null;
  timeline: {
    state: AgentLifecycleState;
    timestamp: string;
    details?: string;
  }[];
  error?: string;
}
