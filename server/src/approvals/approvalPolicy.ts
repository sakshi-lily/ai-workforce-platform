/**
 * AI Workforce Platform — Phase 17: Approval Policy Engine
 *
 * Centralized governance answering whether an action requires human approval.
 * Decoupled from individual tool implementations.
 */

export class ApprovalPolicyEngine {
  private static readonly ALWAYS_REQUIRE_APPROVAL_TOOLS = new Set<string>([
    "gmail_send",
    "slack_send_message",
    "crm_update_customer",
    "invoice_create",
    "database_mutation",
  ]);

  /**
   * Determines whether an action proposal requires formal Human Approval.
   */
  public static requiresApproval(
    toolName: string,
    riskLevel: string,
    _context?: Record<string, unknown>
  ): boolean {
    // 1. All EXTERNAL_SIDE_EFFECT actions strictly require human approval
    if (riskLevel === "EXTERNAL_SIDE_EFFECT") {
      return true;
    }

    // 2. Explicit sensitive tool designations
    if (this.ALWAYS_REQUIRE_APPROVAL_TOOLS.has(toolName)) {
      return true;
    }

    // 3. READ_ONLY and LOW_RISK tools execute autonomously within policy
    return false;
  }

  /**
   * Evaluates self-approval policy.
   * Documented policy: In Phase 17, the authenticated requester is permitted
   * to approve their own proposed action if authorized within their organization.
   */
  public static isSelfApprovalAllowed(
    _actionType: string,
    _userRole: string
  ): boolean {
    return true;
  }
}
