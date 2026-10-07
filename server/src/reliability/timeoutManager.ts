/**
 * AI Workforce Platform — Phase 19: Timeout Architecture & Deadline Propagation
 *
 * Implements authoritative multi-level timeout hierarchy, cancellation token propagation,
 * and execution budget enforcement to prevent zombie tasks and hung external calls.
 */

import { AppError, ErrorCategory } from "./failureTaxonomy";

export const TIMEOUT_HIERARCHY = {
  JOB_TIMEOUT_MS: 120_000,    // Maximum worker job execution window (2 min)
  AGENT_TIMEOUT_MS: 90_000,   // Maximum agent reasoning loop budget (1.5 min)
  STEP_TIMEOUT_MS: 30_000,    // Maximum individual step execution (30 sec)
  LLM_TIMEOUT_MS: 20_000,     // Single LLM generation request timeout (20 sec)
  TOOL_TIMEOUT_MS: 15_000,    // Tool execution timeout (15 sec)
};

export class ExecutionDeadline {
  public readonly deadlineMs: number;
  public readonly operationName: string;

  constructor(totalBudgetMs: number, operationName: string = "Task Execution") {
    this.deadlineMs = Date.now() + totalBudgetMs;
    this.operationName = operationName;
  }

  public getRemainingBudgetMs(): number {
    return Math.max(0, this.deadlineMs - Date.now());
  }

  public isExpired(): boolean {
    return Date.now() >= this.deadlineMs;
  }

  /**
   * Returns the bounded timeout for a child operation:
   * min(childBudget, remainingTaskBudget). Throws immediately if budget is exhausted.
   */
  public allocateChildBudget(requestedBudgetMs: number, childName: string): number {
    const remaining = this.getRemainingBudgetMs();
    if (remaining <= 0) {
      throw new AppError({
        code: "DEADLINE_EXCEEDED",
        category: ErrorCategory.TIMEOUT,
        message: `Execution deadline exceeded before starting child operation '${childName}'. Remaining budget is 0ms.`,
        userFacingMessage: "The task exceeded its total execution time budget.",
      });
    }

    return Math.min(requestedBudgetMs, remaining);
  }
}

/**
 * Wraps a promise with an enforced timeout.
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operationName: string,
  provider?: string,
  isExternalSideEffect?: boolean
): Promise<T> {
  let timer: NodeJS.Timeout | null = null;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(
        new AppError({
          code: "OPERATION_TIMED_OUT",
          category: ErrorCategory.TIMEOUT,
          message: `Operation '${operationName}' timed out after ${timeoutMs}ms.`,
          userFacingMessage: `The operation '${operationName}' did not complete within ${timeoutMs / 1000}s.`,
          provider,
          isExternalSideEffect,
        })
      );
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    return result;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
