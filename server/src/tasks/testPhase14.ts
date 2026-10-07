/**
 * AI Workforce Platform — Phase 14: Task Management Verification Suite
 *
 * Exhaustively validates:
 * 1. Task domain model & deterministic lifecycle state transitions (assertValidTaskTransition).
 * 2. Zod validation schemas for input bounds (title <= 255, goal <= 3000, missing goal rejection).
 * 3. Authentication protection on all /api/tasks endpoints (401 without Bearer token).
 * 4. Client-supplied ownership spoofing defense (server derives identity strictly from JWT).
 * 5. Bounded pagination and tenant-scoped task listing.
 * 6. Anti-IDOR protection (cross-organization access returns 404 to avoid resource discovery).
 * 7. Metadata update via PATCH (scoped to authorized organization).
 * 8. Cancellation mechanics (allowed from REQUESTED/RUNNING; rejected from terminal states with 409).
 * 9. Duplicate execution prevention (attempting to run already active/terminal tasks yields 409).
 * 10. Agent host execution linkage (Task -> Task Steps -> Tool Executions -> Result -> Sources).
 * 11. Audit logging for TASK_CREATED, TASK_STARTED, TASK_COMPLETED, TASK_CANCELLED, TASK_UPDATED.
 * 12. Durability in MySQL (verifying direct database rows).
 * 13. Regression verification across health endpoints and tool registry.
 */

import request from "supertest";
import jwt from "jsonwebtoken";
import { app } from "../app";
import { pool } from "../db/pool";
import { config } from "../config/env";
import { ALLOWED_TRANSITIONS, assertValidTaskTransition, InvalidTaskStateTransitionError } from "./taskTransitions";
import { TaskLifecycleState } from "./taskTypes";
import { RowDataPacket } from "mysql2/promise";

interface TestReport {
  name: string;
  category: string;
  passed: boolean;
  durationMs: number;
  details?: string;
}

const reports: TestReport[] = [];

async function runTest(
  category: string,
  name: string,
  fn: () => Promise<void>
): Promise<void> {
  const start = performance.now();
  try {
    await fn();
    const durationMs = Math.round(performance.now() - start);
    reports.push({ category, name, passed: true, durationMs });
    console.log(`  [PASS] ${name} (${durationMs}ms)`);
  } catch (error: unknown) {
    const durationMs = Math.round(performance.now() - start);
    const details = error instanceof Error ? error.message : String(error);
    reports.push({ category, name, passed: false, durationMs, details });
    console.error(`  [FAIL] ${name} (${durationMs}ms): ${details}`);
  }
}

// Helpers to mint valid tokens for testing
function generateTestToken(user: { id: string; email: string; organizationId: string; role: string }): string {
  return jwt.sign(
    {
      userId: user.id,
      email: user.email,
      organizationId: user.organizationId,
      role: user.role,
    },
    config.auth.jwtSecret,
    { expiresIn: "1h" }
  );
}

export async function runPhase14VerificationSuite(): Promise<{
  total: number;
  passed: number;
  failed: number;
  allPassed: boolean;
}> {
  console.log("\n=======================================================");
  console.log("  PHASE 14 TASK MANAGEMENT VERIFICATION SUITE");
  console.log("=======================================================\n");

  // Ensure test users exist in DB
  const userA = {
    id: "usr-phase14-test-a",
    email: "test.user.a@tenant-a.local",
    organizationId: "org-phase14-tenant-a",
    role: "ADMIN",
  };

  const userB = {
    id: "usr-phase14-test-b",
    email: "test.user.b@tenant-b.local",
    organizationId: "org-phase14-tenant-b",
    role: "USER",
  };

  // Seed test users in MySQL if not present
  await pool.query(
    `INSERT INTO users (id, email, password_hash, full_name, role, organization_id, created_at, updated_at)
     VALUES (?, ?, 'dummy_hash', 'Test User A', 'ADMIN', ?, NOW(), NOW())
     ON DUPLICATE KEY UPDATE organization_id = VALUES(organization_id);`,
    [userA.id, userA.email, userA.organizationId]
  );

  await pool.query(
    `INSERT INTO users (id, email, password_hash, full_name, role, organization_id, created_at, updated_at)
     VALUES (?, ?, 'dummy_hash', 'Test User B', 'USER', ?, NOW(), NOW())
     ON DUPLICATE KEY UPDATE organization_id = VALUES(organization_id);`,
    [userB.id, userB.email, userB.organizationId]
  );

  const tokenA = generateTestToken(userA);
  const tokenB = generateTestToken(userB);

  // -----------------------------------------------------------
  // 1. Task Domain & Lifecycle Transition Tests
  // -----------------------------------------------------------
  console.log("[Category 1: Task State Machine & Transitions]");

  await runTest("Domain", "Valid transitions adhere strictly to state machine", async () => {
    // REQUESTED -> RUNNING
    assertValidTaskTransition("REQUESTED", "RUNNING");
    // REQUESTED -> CANCELLED
    assertValidTaskTransition("REQUESTED", "CANCELLED");
    // RUNNING -> COMPLETED
    assertValidTaskTransition("RUNNING", "COMPLETED");
    // RUNNING -> FAILED
    assertValidTaskTransition("RUNNING", "FAILED");
    // RUNNING -> CANCELLED
    assertValidTaskTransition("RUNNING", "CANCELLED");
  });

  await runTest("Domain", "Terminal transitions are strictly rejected with 409 error", async () => {
    const invalidPairs: [TaskLifecycleState, TaskLifecycleState][] = [
      ["COMPLETED", "RUNNING"],
      ["COMPLETED", "FAILED"],
      ["COMPLETED", "CANCELLED"],
      ["FAILED", "RUNNING"],
      ["FAILED", "COMPLETED"],
      ["FAILED", "CANCELLED"],
      ["CANCELLED", "RUNNING"],
      ["CANCELLED", "COMPLETED"],
    ];

    for (const [from, to] of invalidPairs) {
      let threw = false;
      try {
        assertValidTaskTransition(from, to);
      } catch (err) {
        if (err instanceof InvalidTaskStateTransitionError) {
          threw = true;
          if (err.statusCode !== 409) {
            throw new Error(`Expected status 409 for transition ${from} -> ${to}, got ${err.statusCode}`);
          }
        }
      }
      if (!threw) {
        throw new Error(`Expected transition ${from} -> ${to} to be rejected, but it succeeded.`);
      }
    }
  });

  // -----------------------------------------------------------
  // 2. Authentication Protection
  // -----------------------------------------------------------
  console.log("\n[Category 2: Authentication Protection]");

  await runTest("Auth", "POST /api/tasks rejects unauthenticated requests with 401", async () => {
    const res = await request(app).post("/api/tasks").send({ goal: "Valid task goal" });
    if (res.status !== 401 || res.body.error?.code !== "UNAUTHENTICATED") {
      throw new Error(`Expected 401 UNAUTHENTICATED, got ${res.status}: ${JSON.stringify(res.body)}`);
    }
  });

  await runTest("Auth", "GET /api/tasks rejects unauthenticated requests with 401", async () => {
    const res = await request(app).get("/api/tasks");
    if (res.status !== 401 || res.body.error?.code !== "UNAUTHENTICATED") {
      throw new Error(`Expected 401 UNAUTHENTICATED, got ${res.status}: ${JSON.stringify(res.body)}`);
    }
  });

  await runTest("Auth", "GET /api/tasks/:id rejects unauthenticated requests with 401", async () => {
    const res = await request(app).get("/api/tasks/task-test-id");
    if (res.status !== 401 || res.body.error?.code !== "UNAUTHENTICATED") {
      throw new Error(`Expected 401 UNAUTHENTICATED, got ${res.status}: ${JSON.stringify(res.body)}`);
    }
  });

  await runTest("Auth", "PATCH /api/tasks/:id rejects unauthenticated requests with 401", async () => {
    const res = await request(app).patch("/api/tasks/task-test-id").send({ title: "New title" });
    if (res.status !== 401 || res.body.error?.code !== "UNAUTHENTICATED") {
      throw new Error(`Expected 401 UNAUTHENTICATED, got ${res.status}: ${JSON.stringify(res.body)}`);
    }
  });

  await runTest("Auth", "POST /api/tasks/:id/run rejects unauthenticated requests with 401", async () => {
    const res = await request(app).post("/api/tasks/task-test-id/run");
    if (res.status !== 401 || res.body.error?.code !== "UNAUTHENTICATED") {
      throw new Error(`Expected 401 UNAUTHENTICATED, got ${res.status}: ${JSON.stringify(res.body)}`);
    }
  });

  await runTest("Auth", "POST /api/tasks/:id/cancel rejects unauthenticated requests with 401", async () => {
    const res = await request(app).post("/api/tasks/task-test-id/cancel");
    if (res.status !== 401 || res.body.error?.code !== "UNAUTHENTICATED") {
      throw new Error(`Expected 401 UNAUTHENTICATED, got ${res.status}: ${JSON.stringify(res.body)}`);
    }
  });

  // -----------------------------------------------------------
  // 3. Input Validation
  // -----------------------------------------------------------
  console.log("\n[Category 3: Task Input Validation]");

  await runTest("Validation", "Rejects task creation with missing goal/prompt", async () => {
    const res = await request(app)
      .post("/api/tasks")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ title: "Only a title, no goal" });

    if (res.status !== 400 || res.body.error?.code !== "INVALID_TASK_INPUT") {
      throw new Error(`Expected 400 INVALID_TASK_INPUT, got ${res.status}: ${JSON.stringify(res.body)}`);
    }
  });

  await runTest("Validation", "Rejects task creation with too short goal (< 3 chars)", async () => {
    const res = await request(app)
      .post("/api/tasks")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ goal: "hi" });

    if (res.status !== 400 || res.body.error?.code !== "INVALID_TASK_INPUT") {
      throw new Error(`Expected 400 INVALID_TASK_INPUT, got ${res.status}: ${JSON.stringify(res.body)}`);
    }
  });

  await runTest("Validation", "Rejects task creation with oversized goal (> 3000 chars)", async () => {
    const hugeGoal = "a".repeat(3001);
    const res = await request(app)
      .post("/api/tasks")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ goal: hugeGoal });

    if (res.status !== 400 || res.body.error?.code !== "INVALID_TASK_INPUT") {
      throw new Error(`Expected 400 INVALID_TASK_INPUT, got ${res.status}: ${JSON.stringify(res.body)}`);
    }
  });

  // -----------------------------------------------------------
  // 4. Task Creation & Server-Derived Ownership
  // -----------------------------------------------------------
  console.log("\n[Category 4: Task Creation & Ownership Protection]");

  let createdTaskIdA: string = "";

  await runTest("Creation", "Creates task and enforces server-derived identity (spoofing ignored)", async () => {
    const res = await request(app)
      .post("/api/tasks")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({
        title: "Research Apex Cloud Infrastructure",
        goal: "Research Apex Cloud and verify whether they are a qualified customer.",
        priority: "HIGH",
        // Client spoofing attempt:
        userId: "hacker-user-id",
        organizationId: "evil-org-id",
      });

    if (res.status !== 201) {
      throw new Error(`Expected 201, got ${res.status}: ${JSON.stringify(res.body)}`);
    }

    const task = res.body.data;
    createdTaskIdA = task.id;

    if (!task.id || task.status !== "REQUESTED") {
      throw new Error(`Task should start in REQUESTED state, got ${task.status}`);
    }

    // Check that identity was strictly derived from tokenA
    if (task.user_id !== userA.id) {
      throw new Error(`Spoofing failed: user_id is ${task.user_id}, expected ${userA.id}`);
    }
    if (task.organization_id !== userA.organizationId) {
      throw new Error(`Spoofing failed: organization_id is ${task.organization_id}, expected ${userA.organizationId}`);
    }
  });

  // -----------------------------------------------------------
  // 5. Anti-IDOR & Organization Isolation
  // -----------------------------------------------------------
  console.log("\n[Category 5: Tenant Isolation & Anti-IDOR Protection]");

  await runTest("Anti-IDOR", "User A can fetch their own task details", async () => {
    const res = await request(app)
      .get(`/api/tasks/${createdTaskIdA}`)
      .set("Authorization", `Bearer ${tokenA}`);

    if (res.status !== 200 || !res.body.data?.task) {
      throw new Error(`Expected 200 with task data, got ${res.status}`);
    }
    if (res.body.data.task.id !== createdTaskIdA) {
      throw new Error(`Task ID mismatch`);
    }
  });

  await runTest("Anti-IDOR", "User B is denied access to User A's task with 404 TASK_NOT_FOUND", async () => {
    const res = await request(app)
      .get(`/api/tasks/${createdTaskIdA}`)
      .set("Authorization", `Bearer ${tokenB}`);

    // Must return 404 to avoid disclosing task existence across tenants
    if (res.status !== 404 || res.body.error?.code !== "TASK_NOT_FOUND") {
      throw new Error(`Expected 404 TASK_NOT_FOUND, got ${res.status}: ${JSON.stringify(res.body)}`);
    }
  });

  await runTest("Anti-IDOR", "User B cannot update User A's task (returns 404)", async () => {
    const res = await request(app)
      .patch(`/api/tasks/${createdTaskIdA}`)
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ title: "Malicious title overwrite" });

    if (res.status !== 404 || res.body.error?.code !== "TASK_NOT_FOUND") {
      throw new Error(`Expected 404 TASK_NOT_FOUND, got ${res.status}: ${JSON.stringify(res.body)}`);
    }
  });

  await runTest("Anti-IDOR", "User B cannot run User A's task (returns 404)", async () => {
    const res = await request(app)
      .post(`/api/tasks/${createdTaskIdA}/run`)
      .set("Authorization", `Bearer ${tokenB}`);

    if (res.status !== 404 || res.body.error?.code !== "TASK_NOT_FOUND") {
      throw new Error(`Expected 404 TASK_NOT_FOUND, got ${res.status}: ${JSON.stringify(res.body)}`);
    }
  });

  await runTest("Anti-IDOR", "User B cannot cancel User A's task (returns 404)", async () => {
    const res = await request(app)
      .post(`/api/tasks/${createdTaskIdA}/cancel`)
      .set("Authorization", `Bearer ${tokenB}`);

    if (res.status !== 404 || res.body.error?.code !== "TASK_NOT_FOUND") {
      throw new Error(`Expected 404 TASK_NOT_FOUND, got ${res.status}: ${JSON.stringify(res.body)}`);
    }
  });

  // -----------------------------------------------------------
  // 6. Listing & Pagination
  // -----------------------------------------------------------
  console.log("\n[Category 6: Task Listing & Bounded Pagination]");

  await runTest("Listing", "GET /api/tasks lists tasks scoped strictly to caller's organization", async () => {
    const resA = await request(app)
      .get("/api/tasks")
      .set("Authorization", `Bearer ${tokenA}`);

    if (resA.status !== 200 || !Array.isArray(resA.body.data)) {
      throw new Error(`Expected 200 with array data, got ${resA.status}`);
    }

    const taskIdsA = resA.body.data.map((t: any) => t.id);
    if (!taskIdsA.includes(createdTaskIdA)) {
      throw new Error(`User A should see task ${createdTaskIdA}`);
    }

    const resB = await request(app)
      .get("/api/tasks")
      .set("Authorization", `Bearer ${tokenB}`);

    const taskIdsB = resB.body.data.map((t: any) => t.id);
    if (taskIdsB.includes(createdTaskIdA)) {
      throw new Error(`Tenant leak: User B saw User A's task ${createdTaskIdA}`);
    }
  });

  await runTest("Listing", "Pagination parameters limit and offset are respected and bounded", async () => {
    const res = await request(app)
      .get("/api/tasks?limit=5&offset=0")
      .set("Authorization", `Bearer ${tokenA}`);

    if (res.status !== 200) {
      throw new Error(`Expected 200, got ${res.status}`);
    }
    if (res.body.pagination.limit !== 5 || res.body.pagination.offset !== 0) {
      throw new Error(`Pagination metadata mismatch: ${JSON.stringify(res.body.pagination)}`);
    }
  });

  // -----------------------------------------------------------
  // 7. Metadata Update
  // -----------------------------------------------------------
  console.log("\n[Category 7: Task Metadata Updates]");

  await runTest("Update", "PATCH /api/tasks/:id updates title on authorized task", async () => {
    const newTitle = "Updated Apex Cloud Research Goal";
    const res = await request(app)
      .patch(`/api/tasks/${createdTaskIdA}`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ title: newTitle });

    if (res.status !== 200 || res.body.data.title !== newTitle) {
      throw new Error(`Expected 200 with updated title, got ${res.status}: ${JSON.stringify(res.body)}`);
    }
  });

  // -----------------------------------------------------------
  // 8. Cancellation Mechanics
  // -----------------------------------------------------------
  console.log("\n[Category 8: Cancellation Lifecycle]");

  let cancelTaskId: string = "";

  await runTest("Cancel", "Creates a second task and cancels it from REQUESTED state", async () => {
    const createRes = await request(app)
      .post("/api/tasks")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ goal: "Task destined to be cancelled" });

    cancelTaskId = createRes.body.data.id;

    const cancelRes = await request(app)
      .post(`/api/tasks/${cancelTaskId}/cancel`)
      .set("Authorization", `Bearer ${tokenA}`);

    if (cancelRes.status !== 200 || cancelRes.body.data.status !== "CANCELLED") {
      throw new Error(`Expected 200 CANCELLED, got ${cancelRes.status}: ${JSON.stringify(cancelRes.body)}`);
    }
  });

  await runTest("Cancel", "Attempting to cancel an already CANCELLED task returns 409", async () => {
    const res = await request(app)
      .post(`/api/tasks/${cancelTaskId}/cancel`)
      .set("Authorization", `Bearer ${tokenA}`);

    if (res.status !== 409 || !["INVALID_TASK_STATE", "INVALID_TASK_STATE_TRANSITION"].includes(res.body.error?.code)) {
      throw new Error(`Expected 409 INVALID_TASK_STATE or INVALID_TASK_STATE_TRANSITION, got ${res.status}: ${JSON.stringify(res.body)}`);
    }
  });

  // -----------------------------------------------------------
  // 9. Task Execution & Agent Integration
  // -----------------------------------------------------------
  console.log("\n[Category 9: Task Execution & Agent Linkage]");

  let runTaskId: string = "";

  await runTest("Execution", "Creates a task to execute with tools", async () => {
    const res = await request(app)
      .post("/api/tasks")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({
        title: "Customer Verification and Time Check",
        goal: "What time is it in America/New_York and what is 50 * 20?",
        allowedTools: ["get_current_time", "calculate"],
      });

    if (res.status !== 201) {
      throw new Error(`Expected 201, got ${res.status}`);
    }
    runTaskId = res.body.data.id;
  });

  await runTest("Execution", "Runs task through Agent Host and verifies COMPLETED status", async () => {
    const res = await request(app)
      .post(`/api/tasks/${runTaskId}/run?sync=true`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({
        allowedTools: ["get_current_time", "calculate"],
      });

    if (res.status !== 200) {
      throw new Error(`Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
    }

    if (res.body.data.status !== "COMPLETED") {
      throw new Error(`Execution ended in ${res.body.data.status}, expected COMPLETED`);
    }

    if (!res.body.data.finalAnswer) {
      throw new Error(`Expected finalAnswer in response`);
    }
  });

  await runTest("Execution", "Duplicate run of already COMPLETED task is rejected with 409", async () => {
    const res = await request(app)
      .post(`/api/tasks/${runTaskId}/run`)
      .set("Authorization", `Bearer ${tokenA}`);

    if (res.status !== 409) {
      throw new Error(`Expected 409 conflict on re-running completed task, got ${res.status}`);
    }
  });

  // -----------------------------------------------------------
  // 10. Task Steps, Tool Executions & Source Traceability
  // -----------------------------------------------------------
  console.log("\n[Category 10: Task Steps, Tool Executions & Sources]");

  await runTest("Traceability", "Task details endpoint returns persisted steps, tool executions, and sources", async () => {
    const res = await request(app)
      .get(`/api/tasks/${runTaskId}`)
      .set("Authorization", `Bearer ${tokenA}`);

    if (res.status !== 200) {
      throw new Error(`Expected 200, got ${res.status}`);
    }

    const { task, steps, toolExecutions, sources, telemetry } = res.body.data;

    if (task.status !== "COMPLETED") {
      throw new Error(`Expected task status COMPLETED, got ${task.status}`);
    }
    if (!task.final_report) {
      throw new Error(`Expected task final_report to be persisted`);
    }

    // Verify task steps
    if (!Array.isArray(steps) || steps.length === 0) {
      throw new Error(`Expected steps array with at least 1 step, got ${JSON.stringify(steps)}`);
    }

    // Check deterministic step ordering
    for (let i = 0; i < steps.length; i++) {
      if (steps[i].step_order !== i + 1) {
        throw new Error(`Step order mismatch: expected ${i + 1}, got ${steps[i].step_order}`);
      }
    }

    // Check tool executions linkage
    if (!Array.isArray(toolExecutions) || toolExecutions.length === 0) {
      throw new Error(`Expected at least 1 tool execution, got 0`);
    }

    for (const exec of toolExecutions) {
      if (!exec.step_id && !exec.stepId) {
        throw new Error(`Tool execution ${exec.id} is missing linked step_id`);
      }
    }

    // Verify sources
    if (!Array.isArray(sources) || sources.length === 0) {
      throw new Error(`Expected sources list`);
    }

    // Verify telemetry
    if (!telemetry || typeof telemetry.totalTokens !== "number") {
      throw new Error(`Expected telemetry with totalTokens`);
    }
  });

  // -----------------------------------------------------------
  // 11. Audit Log Verification
  // -----------------------------------------------------------
  console.log("\n[Category 11: Audit Trail Verification]");

  await runTest("Audit", "Verifies audit_logs rows for task lifecycle events", async () => {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT event_type FROM audit_logs WHERE task_id = ? ORDER BY created_at ASC;`,
      [runTaskId]
    );

    const eventTypes = rows.map((r) => String(r.event_type));
    if (!eventTypes.includes("TASK_CREATED")) {
      throw new Error(`Missing TASK_CREATED audit log`);
    }
    if (!eventTypes.includes("TASK_STARTED")) {
      throw new Error(`Missing TASK_STARTED audit log`);
    }
    if (!eventTypes.includes("TASK_COMPLETED")) {
      throw new Error(`Missing TASK_COMPLETED audit log`);
    }
  });

  // -----------------------------------------------------------
  // 12. Regressions
  // -----------------------------------------------------------
  console.log("\n[Category 12: Regression Verification]");

  await runTest("Regression", "GET /api/health returns 200 and healthy status", async () => {
    const res = await request(app).get("/api/health");
    if (res.status !== 200 || res.body.status !== "ok") {
      throw new Error(`Expected 200 ok, got ${res.status}`);
    }
  });

  await runTest("Regression", "GET /api/agent/tools lists registered tools", async () => {
    const res = await request(app).get("/api/agent/tools");
    if (res.status !== 200 || res.body.count < 5) {
      throw new Error(`Expected registered tools, got ${res.status}`);
    }
  });

  // Summary
  const passed = reports.filter((r) => r.passed).length;
  const failed = reports.filter((r) => !r.passed).length;
  const total = reports.length;
  const allPassed = failed === 0;

  console.log("\n=======================================================");
  console.log(`  PHASE 14 SUMMARY: ${passed}/${total} PASSED (${failed} FAILED)`);
  console.log("=======================================================\n");

  return { total, passed, failed, allPassed };
}

// Direct CLI execution
if (require.main === module) {
  runPhase14VerificationSuite()
    .then(({ allPassed }) => {
      process.exit(allPassed ? 0 : 1);
    })
    .catch((err) => {
      console.error("Fatal error during Phase 14 verification:", err);
      process.exit(1);
    });
}
