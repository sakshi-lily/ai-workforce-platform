# AI Workforce Platform

## Current Status: Phase 15 — Advanced Agent Architecture (COMPLETED ✅)

### Project Status

**Current Phase:** Phase 15 — Advanced Agent Architecture  
**Stage:** Phase 15 Completed & Verified (Ready for Phase 16: Gmail Automation)  
**Developer:** Sakshi

### Phase 14 Deliverables Summary (Task Management)
- [x] **Durable Task Lifecycle:** Authoritative state machine (`REQUESTED` → `RUNNING` → `COMPLETED` / `FAILED` / `CANCELLED`).
- [x] **Relational Persistence:** Durable tasks, ordered task steps, and tool executions stored in MySQL with tenant scoping (`organization_id`).
- [x] **Anti-IDOR Security:** Strict tenancy verification returning 404 for cross-tenant resource requests.
- [x] **Conflict Guards:** 409 Conflict protection against duplicate execution of running tasks or modifying terminal tasks.
- [x] **Auditing & Telemetry:** Full audit logs for task transitions and token/cost telemetry tracking.
- [x] **Comprehensive Test Suite:** 29/29 tests passed (documented in `PHASE_14.md`).

### Phase 15 Deliverables Summary (Advanced Agent Architecture)
- [x] **Authoritative Architectural Boundary:** Enforced *"The LLM proposes. The Agent Host decides. The application executes."* The LLM never owns state transitions, tenant identity, or tool permissions.
- [x] **Structured DAG Planning:** Strongly typed `AgentPlan` schema with explicit inter-step dependencies (`dependencies[]`) and per-step tool allowlists (`allowedTools[]`).
- [x] **Authoritative DAG Validation & Cycle Detection:** Graph traversal with 3-color DFS detecting duplicate IDs, self-dependencies, unknown dependencies, and circular references.
- [x] **Deterministic Step Scheduler:** Authoritative `findNextRunnableStep` selecting the lowest-order runnable step whose prerequisite steps are strictly `COMPLETED`.
- [x] **Strict Decision Contract:** Strongly validated `AgentDecision` schema (`CALL_TOOL`, `CONTINUE`, `COMPLETE`, `FAIL`) parsing through Zod with JSON repair.
- [x] **Centralized Policy Gateway:** Blocks prohibited tools (`execute_sql`, `shell_exec`, `gmail_send`), enforces risk levels (`READ_ONLY`, `LOW_RISK` vs blocked mutations), and guarantees tenant scoping.
- [x] **Bounded Context Manager:** Strict token/character memory budget with explicit untrusted observation delimiters (`<<<UNTRUSTED_EXTERNAL_OBSERVATION>>>`) to defeat prompt injection.
- [x] **Deterministic Execution Watchdogs:** Guard limits for max cycles (15), max tool calls (20), step retries (2), replans (2), wall-clock time (180s), and cryptographic SHA-256 loop detection.
- [x] **Bounded Retries & Replanning:** Structured failure taxonomy (`PROVIDER_ERROR`, `TIMEOUT_ERROR`, `POLICY_ERROR`) allowing recovery on transient errors and bounded replanning (`MAX_REPLANS = 2`).
- [x] **Cooperative Cancellation Checkpoints:** Non-destructive cancellation checks prior to and after LLM invocations and tool calls.
- [x] **Multi-Source Grounded Synthesis:** Authoritative final report synthesis validating evidence against real tool observations (`Customer Database (MySQL)`, `Web Search`, `Internal Knowledge Base (Qdrant)`).
- [x] **Advanced Execution Studio UI:** Interactive DAG plan progress bar, step dependency indicators, status icons, and governed tool tags.
- [x] **Exhaustive Automated Test Suite:** 22/22 unit, integration, security, and reliability tests passed (documented in `PHASE_15.md`).
- [x] **Full Regression Pass:** 100% pass across Phase 13 (26/26), Phase 14 (29/29), and Phase 15 (22/22) suites with clean production builds.

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
