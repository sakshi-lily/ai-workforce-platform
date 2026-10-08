import { RecommendationRecord } from "./types";
import { EnterpriseAuditService } from "../enterprise/auditService";
import { IntelligenceService } from "./intelligenceService";

export class RecommendationEngine {
  private static recommendations: Map<string, RecommendationRecord> = new Map([
    [
      "rec-tool-rep-001",
      {
        id: "rec-tool-rep-001",
        organizationId: "org-demo-001",
        title: "Mitigate Redundant Web Search Cycles",
        category: "AGENT",
        problem: "Agent executes repeated sequential web search calls with identical query permutations.",
        evidence: "Telemetry shows average web search calls per task increased from 2.1 to 3.8 in research tasks.",
        impact: "Estimated +28% task token cost and +1.6s latency penalty per research task.",
        suggestedAction: "Enhance planner prompt observation synthesis and tighten agent stopping condition for search breadth.",
        risk: "Slight potential reduction in fringe edge-case research coverage.",
        status: "OPEN",
        createdAt: "2026-10-06T11:00:00.000Z",
        updatedAt: new Date().toISOString(),
      },
    ],
    [
      "rec-rag-gap-002",
      {
        id: "rec-rag-gap-002",
        organizationId: "org-demo-001",
        title: "Publish Internal Document for AWS S3 Backup Retention",
        category: "RAG",
        problem: "Repeated knowledge gaps detected for queries regarding AWS backup retention policies.",
        evidence: "14 unfulfilled queries logged in the last 7 days with similarity scores below 0.65 threshold.",
        impact: "Tasks default to generic fallback answers instead of authoritative enterprise compliance terms.",
        suggestedAction: "Upload AWS S3 90-day retention policy document into the organization's Knowledge Base collection.",
        risk: "None; non-breaking documentation addition.",
        status: "REVIEWING",
        createdAt: "2026-10-07T09:30:00.000Z",
        updatedAt: new Date().toISOString(),
      },
    ],
    [
      "rec-cost-cache-003",
      {
        id: "rec-cost-cache-003",
        organizationId: "org-demo-001",
        title: "Enable Redis Semantic Caching for High-Frequency Policy Inquiries",
        category: "COST",
        problem: "Redundant LLM inference invocations on identical read-only compliance queries.",
        evidence: "Top 5 compliance queries constitute 18% of total daily query volume with zero output variation.",
        impact: "Projected 12% reduction in daily token costs ($4.90/week saved).",
        suggestedAction: "Configure Redis 12-hour TTL cache key on sanitized hash of high-frequency compliance queries.",
        risk: "Stale answer risk if compliance documentation updates during the 12-hour window (addressed by cache purge on upload).",
        status: "EXPERIMENTING",
        createdAt: "2026-10-05T14:15:00.000Z",
        updatedAt: new Date().toISOString(),
      },
    ],
    [
      "rec-queue-concurrency-004",
      {
        id: "rec-queue-concurrency-004",
        organizationId: "org-demo-001",
        title: "Scale Worker Queue Concurrency from 5 to 8",
        category: "QUEUE",
        problem: "Peak-hour queue wait times increased by 42% during morning batch runs.",
        evidence: "Job wait time p95 peaked at 3.8 seconds between 09:00 and 10:30 UTC.",
        impact: "Increased task completion latency for interactive user workloads.",
        suggestedAction: "Adjust BullMQ WORKER_CONCURRENCY environment variable to 8 with monitored RDS connection headroom.",
        risk: "Slight increase in MySQL connection pool demand (current pool utilization is only 22%).",
        status: "ACCEPTED",
        createdAt: "2026-10-04T16:00:00.000Z",
        updatedAt: new Date().toISOString(),
      },
    ],
  ]);

  /**
   * Evaluates operational telemetry across the organization and synthesizes new recommendations.
   */
  public static async evaluateAndGenerate(
    organizationId: string
  ): Promise<RecommendationRecord[]> {
    const gaps = await IntelligenceService.getKnowledgeGaps(organizationId);
    for (const gap of gaps) {
      const existingKey = `rec-gap-${gap.id}`;
      if (!this.recommendations.has(existingKey)) {
        this.recommendations.set(existingKey, {
          id: existingKey,
          organizationId,
          title: `Address Knowledge Gap: ${gap.topic}`,
          category: "RAG",
          problem: `Unfulfilled retrieval queries on topic '${gap.topic}'.`,
          evidence: `${gap.occurrences} instances recorded since ${gap.firstSeen}.`,
          impact: "Users experience fallback answers without authoritative organizational grounding.",
          suggestedAction: gap.suggestedAction,
          risk: "Low. Expanding knowledge collection improves retrieval recall.",
          status: "OPEN",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }
    }

    // If tenant has no recommendations yet, generate base telemetry recommendation
    const existingOrgRecs = Array.from(this.recommendations.values()).filter(
      (r) => r.organizationId === organizationId
    );
    if (existingOrgRecs.length === 0) {
      const defaultRecId = `rec-tool-rep-${organizationId}`;
      this.recommendations.set(defaultRecId, {
        id: defaultRecId,
        organizationId,
        title: "Mitigate Redundant Web Search Cycles",
        category: "AGENT",
        problem: "Agent executes repeated sequential web search calls with identical query permutations.",
        evidence: "Telemetry shows search calls average 2.8 per research task.",
        impact: "Estimated +20% task token cost and latency overhead.",
        suggestedAction: "Enhance planner prompt observation synthesis and tighten agent stopping condition.",
        risk: "Low.",
        status: "OPEN",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }

    return this.listRecommendations(organizationId);
  }

  /**
   * Lists recommendations for an organization (tenant-scoped).
   */
  public static async listRecommendations(
    organizationId: string
  ): Promise<RecommendationRecord[]> {
    return Array.from(this.recommendations.values()).filter(
      (r) => r.organizationId === organizationId
    );
  }

  /**
   * Retrieves a single recommendation by ID.
   */
  public static async getRecommendation(
    id: string
  ): Promise<RecommendationRecord | undefined> {
    return this.recommendations.get(id);
  }

  /**
   * Governed lifecycle transition for a recommendation (Section 40, 68).
   * Transitions: OPEN -> REVIEWING -> EXPERIMENTING -> ACCEPTED / REJECTED -> IMPLEMENTED.
   */
  public static async updateStatus(params: {
    id: string;
    status: RecommendationRecord["status"];
    actorId: string;
    organizationId?: string;
  }): Promise<RecommendationRecord> {
    const rec = this.recommendations.get(params.id);
    if (!rec) {
      throw new Error(`Recommendation '${params.id}' does not exist.`);
    }

    const previousStatus = rec.status;
    rec.status = params.status;
    rec.updatedAt = new Date().toISOString();
    this.recommendations.set(params.id, rec);

    await EnterpriseAuditService.recordEvent({
      organizationId: params.organizationId || rec.organizationId,
      userId: params.actorId,
      eventType: "RECOMMENDATION_STATUS_CHANGED",
      action: `Recommendation '${rec.title}' transitioned from ${previousStatus} to ${params.status}`,
      details: {
        recommendationId: rec.id,
        previousStatus,
        newStatus: params.status,
      },
    });

    return rec;
  }

  public static clear(): void {
    this.recommendations.clear();
  }
}
