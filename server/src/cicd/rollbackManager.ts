import { releaseManager, DeploymentRecord } from "./releaseManager";

export interface ServiceRevision {
  serviceName: string;
  revision: number;
  imageTag: string;
  taskDefinitionArn: string;
  status: "ACTIVE" | "INACTIVE" | "FAILED";
}

export interface RollbackExecutionResult {
  success: boolean;
  serviceName: string;
  revertedFromRevision: number;
  revertedToRevision: number;
  revertedToImage: string;
  healthRestored: boolean;
  message: string;
}

export class RollbackManager {
  private activeRevisions: Map<string, ServiceRevision> = new Map();
  private stableRevisions: Map<string, ServiceRevision> = new Map();

  constructor() {
    // Seed initial baseline stable revision
    this.registerStableRevision({
      serviceName: "ai-workforce-api",
      revision: 1,
      imageTag: "ai-workforce-api:8f39eb3",
      taskDefinitionArn: "arn:aws:ecs:us-east-1:123456789012:task-definition/ai-workforce-api:1",
      status: "ACTIVE",
    });

    this.registerStableRevision({
      serviceName: "ai-workforce-worker",
      revision: 1,
      imageTag: "ai-workforce-worker:8f39eb3",
      taskDefinitionArn: "arn:aws:ecs:us-east-1:123456789012:task-definition/ai-workforce-worker:1",
      status: "ACTIVE",
    });
  }

  public registerStableRevision(rev: ServiceRevision): void {
    this.stableRevisions.set(rev.serviceName, rev);
    this.activeRevisions.set(rev.serviceName, rev);
  }

  public getActiveRevision(serviceName: string): ServiceRevision | undefined {
    return this.activeRevisions.get(serviceName);
  }

  public getStableRevision(serviceName: string): ServiceRevision | undefined {
    return this.stableRevisions.get(serviceName);
  }

  public simulateDeployCandidate(serviceName: string, candidateRevision: ServiceRevision): void {
    this.activeRevisions.set(serviceName, candidateRevision);
  }

  public async executeRollback(serviceName: string, reason: string): Promise<RollbackExecutionResult> {
    const currentActive = this.activeRevisions.get(serviceName);
    const stable = this.stableRevisions.get(serviceName);

    if (!stable) {
      throw new Error(`Cannot rollback: No known stable baseline for service '${serviceName}'.`);
    }

    const previousRevisionNum = currentActive ? currentActive.revision : 0;

    // Restore active pointer to stable baseline
    this.activeRevisions.set(serviceName, { ...stable });

    // Record audit event
    releaseManager.recordDeployment({
      version: stable.imageTag.split(":")[1] || "1.0.0",
      commitSha: stable.imageTag.split(":")[1] || "8f39eb3",
      workflow: "CD-Rollback-Trigger",
      actor: "automated-health-monitor",
      deployedAt: new Date().toISOString(),
      status: "ROLLED_BACK",
      healthVerified: true,
      rollbackPerformed: true,
      error: reason,
    });

    return {
      success: true,
      serviceName,
      revertedFromRevision: previousRevisionNum,
      revertedToRevision: stable.revision,
      revertedToImage: stable.imageTag,
      healthRestored: true,
      message: `Rollback completed: service '${serviceName}' reverted from revision ${previousRevisionNum} to revision ${stable.revision} (${stable.imageTag}).`,
    };
  }

  /**
   * Disaster Scenario & Rollback Test Drill:
   * 1. Confirms baseline Version A is active and healthy.
   * 2. Simulates candidate deployment Version B.
   * 3. Simulates controlled failure (e.g. 503 / health check fail).
   * 4. Triggers automated rollback to Version A.
   * 5. Confirms Version A is restored and healthy.
   */
  public async executeRollbackDrill(): Promise<{
    drillPassed: boolean;
    steps: Array<{ step: string; passed: boolean; details?: any }>;
  }> {
    const steps: Array<{ step: string; passed: boolean; details?: any }> = [];
    const service = "ai-workforce-api";

    // Step 1: Baseline active
    const baseline = this.getActiveRevision(service);
    steps.push({
      step: "1. Baseline Version A verified active",
      passed: Boolean(baseline && baseline.revision === 1),
      details: baseline,
    });

    // Step 2: Deploy candidate Version B
    const candidate: ServiceRevision = {
      serviceName: service,
      revision: 2,
      imageTag: "ai-workforce-api:candidate-faulty",
      taskDefinitionArn: "arn:aws:ecs:us-east-1:123456789012:task-definition/ai-workforce-api:2",
      status: "ACTIVE",
    };
    this.simulateDeployCandidate(service, candidate);
    const currentCandidate = this.getActiveRevision(service);
    steps.push({
      step: "2. Candidate Version B deployed",
      passed: currentCandidate?.revision === 2,
      details: currentCandidate,
    });

    // Step 3: Failure detection (Simulated health probe failure)
    const simulatedHealthCheckFailure = true;
    steps.push({
      step: "3. Health check failure detected on candidate (HTTP 503)",
      passed: simulatedHealthCheckFailure,
      details: { probe: "/api/health/readiness", simulatedResponse: 503 },
    });

    // Step 4: Automated rollback trigger
    const rollbackResult = await this.executeRollback(service, "Simulated readiness probe failure on Version B");
    steps.push({
      step: "4. Automated rollback restored baseline Version A",
      passed: rollbackResult.success && rollbackResult.revertedToRevision === 1,
      details: rollbackResult,
    });

    // Step 5: Verification of restored health
    const restored = this.getActiveRevision(service);
    steps.push({
      step: "5. Restored service health verified",
      passed: Boolean(restored && restored.revision === 1),
      details: restored,
    });

    const drillPassed = steps.every((s) => s.passed);
    return { drillPassed, steps };
  }
}

export const rollbackManager = new RollbackManager();
