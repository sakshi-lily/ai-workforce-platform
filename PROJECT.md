# AI Workforce Platform

## Current Status: Phase 28 — Workforce Memory, Context Engineering & Persistent Organizational Intelligence (COMPLETED ✅)

### Project Status

**Current Phase:** Phase 28 — Workforce Memory, Context Engineering & Persistent Organizational Intelligence  
**Stage:** Governed Workforce Memory, Context Engineering Engine & Authoritative Precedence Architecture  
**Developer:** Sakshi  
**Workforce Health Score:** 97 / 100 (EXCELLENT) — 100% Golden Memory Regression Passed (12/12)  

### Phase 28 Deliverables Summary (Workforce Memory & Context Engineering)
- [x] **Controlled Workforce Memory Architecture:** Formal memory architecture in `server/src/memory/` adhering to the core principle: *Memory is NOT truth. MySQL is Authoritative Business Data. Qdrant is Semantic Knowledge. Memory is historical context. The LLM is reasoning/proposal. Memory cannot override policy or live data.*
- [x] **Memory Taxonomy & Scopes:** 6 explicit categories (`USER`, `ORGANIZATION`, `WORKFLOW`, `EPISODIC`, `TASK`, `SEMANTIC`) across strictly enforced scopes (`USER`, `ORGANIZATION`, `TASK`, `WORKFLOW`, `GLOBAL`) in `server/src/memory/types.ts`.
- [x] **Lifecycle & Versioned Supersession:** Dynamic lifecycle engine (`CANDIDATE` -> `VALIDATED` -> `ACTIVE` -> `UPDATED` -> `SUPERSEDED` -> `EXPIRED` / `DELETED`). Automatic supersession increments record versions and links `supersededById` without erasing historical provenance.
- [x] **Credential & Secret Rejection (`RESTRICTED_DATA_REJECTED`):** Pattern-based scanning in `server/src/memory/memoryPolicy.ts` immediately blocks API keys (`sk-...`), Bearer tokens, passwords, and private keys from ever entering memory storage.
- [x] **8-Tier Authority Precedence Hierarchy:** Strict governance hierarchy: `Platform Safety` -> `Organization Policy` -> `Current User Instruction` -> `Authoritative MySQL Data` -> `Approved Knowledge (RAG)` -> `Validated Memory` -> `Worker Observations` -> `Untrusted Content`.
- [x] **Authoritative Precedence & Conflict Annotation:** Contradiction engine in `server/src/context/contextPolicy.ts` asserting that live MySQL ledger state strictly prevails over historical memory (e.g. MySQL `DISQUALIFIED` overrides memory `QUALIFIED`), injecting a `ContextConflictAnnotation`.
- [x] **Prompt Injection Quarantining:** Memories formatted in structured, inert XML tags (`<authorized_memory>`) with non-executable disclaimer banners, preventing memory-based prompt injection or policy tampering.
- [x] **Context Builder & Token Budget Manager:** Centralized engine in `server/src/context/contextBuilder.ts` and `contextBudget.ts` bounding prompts to 4,000 tokens with non-destructive summarization for long observation histories while preserving safety policies 100% intact.
- [x] **Role-Based Context Slicing:** Specialized workers receive tailored memory envelopes (`RESEARCH_WORKER` receives research standards; `SYNTHESIS_WORKER` receives formatting/executive style preferences).
- [x] **Multi-Factor Retrieval Engine:** Multi-factor ranking formula combining relevance (0.35), confidence (0.20), source trust (0.20), freshness (0.15), and historical utility (0.10) with sub-2ms latency.
- [x] **Dynamic Utility Scoring Feedback Loop:** Real-time feedback API adjusting memory utility scores (+0.05 on helpful, -0.05 on unhelpful) to continuously suppress noisy memories.
- [x] **Golden 12-Scenario Regression Dataset & Evaluator:** Standardized evaluation suite in `evals/memory/dataset.json` and `server/src/memory/memoryEvaluator.ts` (12/12 scenarios passed, 100% score, 100% security compliance, 100% precedence accuracy).
- [x] **Product UI Studio Dashboard:** Modern interactive dashboard in `client/src/pages/MemoryStudioPage.tsx` with 4 views (Memory Explorer, Context Engine Simulator, Precedence Matrix, Regression Benchmarks) and navigation route `/app/memory`.
- [x] **Comprehensive Architecture Documentation:** Complete architectural specification in `docs/MEMORY_ARCHITECTURE.md` and phase report in `PHASE_28.md`.
- [x] **Phase 28 Test Suite:** 35/35 passing tests in `server/src/memory/testPhase28.ts` (`npm run test:phase28`). Zero regressions across earlier phases (54/54 in Phase 27, 71/71 in Phase 26, 14/14 smoke tests, zero secret leaks).

### Phase 27 Deliverables Summary (Autonomous Workforce Orchestration & Multi-Agent Collaboration)
- [x] **Governed Workforce Orchestrator:** Centralized coordination runtime in `server/src/orchestration/orchestrator.ts` enforcing state transitions (`REQUESTED` -> `PLANNING` -> `DISPATCHING` -> `RUNNING` -> `WAITING` -> `AGGREGATING` -> `VALIDATING` -> `SYNTHESIZING` -> `COMPLETED`). The LLM cannot declare task completion.
- [x] **Specialized Worker Roles & Registry:** Application-controlled registry in `server/src/orchestration/workerRegistry.ts` registering 6 specialized workers (`RESEARCH_WORKER`, `VERIFICATION_WORKER`, `KNOWLEDGE_WORKER`, `ANALYSIS_WORKER`, `COMMUNICATION_WORKER`, `SYNTHESIS_WORKER`) with strict capability allowlists and risk classifications.
- [x] **DAG Validator Engine & Cycle Rejection:** Directed Acyclic Graph validation in `server/src/orchestration/dagValidator.ts` detecting and rejecting circular dependency loops (`ORCHESTRATION_CYCLE`), bounding worker count (`MAX_WORKERS_PER_TASK = 8`) and depth (`MAX_DELEGATION_DEPTH = 4`), and partitioning nodes into topological parallel stages.
- [x] **Parallel Execution of Independent Workers:** Independent stage nodes execute concurrently in parallel via `Promise.all` (`Research`, `Verification`, and `Knowledge`), reducing wall-clock latency by 47% on complex multi-domain recon tasks.
- [x] **Controlled Context Isolation & Prompt Injection Defense:** Workers receive isolated context envelopes. External web data is encapsulated as untrusted observation data, preventing inter-worker instruction escape or prompt injection attacks.
- [x] **Conflict Resolution & 4-Tier Evidence Hierarchy:** Precedence evaluator in `server/src/orchestration/conflictResolver.ts` enforcing `MySQL Internal Ledger (Priority 1)` > `Internal RAG Knowledge (Priority 2)` > `Trusted Web Search (Priority 3)` > `Unverified Content (Priority 4)`. Formulates structured discrepancy resolutions with human review alerts.
- [x] **External Side-Effect Governance & Human Approval Integration:** Mutating worker actions (e.g. `COMMUNICATION_WORKER` sending emails) are intercepted and transitioned to `STAGED_FOR_APPROVAL`, preserving Phase 17/25 approval gates.
- [x] **Budget & Deadline Propagation:** Orchestrator enforces global task budget caps ($0.50) and propagates remaining time deadlines (`min(nodeTimeout, remainingDeadline)`). Prevents deadline extension through delegation.
- [x] **Workforce Templates:** Pre-approved reusable multi-agent templates in `server/src/orchestration/templates.ts` (`customer-research-and-verification`, `internal-policy-inquiry`, `client-statement-dispatch`).
- [x] **Golden Multi-Agent Regression Dataset & Evaluator:** Standardized test suite in `evals/multi-agent/dataset.json` and evaluator in `server/src/orchestration/multiAgentEvaluator.ts` (10/10 scenarios passed, 100% pass rate, 0 safety violations, +18.4% quality improvement).
- [x] **Workforce Trace UI Studio:** Modern product dashboard in `client/src/pages/WorkforceOrchestrationPage.tsx` with 4 interactive tabs (Live DAG Trace, Templates Studio, Capability Matrix, Evaluation Benchmarks).
- [x] **Comprehensive Documentation:** 12-section architecture specification in `docs/WORKFORCE_ARCHITECTURE.md` and complete phase technical record in `PHASE_27.md`.
- [x] **Phase 27 Test Suite:** 54/54 passing tests in `server/src/orchestration/testPhase27.ts` (`npm run test:phase27`). Zero regressions across earlier phases (71/71 in Phase 26, 73/73 in Phase 25, 14/14 smoke tests, zero secret leaks).

### Phase 26 Deliverables Summary (AI Workforce Intelligence & Optimization)
- [x] **Governed Continuous Improvement System:** Operational intelligence pipeline converting task telemetry into measured outcomes: Task Execution -> Telemetry -> Evaluation -> Feedback -> Intelligence -> Recommendations -> Controlled Experiments -> Regression Validation -> Improved Workforce.
- [x] **Non-Self-Modifying Safety Principle:** Strict architectural enforcement that the LLM proposes, the application controls, and humans/engineering approve changes. Zero autonomous prompt rewriting, model switching, tool creation, or production code self-modification.
- [x] **6-Dimensional Workforce Health Score:** Measurable composite health index (94/100, EXCELLENT) evaluated across Reliability (0.25), Quality (0.25), Efficiency (0.15), Security (0.15), Cost (0.10), and User Satisfaction (0.10) in `server/src/intelligence/intelligenceService.ts`.
- [x] **Task Quality Scoring & Outcome Taxonomy:** Separates technical completion (`COMPLETED`) from useful quality (`EXCELLENT`, `SATISFACTORY`, `NEEDS_REVIEW`, `POOR`) based on correctness, completeness, groundedness, tool accuracy, and efficiency. Taxonomy: `SUCCESS`, `PARTIAL_SUCCESS`, `FAILED`, `CANCELLED`, `TIMEOUT`, `BLOCKED`, `NEEDS_REVIEW`.
- [x] **Failure Intelligence & Root-Cause Analysis:** Standardized 8-category failure classification (`LLM_ERROR`, `TOOL_ERROR`, `TIMEOUT`, `AUTHORIZATION_ERROR`, `RETRIEVAL_FAILURE`, `PROVIDER_ERROR`, `INFRASTRUCTURE_ERROR`, `USER_INPUT_ERROR`), 5 root-cause domains, and multi-week failure trend tracking (8.4% -> 6.7% -> 4.9%).
- [x] **Agent Efficiency & Runaway Loop Protection:** Measures average cycles (3.2), max cycles (8), and efficiency ratio (0.86). Automated tool repetition detection flags redundant sequential searches; runaway agent anomaly detector triggers safe supervisor checkpoints.
- [x] **Tool Effectiveness Registry:** Real-time tracking of tool executions, success rates, failure rates, average latency, timeout rates, retry rates, and cost per execution across all registered platform tools.
- [x] **RAG Quality Analytics & Knowledge Gap Detection:** Measures retrieval similarity, groundedness (95.2%), and citation validity (97.1%). Knowledge Gap Engine aggregates recurring unfulfilled queries by topic and synthesizes documentation authoring recommendations.
- [x] **Cost Optimization & Centralized Model Benchmarking:** Daily, weekly, and monthly cost tracking against tenant budget caps ($41.50 spent of $100 cap). Centralized multi-provider benchmark table (`gpt-4o-mini`, `gpt-4o`, `claude-3-5-sonnet`, `gemini-1.5-pro`).
- [x] **Traceable Workforce & Prompt Versioning:** Authoritative `WorkforceVersionRecord` (`2026.10.08`, Agent `v2.4.0`) binding agent version, prompt versions (`agent-planner-v2.1`, `rag-answer-v1.4`), model configurations, and tool registries. `recordExecutionLineage` provides 100% reproducibility for historical tasks. Governed rollbacks audited.
- [x] **Controlled A/B Experimentation Engine:** Deterministic variant assignment using SHA-256 hash modulo on context ID. Running observation tracking and automated stop conditions aborting regressed variants.
- [x] **Governed Actionable Recommendations Engine:** Synthesizes evidence-backed recommendations (`problem`, `evidence`, `impact`, `suggestedAction`, `risk`). Governed lifecycle: `OPEN` -> `REVIEWING` -> `EXPERIMENTING` -> `ACCEPTED` / `REJECTED` -> `IMPLEMENTED`.
- [x] **Golden Dataset & Automated Regression Evaluation:** Standardized fixture dataset (`evals/golden/dataset.json`, version `golden-v1`) with 8 sanitized representative scenarios. Evaluates regression pass rate (100.0%) and zero safety breaches.
- [x] **Workforce Intelligence UI Studio:** Modern product dashboard in `client/src/pages/IntelligencePage.tsx` with 6 interactive tabs (Health & KPIs, Agent & Tools, RAG & Gaps, Cost & Models, Recommendations, Experiments & Versions) and interactive "Run Golden Eval" scorecard.
- [x] **Comprehensive Optimization Documentation:** 10-section report in `docs/OPTIMIZATION_REPORT.md` and complete technical specification in `PHASE_26.md`.
- [x] **Phase 26 Test Suite:** 71/71 passing tests in `server/src/intelligence/testPhase26.ts` (`npm run test:phase26`). Zero regressions across earlier phases (73/73 in Phase 25, 14/14 smoke tests, zero secret leaks).

### Phase 25 Deliverables Summary (Enterprise Productization, Administration & Governance)
- [x] **Multi-Tenant Organization Boundary:** Primary administrative boundary in `server/src/enterprise/organizationService.ts` establishing tenant settings, task duration ceilings, tool call bounds, and spend limits.
- [x] **User Lifecycle Management:** User directory management with explicit states (`ACTIVE`, `INVITED`, `SUSPENDED`, `DISABLED`), single-use 24-byte hex invitation tokens with 7-day TTL, and anti-replay activation.
- [x] **Roles & Server-Side Permissions Matrix:** Granular roles (`OWNER`, `ADMIN`, `MEMBER`, `OPERATOR`) mapped to 18 enterprise permissions (`organization.*`, `users.*`, `tasks.*`, `tools.*`, `approvals.*`, `integrations.*`, `audit.*`, `usage.*`) in `server/src/enterprise/types.ts`.
- [x] **7-Layer Precedence Policy Engine:** Deterministic evaluator in `server/src/enterprise/policyEngine.ts` evaluating `Platform Safety` -> `Organization Status & Kill Switch` -> `User Lifecycle Status` -> `User Permissions` -> `Organization Tool Policy` -> `AI Cost Budget Limits` -> `Tool Risk Policy & Approval Gate`. The LLM has zero policy authority.
- [x] **Tool Governance & Approval Policy:** Configurable tool policies (`ENABLED`, `REQUIRES_APPROVAL`, `DISABLED`) with deterministic conflict resolution (platform safety cannot be weakened by tenant policy).
- [x] **Emergency Operational Kill Switch:** Immediate tenant-wide freeze (`WORKFORCE_PAUSED`) halting autonomous executions with audited reasons.
- [x] **Authoritative Worker Re-Validation:** Background worker engine re-checks `isUserAuthorizedForTask()` prior to task execution, preventing stale execution of queued tasks for suspended accounts.
- [x] **Usage & AI Cost Governance:** Monthly spend budget tracking in `server/src/enterprise/usageService.ts` with pre-task budget enforcement (`NORMAL` < 75%, `WARNING` >= 75%, `LIMIT_REACHED` >= 100%), and breakdowns by user and tool.
- [x] **Tenant-Isolated Immutable Audit Trail:** Append-only structured audit logs in `server/src/enterprise/auditService.ts` with zero cross-tenant leakage.
- [x] **Integration Administration:** Safe provider summaries for OpenAI, Tavily, Qdrant, and Gmail with zero secret credentials leaked.
- [x] **Administrative UI Studio:** Modern enterprise dashboard in `client/src/pages/AdminPage.tsx` and navigation item in `client/src/layout/AppShell.tsx`.
- [x] **Enterprise Readiness Report:** 15-section comprehensive governance evaluation in `docs/ENTERPRISE_READINESS.md`.
- [x] **Phase 25 Test Suite:** 73/73 passing tests in `server/src/enterprise/testPhase25.ts` (`npm run test:phase25`).
- [x] **Evaluation Datasets (`evals/`):** Version-controlled test suites in `evals/agent/`, `evals/rag/`, `evals/tools/`, `evals/security/`, and `evals/fixtures/knowledge_docs.json`.
- [x] **Agent Planning & Efficiency Evaluation:** Tool call efficiency tracking (`requiredToolCalls / actualToolCalls`), tool allowlists, and runaway watchdog protection ceilings (max 10 cycles, max 15 tool calls, 30s timeout).
- [x] **RAG Grounding & Citation Validation:** Automated citation validation enforcing genuine source tokens (`[S1..Sn]`), rejecting fabricated citations (`[S99]`), and computing grounded answer rates.
- [x] **Tool Evaluation Matrix:** Conformance testing for `calculate`, `mysqlVerifyCustomer`, `webSearch`, and `gmailSend` verifying SQL injection immunity, untrusted data isolation, and human approval gating.
- [x] **Observability & Correlation Tracking:** Correlation context manager (`requestId`, `taskId`, `executionId`) and Express middleware (`x-request-id`, `x-correlation-id`).
- [x] **Structured Machine-Readable Logging:** JSON logging with automated redaction of sensitive credentials, passwords, JWTs, and API keys.
- [x] **Operational Metrics & Cost API:** Real-time dashboards at `/api/observability/dashboard` (tasks, queue, p50/p95 latency) and `/api/observability/costs` (token usage, $/task).
- [x] **Production Readiness Scorecard:** Weighted 7-dimension scorecard in `docs/PRODUCTION_READINESS.md` certifying system readiness.
- [x] **10 Operational Runbooks:** Recovery procedures in `docs/runbooks/` (`api-down`, `worker-failure`, `database-failure`, `redis-failure`, `qdrant-failure`, `llm-provider-failure`, `queue-backlog`, `deployment-failure`, `rollback`, `security-incident`).
- [x] **5 AI Evaluation Reports:** In `docs/evaluations/` (`agent-evaluation`, `rag-evaluation`, `tool-evaluation`, `security-evaluation`, `reliability-evaluation`).
- [x] **Phase 24 Test Suite:** 67/67 passing tests in `server/src/evals/testPhase24.ts`.
- [x] **Continuous Integration Pipeline (`.github/workflows/ci.yml`):** Automatic triggers on PRs and merges to `main`, explicit Node.js 22 runtime, reproducible `npm ci` installation, secret scanning, linting, strict `tsc --noEmit` type checking, AI regressions, and container runtime build verification (API liveness probe, client nginx health check, worker unprivileged non-root user validation).
- [x] **Continuous Deployment Pipeline (`.github/workflows/cd.yml`):** Automated delivery to production AWS environment, AWS OIDC short-lived credential federation (`role-to-assume`), container security vulnerability scanning via Trivy, Amazon ECR publishing with immutable Git SHA tags, non-destructive RDS migrations, Amazon ECS Fargate deployment, 14-point smoke testing, and automated rollback upon health failure.
- [x] **AWS OIDC Least Privilege Authentication:** Zero permanent AWS access keys in repository or CI; authentication uses temporary GitHub OIDC STS tokens with least privilege ECR, ECS, and PassRole permissions.
- [x] **Safe Build Metadata Telemetry:** `/api/health` exposes safe release telemetry (semantic version, Git commit SHA, build timestamp, environment) without exposing credentials.
- [x] **Post-Deployment Smoke Test Suite (`src/cicd/smokeTests.ts`):** 14 production-grade verification checks including ALB liveness (`/api/health/liveness`), readiness (`/api/health/readiness`), build telemetry, frontend asset delivery, auth flows, task schema lifecycle, worker Redlock keying, queue priority scoring, RDS MySQL, ElastiCache Redis, AI execution path readiness, deterministic tool execution (`calculate`), approval state persistence, and zero 5xx error verification.
- [x] **AI Workforce & Security Regression Suite (`src/cicd/securityRegressions.ts`):** Guarantees tool allowlists, parameter validation schemas, prompt injection containment, tenant isolation, and approval requirements for external side effects.
- [x] **Disaster Recovery & Automated Rollback Drill (`src/cicd/rollbackManager.ts`):** Automatic rollback mechanism reverts ECS task definitions to previous known stable versions upon simulated or real failure and records deployment audit records.
- [x] **Repository Secret Audit (`src/cicd/secretAudit.ts`):** Scans source code and configs to prevent accidental credential leakage in Git (155 files scanned, 0 violations).
- [x] **Comprehensive CI/CD Documentation:** Detailed operational guides in `docs/CICD.md`.
- [x] **Phase 23 Test Suite (`src/cicd/testPhase23.ts`):** 70/70 passing tests verifying Definition of Done and security checklists.

### Phase 22 Deliverables Summary (AWS Deployment & Cloud Infrastructure)
- [x] **CloudFormation & Terraform Infrastructure as Code:** Dedicated VPC (`10.0.0.0/16`), 6 multi-AZ subnets, NAT Gateway, least-privilege security groups, Amazon RDS MySQL 8.4, Amazon ElastiCache Redis, Amazon ECS Fargate, ALB, S3, Secrets Manager, Amazon ECR repositories (`api`, `worker`, `client`), and GitHub Actions OIDC identity provider/deployment role in `infra/aws/cloudformation.yml` and `infra/aws/terraform/`.
- [x] **AWS Secrets Manager Integration:** Encrypted credential resolution with in-memory TTL caching and graceful fallback in `server/src/config/awsSecrets.ts`.
- [x] **Amazon S3 Object Storage Service:** Strict tenant organization key isolation (`organizations/{orgId}/tasks/{taskId}/{filename}`), MD5 etags, and presigned URLs in `server/src/services/s3Service.ts`.
- [x] **Infrastructure Probes:** Dedicated ALB/ECS `/api/health/liveness` and `/api/health/readiness` endpoints in `server/src/routes/healthRoutes.ts`.
- [x] **Localhost Audit:** Production safety scanner verifying zero unhandled hardcoded localhost URLs across 110+ files in `server/src/aws/localhostAudit.ts`.
- [x] **Amazon RDS Migration Runner:** Automated migration script verifying 12 platform tables, optimistic concurrency (`tasks.version`), and retry ceilings (`tasks.total_retries`) in `server/src/db/migrateRds.ts`.
- [x] **Comprehensive AWS Documentation:** 12-section architecture, IAM, cost breakdown (~$85/mo), and disaster recovery guide in `docs/AWS.md`.
- [x] **Phase 22 Test Suite:** 55/55 passing tests in `server/src/aws/testPhase22.ts`.

### Phase 21 Deliverables Summary (Docker & Containerization)
- [x] **Production Multi-Stage Dockerfiles:** Hardened Dockerfiles for `api` (`docker/Dockerfile.api`), `worker` (`docker/Dockerfile.worker`), and `client` (`docker/Dockerfile.client`) using Node 22 Alpine, non-root `node` runtime user, and Nginx reverse proxy.
- [x] **Docker Compose Orchestration:** Full local environment orchestration in `docker-compose.yml` with health checks, network isolation (`workforce-network`), and volume persistence (`mysql_data`, `redis_data`, `qdrant_data`).
- [x] **Build Context Security:** `.dockerignore` excludes `.env`, `node_modules`, `.git`, and build outputs.
- [x] **Phase 21 Test Suite:** 73/73 passing tests in `server/src/docker/testPhase21.ts`.

---

# 1. Project Vision

The goal of this project is to build an AI Workforce Platform that can reduce repetitive and cyclic workloads for developers and businesses.

The platform will allow a user to provide a high-level task. An AI agent will understand the task, break it into smaller subtasks, retrieve relevant information, use available tools, analyze the results, make decisions within defined boundaries, perform approved actions, and generate a final report.

The long-term goal is to create a system that works more like a digital employee than a simple chatbot.

---

# 2. Problem Statement

Developers and businesses spend significant time performing repetitive tasks such as:

- Searching for information
- Collecting data from different sources
- Checking existing databases
- Reading internal documents
- Comparing information
- Preparing reports
- Writing emails
- Sending repetitive communications
- Updating records
- Performing the same workflow repeatedly

The platform will automate parts of these workflows while keeping humans in control of important actions.

---

# 3. Target Users

The initial platform can be designed for:

1. Developers
2. Startups
3. Small businesses
4. Sales and marketing teams
5. Operations teams
6. Students and researchers

The MVP will focus on a general-purpose task automation workflow.

---

# 4. Main User Input

The user should be able to provide a high-level task in natural language.

Example:

> Find potential SaaS customers in India, verify them using our database and internal company knowledge, qualify the best prospects, prepare personalized emails, and show me the emails for approval.

The user should not need to manually define every individual step.

---

# 5. Expected System Behavior

The system should eventually perform the following workflow:

```text
User gives high-level task
        ↓
AI understands requirement
        ↓
AI creates task plan
        ↓
Task is divided into subtasks
        ↓
Agent selects required tools
        ↓
Web search / MySQL / RAG / APIs
        ↓
Information is collected
        ↓
Information is verified
        ↓
AI analyzes information
        ↓
AI makes a decision
        ↓
Action is prepared
        ↓
Human approval if required
        ↓
Approved action is executed
        ↓
Results are stored
        ↓
Final report is generated
```

---

# 6. Real-World Example

## Customer Discovery and Outreach

A user provides:

> Find potential customers for our software product.

The system should eventually:

### Step 1 — Understand

Understand what type of customer the user wants.

### Step 2 — Plan

Create subtasks such as:

```text
1. Search for potential companies
2. Collect company information
3. Verify companies against MySQL
4. Search internal knowledge
5. Qualify companies
6. Generate personalized emails
7. Ask user for approval
8. Send approved emails
9. Store results
10. Generate report
```

### Step 3 — Web Search

Search publicly available information.

### Step 4 — MySQL Verification

Check whether companies already exist in the business database.

### Step 5 — RAG

Search internal documents and company knowledge.

### Step 6 — Qualification

Analyze the collected information and determine whether the company is a potential customer.

### Step 7 — Email Preparation

Generate a personalized Gmail message.

### Step 8 — Human Approval

Show the proposed email to the user.

The user can:

```text
Approve
Reject
Edit
```

### Step 9 — Gmail

Only approved emails are sent.

### Step 10 — Store Results

Save:

- Company
- Contact
- Qualification
- Email status
- Timestamp
- Agent decision
- Action result

### Step 11 — Report

Generate a final summary.

---

# 7. Functional Requirements

The MVP should eventually support:

## User Management

- User registration
- User login
- Authentication
- User-specific tasks

## Task Management

- Create task
- View task
- Track task status
- View subtasks
- View results
- View task history

## AI Processing

- Understand natural-language tasks
- Generate task plans
- Break tasks into subtasks
- Analyze information
- Generate structured results

## Tools

The system should eventually provide tools for:

- Web search
- MySQL queries
- RAG retrieval
- Gmail
- Internal APIs

## Human Approval

The system should allow approval before sensitive actions.

## Reporting

The system should provide:

- Task summary
- Actions performed
- Information collected
- Decisions made
- Errors
- Final results

---

# 8. Non-Functional Requirements

The platform should be designed with the following requirements:

### Security

Sensitive credentials and API keys must never be hardcoded.

### Reliability

Failed operations should be detected and handled properly.

### Scalability

Long-running AI tasks should eventually be processed using background workers.

### Performance

Frequently accessed information should be cached where appropriate.

### Maintainability

Frontend, backend, AI logic, tools, and workers should have clear separation.

### Auditability

Important AI decisions and actions should be recorded.

### Human Control

The AI should not automatically perform sensitive actions without permission.

---

# 9. Technology Stack

## Frontend

- React
- TypeScript
- Vite
- Tailwind CSS
- React Router

## Backend

- Node.js
- Express.js
- TypeScript

## Structured Database

- MySQL

MySQL will store structured business information such as:

- Users
- Tasks
- Subtasks
- Customers
- Contacts
- Actions
- Results
- Approval records
- Audit logs

## Cache and Queue

- Redis

Redis will eventually be used for:

- Caching
- Temporary state
- Rate limiting
- Background job queues

## Vector Database

- Qdrant

Qdrant will store vector embeddings for semantic retrieval.

## AI

- LLM API
- Embeddings
- AI agent
- Tool calling

## RAG

Retrieval-Augmented Generation will be used to retrieve relevant internal knowledge before generating AI responses.

## Email

- Gmail API
- OAuth

## Deployment

- Docker
- AWS

## CI/CD

- GitHub Actions

---

# 10. High-Level Architecture

The initial architecture should follow this structure:

```text
                    ┌─────────────────┐
                    │   React Client  │
                    │ Tailwind + TS   │
                    └────────┬────────┘
                             │
                             │ HTTP/API
                             ▼
                    ┌─────────────────┐
                    │ Node + Express  │
                    │     Backend     │
                    └────────┬────────┘
                             │
          ┌──────────────────┼──────────────────┐
          │                  │                  │
          ▼                  ▼                  ▼
     ┌─────────┐        ┌─────────┐       ┌─────────┐
     │  MySQL  │        │  Redis  │       │   LLM   │
     │Structured│       │ Cache / │       │   API   │
     │  Data   │        │ Queue   │       └────┬────┘
     └─────────┘        └─────────┘            │
                                               ▼
                                       ┌──────────────┐
                                       │ AI Agent     │
                                       └──────┬───────┘
                                              │
                     ┌────────────────────────┼─────────────────────┐
                     │                        │                     │
                     ▼                        ▼                     ▼
                Web Search                MySQL Tool          RAG / Qdrant
                     │                        │                     │
                     └────────────────────────┼─────────────────────┘
                                              │
                                              ▼
                                         Gmail Tool
                                              │
                                              ▼
                                       Human Approval
                                              │
                                              ▼
                                         Final Action
```

---

# 11. Responsibilities of Each Component

## React

Responsible for:

- User interface
- Task creation
- Task status
- Agent progress
- Approval screen
- Results
- Reports

React should NOT directly access MySQL.

---

## Express Backend

Responsible for:

- API endpoints
- Authentication
- Validation
- Business logic
- Communication with databases
- Communication with AI services
- Tool permissions

---

## MySQL

Used for structured and relational information.

Example:

```text
users
tasks
task_steps
customers
contacts
actions
approvals
audit_logs
```

---

## Redis

Used where extremely fast temporary storage or asynchronous processing is useful.

Examples:

```text
cache
job queue
temporary agent state
rate limits
```

---

## Qdrant

Used for semantic search over internal knowledge.

Example documents:

```text
Company policies
Product documentation
Sales guidelines
Internal FAQs
Business documents
```

---

## LLM

The LLM is responsible for:

- Understanding natural language
- Planning
- Reasoning
- Extracting information
- Generating text
- Choosing tools

The LLM should NOT have unrestricted direct access to infrastructure.

---

## Agent

The agent combines:

```text
LLM
+
Tools
+
Task state
+
Memory
+
Rules
```

The agent decides what action should happen next.

---

## Tools

Tools provide controlled capabilities to the agent.

Examples:

```text
webSearch()
queryDatabase()
retrieveKnowledge()
prepareEmail()
sendEmail()
```

The application controls which tools the agent is allowed to use.

---

## Human Approval

Sensitive actions should require explicit user approval.

Example:

```text
AI prepares email
       ↓
Approval required
       ↓
User reviews
       ↓
Approve
       ↓
Gmail sends email
```

---

# 12. Data Categories

The platform will eventually handle different types of data.

## Structured Data

Stored in MySQL.

Example:

```text
Customer name
Email
Company
Industry
Status
Created date
```

## Temporary/Fast Data

Stored in Redis.

Example:

```text
Cache
Job status
Temporary state
```

## Semantic Knowledge

Stored as embeddings in Qdrant.

Example:

```text
Internal documentation
Policies
Product information
Company knowledge
```

## Agent State

Used to track:

```text
Current task
Current step
Previous actions
Tool results
Pending actions
```

---

# 13. MVP Scope

The first working version should NOT contain everything.

The MVP should focus on:

```text
React frontend
       ↓
Express backend
       ↓
LLM
       ↓
Simple Agent
       ↓
Web Search Tool
       ↓
MySQL Verification
       ↓
Results
```

The MVP should allow a user to provide a task and receive useful AI-generated results.

---

# 14. Features NOT Required in Initial MVP

Do not build these initially:

- Complex multi-agent systems
- Advanced RAG
- Gmail automation
- AWS deployment
- Docker
- CI/CD
- Distributed workers
- Advanced monitoring
