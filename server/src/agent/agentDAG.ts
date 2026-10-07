/**
 * Phase 15 — Directed Acyclic Graph (DAG) Validation & Step Scheduler
 *
 * Implements deterministic DAG validation, cycle detection, and step scheduling:
 * 1. Validates unique step IDs.
 * 2. Validates valid dependency references.
 * 3. Detects circular dependencies via DFS 3-color graph traversal.
 * 4. Deterministically schedules the next runnable step (lowest order with all dependencies completed).
 */

import { AdvancedAgentPlan, AdvancedPlanStep, StepLifecycleStatus } from "./agentTypes";

export class DAGValidationError extends Error {
  public errors: string[];

  constructor(errors: string[]) {
    super(`DAG Validation Failed:\n- ${errors.join("\n- ")}`);
    this.name = "DAGValidationError";
    this.errors = errors;
  }
}

/**
 * Validates the complete structure of an Advanced Agent Plan as a valid Directed Acyclic Graph.
 */
export function validatePlanDAG(plan: AdvancedAgentPlan): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!plan.steps || plan.steps.length === 0) {
    errors.push("Plan must contain at least 1 step.");
    return { valid: false, errors };
  }

  if (plan.steps.length > 10) {
    errors.push(`Plan exceeds maximum allowed steps (10). Received: ${plan.steps.length}`);
  }

  const stepIds = new Set<string>();
  const duplicateIds = new Set<string>();

  // 1. Check ID uniqueness and non-empty IDs
  for (const step of plan.steps) {
    if (!step.id || step.id.trim().length === 0) {
      errors.push(`Step order ${step.order} is missing a valid step ID.`);
    } else {
      if (stepIds.has(step.id)) {
        duplicateIds.add(step.id);
      }
      stepIds.add(step.id);
    }
  }

  if (duplicateIds.size > 0) {
    errors.push(`Duplicate step IDs detected: ${Array.from(duplicateIds).join(", ")}`);
  }

  // 2. Check dependency validity and self-dependencies
  for (const step of plan.steps) {
    if (step.dependencies && Array.isArray(step.dependencies)) {
      for (const depId of step.dependencies) {
        if (depId === step.id) {
          errors.push(`Self-dependency detected: Step '${step.id}' cannot depend on itself.`);
        } else if (!stepIds.has(depId)) {
          errors.push(`Step '${step.id}' references unknown dependency '${depId}'.`);
        }
      }
    }
  }

  // 3. Cycle Detection via DFS (White/Gray/Black graph coloring)
  // 0: Unvisited (White), 1: Visiting (Gray), 2: Visited (Black)
  const adjList = new Map<string, string[]>();
  for (const step of plan.steps) {
    adjList.set(step.id, step.dependencies || []);
  }

  const visited = new Map<string, number>();
  for (const id of stepIds) {
    visited.set(id, 0);
  }

  const cyclePath: string[] = [];

  function dfsDetectCycle(node: string, currentPath: string[]): boolean {
    visited.set(node, 1);
    currentPath.push(node);

    const dependencies = adjList.get(node) || [];
    for (const dep of dependencies) {
      if (visited.get(dep) === 1) {
        // Cycle detected
        const cycleStartIndex = currentPath.indexOf(dep);
        cyclePath.push(...currentPath.slice(cycleStartIndex), dep);
        return true;
      }
      if (visited.get(dep) === 0) {
        if (dfsDetectCycle(dep, currentPath)) {
          return true;
        }
      }
    }

    currentPath.pop();
    visited.set(node, 2);
    return false;
  }

  for (const id of stepIds) {
    if (visited.get(id) === 0) {
      if (dfsDetectCycle(id, [])) {
        errors.push(`Circular dependency detected: ${cyclePath.join(" -> ")}`);
        break;
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export class AgentDAGValidator {
  public static validate(plan: AdvancedAgentPlan): AdvancedAgentPlan {
    assertValidPlanDAG(plan);
    return plan;
  }
}

/**
 * Asserts that a plan is a valid DAG. Throws DAGValidationError if invalid.
 */
export function assertValidPlanDAG(plan: AdvancedAgentPlan): void {
  const result = validatePlanDAG(plan);
  if (!result.valid) {
    throw new DAGValidationError(result.errors);
  }
}

/**
 * Deterministically selects the next runnable step in the plan.
 * A step is runnable if:
 * 1. Its status is PENDING or READY.
 * 2. All of its dependencies have status COMPLETED (or SKIPPED).
 *
 * If multiple steps are runnable, selects the one with the lowest step order.
 */
export function findNextRunnableStep(planOrSteps: AdvancedAgentPlan | AdvancedPlanStep[]): AdvancedPlanStep | null {
  const steps = Array.isArray(planOrSteps) ? planOrSteps : planOrSteps.steps;
  const completedStepIds = new Set<string>();
  for (const step of steps) {
    if (step.status === "COMPLETED" || step.status === "SKIPPED") {
      completedStepIds.add(step.id);
    }
  }

  const runnableSteps: AdvancedPlanStep[] = [];

  for (const step of steps) {
    if (step.status === "PENDING" || step.status === "READY") {
      const dependencies = step.dependencies || [];
      const allDepsCompleted = dependencies.every((depId) => completedStepIds.has(depId));

      if (allDepsCompleted) {
        runnableSteps.push(step);
      }
    }
  }

  if (runnableSteps.length === 0) {
    return null;
  }

  // Deterministic tie-breaking: lowest order first
  runnableSteps.sort((a, b) => a.order - b.order);
  return runnableSteps[0];
}

/**
 * Checks if all steps in the plan have finished (terminal step state).
 */
export function areAllStepsFinished(planOrSteps: AdvancedAgentPlan | AdvancedPlanStep[]): boolean {
  const steps = Array.isArray(planOrSteps) ? planOrSteps : planOrSteps.steps;
  return steps.every(
    (step) => step.status === "COMPLETED" || step.status === "SKIPPED" || step.status === "FAILED"
  );
}

/**
 * Checks if any step in the plan has permanently failed.
 */
export function hasFailedStep(plan: AdvancedAgentPlan): boolean {
  return plan.steps.some((step) => step.status === "FAILED");
}

/**
 * Calculates execution progress metrics for client visualization.
 */
export function calculatePlanProgress(plan: AdvancedAgentPlan): {
  completed: number;
  total: number;
  percentage: number;
} {
  const total = plan.steps.length;
  if (total === 0) return { completed: 0, total: 0, percentage: 0 };

  const completed = plan.steps.filter(
    (s) => s.status === "COMPLETED" || s.status === "SKIPPED"
  ).length;

  return {
    completed,
    total,
    percentage: Math.round((completed / total) * 100),
  };
}

/**
 * Computes topological ordering of step IDs for execution plan sequencing.
 */
export function getTopologicalOrder(plan: AdvancedAgentPlan): string[] {
  assertValidPlanDAG(plan);

  const inDegree = new Map<string, number>();
  const graph = new Map<string, string[]>(); // dep -> dependents

  for (const step of plan.steps) {
    inDegree.set(step.id, (step.dependencies || []).length);
    graph.set(step.id, []);
  }

  for (const step of plan.steps) {
    for (const dep of step.dependencies || []) {
      const dependents = graph.get(dep) || [];
      dependents.push(step.id);
      graph.set(dep, dependents);
    }
  }

  const queue: string[] = [];
  for (const [id, deg] of inDegree.entries()) {
    if (deg === 0) {
      queue.push(id);
    }
  }

  // Sort queue initially by step order
  queue.sort((a, b) => {
    const stepA = plan.steps.find((s) => s.id === a)!;
    const stepB = plan.steps.find((s) => s.id === b)!;
    return stepA.order - stepB.order;
  });

  const order: string[] = [];

  while (queue.length > 0) {
    const current = queue.shift()!;
    order.push(current);

    const dependents = graph.get(current) || [];
    for (const dep of dependents) {
      const newDeg = (inDegree.get(dep) || 0) - 1;
      inDegree.set(dep, newDeg);
      if (newDeg === 0) {
        queue.push(dep);
      }
    }
  }

  return order;
}

/**
 * Returns steps in topologically sorted dependency order.
 */
export function topologicalSort(planOrSteps: AdvancedAgentPlan | AdvancedPlanStep[]): AdvancedPlanStep[] {
  const plan: AdvancedAgentPlan = Array.isArray(planOrSteps)
    ? { goal: "Plan", summary: "", steps: planOrSteps }
    : planOrSteps;
  const orderIds = getTopologicalOrder(plan);
  const stepMap = new Map(plan.steps.map((s) => [s.id, s]));
  return orderIds.map((id) => stepMap.get(id)!).filter(Boolean);
}
