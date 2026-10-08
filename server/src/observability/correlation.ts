import { Request, Response, NextFunction } from "express";
import crypto from "crypto";

export interface CorrelationContext {
  requestId: string;
  correlationId: string;
  taskId?: string;
  executionId?: string;
  stepId?: string;
  toolExecutionId?: string;
  jobId?: string;
}

export class CorrelationManager {
  private static activeContexts = new Map<string, CorrelationContext>();

  public static generateId(prefix: string = "req"): string {
    return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
  }

  public static createContext(init?: Partial<CorrelationContext>): CorrelationContext {
    const requestId = init?.requestId || this.generateId("req");
    const correlationId = init?.correlationId || requestId;
    const ctx: CorrelationContext = {
      requestId,
      correlationId,
      taskId: init?.taskId,
      executionId: init?.executionId,
      stepId: init?.stepId,
      toolExecutionId: init?.toolExecutionId,
      jobId: init?.jobId,
    };
    this.activeContexts.set(requestId, ctx);
    return ctx;
  }

  public static getContext(requestId: string): CorrelationContext | undefined {
    return this.activeContexts.get(requestId);
  }

  public static removeContext(requestId: string): void {
    this.activeContexts.delete(requestId);
  }
}

/**
 * Express middleware to propagate and inject correlation identifiers
 */
export function correlationMiddleware(req: Request, res: Response, next: NextFunction): void {
  const reqIdHeader = (req.headers["x-request-id"] as string) || (req.headers["x-correlation-id"] as string);
  const context = CorrelationManager.createContext({
    requestId: reqIdHeader || CorrelationManager.generateId("req"),
    taskId: req.headers["x-task-id"] as string | undefined,
  });

  res.setHeader("x-request-id", context.requestId);
  res.setHeader("x-correlation-id", context.correlationId);

  // Attach to request
  (req as any).correlation = context;

  res.on("finish", () => {
    CorrelationManager.removeContext(context.requestId);
  });

  next();
}
