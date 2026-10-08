import {
  MemoryRecord,
  MemorySearchFilter,
  MemorySearchResult,
  MemorySource,
} from "./types";
import { MemoryRepository } from "./memoryRepository";
import { StructuredLogger } from "../observability/logger";

/**
 * Phase 28: Memory Retrieval Engine
 * Multi-factor ranking algorithm combining relevance, freshness, source authority,
 * confidence, and historical utility score.
 */
export class MemoryRetrieval {
  private static readonly MAX_BOUND_MEMORIES = 15;

  private static readonly SOURCE_TRUST_WEIGHTS: Record<MemorySource, number> = {
    USER_EXPLICIT: 1.0,
    HUMAN_REVIEW: 0.95,
    ORGANIZATION_POLICY: 0.90,
    TASK_OUTCOME: 0.80,
    USER_BEHAVIOR: 0.70,
    SYSTEM_DERIVED: 0.60,
  };

  /**
   * Retrieves and ranks candidate memories using multi-factor evaluation.
   */
  public static async retrieve(filter: MemorySearchFilter): Promise<MemorySearchResult[]> {
    const startTime = Date.now();
    StructuredLogger.info("memory_retrieval_started", "Starting memory retrieval", {
      organizationId: filter.organizationId,
      userId: filter.userId,
      query: filter.query,
      scope: filter.scope,
    });

    // 1. Fetch filtered candidate records from authoritative store
    const { records } = MemoryRepository.find({
      ...filter,
      limit: 50, // broad fetch before ranking
      offset: 0,
    });

    const queryTokens = filter.query
      ? filter.query.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean)
      : [];

    const now = Date.now();

    // 2. Score each candidate memory
    const scored: MemorySearchResult[] = [];

    for (const mem of records) {
      const matchReasons: string[] = [];

      // A. Relevance Score (Keyword & Token overlap)
      let relevanceScore = 0.5; // Baseline relevance if no query
      if (queryTokens.length > 0) {
        const memText = `${mem.title} ${mem.content} ${mem.key || ""} ${mem.tags.join(" ")}`.toLowerCase();
        let matches = 0;
        for (const token of queryTokens) {
          if (memText.includes(token)) {
            matches++;
          }
        }
        relevanceScore = Math.min(1.0, (matches / queryTokens.length) * 1.2);
        if (matches > 0) {
          matchReasons.push(`Matched ${matches}/${queryTokens.length} query tokens`);
        }
      } else {
        matchReasons.push("Default scope relevance");
      }

      // If user provided a specific query and relevance is 0, skip unless scope matches explicitly
      if (queryTokens.length > 0 && relevanceScore === 0) {
        continue;
      }

      // B. Freshness Score (Decay over 60 days)
      const ageMs = now - new Date(mem.createdAt).getTime();
      const sixtyDaysMs = 60 * 24 * 60 * 60 * 1000;
      const freshnessScore = Math.max(0.2, 1.0 - ageMs / sixtyDaysMs);
      if (freshnessScore > 0.8) matchReasons.push("High freshness");

      // C. Source Trust Score
      const trustScore = this.SOURCE_TRUST_WEIGHTS[mem.source] || 0.7;
      if (trustScore >= 0.9) matchReasons.push(`High authority source (${mem.source})`);

      // D. Confidence Score
      const confidenceScore = mem.confidence;

      // E. Historical Utility Score
      const utilityScore = mem.utilityScore;

      // F. Multi-Factor Formula
      // Final = 0.35 * Rel + 0.20 * Conf + 0.20 * Trust + 0.15 * Fresh + 0.10 * Utility
      const finalScore = parseFloat(
        (
          0.35 * relevanceScore +
          0.20 * confidenceScore +
          0.20 * trustScore +
          0.15 * freshnessScore +
          0.10 * utilityScore
        ).toFixed(4)
      );

      scored.push({
        memory: mem,
        relevanceScore: parseFloat(relevanceScore.toFixed(3)),
        finalScore,
        matchReasons,
      });

      // Record access for usage telemetry
      MemoryRepository.recordAccess(mem.id);
    }

    // 3. Sort by final score descending
    scored.sort((a, b) => b.finalScore - a.finalScore);

    // 4. Bound results
    const boundLimit = Math.min(filter.limit || 5, this.MAX_BOUND_MEMORIES);
    const results = scored.slice(0, boundLimit);

    StructuredLogger.info("memory_retrieval_completed", "Completed memory retrieval", {
      organizationId: filter.organizationId,
      retrievedCount: results.length,
      durationMs: Date.now() - startTime,
    });

    return results;
  }
}
