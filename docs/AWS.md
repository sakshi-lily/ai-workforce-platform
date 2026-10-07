# Phase 22 — AWS Deployment & Cloud Infrastructure

## 1. Overview & Cloud Architecture

Phase 22 transitions the **AI Workforce Platform** from local Docker containers into a production-grade Amazon Web Services (AWS) cloud environment.

> **Core AWS Principle:** AWS infrastructure supports and scales the application architecture; it does not replace it. The application remains the authoritative security, tenant isolation, tool governance, and execution boundary.

### 1.1 Production AWS Architecture Diagram

```text
                                  INTERNET
                                     |
                                     v
                       Amazon Route 53 (DNS: app.domain.com)
                                     |
                                     v
                   AWS Certificate Manager (ACM TLS / HTTPS)
                                     |
                                     v
              Application Load Balancer (ALB) [Public Subnets]
                                     |
                +--------------------+--------------------+
                | Path: /                                 | Path: /api/*
                v                                         v
        Client Target Group                       API Target Group
        (ECS Fargate - Nginx)                     (ECS Fargate - Express)
        Port 80                                   Port 3000
                                                          |
                          +-------------------------------+-------------------------------+
                          |                               |                               |
                          v                               v                               v
                  Amazon RDS MySQL 8.4         Amazon ElastiCache Redis          Qdrant Vector Engine
                  [Private DB Subnet]          [Private DB Subnet]               [Private App Subnet]
                  Port 3306                    Port 6379                         Port 6333
                          ^                               |                               ^
                          |                               v                               |
                          |                        Redis Priority Queue                   |
                          |                               |                               |
                          |                               v                               |
                          |                     Worker Service (Headless)                 |
                          |                     (ECS Fargate - Worker)                    |
                          |                               |                               |
                          +-------------------------------+-------------------------------+
                                                          |
                                           +--------------+--------------+
                                           |              |              |
                                           v              v              v
                                        OpenAI       Web Search        Gmail
                                      (External)     (External)      (External)
```

---

## 2. AWS Region & Network Architecture (VPC)

### 2.1 Region Selection
- **Primary Region:** `ap-south-1` (Asia Pacific - Mumbai).
- **Rationale:** Low latency, full AWS managed service availability (ECS Fargate, RDS MySQL 8.4, ElastiCache, S3, Secrets Manager, CloudWatch), and cost optimization.

### 2.2 VPC & Subnet Layout
- **VPC CIDR:** `10.0.0.0/16`
- **Subnet Allocation (Across 2 Availability Zones):**
  - **Public Subnets (`10.0.1.0/24`, `10.0.2.0/24`):** Hosts Application Load Balancers and NAT Gateway. Publicly routable via Internet Gateway.
  - **Private App Subnets (`10.0.10.0/24`, `10.0.11.0/24`):** Hosts ECS Fargate containers (API, Worker, Qdrant). Outbound internet access mediated through NAT Gateway. Zero public IPs.
  - **Private Database Subnets (`10.0.20.0/24`, `10.0.21.0/24`):** Hosts Amazon RDS MySQL and Amazon ElastiCache Redis. Strictly isolated with no internet access.

### 2.3 Security Group Ingress Matrix (Least Privilege)

| Security Group | Inbound Ports | Allowed Source | Purpose |
| :--- | :--- | :--- | :--- |
| **`ALBSecurityGroup`** | `80`, `443` | `0.0.0.0/0` (Internet) | Public HTTPS entry point |
| **`ECSSecurityGroup`** | `3000`, `80` | `ALBSecurityGroup` only | Application container ingress |
| **`RDSSecurityGroup`** | `3306` | `ECSSecurityGroup` only | MySQL relational database |
| **`RedisSecurityGroup`** | `6379` | `ECSSecurityGroup` only | Redis queues, locks, and cache |
| **`QdrantSecurityGroup`** | `6333` | `ECSSecurityGroup` only | Vector semantic search |

> [!CAUTION]
> Neither RDS MySQL, ElastiCache Redis, nor Qdrant are ever assigned public IP addresses or exposed to `0.0.0.0/0`.

---

## 3. Compute Strategy: Amazon ECS on AWS Fargate

The platform uses **Amazon ECS with AWS Fargate** for serverless container execution:
- Eliminates EC2 server patching, OS maintenance, and cluster scaling overhead.
- Preserves the Docker container contracts established in Phase 21.

### 3.1 Task Separation (API vs Worker)
1. **API Service (`ai-workforce-api`):**
   - **Compute:** 0.5 vCPU, 1 GB RAM (Fargate).
   - **Command:** `node dist/server.js`.
   - **Health Probe:** Connected to ALB target group checking `/api/health/readiness`.
   - **Role:** Handles client HTTP requests, user authentication, task submission, and human approvals.
2. **Worker Service (`ai-workforce-worker`):**
   - **Compute:** 0.5 vCPU, 1 GB RAM (Fargate).
   - **Command:** `node dist/jobs/workerRunner.js`.
   - **Headless:** Exposes no public or internal HTTP ports.
   - **Role:** Independently drains Redis priority queues, executes governed agent steps, and commits durable state directly to MySQL.

---

## 4. Managed Persistence & Storage Strategy

### 4.1 Amazon RDS for MySQL 8.4
- **Engine:** MySQL Community 8.4.
- **Storage:** General Purpose SSD (gp3) with 20 GB baseline, autoscale up to 100 GB.
- **Encryption:** Storage encrypted at rest via AWS KMS (`StorageEncrypted: true`).
- **Backups:** Automated daily snapshots with 7-day point-in-time recovery window.
- **High Availability:** Multi-AZ deployment option enabled for production.

### 4.2 Amazon ElastiCache for Redis
- **Role:** High-speed queue transport, distributed locks (`SET NX EX`), and cache.
- **Persistence:** Append-Only File (AOF) durability enabled.
- **Security:** In-transit encryption and at-rest encryption enabled.
- **Resilience Policy:** Redis is treated as a coordination layer. If Redis encounters transient downtime, MySQL remains the immutable source of truth for task status.

### 4.3 Amazon S3 Object Storage
- **Bucket:** `ai-workforce-artifacts-{AccountId}-{Environment}`.
- **Security:** Public Access Block active (`BlockPublicAcls: true`, `BlockPublicPolicy: true`), AES-256 server-side encryption, and bucket versioning.
- **Tenant Isolation:** Keys are strictly namespaced:
  `organizations/{orgId}/tasks/{taskId}/{filename}`.
- **Presigned URLs:** Authenticated users access generated artifacts and exports via short-lived presigned URLs (15–60 minutes TTL).

### 4.4 Qdrant Vector Engine Strategy
- **Deployment:** Deployed on ECS Fargate within the private application subnet using Amazon EFS persistent storage, or connected to managed Qdrant Cloud via private endpoint.
- **Isolation:** Never exposed directly to the browser. All semantic queries are routed through the backend API/worker.

---

## 5. Secrets Management (AWS Secrets Manager)

Sensitive credentials are stored in **AWS Secrets Manager** (`ai-workforce/{environment}/secrets`):
- `DATABASE_PASSWORD`
- `JWT_SECRET`
- `OPENAI_API_KEY`
- `GMAIL_CLIENT_SECRET`
- `SERPAPI_API_KEY`

### 5.1 Runtime Retrieval Architecture
- Application containers fetch secrets on startup via `awsSecretsManager.getSecrets()`.
- Secrets are cached in-memory with a 5-minute TTL to minimize AWS API charges.
- **Zero Secrets in Docker Images:** Container images stored in ECR contain strictly compiled application code.
- **Zero Secrets in Frontend:** The React client receives only authorized public data.

---

## 6. Observability, Health Probes & Monitoring

### 6.1 Liveness vs. Readiness Probes
- **Liveness Probe (`GET /api/health/liveness`):**
  - Answers: *Is the Node.js process alive?*
  - Used by: ECS Fargate container restart monitoring.
- **Readiness Probe (`GET /api/health/readiness`):**
  - Answers: *Can this instance safely process user traffic?*
  - Verifies: Active MySQL connection and Redis connectivity.
  - Used by: ALB Target Group routing.

### 6.2 Amazon CloudWatch Logging
- Log groups: `/ecs/production-ai-workforce-api` and `/ecs/production-ai-workforce-worker`.
- Format: Structured JSON written to `stdout`/`stderr`.
- Retention: 30-day automated log retention.
- Sensitive Data Scrubbing: Passwords, authorization tokens, and API keys are stripped before logging.

### 6.3 CloudWatch Alarms
1. **API 5XX Error Rate:** Alarm triggers if HTTP 5xx responses exceed 1% over 5 minutes.
2. **Container Crash Loop:** Alarm triggers if ECS task restart count exceeds 3 in 10 minutes.
3. **RDS CPU Utilization:** Alarm triggers if database CPU exceeds 80% for 15 minutes.
4. **Queue Backlog:** Alarm triggers if Redis pending job count exceeds 50 for 10 minutes.

---

## 7. Localhost Audit & Production Safety

The repository includes an automated scanner (`server/src/aws/localhostAudit.ts`) verifying that no hardcoded `localhost` or `127.0.0.1` endpoints control production behavior.

```bash
# Run localhost safety audit
npx tsx src/aws/localhostAudit.ts
```
Expected result: `0 unhandled hardcoded localhost production risks found`.

---

## 8. Database Migration Runner for Amazon RDS

Database migrations are executed deterministically before promoting application containers:

```bash
# Set target RDS database credentials
export DB_HOST="your-rds-endpoint.ap-south-1.rds.amazonaws.com"
export DB_USER="workforce_admin"
export DB_PASSWORD="YourSecurePassword"
export DB_NAME="ai_workforce"

# Run schema migration
npm run db:migrate-rds
```
This applies all 12 tables (`users`, `tasks`, `task_steps`, `customers`, `tool_executions`, `approvals`, `audit_logs`, `ai_telemetry`, `gmail_connections`, `jobs`, `worker_heartbeats`, `job_attempts`) including optimistic concurrency (`version`) and retry ceilings (`total_retries`).

---

## 9. Infrastructure as Code (IaC)

Phase 22 supplies complete, validated Infrastructure-as-Code templates:

### 9.1 AWS CloudFormation
Located at [`infra/aws/cloudformation.yml`](file:///c:/Users/user/Downloads/files/ai-workforce-platform/infra/aws/cloudformation.yml). Deploy via AWS Console or CLI:
```bash
aws cloudformation deploy \
  --template-file infra/aws/cloudformation.yml \
  --stack-name ai-workforce-production \
  --parameter-overrides EnvironmentName=production PrimaryRegion=ap-south-1 \
  --capabilities CAPABILITY_IAM
```

### 9.2 HashiCorp Terraform
Located in [`infra/aws/terraform/`](file:///c:/Users/user/Downloads/files/ai-workforce-platform/infra/aws/terraform/):
```bash
cd infra/aws/terraform
terraform init
terraform plan -out=tfplan
terraform apply tfplan
```

---

## 10. Manual Deployment Workflow (Handoff to Phase 23)

Before CI/CD automation in Phase 23, the manual deployment lifecycle is:

1. **Test & Build:**
   ```bash
   npm run build
   npm run test:phase22
   ```
2. **Authenticate with ECR:**
   ```bash
   aws ecr get-login-password --region ap-south-1 | docker login --username AWS --password-stdin <account_id>.dkr.ecr.ap-south-1.amazonaws.com
   ```
3. **Build & Tag Production Images:**
   ```bash
   docker build -t ai-workforce-api:$(git rev-parse --short HEAD) -f server/Dockerfile server/
   docker tag ai-workforce-api:$(git rev-parse --short HEAD) <account_id>.dkr.ecr.ap-south-1.amazonaws.com/ai-workforce-api:$(git rev-parse --short HEAD)
   docker push <account_id>.dkr.ecr.ap-south-1.amazonaws.com/ai-workforce-api:$(git rev-parse --short HEAD)
   ```
4. **Apply RDS Migrations:**
   ```bash
   npm run db:migrate-rds
   ```
5. **Update ECS Services:**
   ```bash
   aws ecs update-service --cluster production-ai-workforce-cluster --service production-api-service --force-new-deployment
   aws ecs update-service --cluster production-ai-workforce-cluster --service production-worker-service --force-new-deployment
   ```
6. **Verify Cloud Health:**
   ```bash
   curl -f https://app.yourdomain.com/api/health/readiness
   ```

## 11. Persistence, Backups & Disaster Recovery

### 11.1 Authoritative vs Reconstructible Data
- **Amazon RDS MySQL (Authoritative Business Source of Truth):**
  - Contains users, tasks, task steps, tool executions, human approvals, audit logs, and attempt traces.
  - **Backup Policy:** Automated daily snapshots with 7-day retention and point-in-time recovery (PITR).
  - **Recovery Strategy:** In the event of primary database corruption, restore from the latest snapshot or PITR point.
- **Amazon ElastiCache Redis (Coordination & Ephemeral Queue):**
  - Contains priority queue transport and distributed locks.
  - **Recovery Strategy:** Reconstructible. Tasks are durably persisted in MySQL with status `QUEUED` / `RUNNING`. If Redis fails or restarts, the Phase 19 Stale Task Recovery sweeper automatically reclaims orphaned tasks and requeues them.
- **Qdrant Vector Database (Semantic Knowledge Index):**
  - Contains vector embeddings and chunk payloads.
  - **Recovery Strategy:** Can be rebuilt from original documents stored in Amazon S3 or recreated via embedding pipelines. Automated snapshot exports are persisted to S3.
- **Amazon S3 (Artifacts & Documents):**
  - Contains exported reports, documents, and historical artifacts.
  - **Backup Policy:** Bucket versioning enabled with lifecycle policies.

### 11.2 Disaster Recovery RPO and RTO Targets
- **Recovery Point Objective (RPO):** < 5 minutes (via RDS automated snapshots and transaction logs).
- **Recovery Time Objective (RTO):** < 30 minutes (via CloudFormation / Terraform IaC recreation in any availability zone).

---

## 12. Cost Control & Budget Targets

| Resource | Configuration | Estimated Monthly Cost (ap-south-1) |
| :--- | :--- | :--- |
| **ECS Fargate (API)** | 0.5 vCPU, 1 GB RAM (1 task) | ~$15 / month |
| **ECS Fargate (Worker)** | 0.5 vCPU, 1 GB RAM (1 task) | ~$15 / month |
| **Amazon RDS MySQL** | `db.t4g.micro`, 20 GB gp3 | ~$18 / month (Free tier eligible) |
| **Amazon ElastiCache** | `cache.t4g.micro`, 1 node | ~$13 / month |
| **Application Load Balancer** | 1 ALB + LCU hours | ~$18 / month |
| **Amazon S3 & Secrets Manager** | Artifacts storage & secret queries | ~$3 / month |
| **Amazon CloudWatch** | 5 GB logs + metrics | ~$3 / month |
| **Total Estimated Baseline** | | **~$85 / month** |

---

## 12. Phase 22 Security Checklist & Compliance

- [x] **No AWS Credentials in Git:** Zero access keys or secret keys in repository code or commits.
- [x] **No Secrets in Docker Images:** Dockerfiles contain zero secrets or build-time credentials.
- [x] **Database Isolation:** Amazon RDS MySQL is in private database subnets with no public IP.
- [x] **Redis Isolation:** Amazon ElastiCache is strictly non-routable from the public internet.
- [x] **Least-Privilege Security Groups:** Ingress paths restricted to ALB -> ECS -> RDS/Redis.
- [x] **Least-Privilege IAM Roles:** ECS Task Execution Role limited to ECR, CloudWatch, and specific Secrets Manager ARN.
- [x] **Tenant-Isolated S3 Keys:** S3 storage enforces `organizations/{orgId}/` key prefixes.
- [x] **Localhost Safety:** Zero unhandled hardcoded localhost production endpoints.
- [x] **Approval Boundary Preserved:** Container restarts or cloud deployments cannot bypass Human-in-the-Loop approval requirements.
- [x] **Automated Verification:** 30/30 tests pass in `server/src/aws/testPhase22.ts`.
