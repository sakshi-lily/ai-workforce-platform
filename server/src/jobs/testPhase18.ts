/**
 * AI Workforce Platform — Phase 18: Background Workers & Durable Asynchronous Execution
 *
 * Comprehensive Automated Verification Suite:
 * 1. Queue Enqueue & Priority Dispatch
 * 2. Distributed Execution Locking & Anti-Collision
 * 3. Worker Authorization & Anti-IDOR Security
 * 4. Bounded Retry with Exponential Backoff & Jitter
 * 5. Retry Exhaustion & Safe Terminal Failure
 * 6. Co-operative Task Cancellation Checkpoints
 * 7. Phase 17 Human Approval & Background Resume
 * 8. Browser Independence & Asynchronous Execution (HTTP 202)
 * 9. Worker Health & Queue Telemetry
 * 10. Primary End-to-End Multi-Step Verification Scenario
 */

import request from "supertest";
import { app } from "../app";
import { pool } from "../db/pool";
import { RowDataPacket } from "mysql2/promise";
import { initRedis } from "../cache/redis";
import { jobQueue } from "./queue";
import { lockManager } from "./lockManager";
import { BackgroundWorker } from "./worker";
import { taskService } from "../tasks/taskService";
import { approvalService } from "../approvals/approvalService";
import { authService } from "../auth/authService";
import { AuthenticatedUser } from "../auth/types";
import { gmailService } from "../integrations/gmail/gmailService";

let testsRun = 0;
let testsPassed = 0;
let testsFailed = 0;

async function runTest(
  category: string,
  name: string,
  fn: () => Promise<void>
): Promise<void> {
  testsRun++;
  const start = Date.now();
  try {
    await fn();
    const duration = Date.now() - start;
    console.log(`  [PASS] ${name} (${duration}ms)`);
    testsPassed++;
  } catch (error: any) {
    const duration = Date.now() - start;
    console.error(`  [FAIL] ${name} (${duration}ms): ${error.message}`);
    testsFailed++;
  }
}

export async function runSuite() {
  console.log("\n=======================================================");
  console.log("  PHASE 18 BACKGROUND WORKERS & ASYNC EXECUTION TEST SUITE");
  console.log("=======================================================\n");

  // Initialize test dependencies and clear test queue keys
  const redis = await initRedis();
  if (redis) {
    await redis.del("queue:jobs:pending", "queue:jobs:delayed", "queue:jobs:active");
  }

  // Seed two distinct test tenants
  const tenantA: AuthenticatedUser = {
    id: "usr_worker_test_a",
    email: "worker.a@tenant-a.com",
    fullName: "Worker User A",
    organizationName: "Tenant A Organization",
    organizationId: "org-worker-tenant-a",
    role: "ADMIN",
  };

  const tenantB: AuthenticatedUser = {
    id: "usr_worker_test_b",
    email: "worker.b@tenant-b.com",
    fullName: "Worker User B",
    organizationName: "Tenant B Organization",
    organizationId: "org-worker-tenant-b",
    role: "USER",
  };

  await pool.query(
    `INSERT INTO users (id, email, password_hash, full_name, role, organization_id, created_at, updated_at)
     VALUES (?, ?, 'dummy_hash', ?, ?, ?, NOW(), NOW())
     ON DUPLICATE KEY UPDATE organization_id = VALUES(organization_id);`,
    [tenantA.id, tenantA.email, tenantA.fullName, tenantA.role, tenantA.organizationId]
  );

  await pool.query(
    `INSERT INTO users (id, email, password_hash, full_name, role, organization_id, created_at, updated_at)
     VALUES (?, ?, 'dummy_hash', ?, ?, ?, NOW(), NOW())
     ON DUPLICATE KEY UPDATE organization_id = VALUES(organization_id);`,
    [tenantB.id, tenantB.email, tenantB.fullName, tenantB.role, tenantB.organizationId]
  );

  const tokenA = authService.generateToken(tenantA);
  const tokenB = authService.generateToken(tenantB);

  // Connect mock Gmail for Tenant A
  await gmailService.connectMockAccount(tenantA.id, tenantA.organizationId, tenantA.email);

  // Create dedicated test worker
  const testWorker = new BackgroundWorker({ concurrency: 1, workerId: "test_worker_1" });

  try {
    // =========================================================================
    // CATEGORY 1: Queue Enqueue & Priority Dispatch
    // =========================================================================
    console.log("--- 1. Queue Enqueue & Priority Dispatch ---");

    const taskP1 = await taskService.createTask(
      { title: "Low Priority Task", goal: "Low priority work", priority: "LOW" },
      tenantA
    );
    const taskP2 = await taskService.createTask(
      { title: "Urgent Priority Task", goal: "Urgent priority work", priority: "URGENT" },
      tenantA
    );

    await runTest("Priority Queue", "Enqueues jobs and verifies priority dispatch order (URGENT before LOW)", async () => {
      // Enqueue LOW first, then URGENT
      const lowJob = await jobQueue.enqueue({
        taskId: taskP1.id,
        organizationId: tenantA.organizationId,
        priority: "LOW",
      });

      const urgentJob = await jobQueue.enqueue({
        taskId: taskP2.id,
        organizationId: tenantA.organizationId,
        priority: "URGENT",
      });

      if (!lowJob.id || !urgentJob.id) throw new Error("Failed to enqueue jobs");

      // Dequeue should return URGENT first despite LOW being queued earlier
      const dequeued1 = await jobQueue.dequeue("test_dispatcher");
      if (!dequeued1 || dequeued1.task_id !== taskP2.id) {
        throw new Error(`Expected URGENT task '${taskP2.id}' to be dequeued first, got '${dequeued1?.task_id}'`);
      }

      const dequeued2 = await jobQueue.dequeue("test_dispatcher");
      if (!dequeued2 || dequeued2.task_id !== taskP1.id) {
        throw new Error(`Expected LOW task '${taskP1.id}' to be dequeued second, got '${dequeued2?.task_id}'`);
      }

      // Cleanup
      await jobQueue.complete(dequeued1.id);
      await jobQueue.complete(dequeued2.id);
    });

    await runTest("Payload Security", "Queue messages maintain minimal payload (zero token, password or secret leakage)", async () => {
      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT payload FROM jobs WHERE task_id = ? LIMIT 1;`,
        [taskP1.id]
      );
      if (rows.length === 0) throw new Error("Job not found in MySQL");

      const storedPayload = typeof rows[0].payload === "string" ? JSON.parse(rows[0].payload) : rows[0].payload;
      const str = JSON.stringify(storedPayload);
      if (str.includes("token") || str.includes("secret") || str.includes("password")) {
        throw new Error("Job payload improperly leaked sensitive credentials!");
      }
      if (!storedPayload.taskId) {
        throw new Error("Missing taskId in minimal payload");
      }
    });

    // =========================================================================
    // CATEGORY 2: Distributed Execution Locking & Anti-Collision
    // =========================================================================
    console.log("\n--- 2. Distributed Execution Locking & Anti-Collision ---");

    const lockTaskId = "task_test_locking_001";

    await runTest("Distributed Lock", "Prevents concurrent execution: Worker A acquires lock, Worker B is rejected", async () => {
      const acquiredA = await lockManager.acquireLock(lockTaskId, "worker_A", 60);
      if (!acquiredA) throw new Error("Worker A failed to acquire initial lock");

      const acquiredB = await lockManager.acquireLock(lockTaskId, "worker_B", 60);
      if (acquiredB) throw new Error("Worker B improperly acquired lock on already locked task!");

      const holder = await lockManager.getLockHolder(lockTaskId);
      if (holder !== "worker_A") throw new Error(`Expected lock holder 'worker_A', got '${holder}'`);
    });

    await runTest("Distributed Lock", "Worker B cannot release Worker A's lock; Worker A releases successfully", async () => {
      // Worker B attempts to release Worker A's lock -> should fail/be blocked
      const releasedByB = await lockManager.releaseLock(lockTaskId, "worker_B");
      if (releasedByB) throw new Error("Worker B improperly released Worker A's lock!");

      // Worker A releases lock -> succeeds
      const releasedByA = await lockManager.releaseLock(lockTaskId, "worker_A");
      if (!releasedByA) throw new Error("Worker A failed to release its own lock");

      // Now Worker B can acquire
      const acquiredBAfter = await lockManager.acquireLock(lockTaskId, "worker_B", 60);
      if (!acquiredBAfter) throw new Error("Worker B could not acquire freed lock");

      await lockManager.releaseLock(lockTaskId, "worker_B");
    });

    // =========================================================================
    // CATEGORY 3: Worker Authorization & Anti-IDOR Security
    // =========================================================================
    console.log("\n--- 3. Worker Authorization & Anti-IDOR Security ---");

    await testWorker.start();

    await runTest("Anti-IDOR", "Worker rejects job when task organization does not match queue organization", async () => {
      // Create a spoofed job record where task belongs to Tenant A but job claims Tenant B
      const fakeJob = await jobQueue.enqueue({
        taskId: taskP1.id, // belongs to Tenant A
        organizationId: tenantB.organizationId, // spoofed Tenant B
      });

      // Worker executes fakeJob -> must fail due to tenant mismatch
      await testWorker.processJob(fakeJob);

      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT status, last_error FROM jobs WHERE id = ?;`,
        [fakeJob.id]
      );

      if (rows[0].status !== "EXHAUSTED" && rows[0].status !== "FAILED") {
        throw new Error(`Expected spoofed job to fail, got '${rows[0].status}'`);
      }
      const err = typeof rows[0].last_error === "string" ? JSON.parse(rows[0].last_error) : rows[0].last_error;
      if (!err.message.includes("Tenant ID mismatch")) {
        throw new Error(`Expected Tenant ID mismatch error, got: ${err.message}`);
      }
    });

    // =========================================================================
    // CATEGORY 4: Bounded Retry with Exponential Backoff & Jitter
    // =========================================================================
    console.log("\n--- 4. Bounded Retry with Exponential Backoff & Jitter ---");

    await runTest("Retry & Backoff", "Retries failed job with exponential backoff and increments attempt counter", async () => {
      const retryTask = await taskService.createTask(
        { title: "Retryable Task", goal: "Calculate with transient error" },
        tenantA
      );

      const retryJob = await jobQueue.enqueue({
        taskId: retryTask.id,
        organizationId: tenantA.organizationId,
      });

      // Simulate active processing of attempt 1
      await pool.query(
        `UPDATE jobs SET status = 'ACTIVE', attempts = 1, worker_id = 'test_retry_worker' WHERE id = ?;`,
        [retryJob.id]
      );

      // Fail attempt 1
      const failResult = await jobQueue.fail(retryJob.id, new Error("Transient network socket timeout"), true);

      if (!failResult.retried || failResult.nextAttempt !== 2) {
        throw new Error(`Expected retried=true with nextAttempt=2, got ${JSON.stringify(failResult)}`);
      }

      const [jobRows] = await pool.query<RowDataPacket[]>(
        `SELECT status, attempts, last_error FROM jobs WHERE id = ?;`,
        [retryJob.id]
      );

      if (jobRows[0].status !== "RETRYING") {
        throw new Error(`Expected status 'RETRYING', got '${jobRows[0].status}'`);
      }
      if (jobRows[0].attempts !== 1) {
        throw new Error(`Expected attempts=1, got ${jobRows[0].attempts}`);
      }
    });

    // =========================================================================
    // CATEGORY 5: Retry Exhaustion & Safe Terminal Failure
    // =========================================================================
    console.log("\n--- 5. Retry Exhaustion & Safe Terminal Failure ---");

    await runTest("Exhaustion", "Exhausts retries after max_attempts and marks task as FAILED without infinite loop", async () => {
      const exhaustTask = await taskService.createTask(
        { title: "Exhaustion Task", goal: "Task destined to exhaust retries" },
        tenantA
      );

      const job = await jobQueue.enqueue({
        taskId: exhaustTask.id,
        organizationId: tenantA.organizationId,
        maxAttempts: 2,
      });

      // Simulate 2 failed attempts
      await pool.query(`UPDATE jobs SET attempts = 2 WHERE id = ?;`, [job.id]);

      const failResult = await jobQueue.fail(job.id, new Error("Permanent fatal service failure"), true);
      if (failResult.retried) {
        throw new Error("Job should not have been retried after reaching max_attempts!");
      }

      const [jobRows] = await pool.query<RowDataPacket[]>(
        `SELECT status FROM jobs WHERE id = ?;`,
        [job.id]
      );
      if (jobRows[0].status !== "EXHAUSTED") {
        throw new Error(`Expected job status 'EXHAUSTED', got '${jobRows[0].status}'`);
      }

      const [taskRows] = await pool.query<RowDataPacket[]>(
        `SELECT status, error_message FROM tasks WHERE id = ?;`,
        [exhaustTask.id]
      );
      if (taskRows[0].status !== "FAILED") {
        throw new Error(`Expected task status 'FAILED', got '${taskRows[0].status}'`);
      }
    });

    // =========================================================================
    // CATEGORY 6: Co-operative Task Cancellation Checkpoints
    // =========================================================================
    console.log("\n--- 6. Co-operative Task Cancellation Checkpoints ---");

    await runTest("Cancellation", "Cancelling a queued task cancels jobs in queue and prevents execution", async () => {
      const cancelTask = await taskService.createTask(
        { title: "Task to cancel", goal: "Do not execute me" },
        tenantA
      );

      // Enqueue via taskService
      const enqueueRes = await taskService.enqueueTask(cancelTask.id, tenantA.organizationId, tenantA);
      if (enqueueRes.status !== "QUEUED") throw new Error("Expected task status QUEUED");

      // Cancel task
      await taskService.cancelTask(cancelTask.id, tenantA.organizationId, tenantA);

      // Verify job is marked CANCELLED
      const [jobRows] = await pool.query<RowDataPacket[]>(
        `SELECT status FROM jobs WHERE id = ?;`,
        [enqueueRes.jobId]
      );
      if (jobRows[0].status !== "CANCELLED") {
        throw new Error(`Expected job status 'CANCELLED', got '${jobRows[0].status}'`);
      }
    });

    // =========================================================================
    // CATEGORY 7: Browser Independence & Asynchronous Execution (HTTP 202)
    // =========================================================================
    console.log("\n--- 7. Browser Independence & Asynchronous Execution (HTTP 202) ---");

    let asyncTaskId: string = "";

    await runTest("HTTP 202 Accepted", "POST /api/tasks/:id/run returns 202 Accepted immediately without blocking HTTP", async () => {
      const task = await taskService.createTask(
        {
          title: "Async Calculation Task",
          goal: "What time is it in America/New_York and what is 25 * 4?",
        },
        tenantA
      );
      asyncTaskId = task.id;

      const res = await request(app)
        .post(`/api/tasks/${task.id}/run`)
        .set("Authorization", `Bearer ${tokenA}`)
        .send({
          allowedTools: ["get_current_time", "calculate"],
        });

      if (res.status !== 202) {
        throw new Error(`Expected HTTP 202 Accepted, got ${res.status}: ${JSON.stringify(res.body)}`);
      }

      if (res.body.data.status !== "QUEUED" || !res.body.data.jobId) {
        throw new Error(`Invalid 202 response payload: ${JSON.stringify(res.body)}`);
      }
    });

    await runTest("Background Execution", "Background worker picks up queued job and completes task independently of HTTP", async () => {
      // Poll task until COMPLETED (with 6s ceiling)
      const maxWaitMs = 6000;
      const start = Date.now();
      let completed = false;

      while (Date.now() - start < maxWaitMs) {
        const [rows] = await pool.query<RowDataPacket[]>(
          `SELECT status, final_report FROM tasks WHERE id = ?;`,
          [asyncTaskId]
        );
        if (rows[0]?.status === "COMPLETED") {
          completed = true;
          break;
        }
        await new Promise((r) => setTimeout(r, 400));
      }

      if (!completed) {
        const [rows] = await pool.query<RowDataPacket[]>(
          `SELECT status FROM tasks WHERE id = ?;`,
          [asyncTaskId]
        );
        throw new Error(`Task did not complete within timeout. Current status: '${rows[0]?.status}'`);
      }
    });

    // =========================================================================
    // CATEGORY 8: Phase 17 Human Approval & Background Resume
    // =========================================================================
    console.log("\n--- 8. Phase 17 Human Approval & Background Resume ---");

    await runTest("Approval + Resume", "Worker halts at WAITING_FOR_APPROVAL, human approves, and worker resumes task to COMPLETED", async () => {
      const emailTask = await taskService.createTask(
        {
          title: "Apex Cloud Outbound Outreach",
          goal: "Send a professional follow-up email to Sarah at Apex Cloud based on our recent conversation.",
        },
        tenantA
      );

      // 1. Enqueue task for background worker
      await taskService.enqueueTask(emailTask.id, tenantA.organizationId, tenantA, {
        allowedTools: ["gmail_send"],
      });

      // 2. Wait for worker to reach WAITING_FOR_APPROVAL boundary
      let waiting = false;
      const start = Date.now();
      while (Date.now() - start < 5000) {
        const [rows] = await pool.query<RowDataPacket[]>(
          `SELECT status FROM tasks WHERE id = ?;`,
          [emailTask.id]
        );
        if (rows[0]?.status === "WAITING_FOR_APPROVAL") {
          waiting = true;
          break;
        }
        await new Promise((r) => setTimeout(r, 300));
      }

      if (!waiting) {
        throw new Error("Task did not pause at WAITING_FOR_APPROVAL boundary!");
      }

      // 3. Find pending approval
      const [apprRows] = await pool.query<RowDataPacket[]>(
        `SELECT id FROM approvals WHERE task_id = ? AND status = 'PENDING';`,
        [emailTask.id]
      );
      if (apprRows.length === 0) throw new Error("Missing pending approval in database");
      const approvalId = apprRows[0].id;

      // 4. Human reviews and approves proposed action
      const approveResult = await approvalService.approve(approvalId, tenantA, "Reviewed and authorized by human operator.");
      if (approveResult.approval.status !== "EXECUTED") {
        throw new Error(`Expected approval EXECUTED, got '${approveResult.approval.status}'`);
      }

      // 5. Verify task is COMPLETED and report indicates success
      const [finalTaskRows] = await pool.query<RowDataPacket[]>(
        `SELECT status, final_report FROM tasks WHERE id = ?;`,
        [emailTask.id]
      );
      if (finalTaskRows[0]?.status !== "COMPLETED") {
        throw new Error(`Expected task COMPLETED after approval execution, got '${finalTaskRows[0]?.status}'`);
      }
      if (!finalTaskRows[0]?.final_report?.includes("executed successfully")) {
        throw new Error("Expected final report to confirm executed action");
      }
    });

    // =========================================================================
    // CATEGORY 9: Worker Health & Queue Telemetry
    // =========================================================================
    console.log("\n--- 9. Worker Health & Queue Telemetry ---");

    await runTest("Telemetry & Health", "GET /api/health/worker returns worker metrics, queue depth, and online status", async () => {
      const res = await request(app).get("/api/health/worker");
      if (res.status !== 200) {
        throw new Error(`Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
      }

      if (!res.body.worker || res.body.worker.onlineWorkers < 1) {
        throw new Error(`Expected at least 1 online worker, got: ${JSON.stringify(res.body)}`);
      }

      if (typeof res.body.worker.completedJobs !== "number") {
        throw new Error("Missing completedJobs telemetry count");
      }
    });

    // =========================================================================
    // CATEGORY 10: Primary Multi-Step Verification Scenario (Section 108)
    // =========================================================================
    console.log("\n--- 10. Primary End-to-End Verification Scenario ---");

    await runTest("Primary Scenario", "Full Workflow: Web Search -> MySQL Verify -> RAG -> Draft -> Halt for Approval -> Resume -> Complete", async () => {
      const fullTask = await taskService.createTask(
        {
          title: "Apex Cloud Enterprise Research & Follow-Up",
          goal: "Research Apex Cloud, verify the customer record, retrieve relevant internal knowledge, prepare a professional follow-up email, and send it after human approval.",
        },
        tenantA
      );

      // Start task asynchronously via HTTP 202
      const runRes = await request(app)
        .post(`/api/tasks/${fullTask.id}/run`)
        .set("Authorization", `Bearer ${tokenA}`)
        .send({
          allowedTools: [
            "web_search",
            "mysql_verify_customer",
            "rag_query",
            "gmail_create_draft",
            "gmail_send",
          ],
        });

      if (runRes.status !== 202) {
        throw new Error(`Expected 202, got ${runRes.status}`);
      }

      // Wait for execution to halt at approval boundary
      let reachedApproval = false;
      const start = Date.now();
      while (Date.now() - start < 8000) {
        const [rows] = await pool.query<RowDataPacket[]>(
          `SELECT status FROM tasks WHERE id = ?;`,
          [fullTask.id]
        );
        if (rows[0]?.status === "WAITING_FOR_APPROVAL") {
          reachedApproval = true;
          break;
        }
        await new Promise((r) => setTimeout(r, 400));
      }

      if (!reachedApproval) {
        throw new Error("Task did not pause at approval boundary in primary scenario!");
      }

      // Approve action
      const [apprs] = await pool.query<RowDataPacket[]>(
        `SELECT id FROM approvals WHERE task_id = ? AND status = 'PENDING';`,
        [fullTask.id]
      );
      if (apprs.length === 0) throw new Error("Missing approval record");

      await approvalService.approve(apprs[0].id, tenantA, "Approved for enterprise delivery.");

      // Verify task completion
      const [finalRows] = await pool.query<RowDataPacket[]>(
        `SELECT status FROM tasks WHERE id = ?;`,
        [fullTask.id]
      );
      if (finalRows[0].status !== "COMPLETED") {
        throw new Error(`Expected task COMPLETED, got '${finalRows[0].status}'`);
      }
    });

  } finally {
    // Graceful worker shutdown
    await testWorker.stop();
  }

  // Final Test Summary
  console.log("\n=======================================================");
  console.log("  PHASE 18 TEST RESULTS SUMMARY");
  console.log("=======================================================");
  console.log(`Total Tests: ${testsRun}`);
  console.log(`Passed:      ${testsPassed}`);
  console.log(`Failed:      ${testsFailed}`);
  console.log("=======================================================\n");

  if (testsFailed > 0) {
    process.exit(1);
  }
}

// Direct Execution
if (require.main === module) {
  runSuite()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Fatal test error:", err);
      process.exit(1);
    });
}
