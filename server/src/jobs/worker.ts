/**
 * AI Workforce Platform — Phase 18: Background Worker Engine
 *
 * Implements the autonomous worker process that consumes jobs from the Redis queue,
 * verifies authoritative task state, enforces distributed locking, runs the Agent Runtime,
 * respects human approval checkpoints, and manages bounded retries and graceful shutdown.
 */

import os from "os";
import crypto from "crypto";
import { RowDataPacket } from "mysql2/promise";
import { pool } from "../db/pool";
import { initRedis } from "../cache/redis";
import { AgentRuntime } from "../agent/agentRuntime";
import { lockManager } from "./lockManager";
import { jobQueue } from "./queue";
import { JobEntity, JOB_CONFIG } from "./jobTypes";

export class BackgroundWorker {
  public readonly workerId: string;
  private readonly concurrency: number;
  private isRunning: boolean = false;
  private activeJobsCount: number = 0;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private activePromises: Set<Promise<void>> = new Set();

  constructor(options?: { concurrency?: number; workerId?: string }) {
    this.concurrency =
      options?.concurrency ||
      Number(process.env.WORKER_CONCURRENCY) ||
      JOB_CONFIG.DEFAULT_CONCURRENCY;

    const randomSuffix = crypto.randomBytes(3).toString("hex");
    this.workerId =
      options?.workerId ||
      `wrk_${os.hostname().replace(/[^a-zA-Z0-9_-]/g, "")}_${process.pid}_${randomSuffix}`;
  }

  /**
   * Starts the background worker engine.
   */
  public async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    console.log(`[BackgroundWorker] Starting worker '${this.workerId}' (concurrency: ${this.concurrency})...`);

    // 1. Ensure Redis and DB connection
    await initRedis();

    // 2. Register worker in heartbeat table
    await this.registerWorker();

    // 3. Start periodic heartbeat loop
    this.heartbeatTimer = setInterval(async () => {
      try {
        await this.heartbeat();
      } catch (err) {
        console.warn("[BackgroundWorker Heartbeat Warning]", err);
      }
    }, JOB_CONFIG.HEARTBEAT_INTERVAL_MS);

    // 4. Setup graceful signal listeners
    this.setupSignalHandlers();

    // 5. Spawn concurrent processing loops
    for (let i = 0; i < this.concurrency; i++) {
      this.spawnWorkerLoop(i + 1);
    }

    console.log(`[BackgroundWorker] Worker '${this.workerId}' is ONLINE and ready for jobs.`);
  }

  /**
   * Graceful worker shutdown.
   */
  public async stop(): Promise<void> {
    if (!this.isRunning) return;
    console.log(`[BackgroundWorker] Stopping worker '${this.workerId}' gracefully...`);
    this.isRunning = false;

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    // Update status to STOPPING in registry
    await pool.query(
      `UPDATE worker_heartbeats SET status = 'OFFLINE', last_heartbeat = NOW() WHERE worker_id = ?;`,
      [this.workerId]
    );

    // Await currently processing tasks with a 10s ceiling
    if (this.activePromises.size > 0) {
      console.log(`[BackgroundWorker] Waiting for ${this.activePromises.size} active job(s) to finish...`);
      await Promise.race([
        Promise.all(Array.from(this.activePromises)),
        new Promise((resolve) => setTimeout(resolve, 10000)),
      ]);
    }

    console.log(`[BackgroundWorker] Worker '${this.workerId}' stopped successfully.`);
  }

  /**
   * Continuous loop for each concurrency slot.
   */
  private async spawnWorkerLoop(slotIndex: number): Promise<void> {
    while (this.isRunning) {
      try {
        const job = await jobQueue.dequeue(this.workerId);
        if (job) {
          this.activeJobsCount++;
          const promise = this.processJob(job).finally(() => {
            this.activeJobsCount = Math.max(0, this.activeJobsCount - 1);
            this.activePromises.delete(promise);
          });
          this.activePromises.add(promise);
          await promise;
        } else {
          // No job in queue; sleep briefly to avoid busy loop
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      } catch (err) {
        console.warn(`[BackgroundWorker Slot ${slotIndex} Error]`, err);
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  }

  /**
   * Executes a single dequeued job with distributed locking and Agent Runtime.
   */
  public async processJob(job: JobEntity): Promise<void> {
    const taskId = job.task_id;
    console.log(`[BackgroundWorker] Processing job '${job.id}' for task '${taskId}' (type: ${job.type}, attempt: ${job.attempts})...`);

    // 1. Authoritative Task Lookup from MySQL (Anti-Tampering)
    const [taskRows] = await pool.query<RowDataPacket[]>(
      `SELECT * FROM tasks WHERE id = ? LIMIT 1;`,
      [taskId]
    );

    if (taskRows.length === 0) {
      console.warn(`[BackgroundWorker] Task '${taskId}' not found. Marking job failed.`);
      await jobQueue.fail(job.id, new Error(`Task '${taskId}' not found`), false);
      return;
    }

    const task = taskRows[0];

    // Verify Organization Ownership (Anti-IDOR)
    if (task.organization_id !== job.organization_id) {
      console.warn(`[BackgroundWorker] Tenant ID mismatch for task '${taskId}'. Rejecting execution.`);
      await jobQueue.fail(
        job.id,
        new Error(`Tenant ID mismatch for task '${taskId}'`),
        false
      );
      return;
    }

    // Check if task is already in a terminal state
    if (["COMPLETED", "FAILED", "CANCELLED"].includes(task.status)) {
      console.log(`[BackgroundWorker] Task '${taskId}' is already in terminal state '${task.status}'. Completing job.`);
      await jobQueue.complete(job.id);
      return;
    }

    // 2. Acquire Distributed Execution Lock (Section 23–25)
    const lockAcquired = await lockManager.acquireLock(taskId, this.workerId);
    if (!lockAcquired) {
      console.warn(`[BackgroundWorker] Task '${taskId}' is already locked by another worker. Skipping concurrent execution.`);
      // Delay this job so another worker doesn't collide
      return;
    }

    // Construct trusted execution context from authoritative DB record
    const trustedContext = {
      userId: String(task.user_id),
      organizationId: String(task.organization_id),
      taskId: String(task.id),
    };

    const attemptId = `att_${crypto.randomUUID().replace(/-/g, "")}`;
    const attemptNumber = job.attempts + 1;

    try {
      // 3. Update task status to RUNNING if it was QUEUED or REQUESTED
      await pool.query(
        `UPDATE tasks SET status = 'RUNNING', started_at = IFNULL(started_at, NOW()), updated_at = NOW() WHERE id = ?;`,
        [taskId]
      );

      // Record running attempt in job_attempts
      await pool.query(
        `INSERT INTO job_attempts (
          id, job_id, task_id, organization_id, attempt_number, worker_id,
          status, started_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'RUNNING', NOW());`,
        [
          attemptId,
          job.id,
          taskId,
          task.organization_id,
          attemptNumber,
          this.workerId,
        ]
      );

      // 4. Invoke Agent Runtime
      const runResult = await AgentRuntime.run(
        taskId,
        trustedContext,
        job.payload.options
      );

      console.log(`[BackgroundWorker] Agent Runtime finished task '${taskId}' with status: '${runResult.status}'`);

      // 5. Handle Outcome
      if (runResult.status === "WAITING_FOR_APPROVAL") {
        // Paused at approval boundary (Section 36 & 88)
        console.log(`[BackgroundWorker] Task '${taskId}' paused at WAITING_FOR_APPROVAL. Releasing lock and completing execution iteration.`);
        await pool.query(
          `UPDATE job_attempts SET status = 'COMPLETED', ended_at = NOW() WHERE id = ?;`,
          [attemptId]
        );
        await jobQueue.complete(job.id);
      } else if (runResult.status === "CANCELLED") {
        console.log(`[BackgroundWorker] Task '${taskId}' was cancelled. Marking job complete.`);
        await pool.query(
          `UPDATE job_attempts SET status = 'COMPLETED', ended_at = NOW() WHERE id = ?;`,
          [attemptId]
        );
        await jobQueue.complete(job.id);
      } else {
        // Task completed successfully
        await pool.query(
          `UPDATE job_attempts SET status = 'COMPLETED', ended_at = NOW() WHERE id = ?;`,
          [attemptId]
        );
        await jobQueue.complete(job.id);
      }
    } catch (err: any) {
      console.error(`[BackgroundWorker] Error processing job '${job.id}' for task '${taskId}':`, err);
      // Update attempt as FAILED
      await pool.query(
        `UPDATE job_attempts 
         SET status = 'FAILED', 
             error_code = ?, 
             error_details = ?, 
             ended_at = NOW() 
         WHERE id = ?;`,
        [err?.code || "WORKER_EXECUTION_ERROR", JSON.stringify({ message: err?.message }), attemptId]
      );
      // Fail with retry capability
      await jobQueue.fail(job.id, err, true);
    } finally {
      // 6. Release Distributed Lock
      await lockManager.releaseLock(taskId, this.workerId);
    }
  }

  /**
   * Registers worker in MySQL worker_heartbeats table.
   */
  private async registerWorker(): Promise<void> {
    await pool.query(
      `INSERT INTO worker_heartbeats (
        worker_id, hostname, pid, status, concurrency, active_jobs, last_heartbeat, started_at
      ) VALUES (?, ?, ?, 'ONLINE', ?, 0, NOW(), NOW())
      ON DUPLICATE KEY UPDATE status = 'ONLINE', last_heartbeat = NOW();`,
      [this.workerId, os.hostname(), process.pid, this.concurrency]
    );
  }

  /**
   * Updates worker heartbeat in MySQL.
   */
  private async heartbeat(): Promise<void> {
    const status = this.activeJobsCount > 0 ? "BUSY" : "ONLINE";
    await pool.query(
      `UPDATE worker_heartbeats 
       SET status = ?, active_jobs = ?, last_heartbeat = NOW() 
       WHERE worker_id = ?;`,
      [status, this.activeJobsCount, this.workerId]
    );
  }

  /**
   * Sets up process signal handlers for graceful shutdown.
   */
  private setupSignalHandlers(): void {
    const shutdown = async (signal: string) => {
      console.log(`[BackgroundWorker] Received ${signal}. Initiating graceful shutdown...`);
      await this.stop();
    };

    process.once("SIGINT", () => shutdown("SIGINT"));
    process.once("SIGTERM", () => shutdown("SIGTERM"));
  }
}

// Global Worker Singleton
export const backgroundWorker = new BackgroundWorker();
