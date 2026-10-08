/**
 * AI Workforce Platform — Phase 26: Intelligence, Optimization & Continuous Improvement
 * Domain models and contracts for operational intelligence, quality analytics,
 * experimentation, version traceability, and recommendations.
 */

export type TaskOutcome =
  | "SUCCESS"
  | "PARTIAL_SUCCESS"
  | "FAILED"
  | "CANCELLED"
  | "TIMEOUT"
  | "BLOCKED"
  | "NEEDS_REVIEW";

export interface TaskQualityScore {
  overallScore: number; // 0-100
  correctness: number;  // 0-100
  completeness: number; // 0-100
  groundedness: number; // 0-100
  toolAccuracy: number; // 0-100
  efficiency: number;   // 0-100
  status: "EXCELLENT" | "SATISFACTORY" | "NEEDS_REVIEW" | "POOR";
}

export type FailureCategory =
  | "LLM_ERROR"
  | "TOOL_ERROR"
  | "TIMEOUT"
  | "AUTHORIZATION_ERROR"
  | "RETRIEVAL_FAILURE"
  | "PROVIDER_ERROR"
  | "INFRASTRUCTURE_ERROR"
  | "USER_INPUT_ERROR";

export interface FailureRecord {
  id: string;
  taskId: string;
  organizationId: string;
  category: FailureCategory;
  rootCause: string;
  recovered: boolean;
  timestamp: string;
}

export interface WorkforceHealthDimension {
  score: number;      // 0-100
  weight: number;     // e.g. 0.25
  status: "HEALTHY" | "OPTIMAL" | "DEGRADED" | "CRITICAL";
  details: string;
}

export interface WorkforceHealthSummary {
  overallScore: number;
  status: "EXCELLENT" | "GOOD" | "DEGRADED" | "CRITICAL";
  dimensions: {
    reliability: WorkforceHealthDimension;
    quality: WorkforceHealthDimension;
    efficiency: WorkforceHealthDimension;
    security: WorkforceHealthDimension;
    cost: WorkforceHealthDimension;
    userSatisfaction: WorkforceHealthDimension;
  };
  computedAt: string;
}

export interface AgentEfficiencyMetrics {
  averageCycles: number;
  maxCycles: number;
  averageToolCalls: number;
  efficiencyRatio: number; // required / actual (0.0 - 1.0)
  repeatedToolCallsDetected: number;
  nearWatchdogExecutions: number;
  watchdogTerminations: number;
}

export interface ToolEffectivenessMetrics {
  toolName: string;
  executions: number;
  successRate: number;      // 0-100%
  failureRate: number;      // 0-100%
  averageLatencyMs: number;
  timeoutRate: number;      // 0-100%
  retryRate: number;        // 0-100%
  costPerExecutionUsd: number;
}

export interface RAGQualityMetrics {
  totalQueries: number;
  averageSimilarityScore: number;
  relevantRetrievalRate: number; // 0-100%
  noContextRate: number;         // 0-100%
  groundednessRate: number;      // 0-100%
  citationValidityRate: number;  // 0-100%
  unsupportedClaimRate: number;  // 0-100%
}

export interface KnowledgeGapRecord {
  id: string;
  organizationId: string;
  query: string;
  topic: string;
  occurrences: number;
  firstSeen: string;
  lastSeen: string;
  status: "DETECTED" | "DOCUMENTED" | "RESOLVED";
  suggestedAction: string;
}

export type FeedbackCategory =
  | "HELPFUL"
  | "NOT_HELPFUL"
  | "WRONG_INFO"
  | "MISSING_INFO"
  | "POOR_SOURCES"
  | "TOO_SLOW"
  | "WRONG_TOOL"
  | "OTHER";

export interface UserFeedbackRecord {
  id: string;
  taskId: string;
  organizationId: string;
  userId: string;
  rating: "HELPFUL" | "NOT_HELPFUL";
  category: FeedbackCategory;
  comment?: string;
  timestamp: string;
}

export interface ModelComparisonRecord {
  model: string;
  provider: string;
  successRate: number;
  averageCostPerTaskUsd: number;
  averageLatencyMs: number;
  toolAccuracyRate: number;
  groundednessRate: number;
}

export interface WorkforceVersionRecord {
  version: string;
  agentVersion: string;
  promptVersions: Record<string, string>;
  modelConfig: {
    provider: string;
    model: string;
    temperature: number;
    timeoutMs: number;
  };
  toolRegistryVersion: string;
  ragConfig: {
    topK: number;
    similarityThreshold: number;
  };
  createdAt: string;
  active: boolean;
  approvedBy: string;
}

export interface ExperimentRecord {
  id: string;
  organizationId: string;
  name: string;
  hypothesis: string;
  parameter: "prompt" | "model" | "rag_top_k" | "retrieval_threshold";
  baselineVariant: string;
  candidateVariant: string;
  status: "DRAFT" | "RUNNING" | "STOPPED" | "COMPLETED";
  sampleSize: number;
  baselineMetrics: {
    successRate: number;
    costUsd: number;
    latencyMs: number;
  };
  candidateMetrics: {
    successRate: number;
    costUsd: number;
    latencyMs: number;
  };
  stopConditions: string[];
  decision: "PENDING" | "ACCEPTED" | "REJECTED";
  createdAt: string;
  updatedAt: string;
}

export interface RecommendationRecord {
  id: string;
  organizationId: string;
  title: string;
  category: "AGENT" | "TOOL" | "RAG" | "COST" | "RELIABILITY" | "QUEUE";
  problem: string;
  evidence: string;
  impact: string;
  suggestedAction: string;
  risk: string;
  status: "OPEN" | "REVIEWING" | "EXPERIMENTING" | "ACCEPTED" | "REJECTED" | "IMPLEMENTED";
  createdAt: string;
  updatedAt: string;
}
