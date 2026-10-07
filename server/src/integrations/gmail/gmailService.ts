import crypto from "crypto";
import { pool } from "../../db/pool";
import { ToolContext } from "../../tools/types";
import {
  GmailConnection,
  GmailConnectionStatus,
  GmailProfile,
  GmailMessageSummary,
  GmailMessageDetail,
  GmailDraftInput,
  GmailDraftResult,
  GmailSendInput,
  GmailSendResult,
  GmailError,
  GMAIL_BOUNDS,
} from "./gmailTypes";
import { encryptSecret, decryptSecret } from "./gmailCrypto";
import { getActiveGmailProvider, IGmailProvider } from "./gmailProvider";

/**
 * Phase 16 — Centralized Gmail Service
 *
 * Enforces:
 * 1. Multi-tenant connection scoping: Connections are strictly tied to userId and organizationId.
 * 2. Token protection: Access and refresh tokens are encrypted at rest with AES-256-GCM.
 * 3. State verification: HMAC-signed OAuth state protects against CSRF.
 * 4. Audit logging: Records all connection, discovery, draft, and blocked send events.
 * 5. Send staging: Sends are intercepted, verified, staged into `approvals`, and held for human review.
 */
export class GmailService {
  private provider: IGmailProvider;

  constructor(provider?: IGmailProvider) {
    this.provider = provider || getActiveGmailProvider();
  }

  public setProvider(provider: IGmailProvider): void {
    this.provider = provider;
  }

  public getProvider(): IGmailProvider {
    return this.provider;
  }

  // ---------------------------------------------------------------------------
  // Connection Management & Tenant Scoping
  // ---------------------------------------------------------------------------

  /**
   * Retrieves an active Gmail connection for the specified authenticated context.
   */
  public async getConnection(
    userId: string,
    organizationId: string
  ): Promise<GmailConnection | null> {
    const [rows] = await pool.query(
      `SELECT * FROM gmail_connections WHERE user_id = ? AND organization_id = ? LIMIT 1`,
      [userId, organizationId]
    );

    const list = rows as any[];
    if (list.length === 0) {
      return null;
    }

    const row = list[0];
    return {
      id: row.id,
      user_id: row.user_id,
      organization_id: row.organization_id,
      provider: row.provider,
      email_address: row.email_address,
      provider_account_id: row.provider_account_id,
      access_token_encrypted: row.access_token_encrypted,
      refresh_token_encrypted: row.refresh_token_encrypted,
      token_expires_at: row.token_expires_at,
      scopes: row.scopes,
      status: row.status as GmailConnectionStatus,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  /**
   * Ensures an active connection exists; throws GMAIL_NOT_CONNECTED if missing or disconnected.
   */
  public async ensureConnected(
    userId: string,
    organizationId: string
  ): Promise<GmailConnection> {
    const conn = await this.getConnection(userId, organizationId);
    if (!conn || conn.status !== "CONNECTED") {
      throw new GmailError(
        `Gmail account is not connected for organization '${organizationId}'. Please connect Gmail in Settings.`,
        "GMAIL_NOT_CONNECTED",
        false
      );
    }
    return conn;
  }

  /**
   * Saves or updates a Gmail connection for a user.
   */
  public async saveConnection(
    conn: Omit<GmailConnection, "created_at" | "updated_at">
  ): Promise<void> {
    await pool.query(
      `INSERT INTO gmail_connections 
        (id, user_id, organization_id, provider, email_address, provider_account_id, access_token_encrypted, refresh_token_encrypted, token_expires_at, scopes, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
        email_address = VALUES(email_address),
        provider_account_id = VALUES(provider_account_id),
        access_token_encrypted = VALUES(access_token_encrypted),
        refresh_token_encrypted = VALUES(refresh_token_encrypted),
        token_expires_at = VALUES(token_expires_at),
        scopes = VALUES(scopes),
        status = VALUES(status),
        updated_at = CURRENT_TIMESTAMP`,
      [
        conn.id,
        conn.user_id,
        conn.organization_id,
        conn.provider || "google",
        conn.email_address,
        conn.provider_account_id || null,
        conn.access_token_encrypted || null,
        conn.refresh_token_encrypted || null,
        conn.token_expires_at || null,
        conn.scopes || null,
        conn.status,
      ]
    );
  }

  /**
   * Connects a mock Gmail account (for testing, development, and UI demonstration).
   */
  public async connectMockAccount(
    userId: string,
    organizationId: string,
    emailAddress: string = "user@example.com"
  ): Promise<GmailConnection> {
    const connectionId = `gconn_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const mockAccessToken = `mock_access_token_${Date.now()}`;
    const mockRefreshToken = `mock_refresh_token_${Date.now()}`;

    const conn: GmailConnection = {
      id: connectionId,
      user_id: userId,
      organization_id: organizationId,
      provider: "google",
      email_address: emailAddress,
      provider_account_id: `google_${Date.now()}`,
      access_token_encrypted: encryptSecret(mockAccessToken),
      refresh_token_encrypted: encryptSecret(mockRefreshToken),
      token_expires_at: new Date(Date.now() + 3600 * 1000),
      scopes: "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.compose",
      status: "CONNECTED",
    };

    await this.saveConnection(conn);

    await this.logAuditEvent({
      userId,
      organizationId,
      eventType: "GMAIL_CONNECTED",
      action: "connect",
      details: { emailAddress, provider: "google", mode: "mock" },
    });

    return conn;
  }

  /**
   * Disconnects the user's Gmail integration.
   */
  public async disconnect(userId: string, organizationId: string): Promise<void> {
    const conn = await this.getConnection(userId, organizationId);
    if (!conn) {
      return;
    }

    await pool.query(
      `UPDATE gmail_connections 
       SET status = 'DISCONNECTED', access_token_encrypted = NULL, refresh_token_encrypted = NULL 
       WHERE user_id = ? AND organization_id = ?`,
      [userId, organizationId]
    );

    await this.logAuditEvent({
      userId,
      organizationId,
      eventType: "GMAIL_DISCONNECTED",
      action: "disconnect",
      details: { emailAddress: conn.email_address },
    });
  }

  // ---------------------------------------------------------------------------
  // OAuth 2.0 State Security (Anti-CSRF)
  // ---------------------------------------------------------------------------

  /**
   * Generates a tamper-proof HMAC signed OAuth state parameter.
   * Format: userId:orgId:timestamp:signature
   */
  public generateOAuthState(userId: string, organizationId: string): string {
    const timestamp = Date.now().toString();
    const data = `${userId}:${organizationId}:${timestamp}`;
    const secret = process.env.JWT_SECRET || "ai-workforce-oauth-state-secret-2026";
    const sig = crypto.createHmac("sha256", secret).update(data).digest("hex");
    return Buffer.from(`${data}:${sig}`).toString("base64url");
  }

  /**
   * Verifies the authenticity and freshness (15-minute TTL) of the OAuth state.
   */
  public verifyOAuthState(
    state: string,
    expectedUserId: string,
    expectedOrganizationId: string
  ): boolean {
    try {
      const decoded = Buffer.from(state, "base64url").toString("utf8");
      const parts = decoded.split(":");
      if (parts.length !== 4) return false;

      const [userId, orgId, timestampStr, providedSig] = parts;
      if (userId !== expectedUserId || orgId !== expectedOrganizationId) {
        return false;
      }

      const timestamp = parseInt(timestampStr, 10);
      if (isNaN(timestamp) || Date.now() - timestamp > 15 * 60 * 1000) {
        // Expired (>15 minutes)
        return false;
      }

      const data = `${userId}:${orgId}:${timestampStr}`;
      const secret = process.env.JWT_SECRET || "ai-workforce-oauth-state-secret-2026";
      const expectedSig = crypto.createHmac("sha256", secret).update(data).digest("hex");

      return crypto.timingSafeEqual(
        Buffer.from(providedSig, "hex"),
        Buffer.from(expectedSig, "hex")
      );
    } catch {
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // Governed Tool Operations (Read-Only & Controlled Draft)
  // ---------------------------------------------------------------------------

  private async getDecryptedToken(userId: string, organizationId: string): Promise<string> {
    const conn = await this.ensureConnected(userId, organizationId);
    if (!conn.access_token_encrypted) {
      throw new GmailError("Gmail access token missing or corrupted.", "GMAIL_AUTH_ERROR");
    }
    return decryptSecret(conn.access_token_encrypted);
  }

  public async getProfile(context: ToolContext): Promise<GmailProfile> {
    const orgId = context.organizationId || "org-demo-001";
    const token = await this.getDecryptedToken(context.userId, orgId);
    return await this.provider.getProfile(token);
  }

  public async searchMessages(
    query: string,
    maxResults: number = GMAIL_BOUNDS.DEFAULT_SEARCH_RESULTS,
    context: ToolContext
  ): Promise<GmailMessageSummary[]> {
    const orgId = context.organizationId || "org-demo-001";
    const token = await this.getDecryptedToken(context.userId, orgId);

    const summaries = await this.provider.searchMessages(token, query, maxResults);

    await this.logAuditEvent({
      userId: context.userId,
      organizationId: orgId,
      taskId: context.taskId,
      eventType: "GMAIL_SEARCH",
      action: "search",
      details: { query, resultsCount: summaries.length },
    });

    return summaries;
  }

  public async getMessage(
    messageId: string,
    context: ToolContext
  ): Promise<GmailMessageDetail> {
    const orgId = context.organizationId || "org-demo-001";
    const token = await this.getDecryptedToken(context.userId, orgId);

    const detail = await this.provider.getMessage(token, messageId);

    await this.logAuditEvent({
      userId: context.userId,
      organizationId: orgId,
      taskId: context.taskId,
      eventType: "GMAIL_MESSAGE_READ",
      action: "read",
      details: { messageId: detail.messageId, subject: detail.subject },
    });

    return detail;
  }

  public async createDraft(
    draft: GmailDraftInput,
    context: ToolContext
  ): Promise<GmailDraftResult> {
    const orgId = context.organizationId || "org-demo-001";
    const token = await this.getDecryptedToken(context.userId, orgId);

    // Validate inputs
    if (!draft.to || draft.to.length === 0) {
      throw new GmailError("Recipient email is required to create a draft.", "GMAIL_INVALID_REQUEST");
    }
    if (!draft.subject || draft.subject.trim().length === 0) {
      throw new GmailError("Subject is required to create a draft.", "GMAIL_INVALID_REQUEST");
    }

    const result = await this.provider.createDraft(token, draft);

    await this.logAuditEvent({
      userId: context.userId,
      organizationId: orgId,
      taskId: context.taskId,
      eventType: "GMAIL_DRAFT_CREATED",
      action: "draft",
      details: { draftId: result.draftId, to: draft.to, subject: draft.subject },
    });

    return result;
  }

  // ---------------------------------------------------------------------------
  // External Side Effect & Human Approval Staging (Phase 16 -> Phase 17)
  // ---------------------------------------------------------------------------

  /**
   * Handles `gmail_send` proposals.
   * Strictly blocks autonomous external delivery under Phase 16 safety invariants,
   * stages the payload into `approvals` with status PENDING, logs the event,
   * and prepares the handoff for Phase 17 Human Approval.
   */
  public async stageSendForApproval(
    send: GmailSendInput,
    context: ToolContext
  ): Promise<GmailSendResult> {
    const orgId = context.organizationId || "org-demo-001";

    // 1. Verify connection exists
    await this.ensureConnected(context.userId, orgId);

    // 2. Validate parameters
    if (!send.to || send.to.length === 0) {
      throw new GmailError("Recipient email address is required.", "GMAIL_INVALID_REQUEST");
    }
    if (!send.subject || send.subject.trim().length === 0) {
      throw new GmailError("Email subject is required.", "GMAIL_INVALID_REQUEST");
    }

    const approvalId = `appr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const payloadPreview = {
      action: "gmail_send",
      riskLevel: "EXTERNAL_SIDE_EFFECT",
      to: send.to,
      subject: send.subject,
      bodyPreview: send.body.slice(0, 500),
      reason: send.reason || "Autonomous agent requested external email transmission.",
      userId: context.userId,
      organizationId: orgId,
      taskId: context.taskId,
    };

    // 3. Stage into approvals table
    await pool.query(
      `INSERT INTO approvals 
        (id, task_id, action_type, payload_preview, status)
       VALUES (?, ?, ?, ?, 'PENDING')`,
      [approvalId, context.taskId, "gmail_send", JSON.stringify(payloadPreview)]
    );

    // 4. Audit logging
    await this.logAuditEvent({
      userId: context.userId,
      organizationId: orgId,
      taskId: context.taskId,
      eventType: "GMAIL_SEND_REQUESTED",
      action: "send_requested",
      details: { approvalId, to: send.to, subject: send.subject },
    });

    await this.logAuditEvent({
      userId: context.userId,
      organizationId: orgId,
      taskId: context.taskId,
      eventType: "GMAIL_SEND_BLOCKED",
      action: "send_blocked_pending_approval",
      details: { approvalId, riskLevel: "EXTERNAL_SIDE_EFFECT" },
    });

    // 5. Return explicit approval-required outcome
    return {
      status: "APPROVAL_REQUIRED",
      approvalId,
      reason:
        "External email transmission has been intercepted and staged for Human Approval (Phase 17). No email was sent.",
      details: payloadPreview,
    };
  }

  // ---------------------------------------------------------------------------
  // Internal Helpers
  // ---------------------------------------------------------------------------

  private async logAuditEvent(event: {
    userId?: string;
    organizationId: string;
    taskId?: string;
    eventType: string;
    action: string;
    details: Record<string, unknown>;
  }): Promise<void> {
    const auditId = `aud_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
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
      console.error("[GmailService] Failed to record audit log:", err);
    }
  }
}

export const gmailService = new GmailService();
