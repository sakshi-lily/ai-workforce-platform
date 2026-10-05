import OpenAI from "openai";
import { config } from "../config/env";
import { ChatMessage, GenerateOptions, LLMTelemetry } from "./types";

let openaiClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI | null {
  if (!config.llm.apiKey || !config.llm.apiKey.trim()) {
    return null;
  }
  if (!openaiClient) {
    openaiClient = new OpenAI({
      apiKey: config.llm.apiKey,
      baseURL: config.llm.baseUrl,
      timeout: config.llm.timeoutMs,
      maxRetries: config.llm.maxRetries,
    });
  }
  return openaiClient;
}

/**
 * Calculates estimated cost in USD based on input/output tokens.
 */
export function calculateCostUsd(inputTokens: number, outputTokens: number): number {
  const inputCost = (inputTokens / 1_000_000) * config.llm.pricing.inputPerMillion;
  const outputCost = (outputTokens / 1_000_000) * config.llm.pricing.outputPerMillion;
  return Number((inputCost + outputCost).toFixed(6));
}

/**
 * Executes a chat completion request with bounded timeouts and usage telemetry.
 * If no API key is configured in development, provides a realistic simulated response.
 */
export async function executeChatCompletion(
  messages: ChatMessage[],
  options: GenerateOptions = {}
): Promise<{ content: string; telemetry: LLMTelemetry }> {
  const client = getOpenAIClient();
  const startTime = performance.now();
  const model = config.llm.model;
  const provider = config.llm.provider;

  // 1. Production / Live Provider Execution (when API key is present)
  if (client) {
    try {
      const responseFormat = options.responseFormat === "json_object" ? { type: "json_object" as const } : undefined;

      const completion = await client.chat.completions.create({
        model,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens ?? 1000,
        response_format: responseFormat,
      });

      const elapsed = Math.round(performance.now() - startTime);
      const content = completion.choices[0]?.message?.content || "";
      const inputTokens = completion.usage?.prompt_tokens ?? 0;
      const outputTokens = completion.usage?.completion_tokens ?? 0;
      const totalTokens = completion.usage?.total_tokens ?? (inputTokens + outputTokens);
      const estimatedCostUsd = calculateCostUsd(inputTokens, outputTokens);

      return {
        content,
        telemetry: {
          provider,
          model,
          inputTokens,
          outputTokens,
          totalTokens,
          latencyMs: elapsed,
          estimatedCostUsd,
          status: "SUCCESS",
        },
      };
    } catch (err: unknown) {
      const elapsed = Math.round(performance.now() - startTime);
      console.error("[LLM Provider Execution Error]", err);
      throw new Error(err instanceof Error ? err.message : "Provider request failed");
    }
  }

  // 2. Developer Simulation Fallback (when no external API key is configured)
  // Ensures Phase 6 vertical slice, automated testing, and UI validation work without requiring external billing.
  await new Promise((res) => setTimeout(res, 180)); // Simulate realistic network roundtrip
  const elapsed = Math.round(performance.now() - startTime);

  const promptText = messages.map((m) => m.content).join(" ");
  const inputTokens = Math.max(15, Math.round(promptText.length / 4));

  let simulatedContent = "";
  if (options.responseFormat === "json_object") {
    const isPlanningPrompt = promptText.toLowerCase().includes("plan") || promptText.toLowerCase().includes("goal") || promptText.toLowerCase().includes("steps");

    if (isPlanningPrompt) {
      simulatedContent = JSON.stringify({
        goal: "Identify and qualify potential customers for the AI automation product.",
        summary: "The task requires establishing an Ideal Customer Profile (ICP), identifying target vertical sectors, extracting candidate companies, and qualifying leads prior to outreach.",
        steps: [
          {
            order: 1,
            title: "Define Ideal Customer Profile (ICP)",
            description: "Establish target company firmographics, headcount thresholds, and automation readiness."
          },
          {
            order: 2,
            title: "Identify Target Industries",
            description: "Select high-probability sectors such as Enterprise Healthcare, Cloud Infrastructure, and Fintech."
          },
          {
            order: 3,
            title: "Discover Candidate Companies",
            description: "Extract prospective company domains and verify technical footprint against target criteria."
          },
          {
            order: 4,
            title: "Verify and Qualify Prospects",
            description: "Cross-reference prospective companies against internal CRM database records and assign qualification score."
          }
        ]
      });
    } else {
      simulatedContent = JSON.stringify({
        summary: "Redis acts as an ultra-fast temporary caching tier, while MySQL remains the durable source of truth with relational integrity and transactional consistency.",
        topics: ["Redis Caching", "MySQL Durability", "System Architecture", "Reliability"],
        sentiment: "POSITIVE",
        confidence: 0.96,
        keyInsights: [
          "In-memory caches reduce database read queries and latency from milliseconds to microseconds.",
          "Authoritative mutations must commit to MySQL first before cache invalidation.",
          "System degradations must safely fall back to MySQL if Redis is unavailable."
        ],
      });
    }
  } else {
    simulatedContent = `Redis should act strictly as a high-speed in-memory cache and temporary coordinator rather than replacing MySQL. MySQL provides durable storage, foreign key constraints, ACID transactions, and auditability for core business entities (users, tasks, customers), whereas Redis reduces read pressure and latency by serving cached representations.`;
  }

  const outputTokens = Math.max(25, Math.round(simulatedContent.length / 4));
  const totalTokens = inputTokens + outputTokens;
  const estimatedCostUsd = calculateCostUsd(inputTokens, outputTokens);

  return {
    content: simulatedContent,
    telemetry: {
      provider: `${provider}-simulation`,
      model,
      inputTokens,
      outputTokens,
      totalTokens,
      latencyMs: elapsed,
      estimatedCostUsd,
      status: "SUCCESS",
    },
  };
}
