# Phase 19 — Reliability, Recovery & Resilient Execution

## 1. Overview
Phase 19 hardens the AI Workforce Platform against real-world failures, partial outages, crashes, transient network timeouts, and resource contention. Rather than assuming all external providers and background services are always available, the platform incorporates a structured, predictable failure response architecture.

**Core Reliability Principle:**
> Failures are expected. Uncontrolled failure behavior is not. Every failure must be typed, categorized, bounded, and safely observable.

---

## 2. Key Architecture Components

### 2.1 Failure Taxonomy & Normalized Error Handling
- **Categorization:** Errors are partitioned into deterministic categories:
  - `TRANSIENT_NETWORK` (retryable with backoff)
  - `RATE_LIMIT` (retryable with jittered backoff)
  - `PROVIDER_TIMEOUT` (retryable for idempotent actions)
  - `VALIDATION_ERROR` (non-retryable terminal failure)
  - `AUTHENTICATION_ERROR` (non-retryable, requires operator intervention)
  - `AUTHORIZATION_ERROR` (non-retryable, strict security boundary)
  - `POLICY_VIOLATION` (non-retryable, governed constraint)
  - `APPROVAL_REQUIRED` (controlled pause state)
  - `UNKNOWN_OUTCOME` (non-retryable post-dispatch timeout on external side effects)
  - `INTERNAL_ERROR` (non-retryable bug/unhandled failure)
- **Sanitized User Messages:** Internal connection strings, raw stack traces, API keys, and infrastructure details are stripped before user-facing responses or task status updates are emitted.

### 2.2 Retry Budget & Exponential Backoff with Jitter
- **Full Jitter Exponential Backoff:** $t_{delay} = \text{random}(0, \min(cap, base \times 2^{attempt}))$.
- **Cross-Layer Retry Ceiling:** Tasks have a `total_retries` counter in MySQL. Job-level retries cannot multiply tool-level retries; total task retries are capped at `MAX_TOTAL_TASK_RETRIES` (default: 5).

### 2.3 Provider-Level Circuit Breakers
- Maintained per external provider (`openai`, `gmail`, `qdrant`, `serpapi`, `mysql`, `redis`).
- State transitions:
  - `CLOSED`: Normal operation; failures increment consecutive failure counter.
  - `OPEN`: Tripped after consecutive failure threshold (default: 5 within 60s). Fast-fails subsequent requests without making network calls for cooldown duration (default: 30s).
  - `HALF_OPEN`: Allows a single probe request after cooldown. Success resets to `CLOSED`; failure immediately re-trips to `OPEN`.

### 2.4 Hierarchical Timeouts & Deadline Propagation
- Defined global hierarchy:
  - Tool execution: 30 seconds
  - LLM call: 45 seconds
  - Single job attempt: 120 seconds
  - Complete task execution: 300 seconds
- **`ExecutionDeadline`:** Propagates remaining budget down to child calls; operations abort early if remaining time is insufficient.

### 2.5 Checkpointing & Partial Progress Preservation
- Completed plan steps and their observations are persisted in MySQL.
- Upon worker restart or recovery, `CheckpointManager` reconstructs the plan and resumes from the earliest uncompleted step without re-executing already-completed steps.

### 2.6 Orphaned Task Sweeper & Optimistic Concurrency
- **Stale Task Sweeper:** Detects tasks left in `RUNNING` status whose distributed worker lease or heartbeat has expired (>30s past expiry).
- **Optimistic Concurrency:** `tasks.version` incremented atomically (`UPDATE tasks SET version = version + 1 WHERE id = ? AND version = ?`). Conflicting updates are rejected with `CONCURRENT_MODIFICATION_DETECTED`.
- Reclaims orphaned tasks, cleans up stale locks, and re-enqueues them up to retry budget limit.

### 2.7 External Side-Effect Guard (Gmail Unknown Outcome)
- If a post-dispatch request to an external mutating side effect (e.g., `gmail_send`) times out after submission, the platform marks the operation `UNKNOWN_OUTCOME`.
- Automated blind retry is **strictly prohibited** to prevent duplicate outbound emails. Operator review is required.

### 2.8 Operator Manual Recovery & Attempt Traceability
- **`job_attempts` Table:** Records complete audit trace of every attempt (`job_id`, `task_id`, `organization_id`, `attempt_number`, `worker_id`, `status`, `error_code`, `error_category`, `error_details`, `duration_ms`).
- **Manual Retry API:** `POST /api/tasks/:taskId/retry` allows authenticated operators within their tenant to re-queue terminal `FAILED` tasks. Enforces anti-IDOR isolation and increments version.

---

## 3. Database Schema Updates
- **`tasks` Table:**
  - `version INT NOT NULL DEFAULT 1`: Optimistic locking version.
  - `total_retries INT NOT NULL DEFAULT 0`: Task-level retry budget tracker.
- **`job_attempts` Table:**
  - Comprehensive historical execution audit log per job attempt.

---

## 4. API Endpoints
- `GET /api/health/reliability`: Reports circuit breaker states, recovery metrics, queue telemetry, and error rates.
- `GET /api/tasks/:taskId/attempts`: Returns chronological attempt trace for a task (Tenant-isolated).
- `POST /api/tasks/:taskId/retry`: Manually retries a failed task (Tenant-isolated).

---

## 5. Verification Results
- **Phase 19 Test Suite (`server/src/reliability/testPhase19.ts`):** 17/17 tests passed (100%).
- **Full Regression Suites:**
  - Phase 18 (Background Workers): 13/13 passed.
  - Phase 17 (Human Approval): 21/21 passed.
  - Phase 16 (Gmail Automation): 27/27 passed.
  - Total across all suites: 155+ tests passing with 0 failures.
