import { MemoryRecord } from "../memory/types";

/**
 * Phase 28: Context Engineering Types & Contracts
 */

export interface ContextBudgetConfig {
  maxTotalTokens: number;      // Default: 4,000
  maxMemoryTokens: number;     // Default: 800
  maxKnowledgeTokens: number;  // Default: 1,200
  maxObservationTokens: number;// Default: 1,200
  maxMemoryItems: number;      // Default: 5
}

export interface ContextTokenBreakdown {
  systemPolicyTokens: number;
  orgPolicyTokens: number;
  taskObjectiveTokens: number;
  authoritativeDataTokens: number;
  memoryTokens: number;
  knowledgeTokens: number;
  observationTokens: number;
  userPromptTokens: number;
  totalTokens: number;
  budgetUtilizationPct: number;
  wasCompressed: boolean;
}

export interface ContextConflictAnnotation {
  field: string;
  authoritativeValue: string;
  historicalMemoryValue: string;
  sourceOfTruth: "MYSQL_LEDGER" | "PLATFORM_POLICY" | "ORGANIZATION_POLICY";
  resolutionNote: string;
}

export interface ContextAssembledResult {
  taskId: string;
  organizationId: string;
  userId?: string;
  workerRole?: string;
  assembledPrompt: string;
  tokenBreakdown: ContextTokenBreakdown;
  injectedMemories: Array<{
    id: string;
    title: string;
    scope: string;
    type: string;
    confidence: number;
  }>;
  conflictsAnnotated: ContextConflictAnnotation[];
  appliedGuardrails: string[];
  createdAt: string;
}

export interface ContextAssembleRequest {
  taskId: string;
  organizationId: string;
  userId?: string;
  workerRole?: string;
  systemPolicy?: string;
  orgPolicy?: string;
  taskObjective: string;
  authoritativeData?: Record<string, unknown>; // Live MySQL state
  retrievedKnowledge?: Array<{ id: string; title: string; content: string }>;
  workerObservations?: Array<{ stepId: string; workerType: string; summary: string }>;
  userPrompt: string;
  budgetConfig?: Partial<ContextBudgetConfig>;
  memoryQuery?: string;
}
