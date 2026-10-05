# REST API & Tool Specifications

This document defines the API endpoints and tool interfaces for the **AI Workforce Platform**.

---

## 1. Task Management Endpoints

### 1.1 Create Task
- **Endpoint:** `POST /api/tasks`
- **Description:** Submits a natural-language task for asynchronous execution.
- **Request Body:**
  ```json
  {
    "title": "Find SaaS Leads in India",
    "prompt": "Find 5 SaaS companies in India, check against our database, and qualify them.",
    "priority": "NORMAL",
    "constraints": {
      "max_leads": 5,
      "exclude_existing": true
    }
  }
  ```
- **Response (HTTP 202 Accepted):**
  ```json
  {
    "taskId": "7c9b8e21-4f32-4821-bc39-9d7a22e861a0",
    "status": "PENDING",
    "message": "Task queued for execution"
  }
  ```

---

### 1.2 Get Task Status & Output
- **Endpoint:** `GET /api/tasks/:id`
- **Description:** Returns the current lifecycle status, subtask progress, and final report.
- **Response (HTTP 200 OK):**
  ```json
  {
    "id": "7c9b8e21-4f32-4821-bc39-9d7a22e861a0",
    "title": "Find SaaS Leads in India",
    "status": "COMPLETED",
    "stepsCompleted": 4,
    "totalSteps": 4,
    "finalReport": "## Executive Summary\nDiscovered 5 companies...",
    "metrics": {
      "promptTokens": 1420,
      "completionTokens": 580,
      "costUsd": 0.0042
    },
    "createdAt": "2026-10-05T14:30:00Z",
    "completedAt": "2026-10-05T14:30:45Z"
  }
  ```

---

### 1.3 Real-Time Task Execution Stream (Server-Sent Events)
- **Endpoint:** `GET /api/tasks/:id/stream`
- **Description:** Streams live execution progress, subtask state transitions, and tool logs to the React client.
- **Event Types:**
  - `step_started`: `{ "stepId": "...", "title": "Web Search for SaaS companies" }`
  - `tool_called`: `{ "tool": "web_search", "query": "Top SaaS startups India 2026" }`
  - `step_completed`: `{ "stepId": "...", "status": "COMPLETED" }`
  - `task_completed`: `{ "taskId": "...", "status": "COMPLETED" }`
  - `task_failed`: `{ "taskId": "...", "error": "Rate limit exceeded" }`

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

