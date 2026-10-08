export type EnterpriseRole = "OWNER" | "ADMIN" | "MEMBER" | "OPERATOR";

export type UserStatus = "ACTIVE" | "INVITED" | "SUSPENDED" | "DISABLED";

export type OrganizationStatus = "ACTIVE" | "SUSPENDED" | "DISABLED";

export type ToolPolicyState = "ENABLED" | "DISABLED" | "REQUIRES_APPROVAL";

export type Permission =
  | "organization.read"
  | "organization.update"
  | "users.read"
  | "users.invite"
  | "users.update"
  | "users.disable"
  | "tasks.read"
  | "tasks.create"
  | "tasks.cancel"
  | "tools.read"
  | "tools.execute"
  | "tools.configure"
  | "approvals.read"
  | "approvals.approve"
  | "integrations.read"
  | "integrations.configure"
  | "audit.read"
  | "usage.read";

export const ROLE_PERMISSIONS: Record<EnterpriseRole, Permission[]> = {
  OWNER: [
    "organization.read",
    "organization.update",
    "users.read",
    "users.invite",
    "users.update",
    "users.disable",
    "tasks.read",
    "tasks.create",
    "tasks.cancel",
    "tools.read",
    "tools.execute",
    "tools.configure",
    "approvals.read",
    "approvals.approve",
    "integrations.read",
    "integrations.configure",
    "audit.read",
    "usage.read",
  ],
  ADMIN: [
    "organization.read",
    "organization.update",
    "users.read",
    "users.invite",
    "users.update",
    "users.disable",
    "tasks.read",
    "tasks.create",
    "tasks.cancel",
    "tools.read",
    "tools.execute",
    "tools.configure",
    "approvals.read",
    "approvals.approve",
    "integrations.read",
    "integrations.configure",
    "audit.read",
    "usage.read",
  ],
  MEMBER: [
    "organization.read",
    "users.read",
    "tasks.read",
    "tasks.create",
    "tasks.cancel",
    "tools.read",
    "tools.execute",
    "approvals.read",
    "integrations.read",
    "usage.read",
  ],
  OPERATOR: [
    "organization.read",
    "tasks.read",
    "tasks.cancel",
    "tools.read",
    "approvals.read",
    "approvals.approve",
    "audit.read",
    "usage.read",
  ],
};

export interface OrganizationSettings {
  id: string;
  name: string;
  description?: string;
  status: OrganizationStatus;
  monthlyBudgetUsd: number;
  currentSpendUsd: number;
  maxTaskDurationSeconds: number;
  maxToolCalls: number;
  maxCycles: number;
  workforcePaused: boolean;
  defaultTimezone: string;
  createdAt: string;
  updatedAt: string;
}

export interface OrganizationToolPolicy {
  toolName: string;
  state: ToolPolicyState;
  updatedBy: string;
  updatedAt: string;
}

export interface OrganizationUser {
  id: string;
  email: string;
  fullName: string;
  role: EnterpriseRole;
  status: UserStatus;
  organizationId: string;
  lastLoginAt?: string;
  createdAt: string;
}

export interface UserInvitation {
  id: string;
  email: string;
  organizationId: string;
  role: EnterpriseRole;
  token: string;
  invitedBy: string;
  expiresAt: string;
  acceptedAt?: string;
  status: "PENDING" | "ACCEPTED" | "EXPIRED" | "REVOKED";
  createdAt: string;
}

export interface AuditEventRecord {
  id: string;
  organizationId: string;
  userId?: string;
  eventType: string;
  action: string;
  details: Record<string, unknown>;
  ipAddress?: string;
  timestamp: string;
}

export interface IntegrationSummary {
  name: string;
  provider: string;
  status: "CONNECTED" | "NOT_CONFIGURED" | "EXPIRED" | "ERROR";
  connectedAt?: string;
  lastUsedAt?: string;
  scopes?: string[];
  safeMetadata: Record<string, unknown>;
}
