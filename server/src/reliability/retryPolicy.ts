/**
 * AI Workforce Platform — Phase 19: Centralized Retry Policy & Budget Hierarchy
 *
 * Enforces unified retry classification, bounded exponential backoff with jitter,
 * and global retry budgets to eliminate retry multiplication (Job x Step x Tool explosion).
 */

import {
  ErrorCategory,
  RetryClassification,
  normalizeError,
  AppError,
} from "./failureTaxonomy";

export interface RetryBudgetConfig {
  maxJobAttempts: number;      // Maximum worker job level attempts (default: 3)
  maxStepRetries: number;      // Maximum agent step replans/retries (default: 2)
  maxToolRetries: number;      // Maximum inline tool execution retries (default: 2)
  maxTotalRetries: number;     // Absolute ceiling across all layers per task (default: 5)
  baseBackoffMs: number;       // Base delay in milliseconds (default: 1000)
  maxBackoffMs: number;        // Maximum delay ceiling (default: 30000)
  jitterMaxMs: number;         // Random jitter range (default: 500)
}

export const DEFAULT_RETRY_BUDGET: RetryBudgetConfig = {
  maxJobAttempts: 3,
  maxStepRetries: 2,
  maxToolRetries: 2,
  maxTotalRetries: 5,
  baseBackoffMs: 1000,
  maxBackoffMs: 30000,
  jitterMaxMs: 500,
};

export class RetryPolicy {
  private static instance: RetryPolicy;
  private readonly config: RetryBudgetConfig;

  constructor(customConfig?: Partial<RetryBudgetConfig>) {
    this.config = {
      ...DEFAULT_RETRY_BUDGET,
      ...customConfig,
    };
  }

  public static getInstance(): RetryPolicy {
    if (!RetryPolicy.instance) {
      RetryPolicy.instance = new RetryPolicy();
    }
    return RetryPolicy.instance;
  }

  public getConfig(): RetryBudgetConfig {
    return { ...this.config };
  }

  /**
   * Classifies an error into RETRYABLE, NON_RETRYABLE, or UNKNOWN.
   */
  public classify(error: unknown, isExternalSideEffect?: boolean): RetryClassification {
    const normalized = normalizeError(error, ErrorCategory.UNKNOWN_ERROR, {
      isExternalSideEffect,
    });
    return normalized.classification;
  }

  /**
   * Checks whether an error is safe and valid to retry.
   * Special rule: UNKNOWN classification on external side effects is NOT automatically retryable!
   */
  public isRetryable(error: unknown, isExternalSideEffect?: boolean): boolean {
    const classification = this.classify(error, isExternalSideEffect);

    if (isExternalSideEffect && classification === RetryClassification.UNKNOWN) {
      // Must NOT blindly retry unknown external side effects to avoid duplicate emails/calls!
      return false;
    }

    return classification === RetryClassification.RETRYABLE;
  }

  /**
   * Calculates exponential backoff with bounded jitter.
   * Formula: min(baseDelay * 2^(attempt - 1), maxDelay) + randomJitter
   */
  public getBackoffDelay(attempt: number, customConfig?: Partial<RetryBudgetConfig>): number {
    const base = customConfig?.baseBackoffMs ?? this.config.baseBackoffMs;
    const max = customConfig?.maxBackoffMs ?? this.config.maxBackoffMs;
    const jitterMax = customConfig?.jitterMaxMs ?? this.config.jitterMaxMs;

    const exponent = Math.max(0, attempt - 1);
    const exponential = base * Math.pow(2, exponent);
    const backoff = Math.min(exponential, max);
    const jitter = Math.floor(Math.random() * jitterMax);

    return Math.round(backoff + jitter);
  }

  /**
   * Evaluates if a layer can proceed with retry against its budget and total task budget.
   */
  public canRetry(params: {
    currentAttempt: number;
    maxAttempts: number;
    totalRetriesSoFar?: number;
    maxTotalRetries?: number;
  }): boolean {
    const { currentAttempt, maxAttempts, totalRetriesSoFar, maxTotalRetries } = params;

    // Layer-level attempt ceiling
    if (currentAttempt >= maxAttempts) {
      return false;
    }

    // Task-level total retry budget ceiling
    if (typeof totalRetriesSoFar === "number") {
      const totalBudget = maxTotalRetries ?? this.config.maxTotalRetries;
      if (totalRetriesSoFar >= totalBudget) {
        return false;
      }
    }

    return true;
  }
}

export const retryPolicy = RetryPolicy.getInstance();
