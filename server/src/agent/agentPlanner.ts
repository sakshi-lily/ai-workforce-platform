/**
 * Phase 15 — Advanced Agent Planner & Bounded Replanning Engine
 *
 * Implements structured planning into a Directed Acyclic Graph (DAG):
 * 1. LLM proposes the structured plan; the host validates it via Zod & DAG rules.
 * 2. Assigns explicit step dependencies and tool allowlists.
 * 3. Bounded replanning allows adjusting uncompleted steps if an intermediate step encounters an obstacle.
 */

import { generateStructured } from "../llm/service";
import {
  AdvancedAgentPlanSchema,
  AdvancedAgentPlanDTO,
} from "./agentSchemas";
import {
  AdvancedAgentPlan,
  AdvancedPlanStep,
  AgentObservation,
} from "./agentTypes";
import { assertValidPlanDAG } from "./agentDAG";
import { toolRegistry } from "../tools/registry";

const ADVANCED_PLANNER_SYSTEM_PROMPT = `
You are the Lead Planning Engine for the AI Workforce Platform.
Your purpose is to decompose complex user objectives into a robust, structured Directed Acyclic Graph (DAG) execution plan.

OPERATIONAL INSTRUCTIONS:
1. Decompose the goal into 1 to 6 clear, logical steps.
2. Each step must have:
   - 'id': A short unique identifier (e.g., 'step_1', 'step_2', 'step_3').
   - 'order': Sequential integer starting at 1.
   - 'title': Concise milestone name.
   - 'description': Detailed actionable instruction.
   - 'dependencies': Array of prerequisite step IDs that must be COMPLETED before this step can execute. Initial steps have [].
   - 'allowedTools': Array of specific registered tool names required for this step.
3. AVAILABLE TOOLS:
   - 'web_search': Public internet research and live information.
   - 'mysql_verify_customer': Structured CRM customer database verification.
   - 'vector_search': Unstructured semantic search over company documents.
   - 'rag_query': Grounded retrieval-augmented generation over internal knowledge.
   - 'get_current_time': Authoritative timezone-aware server time.
   - 'calculate': Safe arithmetic calculation.
4. STRICT DAG RULES:
   - Never create circular dependencies (e.g., A depends on B, and B depends on A).
   - Never make a step depend on itself.
   - Only reference step IDs that exist in the plan.
`;

export class AgentPlanner {
  /**
   * Generates a validated execution plan from user prompt.
   */
  public static async generatePlan(
    taskGoal: string,
    allowedTools?: string[]
  ): Promise<AdvancedAgentPlan> {
    const availableToolNames = allowedTools && allowedTools.length > 0
      ? allowedTools
      : toolRegistry.listTools().map((t) => t.name);

    const userPrompt = `
PRODUCE A STRUCTURED DAG EXECUTION PLAN FOR THE FOLLOWING GOAL:
"${taskGoal.trim()}"

Permitted platform tools available for assignment:
${JSON.stringify(availableToolNames)}

Ensure each step specifies exact dependencies and allowed tools.
`;

    const llmResult = await generateStructured<AdvancedAgentPlanDTO>(
      userPrompt,
      AdvancedAgentPlanSchema,
      ADVANCED_PLANNER_SYSTEM_PROMPT
    );

    const planData = llmResult.data;

    // Convert to typed plan and default statuses to PENDING
    const plan: AdvancedAgentPlan = {
      goal: planData.goal,
      summary: planData.summary,
      steps: planData.steps.map((s) => ({
        id: s.id,
        order: s.order,
        title: s.title,
        description: s.description,
        dependencies: s.dependencies || [],
        allowedTools: s.allowedTools || [],
        status: "PENDING",
        retryCount: 0,
      })),
    };

    // Host-controlled DAG verification
    assertValidPlanDAG(plan);

    return plan;
  }

  /**
   * Performs bounded replanning of remaining unexecuted steps when an obstacle is encountered.
   * Preserves already completed steps and observations.
   */
  public static async replanRemaining(
    originalPlan: AdvancedAgentPlan,
    failedStep: AdvancedPlanStep,
    failureReason: string,
    observations: AgentObservation[]
  ): Promise<AdvancedAgentPlan> {
    const completedSteps = originalPlan.steps.filter((s) => s.status === "COMPLETED");

    const replanPrompt = `
THE AGENT ENCOUNTERED AN EXECUTION OBSTACLE ON STEP '${failedStep.id}' (${failedStep.title}):
Failure details: "${failureReason}"

ORIGINAL GOAL:
"${originalPlan.goal}"

ALREADY COMPLETED STEPS:
${JSON.stringify(completedSteps.map((s) => ({ id: s.id, title: s.title, outcome: s.resultSummary })))}

RELEVANT OBSERVATIONS:
${JSON.stringify(observations.map((o) => ({ tool: o.tool, summary: o.summary })))}

INSTRUCTION:
Produce an updated plan for the REMAINING work to reach the original goal without repeating completed steps.
Keep the same overall goal and provide 1 to 4 new or revised steps that work around the failure.
`;

    const llmResult = await generateStructured<AdvancedAgentPlanDTO>(
      replanPrompt,
      AdvancedAgentPlanSchema,
      ADVANCED_PLANNER_SYSTEM_PROMPT
    );

    const newSteps = llmResult.data.steps.map((s, idx) => ({
      id: `replan_${s.id}`,
      order: completedSteps.length + idx + 1,
      title: s.title,
      description: s.description,
      // Guarantee dependencies only reference valid completed steps
      dependencies: (() => {
        const validExistingDeps = (s.dependencies || []).filter((d) => completedSteps.some((cs) => cs.id === d));
        if (validExistingDeps.length > 0) return validExistingDeps;
        return completedSteps.length > 0 ? [completedSteps[completedSteps.length - 1].id] : [];
      })(),
      allowedTools: s.allowedTools || [],
      status: "PENDING" as const,
      retryCount: 0,
    }));

    const mergedPlan: AdvancedAgentPlan = {
      goal: originalPlan.goal,
      summary: `[REPLANNED] ${llmResult.data.summary}`,
      steps: [...completedSteps, ...newSteps],
    };

    // Re-validate complete merged DAG
    assertValidPlanDAG(mergedPlan);

    return mergedPlan;
  }
}
