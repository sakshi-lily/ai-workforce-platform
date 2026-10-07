/**
 * AI Workforce Platform — Phase 17: Human Approval Types & State Machine
 *
 * Defines the durable Human-in-the-Loop lifecycle models, state transition rules,
 * and security contracts for governed external actions.
 */

import { z } from "zod";

export type ApprovalStatus =
  | "PENDING"
  | "APPROVED"
  | "EXECUTING"
  | "EXECUTED"
  | "REJECTED"
  | "EXPIRED"
  | "CANCELLED";

export class InvalidApprovalStateTransitionError extends Error {
  public code: string;
  public statusCode: number;
  public fromState: string;
  public toState: string;

  constructor(fromState: string, toState: string) {
    super(`Cannot transition approval from '${fromState}' to '${toState}'.`);
    this.name = "InvalidApprovalStateTransitionError";
    this.code = "INVALID_APPROVAL_STATE_TRANSITION";
    this.statusCode = 409;
    this.fromState = fromState;
    this.toState = toState;
  }
}

/**
 * Strict transition matrix for approvals:
 *
 * PENDING    -> APPROVED, REJECTED, EXPIRED, CANCELLED
 * APPROVED   -> EXECUTING, CANCELLED
 * EXECUTING  -> EXECUTED, FAILED (via error)
 * Terminal states: EXECUTED, REJECTED, EXPIRED, CANCELLED
 */
export const ALLOWED_APPROVAL_TRANSITIONS: Record<ApprovalStatus, ApprovalStatus[]> = {
  PENDING: ["APPROVED", "REJECTED", "EXPIRED", "CANCELLED"],
  APPROVED: ["EXECUTING", "CANCELLED"],
  EXECUTING: ["EXECUTED"],
  EXECUTED: [], // Terminal
  REJECTED: [], // Terminal
  EXPIRED: [],  // Terminal
  CANCELLED: [],// Terminal
};

export function canTransitionApproval(
  fromState: ApprovalStatus,
  toState: ApprovalStatus
): boolean {
  return ALLOWED_APPROVAL_TRANSITIONS[fromState]?.includes(toState) ?? false;
}

export function assertValidApprovalTransition(
  fromState: ApprovalStatus,
  toState: ApprovalStatus
): void {
  if (!canTransitionApproval(fromState, toState)) {
    throw new InvalidApprovalStateTransitionError(fromState, toState);
  }
}

export interface ApprovalEntity {
  id: string;
  task_id: string;
  step_id?: string | null;
  organization_id: string;
  requested_by?: string | null;
  approved_by?: string | null;
  tool_name: string;
  risk_level: string;
  action_type: string;
  status: ApprovalStatus;
  payload_preview: Record<string, unknown>;
  request_payload: Record<string, unknown>;
  reviewer_notes?: string | null;
  decision_note?: string | null;
  requested_at: string;
  reviewed_at?: string | null;
  decided_at?: string | null;
  expires_at?: string | null;
  executed_at?: string | null;
  created_at: string;
}

export const ApproveActionSchema = z.object({
  note: z.string().max(1000).optional(),
});

export const RejectActionSchema = z.object({
  reason: z.string().max(1000).optional(),
});

export const CancelActionSchema = z.object({
  reason: z.string().max(1000).optional(),
});

export interface CreateApprovalParams {
  taskId: string;
  stepId?: string | null;
  organizationId: string;
  requestedBy: string;
  toolName: string;
  riskLevel?: string;
  actionType?: string;
  actionPayload: Record<string, unknown>;
  ttlMinutes?: number;
}

export const APPROVAL_CONFIG = {
  DEFAULT_TTL_MINUTES: 60, // Configurable expiration window
};
