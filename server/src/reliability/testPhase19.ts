/**
 * AI Workforce Platform — Phase 19: Reliability, Recovery & Resilient Execution Test Suite
 *
 * Verifies:
 * 1. Central Failure Taxonomy & Error Normalization
 * 2. Centralized Retry Policy, Exponential Backoff & Budget Hierarchy
 * 3. Provider Circuit Breaker Lifecycle (CLOSED -> OPEN -> HALF_OPEN -> CLOSED)
 * 4. Multi-Level Timeout Hierarchy & Deadline Propagation
 * 5. Durable Checkpointing & Partial-Progress Resumption
 * 6. Worker Crash & Stale Task Recovery
 * 7. Optimistic Concurrency & State Ownership Protection
 * 8. Ambiguous External Side-Effect Handling (Gmail timeout without blind duplicate send)
 * 9. Controlled Manual Retry & Historical Attempt Traceability
 * 10. Reliability Health Telemetry & Operations Dashboard
 * 11. Primary End-to-End Reliability Workflow
 */

import request from "supertest";
import { app } from "../app";
import { pool } from "../db/pool";
import { initRedis } from "../cache/redis";
import { authService } from "../auth/authService";
import { AuthenticatedUser } from "../auth/types";
import { taskService } from "../tasks/taskService";
import { jobQueue } from "../jobs/queue";
import { lockManager } from "../jobs/lockManager";
import {
  ErrorCategory,
  RetryClassification,
  normalizeError,
  AppError,
} from "./failureTaxonomy";
import { retryPolicy, DEFAULT_RETRY_BUDGET } from "./retryPolicy";
import { circuitBreaker, CircuitState } from "./circuitBreaker";
import {
  ExecutionDeadline,
  withTimeout,
  TIMEOUT_HIERARCHY,
} from "./timeoutManager";
import { checkpointManager } from "./checkpointManager";
import { staleTaskRecovery } from "./staleTaskRecovery";
import { idempotencyGuard, SideEffectOutcome } from "./idempotency";
import { recoveryService } from "./recoveryService";

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

async function runTest(
  category: string,
  testName: string,
  fn: () => Promise<void>
): Promise<void> {
  totalTests++;
  const startTime = Date.now();
  try {
    await fn();
    const duration = Date.now() - startTime;
    console.log(`  [PASS] ${testName} (${duration}ms)`);
    passedTests++;
  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.error(`  [FAIL] ${testName} (${duration}ms):`, error.message);
    failedTests++;
  }
}

async function runPhase19Tests() {
  console.log("\n=======================================================");
  console.log("  PHASE 19 RELIABILITY, RECOVERY & RESILIENCE TEST SUITE");
  console.log("=======================================================\n");

  const redis = await initRedis();
  if (redis) {
    await redis.del(["queue:jobs:pending", "queue:jobs:delayed", "queue:jobs:active"]);
  }

  // 1. Seed two distinct test tenants
  const tenantA: AuthenticatedUser = {
    id: "usr_rel_test_a",
    email: "reliability.a@tenant-a.com",
    fullName: "Reliability User A",
    organizationName: "Tenant A Org",
    organizationId: "org-rel-tenant-a",
    role: "ADMIN",
  };

  const tenantB: AuthenticatedUser = {
    id: "usr_rel_test_b",
    email: "reliability.b@tenant-b.com",
    fullName: "Reliability User B",
    organizationName: "Tenant B Org",
    organizationId: "org-rel-tenant-b",
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

  try {
    // =========================================================================
    // CATEGORY 1: Central Failure Taxonomy & Error Normalization
    // =========================================================================
    console.log("--- 1. Failure Taxonomy & Error Normalization ---");

    await runTest("Taxonomy", "Normalizes raw provider timeouts and rate limits into typed AppErrors", async () => {
      const rawTimeout = new Error("connect ETIMEDOUT 10.0.0.1:443");
      const normalizedTimeout = normalizeError(rawTimeout);
      if (normalizedTimeout.category !== ErrorCategory.TIMEOUT) {
        throw new Error(`Expected TIMEOUT category, got ${normalizedTimeout.category}`);
      }
      if (normalizedTimeout.classification !== RetryClassification.RETRYABLE) {
        throw new Error(`Expected RETRYABLE classification, got ${normalizedTimeout.classification}`);
      }

      const raw429 = { statusCode: 429, message: "Rate limit reached" };
      const normalized429 = normalizeError(raw429);
      if (normalized429.category !== ErrorCategory.RATE_LIMITED) {
        throw new Error(`Expected RATE_LIMITED category, got ${normalized429.category}`);
      }
    });

    await runTest("Taxonomy", "Provides sanitized user-facing error message without internal infrastructure leaks", async () => {
      const internalDbErr = { code: "ER_LOCK_DEADLOCK", message: "Deadlock found when trying to get lock; try restarting transaction" };
      const normalized = normalizeError(internalDbErr);
      if (normalized.userFacingMessage.includes("Deadlock") || normalized.userFacingMessage.includes("ER_")) {
        throw new Error(`User-facing message leaked internal details: ${normalized.userFacingMessage}`);
      }
      if (normalized.classification !== RetryClassification.RETRYABLE) {
        throw new Error("Deadlock should be classified as RETRYABLE");
      }
    });

    // =========================================================================
    // CATEGORY 2: Retry Classification & Budget Hierarchy
    // =========================================================================
    console.log("\n--- 2. Retry Policy & Budget Hierarchy ---");

    await runTest("RetryPolicy", "Calculates bounded exponential backoff with random jitter", async () => {
      const delay1 = retryPolicy.getBackoffDelay(1, { baseBackoffMs: 1000, jitterMaxMs: 200 });
      const delay2 = retryPolicy.getBackoffDelay(2, { baseBackoffMs: 1000, jitterMaxMs: 200 });
      const delay3 = retryPolicy.getBackoffDelay(3, { baseBackoffMs: 1000, jitterMaxMs: 200 });

      // Delay 1: 1000 + [0..200]
      if (delay1 < 1000 || delay1 > 1200) {
        throw new Error(`Expected delay 1 between 1000-1200, got ${delay1}`);
      }
      // Delay 2: 2000 + [0..200]
      if (delay2 < 2000 || delay2 > 2200) {
        throw new Error(`Expected delay 2 between 2000-2200, got ${delay2}`);
      }
      // Delay 3: 4000 + [0..200]
      if (delay3 < 4000 || delay3 > 4200) {
        throw new Error(`Expected delay 3 between 4000-4200, got ${delay3}`);
      }
    });

    await runTest("RetryBudget", "Enforces task total retry budget ceiling to prevent retry explosion", async () => {
      const canRetryUnderBudget = retryPolicy.canRetry({
        currentAttempt: 1,
        maxAttempts: 3,
        totalRetriesSoFar: 2,
        maxTotalRetries: 5,
      });
      if (!canRetryUnderBudget) {
        throw new Error("Expected to allow retry within budget");
      }

      const blockedByTotalCeiling = retryPolicy.canRetry({
        currentAttempt: 1,
        maxAttempts: 3,
        totalRetriesSoFar: 5,
        maxTotalRetries: 5,
      });
      if (blockedByTotalCeiling) {
        throw new Error("Expected retry to be blocked when total budget exhausted");
      }
    });

    // =========================================================================
    // CATEGORY 3: Circuit Breaker Lifecycle
    // =========================================================================
    console.log("\n--- 3. Provider Circuit Breaker Lifecycle ---");

    await runTest("CircuitBreaker", "Trips from CLOSED to OPEN after consecutive failures and fast-fails", async () => {
      const provider = "mock_failing_provider";
      circuitBreaker.reset(provider);

      // Record 3 failures to exceed threshold of 3
      circuitBreaker.recordFailure(provider, new Error("Fail 1"));
      circuitBreaker.recordFailure(provider, new Error("Fail 2"));
      if (circuitBreaker.getState(provider) !== CircuitState.CLOSED) {
        throw new Error("Circuit should still be CLOSED after 2 failures");
      }

      circuitBreaker.recordFailure(provider, new Error("Fail 3"));
      if (circuitBreaker.getState(provider) !== CircuitState.OPEN) {
        throw new Error("Circuit should be OPEN after 3 failures");
      }

      // Execution attempt while OPEN should immediately fast-fail without calling provider fn
      let fnInvoked = false;
      try {
        await circuitBreaker.execute(provider, async () => {
          fnInvoked = true;
          return "ok";
        });
        throw new Error("Expected circuit breaker to throw OPEN error");
      } catch (err: any) {
        if (err.code !== "CIRCUIT_BREAKER_OPEN") {
          throw new Error(`Expected CIRCUIT_BREAKER_OPEN, got ${err.code}`);
        }
        if (fnInvoked) {
          throw new Error("Provider function must NOT be called when circuit is OPEN");
        }
      }
    });

    await runTest("CircuitBreaker", "Probes provider in HALF_OPEN and recovers to CLOSED upon success", async () => {
      const provider = "mock_recovering_provider";
      circuitBreaker.reset(provider);

      // Force to OPEN
      circuitBreaker.recordFailure(provider);
      circuitBreaker.recordFailure(provider);
      circuitBreaker.recordFailure(provider);

      // Artificially age the last failure time past cooldownMs
      circuitBreaker.setLastFailureTime(provider, Date.now() - 6000);

      // Checking state should now transition to HALF_OPEN
      const state = circuitBreaker.getState(provider);
      if (state !== CircuitState.HALF_OPEN) {
        throw new Error(`Expected HALF_OPEN state after cooldown, got ${state}`);
      }

      // Successful probe execution transitions circuit back to CLOSED
      const result = await circuitBreaker.execute(provider, async () => "probe_success");
      if (result !== "probe_success") throw new Error("Expected probe success");

      if (circuitBreaker.getState(provider) !== CircuitState.CLOSED) {
        throw new Error(`Expected circuit to recover to CLOSED, got ${circuitBreaker.getState(provider)}`);
      }
    });

    // =========================================================================
    // CATEGORY 4: Timeout Architecture & Deadline Propagation
    // =========================================================================
    console.log("\n--- 4. Timeout Architecture & Deadlines ---");

    await runTest("Timeouts", "withTimeout throws OPERATION_TIMED_OUT when execution exceeds budget", async () => {
      try {
        await withTimeout(
          new Promise((resolve) => setTimeout(resolve, 500)),
          50, // 50ms timeout for 500ms operation
          "slow_operation"
        );
        throw new Error("Expected withTimeout to throw");
      } catch (err: any) {
        if (err.code !== "OPERATION_TIMED_OUT" || err.category !== ErrorCategory.TIMEOUT) {
          throw new Error(`Expected OPERATION_TIMED_OUT TIMEOUT error, got ${err.code}`);
        }
      }
    });

    await runTest("Timeouts", "ExecutionDeadline prevents child operations from exceeding parent budget", async () => {
      const deadline = new ExecutionDeadline(100, "Parent Task");
      const childBudget = deadline.allocateChildBudget(200, "Child Step");
      if (childBudget > 100) {
        throw new Error(`Child budget (${childBudget}ms) cannot exceed remaining parent budget (100ms)`);
      }
    });

    // =========================================================================
    // CATEGORY 5: Checkpointing & Partial Progress Resumption
    // =========================================================================
    console.log("\n--- 5. Checkpointing & Partial Progress ---");

    await runTest("Checkpointing", "Reconstructs plan and resumes from earliest uncompleted step", async () => {
      const task = await taskService.createTask(
        { title: "Checkpoint Test Task", goal: "Complete multi-step flow" },
        tenantA
      );

      // Insert step 1 as COMPLETED and step 2 as PENDING
      const stepId1 = `step_chk_1_${Date.now()}`;
      const stepId2 = `step_chk_2_${Date.now()}`;
      await pool.query(
        `INSERT INTO task_steps (id, task_id, step_order, title, description, status, tool_name, output_data, created_at)
         VALUES 
          (?, ?, 1, 'Web Research', 'Research company', 'COMPLETED', 'web_search', '{"result":"Apex Cloud data"}', NOW()),
          (?, ?, 2, 'Customer Lookup', 'Lookup MySQL record', 'PENDING', 'mysql_verify_customer', NULL, NOW());`,
        [stepId1, task.id, stepId2, task.id]
      );

      const checkpoint = await checkpointManager.loadCheckpoint(task.id);
      if (!checkpoint || !checkpoint.hasExistingSteps) {
        throw new Error("Expected valid checkpoint with existing steps");
      }
      if (checkpoint.completedStepCount !== 1) {
        throw new Error(`Expected 1 completed step, got ${checkpoint.completedStepCount}`);
      }
      if (checkpoint.earliestUncompletedStepOrder !== 2) {
        throw new Error(`Expected earliest uncompleted order to be 2, got ${checkpoint.earliestUncompletedStepOrder}`);
      }
      if (!checkpoint.resumablePlan || checkpoint.resumablePlan.steps.length !== 2) {
        throw new Error("Expected resumable plan with 2 steps");
      }
    });

    // =========================================================================
    // CATEGORY 6: Worker Crash & Stale Task Recovery
    // =========================================================================
    console.log("\n--- 6. Worker Crash & Stale Task Recovery ---");

    await runTest("CrashRecovery", "Recovers abandoned RUNNING task whose lease expired", async () => {
      const task = await taskService.createTask(
        { title: "Abandoned Task", goal: "Task running on crashed worker" },
        tenantA
      );

      // Simulate crashed worker: Task in RUNNING with updated_at in the past
      await pool.query(
        `UPDATE tasks 
         SET status = 'RUNNING', 
             version = 1,
             total_retries = 0,
             updated_at = DATE_SUB(NOW(), INTERVAL 60 SECOND) 
         WHERE id = ?;`,
        [task.id]
      );

      // Run recovery sweep with 30s threshold
      const recoveryResult = await staleTaskRecovery.recoverStaleTasks(30);
      if (recoveryResult.recovered === 0) {
        throw new Error("Expected at least 1 task to be recovered");
      }

      // Task should now be in QUEUED status with incremented version and total_retries
      const [reloadedRows] = await pool.query<any[]>(
        `SELECT status, version, total_retries FROM tasks WHERE id = ?;`,
        [task.id]
      );
      const reloaded = reloadedRows[0];
      if (reloaded.status !== "QUEUED") {
        throw new Error(`Expected status QUEUED after recovery, got ${reloaded.status}`);
      }
      if (reloaded.version <= 1) {
        throw new Error(`Expected version > 1, got ${reloaded.version}`);
      }
      if (reloaded.total_retries !== 1) {
        throw new Error(`Expected total_retries = 1, got ${reloaded.total_retries}`);
      }
    });

    // =========================================================================
    // CATEGORY 7: Optimistic Concurrency & State Ownership
    // =========================================================================
    console.log("\n--- 7. Optimistic Concurrency Protection ---");

    await runTest("Concurrency", "Rejects atomic state update when version has changed concurrently", async () => {
      const task = await taskService.createTask(
        { title: "Concurrency Task", goal: "Test version conflicts" },
        tenantA
      );

      // Worker A reads version 1
      const versionA = 1;

      // Worker B updates version 1 -> 2
      const successB = await taskService.updateTaskStateAtomic(task.id, versionA, "RUNNING");
      if (!successB) throw new Error("Worker B update should succeed");

      // Worker A attempts update with stale version 1 -> should fail
      const successA = await taskService.updateTaskStateAtomic(task.id, versionA, "COMPLETED");
      if (successA) {
        throw new Error("Worker A stale update should have been REJECTED by version check");
      }
    });

    // =========================================================================
    // CATEGORY 8: Ambiguous External Side-Effect Safeguard (Gmail Send)
    // =========================================================================
    console.log("\n--- 8. External Side-Effect Safeguards (Gmail) ---");

    await runTest("SideEffects", "Classifies post-dispatch timeout as UNKNOWN_OUTCOME and prohibits blind auto-retry", async () => {
      let callCount = 0;
      const result = await idempotencyGuard.executeExternalSideEffect(
        "gmail_send",
        { to: ["client@example.com"], subject: "Follow up" },
        async () => {
          callCount++;
          // Simulate timeout occurring during HTTP dispatch
          throw new Error("connect ETIMEDOUT gmail.googleapis.com");
        }
      );

      if (result.outcome !== SideEffectOutcome.UNKNOWN_OUTCOME) {
        throw new Error(`Expected UNKNOWN_OUTCOME, got ${result.outcome}`);
      }
      if (!result.requiresReconciliation) {
        throw new Error("Expected requiresReconciliation = true");
      }

      // Retry policy must block blind retry of UNKNOWN external side effects
      const safeToRetry = retryPolicy.isRetryable(result.error, true);
      if (safeToRetry) {
        throw new Error("retryPolicy must NOT consider ambiguous external side effects retryable!");
      }
    });

    // =========================================================================
    // CATEGORY 9: Controlled Manual Retry & Historical Attempt Traceability
    // =========================================================================
    console.log("\n--- 9. Manual Retry & Attempt Traceability ---");

    let failedTaskId: string;

    await runTest("ManualRetry", "Operator can manually retry a FAILED task, generating audit trail", async () => {
      const task = await taskService.createTask(
        { title: "Failed Task for Manual Retry", goal: "Simulated failure" },
        tenantA
      );
      failedTaskId = task.id;

      // Transition to FAILED
      await pool.query(
        `UPDATE tasks SET status = 'FAILED', error_message = 'Simulated crash', updated_at = NOW() WHERE id = ?;`,
        [failedTaskId]
      );

      // Perform manual retry via HTTP endpoint
      const res = await request(app)
        .post(`/api/tasks/${failedTaskId}/retry`)
        .set("Authorization", `Bearer ${tokenA}`);

      if (res.status !== 202) {
        throw new Error(`Expected 202, got ${res.status}: ${JSON.stringify(res.body)}`);
      }

      if (res.body.data.status !== "QUEUED") {
        throw new Error(`Expected status QUEUED, got ${res.body.data.status}`);
      }

      // Verify audit logs row
      const [auditRows] = await pool.query<any[]>(
        `SELECT event_type FROM audit_logs WHERE task_id = ? AND event_type = 'MANUAL_RETRY';`,
        [failedTaskId]
      );
      if (auditRows.length === 0) {
        throw new Error("Expected MANUAL_RETRY audit log entry");
      }
    });

    await runTest("Anti-IDOR", "Tenant B cannot manually retry Tenant A's failed task (returns 404)", async () => {
      const res = await request(app)
        .post(`/api/tasks/${failedTaskId}/retry`)
        .set("Authorization", `Bearer ${tokenB}`);

      if (res.status !== 404) {
        throw new Error(`Expected 404 Not Found for cross-tenant retry, got ${res.status}`);
      }
    });

    await runTest("AttemptAudit", "Retrieves complete historical attempt trace for task", async () => {
      const res = await request(app)
        .get(`/api/tasks/${failedTaskId}/attempts`)
        .set("Authorization", `Bearer ${tokenA}`);

      if (res.status !== 200) {
        throw new Error(`Expected 200, got ${res.status}`);
      }
      if (!Array.isArray(res.body.data) || res.body.data.length === 0) {
        throw new Error("Expected attempts list with at least 1 record");
      }
    });

    // =========================================================================
    // CATEGORY 10: Reliability Health Telemetry
    // =========================================================================
    console.log("\n--- 10. Reliability Health Telemetry ---");

    await runTest("Telemetry", "GET /api/health/reliability reports success rates, circuit states, and queue telemetry", async () => {
      const res = await request(app).get("/api/health/reliability");

      if (res.status !== 200) {
        throw new Error(`Expected 200, got ${res.status}`);
      }

      const { reliability, circuitBreakers, queue, providers } = res.body;
      if (typeof reliability?.successRatePercent !== "number") {
        throw new Error("Missing reliability.successRatePercent");
      }
      if (!providers || typeof providers.openai !== "string") {
        throw new Error("Missing provider status summary");
      }
      if (typeof queue?.pending !== "number") {
        throw new Error("Missing queue metrics");
      }
    });

    // =========================================================================
    // CATEGORY 11: Primary End-to-End Reliability Workflow
    // =========================================================================
    console.log("\n--- 11. Primary End-to-End Reliability Workflow ---");

    await runTest("E2E Reliability", "Transient provider failure -> Circuit breaker & Retry -> Eventual completion", async () => {
      let attempts = 0;
      const transientProvider = "e2e_flaky_service";
      circuitBreaker.reset(transientProvider);

      const resilientAction = async () => {
        return await circuitBreaker.execute(transientProvider, async () => {
          attempts++;
          if (attempts === 1) {
            // First attempt fails transiently
            throw new Error("ETIMEDOUT connection to external endpoint");
          }
          return { success: true, processedAt: new Date().toISOString() };
        });
      };

      // Attempt 1: Fails
      let firstAttemptFailed = false;
      try {
        await resilientAction();
      } catch (err: any) {
        firstAttemptFailed = true;
        const normalized = normalizeError(err);
        if (normalized.classification !== RetryClassification.RETRYABLE) {
          throw new Error("Expected transient error to be RETRYABLE");
        }
      }

      if (!firstAttemptFailed) throw new Error("Expected attempt 1 to fail");

      // Attempt 2: Retries and succeeds
      const recoveryOutcome = await resilientAction();
      if (!recoveryOutcome.success) {
        throw new Error("Expected retry attempt to succeed");
      }
      if (attempts !== 2) {
        throw new Error(`Expected exactly 2 attempts, got ${attempts}`);
      }
    });

  } finally {
    console.log("\n=======================================================");
    console.log("  PHASE 19 TEST RESULTS SUMMARY");
    console.log("=======================================================");
    console.log(`Total Tests: ${totalTests}`);
    console.log(`Passed:      ${passedTests}`);
    console.log(`Failed:      ${failedTests}`);
    console.log("=======================================================\n");

    if (failedTests > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  }
}

runPhase19Tests().catch((err) => {
  console.error("FATAL ERROR running Phase 19 tests:", err);
  process.exit(1);
});
