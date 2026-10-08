import { ToolRegistry } from "../tools/registry";
import { OrganizationService } from "./organizationService";
import { UsageService } from "./usageService";
import { ROLE_PERMISSIONS } from "./types";
import { EnterpriseAuditService } from "./auditService";

export interface PolicyEvaluationRequest {
  organizationId: string;
  userId: string;
  toolName: string;
  toolInput?: Record<string, unknown>;
  estimatedCostUsd?: number;
}

export type PolicyDecision = "ALLOW" | "REQUIRE_APPROVAL" | "DENY";

export type GovernanceLayer =
  | "PLATFORM_SAFETY"
  | "ORGANIZATION_STATUS"
  | "USER_STATUS"
  | "USER_PERMISSION"
  | "ORGANIZATION_POLICY"
  | "BUDGET_LIMIT"
  | "TOOL_RISK"
  | "EXECUTION";

export interface PolicyEvaluationResult {
  decision: PolicyDecision;
  layer: GovernanceLayer;
  allowed: boolean;
  requiresApproval: boolean;
  reason: string;
  details?: Record<string, unknown>;
}

export class EnterprisePolicyEngine {
  private static registry = new ToolRegistry();

  /**
   * Deterministic 7-layer Precedence Governance Evaluator (Sections 3, 10, 34, 35).
   *
   * Precedence Hierarchy:
   * 1. Platform Safety Policy (Hard immutable restrictions; cannot be overridden)
   * 2. Organization Status & Emergency Kill Switch (WORKFORCE_PAUSED)
   * 3. User Lifecycle Status (ACTIVE vs SUSPENDED / DISABLED)
   * 4. User Permission (Role-based tools.execute entitlement)
   * 5. Organization Tool Policy (ENABLED, DISABLED, REQUIRES_APPROVAL)
   * 6. AI Cost Budget Limit (Monthly budget guard)
   * 7. Tool Risk Policy & Human Approval Gate (EXTERNAL_SIDE_EFFECT)
   *
   * Rule: Lower-level rules NEVER weaken higher-level safety rules.
   * The LLM NEVER sets or alters policy.
   */
  public static async evaluateToolExecution(
    request: PolicyEvaluationRequest
  ): Promise<PolicyEvaluationResult> {
    const { organizationId, userId, toolName, estimatedCostUsd = 0.005 } = request;

    // -------------------------------------------------------------------------
    // Layer 1: Platform Safety Policy
    // -------------------------------------------------------------------------
    // Normalize camelCase to snake_case if necessary
    const normalizedName = toolName.includes("_")
      ? toolName
      : toolName.replace(/([A-Z])/g, "_$1").toLowerCase();

    const tool = this.registry.getTool(toolName) || this.registry.getTool(normalizedName);
    if (!tool) {
      await EnterpriseAuditService.recordEvent({
        organizationId,
        userId,
        eventType: "POLICY_VIOLATION",
        action: `Blocked unregistered/unauthorized tool: ${toolName}`,
        details: { toolName, layer: "PLATFORM_SAFETY" },
      });

      return {
        decision: "DENY",
        layer: "PLATFORM_SAFETY",
        allowed: false,
        requiresApproval: false,
        reason: `Tool '${toolName}' is not registered in the platform tool registry.`,
      };
    }

    // Platform hard rule: Certain dangerous capabilities permanently require approval
    // Organization policy CANNOT relax this requirement (Section 35)
    let platformMandatesApproval = false;
    if (
      tool.name === "gmail_send" ||
      toolName === "gmailSend" ||
      toolName === "gmail_send" ||
      tool.riskLevel === "EXTERNAL_SIDE_EFFECT"
    ) {
      platformMandatesApproval = true;
    }

    // -------------------------------------------------------------------------
    // Layer 2: Organization Status & Emergency Kill Switch
    // -------------------------------------------------------------------------
    const org = await OrganizationService.getOrganization(organizationId);
    if (!org) {
      return {
        decision: "DENY",
        layer: "ORGANIZATION_STATUS",
        allowed: false,
        requiresApproval: false,
        reason: `Organization '${organizationId}' does not exist.`,
      };
    }

    if (org.status !== "ACTIVE") {
      return {
        decision: "DENY",
        layer: "ORGANIZATION_STATUS",
        allowed: false,
        requiresApproval: false,
        reason: `Organization is currently ${org.status}. Task execution blocked.`,
      };
    }

    if (org.workforcePaused) {
      return {
        decision: "DENY",
        layer: "ORGANIZATION_STATUS",
        allowed: false,
        requiresApproval: false,
        reason: "Emergency kill switch is active (WORKFORCE_PAUSED). All autonomous tool actions are paused.",
      };
    }

    // -------------------------------------------------------------------------
    // Layer 3: User Lifecycle Status
    // -------------------------------------------------------------------------
    const user = await OrganizationService.getUser(userId);
    if (!user || user.organizationId !== organizationId) {
      return {
        decision: "DENY",
        layer: "USER_STATUS",
        allowed: false,
        requiresApproval: false,
        reason: "User account does not belong to the active organization.",
      };
    }

    if (user.status !== "ACTIVE") {
      return {
        decision: "DENY",
        layer: "USER_STATUS",
        allowed: false,
        requiresApproval: false,
        reason: `User account is ${user.status}. Execution blocked.`,
      };
    }

    // -------------------------------------------------------------------------
    // Layer 4: User Permission
    // -------------------------------------------------------------------------
    const permissions = ROLE_PERMISSIONS[user.role] || [];
    if (!permissions.includes("tools.execute")) {
      return {
        decision: "DENY",
        layer: "USER_PERMISSION",
        allowed: false,
        requiresApproval: false,
        reason: `User role '${user.role}' lacks 'tools.execute' permission.`,
      };
    }

    // -------------------------------------------------------------------------
    // Layer 5: Organization Tool Policy
    // -------------------------------------------------------------------------
    const orgToolPolicy =
      (await OrganizationService.getToolPolicy(organizationId, toolName)) ||
      (await OrganizationService.getToolPolicy(organizationId, normalizedName)) ||
      (await OrganizationService.getToolPolicy(organizationId, tool.name));
    let orgRequiresApproval = false;

    if (orgToolPolicy) {
      if (orgToolPolicy.state === "DISABLED") {
        return {
          decision: "DENY",
          layer: "ORGANIZATION_POLICY",
          allowed: false,
          requiresApproval: false,
          reason: `Tool '${toolName}' is explicitly disabled by organization policy.`,
        };
      }
      if (orgToolPolicy.state === "REQUIRES_APPROVAL") {
        orgRequiresApproval = true;
      }
    }

    // -------------------------------------------------------------------------
    // Layer 6: AI Cost Budget Limit
    // -------------------------------------------------------------------------
    const budgetCheck = await UsageService.checkBudgetAvailable(organizationId, estimatedCostUsd);
    if (!budgetCheck.allowed) {
      return {
        decision: "DENY",
        layer: "BUDGET_LIMIT",
        allowed: false,
        requiresApproval: false,
        reason: `Organization monthly AI budget limit reached ($${budgetCheck.currentSpendUsd.toFixed(2)} / $${budgetCheck.budgetUsd.toFixed(2)}).`,
      };
    }

    // -------------------------------------------------------------------------
    // Layer 7: Tool Risk Policy & Human Approval Gate
    // -------------------------------------------------------------------------
    const toolRequiresApproval =
      tool.riskLevel === "EXTERNAL_SIDE_EFFECT" ||
      platformMandatesApproval ||
      orgRequiresApproval;

    if (toolRequiresApproval) {
      return {
        decision: "REQUIRE_APPROVAL",
        layer: "TOOL_RISK",
        allowed: false,
        requiresApproval: true,
        reason: platformMandatesApproval
          ? "Platform safety policy requires human approval for external side-effect actions (Gmail send)."
          : orgRequiresApproval
          ? `Organization policy requires human approval for '${toolName}'.`
          : `Tool risk classification '${tool.riskLevel}' requires human approval.`,
        details: {
          platformMandated: platformMandatesApproval,
          orgMandated: orgRequiresApproval,
          riskLevel: tool.riskLevel,
        },
      };
    }

    // All 7 layers satisfied
    return {
      decision: "ALLOW",
      layer: "EXECUTION",
      allowed: true,
      requiresApproval: false,
      reason: `Tool '${toolName}' authorized for direct execution.`,
    };
  }
}
