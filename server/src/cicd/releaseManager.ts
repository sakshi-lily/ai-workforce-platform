import fs from "fs";
import path from "path";

export interface ReleaseMetadata {
  version: string;
  commitSha: string;
  buildTime: string;
  environment: string;
  deployedAt?: string;
  service?: string;
}

export interface DeploymentRecord {
  id: string;
  version: string;
  commitSha: string;
  workflow: string;
  actor: string;
  deployedAt: string;
  status: "IN_PROGRESS" | "SUCCESS" | "FAILED" | "ROLLED_BACK";
  healthVerified: boolean;
  rollbackPerformed: boolean;
  error?: string;
}

class ReleaseManager {
  private releaseInfo: ReleaseMetadata;
  private deploymentAuditHistory: DeploymentRecord[] = [];

  constructor() {
    this.releaseInfo = this.loadReleaseMetadata();
  }

  private loadReleaseMetadata(): ReleaseMetadata {
    let pkgVersion = "1.0.0";
    try {
      const pkgPath = path.resolve(__dirname, "../../package.json");
      if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
        pkgVersion = pkg.version || "1.0.0";
      }
    } catch {
      // ignore
    }

    return {
      version: process.env.APP_VERSION || pkgVersion,
      commitSha: process.env.GIT_COMMIT_SHA || process.env.GITHUB_SHA?.substring(0, 7) || "8f39eb3",
      buildTime: process.env.BUILD_TIMESTAMP || process.env.BUILD_TIME || "2026-10-08T00:00:00Z",
      environment: process.env.NODE_ENV || "development",
      deployedAt: process.env.DEPLOYED_AT || new Date().toISOString(),
      service: process.env.SERVICE_NAME || "ai-workforce-api",
    };
  }

  public getPublicHealthMetadata(): Record<string, any> {
    // Only safe metadata exposed - strict avoidance of secrets or internal tokens
    return {
      status: "ok",
      version: this.releaseInfo.version,
      commit: this.releaseInfo.commitSha,
      buildTime: this.releaseInfo.buildTime,
      environment: this.releaseInfo.environment,
    };
  }

  public getReleaseMetadata(): ReleaseMetadata {
    return { ...this.releaseInfo };
  }

  public formatImageTag(serviceName: string, sha: string, version?: string): { immutableTag: string; movingTag: string } {
    const cleanSha = sha.trim().substring(0, 7);
    const ver = version || this.releaseInfo.version;
    return {
      immutableTag: `${serviceName}:${cleanSha}`,
      movingTag: `${serviceName}:production`,
    };
  }

  public recordDeployment(record: Omit<DeploymentRecord, "id">): DeploymentRecord {
    const deploymentRecord: DeploymentRecord = {
      id: `deploy-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      ...record,
    };
    this.deploymentAuditHistory.push(deploymentRecord);
    return deploymentRecord;
  }

  public getDeploymentHistory(): DeploymentRecord[] {
    return [...this.deploymentAuditHistory];
  }

  public getLatestDeployment(): DeploymentRecord | undefined {
    return this.deploymentAuditHistory[this.deploymentAuditHistory.length - 1];
  }
}

export const releaseManager = new ReleaseManager();
