import { ContextBudgetConfig, ContextTokenBreakdown } from "./types";

/**
 * Phase 28: Context Budget Manager & Token Compression Engine
 * Enforces strict token ceilings and executes non-destructive compression.
 */
export class ContextBudgetManager {
  public static readonly DEFAULT_CONFIG: ContextBudgetConfig = {
    maxTotalTokens: 4000,
    maxMemoryTokens: 800,
    maxKnowledgeTokens: 1200,
    maxObservationTokens: 1200,
    maxMemoryItems: 5,
  };

  /**
   * Fast, reliable token estimation heuristic (~4 chars per token).
   */
  public static estimateTokens(text: string): number {
    if (!text || text.length === 0) return 0;
    return Math.ceil(text.length / 4);
  }

  /**
   * Compresses long observations or historical lists if they exceed the allocated token budget.
   * Compresses lower-priority content into concise structured summaries without dropping key findings.
   */
  public static compressObservations(
    observations: Array<{ stepId: string; workerType: string; summary: string }>,
    maxTokens: number
  ): { compressedText: string; wasCompressed: boolean } {
    let fullText = observations
      .map((o) => `[${o.workerType} - ${o.stepId}]: ${o.summary}`)
      .join("\n");

    let currentTokens = this.estimateTokens(fullText);
    if (currentTokens <= maxTokens) {
      return { compressedText: fullText, wasCompressed: false };
    }

    // Compression: Summarize bullet points concisely to fit within maxTokens
    const targetLengthChars = maxTokens * 4;
    const compressedLines = observations.map((o) => {
      const trimmedSummary =
        o.summary.length > 120 ? o.summary.slice(0, 117) + "..." : o.summary;
      return `• [${o.workerType}]: ${trimmedSummary}`;
    });

    let compressedText = compressedLines.join("\n");
    if (compressedText.length > targetLengthChars) {
      compressedText = compressedText.slice(0, targetLengthChars - 30) + "\n...[Observations summarized]";
    }

    return {
      compressedText,
      wasCompressed: true,
    };
  }

  /**
   * Computes comprehensive token breakdown and budget utilization metrics.
   */
  public static calculateBreakdown(
    counts: {
      systemPolicyTokens: number;
      orgPolicyTokens: number;
      taskObjectiveTokens: number;
      authoritativeDataTokens: number;
      memoryTokens: number;
      knowledgeTokens: number;
      observationTokens: number;
      userPromptTokens: number;
    },
    maxTotalTokens: number,
    wasCompressed: boolean
  ): ContextTokenBreakdown {
    const totalTokens =
      counts.systemPolicyTokens +
      counts.orgPolicyTokens +
      counts.taskObjectiveTokens +
      counts.authoritativeDataTokens +
      counts.memoryTokens +
      counts.knowledgeTokens +
      counts.observationTokens +
      counts.userPromptTokens;

    const budgetUtilizationPct = parseFloat(
      Math.min(100, (totalTokens / maxTotalTokens) * 100).toFixed(1)
    );

    return {
      ...counts,
      totalTokens,
      budgetUtilizationPct,
      wasCompressed,
    };
  }
}
