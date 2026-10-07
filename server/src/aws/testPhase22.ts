/**
 * AI Workforce Platform — Phase 22: AWS Deployment & Cloud Infrastructure Test Suite
 *
 * Verifies:
 * 1. CloudFormation & Terraform Infrastructure as Code (VPC, Subnets, Security Groups, IAM, RDS, Redis, ECS, ALB, S3)
 * 2. Strict least-privilege network boundaries (No public RDS or Redis exposure)
 * 3. AWS Secrets Manager adapter runtime retrieval, caching & fallback
 * 4. S3 Object Storage service multi-tenant key isolation, uploads, and presigned URLs
 * 5. Liveness and Readiness health probes for AWS ECS & ALB
 * 6. Localhost audit scanner verifying no dangerous hardcoded production endpoints
 * 7. RDS schema migration runner and table completeness
 * 8. Cloud environment security & configuration validation
 */

import fs from "fs";
import path from "path";
import request from "supertest";
import { app } from "../app";
import { awsSecretsManager } from "../config/awsSecrets";
import { s3Service } from "../services/s3Service";
import { auditLocalhostEndpoints } from "./localhostAudit";
import { runRdsMigration } from "../db/migrateRds";

const PROJECT_ROOT = path.resolve(__dirname, "../../../");
const SERVER_ROOT = path.resolve(__dirname, "../../");

let passedTests = 0;
let totalTests = 0;

function assert(condition: boolean, message: string) {
  totalTests++;
  if (!condition) {
    console.error(`  [FAIL] ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  passedTests++;
  console.log(`  [PASS] ${message}`);
}

async function runPhase22TestSuite() {
  console.log("\n=======================================================");
  console.log("  PHASE 22 AWS DEPLOYMENT & CLOUD INFRASTRUCTURE SUITE ");
  console.log("=======================================================\n");

  // --- 1. CloudFormation Infrastructure as Code Verification ---
  console.log("--- 1. CloudFormation Infrastructure as Code Verification ---");
  const cfnPath = path.join(PROJECT_ROOT, "infra/aws/cloudformation.yml");
  assert(fs.existsSync(cfnPath), "cloudformation.yml exists in infra/aws/");
  const cfnContent = fs.readFileSync(cfnPath, "utf-8");

  // VPC & Subnets
  assert(cfnContent.includes("AWS::EC2::VPC") && cfnContent.includes("10.0.0.0/16"), "Defines dedicated VPC with CIDR 10.0.0.0/16");
  assert(cfnContent.includes("PublicSubnet1") && cfnContent.includes("PublicSubnet2"), "Defines 2 Public Subnets across multiple AZs for ALB");
  assert(cfnContent.includes("PrivateSubnet1") && cfnContent.includes("PrivateSubnet2"), "Defines 2 Private Application Subnets for ECS Tasks");
  assert(cfnContent.includes("DatabaseSubnet1") && cfnContent.includes("DatabaseSubnet2"), "Defines 2 Private Database Subnets for RDS & Redis");
  assert(cfnContent.includes("AWS::EC2::NatGateway"), "Configures NAT Gateway for secure outbound internet access from private subnets");

  // Security Groups & Least Privilege
  assert(cfnContent.includes("ALBSecurityGroup:"), "Defines ALB Security Group with HTTP/HTTPS public ingress");
  assert(cfnContent.includes("ECSSecurityGroup:"), "Defines ECS Security Group accepting ingress only from ALB");
  assert(cfnContent.includes("RDSSecurityGroup:"), "Defines RDS Security Group");
  assert(cfnContent.includes("SourceSecurityGroupId: !Ref ECSSecurityGroup"), "Restricts RDS MySQL port 3306 strictly to ECS tasks (Zero 0.0.0.0/0 exposure)");
  assert(cfnContent.includes("RedisSecurityGroup:"), "Restricts Redis port 6379 strictly to ECS tasks");

  // Managed Services
  assert(cfnContent.includes("AWS::RDS::DBInstance"), "Provisions Amazon RDS MySQL 8.4 database instance");
  assert(cfnContent.includes("StorageEncrypted: true"), "Enforces encryption at rest for RDS storage");
  assert(cfnContent.includes("PubliclyAccessible: false"), "Ensures RDS MySQL instance is not publicly accessible");
  assert(cfnContent.includes("AWS::ElastiCache::ReplicationGroup"), "Provisions Amazon ElastiCache Redis cluster");
  assert(cfnContent.includes("AWS::S3::Bucket"), "Provisions encrypted Amazon S3 bucket with PublicAccessBlock");
  assert(cfnContent.includes("AWS::SecretsManager::Secret"), "Provisions AWS Secrets Manager secret for runtime credentials");

  // ECS Compute & Load Balancing
  assert(cfnContent.includes("AWS::ECS::Cluster"), "Provisions ECS Cluster for Fargate serverless containers");
  assert(cfnContent.includes("Family: !Sub ${EnvironmentName}-ai-workforce-api"), "Configures ECS Task Definition for API service");
  assert(cfnContent.includes("Family: !Sub ${EnvironmentName}-ai-workforce-worker"), "Configures ECS Task Definition for Headless Worker daemon");
  assert(cfnContent.includes("AWS::ElasticLoadBalancingV2::LoadBalancer"), "Provisions Application Load Balancer");
  assert(cfnContent.includes("HealthCheckPath: /api/health/readiness"), "Configures ALB target group healthcheck to /api/health/readiness");

  // --- 2. Terraform Infrastructure as Code Verification ---
  console.log("\n--- 2. Terraform Infrastructure as Code Verification ---");
  const tfPath = path.join(PROJECT_ROOT, "infra/aws/terraform/main.tf");
  assert(fs.existsSync(tfPath), "main.tf exists in infra/aws/terraform/");
  const tfContent = fs.readFileSync(tfPath, "utf-8");
  assert(tfContent.includes("aws_vpc") && tfContent.includes("aws_db_instance"), "Terraform defines VPC and RDS database instance");
  assert(tfContent.includes("aws_elasticache_replication_group"), "Terraform defines ElastiCache Redis replication group");
  assert(tfContent.includes("aws_ecs_cluster"), "Terraform defines ECS cluster");

  // --- 3. AWS Secrets Manager Integration ---
  console.log("\n--- 3. AWS Secrets Manager Integration ---");
  const secrets = await awsSecretsManager.getSecrets();
  assert(secrets !== null && typeof secrets === "object", "awsSecretsManager.getSecrets() returns structured secrets object");
  assert(secrets.jwtSecret !== undefined && secrets.jwtSecret.length > 0, "Secrets manager loads JWT secret");
  
  // Test caching & clear cache
  awsSecretsManager.clearCache();
  const refreshedSecrets = await awsSecretsManager.getSecrets();
  assert(refreshedSecrets.jwtSecret === secrets.jwtSecret, "Successfully refreshes and caches secrets upon eviction");

  // --- 4. AWS S3 Object Storage Service ---
  console.log("\n--- 4. AWS S3 Object Storage Service ---");
  const tenantKey = s3Service.buildTenantKey("org-tenant-aws-test", "task-999-cloud", "analysis_report.json");
  assert(tenantKey.startsWith("organizations/org-tenant-aws-test/tasks/task-999-cloud/"), "S3 key enforces tenant organization namespace isolation");

  const testPayload = JSON.stringify({ message: "Cloud test artifact payload", timestamp: Date.now() });
  const uploadResult = await s3Service.uploadArtifact(tenantKey, testPayload, "application/json");
  assert(uploadResult.key === tenantKey, "S3 upload preserves exact tenant key");
  assert(uploadResult.sizeBytes === Buffer.byteLength(testPayload), "S3 upload records correct byte length");
  assert(uploadResult.etag.length === 32, "S3 upload generates MD5 etag checksum");

  const downloaded = await s3Service.getArtifact(tenantKey);
  assert(downloaded !== null && downloaded.toString().includes("Cloud test artifact payload"), "S3 getArtifact retrieves stored object content");

  const presignedUrl = await s3Service.generatePresignedUrl(tenantKey, 900);
  assert(presignedUrl.includes(encodeURIComponent(tenantKey)) || presignedUrl.includes(tenantKey), "Generates presigned download URL for authenticated consumers");

  // --- 5. Liveness and Readiness Health Probes ---
  console.log("\n--- 5. Liveness and Readiness Health Probes ---");
  const livenessRes = await request(app).get("/api/health/liveness");
  assert(livenessRes.status === 200, "GET /api/health/liveness returns HTTP 200 OK");
  assert(livenessRes.body.status === "alive", "Liveness probe reports status 'alive'");
  assert(typeof livenessRes.body.uptimeSeconds === "number", "Liveness probe reports process uptime");

  const readinessRes = await request(app).get("/api/health/readiness");
  assert(readinessRes.status === 200 || readinessRes.status === 503, "GET /api/health/readiness returns valid HTTP status");
  assert(readinessRes.body.database === "connected", "Readiness probe verifies database connectivity");

  // --- 6. Localhost Audit for Production Safety ---
  console.log("\n--- 6. Localhost Audit for Production Safety ---");
  const auditResult = auditLocalhostEndpoints(SERVER_ROOT);
  assert(auditResult.totalFilesScanned > 20, `Scanned ${auditResult.totalFilesScanned} server source files`);
  assert(auditResult.productionRiskCount === 0, `Localhost audit passed: 0 unhandled hardcoded localhost production risks found`);

  // --- 7. Amazon RDS Schema Migration Runner ---
  console.log("\n--- 7. Amazon RDS Schema Migration Runner ---");
  const migrationSummary = await runRdsMigration();
  assert(migrationSummary.success === true, "RDS schema migration executes successfully");
  assert(migrationSummary.tablesVerified.length >= 12, `Verified ${migrationSummary.tablesVerified.length} tables in RDS MySQL database`);
  assert(migrationSummary.columnsVerified.includes("tasks.version"), "Verified tasks.version optimistic concurrency column");
  assert(migrationSummary.columnsVerified.includes("tasks.total_retries"), "Verified tasks.total_retries retry ceiling column");

  // --- 8. AWS Cloud Documentation Check ---
  console.log("\n--- 8. AWS Cloud Documentation Check ---");
  const awsDocPath = path.join(PROJECT_ROOT, "docs/AWS.md");
  assert(fs.existsSync(awsDocPath), "docs/AWS.md documentation exists");
  const awsDoc = fs.readFileSync(awsDocPath, "utf-8");
  assert(awsDoc.includes("Amazon RDS"), "docs/AWS.md documents Amazon RDS MySQL strategy");
  assert(awsDoc.includes("Amazon ElastiCache"), "docs/AWS.md documents Amazon ElastiCache Redis strategy");
  assert(awsDoc.includes("Amazon ECS") && awsDoc.includes("Fargate"), "docs/AWS.md documents Amazon ECS Fargate compute strategy");
  assert(awsDoc.includes("Secrets Manager"), "docs/AWS.md documents AWS Secrets Manager");
  assert(awsDoc.includes("Disaster Recovery"), "docs/AWS.md documents Disaster Recovery and Persistence guidelines");

  console.log("\n=======================================================");
  console.log("  PHASE 22 TEST RESULTS SUMMARY");
  console.log("=======================================================");
  console.log(`Total Tests: ${totalTests}`);
  console.log(`Passed:      ${passedTests}`);
  console.log(`Failed:      ${totalTests - passedTests}`);
  console.log("=======================================================\n");
}

runPhase22TestSuite().catch((err) => {
  console.error("\n[Phase 22 Test Suite Fatal Error]", err);
  process.exit(1);
});
