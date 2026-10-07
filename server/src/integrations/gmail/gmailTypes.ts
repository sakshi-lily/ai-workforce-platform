/**
 * Phase 16 — Gmail Automation Types & Contracts
 */

export type GmailConnectionStatus =
  | "CONNECTED"
  | "EXPIRED"
  | "REAUTH_REQUIRED"
  | "DISCONNECTED"
  | "ERROR";

export interface GmailConnection {
  id: string;
  user_id: string;
  organization_id: string;
  provider: string;
  email_address: string;
  provider_account_id?: string;
  access_token_encrypted?: string;
  refresh_token_encrypted?: string;
  token_expires_at?: Date | string;
  scopes?: string;
  status: GmailConnectionStatus;
  created_at?: Date | string;
  updated_at?: Date | string;
}

export interface GmailProfile {
  email: string;
  messagesTotal?: number;
  threadsTotal?: number;
}

export interface GmailMessageSummary {
  messageId: string;
  threadId: string;
  from: string;
  to: string[];
  subject: string;
  snippet: string;
  receivedAt: string;
}

export interface GmailAttachmentMeta {
  filename: string;
  mimeType: string;
  sizeBytes: number;
}

export interface GmailMessageDetail {
  messageId: string;
  threadId: string;
  from: string;
  to: string[];
  subject: string;
  snippet: string;
  receivedAt: string;
  plainTextBody: string;
  hasAttachments: boolean;
  attachmentsSummary?: GmailAttachmentMeta[];
}

export interface GmailDraftInput {
  to: string[];
  subject: string;
  body: string;
}

export interface GmailDraftResult {
  draftId: string;
  messageId?: string;
  to: string[];
  subject: string;
  status: "DRAFT_CREATED";
  createdAt: string;
}

export interface GmailSendInput {
  to: string[];
  subject: string;
  body: string;
  reason?: string;
}

export interface GmailSendResult {
  status: "SENT" | "APPROVAL_REQUIRED" | "BLOCKED";
  approvalId?: string;
  messageId?: string;
  reason?: string;
  details?: Record<string, unknown>;
}

export type GmailErrorCode =
  | "GMAIL_NOT_CONNECTED"
  | "GMAIL_AUTH_ERROR"
  | "GMAIL_PERMISSION_ERROR"
  | "GMAIL_RATE_LIMIT"
  | "GMAIL_NOT_FOUND"
  | "GMAIL_INVALID_REQUEST"
  | "GMAIL_PROVIDER_ERROR"
  | "GMAIL_TIMEOUT"
  | "GMAIL_APPROVAL_REQUIRED";

export class GmailError extends Error {
  public code: GmailErrorCode;
  public retryable: boolean;
  public details?: Record<string, unknown>;

  constructor(
    message: string,
    code: GmailErrorCode = "GMAIL_PROVIDER_ERROR",
    retryable: boolean = false,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "GmailError";
    this.code = code;
    this.retryable = retryable;
    this.details = details;
  }
}

export const GMAIL_BOUNDS = {
  MAX_SEARCH_RESULTS: 10,
  DEFAULT_SEARCH_RESULTS: 5,
  MAX_QUERY_LENGTH: 200,
  MAX_EMAIL_BODY_CHARS: 4000,
  MAX_DRAFT_RECIPIENTS: 10,
  MAX_SUBJECT_CHARS: 250,
  MAX_CALLS_PER_TASK: 15,
};
