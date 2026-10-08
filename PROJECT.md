# AI Workforce Platform

## Current Status: Phase 23 — CI/CD, Automated Delivery & Production Deployment (ROADMAP COMPLETED ✅)

### Project Status

**Current Phase:** Phase 23 — CI/CD, Automated Delivery & Production Deployment  
**Stage:** Full 23-Phase Roadmap Completed & Production-Verified (All Tests Passing, Zero Regressions)  
**Developer:** Sakshi

### Phase 23 Deliverables Summary (CI/CD & Automated Delivery)
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
