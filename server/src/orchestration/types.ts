import { z } from "zod";

/**
 * Phase 27: Autonomous Workforce Orchestration & Multi-Agent Collaboration
 * Domain models, schemas, and contracts.
 */

export type WorkerRole =
  | "RESEARCH_WORKER"
  | "VERIFICATION_WORKER"
  | "KNOWLEDGE_WORKER"
  | "ANALYSIS_WORKER"
  | "COMMUNICATION_WORKER"
  | "SYNTHESIS_WORKER";

export type WorkerRiskLevel =
  | "READ_ONLY"
  | "ANALYTICAL"
  | "MUTATING"
  | "EXTERNAL_SIDE_EFFECT";

export type OrchestrationState =
  | "REQUESTED"
  | "PLANNING"
  | "DISPATCHING"
  | "RUNNING"
  | "WAITING"
  | "AGGREGATING"
  | "VALIDATING"
  | "SYNTHESIZING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

export type WorkerExecutionStatus =
  | "PENDING"
  | "READY"
  | "RUNNING"
  | "COMPLETED"
  | "FAILED"
  | "BLOCKED"
  | "CANCELLED";

// ---------------------------------------------------------------------------
// Worker Definition Contract
// ---------------------------------------------------------------------------

export interface WorkerDefinition {
  workerType: WorkerRole;
  name: string;
  description: string;
  capabilities: string[]; // Allowed tool names
  inputSchema: z.ZodType<any>;
  outputSchema: z.ZodType<any>;
  riskLevel: WorkerRiskLevel;
  defaultTimeoutMs: number;
  defaultBudgetUsd: number;
  version: string;
}

// ---------------------------------------------------------------------------
// Orchestration Plan & DAG Nodes
// ---------------------------------------------------------------------------

export interface OrchestrationPlanNode {
  id: string; // Unique worker step ID (e.g. "research_1")
  workerType: WorkerRole;
  objective: string;
  dependsOn: string[]; // IDs of preceding nodes that must finish first
  required: boolean;   // If false, failure is non-fatal to task
  inputData?: Record<string, unknown>;
  allocatedBudgetUsd?: number;
  timeoutMs?: number;
}

export interface OrchestrationPlan {
  planId: string;
  taskId: string;
  organizationId: string;
  overallObjective: string;
  nodes: OrchestrationPlanNode[];
  maxTotalBudgetUsd: number;
  deadlineMs: number;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Worker Execution Envelope & Results
// ---------------------------------------------------------------------------

export interface WorkerExecutionContext {
  workerExecutionId: string;
  orchestrationId: string;
  taskId: string;
  stepId: string;
  userId: string;
  organizationId: string;
  workerType: WorkerRole;
  capabilities: string[];
  allocatedBudgetUsd: number;
  deadlineTimestamp: number; // Absolute epoch ms
  isolatedContext: Record<string, unknown>; // Only required context slice
}

export interface WorkerExecutionRecord {
  workerExecutionId: string;
  orchestrationId: string;
  taskId: string;
  stepId: string;
  workerType: WorkerRole;
  status: WorkerExecutionStatus;
  startTime: string;
  endTime?: string;
  durationMs?: number;
  costUsd: number;
  toolCalls: Array<{ toolName: string; durationMs: number; success: boolean }>;
  output?: Record<string, unknown>;
  error?: string;
  confidence: number;
}

// ---------------------------------------------------------------------------
// Structured Worker Observation (Untrusted Input/Output Boundary)
// ---------------------------------------------------------------------------

export interface WorkerObservation {
  stepId: string;
  workerType: WorkerRole;
  summary: string;
  data: Record<string, unknown>;
  sources: Array<{ id: string; title: string; url?: string; citationToken?: string }>;
  confidence: number;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Final Orchestration Output
// ---------------------------------------------------------------------------

export interface FinalSynthesisResult {
  orchestrationId: string;
  taskId: string;
  status: "COMPLETED" | "PARTIAL_SUCCESS" | "FAILED" | "CANCELLED";
  finalAnswer: string;
  sources: Array<{ id: string; title: string; citationToken: string }>;
  uncertainties: string[];
  conflictsResolved: Array<{ topic: string; resolution: string; primarySource: string }>;
  workerSummary: Array<{
    stepId: string;
    workerType: WorkerRole;
    status: WorkerExecutionStatus;
    durationMs: number;
    costUsd: number;
  }>;
  totalCostUsd: number;
  totalDurationMs: number;
  completedAt: string;
}

// ---------------------------------------------------------------------------
// Zod Schemas for Initial Worker Roles
// ---------------------------------------------------------------------------

// 1. Research Worker Input / Output
export const ResearchWorkerInputSchema = z.object({
  query: z.string().min(3).max(500),
  maxSources: z.number().int().min(1).max(10).default(5),
  focusAreas: z.array(z.string()).optional(),
});

export const ResearchWorkerOutputSchema = z.object({
  status: z.enum(["completed", "failed"]),
  findings: z.array(z.string()),
  sources: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      url: z.string().optional(),
      snippet: z.string(),
    })
  ),
  confidence: z.number().min(0).max(1),
  rawExcerptCount: z.number().int(),
});

// 2. Verification Worker Input / Output
export const VerificationWorkerInputSchema = z.object({
  customerNumber: z.string().min(2).max(50),
  checkFields: z.array(z.string()).optional(),
});

export const VerificationWorkerOutputSchema = z.object({
  verified: z.boolean(),
  customerFound: z.boolean(),
  customerData: z
    .object({
      id: z.string().optional(),
      name: z.string().optional(),
      status: z.string().optional(),
      balance: z.number().optional(),
    })
    .optional(),
  discrepancies: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1),
});

// 3. Knowledge Worker Input / Output
export const KnowledgeWorkerInputSchema = z.object({
  query: z.string().min(3).max(500),
  topK: z.number().int().min(1).max(10).default(5),
  documentFilter: z.string().optional(),
});

export const KnowledgeWorkerOutputSchema = z.object({
  status: z.enum(["completed", "failed"]),
  contextChunks: z.array(
    z.object({
      chunkId: z.string(),
      sourceToken: z.string(), // e.g. "[S1]"
      documentName: z.string(),
      text: z.string(),
      similarityScore: z.number(),
    })
  ),
  noContextFound: z.boolean(),
  groundedSourceTokens: z.array(z.string()),
  confidence: z.number().min(0).max(1),
});

// 4. Analysis Worker Input / Output
export const AnalysisWorkerInputSchema = z.object({
  objective: z.string().min(5),
  researchFindings: z.array(z.string()).optional(),
  verificationData: z.record(z.string(), z.unknown()).optional(),
  knowledgeChunks: z.array(z.record(z.string(), z.unknown())).optional(),
});

export const AnalysisWorkerOutputSchema = z.object({
  summary: z.string(),
  recommendation: z.string(),
  keyMetrics: z.record(z.string(), z.unknown()).optional(),
  conflictsIdentified: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1),
});

// 5. Communication Worker Input / Output
export const CommunicationWorkerInputSchema = z.object({
  recipient: z.string().email(),
  subject: z.string().min(2).max(200),
  bodyDraft: z.string().min(5),
  actionType: z.enum(["CREATE_DRAFT", "SEND_EMAIL"]).default("CREATE_DRAFT"),
});

export const CommunicationWorkerOutputSchema = z.object({
  actionTaken: z.enum(["DRAFT_CREATED", "APPROVAL_REQUESTED", "EMAIL_SENT"]),
  draftId: z.string().optional(),
  approvalId: z.string().optional(),
  recipient: z.string().email(),
  status: z.enum(["SUCCESS", "STAGED_FOR_APPROVAL", "DENIED"]),
  details: z.string(),
});

// 6. Synthesis Worker Input / Output
export const SynthesisWorkerInputSchema = z.object({
  userObjective: z.string(),
  observations: z.array(z.record(z.string(), z.unknown())).default([]),
  conflicts: z.array(z.string()).optional(),
});

export const SynthesisWorkerOutputSchema = z.object({
  finalAnswer: z.string().min(10),
  citations: z.array(z.string()), // Valid tokens like "[S1]"
  uncertainties: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1),
});
