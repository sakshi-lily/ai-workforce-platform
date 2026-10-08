import crypto from "crypto";
import { AuditEventRecord } from "./types";
import { StructuredLogger } from "../observability/logger";

export class EnterpriseAuditService {
  private static events: AuditEventRecord[] = [];
  private static maxInMemory = 1000;

  /**
   * Records an immutable, tenant-scoped audit event.
   */
  public static async recordEvent(event: Omit<AuditEventRecord, "id" | "timestamp">): Promise<AuditEventRecord> {
    const record: AuditEventRecord = {
      id: `audit_${crypto.randomBytes(8).toString("hex")}`,
      timestamp: new Date().toISOString(),
      ...event,
    };

    this.events.unshift(record);
    if (this.events.length > this.maxInMemory) {
      this.events.pop();
    }

    StructuredLogger.info("enterprise_audit_event", `Audit: [${record.eventType}] ${record.action}`, {
      organizationId: record.organizationId,
      userId: record.userId,
      details: record.details,
    });

    return record;
  }

  /**
   * Queries audit logs strictly isolated to the caller's organization.
   */
  public static async getEvents(
    organizationId: string,
    filters?: {
      eventType?: string;
      userId?: string;
      search?: string;
      limit?: number;
      offset?: number;
    }
  ): Promise<{ events: AuditEventRecord[]; total: number }> {
    // Strictly filter by organizationId to guarantee zero cross-tenant data leakage
    let matches = this.events.filter((e) => e.organizationId === organizationId);

    if (filters?.eventType) {
      matches = matches.filter((e) => e.eventType === filters.eventType);
    }
    if (filters?.userId) {
      matches = matches.filter((e) => e.userId === filters.userId);
    }
    if (filters?.search) {
      const q = filters.search.toLowerCase();
      matches = matches.filter(
        (e) =>
          e.action.toLowerCase().includes(q) ||
          e.eventType.toLowerCase().includes(q) ||
          JSON.stringify(e.details).toLowerCase().includes(q)
      );
    }

    const total = matches.length;
    const offset = filters?.offset || 0;
    const limit = filters?.limit || 50;
    const paged = matches.slice(offset, offset + limit);

    return { events: paged, total };
  }

  public static clear(): void {
    this.events = [];
  }
}
