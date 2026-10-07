/**
 * Phase 15 — Advanced Agent Architecture Domain Types
 */

import { AgentLifecycleState } from "./agentSchemas";

export type StepLifecycleStatus =
  | "PENDING"
  | "READY"
  | "RUNNING"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "FAILED"
  | "SKIPPED";

export interface AdvancedPlanStep {
  id: string;
  order: number;
  title: string;
  description: string;
  dependencies: string[];
  allowedTools?: string[];
  status: StepLifecycleStatus;
  retryCount?: number;
  resultSummary?: string | null;
  error?: string | null;
}

export interface AdvancedAgentPlan {
  goal: string;
  summary: string;
  steps: AdvancedPlanStep[];
}

export type DecisionType = "CONTINUE" | "CALL_TOOL" | "COMPLETE" | "FAIL";

export interface AgentDecision {
  type: DecisionType;
  reasoningSummary: string;
  toolCall?: {
    tool: string;
    arguments: Record<string, unknown>;
  };
  finalAnswer?: string;
  failureReason?: string;
}

export type FailureCategory =
  | "VALIDATION_ERROR"
  | "AUTHORIZATION_ERROR"
  | "POLICY_ERROR"
  | "PROVIDER_ERROR"
  | "TIMEOUT_ERROR"
  | "RATE_LIMIT_ERROR"
  | "DATABASE_ERROR"
  | "UNKNOWN_ERROR";

export interface FailureClassification {
  category: FailureCategory;
  message: string;
  retryable: boolean;
  replanEligible: boolean;
}

export interface AgentObservation {
  type: "tool_result";
  tool: string;
  status: "success" | "error";
  summary: string;
  data: unknown;
  durationMs?: number;
  timestamp?: string;
  stepId?: string;
  error?: {
    code: string;
    message: string;
  };
}

export interface AgentFinding {
  title: string;
  value: string;
}

export interface AgentFinalSynthesis {
  summary: string;
  findings: AgentFinding[];
  sources: string[];
  confidence: number;
}

export interface AgentContextBudget {
  maxContextChars: number;
  maxObservations: number;
  maxToolOutputChars: number;
  maxHistoryItems: number;
}

export interface AgentWatchdogLimits {
  maxCycles: number;
  maxToolCalls: number;
  maxStepRetries: number;
  maxReplans: number;
  maxExecutionTimeMs: number;
  maxConsecutiveIdenticalCalls: number;
}

export interface ExecutionContext {
  userId: string;
  organizationId: string;
  taskId: string;
  role?: string;
}

export type AuthenticatedContext = ExecutionContext;

