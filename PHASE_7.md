# AI Workforce Platform

# Phase 7 — Simple Agent

## Status

**Phase:** Phase 7 — Simple Agent  
**Status:** COMPLETED  
**Previous Phase:** Phase 6 — AI / LLM Integration — COMPLETED  
**Current Goal:** Convert the existing LLM integration into the platform's first bounded, stateful, auditable AI worker  
**Next Phase:** Phase 8 — Tool Calling

---

# 1. Purpose of Phase 7

Phase 6 established a reliable LLM integration:

```text
Human Prompt
    ↓
React
    ↓
Express
    ↓
LLM Service
    ↓
OpenAI / Provider
    ↓
Validated Result
    ↓
MySQL Telemetry
```

Phase 7 introduces the first **Simple Agent**.

The goal was not to create an uncontrolled autonomous AI system.

The goal was to implement the minimum architecture required for an AI worker that:
- receives a task
- maintains execution state
- reasons about the task
- produces a structured execution plan
- validates its output at runtime
- records execution steps
- terminates deterministically
- persists its result
- remains completely controlled by application code

The agent does **not** execute real-world tools yet; tools are introduced in Phase 8.

---

# 2. Phase 7 Golden Rule

> **The LLM proposes. The application controls state, execution, permissions, and termination.**

The LLM must never decide what system capabilities it possesses.

The application determines:

```text
Allowed states
Allowed transitions
Maximum cycles
Timeout
Validation rules
Persistence
Failure behavior
Termination
```

The model only produces bounded reasoning output.

---

# 3. LLM vs Agent

Phase 6 created an LLM-powered application:

```text
Prompt → LLM → Response
```

A simple agent introduces state, an execution loop, and governance:

```text
Agent = LLM + State + Execution Loop + Rules + Persistence + Termination Conditions
```

---

# 4. Scope & Trust Boundaries

### In Scope:
- Host-controlled Agent State Machine (`REQUESTED` → `RUNNING` → `LLM_CALL` → `VALIDATING` → `COMPLETED` / `FAILED`)
- Task persistence in MySQL `tasks` table with initial `REQUESTED` status
- Planned step persistence in MySQL `task_steps` table with `step_order` and `status: 'PENDING'`
- Zod runtime schema validation (`PlanStepSchema`, `AgentPlanSchema`)
- Reusing Phase 6 LLM service and linking execution telemetry to `ai_telemetry.task_id`
- Host watchdogs: `MAX_CYCLES = 10`, `MAX_EXECUTION_TIME_MS = 180000ms`, `MAX_PLAN_STEPS = 10`
- Deterministic termination
- React Simple Agent Execution Studio with real-time lifecycle timeline, plan display, and task history log

### Explicitly Out of Scope:
```text
❌ Tool calling (Phase 8)
❌ Web search (Phase 9)
❌ MySQL as an LLM-callable tool
❌ Redis as an LLM-callable tool
❌ Qdrant
❌ RAG
❌ Gmail
❌ External APIs as agent tools
❌ Human approval workflow
❌ Background workers
❌ Multi-agent orchestration
❌ Autonomous external actions
```

---

# 5. Agent State Machine Specification

Allowed transitions enforced in `server/src/agent/agentHost.ts`:

```text
REQUESTED
  → RUNNING
  → FAILED
  → CANCELLED

RUNNING
  → LLM_CALL
  → FAILED
  → CANCELLED

LLM_CALL
  → VALIDATING
  → FAILED
  → CANCELLED

VALIDATING
  → COMPLETED
  → FAILED
  → CANCELLED
```

Invalid transitions (such as `COMPLETED → RUNNING` or `REQUESTED → COMPLETED`) are strictly rejected.

---

# 6. Verification Results

| Scenario | Request | Status / Code | Observed Output / Evidence | Result |
|---|---|---|---|---|
| **Valid Planning Task** | `POST /api/agent/tasks` | 200 OK | Status `COMPLETED`, 4 steps persisted in `task_steps`, latency 323ms | **PASS** |
| **Empty Task Description** | `POST /api/agent/tasks` with `{"task": ""}` | 400 Bad Request | Safe error: `INVALID_TASK_INPUT` | **PASS** |
| **Short Task (< 5 chars)** | `POST /api/agent/tasks` with `{"task": "hi"}` | 400 Bad Request | Safe error: `TASK_TOO_SHORT` | **PASS** |
| **Oversized Task (> 5000 chars)** | `POST /api/agent/tasks` with > 5000 chars | 400 Bad Request | Safe error: `TASK_TOO_LONG` | **PASS** |
| **Structured Output Schema** | Zod `AgentPlanSchema` | Verified | `goal`, `summary`, and `steps` validated before persistence | **PASS** |
| **Task Steps Persistence** | Query `task_steps` | 200 OK | Steps inserted with `step_order` 1..4, `status: 'PENDING'` | **PASS** |
| **Task Retrieval by ID** | `GET /api/agent/tasks/:id` | 200 OK | Returns task entity, parsed plan, all steps, and linked telemetry | **PASS** |
| **Non-existent Task** | `GET /api/agent/tasks/non-existent-uuid` | 404 Not Found | Safe error: `TASK_NOT_FOUND` | **PASS** |
| **State Machine Transition Rules** | Node assertion runner | Passed | Legal transitions succeed, illegal transitions strictly rejected | **PASS** |
| **Durable Task Persistence** | Re-query after restart | 200 OK | Task status `COMPLETED`, steps count 4, goal persisted | **PASS** |
| **Telemetry Linking** | Query `ai_telemetry` | 200 OK | Telemetry row linked directly to `task_id` | **PASS** |
| **Frontend UI** | `tsc -b && vite build` | 0 errors | Simple Agent Studio, timeline, step cards, and task history | **PASS** |

---

# 7. Phase 7 Completion Checklist

## Concepts
- [x] Difference between LLM and agent understood
- [x] Agent state understood
- [x] Execution loop understood
- [x] Host vs model responsibilities understood
- [x] Deterministic termination understood

## State Machine
- [x] REQUESTED implemented
- [x] RUNNING implemented
- [x] LLM_CALL represented
- [x] VALIDATING represented
- [x] COMPLETED implemented
- [x] FAILED implemented
- [x] Invalid transitions rejected

## Agent Output
- [x] Structured planning schema defined (`AgentPlanSchema`)
- [x] Zod validation implemented
- [x] Step count bounded (`MAX_PLAN_STEPS = 10`)
- [x] Invalid output handled gracefully
- [x] Agent never claims fake tool execution

## Persistence
- [x] Task persisted in MySQL `tasks`
- [x] Status persisted throughout transitions
- [x] Generated plan persisted in `final_report`
- [x] task_steps persisted with `step_order` and `status: PENDING`
- [x] Failure persisted with `error_message`
- [x] Existing AI telemetry reused and linked to `task_id`
- [x] Task survives server restart

## Agent Host
- [x] Host controls state transitions
- [x] Host controls cycle count
- [x] Host controls termination
- [x] Existing LLM service reused
- [x] Maximum cycles enforced (`MAX_CYCLES = 10`)
- [x] Execution timeout enforced (`MAX_EXECUTION_TIME_MS = 180000`)

## API
- [x] Agent task endpoint implemented (`POST /api/agent/tasks`)
- [x] Input validation implemented (empty, short, oversized)
- [x] Safe errors implemented
- [x] Task retrieval verified (`GET /api/agent/tasks` and `GET /api/agent/tasks/:id`)

## Frontend
- [x] Agent task input implemented
- [x] Run Agent action implemented
- [x] State displayed in HUD
- [x] Execution timeline displayed (`REQUESTED → RUNNING → LLM_CALL → VALIDATING → COMPLETED`)
- [x] Generated steps displayed
- [x] Failure state displayed

## Security
- [x] No direct database access from LLM
- [x] No Redis access from LLM
- [x] No arbitrary network access
- [x] No shell access
- [x] No Gmail access
- [x] No tool calling
- [x] No model-controlled authorization
- [x] No model-controlled state transition
- [x] Secrets remain backend-only

## Reliability
- [x] Provider timeout tested
- [x] Validation failure tested
- [x] Maximum-cycle watchdog tested
- [x] Execution timeout tested
- [x] Persistence failure considered
- [x] No execution can remain indefinitely RUNNING

## Git
- [x] Server build passes
- [x] Client build passes
- [x] Verification completed
- [x] Documentation updated
- [x] Changes committed
- [x] Changes pushed
- [x] Working tree clean

---

# 8. Project Roadmap

```text
PHASE 1 — REQUIREMENTS & ARCHITECTURE
████████████████████ COMPLETED

PHASE 2 — LOCAL DEVELOPMENT ENVIRONMENT
████████████████████ COMPLETED

PHASE 3 — BASIC REACT + EXPRESS
████████████████████ COMPLETED

PHASE 4 — MYSQL DATABASE INTEGRATION
████████████████████ COMPLETED

PHASE 5 — REDIS INTEGRATION
████████████████████ COMPLETED

PHASE 6 — AI / LLM INTEGRATION
████████████████████ COMPLETED

PHASE 7 — SIMPLE AGENT
████████████████████ COMPLETED

  [x] 7.1 Inspect task/task_steps architecture
  [x] 7.2 Define state machine
  [x] 7.3 Define AgentPlan Zod schema
  [x] 7.4 Implement task persistence
  [x] 7.5 Implement task-step persistence
  [x] 7.6 Implement Agent Host
  [x] 7.7 Reuse Phase 6 LLM service
  [x] 7.8 Implement bounded execution loop
  [x] 7.9 Add cycle/time watchdogs
  [x] 7.10 Implement agent API
  [x] 7.11 Implement task retrieval
  [x] 7.12 Build React Agent UI
  [x] 7.13 Test failure scenarios
  [x] 7.14 Verify security boundaries
  [x] 7.15 Update documentation
  [x] 7.16 Build, commit, push, verify clean Git state

PHASE 8 — TOOL CALLING
░░░░░░░░░░░░░░░░░░░░ NEXT PHASE

PHASE 9 — WEB SEARCH
░░░░░░░░░░░░░░░░░░░░
```

---

# Phase 7 Golden Rule

**An agent is not an LLM with unlimited freedom.**

With Phase 7 complete, the platform has established a controlled, bounded, and stateful AI worker. The application owns the state machine, validates all proposals, and persists steps in MySQL. We are ready for **Phase 8 — Tool Calling**.
