import fs from "fs";
import path from "path";
import { releaseManager } from "./releaseManager";
import { scanRepositoryForSecrets } from "./secretAudit";
import { runAllSmokeTests } from "./smokeTests";
import { runSecurityRegressions } from "./securityRegressions";
import { runReliabilityRegressions } from "./reliabilityRegressions";
import { rollbackManager } from "./rollbackManager";

interface TestReport {
  name: string;
  passed: boolean;
  error?: string;
  details?: any;
}

const reports: TestReport[] = [];

function assert(condition: boolean, name: string, errorMsg?: string, details?: any) {
  if (condition) {
    reports.push({ name, passed: true, details });
    console.log(`  [PASS] ${name}`);
  } else {
    reports.push({ name, passed: false, error: errorMsg || "Assertion failed", details });
    console.error(`  [FAIL] ${name} -> ${errorMsg || "Assertion failed"}`);
  }
}

async function main() {
  console.log("\n=======================================================");
  console.log("  PHASE 23 CI/CD, AUTOMATED DELIVERY & DEPLOYMENT SUITE ");
  console.log("=======================================================\n");

  const rootDir = path.resolve(__dirname, "../../../");
  const serverDir = path.resolve(__dirname, "../../");
  const ciWorkflowPath = path.join(rootDir, ".github/workflows/ci.yml");
  const cdWorkflowPath = path.join(rootDir, ".github/workflows/cd.yml");
  const cicdDocsPath = path.join(rootDir, "docs/CICD.md");

  // --- 1. Continuous Integration (CI) Workflow Verification ---
  console.log("--- 1. Continuous Integration (CI) Workflow Verification ---");
  assert(fs.existsSync(ciWorkflowPath), "ci.yml workflow file exists in .github/workflows/");
  if (fs.existsSync(ciWorkflowPath)) {
    const ciContent = fs.readFileSync(ciWorkflowPath, "utf-8");
    assert(ciContent.includes("pull_request:") && ciContent.includes("push:"), "CI triggers on pull_request and push to main");
    assert(ciContent.includes("node-version: 22"), "CI workflow enforces consistent Node.js 22 runtime");
    assert(ciContent.includes("npm ci"), "CI enforces reproducible dependency installation via npm ci");
    assert(ciContent.includes("tsc --noEmit"), "CI runs strict TypeScript type checking without emit");
    assert(ciContent.includes("scanRepositoryForSecrets"), "CI includes automated secret scanning step");
    assert(ciContent.includes("docker build -f docker/Dockerfile.api"), "CI verifies API Docker container compilation");
    assert(ciContent.includes("docker build -f docker/Dockerfile.worker"), "CI verifies Headless Worker Docker container compilation");
    assert(ciContent.includes("docker build -f docker/Dockerfile.client"), "CI verifies Client Docker container compilation");
  }

  // --- 2. Continuous Delivery (CD) Workflow Verification ---
  console.log("\n--- 2. Continuous Delivery (CD) Workflow Verification ---");
  assert(fs.existsSync(cdWorkflowPath), "cd.yml workflow file exists in .github/workflows/");
  if (fs.existsSync(cdWorkflowPath)) {
    const cdContent = fs.readFileSync(cdWorkflowPath, "utf-8");
    assert(cdContent.includes("id-token: write"), "CD pipeline requests id-token: write permission for AWS OIDC");
    assert(cdContent.includes("aws-actions/configure-aws-credentials"), "CD pipeline uses AWS OIDC federation for short-lived credentials");
    assert(cdContent.includes("role-to-assume:"), "CD uses least-privilege deployment role instead of permanent access keys");
    assert(cdContent.includes("IMAGE_TAG"), "CD generates immutable release image tags tied to Git commit SHA");
    assert(cdContent.includes(":production"), "CD provides moving production pointer alongside immutable tag");
    assert(cdContent.includes("trivy-action") || cdContent.includes("Scan API Image"), "CD pipeline includes container vulnerability scanning");
    assert(cdContent.includes("db:migrate-rds"), "CD executes non-destructive RDS database migration");
    assert(cdContent.includes("rollback-on-failure:"), "CD pipeline incorporates automated rollback on verification failure");
    assert(cdContent.includes("if: failure()"), "Rollback step triggers automatically if post-deploy verification fails");
  }

  // --- 3. Repository Secret Scanning & CI/CD Security ---
  console.log("\n--- 3. Repository Secret Scanning & CI/CD Security ---");
  const secretScanResult = scanRepositoryForSecrets(rootDir);
  assert(secretScanResult.passed, `Repository secret audit passed (0 credentials committed across ${secretScanResult.filesScanned} files)`);
  if (!secretScanResult.passed) {
    console.error("Detected secret violations:", secretScanResult.violations);
  }

  // --- 4. Build Metadata & Safe Health Telemetry ---
  console.log("\n--- 4. Build Metadata & Safe Health Telemetry ---");
  const healthMeta = releaseManager.getPublicHealthMetadata();
  assert(healthMeta.status === "ok", "Release manager reports health status: 'ok'");
  assert(Boolean(healthMeta.version && healthMeta.commit), "Health metadata exposes semantic version and Git commit SHA");
  assert(Boolean(healthMeta.buildTime && healthMeta.environment), "Health metadata exposes build timestamp and environment");
  assert(!("jwtSecret" in healthMeta) && !("apiKey" in healthMeta), "Health telemetry strictly avoids exposing sensitive keys or tokens");

  const imageTags = releaseManager.formatImageTag("ai-workforce-api", "8f39eb3ab5c", "1.0.0");
  assert(imageTags.immutableTag === "ai-workforce-api:8f39eb3", "Formats immutable image tag based on Git commit SHA");
  assert(imageTags.movingTag === "ai-workforce-api:production", "Formats moving production image tag pointer");

  // --- 5. Post-Deployment Smoke Tests ---
  console.log("\n--- 5. Post-Deployment Smoke Tests ---");
  const smokeResults = await runAllSmokeTests();
  for (const s of smokeResults.results) {
    assert(s.passed, `[Smoke Test] ${s.name} (${s.durationMs}ms)`, s.error, s.details);
  }
  assert(smokeResults.passed, "All post-deployment smoke tests passed successfully");

  // --- 6. AI Workforce & Security Regressions ---
  console.log("\n--- 6. AI Workforce & Security Regressions ---");
  const secRegressions = await runSecurityRegressions();
  for (const r of secRegressions.results) {
    assert(r.passed, `[Security Regression] ${r.testName}`, r.message);
  }
  assert(secRegressions.passed, "All AI workforce security regressions passed");

  // --- 7. Reliability & Concurrency Regressions ---
  console.log("\n--- 7. Reliability & Concurrency Regressions ---");
  const relRegressions = await runReliabilityRegressions();
  for (const r of relRegressions.results) {
    assert(r.passed, `[Reliability Regression] ${r.name}`, r.message);
  }
  assert(relRegressions.passed, "All reliability regressions passed");

  // --- 8. Disaster Scenario & Automated Rollback Drill ---
  console.log("\n--- 8. Disaster Scenario & Automated Rollback Drill ---");
  const rollbackDrill = await rollbackManager.executeRollbackDrill();
  for (const step of rollbackDrill.steps) {
    assert(step.passed, `[Rollback Drill] ${step.step}`);
  }
  assert(rollbackDrill.drillPassed, "Disaster scenario drill: automated rollback restored healthy baseline upon simulated failure");

  const latestAudit = releaseManager.getLatestDeployment();
  assert(latestAudit?.status === "ROLLED_BACK", "Deployment audit record accurately captured rollback status");
  assert(latestAudit?.rollbackPerformed === true, "Deployment audit verified rollbackPerformed flag");

  // --- 9. Documentation Check ---
  console.log("\n--- 9. CI/CD Documentation Check ---");
  assert(fs.existsSync(cicdDocsPath), "docs/CICD.md documentation exists");
  if (fs.existsSync(cicdDocsPath)) {
    const docContent = fs.readFileSync(cicdDocsPath, "utf-8");
    assert(docContent.includes("Short-Lived Cloud Credentials (AWS OIDC)"), "docs/CICD.md details AWS OIDC authentication");
    assert(docContent.includes("Immutable Image Tagging"), "docs/CICD.md documents immutable container image tagging");
    assert(docContent.includes("Database Migration Strategy (Expand / Contract)"), "docs/CICD.md details expand/contract migration safety");
    assert(docContent.includes("Rollback Strategy & Disaster Recovery"), "docs/CICD.md details automated rollback procedures");
    assert(docContent.includes("Worker & Queue Safety During Deployment"), "docs/CICD.md documents graceful shutdown & queue durability");
    assert(docContent.includes("AI Workforce Regression Test Suite"), "docs/CICD.md documents AI security regression protections");
  }

  // --- Summary ---
  console.log("\n=======================================================");
  console.log("  PHASE 23 TEST RESULTS SUMMARY");
  console.log("=======================================================");
  const passedCount = reports.filter((r) => r.passed).length;
  const failedCount = reports.filter((r) => !r.passed).length;
  console.log(`Total Tests: ${reports.length}`);
  console.log(`Passed:      ${passedCount}`);
  console.log(`Failed:      ${failedCount}`);
  console.log("=======================================================\n");

  if (failedCount > 0) {
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
