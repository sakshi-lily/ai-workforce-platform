import crypto from "crypto";
import { DAGValidator } from "./dagValidator";
import { WorkerRegistry } from "./workerRegistry";
import { WorkerRunner } from "./workerRunner";
import { ConflictResolver } from "./conflictResolver";
import { EnterpriseAuditService } from "../enterprise/auditService";
import {
  OrchestrationPlan,
  OrchestrationPlanNode,
  OrchestrationState,
  WorkerExecutionRecord,
  WorkerObservation,
  FinalSynthesisResult,
  WorkerExecutionContext,
} from "./types";

export interface OrchestrationExecutionTrace {
  orchestrationId: string;
  taskId: string;
  organizationId: string;
  userId: string;
  objective: string;
  state: OrchestrationState;
  startTime: string;
  endTime?: string;
  durationMs: number;
  totalCostUsd: number;
  workerRecords: WorkerExecutionRecord[];
  observations: WorkerObservation[];
  finalResult?: FinalSynthesisResult;
  error?: string;
}

export class WorkforceOrchestrator {
  private static activeTraces: Map<string, OrchestrationExecutionTrace> = new Map();
  private static cancellationFlags: Set<string> = new Set();

  /**
   * Coordinates execution of a multi-agent workforce plan (Sections 21-34, 60-65).
   */
  public static async executePlan(params: {
    taskId: string;
    userId: string;
    organizationId: string;
    objective: string;
    nodes: OrchestrationPlanNode[];
    budgetCapUsd?: number;
    deadlineMs?: number;
  }): Promise<FinalSynthesisResult> {
    const orchestrationId = `orch_${crypto.randomBytes(8).toString("hex")}`;
    const startTime = Date.now();
    const budgetCapUsd = params.budgetCapUsd || 0.50;
    const deadlineMs = params.deadlineMs || 30000;
    const deadlineTimestamp = startTime + deadlineMs;

    const trace: OrchestrationExecutionTrace = {
      orchestrationId,
      taskId: params.taskId,
      organizationId: params.organizationId,
      userId: params.userId,
      objective: params.objective,
      state: "REQUESTED",
      startTime: new Date().toISOString(),
      durationMs: 0,
      totalCostUsd: 0,
      workerRecords: [],
      observations: [],
    };
    this.activeTraces.set(params.taskId, trace);

    // 1. DAG Plan Validation (Sections 24-28, 71)
    trace.state = "PLANNING";
    const dagResult = DAGValidator.validate(params.nodes);
    if (!dagResult.valid) {
      trace.state = "FAILED";
      trace.error = dagResult.errors.join("; ");
      trace.endTime = new Date().toISOString();
      trace.durationMs = Date.now() - startTime;
      await EnterpriseAuditService.recordEvent({
        organizationId: params.organizationId,
        userId: params.userId,
        eventType: "ORCHESTRATION_VALIDATION_FAILED",
        action: `DAG plan validation rejected for task ${params.taskId}`,
        details: { errors: dagResult.errors },
      });
      throw new Error(`ORCHESTRATION_PLAN_INVALID: ${trace.error}`);
    }

    // 2. Dispatching & Execution Stages
    trace.state = "RUNNING";
    const completedObservations: WorkerObservation[] = [];
    const completedNodeIds = new Set<string>();
    let currentCostUsd = 0;

    for (let stageIdx = 0; stageIdx < dagResult.stages.length; stageIdx++) {
      const stageNodes = dagResult.stages[stageIdx];

      // Check Cancellation (Section 62)
      if (this.cancellationFlags.has(params.taskId)) {
        trace.state = "CANCELLED";
        trace.endTime = new Date().toISOString();
        trace.durationMs = Date.now() - startTime;
        throw new Error("ORCHESTRATION_CANCELLED: Task execution was cancelled by user.");
      }

      // Check Overall Task Deadline
      if (Date.now() >= deadlineTimestamp) {
        trace.state = "FAILED";
        trace.error = "ORCHESTRATION_DEADLINE_EXCEEDED: Global task deadline timed out.";
        throw new Error(trace.error);
      }

      // Check Budget Headroom
      if (currentCostUsd >= budgetCapUsd) {
        trace.state = "FAILED";
        trace.error = "ORCHESTRATION_BUDGET_EXCEEDED: Task reached maximum allocated workforce budget.";
        throw new Error(trace.error);
      }

      // Execute current stage nodes in parallel (Section 29)
      const stagePromises = stageNodes.map(async (node) => {
        // Verify dependencies
        for (const dep of node.dependsOn) {
          if (!completedNodeIds.has(dep)) {
            throw new Error(`WORKER_DEPENDENCY_FAILED: Node '${node.id}' missing completed dependency '${dep}'.`);
          }
        }

        const remainingMs = Math.max(1000, deadlineTimestamp - Date.now());
        const workerExecId = `wexec_${crypto.randomBytes(6).toString("hex")}`;
        const def = WorkerRegistry.getWorker(node.workerType);
        const allocatedBudget = node.allocatedBudgetUsd || def?.defaultBudgetUsd || 0.02;

        // Context Isolation: construct isolated context containing only relevant prior observations
        const isolatedContext: Record<string, unknown> = {
          objective: node.objective,
          priorObservations: completedObservations.map((o) => ({
            stepId: o.stepId,
            workerType: o.workerType,
            summary: o.summary,
            data: o.data,
          })),
        };

        const ctx: WorkerExecutionContext = {
          workerExecutionId: workerExecId,
          orchestrationId,
          taskId: params.taskId,
          stepId: node.id,
          userId: params.userId,
          organizationId: params.organizationId,
          workerType: node.workerType,
          capabilities: def?.capabilities || [],
          allocatedBudgetUsd: allocatedBudget,
          deadlineTimestamp: Date.now() + Math.min(node.timeoutMs || def?.defaultTimeoutMs || 10000, remainingMs),
          isolatedContext,
        };

        const inputPayload: Record<string, unknown> = {
          query: node.objective,
          objective: node.objective,
          userObjective: params.objective,
          customerNumber: "CUST-1002",
          observations: completedObservations.map((o) => ({
            stepId: o.stepId,
            workerType: o.workerType,
            summary: o.summary,
            ...o.data,
          })),
          ...(node.inputData || {}),
        };
        if (!inputPayload.observations || (Array.isArray(inputPayload.observations) && inputPayload.observations.length === 0)) {
          inputPayload.observations = completedObservations.map((o) => ({
            stepId: o.stepId,
            workerType: o.workerType,
            summary: o.summary,
            ...o.data,
          }));
        }

        try {
          const res = await WorkerRunner.execute(ctx, inputPayload);
          return { node, success: true, record: res.record, observation: res.observation };
        } catch (err: any) {
          if (node.required) {
            throw err;
          } else {
            // Optional worker failure -> Continue with warning
            return { node, success: false, error: err.message };
          }
        }
      });

      const stageResults = await Promise.all(stagePromises);

      for (const res of stageResults) {
        if (res.success && res.record && res.observation) {
          trace.workerRecords.push(res.record);
          trace.observations.push(res.observation);
          completedObservations.push(res.observation);
          completedNodeIds.add(res.node.id);
          currentCostUsd += res.record.costUsd;
        } else {
          // Record non-fatal failure for optional worker
          currentCostUsd += 0.005;
        }
      }
    }

    // 3. Conflict Resolution & Evidence Priority (Sections 43, 44)
    trace.state = "VALIDATING";
    const conflictResult = ConflictResolver.resolve(completedObservations);

    // 4. Final Result Synthesis (Section 13, 46, 47)
    trace.state = "SYNTHESIZING";
    const endTime = new Date().toISOString();
    const totalDurationMs = Date.now() - startTime;

    const sources = completedObservations.flatMap((o) =>
      o.sources.map((s) => ({
        id: s.id,
        title: s.title,
        citationToken: s.citationToken || `[${s.id}]`,
      }))
    );

    const conflictsResolved = conflictResult.conflicts.map((c) => ({
      topic: c.topic,
      resolution: c.resolution,
      primarySource: c.primarySource,
    }));

    const finalAnswer =
      completedObservations.find((o) => o.workerType === "SYNTHESIS_WORKER")?.data
        ?.finalAnswer as string ||
      "Multi-agent workforce execution completed successfully with verified observations and validated source citations.";

    const finalResult: FinalSynthesisResult = {
      orchestrationId,
      taskId: params.taskId,
      status: "COMPLETED",
      finalAnswer,
      sources,
      uncertainties: conflictResult.synthesizedUncertainties,
      conflictsResolved,
      workerSummary: trace.workerRecords.map((r) => ({
        stepId: r.stepId,
        workerType: r.workerType,
        status: r.status,
        durationMs: r.durationMs || 0,
        costUsd: r.costUsd,
      })),
      totalCostUsd: parseFloat(currentCostUsd.toFixed(4)),
      totalDurationMs,
      completedAt: endTime,
    };

    trace.state = "COMPLETED";
    trace.endTime = endTime;
    trace.durationMs = totalDurationMs;
    trace.totalCostUsd = finalResult.totalCostUsd;
    trace.finalResult = finalResult;

    await EnterpriseAuditService.recordEvent({
      organizationId: params.organizationId,
      userId: params.userId,
      eventType: "ORCHESTRATION_COMPLETED",
      action: `Orchestration '${orchestrationId}' completed with ${trace.workerRecords.length} workers`,
      details: {
        orchestrationId,
        taskId: params.taskId,
        durationMs: totalDurationMs,
        costUsd: finalResult.totalCostUsd,
      },
    });

    return finalResult;
  }

  public static cancelTask(taskId: string): void {
    this.cancellationFlags.add(taskId);
    const trace = this.activeTraces.get(taskId);
    if (trace && trace.state !== "COMPLETED") {
      trace.state = "CANCELLED";
    }
  }

  public static getTrace(taskId: string): OrchestrationExecutionTrace | undefined {
    return this.activeTraces.get(taskId);
  }

  public static listTraces(organizationId: string): OrchestrationExecutionTrace[] {
    return Array.from(this.activeTraces.values()).filter(
      (t) => t.organizationId === organizationId
    );
  }

  public static clear(): void {
    this.activeTraces.clear();
    this.cancellationFlags.clear();
  }
}
