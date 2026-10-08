import { z } from "zod";

/**
 * Phase 28: Zod Schemas for Memory Validation & Guardrails
 */

export const MemoryTypeSchema = z.enum([
  "USER",
  "ORGANIZATION",
  "TASK",
  "WORKFLOW",
  "EPISODIC",
  "SEMANTIC",
]);

export const MemoryScopeSchema = z.enum([
  "USER",
  "ORGANIZATION",
  "TASK",
  "WORKFLOW",
  "EPISODIC",
  "SEMANTIC",
  "GLOBAL",
]);

export const MemoryStatusSchema = z.enum([
  "CANDIDATE",
  "VALIDATED",
  "ACTIVE",
  "UPDATED",
  "SUPERSEDED",
  "EXPIRED",
  "DELETED",
]);

export const MemorySourceSchema = z.enum([
  "USER_EXPLICIT",
  "USER_BEHAVIOR",
  "TASK_OUTCOME",
  "HUMAN_REVIEW",
  "ORGANIZATION_POLICY",
  "SYSTEM_DERIVED",
]);

export const MemorySensitivitySchema = z.enum([
  "LOW",
  "MEDIUM",
  "HIGH",
  "RESTRICTED",
]);

export const CreateMemoryCandidateSchema = z.object({
  organizationId: z.string().min(1, "Organization ID is required"),
  userId: z.string().optional(),
  scope: MemoryScopeSchema,
  type: MemoryTypeSchema,
  key: z.string().max(100).optional(),
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(10000),
  structuredData: z.record(z.string(), z.unknown()).optional(),
  source: MemorySourceSchema,
  sensitivity: MemorySensitivitySchema.default("LOW"),
  confidence: z.number().min(0).max(1).default(0.85),
  tags: z.array(z.string()).default([]),
  expiresInDays: z.number().positive().max(3650).optional(),
});

export const UpdateMemorySchema = z.object({
  title: z.string().min(1).max(200).optional(),
  content: z.string().min(1).max(10000).optional(),
  structuredData: z.record(z.string(), z.unknown()).optional(),
  status: MemoryStatusSchema.optional(),
  tags: z.array(z.string()).optional(),
  expiresAt: z.string().datetime().optional(),
});

export const MemorySearchFilterSchema = z.object({
  organizationId: z.string().min(1),
  userId: z.string().optional(),
  scope: MemoryScopeSchema.optional(),
  type: MemoryTypeSchema.optional(),
  status: MemoryStatusSchema.optional(),
  query: z.string().optional(),
  tags: z.array(z.string()).optional(),
  minConfidence: z.number().min(0).max(1).optional(),
  limit: z.number().int().min(1).max(50).default(10),
  offset: z.number().int().min(0).default(0),
});

export const MemoryUsageFeedbackSchema = z.object({
  memoryId: z.string().min(1),
  taskId: z.string().min(1),
  organizationId: z.string().min(1),
  userId: z.string().optional(),
  wasUsed: z.boolean(),
  wasRelevant: z.boolean(),
  wasHelpful: z.boolean(),
  feedbackNotes: z.string().max(1000).optional(),
});
