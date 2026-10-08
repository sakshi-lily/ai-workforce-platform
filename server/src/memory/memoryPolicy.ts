import {
  MemoryRecord,
  MemoryCandidateInput,
  MemoryScope,
  MemorySource,
} from "./types";

/**
 * Phase 28: Memory Governance, Security, and Policy Engine
 *
 * Enforces:
 * - Credential and Secret Rejection (Zero credentials in memory)
 * - Malicious Authorization Bypass Defense
 * - Multi-Tenant and User Scope Boundaries
 * - Authority Hierarchy (Safety > Policy > Current State > Knowledge > Memory)
 */
export class MemoryPolicy {
  // Regex patterns detecting credential or secret material
  private static readonly SECRET_PATTERNS = [
    /bearer\s+[-a-zA-Z0-9_\.]{16,}/i,
    /gh[pous]_[-a-zA-Z0-9]{36,}/i,
    /github_pat_[-a-zA-Z0-9_]{40,}/i,
    /sk-[-a-zA-Z0-9_]{16,}/i,
    /(?:api[_-]?key|apikey|secret)\s*[:=\s]\s*['"]?[-a-zA-Z0-9_]{10,}['"]?/i,
    /(?:password|passwd|pwd)\s*[:=\s]\s*['"]?[^\s'"]{6,}['"]?/i,
    /-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----/i,
    /mongodb(?:\+srv)?:\/\/[^\s]+/i,
    /postgres(?:ql)?:\/\/[^\s]+/i,
    /mysql:\/\/[^\s]+/i,
  ];

  // Regex patterns detecting malicious policy escalation attempts
  private static readonly POLICY_BYPASS_PATTERNS = [
    /(?:ignore|bypass|skip)\s+(?:all\s+)?(?:safety|policy|approval|verification|security)/i,
    /(?:always|automatically)\s+(?:send|dispatch)\s+(?:emails?|gmail)\s+without\s+approval/i,
    /(?:grant|assume|escalate)\s+(?:admin|superuser|root)\s+(?:role|privileges|permissions)/i,
    /(?:disable|override)\s+(?:tenant\s+isolation|organization\s+policy)/i,
  ];

  /**
   * Validates a candidate memory against enterprise safety policies.
   * Throws Error if restricted credentials or secret tokens are detected.
   */
  public static validateCandidate(candidate: MemoryCandidateInput): void {
    if (candidate.sensitivity === "RESTRICTED") {
      throw new Error(
        "RESTRICTED_DATA_REJECTED: Sensitivity level RESTRICTED is strictly prohibited in memory storage."
      );
    }

    const fullText = `${candidate.title} ${candidate.content} ${JSON.stringify(
      candidate.structuredData || {}
    )}`;

    // 1. Secret Scanning
    for (const pattern of this.SECRET_PATTERNS) {
      if (pattern.test(fullText)) {
        throw new Error(
          "RESTRICTED_DATA_REJECTED: Credentials, passwords, API keys, or access tokens cannot be stored in workforce memory."
        );
      }
    }

    // 2. Validate Scope requirements
    if (candidate.scope === "USER" && !candidate.userId) {
      throw new Error("MEMORY_SCOPE_INVALID: USER-scoped memory requires a valid userId.");
    }
  }

  /**
   * Sanitizes memory content to ensure prompt injection cannot hijack system execution.
   * Untrusted instructions are flagged so the context builder marks them inert.
   */
  public static inspectForPolicyTampering(content: string): { isMalicious: boolean; warning?: string } {
    for (const pattern of this.POLICY_BYPASS_PATTERNS) {
      if (pattern.test(content)) {
        return {
          isMalicious: true,
          warning: "Attempted authorization or approval bypass detected in memory content. Marked as inert historical data.",
        };
      }
    }
    return { isMalicious: false };
  }

  /**
   * Verifies that the caller is authorized to view or mutate the target memory.
   */
  public static isAuthorized(
    callerOrgId: string,
    callerUserId: string | undefined,
    memory: MemoryRecord,
    isAdmin: boolean = false
  ): boolean {
    // 1. Strict Tenant Isolation
    if (memory.organizationId !== callerOrgId) {
      return false;
    }

    // 2. Scope-based user boundary
    if (memory.scope === "USER") {
      if (memory.userId !== callerUserId && !isAdmin) {
        return false;
      }
    }

    // 3. Organization, Task, Workflow scopes are visible to org members
    return true;
  }

  /**
   * Calculates retention expiration date based on memory scope and source.
   */
  public static calculateExpiresAt(
    scope: MemoryScope,
    source: MemorySource,
    customDays?: number
  ): string | undefined {
    if (customDays !== undefined) {
      const exp = new Date();
      exp.setDate(exp.getDate() + customDays);
      return exp.toISOString();
    }

    const now = new Date();
    switch (scope) {
      case "TASK":
        // Ephemeral task memory expires in 7 days
        now.setDate(now.getDate() + 7);
        return now.toISOString();

      case "USER":
      case "ORGANIZATION":
      case "WORKFLOW":
        if (source === "SYSTEM_DERIVED" || source === "USER_BEHAVIOR") {
          // Inferred behavior expires in 30 days unless reconfirmed
          now.setDate(now.getDate() + 30);
          return now.toISOString();
        }
        // Explicit preferences or org policies persist indefinitely (or 365 days)
        return undefined;

      case "EPISODIC":
        // Episodic events default to 90 days retention
        now.setDate(now.getDate() + 90);
        return now.toISOString();

      default:
        return undefined;
    }
  }

  /**
   * Checks whether a memory record has expired.
   */
  public static isExpired(memory: MemoryRecord): boolean {
    if (!memory.expiresAt) return false;
    return new Date(memory.expiresAt).getTime() <= Date.now();
  }
}
