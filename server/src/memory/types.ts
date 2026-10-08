import { z } from "zod";

/**
 * Phase 28: Workforce Memory, Context Engineering & Persistent Organizational Intelligence
 * Core Domain Models, Contracts, and Schemas.
 */

export type MemoryType =
  | "USER"         // Individual user preferences, styles, recurring needs
  | "ORGANIZATION" // Shared organizational terminology, conventions, frameworks
  | "TASK"         // Ephemeral context specific to a particular task run
  | "WORKFLOW"     // Reusable preferences tied to a template or workforce flow
  | "EPISODIC"     // Historical event records (past task outcomes, approval results)
  | "SEMANTIC";    // Generalized patterns derived from multiple historical experiences

export type MemoryScope =
  | "USER"
  | "ORGANIZATION"
  | "TASK"
  | "WORKFLOW"
  | "EPISODIC"
  | "SEMANTIC"
  | "GLOBAL";

export type MemoryStatus =
  | "CANDIDATE"    // Proposed, pending validation
  | "VALIDATED"    // Validated, ready for activation
  | "ACTIVE"       // Active and retrievable
  | "UPDATED"      // Modified
  | "SUPERSEDED"   // Replaced by a newer active memory
  | "EXPIRED"      // Beyond retention duration
  | "DELETED";     // Tombstoned or deleted

export type MemorySource =
  | "USER_EXPLICIT"       // User explicitly stated (Weight: 1.0)
  | "USER_BEHAVIOR"       // Inferred from user actions/feedback (Weight: 0.7)
  | "TASK_OUTCOME"        // Generated from completed workflow (Weight: 0.8)
  | "HUMAN_REVIEW"        // Confirmed by human supervisor (Weight: 0.95)
  | "ORGANIZATION_POLICY" // Defined at org admin level (Weight: 0.9)
  | "SYSTEM_DERIVED";     // Inferred by system/agent (Weight: 0.6)

export type MemorySensitivity =
  | "LOW"
  | "MEDIUM"
  | "HIGH"
  | "RESTRICTED"; // Disallowed (passwords, api keys, tokens, session secrets)

export type ContextLayerType =
  | "SYSTEM_POLICY"
  | "ORGANIZATION_POLICY"
  | "TASK_OBJECTIVE"
  | "AUTHORITATIVE_DATA"
  | "AUTHORIZED_MEMORY"
  | "RETRIEVED_KNOWLEDGE"
  | "WORKER_OBSERVATIONS"
  | "USER_REQUEST";

export interface MemoryRecord {
  id: string; // "mem_" + random hex
  organizationId: string;
  userId?: string;
  scope: MemoryScope;
  type: MemoryType;
  key?: string; // e.g. "report_format_preference"
  title: string;
  content: string;
  structuredData?: Record<string, unknown>;
  source: MemorySource;
  sensitivity: MemorySensitivity;
  status: MemoryStatus;
  confidence: number; // 0.0 to 1.0
  tags: string[];
  version: number;
  supersededById?: string;
  lastAccessedAt?: string;
  accessCount: number;
  utilityScore: number; // 0.0 to 1.0
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
}

export interface MemoryCandidateInput {
  organizationId: string;
  userId?: string;
  scope: MemoryScope;
  type: MemoryType;
  key?: string;
  title: string;
  content: string;
  structuredData?: Record<string, unknown>;
  source: MemorySource;
  sensitivity?: MemorySensitivity;
  confidence?: number;
  tags?: string[];
  expiresInDays?: number;
}

export interface MemorySearchFilter {
  organizationId: string;
  userId?: string;
  scope?: MemoryScope;
  type?: MemoryType;
  status?: MemoryStatus;
  query?: string;
  tags?: string[];
  minConfidence?: number;
  limit?: number;
  offset?: number;
}

export interface MemorySearchResult {
  memory: MemoryRecord;
  relevanceScore: number;
  finalScore: number;
  matchReasons: string[];
}

export interface MemoryUsageFeedback {
  memoryId: string;
  taskId: string;
  organizationId: string;
  userId?: string;
  wasUsed: boolean;
  wasRelevant: boolean;
  wasHelpful: boolean;
  feedbackNotes?: string;
}

export interface MemoryMetrics {
  totalMemories: number;
  activeMemories: number;
  supersededMemories: number;
  expiredMemories: number;
  deletedMemories: number;
  byScope: Record<string, number>;
  byType: Record<string, number>;
  averageUtilityScore: number;
  totalRetrievals: number;
  retrievalHitRate: number;
  averageRetrievalLatencyMs: number;
}
