import { OrganizationService } from "./organizationService";
import { EnterpriseRole } from "./types";

export interface UserUsageMetrics {
  userId: string;
  email: string;
  role: EnterpriseRole;
  totalTasks: number;
  tokens: number;
  costUsd: number;
  toolCalls: number;
  failureCount: number;
}

export interface ToolUsageMetrics {
  toolName: string;
  executions: number;
  successCount: number;
  failureCount: number;
  successRate: number; // percentage (0-100)
  failureRate: number;
  averageDurationMs: number;
  totalDurationMs: number;
  estimatedCostUsd: number;
}

export type BudgetStatus = "NORMAL" | "WARNING" | "LIMIT_REACHED";

export interface OrganizationUsageSummary {
  organizationId: string;
  monthlyBudgetUsd: number;
  currentSpendUsd: number;
  remainingBudgetUsd: number;
  spendPercentage: number;
  budgetStatus: BudgetStatus;
  totalTasks: number;
  successfulTasks: number;
  failedTasks: number;
  totalTokens: number;
  totalToolCalls: number;
  users: UserUsageMetrics[];
  tools: ToolUsageMetrics[];
}

export class UsageService {
  // Keyed by orgId -> userId -> UserUsageMetrics
  private static userUsage: Map<string, Map<string, UserUsageMetrics>> = new Map();

  // Keyed by orgId -> toolName -> ToolUsageMetrics
  private static toolUsage: Map<string, Map<string, ToolUsageMetrics>> = new Map();

  // Organization-level task counters (orgId -> { total, success, failed, tokens, toolCalls })
  private static orgCounters: Map<
    string,
    { totalTasks: number; successfulTasks: number; failedTasks: number; totalTokens: number; totalToolCalls: number }
  > = new Map();

  /**
   * Initializes default mock/historical telemetry so the dashboard is immediately rich and informative.
   */
  private static initDefaultOrgTelemetry(orgId: string) {
    if (!this.orgCounters.has(orgId)) {
      this.orgCounters.set(orgId, {
        totalTasks: 42,
        successfulTasks: 39,
        failedTasks: 3,
        totalTokens: 184500,
        totalToolCalls: 112,
      });

      const userMap = new Map<string, UserUsageMetrics>();
      userMap.set("usr_demo_admin_001", {
        userId: "usr_demo_admin_001",
        email: "admin@example.com",
        role: "OWNER",
        totalTasks: 28,
        tokens: 122000,
        costUsd: 9.85,
        toolCalls: 78,
        failureCount: 1,
      });
      userMap.set("usr_demo_member_002", {
        userId: "usr_demo_member_002",
        email: "sarah@apexcloud.io",
        role: "MEMBER",
        totalTasks: 14,
        tokens: 62500,
        costUsd: 5.0,
        toolCalls: 34,
        failureCount: 2,
      });
      this.userUsage.set(orgId, userMap);

      const toolMap = new Map<string, ToolUsageMetrics>();
      toolMap.set("webSearch", {
        toolName: "webSearch",
        executions: 48,
        successCount: 46,
        failureCount: 2,
        successRate: 95.8,
        failureRate: 4.2,
        averageDurationMs: 1120,
        totalDurationMs: 53760,
        estimatedCostUsd: 0.24,
      });
      toolMap.set("ragQuery", {
        toolName: "ragQuery",
        executions: 32,
        successCount: 32,
        failureCount: 0,
        successRate: 100.0,
        failureRate: 0.0,
        averageDurationMs: 420,
        totalDurationMs: 13440,
        estimatedCostUsd: 0.16,
      });
      toolMap.set("mysqlVerifyCustomer", {
        toolName: "mysqlVerifyCustomer",
        executions: 22,
        successCount: 21,
        failureCount: 1,
        successRate: 95.5,
        failureRate: 4.5,
        averageDurationMs: 180,
        totalDurationMs: 3960,
        estimatedCostUsd: 0.05,
      });
      toolMap.set("gmailSend", {
        toolName: "gmailSend",
        executions: 10,
        successCount: 10,
        failureCount: 0,
        successRate: 100.0,
        failureRate: 0.0,
        averageDurationMs: 850,
        totalDurationMs: 8500,
        estimatedCostUsd: 0.1,
      });
      this.toolUsage.set(orgId, toolMap);
    }
  }

  /**
   * Pre-execution budget evaluation guard (Section 23).
   * Rejects expensive AI or tool actions if monthly budget limit is reached.
   */
  public static async checkBudgetAvailable(
    orgId: string,
    estimatedCostUsd: number = 0.01
  ): Promise<{
    allowed: boolean;
    status: BudgetStatus;
    remainingUsd: number;
    currentSpendUsd: number;
    budgetUsd: number;
  }> {
    const org = await OrganizationService.getOrganization(orgId);
    const budgetUsd = org?.monthlyBudgetUsd ?? 150.0;
    const currentSpendUsd = org?.currentSpendUsd ?? 0.0;
    const projectedSpend = currentSpendUsd + estimatedCostUsd;
    const remainingUsd = Math.max(0, budgetUsd - currentSpendUsd);

    let status: BudgetStatus = "NORMAL";
    let allowed = true;

    if (projectedSpend > budgetUsd || currentSpendUsd >= budgetUsd) {
      status = "LIMIT_REACHED";
      allowed = false;
    } else if (currentSpendUsd / budgetUsd >= 0.75) {
      status = "WARNING";
      allowed = true;
    }

    return {
      allowed,
      status,
      remainingUsd,
      currentSpendUsd,
      budgetUsd,
    };
  }

  /**
   * Records usage metrics for an executed task and its constituent tool calls.
   */
  public static async recordUsage(params: {
    organizationId: string;
    userId: string;
    userEmail?: string;
    role?: EnterpriseRole;
    toolCalls: Array<{
      toolName: string;
      success: boolean;
      durationMs: number;
      costUsd?: number;
    }>;
    tokens: number;
    costUsd: number;
    taskSuccess: boolean;
  }): Promise<void> {
    const { organizationId, userId, userEmail = "user@example.com", role = "MEMBER", toolCalls, tokens, costUsd, taskSuccess } = params;

    this.initDefaultOrgTelemetry(organizationId);

    // 1. Update Org settings currentSpendUsd
    const org = await OrganizationService.getOrganization(organizationId);
    if (org) {
      const newSpend = parseFloat((org.currentSpendUsd + costUsd).toFixed(4));
      await OrganizationService.updateOrganizationSettings(organizationId, { currentSpendUsd: newSpend }, userId);
    }

    // 2. Update Org Task Counters
    const counters = this.orgCounters.get(organizationId) || {
      totalTasks: 0,
      successfulTasks: 0,
      failedTasks: 0,
      totalTokens: 0,
      totalToolCalls: 0,
    };
    counters.totalTasks += 1;
    if (taskSuccess) counters.successfulTasks += 1;
    else counters.failedTasks += 1;
    counters.totalTokens += tokens;
    counters.totalToolCalls += toolCalls.length;
    this.orgCounters.set(organizationId, counters);

    // 3. Update User Usage Breakdown
    let userMap = this.userUsage.get(organizationId);
    if (!userMap) {
      userMap = new Map();
      this.userUsage.set(organizationId, userMap);
    }
    const userMetrics = userMap.get(userId) || {
      userId,
      email: userEmail,
      role,
      totalTasks: 0,
      tokens: 0,
      costUsd: 0,
      toolCalls: 0,
      failureCount: 0,
    };
    userMetrics.totalTasks += 1;
    userMetrics.tokens += tokens;
    userMetrics.costUsd = parseFloat((userMetrics.costUsd + costUsd).toFixed(4));
    userMetrics.toolCalls += toolCalls.length;
    if (!taskSuccess) userMetrics.failureCount += 1;
    userMap.set(userId, userMetrics);

    // 4. Update Tool Usage Breakdown
    let toolMap = this.toolUsage.get(organizationId);
    if (!toolMap) {
      toolMap = new Map();
      this.toolUsage.set(organizationId, toolMap);
    }
    for (const tc of toolCalls) {
      const tm = toolMap.get(tc.toolName) || {
        toolName: tc.toolName,
        executions: 0,
        successCount: 0,
        failureCount: 0,
        successRate: 100,
        failureRate: 0,
        averageDurationMs: 0,
        totalDurationMs: 0,
        estimatedCostUsd: 0,
      };
      tm.executions += 1;
      if (tc.success) tm.successCount += 1;
      else tm.failureCount += 1;
      tm.totalDurationMs += tc.durationMs;
      tm.averageDurationMs = Math.round(tm.totalDurationMs / tm.executions);
      tm.successRate = parseFloat(((tm.successCount / tm.executions) * 100).toFixed(1));
      tm.failureRate = parseFloat(((tm.failureCount / tm.executions) * 100).toFixed(1));
      tm.estimatedCostUsd = parseFloat((tm.estimatedCostUsd + (tc.costUsd || 0.002)).toFixed(4));
      toolMap.set(tc.toolName, tm);
    }
  }

  /**
   * Retrieves high-level organization-wide usage and budget overview for admins.
   */
  public static async getOrganizationUsage(orgId: string): Promise<OrganizationUsageSummary> {
    this.initDefaultOrgTelemetry(orgId);

    const org = await OrganizationService.getOrganization(orgId);
    const monthlyBudgetUsd = org?.monthlyBudgetUsd ?? 150.0;
    const currentSpendUsd = org?.currentSpendUsd ?? 14.85;
    const remainingBudgetUsd = Math.max(0, parseFloat((monthlyBudgetUsd - currentSpendUsd).toFixed(2)));
    const spendPercentage = parseFloat(((currentSpendUsd / monthlyBudgetUsd) * 100).toFixed(1));

    let budgetStatus: BudgetStatus = "NORMAL";
    if (spendPercentage >= 100) budgetStatus = "LIMIT_REACHED";
    else if (spendPercentage >= 75) budgetStatus = "WARNING";

    const counters = this.orgCounters.get(orgId) || {
      totalTasks: 0,
      successfulTasks: 0,
      failedTasks: 0,
      totalTokens: 0,
      totalToolCalls: 0,
    };

    const users = Array.from(this.userUsage.get(orgId)?.values() || []);
    const tools = Array.from(this.toolUsage.get(orgId)?.values() || []);

    return {
      organizationId: orgId,
      monthlyBudgetUsd,
      currentSpendUsd,
      remainingBudgetUsd,
      spendPercentage,
      budgetStatus,
      totalTasks: counters.totalTasks,
      successfulTasks: counters.successfulTasks,
      failedTasks: counters.failedTasks,
      totalTokens: counters.totalTokens,
      totalToolCalls: counters.totalToolCalls,
      users,
      tools,
    };
  }

  /**
   * Retrieves user-specific usage strictly isolated to the requesting member (Section 24).
   */
  public static async getUserUsage(orgId: string, userId: string): Promise<UserUsageMetrics | undefined> {
    this.initDefaultOrgTelemetry(orgId);
    return this.userUsage.get(orgId)?.get(userId);
  }

  public static clear(): void {
    this.userUsage.clear();
    this.toolUsage.clear();
    this.orgCounters.clear();
  }
}
