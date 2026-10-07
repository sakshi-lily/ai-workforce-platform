/**
 * AI Workforce Platform — Phase 14: Task Management Types
 *
 * Defines first-class domain models, lifecycle states, and contracts for durable AI work.
 */

export type TaskLifecycleState =
  | "REQUESTED"
  | "RUNNING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

export type TaskPriority = "LOW" | "NORMAL" | "HIGH" | "URGENT";

export interface TaskEntity {
  id: string;
  user_id: string;
  organization_id: string;
  title: string;
  goal: string;
  prompt: string;
  status: TaskLifecycleState;
  priority: TaskPriority;
  constraints_json?: Record<string, unknown> | null;
  final_report?: string | null;
  error_message?: string | null;
  prompt_tokens: number;
  completion_tokens: number;
  total_cost_usd: number;
  started_at?: string | null;
  completed_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskStepEntity {
  id: string;
  task_id: string;
  step_order: number;
  title: string;
  description: string;
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "FAILED" | "SKIPPED";
  tool_name?: string | null;
  input_data?: Record<string, unknown> | null;
  output_data?: Record<string, unknown> | null;
  error_message?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  created_at: string;
}

export interface TaskSummary {
  id: string;
  title: string;
  goal: string;
  status: TaskLifecycleState;
  priority: TaskPriority;
  stepCount: number;
  totalCostUsd: number;
  durationMs: number | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface TaskDetails {
  task: TaskEntity;
  steps: TaskStepEntity[];
  toolExecutions: Array<{
    id: string;
    step_id?: string | null;
    stepId?: string | null;
    tool: string;
    arguments: Record<string, unknown>;
    result: unknown;
    durationMs: number;
    success: boolean;
  }>;
  telemetry: {
    model: string;
    totalTokens: number;
    latencyMs: number;
    estimatedCostUsd: number;
  } | null;
  sources: string[];
}
