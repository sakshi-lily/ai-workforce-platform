/**
 * AI Workforce Platform — Phase 18: Redis-Backed Job Queue
 *
 * Provides queue dispatch, priority scheduling, delayed retries, and persistence
 * synchronization between Redis and the durable MySQL `jobs` operational table.
 */

import crypto from "crypto";
import { RowDataPacket } from "mysql2/promise";
import { pool } from "../db/pool";
import { initRedis } from "../cache/redis";
import {
  JobEntity,
  JobPriority,
  JobStatus,
  JobType,
  CreateJobInput,
  JOB_CONFIG,
  QueueMetrics,
} from "./jobTypes";

export class JobQueue {
  private static instance: JobQueue;

  public static getInstance(): JobQueue {
    if (!JobQueue.instance) {
      JobQueue.instance = new JobQueue();
    }
    return JobQueue.instance;
  }

  // Redis Key Namespaces
  private readonly KEY_PENDING = "queue:jobs:pending";
  private readonly KEY_DELAYED = "queue:jobs:delayed";
  private readonly KEY_ACTIVE = "queue:jobs:active";

  /**
   * Maps job priority to numeric score for deterministic ZSET ordering.
   * Lower score = higher priority for ascending retrieval.
   */
  private calculatePriorityScore(priority: JobPriority): number {
    const weights: Record<JobPriority, number> = {
      URGENT: 1,
      HIGH: 2,
      NORMAL: 3,
      LOW: 4,
    };
    // Score combines priority tier and timestamp to maintain FIFO order within tiers
    return weights[priority] * 1e13 + Date.now();
  }

  /**
   * Maps MySQL row to strongly-typed JobEntity.
   */
  private mapRowToJob(row: any): JobEntity {
    return {
      id: String(row.id),
      task_id: String(row.task_id),
      organization_id: String(row.organization_id),
      type: row.type as JobType,
      status: row.status as JobStatus,
      priority: (row.priority || "NORMAL") as JobPriority,
      payload: typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload,
      attempts: Number(row.attempts || 0),
      max_attempts: Number(row.max_attempts || JOB_CONFIG.MAX_ATTEMPTS),
      worker_id: row.worker_id ? String(row.worker_id) : null,
      last_error: row.last_error ? (typeof row.last_error === "string" ? JSON.parse(row.last_error) : row.last_error) : null,
      locked_until: row.locked_until ? new Date(row.locked_until).toISOString() : null,
      started_at: row.started_at ? new Date(row.started_at).toISOString() : null,
      completed_at: row.completed_at ? new Date(row.completed_at).toISOString() : null,
      failed_at: row.failed_at ? new Date(row.failed_at).toISOString() : null,
      created_at: new Date(row.created_at).toISOString(),
      updated_at: new Date(row.updated_at).toISOString(),
    };
  }

  /**
   * Enqueues a new background job.
   * Minimal payload policy: strictly stores task identifiers, zero secrets/tokens.
   */
  public async enqueue(input: CreateJobInput): Promise<JobEntity> {
    const client = await initRedis();
    const jobId = `job_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
    const type = input.type || "TASK_EXECUTION";
    const priority = input.priority || "NORMAL";
    const maxAttempts = input.maxAttempts || JOB_CONFIG.MAX_ATTEMPTS;

    const payload = {
      taskId: input.taskId,
      resumeReason: input.payload?.resumeReason,
      options: input.payload?.options,
    };

    // 1. Persist durable job record in MySQL
    await pool.query(
      `INSERT INTO jobs (
        id, task_id, organization_id, type, status, priority,
        payload, attempts, max_attempts, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'QUEUED', ?, ?, 0, ?, NOW(), NOW());`,
      [
        jobId,
        input.taskId,
        input.organizationId,
        type,
        priority,
        JSON.stringify(payload),
        maxAttempts,
      ]
    );

    // 2. Add to Redis Pending Priority Sorted Set
    if (client) {
      const score = this.calculatePriorityScore(priority);
      await client.zAdd(this.KEY_PENDING, [{ score, value: jobId }]);
    }

    // 3. Update task status to QUEUED in MySQL
    await pool.query(
      `UPDATE tasks SET status = 'QUEUED', updated_at = NOW() WHERE id = ?;`,
      [input.taskId]
    );

    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT * FROM jobs WHERE id = ? LIMIT 1;`,
      [jobId]
    );

    return this.mapRowToJob(rows[0]);
  }

  /**
   * Dequeues the next runnable job for a worker.
   * Handles delayed retry promotion and atomic active set transitions.
   */
  public async dequeue(workerId: string): Promise<JobEntity | null> {
    const client = await initRedis();

    // 1. Promote due delayed jobs from KEY_DELAYED to KEY_PENDING
    if (client) {
      try {
        const now = Date.now();
        // Fetch delayed jobs whose retry timestamp has arrived
        const dueJobIds = await client.zRangeByScore(this.KEY_DELAYED, 0, now);
        if (dueJobIds.length > 0) {
          for (const dueId of dueJobIds) {
            await client.zRem(this.KEY_DELAYED, dueId);
            const score = this.calculatePriorityScore("NORMAL");
            await client.zAdd(this.KEY_PENDING, [{ score, value: dueId }]);
          }
        }
      } catch (err) {
        console.warn("[JobQueue Promote Delayed Error]", err);
      }
    }

    // 2. Pop highest priority job from KEY_PENDING
    let candidateJobId: string | null = null;
    if (client) {
      try {
        const items = await client.zRange(this.KEY_PENDING, 0, 0);
        if (items && items.length > 0) {
          candidateJobId = items[0];
          await client.zRem(this.KEY_PENDING, candidateJobId);
          await client.sAdd(this.KEY_ACTIVE, candidateJobId);
        }
      } catch (err) {
        console.warn("[JobQueue Redis Dequeue Error]", err);
      }
    }

    // Fallback: If Redis was empty or unavailable, inspect MySQL for QUEUED/RETRYING jobs
    if (!candidateJobId) {
      const [queuedRows] = await pool.query<RowDataPacket[]>(
        `SELECT id FROM jobs 
         WHERE status = 'QUEUED' 
         ORDER BY FIELD(priority, 'URGENT', 'HIGH', 'NORMAL', 'LOW'), created_at ASC 
         LIMIT 1;`
      );
      if (queuedRows.length === 0) return null;
      candidateJobId = queuedRows[0].id;
    }

    // 3. Atomically transition job to ACTIVE in MySQL
    const [result] = await pool.query<any>(
      `UPDATE jobs 
       SET status = 'ACTIVE', 
           worker_id = ?, 
           attempts = attempts + 1, 
           started_at = NOW(), 
           updated_at = NOW() 
       WHERE id = ? AND status IN ('QUEUED', 'RETRYING');`,
      [workerId, candidateJobId]
    );

    if (result.affectedRows === 0) {
      // Race condition or already processed by another worker
      if (client && candidateJobId) {
        await client.sRem(this.KEY_ACTIVE, candidateJobId);
      }
      return null;
    }

    const [jobRows] = await pool.query<RowDataPacket[]>(
      `SELECT * FROM jobs WHERE id = ? LIMIT 1;`,
      [candidateJobId]
    );

    if (jobRows.length === 0) return null;
    return this.mapRowToJob(jobRows[0]);
  }

  /**
   * Marks a job as COMPLETED.
   */
  public async complete(jobId: string): Promise<void> {
    const client = await initRedis();
    if (client) {
      try {
        await client.sRem(this.KEY_ACTIVE, jobId);
      } catch (err) {
        console.warn("[JobQueue Complete Redis Error]", err);
      }
    }

    await pool.query(
      `UPDATE jobs 
       SET status = 'COMPLETED', completed_at = NOW(), updated_at = NOW() 
       WHERE id = ?;`,
      [jobId]
    );
  }

  /**
   * Handles job execution failure with bounded retries and exponential backoff + jitter.
   */
  public async fail(
    jobId: string,
    error: unknown,
    retryable: boolean = true
  ): Promise<{ retried: boolean; nextAttempt?: number }> {
    const client = await initRedis();
    if (client) {
      try {
        await client.sRem(this.KEY_ACTIVE, jobId);
      } catch (err) {
        console.warn("[JobQueue Fail Redis Error]", err);
      }
    }

    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT * FROM jobs WHERE id = ? LIMIT 1;`,
      [jobId]
    );
    if (rows.length === 0) return { retried: false };

    const job = this.mapRowToJob(rows[0]);
    const errorMessage = error instanceof Error ? error.message : String(error || "Unknown job failure");
    const safeError = {
      message: errorMessage,
      failedAt: new Date().toISOString(),
      attempt: job.attempts,
    };

    // Determine if we can retry
    if (retryable && job.attempts < job.max_attempts) {
      // Exponential backoff with jitter: base * 2^(attempt-1) + jitter
      const exponential = JOB_CONFIG.BASE_BACKOFF_MS * Math.pow(2, job.attempts - 1);
      const backoff = Math.min(exponential, JOB_CONFIG.MAX_BACKOFF_MS);
      const jitter = Math.floor(Math.random() * JOB_CONFIG.JITTER_MAX_MS);
      const delayMs = backoff + jitter;
      const availableAt = Date.now() + delayMs;

      // Add to Redis delayed queue
      if (client) {
        try {
          await client.zAdd(this.KEY_DELAYED, [{ score: availableAt, value: jobId }]);
        } catch (err) {
          console.warn("[JobQueue Schedule Delay Error]", err);
        }
      }

      await pool.query(
        `UPDATE jobs 
         SET status = 'RETRYING', 
             last_error = ?, 
             updated_at = NOW() 
         WHERE id = ?;`,
        [JSON.stringify(safeError), jobId]
      );

      return { retried: true, nextAttempt: job.attempts + 1 };
    }

    // Exhausted or non-retryable
    await pool.query(
      `UPDATE jobs 
       SET status = 'EXHAUSTED', 
           failed_at = NOW(), 
           last_error = ?, 
           updated_at = NOW() 
       WHERE id = ?;`,
      [JSON.stringify(safeError), jobId]
    );

    // Transition linked task to FAILED
    await pool.query(
      `UPDATE tasks 
       SET status = 'FAILED', 
           error_message = ?, 
           completed_at = NOW(), 
           updated_at = NOW() 
       WHERE id = ?;`,
      [`Job exhausted after ${job.attempts} attempts: ${errorMessage}`, job.task_id]
    );

    return { retried: false };
  }

  /**
   * Cancels all pending/delayed/active jobs for a task.
   */
  public async cancel(taskId: string): Promise<void> {
    const client = await initRedis();

    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT id FROM jobs WHERE task_id = ? AND status IN ('QUEUED', 'ACTIVE', 'RETRYING');`,
      [taskId]
    );

    for (const row of rows) {
      if (client) {
        try {
          await client.zRem(this.KEY_PENDING, row.id);
          await client.zRem(this.KEY_DELAYED, row.id);
          await client.sRem(this.KEY_ACTIVE, row.id);
        } catch (err) {
          console.warn("[JobQueue Cancel Redis Error]", err);
        }
      }
    }

    await pool.query(
      `UPDATE jobs 
       SET status = 'CANCELLED', updated_at = NOW() 
       WHERE task_id = ? AND status IN ('QUEUED', 'ACTIVE', 'RETRYING');`,
      [taskId]
    );
  }

  /**
   * Retrieves operational metrics across Redis queues and MySQL jobs.
   */
  public async getMetrics(): Promise<QueueMetrics> {
    const [counts] = await pool.query<RowDataPacket[]>(`
      SELECT 
        SUM(CASE WHEN status = 'QUEUED' THEN 1 ELSE 0 END) as queued_cnt,
        SUM(CASE WHEN status = 'ACTIVE' THEN 1 ELSE 0 END) as active_cnt,
        SUM(CASE WHEN status = 'RETRYING' THEN 1 ELSE 0 END) as delayed_cnt,
        SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) as completed_cnt,
        SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) as failed_cnt,
        SUM(CASE WHEN status = 'EXHAUSTED' THEN 1 ELSE 0 END) as exhausted_cnt
      FROM jobs;
    `);

    const [workerCount] = await pool.query<RowDataPacket[]>(`
      SELECT COUNT(*) as onlineWorkers 
      FROM worker_heartbeats 
      WHERE status IN ('ONLINE', 'BUSY') 
        AND last_heartbeat > NOW() - INTERVAL 30 SECOND;
    `);

    const row = counts[0] || {};
    return {
      queued: Number(row.queued_cnt || 0),
      active: Number(row.active_cnt || 0),
      delayed: Number(row.delayed_cnt || 0),
      completed: Number(row.completed_cnt || 0),
      failed: Number(row.failed_cnt || 0),
      exhausted: Number(row.exhausted_cnt || 0),
      onlineWorkers: Number(workerCount[0]?.onlineWorkers || 0),
    };
  }
}

export const jobQueue = JobQueue.getInstance();
