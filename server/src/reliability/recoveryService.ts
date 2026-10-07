/**
 * AI Workforce Platform — Phase 19: Recovery & Dead-Letter Service
 *
 * Provides inspection of exhausted and failed tasks, historical attempt audits,
 * and authenticated, tenant-isolated manual retries for operators.
 */

import crypto from "crypto";
import { RowDataPacket } from "mysql2/promise";
import { pool } from "../db/pool";
import { AuthenticatedUser } from "../auth/types";
import { jobQueue } from "../jobs/queue";
import { lockManager } from "../jobs/lockManager";
import { AppError, ErrorCategory } from "./failureTaxonomy";

export class RecoveryService {
  private static instance: RecoveryService;

  public static getInstance(): RecoveryService {
    if (!RecoveryService.instance) {
      RecoveryService.instance = new RecoveryService();
    }
    return RecoveryService.instance;
  }

  /**
   * Retrieves historical execution attempts for a task (Anti-IDOR enforced).
   */
  public async getTaskAttempts(
    taskId: string,
    organizationId: string
  ): Promise<any[]> {
    // Verify task exists in organization
    const [taskRows] = await pool.query<RowDataPacket[]>(
      `SELECT id FROM tasks WHERE id = ? AND organization_id = ? LIMIT 1;`,
      [taskId, organizationId]
    );

    if (taskRows.length === 0) {
      throw new AppError({
        code: "TASK_NOT_FOUND",
        category: ErrorCategory.NOT_FOUND,
        message: `Task '${taskId}' not found.`,
        statusCode: 404,
      });
    }

    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT * FROM job_attempts 
       WHERE task_id = ? AND organization_id = ? 
       ORDER BY attempt_number ASC, started_at ASC;`,
      [taskId, organizationId]
    );

    return rows.map((r) => ({
      id: r.id,
      jobId: r.job_id,
      taskId: r.task_id,
      attemptNumber: r.attempt_number,
      workerId: r.worker_id,
      status: r.status,
      errorCode: r.error_code,
      errorCategory: r.error_category,
      errorDetails: typeof r.error_details === "string" ? JSON.parse(r.error_details) : r.error_details,
      startedAt: r.started_at,
      endedAt: r.ended_at,
      durationMs: r.duration_ms,
    }));
  }

  /**
   * Performs an authenticated, controlled manual retry on a failed or exhausted task.
   */
  public async retryFailedTask(
    taskId: string,
    organizationId: string,
    user: AuthenticatedUser
  ): Promise<{ taskId: string; jobId: string; status: string; attemptNumber: number }> {
    // 1. Authoritative lookup & Tenant check (Anti-IDOR)
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT * FROM tasks WHERE id = ? AND organization_id = ? LIMIT 1;`,
      [taskId, organizationId]
    );

    if (rows.length === 0) {
      throw new AppError({
        code: "TASK_NOT_FOUND",
        category: ErrorCategory.NOT_FOUND,
        message: `Task '${taskId}' not found.`,
        statusCode: 404,
      });
    }

    const task = rows[0];

    // 2. State verification: Task must be in FAILED status to allow manual retry
    if (task.status !== "FAILED") {
      throw new AppError({
        code: "INVALID_TASK_STATE",
        category: ErrorCategory.CONFLICT,
        message: `Cannot retry task: Current status is '${task.status}', expected 'FAILED'.`,
        statusCode: 409,
      });
    }

    // 3. Clear any lingering execution locks
    await lockManager.forceReleaseLock(taskId);

    const currentVersion = Number(task.version || 1);
    const priorRetries = Number(task.total_retries || 0);

    // 4. Optimistic concurrency state transition: FAILED -> QUEUED
    const [updateResult] = await pool.query<any>(
      `UPDATE tasks 
       SET status = 'QUEUED', 
           error_message = NULL, 
           version = version + 1, 
           updated_at = NOW() 
       WHERE id = ? AND organization_id = ? AND status = 'FAILED' AND version = ?;`,
      [taskId, organizationId, currentVersion]
    );

    if (updateResult.affectedRows === 0) {
      throw new AppError({
        code: "CONCURRENCY_CONFLICT",
        category: ErrorCategory.CONFLICT,
        message: "Task state changed concurrently before manual retry could be scheduled.",
        statusCode: 409,
      });
    }

    // 5. Enqueue new background job
    const newJob = await jobQueue.enqueue({
      taskId,
      organizationId,
      priority: task.priority || "NORMAL",
      type: "TASK_RETRY",
    });

    // 6. Record attempt history
    const attemptId = `att_${crypto.randomUUID().replace(/-/g, "")}`;
    await pool.query(
      `INSERT INTO job_attempts (
        id, job_id, task_id, organization_id, attempt_number, worker_id,
        status, error_code, error_category, error_details, started_at
      ) VALUES (?, ?, ?, ?, ?, 'manual_operator', 'RUNNING', 'MANUAL_RETRY_INITIATED', 'OPERATOR', ?, NOW());`,
      [
        attemptId,
        newJob.id,
        taskId,
        organizationId,
        priorRetries + 1,
        JSON.stringify({ triggeredBy: user.email, userId: user.id }),
      ]
    );

    // 7. Record immutable audit log
    const auditId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO audit_logs (id, user_id, organization_id, task_id, event_type, action, details_json, created_at)
       VALUES (?, ?, ?, ?, 'MANUAL_RETRY', 'task_manually_retried', ?, NOW());`,
      [
        auditId,
        user.id,
        organizationId,
        taskId,
        JSON.stringify({ jobId: newJob.id, priorRetries }),
      ]
    );

    console.log(
      `[RecoveryService] Task '${taskId}' manually retried by user '${user.email}'. Enqueued job '${newJob.id}'.`
    );

    return {
      taskId,
      jobId: newJob.id,
      status: "QUEUED",
      attemptNumber: priorRetries + 1,
    };
  }
}

export const recoveryService = RecoveryService.getInstance();
