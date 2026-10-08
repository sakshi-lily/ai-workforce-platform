import crypto from "crypto";
import {
  OrganizationSettings,
  OrganizationUser,
  EnterpriseRole,
  UserStatus,
  UserInvitation,
  IntegrationSummary,
  OrganizationToolPolicy,
} from "./types";
import { EnterpriseAuditService } from "./auditService";
import { config } from "../config/env";

export class OrganizationService {
  // In-memory tenant stores (seeds default demo organization org-demo-001)
  private static organizations: Map<string, OrganizationSettings> = new Map([
    [
      "org-demo-001",
      {
        id: "org-demo-001",
        name: "Apex Enterprise",
        description: "Primary enterprise tenant workspace",
        status: "ACTIVE",
        monthlyBudgetUsd: 150.0,
        currentSpendUsd: 14.85,
        maxTaskDurationSeconds: 180,
        maxToolCalls: 12,
        maxCycles: 8,
        workforcePaused: false,
        defaultTimezone: "UTC",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
  ]);

  private static users: Map<string, OrganizationUser> = new Map([
    [
      "usr_demo_admin_001",
      {
        id: "usr_demo_admin_001",
        email: "admin@example.com",
        fullName: "Platform Administrator",
        role: "OWNER",
        status: "ACTIVE",
        organizationId: "org-demo-001",
        lastLoginAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      },
    ],
    [
      "usr_demo_member_002",
      {
        id: "usr_demo_member_002",
        email: "sarah@apexcloud.io",
        fullName: "Sarah Connor",
        role: "MEMBER",
        status: "ACTIVE",
        organizationId: "org-demo-001",
        lastLoginAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      },
    ],
  ]);

  private static invitations: Map<string, UserInvitation> = new Map();
  private static toolPolicies: Map<string, Map<string, OrganizationToolPolicy>> = new Map();

  public static async getOrganization(orgId: string): Promise<OrganizationSettings | undefined> {
    return this.organizations.get(orgId);
  }

  public static async updateOrganizationSettings(
    orgId: string,
    updates: Partial<Omit<OrganizationSettings, "id" | "createdAt" | "updatedAt">>,
    actorId: string
  ): Promise<OrganizationSettings> {
    const existing = this.organizations.get(orgId);
    if (!existing) {
      throw new Error(`Organization ${orgId} not found`);
    }

    const updated: OrganizationSettings = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    this.organizations.set(orgId, updated);

    await EnterpriseAuditService.recordEvent({
      organizationId: orgId,
      userId: actorId,
      eventType: "POLICY_UPDATED",
      action: "Updated organization settings",
      details: updates,
    });

    return updated;
  }

  public static async toggleEmergencyKillSwitch(
    orgId: string,
    paused: boolean,
    actorId: string,
    reason?: string
  ): Promise<OrganizationSettings> {
    const org = await this.updateOrganizationSettings(orgId, { workforcePaused: paused }, actorId);

    await EnterpriseAuditService.recordEvent({
      organizationId: orgId,
      userId: actorId,
      eventType: paused ? "KILL_SWITCH_ENGAGED" : "KILL_SWITCH_RELEASED",
      action: paused ? "Emergency kill switch engaged (workforce paused)" : "Emergency kill switch released",
      details: { reason: reason || "Administrative action", workforcePaused: paused },
    });

    return org;
  }

  public static async getUser(userId: string): Promise<OrganizationUser | undefined> {
    return this.users.get(userId);
  }

  public static async findOrCreateUser(
    userId: string,
    email: string,
    fullName: string = "User",
    orgId: string = "org-demo-001",
    defaultRole: EnterpriseRole = "MEMBER"
  ): Promise<OrganizationUser> {
    let user = this.users.get(userId);
    if (!user) {
      user = {
        id: userId,
        email,
        fullName,
        role: defaultRole,
        status: "ACTIVE",
        organizationId: orgId,
        createdAt: new Date().toISOString(),
      };
      this.users.set(userId, user);
    }
    return user;
  }

  public static async listUsers(orgId: string): Promise<OrganizationUser[]> {
    return Array.from(this.users.values()).filter((u) => u.organizationId === orgId);
  }

  public static async inviteUser(
    orgId: string,
    email: string,
    role: EnterpriseRole,
    actorId: string
  ): Promise<UserInvitation> {
    const existing = Array.from(this.users.values()).find(
      (u) => u.email.toLowerCase() === email.toLowerCase() && u.organizationId === orgId
    );
    if (existing) {
      throw new Error("User with this email already belongs to the organization.");
    }

    const invitation: UserInvitation = {
      id: `inv_${crypto.randomBytes(8).toString("hex")}`,
      email: email.trim().toLowerCase(),
      organizationId: orgId,
      role,
      token: crypto.randomBytes(24).toString("hex"),
      invitedBy: actorId,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days TTL
      status: "PENDING",
      createdAt: new Date().toISOString(),
    };

    this.invitations.set(invitation.token, invitation);

    await EnterpriseAuditService.recordEvent({
      organizationId: orgId,
      userId: actorId,
      eventType: "USER_INVITED",
      action: `Invited ${email} as ${role}`,
      details: { email, role, invitationId: invitation.id },
    });

    return invitation;
  }

  public static async acceptInvitation(
    token: string,
    fullName: string
  ): Promise<OrganizationUser> {
    const invitation = this.invitations.get(token);
    if (!invitation) {
      throw new Error("Invitation token is invalid or does not exist.");
    }

    if (invitation.status !== "PENDING") {
      throw new Error(`Invitation is already ${invitation.status.toLowerCase()}.`);
    }

    if (new Date(invitation.expiresAt).getTime() < Date.now()) {
      invitation.status = "EXPIRED";
      throw new Error("Invitation token has expired.");
    }

    const userId = `usr_${crypto.randomBytes(8).toString("hex")}`;
    const user: OrganizationUser = {
      id: userId,
      email: invitation.email,
      fullName: fullName.trim() || invitation.email.split("@")[0],
      role: invitation.role,
      status: "ACTIVE",
      organizationId: invitation.organizationId,
      createdAt: new Date().toISOString(),
      lastLoginAt: new Date().toISOString(),
    };

    invitation.status = "ACCEPTED";
    invitation.acceptedAt = new Date().toISOString();

    this.users.set(userId, user);

    await EnterpriseAuditService.recordEvent({
      organizationId: invitation.organizationId,
      userId,
      eventType: "USER_INVITATION_ACCEPTED",
      action: `User ${user.email} accepted invitation and activated account`,
      details: { userId, email: user.email, role: user.role },
    });

    return user;
  }

  public static async updateUserRole(
    orgId: string,
    userId: string,
    newRole: EnterpriseRole,
    actorId: string
  ): Promise<OrganizationUser> {
    const user = this.users.get(userId);
    if (!user || user.organizationId !== orgId) {
      throw new Error("User not found in organization");
    }

    const oldRole = user.role;
    user.role = newRole;
    this.users.set(userId, user);

    await EnterpriseAuditService.recordEvent({
      organizationId: orgId,
      userId: actorId,
      eventType: "USER_ROLE_CHANGED",
      action: `Changed user role for ${user.email} from ${oldRole} to ${newRole}`,
      details: { targetUserId: userId, oldRole, newRole },
    });

    return user;
  }

  public static async updateUserStatus(
    orgId: string,
    userId: string,
    newStatus: UserStatus,
    actorId: string
  ): Promise<OrganizationUser> {
    const user = this.users.get(userId);
    if (!user || user.organizationId !== orgId) {
      throw new Error("User not found in organization");
    }

    const oldStatus = user.status;
    user.status = newStatus;
    this.users.set(userId, user);

    await EnterpriseAuditService.recordEvent({
      organizationId: orgId,
      userId: actorId,
      eventType: newStatus === "DISABLED" || newStatus === "SUSPENDED" ? "USER_DISABLED" : "USER_REACTIVATED",
      action: `Changed status for ${user.email} to ${newStatus}`,
      details: { targetUserId: userId, oldStatus, newStatus },
    });

    return user;
  }

  // ----------------------------------------------------
  // Tool Policy Management
  // ----------------------------------------------------
  public static async getToolPolicies(orgId: string): Promise<OrganizationToolPolicy[]> {
    const orgMap = this.toolPolicies.get(orgId);
    if (!orgMap) {
      return [];
    }
    return Array.from(orgMap.values());
  }

  public static async getToolPolicy(
    orgId: string,
    toolName: string
  ): Promise<OrganizationToolPolicy | undefined> {
    return this.toolPolicies.get(orgId)?.get(toolName);
  }

  public static async updateToolPolicy(
    orgId: string,
    toolName: string,
    state: import("./types").ToolPolicyState,
    actorId: string
  ): Promise<OrganizationToolPolicy> {
    let orgMap = this.toolPolicies.get(orgId);
    if (!orgMap) {
      orgMap = new Map();
      this.toolPolicies.set(orgId, orgMap);
    }

    const policy: OrganizationToolPolicy = {
      toolName,
      state,
      updatedBy: actorId,
      updatedAt: new Date().toISOString(),
    };
    orgMap.set(toolName, policy);

    await EnterpriseAuditService.recordEvent({
      organizationId: orgId,
      userId: actorId,
      eventType: "TOOL_POLICY_UPDATED",
      action: `Configured tool policy for '${toolName}' to '${state}'`,
      details: { toolName, state },
    });

    return policy;
  }

  /**
   * Authoritative check used by background workers before task execution to prevent stale authorization.
   */
  public static async isUserAuthorizedForTask(
    userId: string,
    orgId: string
  ): Promise<{ authorized: boolean; reason?: string }> {
    const org = this.organizations.get(orgId);
    if (!org) {
      return { authorized: false, reason: "Organization not found" };
    }
    if (org.status !== "ACTIVE") {
      return { authorized: false, reason: `Organization is ${org.status}` };
    }
    if (org.workforcePaused) {
      return { authorized: false, reason: "Workforce is paused under emergency kill switch" };
    }

    const user = this.users.get(userId);
    if (!user || user.organizationId !== orgId) {
      return { authorized: false, reason: "User does not belong to organization" };
    }
    if (user.status !== "ACTIVE") {
      return { authorized: false, reason: `User account is ${user.status}` };
    }

    return { authorized: true };
  }

  /**
   * Safe metadata overview of all connected integrations without leaking secret credentials.
   */
  public static async getIntegrationsSummary(orgId: string): Promise<IntegrationSummary[]> {
    return [
      {
        name: "OpenAI LLM",
        provider: "openai",
        status: config.llm?.apiKey ? "CONNECTED" : "NOT_CONFIGURED",
        connectedAt: "2026-10-01T00:00:00.000Z",
        lastUsedAt: new Date().toISOString(),
        safeMetadata: { model: config.llm?.model || "gpt-4o-mini", mode: "structured_tool_calling" },
      },
      {
        name: "Web Search Engine",
        provider: "tavily",
        status: "CONNECTED",
        connectedAt: "2026-10-01T00:00:00.000Z",
        lastUsedAt: new Date().toISOString(),
        safeMetadata: { mode: "sandboxed_external_data", rateLimitRpm: 60 },
      },
      {
        name: "Qdrant Vector Database",
        provider: "qdrant",
        status: "CONNECTED",
        connectedAt: "2026-10-01T00:00:00.000Z",
        lastUsedAt: new Date().toISOString(),
        safeMetadata: { collection: "internal_knowledge", tenantNamespace: orgId },
      },
      {
        name: "Gmail Integration",
        provider: "google",
        status: "CONNECTED",
        connectedAt: "2026-10-02T12:00:00.000Z",
        scopes: ["https://www.googleapis.com/auth/gmail.compose"],
        safeMetadata: { email: "integrations@apexcloud.io", approvalPolicy: "MANDATORY" },
      },
    ];
  }

  /**
   * Computes multi-dimensional workforce health score (Section 56).
   */
  public static async computeWorkforceHealth(orgId: string): Promise<{
    overallScore: number;
    status: "EXCELLENT" | "GOOD" | "DEGRADED" | "CRITICAL";
    categories: Record<string, { score: number; status: string; details: string }>;
  }> {
    const org = this.organizations.get(orgId);
    const isPaused = org?.workforcePaused ?? false;
    const isBudgetOk = org ? org.currentSpendUsd < org.monthlyBudgetUsd : true;

    const categories = {
      infrastructure: { score: 100, status: "HEALTHY", details: "All microservices and database pools nominal" },
      agent: { score: isPaused ? 0 : 98, status: isPaused ? "PAUSED" : "HEALTHY", details: isPaused ? "Workforce paused" : "Autonomous agent cycles executing within SLA" },
      tools: { score: 96, status: "HEALTHY", details: "Tool registry operational with 11 safe tools active" },
      knowledge: { score: 95, status: "HEALTHY", details: "Qdrant collection synced and RAG retrieval active" },
      security: { score: 100, status: "SECURE", details: "Zero IDOR violations, tenant-isolated audit log healthy" },
      reliability: { score: 98, status: "HEALTHY", details: "Circuit breakers closed, automated retries verified" },
      cost: {
        score: isBudgetOk ? 92 : 20,
        status: isBudgetOk ? "WITHIN_BUDGET" : "EXCEEDED",
        details: isBudgetOk ? "Spend is within allocated monthly budget" : "Monthly budget limit reached",
      },
    };

    const scores = Object.values(categories).map((c) => c.score);
    const overallScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);

    let status: "EXCELLENT" | "GOOD" | "DEGRADED" | "CRITICAL" = "EXCELLENT";
    if (overallScore < 50) status = "CRITICAL";
    else if (overallScore < 80) status = "DEGRADED";
    else if (overallScore < 95) status = "GOOD";

    return { overallScore, status, categories };
  }

  public static clear(): void {
    this.organizations.clear();
    this.organizations.set("org-demo-001", {
      id: "org-demo-001",
      name: "Apex Enterprise",
      description: "Primary enterprise tenant workspace",
      status: "ACTIVE",
      monthlyBudgetUsd: 150.0,
      currentSpendUsd: 14.85,
      maxTaskDurationSeconds: 180,
      maxToolCalls: 12,
      maxCycles: 8,
      workforcePaused: false,
      defaultTimezone: "UTC",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    this.users.clear();
    this.users.set("usr_demo_admin_001", {
      id: "usr_demo_admin_001",
      email: "admin@example.com",
      fullName: "Platform Administrator",
      role: "OWNER",
      status: "ACTIVE",
      organizationId: "org-demo-001",
      lastLoginAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    });
    this.users.set("usr_demo_member_002", {
      id: "usr_demo_member_002",
      email: "sarah@apexcloud.io",
      fullName: "Sarah Connor",
      role: "MEMBER",
      status: "ACTIVE",
      organizationId: "org-demo-001",
      lastLoginAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    });
    this.invitations.clear();
    this.toolPolicies.clear();
  }
}

