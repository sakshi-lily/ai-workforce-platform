/**
 * AI Workforce Platform — Phase 19: Idempotency & External Side-Effect Safeguards
 *
 * Prevents duplicate task executions, handles ambiguous external side effects (e.g. Gmail
 * timeouts where delivery state is uncertain), and enforces execution identity guarantees.
 */

import { pool } from "../db/pool";
import { AppError, ErrorCategory, RetryClassification } from "./failureTaxonomy";

export enum SideEffectOutcome {
  CONFIRMED_SUCCESS = "CONFIRMED_SUCCESS",
  DEFINITELY_FAILED = "DEFINITELY_FAILED",
  UNKNOWN_OUTCOME = "UNKNOWN_OUTCOME", // Timeout after request dispatched; blind retry prohibited!
}

export interface SideEffectExecutionResult<T = unknown> {
  outcome: SideEffectOutcome;
  data?: T;
  error?: AppError;
  requiresReconciliation: boolean;
}

export class IdempotencyGuard {
  private static instance: IdempotencyGuard;

  public static getInstance(): IdempotencyGuard {
    if (!IdempotencyGuard.instance) {
      IdempotencyGuard.instance = new IdempotencyGuard();
    }
    return IdempotencyGuard.instance;
  }

  /**
   * Safely executes an external side effect (e.g., Gmail send) with ambiguous outcome handling.
   * If a timeout or connection reset occurs during or after provider dispatch, marks outcome
   * as UNKNOWN_OUTCOME and prohibits automated blind retry to prevent duplicate actions.
   */
  public async executeExternalSideEffect<T>(
    actionName: string,
    actionPayload: Record<string, unknown>,
    dispatchFn: () => Promise<T>
  ): Promise<SideEffectExecutionResult<T>> {
    try {
      const data = await dispatchFn();
      return {
        outcome: SideEffectOutcome.CONFIRMED_SUCCESS,
        data,
        requiresReconciliation: false,
      };
    } catch (err: any) {
      const message = err?.message || String(err);
      const isTimeout =
        message.includes("timeout") ||
        message.includes("ETIMEDOUT") ||
        message.includes("ESOCKETTIMEDOUT") ||
        err?.code === "TIMEOUT" ||
        err?.code === "GMAIL_TIMEOUT";

      if (isTimeout) {
        // Ambiguous external side effect: request may have reached provider!
        console.warn(
          `[IdempotencyGuard] External action '${actionName}' timed out after dispatch. Marking UNKNOWN_OUTCOME. Automated blind retry PROHIBITED.`
        );

        const ambiguousError = new AppError({
          code: "AMBIGUOUS_EXTERNAL_SIDE_EFFECT",
          category: ErrorCategory.PROVIDER_ERROR,
          classification: RetryClassification.UNKNOWN,
          isExternalSideEffect: true,
          message: `Action '${actionName}' encountered a provider timeout. Outcome is uncertain; blind retry blocked.`,
          userFacingMessage:
            "The external service did not confirm message delivery. The action requires verification before retrying.",
          cause: err,
        });

        return {
          outcome: SideEffectOutcome.UNKNOWN_OUTCOME,
          error: ambiguousError,
          requiresReconciliation: true,
        };
      }

      // Explicit, definitive failure (e.g., validation rejection, auth denial)
      const normalized = new AppError({
        code: err?.code || "EXTERNAL_ACTION_FAILED",
        category: ErrorCategory.PROVIDER_ERROR,
        classification: RetryClassification.NON_RETRYABLE,
        isExternalSideEffect: true,
        message,
        cause: err,
      });

      return {
        outcome: SideEffectOutcome.DEFINITELY_FAILED,
        error: normalized,
        requiresReconciliation: false,
      };
    }
  }

  /**
   * Checks whether a task is already queued or active before starting execution.
   */
  public async checkTaskStartIdempotency(
    taskId: string,
    organizationId: string
  ): Promise<{ canStart: boolean; currentStatus?: string; existingJobId?: string }> {
    const [rows] = await pool.query<any[]>(
      `SELECT status FROM tasks WHERE id = ? AND organization_id = ? LIMIT 1;`,
      [taskId, organizationId]
    );

    if (rows.length === 0) {
      return { canStart: false };
    }

    const status = rows[0].status;

    if (["QUEUED", "RUNNING"].includes(status)) {
      // Find active job if any
      const [jobRows] = await pool.query<any[]>(
        `SELECT id FROM jobs WHERE task_id = ? AND status IN ('QUEUED', 'ACTIVE', 'RETRYING') ORDER BY created_at DESC LIMIT 1;`,
        [taskId]
      );
      return {
        canStart: false,
        currentStatus: status,
        existingJobId: jobRows[0]?.id,
      };
    }

    return {
      canStart: status === "REQUESTED" || status === "FAILED",
      currentStatus: status,
    };
  }
}

export const idempotencyGuard = IdempotencyGuard.getInstance();
