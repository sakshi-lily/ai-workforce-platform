# Phase 17: Human Approval & Controlled External Actions — Specification & Verification Report

**Stage:** Advanced  
**Phase:** 17 — Human Approval & Controlled External Actions  
**Status:** COMPLETED & VERIFIED ✅  
**Prerequisites:** Phases 1–16 completed  
**Next Phase:** Phase 18 — Background Workers  

---

## 1. Executive Summary

Phase 17 introduces the formal **Human-in-the-Loop (HITL) Governance & Approval System** for sensitive AI workforce actions.

Phase 16 introduced Gmail as the platform's first external communication provider, establishing the foundational boundary that reading emails and sending emails operate under fundamentally different risk tiers.

Phase 17 establishes the definitive execution boundary:
> **"The LLM may propose an external action, but only the application and an authorized human can authorize execution."**

### Core Safety Axioms
1. **Approval is not an LLM output:** An LLM generating `"status: APPROVED"` or `"I approve sending this email"` is treated as untrusted text and ignored.
2. **Approval is not a client boolean:** The frontend cannot pass `approved: true` to bypass verification.
3. **Approval is not a tool parameter:** Approval cannot be injected into tool arguments.
4. **Approval is a durable application-owned state transition:** Approval exists solely as an authenticated, tenant-isolated state transition inside the database, performed by a verified human reviewer.
5. **No Blind Approval:** Human reviewers are presented with the full proposed action context (target tool, recipient, subject, sanitized body preview, risk classification, task context, reason, expiration) before making a decision.
6. **Immutable Action Binding:** The approval is cryptographically and logically bound to the exact payload proposed by the agent. If the payload is modified or tampered with, execution is immediately rejected.
7. **Atomic Transitions & Double-Execution Guard:** An approved action can only execute once. Atomic conditional database transitions (`APPROVED` -> `EXECUTING`) prevent network race conditions and duplicate real-world side effects.

---

## 2. Target Architecture & Safety Chain

```text
                           USER / TASK
                                │
                                ▼
                         Agent Runtime
                                │
                                ▼
                       Agent Decision (LLM)
                                │
                                ▼
                       Tool Registry & Policy
                                │
               ┌────────────────┴────────────────┐
               │                                 │
         Safe Action                     Sensitive Action
       (READ_ONLY / LOW_RISK)         (EXTERNAL_SIDE_EFFECT)
               │                                 │
               ▼                                 ▼
         Direct Execution                 Create Approval
               │                          (Status: PENDING)
               │                                 │
               │                                 ▼
               │                        Task & Step Transition to:
               │                          WAITING_FOR_APPROVAL
               │                                 │
               │                                 ▼
               │                        Halt Execution Loop
               │                         (No fake completion)
               │                                 │
               │                                 ▼
               │                         Human Review Center
               │                                 │
               │                    ┌────────────┴────────────┐
               │                    │                         │
               │                    ▼                         ▼
               │                REJECT                     APPROVE
               │                    │                         │
               │                    ▼                         ▼
               │             Terminal State:           Policy Re-check
               │                REJECTED             (Anti-Tamper & TTL)
               │                    │                         │
               │                    ▼                         ▼
               │             Task Finishes:            Atomic Transition:
               │            Controlled Halt               EXECUTING
               │                                              │
               │                                              ▼
               │                                       Gmail API Execute
               │                                              │
               │                                              ▼
               │                                       Terminal State:
               │                                          EXECUTED
               │                                              │
               └────────────────────┬─────────────────────────┘
                                    │
                                    ▼
                         Observation & Synthesis
                                    │
                                    ▼
                          Final Task Report
```

---

## 3. Approval State Machine & Lifecycle

The approval system implements a strict, non-bypassable finite state machine (`server/src/approvals/approvalTypes.ts`):

```text
                           ┌──────────────┐
                           │   PENDING    │
                           └──────┬───────┘
                                  │
                  ┌───────────────┼───────────────┐
                  ▼               ▼               ▼
             APPROVED          REJECTED        CANCELLED
                  │
                  ▼
              EXECUTING
                  │
                  ▼
              EXECUTED
```

### Transition Invariants
- `PENDING` -> `APPROVED` (via authorized human decision)
- `PENDING` -> `REJECTED` (via authorized human decision with required reason note)
- `PENDING` -> `CANCELLED` (via explicit cancellation or parent task cancellation)
- `PENDING` -> `EXPIRED` (dynamically evaluated when `expires_at < NOW()`)
- `APPROVED` -> `EXECUTING` (atomic transition upon initiating execution)
- `EXECUTING` -> `EXECUTED` (upon successful provider invocation)
- `EXECUTING` -> `FAILED` / `REJECTED` (if provider execution fails)
- **Illegal Transitions Blocked:** Terminal states (`REJECTED`, `EXECUTED`, `EXPIRED`, `CANCELLED`) cannot transition to `APPROVED` or any other active state.

---

## 4. Database Architecture & Schema Extensions

The existing foundational `approvals` table was modified and extended (`server/src/db/migratePhase17.ts`) without creating duplicate tables:

```sql
ALTER TABLE approvals 
  MODIFY COLUMN id VARCHAR(64) PRIMARY KEY,
  MODIFY COLUMN status ENUM(
    'PENDING', 'APPROVED', 'EXECUTING', 'EXECUTED', 'REJECTED', 'EXPIRED', 'CANCELLED', 'MODIFIED'
  ) NOT NULL DEFAULT 'PENDING';

-- Extended audit & governance columns
ALTER TABLE approvals
  ADD COLUMN step_id VARCHAR(36) NULL AFTER task_id,
  ADD COLUMN organization_id VARCHAR(64) NULL AFTER step_id,
  ADD COLUMN requested_by VARCHAR(64) NULL AFTER organization_id,
  ADD COLUMN approved_by VARCHAR(64) NULL AFTER requested_by,
  ADD COLUMN tool_name VARCHAR(100) NULL AFTER approved_by,
  ADD COLUMN risk_level VARCHAR(50) NOT NULL DEFAULT 'EXTERNAL_SIDE_EFFECT' AFTER tool_name,
  ADD COLUMN request_payload JSON NULL AFTER payload_preview,
  ADD COLUMN decision_note TEXT NULL AFTER reviewer_notes,
  ADD COLUMN requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP AFTER created_at,
  ADD COLUMN decided_at TIMESTAMP NULL AFTER reviewed_at,
  ADD COLUMN expires_at TIMESTAMP NULL AFTER decided_at,
  ADD COLUMN executed_at TIMESTAMP NULL AFTER expires_at;

-- Dedicated indexes for tenant filtering and TTL queries
ALTER TABLE approvals ADD INDEX idx_approvals_org_status (organization_id, status);
ALTER TABLE approvals ADD INDEX idx_approvals_expires (expires_at);

-- Task & Step state machine extensions
ALTER TABLE tasks 
  MODIFY COLUMN status ENUM(
    'PENDING', 'REQUESTED', 'IN_PROGRESS', 'RUNNING', 
    'AWAITING_APPROVAL', 'WAITING_FOR_APPROVAL', 
    'COMPLETED', 'FAILED', 'CANCELLED'
  ) NOT NULL DEFAULT 'REQUESTED';

ALTER TABLE task_steps 
  MODIFY COLUMN status ENUM(
    'PENDING', 'IN_PROGRESS', 'WAITING_FOR_APPROVAL', 'COMPLETED', 'FAILED', 'SKIPPED'
  ) NOT NULL DEFAULT 'PENDING';
```

---

## 5. Security & Governance Invariants

### 5.1. Multi-Tenant Isolation & Anti-IDOR Protection
- Every approval query and state mutation is strictly scoped by `WHERE id = ? AND organization_id = ?`.
- The `organizationId` is derived exclusively from the authenticated JWT session (`req.user.organizationId`).
- A user from Organization B cannot view, approve, reject, or execute approvals belonging to Organization A (returns 404 / 403).

### 5.2. Action Payload Binding & Anti-Tampering
- The client cannot supply a modified payload when approving an action.
- The approval endpoint only accepts `{ decision: "APPROVED", note?: string }`.
- Execution retrieves the exact, immutable `request_payload` stored in MySQL at creation time.
- Any attempt to alter recipients or email body invalidates the execution.

### 5.3. TTL & Expiration Handling
- Configurable approval TTL (default: 60 minutes via `APPROVAL_CONFIG.DEFAULT_TTL_MINUTES`).
- If `expires_at <= NOW()`, the approval status is dynamically transitioned to `EXPIRED`.
- Expired approvals cannot be approved or executed.

### 5.4. Double Execution & Concurrency Protection
- Repeated calls to approve or execute are blocked via atomic conditional updates:
  ```sql
  UPDATE approvals 
  SET status = 'EXECUTING' 
  WHERE id = ? AND status = 'APPROVED'
  ```
- If `affectedRows === 0`, execution fails immediately with `409 Conflict`, ensuring that duplicate clicks or network retries never send duplicate emails.

### 5.5. Self-Approval Policy
- **Documented Policy:** In Phase 17, an authenticated user is permitted to review and approve their own proposed action, provided the action belongs to their organization. Higher-risk multi-party separation of duties can be layered in future phases.

### 5.6. Task Cancellation Interaction
- If a user cancels a task that has a pending or approved approval, the approval record is atomically updated to `status = 'CANCELLED'`.
- Subsequent execution attempts on cancelled approvals are strictly rejected with 409 Conflict.

---

## 6. HTTP REST API Reference

All endpoints are mounted at `/api/approvals` and protected by Phase 13 authentication middleware (`authenticateToken`):

| Method | Endpoint | Description | Auth Scoped |
|---|---|---|---|
| `GET` | `/api/approvals` | List approvals for authenticated organization (supports `?status=PENDING`) | Yes (`req.user.organizationId`) |
| `GET` | `/api/approvals/:id` | Get approval details by ID (anti-IDOR protected) | Yes (`req.user.organizationId`) |
| `POST` | `/api/approvals/:id/approve` | Approve and atomically execute the proposed action | Yes (`req.user.id`) |
| `POST` | `/api/approvals/:id/reject` | Reject the action with mandatory/optional reason note | Yes (`req.user.id`) |
| `POST` | `/api/approvals/:id/cancel` | Cancel a pending approval | Yes (`req.user.id`) |

---

## 7. Frontend Human Review UX

1. **Approvals Center (`client/src/pages/ApprovalsPage.tsx`):**
   - Live pending approvals badge in the navigation shell (`AppShell.tsx`).
   - Filter tabs: Pending, Approved, Executed, Rejected, Cancelled, All.
   - Action inspection cards displaying tool name, recipient summary, risk badge, and expiration countdown.
2. **Review & Decide Modal:**
   - Full parameter review: Tool, Risk Tier, Task Link, Requester, Expiration.
   - Action preview: Target recipient list, Subject, sanitized Plain Text preview.
   - Decision controls: [Reject Action] (prompts for decision note) and [Approve & Execute] (one-click verified execution).
3. **Task Management Studio (`client/src/tasks/TaskManagementStudio.tsx`):**
   - Status badge and filter for `WAITING_FOR_APPROVAL`.
   - Glowing amber warning banner when a task is awaiting human authorization.
   - Direct shortcut link to open the pending approval in the Review Center.

---

## 8. Verification & Test Results

### 8.1. Phase 17 Automated Test Suite (`server/src/approvals/testPhase17.ts`)
Run via `npm run test:phase17`:

```text
=======================================================
  PHASE 17 HUMAN APPROVAL & CONTROLLED ACTIONS TEST SUITE
=======================================================

--- 1. Approval State Machine & Transitions ---
  [PASS] Allows valid state transitions (PENDING -> APPROVED -> EXECUTING -> EXECUTED) (0ms)
  [PASS] Rejects illegal transition from terminal state (REJECTED -> APPROVED) (0ms)
  [PASS] Rejects illegal transition from terminal state (EXECUTED -> APPROVED) (0ms)

--- 2. Approval Policy & Risk Classification ---
  [PASS] Identifies EXTERNAL_SIDE_EFFECT actions as requiring approval (0ms)
  [PASS] Identifies READ_ONLY and LOW_RISK tools as autonomous (no approval required) (0ms)

--- 3. Action & Payload Binding & Anti-Tampering ---
  [PASS] Creates approval tightly bound to exact action payload and task context (13ms)
  [PASS] Server derives approver identity from authenticated context (ignoring client spoofing) (32ms)

--- 4. Multi-Tenant Isolation & Anti-IDOR Protection ---
  [PASS] Creates approval owned strictly by Tenant A (9ms)
  [PASS] Tenant B CANNOT view Tenant A approval (Anti-IDOR returns null/404) (1ms)
  [PASS] Tenant B CANNOT approve Tenant A approval (1ms)
  [PASS] Tenant B CANNOT reject Tenant A approval (2ms)
  [PASS] Tenant B list does NOT contain Tenant A approvals (4ms)

--- 5. Approval Expiration & TTL Enforcement ---
  [PASS] Creates approval and simulates TTL expiry in the past (12ms)
  [PASS] Rejects execution of an expired approval (1ms)

--- 6. Double Approval, Concurrency & Double Execution ---
  [PASS] Creates pending approval for concurrency testing (8ms)
  [PASS] First approval succeeds; duplicate approval request is rejected with 409 (42ms)
  [PASS] Calling executeApprovedAction twice is blocked by atomic state transition (1ms)

--- 7. Task Cancellation Interaction ---
  [PASS] Cancelling a task with pending approval sets approval status to CANCELLED (34ms)

--- 8. End-to-End Multi-Step Agent Workflows ---
  [PASS] Scenario 1: Full Lifecycle — Proposal -> WAITING_FOR_APPROVAL -> Human Approves -> Execution -> COMPLETED (458ms)
  [PASS] Scenario 2: Full Lifecycle — Proposal -> WAITING_FOR_APPROVAL -> Human Rejects -> Safe Controlled Halt (475ms)

--- 9. Audit Trail Verification ---
  [PASS] Verifies audit_logs records approval lifecycle events (1ms)

=======================================================
  PHASE 17 TEST RESULTS SUMMARY
=======================================================

Total Tests: 21
Passed:      21
Failed:      0
```

### 8.2. Comprehensive Full Regression Matrix
All test suites across the platform pass with 100% compliance:

| Phase | Test Suite Script | Status | Pass Rate |
|---|---|---|---|
| Phase 13: Authentication | `npm run test:phase13` | Passed ✅ | 26 / 26 |
| Phase 14: Task Management | `npm run test:phase14` | Passed ✅ | 29 / 29 |
| Phase 15: Advanced Agent Architecture | `npm run test:phase15` | Passed ✅ | 22 / 22 |
| Phase 16: Gmail Automation | `npm run test:phase16` | Passed ✅ | 27 / 27 |
| **Phase 17: Human Approval** | `npm run test:phase17` | **Passed ✅** | **21 / 21** |
| **Total Platform Assertions** | | **All Green** | **125 / 125** |

### 8.3. Production Build Status
- **Backend Server (`server`):** `npm run build` exits 0 (TypeScript compile clean).
- **Frontend Client (`client`):** `npm run build` exits 0 (Vite build clean in 604ms).

---

## 9. Handoff to Phase 18 — Background Workers

With Phase 17 complete, the platform has achieved:
- Real authenticated identity and tenant boundaries (Phase 13)
- Durable task and step lifecycle tracking (Phase 14)
- Deterministic multi-step agent runtime with DAG planning (Phase 15)
- Governed external email communication via Gmail (Phase 16)
- Human approval boundary for sensitive external side effects (Phase 17)

**Next Architectural Challenge:**
When tasks require human review or lengthy external operations, HTTP requests cannot remain open indefinitely.

**Phase 18 will introduce:**
- Asynchronous job execution and queue infrastructure (Redis-backed)
- Worker processes and supervisor daemons
- Durable task resumption from `WAITING_FOR_APPROVAL`
- Retries, backoff, and worker failure isolation
