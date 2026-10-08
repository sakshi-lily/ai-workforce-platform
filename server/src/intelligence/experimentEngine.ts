import crypto from "crypto";
import { ExperimentRecord } from "./types";
import { EnterpriseAuditService } from "../enterprise/auditService";

export class ExperimentEngine {
  private static experiments: Map<string, ExperimentRecord> = new Map([
    [
      "exp-rag-topk-001",
      {
        id: "exp-rag-topk-001",
        organizationId: "org-demo-001",
        name: "RAG Retrieval Top-K Expansion (5 vs 8)",
        hypothesis: "Increasing top-k from 5 to 8 improves groundedness by at least 4% with < 10% token cost increase.",
        parameter: "rag_top_k",
        baselineVariant: "5",
        candidateVariant: "8",
        status: "RUNNING",
        sampleSize: 84,
        baselineMetrics: {
          successRate: 94.2,
          costUsd: 0.012,
          latencyMs: 1450,
        },
        candidateMetrics: {
          successRate: 97.6,
          costUsd: 0.013,
          latencyMs: 1520,
        },
        stopConditions: [
          "cost_surge_gt_25_pct",
          "failure_rate_gt_8_pct",
          "security_violation_gt_0",
        ],
        decision: "PENDING",
        createdAt: "2026-10-05T10:00:00.000Z",
        updatedAt: new Date().toISOString(),
      },
    ],
    [
      "exp-prompt-planner-002",
      {
        id: "exp-prompt-planner-002",
        organizationId: "org-demo-001",
        name: "Agent Planner Prompt v2.1 vs v2.2",
        hypothesis: "Enhanced observation synthesis in prompt v2.2 reduces redundant web search calls by 20%.",
        parameter: "prompt",
        baselineVariant: "agent-planner-v2.1",
        candidateVariant: "agent-planner-v2.2",
        status: "COMPLETED",
        sampleSize: 120,
        baselineMetrics: {
          successRate: 92.5,
          costUsd: 0.018,
          latencyMs: 2200,
        },
        candidateMetrics: {
          successRate: 96.0,
          costUsd: 0.014,
          latencyMs: 1850,
        },
        stopConditions: [
          "quality_regression_gt_5_pct",
          "security_violation_gt_0",
        ],
        decision: "ACCEPTED",
        createdAt: "2026-09-28T12:00:00.000Z",
        updatedAt: "2026-10-04T18:00:00.000Z",
      },
    ],
  ]);

  /**
   * Deterministically assigns an execution to a variant using SHA-256 hash modulo (Section 36).
   * Prevents stochastic flipping during evaluation windows.
   */
  public static getAssignedVariant(
    experimentId: string,
    contextId: string // e.g. organizationId or taskId
  ): string {
    const exp = this.experiments.get(experimentId);
    if (!exp || exp.status !== "RUNNING") {
      return exp?.baselineVariant || "baseline";
    }

    const hash = crypto
      .createHash("sha256")
      .update(`${experimentId}:${contextId}`)
      .digest("hex");
    const intVal = parseInt(hash.substring(0, 8), 16);

    // 50/50 split
    return intVal % 2 === 0 ? exp.candidateVariant : exp.baselineVariant;
  }

  /**
   * Lists experiments for an organization (tenant-scoped).
   */
  public static async listExperiments(organizationId: string): Promise<ExperimentRecord[]> {
    return Array.from(this.experiments.values()).filter(
      (e) => e.organizationId === organizationId
    );
  }

  /**
   * Retrieves an experiment by ID.
   */
  public static async getExperiment(id: string): Promise<ExperimentRecord | undefined> {
    return this.experiments.get(id);
  }

  /**
   * Creates a new controlled experiment.
   */
  public static async createExperiment(
    input: Omit<ExperimentRecord, "id" | "createdAt" | "updatedAt" | "decision" | "sampleSize" | "baselineMetrics" | "candidateMetrics">,
    actorId: string
  ): Promise<ExperimentRecord> {
    const id = `exp-${crypto.randomBytes(6).toString("hex")}`;
    const experiment: ExperimentRecord = {
      ...input,
      id,
      sampleSize: 0,
      baselineMetrics: { successRate: 100, costUsd: 0, latencyMs: 0 },
      candidateMetrics: { successRate: 100, costUsd: 0, latencyMs: 0 },
      decision: "PENDING",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.experiments.set(id, experiment);

    await EnterpriseAuditService.recordEvent({
      organizationId: input.organizationId,
      userId: actorId,
      eventType: "EXPERIMENT_CREATED",
      action: `Created controlled experiment '${input.name}'`,
      details: { experimentId: id, parameter: input.parameter },
    });

    return experiment;
  }

  /**
   * Records execution metrics into an ongoing experiment and checks automated stop conditions (Section 38).
   */
  public static async recordObservation(
    experimentId: string,
    variant: string,
    result: { success: boolean; costUsd: number; latencyMs: number }
  ): Promise<{ stopped: boolean; reason?: string }> {
    const exp = this.experiments.get(experimentId);
    if (!exp || exp.status !== "RUNNING") {
      return { stopped: false };
    }

    exp.sampleSize += 1;
    const isCandidate = variant === exp.candidateVariant;
    const target = isCandidate ? exp.candidateMetrics : exp.baselineMetrics;

    // Running averages
    const n = Math.max(1, Math.floor(exp.sampleSize / 2));
    target.successRate = parseFloat(
      (((target.successRate * (n - 1)) + (result.success ? 100 : 0)) / n).toFixed(1)
    );
    target.costUsd = parseFloat(
      (((target.costUsd * (n - 1)) + result.costUsd) / n).toFixed(4)
    );
    target.latencyMs = Math.round(
      ((target.latencyMs * (n - 1)) + result.latencyMs) / n
    );
    exp.updatedAt = new Date().toISOString();

    // Check automated stop conditions (Section 38)
    if (exp.candidateMetrics.successRate < 70 && exp.sampleSize >= 10) {
      exp.status = "STOPPED";
      exp.decision = "REJECTED";
      await EnterpriseAuditService.recordEvent({
        organizationId: exp.organizationId,
        eventType: "EXPERIMENT_ABORTED",
        action: `Automated stop triggered on experiment '${exp.name}' due to quality regression`,
        details: { experimentId: exp.id, candidateSuccessRate: exp.candidateMetrics.successRate },
      });
      return { stopped: true, reason: "Quality regression exceeded safety threshold" };
    }

    return { stopped: false };
  }

  /**
   * Resolves an experiment decision (`ACCEPTED` | `REJECTED`).
   */
  public static async resolveExperiment(
    experimentId: string,
    decision: "ACCEPTED" | "REJECTED",
    actorId: string
  ): Promise<ExperimentRecord> {
    const exp = this.experiments.get(experimentId);
    if (!exp) throw new Error(`Experiment ${experimentId} not found`);

    exp.status = "COMPLETED";
    exp.decision = decision;
    exp.updatedAt = new Date().toISOString();

    await EnterpriseAuditService.recordEvent({
      organizationId: exp.organizationId,
      userId: actorId,
      eventType: "EXPERIMENT_RESOLVED",
      action: `Resolved experiment '${exp.name}' with decision ${decision}`,
      details: { experimentId, decision, baseline: exp.baselineMetrics, candidate: exp.candidateMetrics },
    });

    return exp;
  }

  public static clear(): void {
    this.experiments.clear();
  }
}
