/**
 * AI Workforce Platform — Phase 19: Central Failure Taxonomy & Error Normalization
 *
 * Implements authoritative error classification, retry categorization, and sanitized
 * user-facing error mapping to prevent internal infrastructure/credential leakage.
 */

export enum ErrorCategory {
  VALIDATION_ERROR = "VALIDATION_ERROR",
  AUTHORIZATION_ERROR = "AUTHORIZATION_ERROR",
  POLICY_ERROR = "POLICY_ERROR",
  NOT_FOUND = "NOT_FOUND",
  CONFLICT = "CONFLICT",
  TIMEOUT = "TIMEOUT",
  RATE_LIMITED = "RATE_LIMITED",
  NETWORK_ERROR = "NETWORK_ERROR",
  PROVIDER_ERROR = "PROVIDER_ERROR",
  DATABASE_ERROR = "DATABASE_ERROR",
  QUEUE_ERROR = "QUEUE_ERROR",
  LLM_ERROR = "LLM_ERROR",
  TOOL_ERROR = "TOOL_ERROR",
  APPROVAL_ERROR = "APPROVAL_ERROR",
  CANCELLATION = "CANCELLATION",
  UNKNOWN_ERROR = "UNKNOWN_ERROR",
}

export enum RetryClassification {
  RETRYABLE = "RETRYABLE",
  NON_RETRYABLE = "NON_RETRYABLE",
  UNKNOWN = "UNKNOWN",
}

export interface AppErrorOptions {
  code: string;
  category: ErrorCategory;
  classification?: RetryClassification;
  message: string;
  userFacingMessage?: string;
  provider?: string;
  isExternalSideEffect?: boolean;
  statusCode?: number;
  details?: Record<string, unknown>;
  cause?: unknown;
}

export class AppError extends Error {
  public readonly code: string;
  public readonly category: ErrorCategory;
  public readonly classification: RetryClassification;
  public readonly userFacingMessage: string;
  public readonly provider?: string;
  public readonly isExternalSideEffect: boolean;
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown>;

  constructor(options: AppErrorOptions) {
    super(options.message);
    this.name = "AppError";
    this.code = options.code;
    this.category = options.category;
    this.classification =
      options.classification ||
      getDefaultClassificationForCategory(options.category);
    this.provider = options.provider;
    this.isExternalSideEffect = options.isExternalSideEffect || false;
    this.statusCode = options.statusCode || getDefaultStatusCode(options.category);
    this.details = options.details;
    this.userFacingMessage =
      options.userFacingMessage ||
      getDefaultUserFacingMessage(options.category, options.code);

    if (options.cause) {
      this.cause = options.cause;
    }
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

/**
 * Maps category to default retry classification.
 */
function getDefaultClassificationForCategory(
  category: ErrorCategory
): RetryClassification {
  switch (category) {
    case ErrorCategory.TIMEOUT:
    case ErrorCategory.NETWORK_ERROR:
    case ErrorCategory.RATE_LIMITED:
      return RetryClassification.RETRYABLE;

    case ErrorCategory.PROVIDER_ERROR:
    case ErrorCategory.LLM_ERROR:
    case ErrorCategory.DATABASE_ERROR:
    case ErrorCategory.QUEUE_ERROR:
      return RetryClassification.RETRYABLE;

    case ErrorCategory.VALIDATION_ERROR:
    case ErrorCategory.AUTHORIZATION_ERROR:
    case ErrorCategory.POLICY_ERROR:
    case ErrorCategory.NOT_FOUND:
    case ErrorCategory.CONFLICT:
    case ErrorCategory.APPROVAL_ERROR:
    case ErrorCategory.CANCELLATION:
      return RetryClassification.NON_RETRYABLE;

    case ErrorCategory.TOOL_ERROR:
    case ErrorCategory.UNKNOWN_ERROR:
    default:
      return RetryClassification.UNKNOWN;
  }
}

/**
 * Maps category to appropriate HTTP status code.
 */
function getDefaultStatusCode(category: ErrorCategory): number {
  switch (category) {
    case ErrorCategory.VALIDATION_ERROR:
      return 400;
    case ErrorCategory.AUTHORIZATION_ERROR:
      return 403;
    case ErrorCategory.NOT_FOUND:
      return 404;
    case ErrorCategory.CONFLICT:
      return 409;
    case ErrorCategory.RATE_LIMITED:
      return 429;
    case ErrorCategory.TIMEOUT:
      return 504;
    case ErrorCategory.POLICY_ERROR:
      return 422;
    default:
      return 500;
  }
}

/**
 * Returns safe, sanitized user-facing error message without internal stack traces or secrets.
 */
function getDefaultUserFacingMessage(
  category: ErrorCategory,
  code: string
): string {
  switch (category) {
    case ErrorCategory.TIMEOUT:
      return "The requested operation timed out. Please try again or inspect task status.";
    case ErrorCategory.RATE_LIMITED:
      return "Service request rate limit exceeded. The system will retry with backoff.";
    case ErrorCategory.NETWORK_ERROR:
    case ErrorCategory.PROVIDER_ERROR:
      return "An external provider encountered a temporary issue. The task is queued for recovery.";
    case ErrorCategory.AUTHORIZATION_ERROR:
      return "Access denied: You do not have permission to perform this action.";
    case ErrorCategory.POLICY_ERROR:
      return "Operation blocked by organization governance policy.";
    case ErrorCategory.APPROVAL_ERROR:
      return "Human approval was rejected, expired, or unavailable.";
    case ErrorCategory.CANCELLATION:
      return "Task execution was cancelled.";
    default:
      return "An error occurred during execution. Please check task details.";
  }
}

/**
 * Authoritative Error Normalizer:
 * Converts arbitrary caught errors (Axios errors, MySQL errors, Redis errors, LLM errors)
 * into strongly-typed AppErrors.
 */
export function normalizeError(
  err: unknown,
  defaultCategory: ErrorCategory = ErrorCategory.UNKNOWN_ERROR,
  context?: { provider?: string; isExternalSideEffect?: boolean }
): AppError {
  if (err instanceof AppError) {
    return err;
  }

  const raw = err as any;
  const message = raw?.message || String(err || "Unknown error");
  const code = raw?.code || "INTERNAL_ERROR";

  // 1. Timeout patterns
  if (
    message.toLowerCase().includes("timeout") ||
    message.toLowerCase().includes("timed out") ||
    message.includes("ETIMEDOUT") ||
    message.includes("ESOCKETTIMEDOUT") ||
    code === "ETIMEDOUT" ||
    code === "ESOCKETTIMEDOUT" ||
    code === "LLM_TIMEOUT" ||
    code === "TOOL_TIMEOUT" ||
    code === "OPERATION_TIMED_OUT"
  ) {
    return new AppError({
      code: code.startsWith("TIMEOUT") ? code : "TIMEOUT_ERROR",
      category: ErrorCategory.TIMEOUT,
      classification: context?.isExternalSideEffect
        ? RetryClassification.UNKNOWN // Special handling: never blindly resend external side effects!
        : RetryClassification.RETRYABLE,
      message,
      provider: context?.provider || raw?.provider,
      isExternalSideEffect: context?.isExternalSideEffect,
      userFacingMessage: context?.isExternalSideEffect
        ? "The action did not confirm delivery within the timeout window. Verification is required before retrying."
        : "The external service timed out. The operation will be safely retried.",
      cause: err,
    });
  }

  // 2. Rate limiting patterns
  if (
    raw?.status === 429 ||
    raw?.statusCode === 429 ||
    code === "RATE_LIMIT_EXCEEDED" ||
    message.includes("rate limit") ||
    message.includes("429")
  ) {
    return new AppError({
      code: "RATE_LIMITED",
      category: ErrorCategory.RATE_LIMITED,
      classification: RetryClassification.RETRYABLE,
      message,
      provider: context?.provider || raw?.provider,
      userFacingMessage: "External service rate limit encountered. Backoff scheduling active.",
      cause: err,
    });
  }

  // 3. Network connection issues
  if (
    code === "ECONNRESET" ||
    code === "ECONNREFUSED" ||
    code === "ENOTFOUND" ||
    code === "EAI_AGAIN"
  ) {
    return new AppError({
      code: `NETWORK_${code}`,
      category: ErrorCategory.NETWORK_ERROR,
      classification: context?.isExternalSideEffect
        ? RetryClassification.UNKNOWN
        : RetryClassification.RETRYABLE,
      message,
      provider: context?.provider,
      isExternalSideEffect: context?.isExternalSideEffect,
      cause: err,
    });
  }

  // 4. Database Deadlocks / Connection Drops (Retryable) vs Syntax / Constraint (Non-retryable)
  if (code === "ER_LOCK_DEADLOCK" || code === "ER_LOCK_WAIT_TIMEOUT") {
    return new AppError({
      code: "DB_DEADLOCK",
      category: ErrorCategory.DATABASE_ERROR,
      classification: RetryClassification.RETRYABLE,
      message: "Database transaction deadlock encountered.",
      cause: err,
    });
  }

  if (code.startsWith("ER_") || code === "PROTOCOL_CONNECTION_LOST") {
    const isConnLoss = code === "PROTOCOL_CONNECTION_LOST";
    return new AppError({
      code: `DB_${code}`,
      category: ErrorCategory.DATABASE_ERROR,
      classification: isConnLoss
        ? RetryClassification.RETRYABLE
        : RetryClassification.NON_RETRYABLE,
      message,
      userFacingMessage: "A database error occurred.",
      cause: err,
    });
  }

  // 5. Auth / Permission violations
  if (
    code === "UNAUTHORIZED" ||
    code === "FORBIDDEN" ||
    code === "TENANT_MISMATCH" ||
    raw?.status === 401 ||
    raw?.status === 403
  ) {
    return new AppError({
      code: code || "AUTH_ERROR",
      category: ErrorCategory.AUTHORIZATION_ERROR,
      classification: RetryClassification.NON_RETRYABLE,
      message,
      statusCode: raw?.status || 403,
      cause: err,
    });
  }

  // 6. Policy violations
  if (code === "POLICY_VIOLATION" || code === "APPROVAL_REQUIRED") {
    return new AppError({
      code,
      category: ErrorCategory.POLICY_ERROR,
      classification: RetryClassification.NON_RETRYABLE,
      message,
      cause: err,
    });
  }

  // Default fallback
  return new AppError({
    code: code || "UNKNOWN_ERROR",
    category: defaultCategory,
    classification: getDefaultClassificationForCategory(defaultCategory),
    message,
    provider: context?.provider,
    isExternalSideEffect: context?.isExternalSideEffect,
    cause: err,
  });
}
