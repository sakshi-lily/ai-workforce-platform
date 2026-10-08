import { Router, Request, Response } from "express";
import {
  requireEnterpriseAuth,
  requireEnterprisePermission,
} from "../enterprise/authzMiddleware";
import { OrganizationService } from "../enterprise/organizationService";
import { UsageService } from "../enterprise/usageService";
import { EnterpriseAuditService } from "../enterprise/auditService";
import { EnterprisePolicyEngine } from "../enterprise/policyEngine";
import { ToolRegistry } from "../tools/registry";
import { EnterpriseRole, ToolPolicyState, UserStatus } from "../enterprise/types";

export const adminRouter = Router();

// Apply enterprise authentication to all admin routes by default
adminRouter.use(requireEnterpriseAuth);

// ---------------------------------------------------------------------------
// 1. Organization Settings & Emergency Kill Switch
// ---------------------------------------------------------------------------

adminRouter.get(
  "/settings",
  requireEnterprisePermission("organization.read"),
  async (req: Request, res: Response) => {
    try {
      const org = await OrganizationService.getOrganization(req.organizationId!);
      if (!org) {
        res.status(404).json({ status: "error", message: "Organization not found" });
        return;
      }
      res.json({ status: "success", data: org });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load settings";
      res.status(500).json({ status: "error", message: msg });
    }
  }
);

adminRouter.patch(
  "/settings",
  requireEnterprisePermission("organization.update"),
  async (req: Request, res: Response) => {
    try {
      const {
        name,
        description,
        monthlyBudgetUsd,
        maxTaskDurationSeconds,
        maxToolCalls,
        maxCycles,
        defaultTimezone,
      } = req.body;

      const updates: Record<string, unknown> = {};
      if (typeof name === "string") updates.name = name.trim();
      if (typeof description === "string") updates.description = description.trim();
      if (typeof monthlyBudgetUsd === "number") updates.monthlyBudgetUsd = Math.max(1, monthlyBudgetUsd);
      if (typeof maxTaskDurationSeconds === "number") updates.maxTaskDurationSeconds = Math.min(3600, Math.max(10, maxTaskDurationSeconds));
      if (typeof maxToolCalls === "number") updates.maxToolCalls = Math.min(100, Math.max(1, maxToolCalls));
      if (typeof maxCycles === "number") updates.maxCycles = Math.min(50, Math.max(1, maxCycles));
      if (typeof defaultTimezone === "string") updates.defaultTimezone = defaultTimezone.trim();

      const updated = await OrganizationService.updateOrganizationSettings(
        req.organizationId!,
        updates,
        req.userId!
      );
      res.json({ status: "success", data: updated });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to update settings";
      res.status(400).json({ status: "error", message: msg });
    }
  }
);

adminRouter.post(
  "/emergency-kill-switch",
  requireEnterprisePermission("organization.update"),
  async (req: Request, res: Response) => {
    try {
      const { paused, reason } = req.body;
      if (typeof paused !== "boolean") {
        res.status(400).json({ status: "error", message: "Field 'paused' must be a boolean" });
        return;
      }

      const org = await OrganizationService.toggleEmergencyKillSwitch(
        req.organizationId!,
        paused,
        req.userId!,
        reason
      );
      res.json({
        status: "success",
        data: org,
        message: paused
          ? "Emergency kill switch ENGAGED. Workforce paused."
          : "Emergency kill switch RELEASED. Workforce active.",
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to toggle kill switch";
      res.status(500).json({ status: "error", message: msg });
    }
  }
);

// ---------------------------------------------------------------------------
// 2. User Lifecycle Management
// ---------------------------------------------------------------------------

adminRouter.get(
  "/users",
  requireEnterprisePermission("users.read"),
  async (req: Request, res: Response) => {
    try {
      const users = await OrganizationService.listUsers(req.organizationId!);
      res.json({ status: "success", data: users });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to list users";
      res.status(500).json({ status: "error", message: msg });
    }
  }
);

adminRouter.post(
  "/users/invite",
  requireEnterprisePermission("users.invite"),
  async (req: Request, res: Response) => {
    try {
      const { email, role } = req.body;
      if (!email || typeof email !== "string" || !email.includes("@")) {
        res.status(400).json({ status: "error", message: "Valid email address is required" });
        return;
      }

      const validRoles: EnterpriseRole[] = ["OWNER", "ADMIN", "MEMBER", "OPERATOR"];
      const assignedRole: EnterpriseRole = validRoles.includes(role) ? role : "MEMBER";

      const invitation = await OrganizationService.inviteUser(
        req.organizationId!,
        email,
        assignedRole,
        req.userId!
      );

      res.status(201).json({ status: "success", data: invitation });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to invite user";
      res.status(400).json({ status: "error", message: msg });
    }
  }
);

adminRouter.post("/users/accept-invitation", async (req: Request, res: Response) => {
  try {
    const { token, fullName } = req.body;
    if (!token || typeof token !== "string") {
      res.status(400).json({ status: "error", message: "Invitation token is required" });
      return;
    }

    const user = await OrganizationService.acceptInvitation(token, fullName || "");
    res.json({
      status: "success",
      data: user,
      message: "Invitation accepted. Account activated.",
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to accept invitation";
    res.status(400).json({ status: "error", message: msg });
  }
});

adminRouter.patch(
  "/users/:targetUserId/role",
  requireEnterprisePermission("users.update"),
  async (req: Request, res: Response) => {
    try {
      const { targetUserId } = req.params;
      const { role } = req.body;
      const validRoles: EnterpriseRole[] = ["OWNER", "ADMIN", "MEMBER", "OPERATOR"];

      if (!validRoles.includes(role)) {
        res.status(400).json({ status: "error", message: `Role must be one of: ${validRoles.join(", ")}` });
        return;
      }

      const updated = await OrganizationService.updateUserRole(
        req.organizationId!,
        targetUserId,
        role,
        req.userId!
      );
      res.json({ status: "success", data: updated });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to update user role";
      res.status(400).json({ status: "error", message: msg });
    }
  }
);

adminRouter.patch(
  "/users/:targetUserId/status",
  requireEnterprisePermission("users.disable"),
  async (req: Request, res: Response) => {
    try {
      const { targetUserId } = req.params;
      const { status } = req.body;
      const validStatuses: UserStatus[] = ["ACTIVE", "SUSPENDED", "DISABLED"];

      if (!validStatuses.includes(status)) {
        res.status(400).json({ status: "error", message: `Status must be one of: ${validStatuses.join(", ")}` });
        return;
      }

      // Prevent administrator from accidentally disabling themselves
      if (targetUserId === req.userId && status !== "ACTIVE") {
        res.status(400).json({
          status: "error",
          message: "Administrators cannot suspend or disable their own account.",
        });
        return;
      }

      const updated = await OrganizationService.updateUserStatus(
        req.organizationId!,
        targetUserId,
        status,
        req.userId!
      );
      res.json({ status: "success", data: updated });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to update user status";
      res.status(400).json({ status: "error", message: msg });
    }
  }
);

// ---------------------------------------------------------------------------
// 3. Tool Policy & Governance
// ---------------------------------------------------------------------------

adminRouter.get(
  "/tool-policies",
  requireEnterprisePermission("tools.read"),
  async (req: Request, res: Response) => {
    try {
      const registry = new ToolRegistry();
      const allTools = registry.listTools();
      const configuredPolicies = await OrganizationService.getToolPolicies(req.organizationId!);
      const policyMap = new Map(configuredPolicies.map((p) => [p.toolName, p]));

      const combined = allTools.map((t) => {
        const configured = policyMap.get(t.name);
        const effectiveState: ToolPolicyState =
          configured?.state ||
          (t.name === "gmailSend" ? "REQUIRES_APPROVAL" : "ENABLED");

        return {
          name: t.name,
          description: t.description,
          riskLevel: t.riskLevel,
          state: effectiveState,
          isConfigured: !!configured,
          updatedBy: configured?.updatedBy,
          updatedAt: configured?.updatedAt,
        };
      });

      res.json({ status: "success", data: combined });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load tool policies";
      res.status(500).json({ status: "error", message: msg });
    }
  }
);

adminRouter.put(
  "/tool-policies/:toolName",
  requireEnterprisePermission("tools.configure"),
  async (req: Request, res: Response) => {
    try {
      const { toolName } = req.params;
      const { state } = req.body;
      const validStates: ToolPolicyState[] = ["ENABLED", "DISABLED", "REQUIRES_APPROVAL"];

      if (!validStates.includes(state)) {
        res.status(400).json({ status: "error", message: `State must be one of: ${validStates.join(", ")}` });
        return;
      }

      const updated = await OrganizationService.updateToolPolicy(
        req.organizationId!,
        toolName,
        state,
        req.userId!
      );
      res.json({ status: "success", data: updated });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to update tool policy";
      res.status(400).json({ status: "error", message: msg });
    }
  }
);

adminRouter.post(
  "/evaluate-tool",
  requireEnterprisePermission("tools.read"),
  async (req: Request, res: Response) => {
    try {
      const { toolName, estimatedCostUsd, toolInput } = req.body;
      if (!toolName) {
        res.status(400).json({ status: "error", message: "toolName is required" });
        return;
      }

      const result = await EnterprisePolicyEngine.evaluateToolExecution({
        organizationId: req.organizationId!,
        userId: req.userId!,
        toolName,
        estimatedCostUsd,
        toolInput,
      });

      res.json({ status: "success", data: result });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to evaluate policy";
      res.status(500).json({ status: "error", message: msg });
    }
  }
);

// ---------------------------------------------------------------------------
// 4. Usage & AI Cost Governance
// ---------------------------------------------------------------------------

adminRouter.get(
  "/usage",
  requireEnterprisePermission("usage.read"),
  async (req: Request, res: Response) => {
    try {
      const summary = await UsageService.getOrganizationUsage(req.organizationId!);
      res.json({ status: "success", data: summary });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to get organization usage";
      res.status(500).json({ status: "error", message: msg });
    }
  }
);

adminRouter.get("/usage/me", async (req: Request, res: Response) => {
  try {
    const userUsage = await UsageService.getUserUsage(req.organizationId!, req.userId!);
    res.json({
      status: "success",
      data: userUsage || {
        userId: req.userId,
        totalTasks: 0,
        tokens: 0,
        costUsd: 0,
        toolCalls: 0,
        failureCount: 0,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to get user usage";
    res.status(500).json({ status: "error", message: msg });
  }
});

// ---------------------------------------------------------------------------
// 5. Tenant-Isolated Audit Log Dashboard
// ---------------------------------------------------------------------------

adminRouter.get(
  "/audit",
  requireEnterprisePermission("audit.read"),
  async (req: Request, res: Response) => {
    try {
      const { eventType, userId, search, limit, offset } = req.query;
      const result = await EnterpriseAuditService.getEvents(req.organizationId!, {
        eventType: typeof eventType === "string" ? eventType : undefined,
        userId: typeof userId === "string" ? userId : undefined,
        search: typeof search === "string" ? search : undefined,
        limit: limit ? parseInt(String(limit), 10) : 50,
        offset: offset ? parseInt(String(offset), 10) : 0,
      });

      res.json({ status: "success", data: result.events, total: result.total });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load audit logs";
      res.status(500).json({ status: "error", message: msg });
    }
  }
);

// ---------------------------------------------------------------------------
// 6. Safe Integration Administration (Zero Credential Leakage)
// ---------------------------------------------------------------------------

adminRouter.get(
  "/integrations",
  requireEnterprisePermission("integrations.read"),
  async (req: Request, res: Response) => {
    try {
      const integrations = await OrganizationService.getIntegrationsSummary(req.organizationId!);
      res.json({ status: "success", data: integrations });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load integrations";
      res.status(500).json({ status: "error", message: msg });
    }
  }
);

// ---------------------------------------------------------------------------
// 7. Multi-Dimensional AI Workforce Health
// ---------------------------------------------------------------------------

adminRouter.get(
  "/health",
  requireEnterprisePermission("organization.read"),
  async (req: Request, res: Response) => {
    try {
      const health = await OrganizationService.computeWorkforceHealth(req.organizationId!);
      res.json({ status: "success", data: health });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to compute health score";
      res.status(500).json({ status: "error", message: msg });
    }
  }
);
