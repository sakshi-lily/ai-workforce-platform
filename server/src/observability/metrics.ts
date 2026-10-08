export interface ModelPricing {
  inputPer1k: number;
  outputPer1k: number;
}

export const DEFAULT_PRICING: Record<string, ModelPricing> = {
  "gpt-4o-mini": { inputPer1k: 0.00015, outputPer1k: 0.0006 },
  "gpt-4o": { inputPer1k: 0.0025, outputPer1k: 0.01 },
  default: { inputPer1k: 0.0002, outputPer1k: 0.0008 },
};

export interface TaskMetricRecord {
  taskId: string;
  durationMs: number;
  status: "COMPLETED" | "FAILED";
  promptTokens: number;
  completionTokens: number;
  model: string;
  failureCategory?: string;
}

export class MetricsCollector {
  private static taskRecords: TaskMetricRecord[] = [];
  private static activeTaskCount: number = 0;
  private static queueDepth: number = 0;

  public static recordTaskStart(): void {
    this.activeTaskCount++;
  }

  public static recordTaskCompletion(record: TaskMetricRecord): void {
    if (this.activeTaskCount > 0) {
      this.activeTaskCount--;
    }
    this.taskRecords.push(record);
    if (this.taskRecords.length > 500) {
      this.taskRecords.shift();
    }
  }

  public static setQueueDepth(depth: number): void {
    this.queueDepth = Math.max(0, depth);
  }

  public static getTaskMetrics() {
    const total = this.taskRecords.length;
    const completed = this.taskRecords.filter((t) => t.status === "COMPLETED").length;
    const failed = this.taskRecords.filter((t) => t.status === "FAILED").length;
    const successRate = total > 0 ? (completed / total) * 100 : 100;

    const durations = this.taskRecords.map((t) => t.durationMs).sort((a, b) => a - b);
    const avgDurationMs = total > 0 ? durations.reduce((a, b) => a + b, 0) / total : 0;
    const p50 = durations.length > 0 ? durations[Math.floor(durations.length * 0.5)] : 0;
    const p95 = durations.length > 0 ? durations[Math.floor(durations.length * 0.95)] : 0;

    return {
      activeTasks: this.activeTaskCount,
      completedTasks: completed,
      failedTasks: failed,
      totalRecorded: total,
      successRatePct: Math.round(successRate * 10) / 10,
      latency: {
        avgMs: Math.round(avgDurationMs),
        p50Ms: p50,
        p95Ms: p95,
      },
    };
  }

  public static getCostMetrics() {
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    let totalCostUsd = 0;

    for (const record of this.taskRecords) {
      totalPromptTokens += record.promptTokens;
      totalCompletionTokens += record.completionTokens;
      const rates = DEFAULT_PRICING[record.model] || DEFAULT_PRICING.default;
      const cost = (record.promptTokens / 1000) * rates.inputPer1k + (record.completionTokens / 1000) * rates.outputPer1k;
      totalCostUsd += cost;
    }

    const completed = this.taskRecords.filter((t) => t.status === "COMPLETED").length;
    const costPerSuccessfulTask = completed > 0 ? totalCostUsd / completed : 0;

    return {
      totalPromptTokens,
      totalCompletionTokens,
      totalTokens: totalPromptTokens + totalCompletionTokens,
      estimatedTotalCostUsd: Number(totalCostUsd.toFixed(6)),
      costPerSuccessfulTaskUsd: Number(costPerSuccessfulTask.toFixed(6)),
    };
  }

  public static getFailureTaxonomyDistribution(): Record<string, number> {
    const distribution: Record<string, number> = {};
    for (const record of this.taskRecords) {
      if (record.status === "FAILED" && record.failureCategory) {
        distribution[record.failureCategory] = (distribution[record.failureCategory] || 0) + 1;
      }
    }
    return distribution;
  }

  public static getOperationalDashboard() {
    return {
      timestamp: new Date().toISOString(),
      tasks: this.getTaskMetrics(),
      costs: this.getCostMetrics(),
      queue: {
        depth: this.queueDepth,
      },
      failureTaxonomy: this.getFailureTaxonomyDistribution(),
    };
  }

  public static reset(): void {
    this.taskRecords = [];
    this.activeTaskCount = 0;
    this.queueDepth = 0;
  }
}
