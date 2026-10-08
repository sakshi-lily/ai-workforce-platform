import {
  MemoryRecord,
  MemoryCandidateInput,
  MemorySearchFilter,
  MemorySearchResult,
  MemoryUsageFeedback,
  MemoryMetrics,
} from "./types";
import { CreateMemoryCandidateSchema, UpdateMemorySchema } from "./schemas";
import { MemoryPolicy } from "./memoryPolicy";
import { MemoryRepository } from "./memoryRepository";
import { MemoryRetrieval } from "./memoryRetrieval";
import { StructuredLogger } from "../observability/logger";

/**
 * Phase 28: Memory Service
 * High-level orchestration facade for memory candidate lifecycle, governance validation,
 * multi-tenant retrieval, and metrics collection.
 */
export class MemoryService {
  /**
   * Evaluates, validates, and stores a new memory candidate.
   */
  public static async createCandidate(input: MemoryCandidateInput): Promise<MemoryRecord> {
    // 1. Zod schema validation
    const parsed = CreateMemoryCandidateSchema.parse(input);

    // 2. Security & Policy validation (Secrets rejection)
    MemoryPolicy.validateCandidate(input);

    // 3. Inspect for policy tampering
    const { isMalicious, warning } = MemoryPolicy.inspectForPolicyTampering(input.content);
    if (isMalicious) {
      StructuredLogger.warn("memory_policy_tampering_detected", "Potential policy tampering in memory candidate", {
        organizationId: input.organizationId,
        title: input.title,
        warning,
      });
    }

    // 4. Calculate expiration timestamp
    const expiresAt = MemoryPolicy.calculateExpiresAt(
      input.scope,
      input.source,
      input.expiresInDays
    );

    // 5. Persist to authoritative store
    const record = await MemoryRepository.create({
      organizationId: input.organizationId,
      userId: input.userId,
      scope: input.scope,
      type: input.type,
      key: input.key,
      title: input.title,
      content: input.content,
      structuredData: input.structuredData,
      source: input.source,
      sensitivity: input.sensitivity || "LOW",
      status: "ACTIVE",
      confidence: input.confidence ?? 0.85,
      tags: input.tags || [],
      utilityScore: 0.85,
      expiresAt,
    });

    return record;
  }

  /**
   * Retrieves a single memory by ID with authorization check.
   */
  public static getMemory(
    id: string,
    callerOrgId: string,
    callerUserId?: string,
    isAdmin: boolean = false
  ): MemoryRecord {
    const memory = MemoryRepository.getById(id);
    if (!memory) {
      throw new Error(`MEMORY_NOT_FOUND: Memory '${id}' does not exist.`);
    }

    const authorized = MemoryPolicy.isAuthorized(callerOrgId, callerUserId, memory, isAdmin);
    if (!authorized) {
      throw new Error(`FORBIDDEN_MEMORY_ACCESS: Unauthorized access to memory '${id}'.`);
    }

    return memory;
  }

  /**
   * Performs scoped memory search using multi-factor ranking.
   */
  public static async search(filter: MemorySearchFilter): Promise<MemorySearchResult[]> {
    return await MemoryRetrieval.retrieve(filter);
  }

  /**
   * Updates an existing memory with validation and authorization checks.
   */
  public static async updateMemory(
    id: string,
    updates: Record<string, unknown>,
    callerOrgId: string,
    callerUserId?: string,
    isAdmin: boolean = false
  ): Promise<MemoryRecord> {
    const existing = this.getMemory(id, callerOrgId, callerUserId, isAdmin);

    const parsed = UpdateMemorySchema.parse(updates);

    if (parsed.content) {
      MemoryPolicy.validateCandidate({
        organizationId: existing.organizationId,
        userId: existing.userId,
        scope: existing.scope,
        type: existing.type,
        title: parsed.title || existing.title,
        content: parsed.content,
        source: existing.source,
        sensitivity: existing.sensitivity,
      });
    }

    const updated = await MemoryRepository.update(id, parsed);
    if (!updated) {
      throw new Error(`MEMORY_NOT_FOUND: Failed to update memory '${id}'.`);
    }

    return updated;
  }

  /**
   * Soft-deletes a memory record.
   */
  public static async deleteMemory(
    id: string,
    callerOrgId: string,
    callerUserId?: string,
    isAdmin: boolean = false
  ): Promise<boolean> {
    // Verify existence & permission first
    this.getMemory(id, callerOrgId, callerUserId, isAdmin);
    return await MemoryRepository.delete(id, callerOrgId, callerUserId);
  }

  /**
   * Records usage feedback from task completion to tune utility scores.
   */
  public static recordFeedback(feedback: MemoryUsageFeedback): void {
    MemoryRepository.recordFeedback(feedback);
  }

  /**
   * Retrieves memory metrics for an organization.
   */
  public static getMetrics(organizationId: string): MemoryMetrics {
    return MemoryRepository.getMetrics(organizationId);
  }
}
