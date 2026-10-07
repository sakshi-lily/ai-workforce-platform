# AI Workforce Platform — Phase 14: Task Management

**Project:** AI Workforce Platform  
**Phase:** 14 — Task Management  
**Status:** COMPLETED ✅  
**Previous Phase:** Phase 13 — Authentication  
**Next Phase:** Phase 15 — Advanced Agent Architecture  

---

## 1. Executive Summary

Phase 14 elevates **work itself into a first-class application concept**.

Prior to Phase 14, the platform could execute agent cycles and invoke governed tools, but work lacked durable identity, lifecycle governance, and independent ownership outside ad-hoc prompts.

Phase 14 establishes:
1. **Durable Task Entity:** Every unit of work is a persistent database record (`tasks`) with unique ID, owner, organization, goal, priority, lifecycle state, execution metrics, and final verified result.
2. **Explicit Host-Controlled State Machine:** The application strictly owns lifecycle transitions (`REQUESTED` $\rightarrow$ `RUNNING` $\rightarrow$ `COMPLETED` / `FAILED` / `CANCELLED`). The LLM is never permitted to set lifecycle status.
3. **Deterministic Separation of Concerns:**
   - **Task:** The overarching unit of business work.
   - **Task Step:** A discrete logical milestone with sequential deterministic order (`step_order`).
   - **Tool Execution:** A concrete invocation of an authorized tool linked directly to a parent step (`step_id`).
   - **Task Result:** The durable synthesized outcome with multi-source evidence attribution.
4. **Tenant Isolation & Anti-IDOR Defense:** All queries enforce authenticated organization scoping (`organization_id = req.user.organizationId`). Cross-tenant access returns HTTP 404 (preventing resource existence disclosure).
5. **Robust Concurrency & Conflict Protection:** Duplicate runs on active or completed tasks reject with HTTP 409 (`TASK_ALREADY_RUNNING` or `INVALID_TASK_STATE_TRANSITION`). Cancellation is strictly permitted only from active states (`REQUESTED` or `RUNNING`).
6. **Task Management UI Studio:** A dedicated interactive management studio (`TaskManagementStudio.tsx`) providing real-time task creation, status filtering, bounded pagination, step sequence visualization, observation inspector, inline metadata editing, and execution controls.

---

## 2. Master Roadmap Position

```text
MVP
────────────────────────────────────────────
Phase 1   Requirements & Architecture       ✅
Phase 2   Development Environment           ✅
Phase 3   Basic MERN Application            ✅
Phase 4   MySQL                             ✅
Phase 5   Redis                             ✅
Phase 6   AI Integration                    ✅
Phase 7   Simple Agent                      ✅
Phase 8   Tools                             ✅
Phase 9   Web Search                        ✅
Phase 10  Verification / MySQL              ✅

INTERMEDIATE
────────────────────────────────────────────
Phase 11  Vector Database / Qdrant          ✅
Phase 12  RAG                               ✅
Phase 13  Authentication                    ✅
Phase 14  Task Management                   ✅ COMPLETED
Phase 15  Advanced Agent Architecture       ← NEXT
Phase 16  Gmail

ADVANCED
────────────────────────────────────────────
Phase 17  Human Approval
Phase 18  Background Workers
Phase 19  Reliability
Phase 20  Security
Phase 21  Docker
Phase 22  AWS
Phase 23  CI/CD
```

---

## 3. Core Architecture & Hierarchy

The platform implements a clean 4-tier execution hierarchy:

```text
Authenticated User (JWT Identity)
        ↓
      Task (Durable Unit of Work in MySQL)
        ↓
    Task Steps (Sequential Execution Milestones)
        ↓
  Tool Executions (Governed Invocations Linked via step_id)
        ↓
    Task Result (Verified Multi-Source Outcome & Audit Trail)
```

### Hierarchy Breakdown

| Layer | Responsibility | Persistence Table | Owner |
|---|---|---|---|
| **Task** | High-level objective, lifecycle state, priority, owner, timestamps, final report | `tasks` | Application Host |
| **Task Step** | Discrete planned milestone (`step_order`, status, description) | `task_steps` | Agent Host |
| **Tool Execution** | Concrete capability invocation (tool, arguments, result, duration) | `tool_executions` | Tool Registry |
| **Telemetry & Audit** | Token usage, cost calculation, and security audit log | `ai_telemetry`, `audit_logs` | Platform Telemetry & Audit Service |

---

## 4. Deterministic State Machine

The task lifecycle adheres strictly to an authoritative transition table:

```text
                 ┌──────────────┐
                 │  REQUESTED   │
                 └──────┬───────┘
                        │
                        ▼
                 ┌──────────────┐
                 │   RUNNING    │
                 └───┬──────┬───┘
                     │      │
              success│      │failure
                     │      │
                     ▼      ▼
              ┌──────────┐ ┌────────┐
              │COMPLETED │ │ FAILED │
              └──────────┘ └────────┘
                     ▲
                     │
                     │ cancellation
                     │
                 ┌───┴────────┐
                 │ CANCELLED  │
                 └────────────┘
```

### Transition Enforcement Table

| From State | Allowed Target States | Disallowed Transitions (HTTP 409) |
|---|---|---|
| `REQUESTED` | `RUNNING`, `CANCELLED` | `COMPLETED`, `FAILED` |
| `RUNNING` | `COMPLETED`, `FAILED`, `CANCELLED` | `REQUESTED` |
| `COMPLETED` | *(None — Terminal)* | `RUNNING`, `FAILED`, `CANCELLED`, `REQUESTED` |
| `FAILED` | *(None — Terminal)* | `RUNNING`, `COMPLETED`, `CANCELLED`, `REQUESTED` |
| `CANCELLED` | *(None — Terminal)* | `RUNNING`, `COMPLETED`, `FAILED`, `REQUESTED` |

---

## 5. API Endpoints

All task endpoints require valid Bearer token authentication (`requireAuth`) and are mounted at `/api/tasks`:

### 1. `POST /api/tasks` — Create Task
- **Request:**
  ```json
  {
    "title": "Research Apex Cloud and verify customer",
    "goal": "Research Apex Cloud and verify whether they are an existing customer in our CRM.",
    "priority": "HIGH",
    "mode": "tools"
  }
  ```
- **Response (201 Created):**
  ```json
  {
    "status": "success",
    "data": {
      "id": "e6a4b123-...",
      "user_id": "usr-demo-001",
      "organization_id": "org-demo-001",
      "title": "Research Apex Cloud and verify customer",
      "goal": "Research Apex Cloud and verify whether they are an existing customer in our CRM.",
      "status": "REQUESTED",
      "priority": "HIGH",
      "created_at": "2026-10-07T12:00:00.000Z"
    }
  }
  ```

### 2. `GET /api/tasks` — List Tasks (Paginated & Filtered)
- **Query Parameters:** `limit` (1–100, default 20), `offset` (default 0), `status` (`ALL`, `REQUESTED`, `RUNNING`, `COMPLETED`, `FAILED`, `CANCELLED`).
- **Response (200 OK):**
  ```json
  {
    "status": "success",
    "data": [ ... ],
    "pagination": {
      "total": 42,
      "limit": 20,
      "offset": 0
    }
  }
  ```

### 3. `GET /api/tasks/:taskId` — Get Task Details
- **Anti-IDOR:** Returns `404 TASK_NOT_FOUND` if task does not exist or belongs to another organization.
- **Response (200 OK):**
  ```json
  {
    "status": "success",
    "data": {
      "task": { ... },
      "steps": [ ... ],
      "toolExecutions": [ ... ],
      "telemetry": { ... },
      "sources": ["Customer Database (MySQL)", "Web Search"]
    }
  }
  ```

### 4. `PATCH /api/tasks/:taskId` — Update Metadata
- **Allowed mutable fields:** `title` (max 255 chars).
- **Protected:** Status mutations rejected (lifecycle transitions must use dedicated endpoints).

### 5. `POST /api/tasks/:taskId/run` — Run Task
- Transitions `REQUESTED` $\rightarrow$ `RUNNING` $\rightarrow$ `COMPLETED`/`FAILED`.
- Returns `409 TASK_ALREADY_RUNNING` on duplicate execution attempts.
- Returns `409 INVALID_TASK_STATE_TRANSITION` if task is in a terminal state.

### 6. `POST /api/tasks/:taskId/cancel` — Cancel Task
- Permitted only from `REQUESTED` or `RUNNING`.
- Transitions to `CANCELLED` and logs `TASK_CANCELLED` audit record.

---

## 6. Verification & Test Suite

The automated verification suite (`server/src/tasks/testPhase14.ts`) runs 29 exhaustive integration scenarios covering the full task specification:

```text
=======================================================
  PHASE 14 TASK MANAGEMENT VERIFICATION SUITE
=======================================================

[Category 1: Task State Machine & Transitions]
  [PASS] Valid transitions adhere strictly to state machine (0ms)
  [PASS] Terminal transitions are strictly rejected with 409 error (0ms)

[Category 2: Authentication Protection]
  [PASS] POST /api/tasks rejects unauthenticated requests with 401 (49ms)
  [PASS] GET /api/tasks rejects unauthenticated requests with 401 (9ms)
  [PASS] GET /api/tasks/:id rejects unauthenticated requests with 401 (6ms)
  [PASS] PATCH /api/tasks/:id rejects unauthenticated requests with 401 (6ms)
  [PASS] POST /api/tasks/:id/run rejects unauthenticated requests with 401 (9ms)
  [PASS] POST /api/tasks/:id/cancel rejects unauthenticated requests with 401 (7ms)

[Category 3: Task Input Validation]
  [PASS] Rejects task creation with missing goal/prompt (26ms)
  [PASS] Rejects task creation with too short goal (< 3 chars) (14ms)
  [PASS] Rejects task creation with oversized goal (> 3000 chars) (12ms)

[Category 4: Task Creation & Ownership Protection]
  [PASS] Creates task and enforces server-derived identity (spoofing ignored) (16ms)

[Category 5: Tenant Isolation & Anti-IDOR Protection]
  [PASS] User A can fetch their own task details (14ms)
  [PASS] User B is denied access to User A's task with 404 TASK_NOT_FOUND (10ms)
  [PASS] User B cannot update User A's task (returns 404) (8ms)
  [PASS] User B cannot run User A's task (returns 404) (10ms)
  [PASS] User B cannot cancel User A's task (returns 404) (10ms)

[Category 6: Task Listing & Bounded Pagination]
  [PASS] GET /api/tasks lists tasks scoped strictly to caller's organization (20ms)
  [PASS] Pagination parameters limit and offset are respected and bounded (15ms)

[Category 7: Task Metadata Updates]
  [PASS] PATCH /api/tasks/:id updates title on authorized task (12ms)

[Category 8: Cancellation Lifecycle]
  [PASS] Creates a second task and cancels it from REQUESTED state (25ms)
  [PASS] Attempting to cancel an already CANCELLED task returns 409 (7ms)

[Category 9: Task Execution & Agent Linkage]
  [PASS] Creates a task to execute with tools (13ms)
  [PASS] Runs task through Agent Host and verifies COMPLETED status (440ms)
  [PASS] Duplicate run of already COMPLETED task is rejected with 409 (7ms)

[Category 10: Task Steps, Tool Executions & Sources]
  [PASS] Task details endpoint returns persisted steps, tool executions, and sources (13ms)

[Category 11: Audit Trail Verification]
  [PASS] Verifies audit_logs rows for task lifecycle events (2ms)

[Category 12: Regression Verification]
  [PASS] GET /api/health returns 200 and healthy status (4ms)
  [PASS] GET /api/agent/tools lists registered tools (6ms)

=======================================================
  PHASE 14 SUMMARY: 29/29 PASSED (0 FAILED)
=======================================================
```

---

## 7. Deliverables & Updated Components

1. **`server/src/tasks/taskTypes.ts`**: Complete domain representations for `TaskLifecycleState`, `TaskEntity`, `TaskStepEntity`, `TaskSummary`, and `TaskDetails`.
2. **`server/src/tasks/taskTransitions.ts`**: Authoritative lifecycle state machine and `assertValidTaskTransition` validator.
3. **`server/src/tasks/taskSchemas.ts`**: Zod validation schemas for task creation, update, and paginated query.
4. **`server/src/tasks/taskService.ts`**: High-level task service orchestrating persistence, lifecycle transitions, IDOR verification, and audit logging.
5. **`server/src/tasks/taskRoutes.ts`**: Authenticated REST API endpoints mounted at `/api/tasks`.
6. **`server/src/agent/agentHost.ts`**: Wired `existingTaskId` support, step sequence persistence (`task_steps`), and `step_id` linkage in `tool_executions`.
7. **`server/src/tasks/testPhase14.ts`**: 29-test verification suite covering domain, auth, IDOR, execution, audit, and regressions.
8. **`client/src/tasks/TaskManagementStudio.tsx`**: Rich UI studio for creating, filtering, inspecting, running, and cancelling tasks.
9. **`client/src/App.tsx`**: Integrated Task Management Studio into the unified platform UI.
10. **`PROJECT.md`, `docs/ARCHITECTURE.md`, `docs/API_SPEC.md`, `docs/DATABASE_SCHEMA.md`**: Synchronized architecture, schema, and API documentation.
