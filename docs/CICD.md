# Continuous Integration, Automated Delivery & Production Deployment (CI/CD)

## 1. Overview & Core Philosophy

This document defines the automated delivery architecture, Continuous Integration (CI), and Continuous Delivery/Deployment (CD) pipelines for the **AI Workforce Platform**.

The foundational principle of Phase 23 is:

> **Automation must execute a verified deployment process, never bypass the application's governance, tenant isolation, or security controls.**

CI/CD automates infrastructure and application delivery; it does **not** become an application superuser, disable authentication, or bypass human approval boundaries.

```text
Developer Writes Code
        │
        ▼
   Git Push / PR
        │
        ▼
   Automated CI
        ├─► Reproducible Install (Node 22, npm ci)
        ├─► Secret Scanning (Zero Credentials in Git)
        ├─► Linting & Type Checking (tsc --noEmit)
        ├─► Unit & Integration Tests
        ├─► AI & Security Regressions
        ├─► Application Builds
        └─► Container Build Verification
        │
        ▼
  Immutable Release Artifact (Git SHA)
        │
        ▼
   Production CD
        ├─► AWS OIDC Short-Lived Credential Assumption
        ├─► Trivy Vulnerability Scan & ECR Push
        ├─► Non-Destructive RDS Migration (Expand Phase)
        ├─► ECS Fargate Rolling Deployment (API & Headless Worker)
        ├─► Health Probes (/api/health/liveness & /readiness)
        └─► Post-Deploy Smoke Tests (Deterministic AI Tool)
        │
        ├────── FAIL ─────► Automated Rollback (Previous Task Revision)
        │
        ▼
  Verified Production Release
```

---

## 2. Branching Model & Pull Request Policies

### Branch Structure

```text
main (Protected production branch)
 │
 ├── feature/governed-tool-*
 ├── fix/retry-ceiling-*
 └── chore/dependency-upgrade-*
```

### Branch Protection Rules for `main`
1. **Pull Request Required**: Direct pushes to `main` are restricted.
2. **Required Status Checks**: All CI workflow jobs must pass before merging:
   - Secret Scanning & Security Verification
   - Linting & Type Checking (`tsc --noEmit`, `tsc -b`)
   - Unit, Integration & AI Regression Tests
   - Application & Container Build Verification
3. **No Force Pushing**: History rewrites on `main` are strictly forbidden.
4. **Linear Git History**: Clean squashed or rebased commits with traceable commit SHAs.

---

## 3. Continuous Integration Pipeline (`.github/workflows/ci.yml`)

The CI pipeline runs on every Pull Request targeting `main` and on merges to `main`.

| Stage | Responsibility | Failure Condition |
|---|---|---|
| **Runtime Version** | Explicitly pins Node.js 22.x to match local development and Alpine Docker images. | Runtime mismatch fails immediately. |
| **Dependency Discipline** | Uses `npm ci` referencing `package-lock.json` to ensure 100% reproducible dependency trees. | Discrepant lockfiles fail build. |
| **Secret Scanning** | Scans all repository files for committed AWS keys (`AKIA...`), private keys, or API tokens. | Any detected secret halts pipeline. |
| **Type Checking** | Runs `tsc --noEmit` across server and client projects. | Any type discrepancy fails check. |
| **Regression Tests** | Executes AI prompt injection defenses, tool allowlist checks, and reliability suites. | Any regression fails build. |
| **Docker Build Check** | Builds `Dockerfile.api`, `Dockerfile.worker`, and `Dockerfile.client` to verify container compilation. | Docker syntax or build error fails check. |

---

## 4. Continuous Deployment Pipeline (`.github/workflows/cd.yml`)

The CD pipeline triggers upon merges into `main` or via manual `workflow_dispatch`.

### 4.1 Short-Lived Cloud Credentials (AWS OIDC)
The platform **never** commits or stores long-lived AWS Access Keys (`AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`) in GitHub Secrets.
Instead, GitHub Actions assumes an IAM Deployment Role via **OpenID Connect (OIDC)**:

```yaml
- name: Configure AWS Credentials (OIDC Short-Lived)
  uses: aws-actions/configure-aws-credentials@v4
  with:
    role-to-assume: ${{ secrets.AWS_DEPLOYMENT_ROLE_ARN }}
    aws-region: us-east-1
    audience: sts.amazonaws.com
```

### 4.2 Immutable Image Tagging
Every Docker image pushed to Amazon ECR is tagged with an **immutable Git commit SHA** and a moving `production` pointer:
- `123456789012.dkr.ecr.us-east-1.amazonaws.com/ai-workforce-api:8f39eb3` (Immutable SHA)
- `123456789012.dkr.ecr.us-east-1.amazonaws.com/ai-workforce-api:production` (Moving pointer)

This ensures any production deployment can be deterministically traced to the exact source commit.

### 4.3 Container Security Scanning
Before pushing to production ECR registries, container images are scanned for vulnerabilities via Trivy:
- **Critical / High** CVEs are flagged.
- Vulnerable base images block production rollout.

---

## 5. Database Migration Strategy (Expand / Contract)

Database migrations and application rollbacks must be safely decoupled.

```text
1. Expand
   ├── Add nullable columns or new tables (e.g. tasks.version, tasks.total_retries)
   └── Run non-destructive migration runner (`npm run db:migrate-rds`)
2. Deploy Compatible Application
   ├── New container version uses expanded schema while tolerating legacy data
   └── Old container version still functions if rollback occurs
3. Verify Application Health
4. Contract (Subsequent Release)
   └── Deprecate and remove legacy unused columns only after all consumers are updated
```

Arbitrary or destructive SQL (`DROP TABLE`, `ALTER TABLE DROP COLUMN`) during deployment is strictly prevented.

---

## 6. Worker & Queue Safety During Deployment

When updating ECS Fargate services for the Headless Worker daemon:

1. **Graceful Shutdown**:
   - The ECS task receives `SIGTERM`.
   - The worker stops dequeuing new jobs from Redis.
   - Active jobs are given up to 30 seconds to finish their current cycle or yield safe checkpoints.
2. **Queue Durability**:
   - Jobs are not silently lost.
   - In-flight Redis leases that expire return safely to the queue according to Phase 19 reliability policies.
3. **Approval State Durability**:
   - Tasks in `WAITING_FOR_APPROVAL` are **never** converted to `APPROVED` or bypassed by container restarts.
   - When the new worker starts up, human approval boundaries remain intact.

---

## 7. Production Health Verification & Smoke Tests

A deployment is not declared successful merely because AWS ECS accepted the container. Post-deployment verification executes:

1. **Liveness Probe**: `GET /api/health/liveness` verifies node process uptime and memory health.
2. **Readiness Probe**: `GET /api/health/readiness` verifies live Amazon RDS MySQL and ElastiCache Redis connectivity.
3. **Build Metadata Verification**: `GET /api/health` returns safe release information:
   ```json
   {
     "status": "ok",
     "version": "1.0.0",
     "commit": "8f39eb3",
     "buildTime": "2026-10-08T00:00:00Z",
     "environment": "production"
   }
   ```
4. **Deterministic AI Smoke Test**:
   - Proposes execution of the deterministic `calculate` tool.
   - Tool registry validates input schema against math grammar allowlist.
   - Executes calculation safely without `eval()`.
   - Persists verified observation.

---

## 8. Rollback Strategy & Disaster Recovery

Every deployment maintains an automated rollback mechanism.

```text
Active Version B Deployed
        │
        ▼
Run Smoke Tests & Health Probes
        │
     [FAILURE]
        │
        ▼
Automated Rollback Triggered
        │
        ├─► Revert ECS Service to Task Definition Revision A
        ├─► Re-route Traffic to Stable Container
        ├─► Health Probes Confirmed Healthy (HTTP 200)
        └─► Record Rollback Incident in Audit Log
```

### Rollback Commands
In the event of an automated or manual rollback trigger:
```bash
# Revert API Service to known stable revision
aws ecs update-service \
  --cluster ai-workforce-cluster \
  --service ai-workforce-api \
  --task-definition ai-workforce-api:PREVIOUS_REVISION

# Revert Worker Service to known stable revision
aws ecs update-service \
  --cluster ai-workforce-cluster \
  --service ai-workforce-worker \
  --task-definition ai-workforce-worker:PREVIOUS_REVISION
```

---

## 9. AI Workforce Regression Test Suite

Because this is a governed AI platform, CI/CD guards against behavioral and security regressions:

- **Tool Allowlist Guard**: Arbitrary or unregistered tools (e.g. `execute_arbitrary_sql`) cannot be executed.
- **Input Sanitization**: Malicious shell or SQL payloads are rejected at schema parsing.
- **Prompt Injection Defense**: Adversarial prompts cannot bypass tool policies or elevate privileges.
- **Tenant Isolation**: Tasks and documents strictly require organization tenant ID scoping.
- **Approval Enforcement**: Outbound communications (`gmailSend`) strictly require human approval.

---

## 10. CI/CD Security Checklist

- [x] **No static AWS credentials committed to repository.**
- [x] **AWS OIDC federation configured for short-lived credentials.**
- [x] **Secret scanning active in CI pipeline.**
- [x] **Immutable container image tags tied to Git commit SHA.**
- [x] **Reproducible dependency installation via `npm ci`.**
- [x] **Type checks (`tsc --noEmit`) and linting required before merge.**
- [x] **Non-destructive RDS database migration (Expand phase).**
- [x] **Graceful worker shutdown and job queue durability.**
- [x] **Approval boundaries preserved across worker redeployments.**
- [x] **Automated rollback on post-deployment health check failure.**
- [x] **Production build metadata exposed safely on `/api/health`.**
- [x] **AI workforce regression test suite integrated into CI.**
