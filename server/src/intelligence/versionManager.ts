import { WorkforceVersionRecord } from "./types";
import { EnterpriseAuditService } from "../enterprise/auditService";

export class WorkforceVersionManager {
  // In-memory version history
  private static versions: Map<string, WorkforceVersionRecord> = new Map([
    [
      "2026.10.08",
      {
        version: "2026.10.08",
        agentVersion: "2.4.0",
        promptVersions: {
          planner: "agent-planner-v2.1",
          ragSynthesis: "rag-answer-v1.4",
          toolExecution: "tool-caller-v1.0",
        },
        modelConfig: {
          provider: "openai",
          model: "gpt-4o-mini",
          temperature: 0.2,
          timeoutMs: 30000,
        },
        toolRegistryVersion: "1.2.0",
        ragConfig: {
          topK: 5,
          similarityThreshold: 0.7,
        },
        createdAt: "2026-10-08T00:00:00.000Z",
        active: true,
        approvedBy: "Engineering Release Board",
      },
    ],
    [
      "2026.10.01",
      {
        version: "2026.10.01",
        agentVersion: "2.3.1",
        promptVersions: {
          planner: "agent-planner-v2.0",
          ragSynthesis: "rag-answer-v1.3",
          toolExecution: "tool-caller-v1.0",
        },
        modelConfig: {
          provider: "openai",
          model: "gpt-4o-mini",
          temperature: 0.3,
          timeoutMs: 30000,
        },
        toolRegistryVersion: "1.1.0",
        ragConfig: {
          topK: 5,
          similarityThreshold: 0.65,
        },
        createdAt: "2026-10-01T00:00:00.000Z",
        active: false,
        approvedBy: "Engineering Release Board",
      },
    ],
  ]);

  // Task execution traceability map (taskId -> version info)
  private static executionTraceability: Map<
    string,
    {
      taskId: string;
      workforceVersion: string;
      model: string;
      promptVersion: string;
      timestamp: string;
    }
  > = new Map();

  /**
   * Retrieves the currently active authoritative workforce configuration.
   */
  public static async getActiveVersion(): Promise<WorkforceVersionRecord> {
    for (const v of this.versions.values()) {
      if (v.active) return v;
    }
    // Fallback if none active
    const fallback = Array.from(this.versions.values())[0];
    return fallback;
  }

  /**
   * Lists all historical workforce configuration versions.
   */
  public static async listVersions(): Promise<WorkforceVersionRecord[]> {
    return Array.from(this.versions.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  /**
   * Associates an execution task with its exact configuration lineage for reproducibility (Section 88).
   */
  public static async recordExecutionLineage(params: {
    taskId: string;
    workforceVersion?: string;
    model?: string;
    promptVersion?: string;
  }): Promise<void> {
    const active = await this.getActiveVersion();
    this.executionTraceability.set(params.taskId, {
      taskId: params.taskId,
      workforceVersion: params.workforceVersion || active.version,
      model: params.model || active.modelConfig.model,
      promptVersion: params.promptVersion || active.promptVersions.planner,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Retrieves the exact version lineage for a historical task.
   */
  public static async getExecutionLineage(taskId: string) {
    return this.executionTraceability.get(taskId);
  }

  /**
   * Controlled activation of a workforce configuration version (Section 84, 85).
   */
  public static async activateVersion(
    version: string,
    actorId: string,
    organizationId: string = "org-demo-001"
  ): Promise<WorkforceVersionRecord> {
    const target = this.versions.get(version);
    if (!target) {
      throw new Error(`Workforce configuration version '${version}' does not exist.`);
    }

    const previous = await this.getActiveVersion();

    for (const v of this.versions.values()) {
      v.active = false;
    }
    target.active = true;
    this.versions.set(version, target);

    await EnterpriseAuditService.recordEvent({
      organizationId,
      userId: actorId,
      eventType: "WORKFORCE_VERSION_ACTIVATED",
      action: `Activated workforce version '${version}' (previously '${previous.version}')`,
      details: {
        previousVersion: previous.version,
        newVersion: version,
        model: target.modelConfig.model,
      },
    });

    return target;
  }

  /**
   * Registers a new reviewed and approved workforce version.
   */
  public static async registerVersion(
    versionRecord: WorkforceVersionRecord,
    actorId: string,
    organizationId: string = "org-demo-001"
  ): Promise<WorkforceVersionRecord> {
    this.versions.set(versionRecord.version, versionRecord);

    await EnterpriseAuditService.recordEvent({
      organizationId,
      userId: actorId,
      eventType: "WORKFORCE_VERSION_REGISTERED",
      action: `Registered new workforce configuration version '${versionRecord.version}'`,
      details: { version: versionRecord.version, approvedBy: versionRecord.approvedBy },
    });

    return versionRecord;
  }

  public static clear(): void {
    this.executionTraceability.clear();
  }
}
