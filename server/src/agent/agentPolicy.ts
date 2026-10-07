/**
 * Phase 15 — Agent Policy Engine & Tool Authorization Boundary
 *
 * Implements strict host-controlled security checks:
 * 1. Tool authorization against step allowlist, task allowlist, and platform registry.
 * 2. Risk-aware execution boundaries (blocking unauthorized mutating or external side-effect tools).
 * 3. Tenant boundary protection (preventing cross-tenant leakage or client escalation).
 * 4. Authoritative failure classification and retry policy.
 */

import { toolRegistry } from "../tools/registry";
import { ToolRiskLevel } from "../tools/types";
import {
  AdvancedPlanStep,
  ExecutionContext,
  FailureClassification,
  FailureCategory,
} from "./agentTypes";

export class PolicyViolationError extends Error {
  public code: string;
  public details?: Record<string, unknown>;

  constructor(message: string, code: string = "POLICY_VIOLATION", details?: Record<string, unknown>) {
    super(message);
    this.name = "PolicyViolationError";
    this.code = code;
    this.details = details;
  }
}

export class AgentPolicyEngine {
  /**
   * Maximum allowed tool risk level for Phase 15 autonomous execution.
   * EXTERNAL_SIDE_EFFECT (e.g. sending emails or external mutations) is strictly prohibited.
   */
  private static readonly MAX_ALLOWED_RISK: ToolRiskLevel[] = [
    "READ_ONLY",
    "LOW_RISK",
    "MUTATING",
  ];

  /**
   * Tools explicitly blocked from autonomous execution in Phase 15.
   */
  private static readonly BLOCKED_TOOLS = new Set<string>([
    "gmail_send",
    "send_email",
    "execute_sql",
    "shell_exec",
    "filesystem_write",
    "eval",
  ]);

  /**
   * Authorizes a proposed tool execution against platform policy, step allowlist, and risk levels.
   */
  public static authorizeToolExecution(
    toolName: string,
    args: Record<string, unknown>,
    step: AdvancedPlanStep,
    taskAllowedTools: string[] | undefined,
    context: ExecutionContext
  ): { authorized: boolean; reason?: string } {
    // 1. Guard against blocked tools (privilege escalation prevention)
    if (this.BLOCKED_TOOLS.has(toolName.toLowerCase())) {
      throw new PolicyViolationError(
        `Tool '${toolName}' is strictly prohibited by platform security policy.`,
        "PROHIBITED_TOOL_VIOLATION",
        { toolName }
      );
    }

    // 2. Verify tool exists in authoritative ToolRegistry
    const tool = toolRegistry.getTool(toolName);
    if (!tool) {
      throw new PolicyViolationError(
        `Tool '${toolName}' is not registered in the platform registry.`,
        "UNREGISTERED_TOOL_VIOLATION",
        { toolName }
      );
    }

    // 3. Verify tool risk level
    if (!this.MAX_ALLOWED_RISK.includes(tool.riskLevel)) {
      throw new PolicyViolationError(
        `Tool '${toolName}' risk level '${tool.riskLevel}' exceeds autonomous execution threshold.`,
        "RISK_LEVEL_VIOLATION",
        { toolName, riskLevel: tool.riskLevel }
      );
    }

    // 4. Verify step-level allowlist (if configured on the planned step)
    if (step.allowedTools && step.allowedTools.length > 0) {
      if (!step.allowedTools.includes(toolName)) {
        throw new PolicyViolationError(
          `Tool '${toolName}' is not authorized for current step '${step.id}'. Allowed: [${step.allowedTools.join(", ")}].`,
          "STEP_TOOL_ALLOWLIST_VIOLATION",
          { toolName, stepId: step.id, allowed: step.allowedTools }
        );
      }
    }

    // 5. Verify task-level allowlist (if configured)
    if (taskAllowedTools && taskAllowedTools.length > 0) {
      if (!taskAllowedTools.includes(toolName)) {
        throw new PolicyViolationError(
          `Tool '${toolName}' is not permitted by task allowlist.`,
          "TASK_TOOL_ALLOWLIST_VIOLATION",
          { toolName, taskAllowedTools }
        );
      }
    }

    // 6. Tenant Context Verification
    if (!context.organizationId || context.organizationId.trim().length === 0) {
      throw new PolicyViolationError(
        "Execution context is missing a verified organization tenant boundary.",
        "TENANT_CONTEXT_MISSING"
      );
    }

    if (!context.userId || context.userId.trim().length === 0) {
      throw new PolicyViolationError(
        "Execution context is missing an authenticated user identity.",
        "USER_IDENTITY_MISSING"
      );
    }

    return { authorized: true };
  }

  /**
   * Classifies an execution error into a typed category and determines retry/replan policy.
   */
  public static classifyFailure(error: unknown): FailureClassification {
    const message = error instanceof Error ? error.message : String(error);
    const lowerMsg = message.toLowerCase();

    // 1. Policy & Authorization Violations (NEVER retryable)
    if (
      error instanceof PolicyViolationError ||
      lowerMsg.includes("policy") ||
      lowerMsg.includes("prohibited")
    ) {
      return {
        category: "POLICY_ERROR",
        message,
        retryable: false,
        replanEligible: false,
      };
    }

    if (
      lowerMsg.includes("unauthorized") ||
      lowerMsg.includes("forbidden") ||
      lowerMsg.includes("permission denied") ||
      lowerMsg.includes("not permitted")
    ) {
      return {
        category: "AUTHORIZATION_ERROR",
        message,
        retryable: false,
        replanEligible: false,
      };
    }

    // 2. Input/Validation Errors (Non-retryable without argument change, eligible for replan)
    if (
      lowerMsg.includes("validation") ||
      lowerMsg.includes("invalid input") ||
      lowerMsg.includes("invalid argument") ||
      lowerMsg.includes("zoderror")
    ) {
      return {
        category: "VALIDATION_ERROR",
        message,
        retryable: false,
        replanEligible: true,
      };
    }

    // 3. Timeout Errors (Transient provider/network timeout: retryable)
    if (
      lowerMsg.includes("timeout") ||
      lowerMsg.includes("timed out") ||
      lowerMsg.includes("etimedout") ||
      lowerMsg.includes("econnaborted")
    ) {
      return {
        category: "TIMEOUT_ERROR",
        message,
        retryable: true,
        replanEligible: true,
      };
    }

    // 4. Rate Limit Errors (Transient 429: retryable with backoff)
    if (
      lowerMsg.includes("rate limit") ||
      lowerMsg.includes("too many requests") ||
      lowerMsg.includes("429")
    ) {
      return {
        category: "RATE_LIMIT_ERROR",
        message,
        retryable: true,
        replanEligible: true,
      };
    }

    // 5. Database Errors (Transient MySQL or pool errors: retryable)
    if (
      lowerMsg.includes("econnrefused") ||
      lowerMsg.includes("er_") ||
      lowerMsg.includes("mysql") ||
      lowerMsg.includes("deadlock")
    ) {
      return {
        category: "DATABASE_ERROR",
        message,
        retryable: true,
        replanEligible: false,
      };
    }

    // 6. External Provider Errors (Web search, OpenAI API, Qdrant: retryable)
    if (
      lowerMsg.includes("provider") ||
      lowerMsg.includes("openai") ||
      lowerMsg.includes("qdrant") ||
      lowerMsg.includes("502") ||
      lowerMsg.includes("503") ||
      lowerMsg.includes("504")
    ) {
      return {
        category: "PROVIDER_ERROR",
        message,
        retryable: true,
        replanEligible: true,
      };
    }

    // 7. Default Unknown
    return {
      category: "UNKNOWN_ERROR",
      message,
      retryable: false,
      replanEligible: true,
    };
  }

  /**
   * Validates a structured decision against step, allowlist, and platform policy.
   */
  public static validateDecision(
    decision: { type: string; toolCall?: { tool: string; arguments?: Record<string, unknown> } },
    step: AdvancedPlanStep,
    context: ExecutionContext,
    taskAllowedTools?: string[]
  ): { allowed: boolean; reason?: string } {
    if (decision.type === "CALL_TOOL" && decision.toolCall) {
      try {
        this.authorizeToolExecution(
          decision.toolCall.tool,
          decision.toolCall.arguments || {},
          step,
          taskAllowedTools,
          context
        );
        return { allowed: true };
      } catch (err: any) {
        return { allowed: false, reason: err.message };
      }
    }
    return { allowed: true };
  }
}

/**
 * Top-level convenience wrapper for error classification.
 */
export function classifyFailure(error: unknown): FailureClassification & {
  classification: FailureCategory;
  isRetryable: boolean;
} {
  const result = AgentPolicyEngine.classifyFailure(error);
  return {
    ...result,
    classification: result.category,
    isRetryable: result.retryable,
  };
}

