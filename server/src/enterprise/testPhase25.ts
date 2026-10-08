import { OrganizationService } from "./organizationService";
import { UsageService } from "./usageService";
import { EnterpriseAuditService } from "./auditService";
import { EnterprisePolicyEngine } from "./policyEngine";
import { ToolRegistry } from "../tools/registry";
import { ROLE_PERMISSIONS, EnterpriseRole } from "./types";

interface TestReport {
  name: string;
  passed: boolean;
  error?: string;
  details?: any;
}

const reports: TestReport[] = [];

function assert(condition: boolean, name: string, errorMsg?: string, details?: any) {
  if (condition) {
    reports.push({ name, passed: true, details });
    console.log(`  [PASS] ${name}`);
  } else {
    reports.push({ name, passed: false, error: errorMsg || "Assertion failed", details });
    console.error(`  [FAIL] ${name} -> ${errorMsg || "Assertion failed"}`);
  }
}

async function runPhase25Tests() {
  console.log("\n=======================================================");
  console.log("  PHASE 25 ENTERPRISE PRODUCTIZATION & GOVERNANCE SUITE ");
  console.log("=======================================================\n");

  OrganizationService.clear();
  UsageService.clear();
  EnterpriseAuditService.clear();

  const orgId = "org-demo-001";
  const adminId = "usr_demo_admin_001";
  const memberId = "usr_demo_member_002";

  // -------------------------------------------------------------------------
  // Milestone 25.1: Organization Administration & Tenant Boundary
  // -------------------------------------------------------------------------
  console.log("\n--- Milestone 25.1: Organization Administration & Tenant Boundary ---");

  const org = await OrganizationService.getOrganization(orgId);
  assert(org !== undefined, "M25.1 - Retrieve default organization settings", "Org not found");
  assert(org?.name === "Apex Enterprise", "M25.1 - Verify organization display name", `Got ${org?.name}`);
  assert(org?.status === "ACTIVE", "M25.1 - Verify default organization status is ACTIVE");
  assert(org?.monthlyBudgetUsd === 150.0, "M25.1 - Verify monthly budget USD ($150.00)");

  const updatedOrg = await OrganizationService.updateOrganizationSettings(
    orgId,
    { monthlyBudgetUsd: 200.0, maxTaskDurationSeconds: 240 },
    adminId
  );
  assert(updatedOrg.monthlyBudgetUsd === 200.0, "M25.1 - Update organization monthly budget limit ($200.00)");
  assert(updatedOrg.maxTaskDurationSeconds === 240, "M25.1 - Update organization max task duration");

  // Restore budget for remaining tests
  await OrganizationService.updateOrganizationSettings(orgId, { monthlyBudgetUsd: 150.0 }, adminId);

  // -------------------------------------------------------------------------
  // Milestone 25.2 & 25.3: Roles & Permissions Matrix
  // -------------------------------------------------------------------------
  console.log("\n--- Milestone 25.2 & 25.3: Roles & Server-Side Permissions Matrix ---");

  const roles: EnterpriseRole[] = ["OWNER", "ADMIN", "MEMBER", "OPERATOR"];
  for (const r of roles) {
    assert(Array.isArray(ROLE_PERMISSIONS[r]), `M25.2 - Role '${r}' is registered in permission matrix`);
  }

  assert(ROLE_PERMISSIONS.OWNER.includes("organization.update"), "M25.3 - OWNER possesses organization.update permission");
  assert(ROLE_PERMISSIONS.ADMIN.includes("users.invite"), "M25.3 - ADMIN possesses users.invite permission");
  assert(ROLE_PERMISSIONS.ADMIN.includes("tools.configure"), "M25.3 - ADMIN possesses tools.configure permission");
  assert(ROLE_PERMISSIONS.MEMBER.includes("tasks.create"), "M25.3 - MEMBER possesses tasks.create permission");
  assert(!ROLE_PERMISSIONS.MEMBER.includes("organization.update"), "M25.3 - MEMBER strictly denied organization.update permission");
  assert(!ROLE_PERMISSIONS.MEMBER.includes("users.invite"), "M25.3 - MEMBER strictly denied users.invite permission");
  assert(!ROLE_PERMISSIONS.MEMBER.includes("tools.configure"), "M25.3 - MEMBER strictly denied tools.configure permission");
  assert(ROLE_PERMISSIONS.OPERATOR.includes("approvals.approve"), "M25.3 - OPERATOR possesses approvals.approve permission");

  // -------------------------------------------------------------------------
  // Milestone 25.4: User Lifecycle Management & Cryptographic Invitations
  // -------------------------------------------------------------------------
  console.log("\n--- Milestone 25.4: User Lifecycle Management & Cryptographic Invitations ---");

  const initialUsers = await OrganizationService.listUsers(orgId);
  assert(initialUsers.length === 2, "M25.4 - Seeded organization contains 2 initial users");

  const invite = await OrganizationService.inviteUser(
    orgId,
    "alice.engineer@apexcloud.io",
    "MEMBER",
    adminId
  );
  assert(invite.id.startsWith("inv_"), "M25.4 - Invitation ID generated with prefix 'inv_'");
  assert(invite.token.length === 48, "M25.4 - Invitation token is cryptographically secure (24 bytes hex = 48 chars)");
  assert(invite.status === "PENDING", "M25.4 - Initial invitation status is PENDING");
  assert(
    new Date(invite.expiresAt).getTime() > Date.now() + 6 * 24 * 60 * 60 * 1000,
    "M25.4 - Invitation expiration is set to 7 days in the future"
  );

  // Prevent duplicate invitations for existing users
  let duplicateThrew = false;
  try {
    await OrganizationService.inviteUser(orgId, "admin@example.com", "MEMBER", adminId);
  } catch {
    duplicateThrew = true;
  }
  assert(duplicateThrew, "M25.4 - Prevent duplicate invitation for already registered email");

  // Accept Invitation Flow
  const acceptedUser = await OrganizationService.acceptInvitation(invite.token, "Alice Engineer");
  assert(acceptedUser.email === "alice.engineer@apexcloud.io", "M25.4 - User successfully activated with matching email");
  assert(acceptedUser.role === "MEMBER", "M25.4 - Activated user retains invited role (MEMBER)");
  assert(acceptedUser.status === "ACTIVE", "M25.4 - Activated user lifecycle status is ACTIVE");

  // Prevent token reuse
  let reuseThrew = false;
  try {
    await OrganizationService.acceptInvitation(invite.token, "Alice Replay");
  } catch {
    reuseThrew = true;
  }
  assert(reuseThrew, "M25.4 - Single-use token cannot be re-used after acceptance");

  // Role transition
  const updatedMember = await OrganizationService.updateUserRole(orgId, acceptedUser.id, "OPERATOR", adminId);
  assert(updatedMember.role === "OPERATOR", "M25.4 - Successfully changed user role to OPERATOR");

  // User suspension & disabling
  const suspendedUser = await OrganizationService.updateUserStatus(orgId, acceptedUser.id, "SUSPENDED", adminId);
  assert(suspendedUser.status === "SUSPENDED", "M25.4 - Successfully transitioned user status to SUSPENDED");

  const disabledUser = await OrganizationService.updateUserStatus(orgId, acceptedUser.id, "DISABLED", adminId);
  assert(disabledUser.status === "DISABLED", "M25.4 - Successfully transitioned user status to DISABLED");

  // Authoritative authorization check rejects disabled user
  const authForDisabled = await OrganizationService.isUserAuthorizedForTask(disabledUser.id, orgId);
  assert(!authForDisabled.authorized, "M25.4 - Disabled user rejected from executing tasks", authForDisabled.reason);
  assert(authForDisabled.reason?.includes("DISABLED") === true, "M25.4 - Authorization failure explicitly cites DISABLED status");

  // -------------------------------------------------------------------------
  // Milestone 25.5: Workforce Policies & Emergency Kill Switch
  // -------------------------------------------------------------------------
  console.log("\n--- Milestone 25.5: Workforce Policies & Emergency Kill Switch ---");

  const killSwitchOn = await OrganizationService.toggleEmergencyKillSwitch(orgId, true, adminId, "Security Incident Drill");
  assert(killSwitchOn.workforcePaused === true, "M25.5 - Emergency kill switch ENGAGED (workforcePaused = true)");

  const workerCheckWhilePaused = await OrganizationService.isUserAuthorizedForTask(memberId, orgId);
  assert(!workerCheckWhilePaused.authorized, "M25.5 - Task execution rejected when emergency kill switch is engaged");
  assert(
    workerCheckWhilePaused.reason?.includes("kill switch") === true,
    "M25.5 - Rejection reason cites emergency kill switch"
  );

  const killSwitchOff = await OrganizationService.toggleEmergencyKillSwitch(orgId, false, adminId, "All Clear");
  assert(killSwitchOff.workforcePaused === false, "M25.5 - Emergency kill switch RELEASED (workforcePaused = false)");

  const workerCheckAfterResume = await OrganizationService.isUserAuthorizedForTask(memberId, orgId);
  assert(workerCheckAfterResume.authorized === true, "M25.5 - Task execution resumes after kill switch release");

  // -------------------------------------------------------------------------
  // Milestone 25.6 & 25.7: Tool Governance & 7-Layer Precedence Policy Engine
  // -------------------------------------------------------------------------
  console.log("\n--- Milestone 25.6 & 25.7: Tool Governance & 7-Layer Policy Precedence ---");

  const registry = new ToolRegistry();
  const allTools = registry.listTools();
  assert(allTools.length >= 11, `M25.6 - Registered tools count >= 11 (found ${allTools.length})`);

  // Configure tool policy: Disable webSearch
  await OrganizationService.updateToolPolicy(orgId, "webSearch", "DISABLED", adminId);
  const toolPolicy = await OrganizationService.getToolPolicy(orgId, "webSearch");
  assert(toolPolicy?.state === "DISABLED", "M25.6 - Configured tool policy for 'webSearch' to DISABLED");

  // 7-Layer Evaluation: Layer 1 - Unregistered tool rejected by Platform Safety
  const evalUnregistered = await EnterprisePolicyEngine.evaluateToolExecution({
    organizationId: orgId,
    userId: memberId,
    toolName: "malicious_root_shell",
  });
  assert(evalUnregistered.decision === "DENY", "M25.7 - Unregistered tool denied by Layer 1 (Platform Safety)");
  assert(evalUnregistered.layer === "PLATFORM_SAFETY", "M25.7 - Decision attributed to PLATFORM_SAFETY layer");

  // 7-Layer Evaluation: Layer 5 - Disabled tool rejected by Org Policy
  const evalDisabledTool = await EnterprisePolicyEngine.evaluateToolExecution({
    organizationId: orgId,
    userId: memberId,
    toolName: "webSearch",
  });
  assert(evalDisabledTool.decision === "DENY", "M25.7 - Disabled tool denied by Layer 5 (Organization Policy)");
  assert(evalDisabledTool.layer === "ORGANIZATION_POLICY", "M25.7 - Decision attributed to ORGANIZATION_POLICY layer");

  // 7-Layer Evaluation: Layer 1 & 7 - Platform Safety mandates approval for gmailSend even if org sets ENABLED
  await OrganizationService.updateToolPolicy(orgId, "gmailSend", "ENABLED", adminId);
  const evalGmailSend = await EnterprisePolicyEngine.evaluateToolExecution({
    organizationId: orgId,
    userId: memberId,
    toolName: "gmailSend",
  });
  assert(
    evalGmailSend.decision === "REQUIRE_APPROVAL",
    "M25.7 - Section 35 Precedence: Platform Safety mandates approval for gmailSend even when org sets ENABLED"
  );
  assert(evalGmailSend.requiresApproval === true, "M25.7 - requiresApproval flag set to true");

  // Re-verify: If Org sets gmailSend to DISABLED, it gets DENIED (org can restrict further, cannot relax safety)
  await OrganizationService.updateToolPolicy(orgId, "gmailSend", "DISABLED", adminId);
  const evalGmailSendDisabled = await EnterprisePolicyEngine.evaluateToolExecution({
    organizationId: orgId,
    userId: memberId,
    toolName: "gmailSend",
  });
  assert(
    evalGmailSendDisabled.decision === "DENY",
    "M25.7 - Section 35 Precedence: Organization DISABLED overrides to DENY"
  );
  assert(evalGmailSendDisabled.layer === "ORGANIZATION_POLICY", "M25.7 - Denied at ORGANIZATION_POLICY layer");

  // Reset tool policies for subsequent tests
  await OrganizationService.updateToolPolicy(orgId, "webSearch", "ENABLED", adminId);
  await OrganizationService.updateToolPolicy(orgId, "gmailSend", "REQUIRES_APPROVAL", adminId);

  // 7-Layer Evaluation: Layer 7 - Allowed safe tool
  const evalCalculate = await EnterprisePolicyEngine.evaluateToolExecution({
    organizationId: orgId,
    userId: memberId,
    toolName: "calculate",
  });
  assert(evalCalculate.decision === "ALLOW", "M25.7 - Safe tool 'calculate' permitted for direct execution");
  assert(evalCalculate.allowed === true, "M25.7 - Allowed flag is true for safe tool");

  // -------------------------------------------------------------------------
  // Milestone 25.8: Usage & AI Cost Governance
  // -------------------------------------------------------------------------
  console.log("\n--- Milestone 25.8: Usage & AI Cost Governance ---");

  // Budget status evaluation
  const budgetNormal = await UsageService.checkBudgetAvailable(orgId, 0.05);
  assert(budgetNormal.allowed === true, "M25.8 - Budget check permits task under NORMAL spend");
  assert(budgetNormal.status === "NORMAL", "M25.8 - Spend status is NORMAL (<75%)");

  // Simulate usage recording
  await UsageService.recordUsage({
    organizationId: orgId,
    userId: memberId,
    userEmail: "sarah@apexcloud.io",
    role: "MEMBER",
    toolCalls: [
      { toolName: "webSearch", success: true, durationMs: 950, costUsd: 0.005 },
      { toolName: "calculate", success: true, durationMs: 50, costUsd: 0.001 },
    ],
    tokens: 4200,
    costUsd: 0.02,
    taskSuccess: true,
  });

  const orgUsage = await UsageService.getOrganizationUsage(orgId);
  assert(orgUsage.totalTasks >= 43, `M25.8 - Organization total tasks tracked (count: ${orgUsage.totalTasks})`);
  assert(orgUsage.users.length >= 2, "M25.8 - User breakdown contains tracked members");
  assert(orgUsage.tools.length >= 4, "M25.8 - Tool telemetry breakdown contains tracked tools");

  // User-level isolation check (Section 24)
  const memberUsage = await UsageService.getUserUsage(orgId, memberId);
  assert(memberUsage !== undefined, "M25.8 - Member usage retrieved");
  assert(memberUsage?.userId === memberId, "M25.8 - Member usage strictly matches requesting member identity");

  // Budget Cap Enforcement (Layer 6)
  await OrganizationService.updateOrganizationSettings(orgId, { monthlyBudgetUsd: 10.0, currentSpendUsd: 10.5 }, adminId);
  const budgetExceeded = await UsageService.checkBudgetAvailable(orgId, 0.05);
  assert(budgetExceeded.allowed === false, "M25.8 - checkBudgetAvailable rejects when spend exceeds monthly budget");
  assert(budgetExceeded.status === "LIMIT_REACHED", "M25.8 - Budget status is LIMIT_REACHED");

  const evalBudgetExceeded = await EnterprisePolicyEngine.evaluateToolExecution({
    organizationId: orgId,
    userId: memberId,
    toolName: "calculate",
  });
  assert(evalBudgetExceeded.decision === "DENY", "M25.8 - Policy Engine Layer 6 denies task when budget is exceeded");
  assert(evalBudgetExceeded.layer === "BUDGET_LIMIT", "M25.8 - Denied at BUDGET_LIMIT layer");

  // Restore budget
  await OrganizationService.updateOrganizationSettings(orgId, { monthlyBudgetUsd: 150.0, currentSpendUsd: 14.85 }, adminId);

  // -------------------------------------------------------------------------
  // Milestone 25.9: Tenant-Isolated Immutable Audit Trail
  // -------------------------------------------------------------------------
  console.log("\n--- Milestone 25.9: Tenant-Isolated Immutable Audit Trail ---");

  const auditResult = await EnterpriseAuditService.getEvents(orgId, { limit: 50 });
  assert(auditResult.events.length > 0, "M25.9 - Audit events recorded and retrieved");

  const killSwitchEvent = auditResult.events.find((e) => e.eventType === "KILL_SWITCH_ENGAGED");
  assert(killSwitchEvent !== undefined, "M25.9 - KILL_SWITCH_ENGAGED audit event captured in immutable log");

  // Cross-tenant data isolation verification
  const otherTenantAudit = await EnterpriseAuditService.getEvents("org-alien-tenant-999");
  assert(
    otherTenantAudit.events.length === 0,
    "M25.9 - Cross-tenant audit isolation: zero leakage to other organization"
  );

  // -------------------------------------------------------------------------
  // Milestone 25.10: Operational Controls & Worker Re-Validation
  // -------------------------------------------------------------------------
  console.log("\n--- Milestone 25.10: Operational Controls & Worker Authorization Re-validation ---");

  // Re-validation check: user suspended
  const tempUser = await OrganizationService.findOrCreateUser("usr_temp_test", "temp@example.com", "Temp", orgId, "MEMBER");
  await OrganizationService.updateUserStatus(orgId, tempUser.id, "SUSPENDED", adminId);
  const revalCheck = await OrganizationService.isUserAuthorizedForTask(tempUser.id, orgId);
  assert(!revalCheck.authorized, "M25.10 - Worker re-check rejects queued task for suspended user");

  // -------------------------------------------------------------------------
  // Milestone 25.11: Multi-Dimensional AI Workforce Health
  // -------------------------------------------------------------------------
  console.log("\n--- Milestone 25.11: Multi-Dimensional AI Workforce Health Scoring ---");

  const health = await OrganizationService.computeWorkforceHealth(orgId);
  assert(health.overallScore >= 90, `M25.11 - Overall health score nominal (${health.overallScore}%)`);
  assert(health.status === "EXCELLENT" || health.status === "GOOD", `M25.11 - Status is ${health.status}`);
  assert(health.categories.security.score === 100, "M25.11 - Security category score is 100%");
  assert(health.categories.cost.status === "WITHIN_BUDGET", "M25.11 - Cost category status is WITHIN_BUDGET");

  // -------------------------------------------------------------------------
  // Milestone 25.12: Integration Administration (Zero Credential Leakage)
  // -------------------------------------------------------------------------
  console.log("\n--- Milestone 25.12: Safe Integration Administration ---");

  const integrations = await OrganizationService.getIntegrationsSummary(orgId);
  assert(integrations.length === 4, "M25.12 - 4 external integrations summarized");
  const names = integrations.map((i) => i.name);
  assert(names.includes("OpenAI LLM"), "M25.12 - OpenAI LLM integration listed");
  assert(names.includes("Gmail Integration"), "M25.12 - Gmail integration listed");

  // Verify zero credential leaks in safeMetadata
  const hasSecrets = integrations.some((i) => {
    const raw = JSON.stringify(i).toLowerCase();
    return (
      raw.includes("sk-") ||
      raw.includes("client_secret") ||
      raw.includes("api_key") ||
      raw.includes("password")
    );
  });
  assert(!hasSecrets, "M25.12 - Verified zero API keys, secrets, or passwords leaked in integration metadata");

  // -------------------------------------------------------------------------
  // Final Test Suite Summary
  // -------------------------------------------------------------------------
  const total = reports.length;
  const passed = reports.filter((r) => r.passed).length;
  const failed = reports.filter((r) => !r.passed).length;

  console.log("\n=======================================================");
  console.log(`  PHASE 25 TEST RESULTS: ${passed}/${total} PASSED (${failed} FAILED)`);
  console.log("=======================================================\n");

  if (failed > 0) {
    console.error("Test failures detected in Phase 25 suite:");
    reports.filter((r) => !r.passed).forEach((r) => {
      console.error(` - [FAIL] ${r.name}: ${r.error}`);
    });
    process.exit(1);
  } else {
    console.log("ALL PHASE 25 ENTERPRISE GOVERNANCE TESTS PASSED SUCCESSFULLY! [100%]\n");
  }
}

if (require.main === module) {
  runPhase25Tests().catch((err) => {
    console.error("Fatal error during Phase 25 test execution:", err);
    process.exit(1);
  });
}

export { runPhase25Tests };
