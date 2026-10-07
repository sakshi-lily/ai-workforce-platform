/**
 * AI Workforce Platform — Phase 17: Human Approval Service
 *
 * Implements the core business logic, lifecycle transitions, anti-tampering,
 * atomic database operations, and post-approval execution pipelines.
 */

import crypto from "crypto";
import { RowDataPacket } from "mysql2/promise";
import { pool } from "../db/pool";
import { AuthenticatedUser } from "../auth/types";
import {
  ApprovalEntity,
  ApprovalStatus,
  CreateApprovalParams,
  APPROVAL_CONFIG,
} from "./approvalTypes";
import { gmailService } from "../integrations/gmail/gmailService";

export class ApprovalService {
  /**
   * Creates a new pending approval request for a sensitive action.
   */
  public async createApproval(params: CreateApprovalParams): Promise<ApprovalEntity> {
    const approvalId = `appr_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
    const ttlMinutes = params.ttlMinutes || APPROVAL_CONFIG.DEFAULT_TTL_MINUTES;
    const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);

    const riskLevel = params.riskLevel || "EXTERNAL_SIDE_EFFECT";
    const actionType = params.actionType || params.toolName;

    // Sanitize and normalize payload preview (protecting against secrets)
    const payloadPreview = this.sanitizePayload(params.actionPayload);
    const requestPayload = { ...params.actionPayload };

    await pool.query(
      `INSERT INTO approvals (
        id, task_id, step_id, organization_id, requested_by, tool_name,
        risk_level, action_type, status, payload_preview, request_payload,
        requested_at, expires_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, NOW(), ?, NOW())`,
      [
        approvalId,
        params.taskId,
        params.stepId || null,
        params.organizationId,
        params.requestedBy,
        params.toolName,
        riskLevel,
        actionType,
        JSON.stringify(payloadPreview),
        JSON.stringify(requestPayload),
        expiresAt,
      ]
    );

    // Update task lifecycle state to WAITING_FOR_APPROVAL
    await pool.query(
      `UPDATE tasks SET status = 'WAITING_FOR_APPROVAL', updated_at = NOW() WHERE id = ?`,
      [params.taskId]
    );

    // Update task_step status if stepId was provided
    if (params.stepId) {
      await pool.query(
        `UPDATE task_steps SET status = 'WAITING_FOR_APPROVAL' WHERE id = ?`,
        [params.stepId]
      );
    }

    // Record audit event
    await this.logAuditEvent({
      userId: params.requestedBy,
      organizationId: params.organizationId,
      taskId: params.taskId,
      eventType: "APPROVAL_CREATED",
      action: "approval_created",
      details: {
        approvalId,
        toolName: params.toolName,
        riskLevel,
        expiresAt: expiresAt.toISOString(),
      },
    });

    const approval = await this.getApproval(approvalId, params.organizationId);
    if (!approval) {
      throw new Error("Failed to retrieve created approval.");
    }
    return approval;
  }

  /**
   * Retrieves an approval by ID within the authenticated organization scope (Anti-IDOR).
   */
  public async getApproval(
    approvalId: string,
    organizationId: string
  ): Promise<ApprovalEntity | null> {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT * FROM approvals WHERE id = ? AND organization_id = ? LIMIT 1`,
      [approvalId, organizationId]
    );

    if (rows.length === 0) {
      return null;
    }

    let entity = this.mapRowToEntity(rows[0]);

    // Check expiration if still in PENDING state
    if (
      entity.status === "PENDING" &&
      entity.expires_at &&
      new Date(entity.expires_at).getTime() < Date.now()
    ) {
      await pool.query(
        `UPDATE approvals SET status = 'EXPIRED' WHERE id = ? AND status = 'PENDING'`,
        [approvalId]
      );

      await this.logAuditEvent({
        userId: entity.requested_by || undefined,
        organizationId: entity.organization_id,
        taskId: entity.task_id,
        eventType: "APPROVAL_EXPIRED",
        action: "approval_expired",
        details: { approvalId },
      });

      entity.status = "EXPIRED";
    }

    return entity;
  }

  /**
   * Lists approvals for an organization with optional status filtering.
   */
  public async listApprovals(
    organizationId: string,
    options: { status?: ApprovalStatus; limit?: number; offset?: number } = {}
  ): Promise<{ approvals: ApprovalEntity[]; total: number }> {
    const limit = Math.min(options.limit || 50, 100);
    const offset = options.offset || 0;

    let query = `SELECT * FROM approvals WHERE organization_id = ?`;
    const params: (string | number)[] = [organizationId];

    if (options.status) {
      query += ` AND status = ?`;
      params.push(options.status);
    }

    query += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const [rows] = await pool.query<RowDataPacket[]>(query, params);

    // Count query
    let countQuery = `SELECT COUNT(*) as total FROM approvals WHERE organization_id = ?`;
    const countParams: string[] = [organizationId];
    if (options.status) {
      countQuery += ` AND status = ?`;
      countParams.push(options.status);
    }
    const [countRows] = await pool.query<RowDataPacket[]>(countQuery, countParams);
    const total = (countRows[0] as any)?.total || 0;

    const approvals = rows.map((r) => this.mapRowToEntity(r));

    // Update expired pending items
    const now = Date.now();
    for (const app of approvals) {
      if (
        app.status === "PENDING" &&
        app.expires_at &&
        new Date(app.expires_at).getTime() < now
      ) {
        await pool.query(
          `UPDATE approvals SET status = 'EXPIRED' WHERE id = ? AND status = 'PENDING'`,
          [app.id]
        );
        app.status = "EXPIRED";
      }
    }

    return { approvals, total };
  }

  /**
   * Approves a pending approval request and executes the authorized action.
   */
  public async approve(
    approvalId: string,
    user: AuthenticatedUser,
    note?: string
  ): Promise<{ approval: ApprovalEntity; executionResult: unknown }> {
    const existing = await this.getApproval(approvalId, user.organizationId);
    if (!existing) {
      const err: any = new Error(`Approval '${approvalId}' not found.`);
      err.statusCode = 404;
      err.code = "APPROVAL_NOT_FOUND";
      throw err;
    }

    if (existing.status !== "PENDING") {
      const err: any = new Error(
        `Cannot approve: approval is in state '${existing.status}', expected 'PENDING'.`
      );
      err.statusCode = 409;
      err.code = "INVALID_APPROVAL_STATE";
      throw err;
    }

    // Atomic update from PENDING -> APPROVED
    const [result] = await pool.query<any>(
      `UPDATE approvals 
       SET status = 'APPROVED', approved_by = ?, decision_note = ?, reviewer_notes = ?, decided_at = NOW(), reviewed_at = NOW()
       WHERE id = ? AND organization_id = ? AND status = 'PENDING' AND (expires_at IS NULL OR expires_at > NOW())`,
      [user.id, note || null, note || null, approvalId, user.organizationId]
    );

    if (result.affectedRows === 0) {
      // Re-fetch to provide precise error code
      const current = await this.getApproval(approvalId, user.organizationId);
      const err: any = new Error(
        `Approval could not be updated. Current status: '${current?.status}'.`
      );
      err.statusCode = 409;
      err.code = "APPROVAL_CONFLICT";
      throw err;
    }

    await this.logAuditEvent({
      userId: user.id,
      organizationId: user.organizationId,
      taskId: existing.task_id,
      eventType: "APPROVAL_APPROVED",
      action: "approval_approved",
      details: { approvalId, note: note || null },
    });

    // Execute approved action under strict policy re-check
    const executionResult = await this.executeApprovedAction(approvalId, user);

    const updated = await this.getApproval(approvalId, user.organizationId);
    return { approval: updated!, executionResult };
  }

  /**
   * Rejects a pending approval request.
   */
  public async reject(
    approvalId: string,
    user: AuthenticatedUser,
    reason?: string
  ): Promise<ApprovalEntity> {
    const existing = await this.getApproval(approvalId, user.organizationId);
    if (!existing) {
      const err: any = new Error(`Approval '${approvalId}' not found.`);
      err.statusCode = 404;
      err.code = "APPROVAL_NOT_FOUND";
      throw err;
    }

    if (existing.status !== "PENDING") {
      const err: any = new Error(
        `Cannot reject: approval is in state '${existing.status}', expected 'PENDING'.`
      );
      err.statusCode = 409;
      err.code = "INVALID_APPROVAL_STATE";
      throw err;
    }

    const [result] = await pool.query<any>(
      `UPDATE approvals 
       SET status = 'REJECTED', approved_by = ?, decision_note = ?, reviewer_notes = ?, decided_at = NOW(), reviewed_at = NOW()
       WHERE id = ? AND organization_id = ? AND status = 'PENDING'`,
      [user.id, reason || null, reason || null, approvalId, user.organizationId]
    );

    if (result.affectedRows === 0) {
      const err: any = new Error("Approval rejection could not be completed.");
      err.statusCode = 409;
      err.code = "APPROVAL_CONFLICT";
      throw err;
    }

    await this.logAuditEvent({
      userId: user.id,
      organizationId: user.organizationId,
      taskId: existing.task_id,
      eventType: "APPROVAL_REJECTED",
      action: "approval_rejected",
      details: { approvalId, reason: reason || null },
    });

    // Update task and step state
    if (existing.step_id) {
      await pool.query(
        `UPDATE task_steps 
         SET status = 'FAILED', error_message = ? 
         WHERE id = ?`,
        [`Action rejected by reviewer: ${reason || "No reason specified"}`, existing.step_id]
      );
    }

    await pool.query(
      `UPDATE tasks 
       SET status = 'COMPLETED', 
           final_report = CONCAT(IFNULL(final_report, ''), '\n\n[NOTICE]: Proposed action ${existing.tool_name} was rejected by human reviewer: "${reason || 'Rejected'}". Task finished without executing the sensitive action.')
       WHERE id = ?`,
      [existing.task_id]
    );

    const updated = await this.getApproval(approvalId, user.organizationId);
    return updated!;
  }

  /**
   * Cancels a pending approval request.
   */
  public async cancel(
    approvalId: string,
    user: AuthenticatedUser,
    reason?: string
  ): Promise<ApprovalEntity> {
    const existing = await this.getApproval(approvalId, user.organizationId);
    if (!existing) {
      const err: any = new Error(`Approval '${approvalId}' not found.`);
      err.statusCode = 404;
      err.code = "APPROVAL_NOT_FOUND";
      throw err;
    }

    if (existing.status !== "PENDING" && existing.status !== "APPROVED") {
      const err: any = new Error(
        `Cannot cancel approval in '${existing.status}' state.`
      );
      err.statusCode = 409;
      err.code = "INVALID_APPROVAL_STATE";
      throw err;
    }

    await pool.query(
      `UPDATE approvals 
       SET status = 'CANCELLED', decision_note = ? 
       WHERE id = ? AND organization_id = ?`,
      [reason || "Cancelled", approvalId, user.organizationId]
    );

    await this.logAuditEvent({
      userId: user.id,
      organizationId: user.organizationId,
      taskId: existing.task_id,
      eventType: "APPROVAL_CANCELLED",
      action: "approval_cancelled",
      details: { approvalId, reason: reason || null },
    });

    const updated = await this.getApproval(approvalId, user.organizationId);
    return updated!;
  }

  /**
   * Executes the approved action under strict policy re-check and idempotency guards.
   */
  public async executeApprovedAction(
    approvalId: string,
    user: AuthenticatedUser
  ): Promise<unknown> {
    const approval = await this.getApproval(approvalId, user.organizationId);
    if (!approval) {
      throw new Error(`Approval '${approvalId}' not found for execution.`);
    }

    // 1. Policy Re-check: Must be in APPROVED status
    if (approval.status !== "APPROVED") {
      const err: any = new Error(
        `Policy re-check failed: Approval is in state '${approval.status}', expected 'APPROVED'.`
      );
      err.statusCode = 409;
      err.code = "APPROVAL_NOT_APPROVED";
      throw err;
    }

    // 2. Policy Re-check: Expiry
    if (approval.expires_at && new Date(approval.expires_at).getTime() < Date.now()) {
      await pool.query(`UPDATE approvals SET status = 'EXPIRED' WHERE id = ?`, [approvalId]);
      const err: any = new Error("Policy re-check failed: Approval has expired.");
      err.statusCode = 400;
      err.code = "APPROVAL_EXPIRED";
      throw err;
    }

    // 3. Atomic transition from APPROVED -> EXECUTING (Double execution prevention)
    const [transResult] = await pool.query<any>(
      `UPDATE approvals SET status = 'EXECUTING' WHERE id = ? AND status = 'APPROVED'`,
      [approvalId]
    );

    if (transResult.affectedRows === 0) {
      const err: any = new Error(
        "Double execution prevented: Action is already executing or has completed."
      );
      err.statusCode = 409;
      err.code = "DOUBLE_EXECUTION_PREVENTED";
      throw err;
    }

    await this.logAuditEvent({
      userId: user.id,
      organizationId: user.organizationId,
      taskId: approval.task_id,
      eventType: "APPROVAL_EXECUTION_STARTED",
      action: "execution_started",
      details: { approvalId, toolName: approval.tool_name },
    });

    const startTime = performance.now();
    let executionResult: unknown;
    let isError = false;
    let errorMessage: string | null = null;

    try {
      // 4. Action dispatch
      if (approval.tool_name === "gmail_send") {
        const payload = approval.request_payload as any;
        executionResult = await gmailService.sendEmailDirect(payload, {
          userId: approval.requested_by || user.id,
          organizationId: user.organizationId,
          taskId: approval.task_id,
        });
      } else {
        throw new Error(`Unsupported approved tool action '${approval.tool_name}'.`);
      }

      // 5. Atomic transition from EXECUTING -> EXECUTED
      await pool.query(
        `UPDATE approvals SET status = 'EXECUTED', executed_at = NOW() WHERE id = ?`,
        [approvalId]
      );

      await this.logAuditEvent({
        userId: user.id,
        organizationId: user.organizationId,
        taskId: approval.task_id,
        eventType: "APPROVAL_EXECUTION_COMPLETED",
        action: "execution_completed",
        details: { approvalId, toolName: approval.tool_name },
      });

      // Update task and step status to COMPLETED
      if (approval.step_id) {
        await pool.query(
          `UPDATE task_steps 
           SET status = 'COMPLETED', output_data = ?, completed_at = NOW() 
           WHERE id = ?`,
          [JSON.stringify(executionResult), approval.step_id]
        );
      }

      await pool.query(
        `UPDATE tasks 
         SET status = 'COMPLETED', completed_at = NOW(), 
             final_report = CONCAT(IFNULL(final_report, ''), '\n\n[ACTION EXECUTED]: ${approval.tool_name} was approved and executed successfully.')
         WHERE id = ?`,
        [approval.task_id]
      );

      return executionResult;
    } catch (err: any) {
      isError = true;
      errorMessage = err?.message || String(err);

      const errStr = String(errorMessage || "");
      const isAmbiguousTimeout =
        errStr.includes("timeout") ||
        errStr.includes("ETIMEDOUT") ||
        err?.code === "TIMEOUT" ||
        err?.code === "GMAIL_TIMEOUT";

      if (isAmbiguousTimeout) {
        // Safe ambiguous handling: Automated blind retry PROHIBITED to prevent duplicate emails
        await pool.query(
          `UPDATE approvals SET status = 'PENDING', decision_note = CONCAT(IFNULL(decision_note, ''), ' [UNKNOWN_OUTCOME: Provider timed out after dispatch. Automated blind retry blocked to prevent duplicate email send.]') WHERE id = ?`,
          [approvalId]
        );
      } else {
        await pool.query(
          `UPDATE approvals SET status = 'APPROVED', decision_note = CONCAT(IFNULL(decision_note, ''), ' [Execution Error: ', ?, ']') WHERE id = ?`,
          [errorMessage, approvalId]
        );
      }

      await this.logAuditEvent({
        userId: user.id,
        organizationId: user.organizationId,
        taskId: approval.task_id,
        eventType: "APPROVAL_EXECUTION_FAILED",
        action: "execution_failed",
        details: { approvalId, error: errorMessage },
      });

      throw err;
    } finally {
      const durationMs = Math.round(performance.now() - startTime);

      // Record durable tool_executions entry
      const toolExecId = `tex_${crypto.randomUUID().replace(/-/g, "")}`;
      await pool.query(
        `INSERT INTO tool_executions (
          id, task_id, step_id, tool_name, input_payload, output_payload,
          duration_ms, is_error, error_message, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
          toolExecId,
          approval.task_id,
          approval.step_id || null,
          approval.tool_name,
          JSON.stringify(approval.payload_preview),
          JSON.stringify(executionResult || { error: errorMessage }),
          durationMs,
          isError,
          errorMessage,
        ]
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private mapRowToEntity(row: RowDataPacket): ApprovalEntity {
    const parseJson = (val: unknown) => {
      if (!val) return {};
      if (typeof val === "object") return val as Record<string, unknown>;
      try {
        return JSON.parse(String(val));
      } catch {
        return {};
      }
    };

    return {
      id: row.id,
      task_id: row.task_id,
      step_id: row.step_id,
      organization_id: row.organization_id,
      requested_by: row.requested_by,
      approved_by: row.approved_by,
      tool_name: row.tool_name,
      risk_level: row.risk_level,
      action_type: row.action_type,
      status: row.status as ApprovalStatus,
      payload_preview: parseJson(row.payload_preview),
      request_payload: parseJson(row.request_payload || row.payload_preview),
      reviewer_notes: row.reviewer_notes,
      decision_note: row.decision_note,
      requested_at: row.requested_at ? new Date(row.requested_at).toISOString() : new Date().toISOString(),
      reviewed_at: row.reviewed_at ? new Date(row.reviewed_at).toISOString() : null,
      decided_at: row.decided_at ? new Date(row.decided_at).toISOString() : null,
      expires_at: row.expires_at ? new Date(row.expires_at).toISOString() : null,
      executed_at: row.executed_at ? new Date(row.executed_at).toISOString() : null,
      created_at: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
    };
  }

  private sanitizePayload(payload: Record<string, unknown>): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};
    const secretKeys = ["token", "secret", "password", "key", "authorization", "credential"];

    for (const [key, value] of Object.entries(payload)) {
      if (secretKeys.some((sk) => key.toLowerCase().includes(sk))) {
        sanitized[key] = "[REDACTED]";
      } else if (typeof value === "string" && value.length > 500) {
        sanitized[key] = value.slice(0, 500) + "... [truncated]";
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }

  private async logAuditEvent(event: {
    userId?: string;
    organizationId: string;
    taskId?: string;
    eventType: string;
    action: string;
    details: Record<string, unknown>;
  }): Promise<void> {
    const auditId = `aud_${crypto.randomUUID().replace(/-/g, "")}`;
    try {
      await pool.query(
        `INSERT INTO audit_logs (id, user_id, organization_id, task_id, event_type, action, details_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [
          auditId,
          event.userId || null,
          event.organizationId,
          event.taskId || null,
          event.eventType,
          event.action,
          JSON.stringify(event.details),
        ]
      );
    } catch (err) {
      console.error("[ApprovalService] Failed to record audit log:", err);
    }
  }
}

export const approvalService = new ApprovalService();
