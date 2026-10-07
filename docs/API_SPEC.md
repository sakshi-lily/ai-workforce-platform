# REST API & Tool Specifications

This document defines the API endpoints and tool interfaces for the **AI Workforce Platform**.

---

## 0. Authentication & Identity Endpoints (Phase 13)

### 0.1 Register User
- **Endpoint:** `POST /api/auth/register`
- **Description:** Registers a new user account with normalized email, hashed password, and organization context. Generates a signed JWT session.
- **Request Body:**
  ```json
  {
    "email": "user@example.com",
    "password": "Password123",
    "fullName": "Jane Doe",
    "organizationName": "Acme Corp",
    "organizationId": "org-acme-001"
  }
  ```
- **Response (HTTP 201 Created):**
  ```json
  {
    "status": "success",
    "message": "User registered successfully.",
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "usr_90b9b3e1-32cb-4629-9e80-87729ee94406",
      "email": "user@example.com",
      "fullName": "Jane Doe",
      "organizationName": "Acme Corp",
      "organizationId": "org-acme-001",
      "role": "USER",
      "createdAt": "2026-10-07T06:40:00.000Z"
    }
  }
  ```

---

### 0.2 Login User
- **Endpoint:** `POST /api/auth/login`
- **Description:** Verifies credentials against stored bcrypt password hash and returns signed JWT token.
- **Request Body:**
  ```json
  {
    "email": "user@example.com",
    "password": "Password123"
  }
  ```
- **Response (HTTP 200 OK):**
  ```json
  {
    "status": "success",
    "message": "Login successful.",
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "usr_90b9b3e1-32cb-4629-9e80-87729ee94406",
      "email": "user@example.com",
      "fullName": "Jane Doe",
      "organizationName": "Acme Corp",
      "organizationId": "org-acme-001",
      "role": "USER"
    }
  }
  ```

---

### 0.3 Verify & Restore Session
- **Endpoint:** `GET /api/auth/me`
- **Headers:** `Authorization: Bearer <token>`
- **Description:** Validates Bearer token signature and expiration, restoring fresh user identity.
- **Response (HTTP 200 OK):**
  ```json
  {
    "status": "success",
    "authenticated": true,
    "user": {
      "id": "usr_90b9b3e1-32cb-4629-9e80-87729ee94406",
      "email": "user@example.com",
      "fullName": "Jane Doe",
      "organizationName": "Acme Corp",
      "organizationId": "org-acme-001",
      "role": "USER"
    }
  }
  ```

---

### 0.4 Logout
- **Endpoint:** `POST /api/auth/logout`
- **Headers:** `Authorization: Bearer <token>`
- **Description:** Acknowledges stateless token disposal and frontend credential cleanup.
- **Response (HTTP 200 OK):**
  ```json
  {
    "status": "success",
    "message": "Logged out successfully."
  }
  ```

---

## 1. Task Management Endpoints (Phase 14)

All task management endpoints require authentication (`Authorization: Bearer <token>`) and enforce tenant scoping (`organization_id = req.user.organizationId`).

### 1.1 Create Task
- **Endpoint:** `POST /api/tasks`
- **Description:** Persists a durable task with initial status `REQUESTED`. The server derives identity and tenant ownership strictly from the authenticated JWT session.
- **Request Body:**
  ```json
  {
    "title": "Research Apex Cloud",
    "goal": "Research Apex Cloud and verify whether they are an existing customer in our database.",
    "priority": "HIGH",
    "mode": "tools"
  }
  ```
- **Response (HTTP 201 Created):**
  ```json
  {
    "status": "success",
    "data": {
      "id": "7c9b8e21-4f32-4821-bc39-9d7a22e861a0",
      "user_id": "usr-demo-001",
      "organization_id": "org-demo-001",
      "title": "Research Apex Cloud",
      "goal": "Research Apex Cloud and verify whether they are an existing customer in our database.",
      "status": "REQUESTED",
      "priority": "HIGH",
      "created_at": "2026-10-07T12:00:00.000Z"
    }
  }
  ```

---

### 1.2 List Tasks
- **Endpoint:** `GET /api/tasks`
- **Description:** Lists tasks scoped strictly to the authenticated caller's organization with bounded pagination and optional lifecycle status filtering.
- **Query Parameters:**
  - `limit` (number, default: 20, max: 100)
  - `offset` (number, default: 0)
  - `status` (`ALL`, `REQUESTED`, `RUNNING`, `COMPLETED`, `FAILED`, `CANCELLED`)
- **Response (HTTP 200 OK):**
  ```json
  {
    "status": "success",
    "data": [
      {
        "id": "7c9b8e21-4f32-4821-bc39-9d7a22e861a0",
        "title": "Research Apex Cloud",
        "goal": "Research Apex Cloud and verify...",
        "status": "COMPLETED",
        "priority": "HIGH",
        "stepCount": 3,
        "totalCostUsd": 0.0035,
        "createdAt": "2026-10-07T12:00:00.000Z"
      }
    ],
    "pagination": {
      "total": 1,
      "limit": 20,
      "offset": 0
    }
  }
  ```

---

### 1.3 Get Task Details (Anti-IDOR Protected)
- **Endpoint:** `GET /api/tasks/:taskId`
- **Description:** Returns full task details, sequential task steps, linked tool execution records, AI telemetry, and multi-source evidence attribution.
- **Anti-IDOR:** Returns `404 TASK_NOT_FOUND` if the task does not belong to the user's organization.
- **Response (HTTP 200 OK):**
  ```json
  {
    "status": "success",
    "data": {
      "task": {
        "id": "7c9b8e21-4f32-4821-bc39-9d7a22e861a0",
        "status": "COMPLETED",
        "final_report": "Apex Cloud was verified as an existing customer...",
        "prompt_tokens": 1240,
        "completion_tokens": 310,
        "total_cost_usd": 0.0035
      },
      "steps": [
        {
          "id": "step-1",
          "step_order": 1,
          "title": "Execute mysql_verify_customer",
          "status": "COMPLETED",
          "tool_name": "mysql_verify_customer"
        }
      ],
      "toolExecutions": [
        {
          "id": "exec-1",
          "step_id": "step-1",
          "tool": "mysql_verify_customer",
          "durationMs": 4,
          "success": true
        }
      ],
      "telemetry": {
        "model": "gpt-4o-mini",
        "totalTokens": 1550,
        "latencyMs": 420,
        "estimatedCostUsd": 0.0035
      },
      "sources": ["Customer Database (MySQL)", "Web Search"]
    }
  }
  ```

---

### 1.4 Update Task Metadata
- **Endpoint:** `PATCH /api/tasks/:taskId`
- **Description:** Updates mutable non-lifecycle metadata (title).
- **Request Body:**
  ```json
  {
    "title": "Updated Apex Cloud Lead Research"
  }
  ```
- **Response (HTTP 200 OK):** Updated task entity.

---

### 1.5 Run Task
- **Endpoint:** `POST /api/tasks/:taskId/run`
- **Description:** Default Phase 18 asynchronous mode: Transitions task from `REQUESTED` to `QUEUED`, enqueues a priority job in Redis, and returns `HTTP 202 Accepted` immediately. Background workers dequeue and execute the task. Rejects duplicate execution with `409 TASK_ALREADY_RUNNING` and terminal states with `409 INVALID_TASK_STATE_TRANSITION`.
- **Query Parameter / Header (Optional):**
  - `?sync=true` or `X-Execution-Mode: sync`: Forces synchronous execution (HTTP 200 OK upon task completion).
- **Response (HTTP 202 Accepted):**
  ```json
  {
    "status": "success",
    "message": "Task accepted and queued for background worker execution.",
    "data": {
      "taskId": "e963ff75-01e4-4ea6-a797-40ae5bb2f618",
      "jobId": "job_312f2c904e5743b593ef983e",
      "status": "QUEUED"
    }
  }
  ```
- **Synchronous Response (HTTP 200 OK):** Execution outcome and updated task details (when `sync=true`).

---

### 1.6 Cancel Task
- **Endpoint:** `POST /api/tasks/:taskId/cancel`
- **Description:** Cancels a task in `REQUESTED` or `RUNNING` state. Transitions status to `CANCELLED`. Rejects terminal tasks (`COMPLETED`, `FAILED`, `CANCELLED`) with `409 INVALID_TASK_STATE_TRANSITION`.
- **Response (HTTP 200 OK):** Updated cancelled task entity.

---

## 2. Tool Interfaces (Agent Tool Calling)

### 2.1 `web_search`
- **Description:** Executes targeted search queries to discover external company and contact data.
- **Input Parameters:**
  ```json
  {
    "type": "object",
    "properties": {
      "query": { "type": "string", "description": "Search engine query string" },
      "num_results": { "type": "integer", "default": 5 }
    },
    "required": ["query"]
  }
  ```
- **Output Schema:**
  ```json
  {
    "results": [
      {
        "title": "CloudScale India - B2B SaaS",
        "url": "https://example-saas.in",
        "snippet": "Leading cloud automation provider for enterprise..."
      }
    ]
  }
  ```

---

### 2.2 `mysql_verify_customer`
- **Description:** Checks candidate email against the internal MySQL database for existing customer accounts and qualification score.
- **Security Context:** Session-bound `user_id` injected automatically by backend.
- **Input Parameters:**
  ```json
  {
    "type": "object",
    "properties": {
      "email": { "type": "string", "description": "Customer email to check (e.g. sarah@apexcloud.io)" }
    },
    "required": ["email"]
  }
  ```
- **Output Schema:**
  ```json
  {
    "found": true,
    "customer": {
      "id": "cust-001",
      "company_name": "Apex Cloud Innovations",
      "domain": "apexcloud.io",
      "contact_name": "Sarah Chen",
      "contact_email": "sarah@apexcloud.io",
      "industry": "Cloud Infrastructure",
      "qualification_score": 92,
      "status": "QUALIFIED",
      "created_at": "2026-10-01T10:00:00.000Z"
    }
  }
  ```

---

### 2.3 `vector_search` (Phase 11)
- **Description:** Performs dense vector semantic similarity search over internal unstructured company knowledge (employee handbook, architecture, security policies, SLAs) via Qdrant.
- **Risk Level:** `READ_ONLY`
- **Security Context:** Host-controlled `organization_id` filter strictly injected; collection selection and raw embeddings are server-managed. The LLM cannot provide raw vectors, arbitrary collections, or filters.
- **Input Parameters (Zod-enforced):**
  ```json
  {
    "type": "object",
    "properties": {
      "query": { "type": "string", "description": "Natural-language semantic search query (2-500 chars)" },
      "top_k": { "type": "integer", "description": "Number of relevant chunks to retrieve (1-10)", "default": 5 }
    },
    "required": ["query"]
  }
  ```
- **Output Schema:**
  ```json
  {
    "results": [
      {
        "score": 0.8268,
        "document_id": "doc-emp-handbook",
        "chunk_id": "doc-emp-handbook:v1:chunk-000",
        "title": "Employee Handbook — Remote Work & Workplace Policies",
        "source": "employee-handbook.md",
        "text": "Employees may work remotely up to three days per week...",
        "version": 1,
        "chunk_index": 0
      }
    ],
    "total_found": 1,
    "duration_ms": 42
  }
  ```

---

### 1.4 Grounded RAG Query (Phase 12)
- **Endpoint:** `POST /api/rag/query`
- **Description:** Executes the full end-to-end Retrieval-Augmented Generation pipeline over internal corporate knowledge. Retrieves relevant chunks via Qdrant, builds bounded context, queries LLM with grounded system instructions, and validates structured response and citation integrity.
- **Request Body (Zod-enforced):**
  ```json
  {
    "question": "What is our remote work policy?",
    "top_k": 5,
    "score_threshold": 0.5
  }
  ```
- **Response (HTTP 200 OK):**
  ```json
  {
    "success": true,
    "data": {
      "question": "What is our remote work policy?",
      "answer": "Employees may work remotely up to three days per week, subject to team requirements and manager approval. Standard core collaboration hours are 10:00 AM to 4:00 PM local time. [S1]",
      "grounded": true,
      "sources": [
        {
          "sourceId": "S1",
          "documentId": "doc-emp-handbook",
          "chunkId": "doc-emp-handbook:v1:chunk-000",
          "title": "Employee Handbook — Remote Work & Workplace Policies",
          "source": "employee-handbook.md",
          "score": 0.9124,
          "text": "Employees may work remotely up to three days per week..."
        }
      ],
      "sourceIds": ["S1"],
      "insufficientContext": false,
      "telemetry": {
        "retrievalLatencyMs": 14,
        "contextBuildingLatencyMs": 2,
        "generationLatencyMs": 120,
        "totalLatencyMs": 136,
        "promptTokens": 140,
        "completionTokens": 65,
        "totalTokens": 205,
        "estimatedCostUsd": 0.00031,
        "model": "gpt-4o-mini",
        "provider": "openai"
      },
      "pipeline": [
        { "name": "QDRANT_RETRIEVAL", "status": "COMPLETED", "durationMs": 14 },
        { "name": "CONTEXT_CONSTRUCTION", "status": "COMPLETED", "durationMs": 2 },
        { "name": "LLM_GENERATION", "status": "COMPLETED", "durationMs": 120 },
        { "name": "SOURCE_VALIDATION", "status": "COMPLETED", "durationMs": 1 }
      ]
    }
  }
  ```

---

## 2. Tool Interfaces

### 2.4 `rag_query` (Phase 12)
- **Description:** Performs complete, governed Retrieval-Augmented Generation over internal corporate knowledge. Returns a verified, strictly grounded answer with source citations.
- **Risk Level:** `READ_ONLY`
- **Security Context:** Host-controlled `organization_id` filter strictly injected; context bounded by max chunks and characters; schema validated via Zod; fabricated citation firewall rejects non-existent sources (e.g. S99).
- **Input Parameters (Zod-enforced):**
  ```json
  {
    "type": "object",
    "properties": {
      "question": { "type": "string", "description": "Natural-language query (2-500 chars)" },
      "top_k": { "type": "integer", "description": "Number of chunks to retrieve (1-10)", "default": 5 }
    },
    "required": ["question"]
  }
  ```
- **Output Schema:**
  ```json
  {
    "answer": "Employees may work remotely up to three days per week... [S1]",
    "grounded": true,
    "sources": ["S1"],
    "insufficient_context": false,
    "source_details": [
      {
        "sourceId": "S1",
        "documentId": "doc-emp-handbook",
        "chunkId": "doc-emp-handbook:v1:chunk-000",
        "title": "Employee Handbook",
        "source": "employee-handbook.md",
        "score": 0.9124,
        "text": "..."
      }
    ],
    "duration_ms": 136
  }
  ```

---

## 3. Advanced Agent Runtime Contracts (Phase 15)

Phase 15 defines formal schema contracts governing LLM planning, decision making, and synthesis.

### 3.1 Advanced Agent Plan Schema (`AgentPlan`)
- **Description:** Structured DAG execution plan produced by Planner and validated before execution.
- **Zod Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "goal": { "type": "string" },
      "summary": { "type": "string" },
      "steps": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "id": { "type": "string" },
            "title": { "type": "string" },
            "description": { "type": "string" },
            "order": { "type": "integer" },
            "dependencies": { "type": "array", "items": { "type": "string" } },
            "allowedTools": { "type": "array", "items": { "type": "string" } },
            "status": { "type": "string", "enum": ["PENDING", "READY", "RUNNING", "COMPLETED", "FAILED", "CANCELLED"] }
          },
          "required": ["id", "title", "description", "order", "dependencies", "allowedTools"]
        }
      }
    },
    "required": ["goal", "summary", "steps"]
  }
  ```

---

### 3.2 Agent Decision Schema (`AgentDecision`)
- **Description:** Strongly validated decision payload returned by the LLM on each execution cycle.
- **Zod Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "type": { "type": "string", "enum": ["CALL_TOOL", "CONTINUE", "COMPLETE", "FAIL"] },
      "reasoningSummary": { "type": "string" },
      "toolCall": {
        "type": "object",
        "properties": {
          "tool": { "type": "string" },
          "arguments": { "type": "object" }
        },
        "required": ["tool", "arguments"]
      },
      "finalAnswer": { "type": "string" },
      "failureReason": { "type": "string" }
    },
    "required": ["type", "reasoningSummary"]
  }
  ```

---

### 3.3 Agent Final Synthesis Schema (`AgentFinalSynthesis`)
- **Description:** Validated structured final outcome synthesizing verified evidence from all completed step observations.
- **Zod Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "summary": { "type": "string" },
      "findings": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "title": { "type": "string" },
            "value": { "type": "string" }
          },
          "required": ["title", "value"]
        }
      },
      "sources": { "type": "array", "items": { "type": "string" } },
      "confidence": { "type": "number", "minimum": 0, "maximum": 1 }
    },
    "required": ["summary", "findings", "sources", "confidence"]
  }
  ```

---

## 4. Gmail Integration Endpoints & Tools (Phase 16)

### 4.1 Gmail HTTP Endpoints (`/api/integrations/gmail`)
All endpoints mandate `Authorization: Bearer <JWT>`.

- **`GET /api/integrations/gmail/status`**
  - Returns connection status for authenticated user (`CONNECTED` or `DISCONNECTED`), account email, and provider. Zero secret tokens returned.
- **`GET /api/integrations/gmail/connect`**
  - Generates HMAC-SHA256 signed `state` and returns Google OAuth authorization URL.
- **`GET /api/integrations/gmail/callback`**
  - Validates `state` signature, user identity, and organization context. Exchanges code for tokens, encrypts at rest with AES-256-GCM, and updates database.
- **`POST /api/integrations/gmail/disconnect`**
  - Sets connection status to `DISCONNECTED` without deleting historical audit trails or tasks.
- **`POST /api/integrations/gmail/connect-mock`**
  - Connects simulated Gmail account for sandbox development and test automation.

### 4.2 Gmail Governed Tools

| Tool Name | Risk Level | Inputs | Output Summary |
| :--- | :--- | :--- | :--- |
| `gmail_get_profile` | `READ_ONLY` | `{}` | `{ email, messagesTotal, threadsTotal }` |
| `gmail_search` | `READ_ONLY` | `{ query: string, maxResults?: number }` | `{ summaries: [{ messageId, threadId, from, to, subject, snippet, receivedAt }], count }` |
| `gmail_get_message` | `READ_ONLY` | `{ messageId: string }` | `{ messageId, threadId, from, to, subject, snippet, plainTextBody, hasAttachments, receivedAt }` |
| `gmail_create_draft` | `MUTATING` | `{ to: string[], subject: string, body: string, threadId?: string }` | `{ draftId, messageId, status: "DRAFT_CREATED", to, subject, snippet }` |
| `gmail_send` | `EXTERNAL_SIDE_EFFECT` | `{ to: string[], subject: string, body: string, reason?: string }` | `{ status: "APPROVAL_REQUIRED", approvalId, message: "External side effect staged for Phase 17 Human Approval" }` |

---

## 5. Human Approval Endpoints (Phase 17)

All approval endpoints require `Authorization: Bearer <JWT>`. Organization context is strictly derived from the authenticated token session.

### 5.1 List Approvals
- **Endpoint:** `GET /api/approvals`
- **Query Parameters:** `status` (optional: `PENDING`, `APPROVED`, `EXECUTING`, `EXECUTED`, `REJECTED`, `EXPIRED`, `CANCELLED`), `limit` (default 50), `offset` (default 0).
- **Description:** Returns all approval requests belonging to the authenticated user's organization.

### 5.2 Get Approval by ID
- **Endpoint:** `GET /api/approvals/:id`
- **Description:** Returns full details of an approval request, including target tool, sanitized preview, task context, risk tier, and expiration. Returns `404 Not Found` if requested by another organization (Anti-IDOR).

### 5.3 Approve Action
- **Endpoint:** `POST /api/approvals/:id/approve`
- **Request Body:**
  ```json
  {
    "decision": "APPROVED",
    "note": "Authorized for customer delivery."
  }
  ```
- **Description:** Authorizes and executes the staged action under strict policy re-check and double-execution protection.

### 5.4 Reject Action
- **Endpoint:** `POST /api/approvals/:id/reject`
- **Request Body:**
  ```json
  {
    "decision": "REJECTED",
    "reason": "Do not contact this customer yet."
  }
  ```
- **Description:** Rejects the proposed action and halts the linked task step cleanly.

### 5.5 Cancel Approval
- **Endpoint:** `POST /api/approvals/:id/cancel`
- **Request Body:**
  ```json
  {
    "reason": "Cancelled by operator."
  }
  ```
- **Description:** Cancels a pending approval.

---

## 6. Background Workers & Job Queue Endpoints (Phase 18)

### 6.1 Worker Health & Metrics
- **Endpoint:** `GET /api/health/worker`
- **Authentication:** Public or Operator
- **Description:** Returns live worker health, online heartbeat status, and queue telemetry.
- **Response (HTTP 200 OK):**
  ```json
  {
    "status": "healthy",
    "timestamp": "2026-10-07T17:15:00.000Z",
    "worker": {
      "online": true,
      "onlineWorkers": 1,
      "workers": [
        {
          "workerId": "worker_prod_1",
          "processId": 12430,
          "status": "ONLINE",
          "lastHeartbeat": "2026-10-07T17:14:58.000Z"
        }
      ]
    },
    "queue": {
      "pending": 0,
      "active": 1,
      "delayed": 0,
      "completed": 14,
      "failed": 0,
      "exhausted": 0
    }
  }
  ```

### 6.2 Get Job Details
- **Endpoint:** `GET /api/jobs/:id`
- **Authentication:** `Authorization: Bearer <JWT>`
- **Description:** Retrieves durable execution job status, attempt count, and last error. Anti-IDOR protected by tenant organization ID.
- **Response (HTTP 200 OK):**
  ```json
  {
    "status": "success",
    "data": {
      "id": "job_312f2c904e5743b593ef983e",
      "taskId": "e963ff75-01e4-4ea6-a797-40ae5bb2f618",
      "type": "TASK_EXECUTION",
      "status": "ACTIVE",
      "attempts": 1,
      "maxAttempts": 3,
      "workerId": "worker_prod_1",
      "startedAt": "2026-10-07T17:14:50.000Z"
    }
  }
  ```

### 6.3 Get Job by Task ID
- **Endpoint:** `GET /api/jobs/task/:taskId`
- **Authentication:** `Authorization: Bearer <JWT>`
- **Description:** Looks up latest job record associated with a specific task.


