export interface AgentExecutionTrace {
  taskId: string;
  plan: string[];
  toolCalls: Array<{
    toolName: string;
    arguments: Record<string, unknown>;
    status: "success" | "error";
  }>;
  cycles: number;
  durationMs: number;
  finalStatus: "COMPLETED" | "WAITING_FOR_APPROVAL" | "FAILED";
}

export interface AgentEfficiencyMetrics {
  requiredToolCalls: number;
  actualToolCalls: number;
  unnecessaryToolCalls: number;
  efficiencyRatio: number; // required / actual (max 1.0)
  withinCeiling: boolean;
  planningScore: number;
}

export const WATCHDOG_LIMITS = {
  MAX_CYCLES: 10,
  MAX_TOOL_CALLS: 15,
  MAX_EXECUTION_TIME_MS: 30000,
};

export class AgentEvaluator {
  /**
   * Evaluates the planning and tool usage efficiency of an agent trace.
   */
  public static evaluateTrace(
    trace: AgentExecutionTrace,
    expectedTools: string[],
    disallowedTools: string[] = []
  ): AgentEfficiencyMetrics {
    const actualToolCalls = trace.toolCalls.length;
    const requiredToolCalls = expectedTools.length;

    let matchedRequired = 0;
    let unnecessaryCount = 0;

    for (const call of trace.toolCalls) {
      if (disallowedTools.includes(call.toolName)) {
        unnecessaryCount += 2; // severe penalty for invoking disallowed tools
      } else if (expectedTools.includes(call.toolName)) {
        matchedRequired++;
      } else {
        unnecessaryCount++;
      }
    }

    const efficiencyRatio =
      actualToolCalls > 0 ? Number(Math.min(1.0, requiredToolCalls / actualToolCalls).toFixed(2)) : 0;

    const planningScore =
      trace.plan.length > 0 && matchedRequired >= requiredToolCalls
        ? 1.0
        : Number((matchedRequired / Math.max(1, requiredToolCalls)).toFixed(2));

    const withinCeiling =
      trace.cycles <= WATCHDOG_LIMITS.MAX_CYCLES &&
      trace.toolCalls.length <= WATCHDOG_LIMITS.MAX_TOOL_CALLS &&
      trace.durationMs <= WATCHDOG_LIMITS.MAX_EXECUTION_TIME_MS;

    return {
      requiredToolCalls,
      actualToolCalls,
      unnecessaryToolCalls: unnecessaryCount,
      efficiencyRatio,
      withinCeiling,
      planningScore,
    };
  }

  /**
   * Enforces runaway limits: checks whether cycle, tool call count, or duration exceeds hard limits.
   */
  public static checkRunawayProtection(cycles: number, toolCalls: number, durationMs: number): {
    safe: boolean;
    violation?: string;
  } {
    if (cycles > WATCHDOG_LIMITS.MAX_CYCLES) {
      return { safe: false, violation: `Cycles (${cycles}) exceeded limit of ${WATCHDOG_LIMITS.MAX_CYCLES}` };
    }
    if (toolCalls > WATCHDOG_LIMITS.MAX_TOOL_CALLS) {
      return { safe: false, violation: `Tool calls (${toolCalls}) exceeded limit of ${WATCHDOG_LIMITS.MAX_TOOL_CALLS}` };
    }
    if (durationMs > WATCHDOG_LIMITS.MAX_EXECUTION_TIME_MS) {
      return { safe: false, violation: `Execution duration (${durationMs}ms) exceeded timeout ceiling` };
    }
    return { safe: true };
  }
}
