import { AGENT_CONFIG } from "./agentConfig";
import {
  AgentExecutionResponse,
  AgentLifecycleState,
  AgentPlan,
  AgentPlanSchema,
  CreateAgentTaskInput,
} from "./agentSchemas";
import { createTask, updateTaskState, persistTaskSteps, getTaskById } from "../services/taskService";
import { generateStructured } from "../llm/service";
import { recordAITelemetry } from "../services/aiService";

/**
 * Authoritative Planning Agent System Instruction
 * Preserves strict trust boundaries: Planning only, no unauthorized external side effects.
 */
const AGENT_SYSTEM_PROMPT = `
You are the Planning Agent inside the AI Workforce Platform.
Your purpose is to analyze the user's high-level task and propose a structured execution plan.

STRICT OPERATIONAL RULES:
1. You do not execute real-world tools yet (Phase 7 is purely planning).
2. You do not claim that external actions have been performed.
3. You do not connect to external databases or send emails.
4. You only produce a structured, actionable plan broken into 1 to 10 logical steps.
5. Each step must have an 'order' (positive integer starting at 1) and a clear 'description'.
`;

/**
 * Validates whether a state transition is legal according to the application state machine.
 */
export function isValidStateTransition(
  fromState: AgentLifecycleState,
  toState: AgentLifecycleState
): boolean {
  const allowedTransitions: Record<AgentLifecycleState, AgentLifecycleState[]> = {
    REQUESTED: ["RUNNING", "FAILED", "CANCELLED"],
    RUNNING: ["LLM_CALL", "FAILED", "CANCELLED"],
    LLM_CALL: ["VALIDATING", "FAILED", "CANCELLED"],
    VALIDATING: ["COMPLETED", "FAILED", "CANCELLED"],
    COMPLETED: [], // Terminal
    FAILED: [], // Terminal
    CANCELLED: [], // Terminal
  };

  return allowedTransitions[fromState]?.includes(toState) ?? false;
}

/**
 * Executes a simple agent planning task under strict host control.
 *
 * Lifecycle:
 * REQUESTED -> RUNNING -> LLM_CALL -> VALIDATING -> COMPLETED (or FAILED)
 */
export async function executeAgentTask(
  input: CreateAgentTaskInput
): Promise<AgentExecutionResponse> {
  const startTime = Date.now();
  const timeline: { state: AgentLifecycleState; timestamp: string; details?: string }[] = [];

  // Helper to record timeline event
  const logState = (state: AgentLifecycleState, details?: string) => {
    timeline.push({
      state,
      timestamp: new Date().toISOString(),
      details,
    });
  };

  // 1. Input Validation
  const prompt = input.task?.trim();
  if (!prompt || prompt.length < AGENT_CONFIG.MIN_PROMPT_LENGTH) {
    throw new Error(
      `Task description must be at least ${AGENT_CONFIG.MIN_PROMPT_LENGTH} characters long.`
    );
  }
  if (prompt.length > AGENT_CONFIG.MAX_PROMPT_LENGTH) {
    throw new Error(
      `Task description exceeds maximum allowed length of ${AGENT_CONFIG.MAX_PROMPT_LENGTH} characters.`
    );
  }

  // 2. State: REQUESTED - Create task durably in MySQL
  let currentState: AgentLifecycleState = "REQUESTED";
  logState("REQUESTED", "Task registered in database with initial status REQUESTED.");

  const task = await createTask({
    prompt,
    title: input.title,
    userId: input.userId || AGENT_CONFIG.DEFAULT_USER_ID,
    priority: input.priority || "NORMAL",
  });

  let cycle = 1;

  try {
    // 3. State: RUNNING - Host accepts and begins execution
    if (!isValidStateTransition(currentState, "RUNNING")) {
      throw new Error(`Invalid transition from ${currentState} to RUNNING`);
    }
    currentState = "RUNNING";
    logState("RUNNING", "Agent Host accepted task. Execution cycle started.");
    await updateTaskState(task.id, "RUNNING", { startedAt: true });

    // 4. Host Watchdogs Check
    if (cycle > AGENT_CONFIG.MAX_CYCLES) {
      throw new Error(`Cycle watchdog tripped: Maximum allowed cycles (${AGENT_CONFIG.MAX_CYCLES}) exceeded.`);
    }

    const elapsedSoFar = Date.now() - startTime;
    if (elapsedSoFar > AGENT_CONFIG.MAX_EXECUTION_TIME_MS) {
      throw new Error(`Time watchdog tripped: Execution time exceeded ${AGENT_CONFIG.MAX_EXECUTION_TIME_MS}ms.`);
    }

    // 5. State: LLM_CALL - Reason about the task using Phase 6 LLM Service
    if (!isValidStateTransition(currentState, "LLM_CALL")) {
      throw new Error(`Invalid transition from ${currentState} to LLM_CALL`);
    }
    currentState = "LLM_CALL";
    logState("LLM_CALL", `Invoking LLM for structured reasoning (Cycle ${cycle}).`);

    const planningPrompt = `
Analyze the following user instruction and propose a structured execution plan:
"${prompt}"

Produce a high-level goal, an architectural summary, and a sequence of discrete planned steps.
`;

    const llmResult = await generateStructured<AgentPlan>(
      planningPrompt,
      AgentPlanSchema,
      AGENT_SYSTEM_PROMPT
    );

    // 6. State: VALIDATING - Runtime Zod verification
    if (!isValidStateTransition(currentState, "VALIDATING")) {
      throw new Error(`Invalid transition from ${currentState} to VALIDATING`);
    }
    currentState = "VALIDATING";
    logState("VALIDATING", `Plan schema verified via Zod: ${llmResult.data.steps.length} steps generated.`);

    const plan = llmResult.data;

    // 7. Persist Task Steps in MySQL `task_steps`
    const persistedSteps = await persistTaskSteps(task.id, plan.steps);

    // 8. Persist Telemetry linked to task_id
    await recordAITelemetry(llmResult.telemetry, "structured", task.id);

    // 9. State: COMPLETED - Host concludes the task
    if (!isValidStateTransition(currentState, "COMPLETED")) {
      throw new Error(`Invalid transition from ${currentState} to COMPLETED`);
    }
    currentState = "COMPLETED";
    logState("COMPLETED", "Task execution finished and all planned steps durably persisted.");

    await updateTaskState(task.id, "COMPLETED", {
      completedAt: true,
      finalReport: JSON.stringify(plan),
      promptTokens: llmResult.telemetry.inputTokens,
      completionTokens: llmResult.telemetry.outputTokens,
      totalCostUsd: llmResult.telemetry.estimatedCostUsd,
    });

    const totalLatency = Date.now() - startTime;

    return {
      taskId: task.id,
      status: "COMPLETED",
      cycles: cycle,
      latencyMs: totalLatency,
      plan,
      steps: persistedSteps,
      telemetry: {
        model: llmResult.telemetry.model,
        totalTokens: llmResult.telemetry.totalTokens,
        estimatedCostUsd: llmResult.telemetry.estimatedCostUsd,
      },
      timeline,
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown agent execution failure";

    // Host enforces terminal FAILED state
    logState("FAILED", `Execution halted: ${errorMessage}`);
    await updateTaskState(task.id, "FAILED", {
      completedAt: true,
      errorMessage,
    });

    const totalLatency = Date.now() - startTime;

    return {
      taskId: task.id,
      status: "FAILED",
      cycles: cycle,
      latencyMs: totalLatency,
      plan: null,
      steps: [],
      telemetry: null,
      timeline,
      error: errorMessage,
    };
  }
}

/**
 * Retrieves an agent task by ID with its execution plan and persisted steps.
 */
export async function getAgentTaskDetails(taskId: string) {
  return getTaskById(taskId);
}
