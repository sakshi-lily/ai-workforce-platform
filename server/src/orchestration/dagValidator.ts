import { OrchestrationPlanNode, WorkerRole } from "./types";

export interface DAGValidationResult {
  valid: boolean;
  errors: string[];
  stages: OrchestrationPlanNode[][]; // Execution stages in topological order for safe parallelism
}

export class DAGValidator {
  public static readonly MAX_WORKERS_PER_TASK = 8;
  public static readonly MAX_DELEGATION_DEPTH = 4;

  private static readonly ALLOWED_WORKER_ROLES: Set<WorkerRole> = new Set([
    "RESEARCH_WORKER",
    "VERIFICATION_WORKER",
    "KNOWLEDGE_WORKER",
    "ANALYSIS_WORKER",
    "COMMUNICATION_WORKER",
    "SYNTHESIS_WORKER",
  ]);

  /**
   * Validates an orchestration execution graph against DAG invariants (Sections 24-28, 71).
   * - Enforces finite node bounds (MAX_WORKERS_PER_TASK).
   * - Verifies that all dependency references exist.
   * - Rejects cycles (ORCHESTRATION_CYCLE).
   * - Restricts delegation depth (MAX_DELEGATION_DEPTH).
   * - Computes topological parallel stages.
   */
  public static validate(nodes: OrchestrationPlanNode[]): DAGValidationResult {
    const errors: string[] = [];

    if (!nodes || nodes.length === 0) {
      return { valid: false, errors: ["Orchestration plan contains no worker nodes."], stages: [] };
    }

    if (nodes.length > this.MAX_WORKERS_PER_TASK) {
      errors.push(
        `Plan exceeds maximum worker count ceiling (${nodes.length} > ${this.MAX_WORKERS_PER_TASK}).`
      );
    }

    const nodeMap = new Map<string, OrchestrationPlanNode>();
    for (const node of nodes) {
      if (nodeMap.has(node.id)) {
        errors.push(`Duplicate worker node ID '${node.id}' in orchestration plan.`);
      }
      if (!this.ALLOWED_WORKER_ROLES.has(node.workerType)) {
        errors.push(`Unrecognized or unauthorized worker type '${node.workerType}' for node '${node.id}'.`);
      }
      nodeMap.set(node.id, node);
    }

    // Verify all dependencies exist and are not self-referential
    for (const node of nodes) {
      for (const depId of node.dependsOn) {
        if (depId === node.id) {
          errors.push(`Node '${node.id}' cannot depend on itself (trivial cycle).`);
        } else if (!nodeMap.has(depId)) {
          errors.push(`Node '${node.id}' depends on missing node ID '${depId}'.`);
        }
      }
    }

    if (errors.length > 0) {
      return { valid: false, errors, stages: [] };
    }

    // Cycle Detection & Topological Stage Grouping using Kahn's Algorithm
    const inDegree = new Map<string, number>();
    const dependents = new Map<string, string[]>(); // node -> list of nodes that depend on it

    for (const node of nodes) {
      inDegree.set(node.id, node.dependsOn.length);
      dependents.set(node.id, []);
    }

    for (const node of nodes) {
      for (const depId of node.dependsOn) {
        dependents.get(depId)!.push(node.id);
      }
    }

    const stages: OrchestrationPlanNode[][] = [];
    let processedCount = 0;

    // Initial batch: nodes with 0 in-degree
    let currentBatch: string[] = [];
    for (const [id, deg] of inDegree.entries()) {
      if (deg === 0) {
        currentBatch.push(id);
      }
    }

    while (currentBatch.length > 0) {
      const stageNodes: OrchestrationPlanNode[] = currentBatch.map((id) => nodeMap.get(id)!);
      stages.push(stageNodes);
      processedCount += currentBatch.length;

      const nextBatch: string[] = [];
      for (const id of currentBatch) {
        for (const dependentId of dependents.get(id)!) {
          const currentDeg = inDegree.get(dependentId)! - 1;
          inDegree.set(dependentId, currentDeg);
          if (currentDeg === 0) {
            nextBatch.push(dependentId);
          }
        }
      }

      currentBatch = nextBatch;
    }

    // If not all nodes were processed, a cycle exists
    if (processedCount < nodes.length) {
      errors.push("ORCHESTRATION_CYCLE: Circular dependency loop detected in worker graph.");
      return { valid: false, errors, stages: [] };
    }

    // Validate delegation depth
    if (stages.length > this.MAX_DELEGATION_DEPTH + 1) {
      errors.push(
        `Plan delegation depth exceeds limit (${stages.length - 1} > ${this.MAX_DELEGATION_DEPTH}).`
      );
      return { valid: false, errors, stages: [] };
    }

    return { valid: true, errors: [], stages };
  }
}
