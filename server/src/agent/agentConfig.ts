/**
 * Phase 7 - Simple Agent Configuration & Watchdogs
 *
 * Enforces host-controlled boundaries:
 * - Cycle watchdog (max iterations before forced termination)
 * - Time watchdog (max wall-clock execution time)
 * - Plan bounds (max steps an agent can propose)
 */

export const AGENT_CONFIG = {
  // Phase 1 / Phase 7 / Phase 8 / Phase 9 / Phase 10 Watchdog Limits
  MAX_CYCLES: 10,
  MAX_TOOL_CALLS: 10,
  MAX_WEB_SEARCHES: 5,
  MAX_SEARCH_RESULTS: 10,
  MAX_MYSQL_VERIFICATIONS: 5,
  MAX_VECTOR_SEARCHES: 5,
  MAX_EXECUTION_TIME_MS: 180000, // 180 seconds
  MAX_PLAN_STEPS: 10,
  MIN_PLAN_STEPS: 1,

  // Prompt bounds
  MAX_PROMPT_LENGTH: 5000,
  MIN_PROMPT_LENGTH: 5,

  // Context & Identity
  DEFAULT_USER_ID: "usr_phase4_seed_001",
  DEFAULT_ORGANIZATION_ID: "org-demo-001",
  AGENT_ROLE: "planning_agent",
} as const;
