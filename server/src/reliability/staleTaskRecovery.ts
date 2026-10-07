/**
 * AI Workforce Platform — Phase 19: Stale Task & Crash Recovery Engine
 *
 * Detects worker crashes, lease expirations, and orphaned RUNNING tasks.
 * Recovers stale tasks atomically using optimistic concurrency (version checking)
 * and re-enqueues them up to bounded retry limits, preventing zombie tasks.
 */

import crypto from "crypto";
import { RowDataPacket } from "mysql2/promise";
import { pool } from "../db/pool";
import { lockManager } from "../jobs/lockManager";
import { jobQueue } from "../jobs/queue";
import { retryPolicy } from "./retryPolicy";

export interface StaleRecoveryResult {
  scanned: number;
  recovered: number;
  exhausted: number;
}

export class StaleTaskRecoveryService {
  private static instance: StaleTaskRecoveryService;
  private readonly defaultStaleThresholdSec: number = 45;

  public static getInstance(): StaleTaskRecoveryService {
    if (!StaleTaskRecoveryService.instance) {
      StaleTaskRecoveryService.instance = new StaleTaskRecoveryService();
    }
    return StaleTaskRecoveryService.instance;
  }

  /**
   * Scans MySQL for tasks stuck in RUNNING whose lease/heartbeat has expired.
   */
  public async recoverStaleTasks(
    staleThresholdSeconds?: number
  ): Promise<StaleRecoveryResult> {
    const threshold = staleThresholdSeconds || this.defaultStaleThresholdSec;

    // Find candidate tasks that have been in RUNNING with no updates for > threshold seconds
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT id, organization_id, user_id, title, priority, version, total_retries, started_at, updated_at
       FROM tasks
       WHERE status = 'RUNNING'
         AND updated_at < DATE_SUB(NOW(), INTERVAL ? SECOND);`,
      [threshold]
    );

    const result: StaleRecoveryResult = {
      scanned: rows.length,
      recovered: 0,
      exhausted: 0,
    };

    if (rows.length === 0) return result;

    const retryConfig = retryPolicy.getConfig();

    for (const task of rows) {
      const taskId = String(task.id);
      const currentVersion = Number(task.version || 1);
      const totalRetries = Number(task.total_retries || 0);

      console.warn(
        `[StaleRecovery] Detected stale RUNNING task '${taskId}' (inactive for >${threshold}s, version: ${currentVersion}, retries: ${totalRetries}).`
      );

      // Force-release any expired lock in Redis
      await lockManager.forceReleaseLock(taskId);

      // Check retry budget
      const canProceed = retryPolicy.canRetry({
        currentAttempt: totalRetries,
        maxAttempts: retryConfig.maxTotalRetries,
        totalRetriesSoFar: totalRetries,
      });

      if (canProceed) {
        // Optimistic concurrency update: only update if version has not changed
        const [updateResult] = await pool.query<any>(
          `UPDATE tasks 
           SET status = 'QUEUED', 
               total_retries = total_retries + 1, 
               version = version + 1, 
               updated_at = NOW() 
           WHERE id = ? AND version = ? AND status = 'RUNNING';`,
          [taskId, currentVersion]
        );

        if (updateResult.affectedRows > 0) {
          // Record historical attempt
          await this.recordAttempt(
            taskId,
            task.organization_id,
            totalRetries + 1,
            "RECOVERED",
            "STALE_LEASE_RECOVERED",
            `Task lease expired after ${threshold}s. Requeued for autonomous recovery.`
          );

          // Re-enqueue in job queue
          await jobQueue.enqueue({
            taskId,
            organizationId: task.organization_id,
            priority: task.priority || "NORMAL",
            type: "TASK_RETRY",
          });

          // Log audit trail
          await this.logAudit(
            task.user_id,
            task.organization_id,
            taskId,
            "TASK_RECOVERY_COMPLETED",
            "task_recovered",
            { retryCount: totalRetries + 1, priorVersion: currentVersion }
          );

          result.recovered++;
          console.log(`[StaleRecovery] Successfully recovered and requeued task '${taskId}'.`);
        }
      } else {
        // Retry budget exhausted -> terminal FAILED
        const [exhaustResult] = await pool.query<any>(
          `UPDATE tasks 
           SET status = 'FAILED', 
               version = version + 1, 
               error_message = 'Recovery limit exceeded after worker crash or lease expiration.', 
               completed_at = NOW(), 
               updated_at = NOW() 
           WHERE id = ? AND version = ? AND status = 'RUNNING';`,
          [taskId, currentVersion]
        );

        if (exhaustResult.affectedRows > 0) {
          await this.recordAttempt(
            taskId,
            task.organization_id,
            totalRetries,
            "EXHAUSTED",
            "RECOVERY_LIMIT_EXCEEDED",
            `Task recovery budget (${retryConfig.maxTotalRetries}) exhausted.`
          );

          await this.logAudit(
            task.user_id,
            task.organization_id,
            taskId,
            "TASK_RECOVERY_FAILED",
            "recovery_exhausted",
            { totalRetries, maxAllowed: retryConfig.maxTotalRetries }
          );

          result.exhausted++;
          console.warn(`[StaleRecovery] Task '${taskId}' recovery budget exhausted. Marked FAILED.`);
        }
      }
    }

    return result;
  }

  private async recordAttempt(
    taskId: string,
    organizationId: string,
    attemptNumber: number,
    status: any,
    errorCode: string,
    message: string
  ): Promise<void> {
    try {
      const attemptId = `att_${crypto.randomUUID().replace(/-/g, "")}`;
      await pool.query(
        `INSERT INTO job_attempts (
          id, job_id, task_id, organization_id, attempt_number, worker_id,
          status, error_code, error_category, error_details, started_at, ended_at
        ) VALUES (?, 'recovery_daemon', ?, ?, ?, 'recovery_sweeper', ?, ?, 'RECOVERY', ?, NOW(), NOW());`,
        [
          attemptId,
          taskId,
          organizationId,
          attemptNumber,
          status,
          errorCode,
          JSON.stringify({ message }),
        ]
      );
    } catch (err) {
      console.warn("[StaleRecovery Record Attempt Warning]", err);
    }
  }

  private async logAudit(
    userId: string,
    organizationId: string,
    taskId: string,
    eventType: string,
    action: string,
    details: Record<string, unknown>
  ): Promise<void> {
    try {
      const id = crypto.randomUUID();
      await pool.query(
        `INSERT INTO audit_logs (id, user_id, organization_id, task_id, event_type, action, details_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NOW());`,
        [id, userId, organizationId, taskId, eventType, action, JSON.stringify(details)]
      );
    } catch (err) {
      console.warn("[StaleRecovery Log Audit Warning]", err);
    }
  }
}

export const staleTaskRecovery = StaleTaskRecoveryService.getInstance();
