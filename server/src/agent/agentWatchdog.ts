/**
 * Phase 15 — Agent Watchdog System & Infinite Loop Protection
 *
 * Enforces host-controlled boundaries:
 * 1. Cycle watchdog (max iterations before forced termination).
 * 2. Tool calls watchdog (max tool executions).
 * 3. Wall-clock execution time watchdog.
 * 4. Step retry bounds.
 * 5. Replan bounds.
 * 6. Infinite Loop Detector: Trips if the model executes identical tool calls consecutively without progress.
 */

import crypto from "crypto";
import { AgentWatchdogLimits } from "./agentTypes";

export class WatchdogTrippedError extends Error {
  public watchdog: string;
  public limitName: string;
  public limit: number;
  public current: number;

  constructor(watchdog: string, limit: number, current: number, message?: string) {
    super(
      message ||
        `Watchdog '${watchdog}' tripped: Limit of ${limit} exceeded (current value: ${current}). Execution halted.`
    );
    this.name = "WatchdogTrippedError";
    this.watchdog = watchdog;
    this.limitName = watchdog;
    this.limit = limit;
    this.current = current;
  }
}

export const DEFAULT_WATCHDOG_LIMITS: AgentWatchdogLimits = {
  maxCycles: 15,
  maxToolCalls: 10,
  maxStepRetries: 2,
  maxReplans: 2,
  maxExecutionTimeMs: 180000, // 3 minutes
  maxConsecutiveIdenticalCalls: 3,
};

export class AgentWatchdog {
  private limits: AgentWatchdogLimits;
  private startTime: number;
  private cyclesCount = 0;
  private toolCallsCount = 0;
  private replansCount = 0;
  private stepRetries = new Map<string, number>();
  private recentToolSignatures: string[] = [];

  constructor(limits: Partial<AgentWatchdogLimits> = {}) {
    this.limits = { ...DEFAULT_WATCHDOG_LIMITS, ...limits };
    this.startTime = Date.now();
  }

  /**
   * Checks wall-clock time against max execution duration.
   */
  public checkExecutionTime(): void {
    const elapsedMs = Date.now() - this.startTime;
    if (elapsedMs > this.limits.maxExecutionTimeMs) {
      throw new WatchdogTrippedError(
        "MAX_EXECUTION_TIME_MS",
        this.limits.maxExecutionTimeMs,
        elapsedMs,
        `Execution time watchdog tripped: Wall-clock limit of ${this.limits.maxExecutionTimeMs}ms exceeded (${elapsedMs}ms elapsed).`
      );
    }
  }

  /**
   * Alias for recordCycle.
   */
  public tickCycle(): number {
    return this.recordCycle();
  }

  /**
   * Increments and checks agent control cycle iterations.
   */
  public recordCycle(): number {
    this.checkExecutionTime();
    this.cyclesCount++;
    if (this.cyclesCount > this.limits.maxCycles) {
      throw new WatchdogTrippedError(
        "MAX_AGENT_CYCLES",
        this.limits.maxCycles,
        this.cyclesCount,
        `Cycle watchdog tripped: Maximum allowed cycles (${this.limits.maxCycles}) exceeded.`
      );
    }
    return this.cyclesCount;
  }

  /**
   * Computes a deterministic hash of a tool call and its arguments.
   */
  private computeToolSignature(tool: string, args: Record<string, unknown>): string {
    const raw = `${tool}:${JSON.stringify(args, Object.keys(args).sort())}`;
    return crypto.createHash("sha256").update(raw).digest("hex");
  }

  /**
   * Increments tool call count and checks for infinite repeating tool loops.
   */
  public recordToolCall(tool: string, args: Record<string, unknown>): number {
    this.checkExecutionTime();
    this.toolCallsCount++;

    if (this.toolCallsCount > this.limits.maxToolCalls) {
      throw new WatchdogTrippedError(
        "MAX_TOOL_CALLS",
        this.limits.maxToolCalls,
        this.toolCallsCount,
        `Tool watchdog tripped: Maximum allowed tool calls (${this.limits.maxToolCalls}) exceeded.`
      );
    }

    // Infinite Loop Detection: Detect repeated consecutive identical tool calls
    const signature = this.computeToolSignature(tool, args);
    this.recentToolSignatures.push(signature);

    if (this.recentToolSignatures.length >= this.limits.maxConsecutiveIdenticalCalls) {
      const window = this.recentToolSignatures.slice(-this.limits.maxConsecutiveIdenticalCalls);
      const allIdentical = window.every((sig) => sig === signature);

      if (allIdentical) {
        throw new WatchdogTrippedError(
          "INFINITE_LOOP_PROTECTION",
          this.limits.maxConsecutiveIdenticalCalls,
          this.limits.maxConsecutiveIdenticalCalls,
          `Infinite loop detected: Model performed ${this.limits.maxConsecutiveIdenticalCalls} consecutive identical calls to tool '${tool}' with identical arguments.`
        );
      }
    }

    return this.toolCallsCount;
  }

  /**
   * Checks if an individual step can be retried.
   */
  public canRetryStep(stepId: string): boolean {
    const currentRetries = this.stepRetries.get(stepId) || 0;
    return currentRetries < this.limits.maxStepRetries;
  }

  /**
   * Records a retry for a step. Trips watchdog if limit exceeded.
   */
  public recordStepRetry(stepId: string): number {
    const currentRetries = (this.stepRetries.get(stepId) || 0) + 1;
    this.stepRetries.set(stepId, currentRetries);

    if (currentRetries > this.limits.maxStepRetries) {
      throw new WatchdogTrippedError(
        "MAX_STEP_RETRIES",
        this.limits.maxStepRetries,
        currentRetries,
        `Step retry watchdog tripped: Step '${stepId}' exceeded maximum allowed retries (${this.limits.maxStepRetries}).`
      );
    }
    return currentRetries;
  }

  /**
   * Checks if the agent can perform replanning.
   */
  public canReplan(): boolean {
    return this.replansCount < this.limits.maxReplans;
  }

  /**
   * Records a replanning event. Trips watchdog if limit exceeded.
   */
  public recordReplan(): number {
    this.replansCount++;
    if (this.replansCount > this.limits.maxReplans) {
      throw new WatchdogTrippedError(
        "MAX_REPLANS",
        this.limits.maxReplans,
        this.replansCount,
        `Replanning watchdog tripped: Maximum allowed replanning attempts (${this.limits.maxReplans}) exceeded.`
      );
    }
    return this.replansCount;
  }

  public getStats() {
    return {
      cycles: this.cyclesCount,
      toolCalls: this.toolCallsCount,
      replans: this.replansCount,
      elapsedMs: Date.now() - this.startTime,
    };
  }
}
