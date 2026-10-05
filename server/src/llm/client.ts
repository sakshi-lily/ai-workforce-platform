import OpenAI from "openai";
import { config } from "../config/env";
import { ChatMessage, GenerateOptions, LLMStepResponse, LLMTelemetry } from "./types";

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
 * Executes a single conversational agent step, supporting tool calls and final text answers.
 */
export async function executeChatStep(
  messages: ChatMessage[],
  options: GenerateOptions = {}
): Promise<LLMStepResponse> {
  const client = getOpenAIClient();
  const startTime = performance.now();
  const model = config.llm.model;
  const provider = config.llm.provider;

  // 1. Live Provider Execution (when API key is present)
  if (client) {
    try {
      const responseFormat = options.responseFormat === "json_object" ? { type: "json_object" as const } : undefined;

      const completion = await client.chat.completions.create({
        model,
        messages: messages.map((m) => {
          if (m.role === "tool") {
            return {
              role: "tool" as const,
              content: m.content,
              tool_call_id: m.tool_call_id || "call_default",
            };
          }
          return { role: m.role, content: m.content };
        }),
        temperature: options.temperature ?? 0.2,
        max_tokens: options.maxTokens ?? 1000,
        response_format: responseFormat,
        tools: options.tools && options.tools.length > 0 ? options.tools : undefined,
        tool_choice: options.tools && options.tools.length > 0 ? (options.toolChoice || "auto") : undefined,
      });

      const elapsed = Math.round(performance.now() - startTime);
      const choice = completion.choices[0]?.message;
      const inputTokens = completion.usage?.prompt_tokens ?? 0;
      const outputTokens = completion.usage?.completion_tokens ?? 0;
      const totalTokens = completion.usage?.total_tokens ?? (inputTokens + outputTokens);
      const estimatedCostUsd = calculateCostUsd(inputTokens, outputTokens);

      const telemetry: LLMTelemetry = {
        provider,
        model,
        inputTokens,
        outputTokens,
        totalTokens,
        latencyMs: elapsed,
        estimatedCostUsd,
        status: "SUCCESS",
      };

      // Check if model proposed a tool call
      if (choice?.tool_calls && choice.tool_calls.length > 0) {
        const tc = choice.tool_calls[0];
        if (tc.type === "function") {
          let parsedArgs: Record<string, unknown> = {};
          try {
            parsedArgs = JSON.parse(tc.function.arguments || "{}");
          } catch {
            parsedArgs = { raw: tc.function.arguments };
          }

          return {
            content: null,
            toolCall: {
              tool: tc.function.name,
              arguments: parsedArgs,
              toolCallId: tc.id,
            },
            telemetry,
          };
        }
      }

      return {
        content: choice?.content || "",
        toolCall: null,
        telemetry,
      };
    } catch (err: unknown) {
      console.error("[LLM Provider Step Execution Error]", err);
      throw new Error(err instanceof Error ? err.message : "Provider request failed");
    }
  }

  // 2. Developer Simulation Fallback (when no external API key is configured)
  await new Promise((res) => setTimeout(res, 180));
  const elapsed = Math.round(performance.now() - startTime);

  const promptText = messages.map((m) => m.content).join(" ");
  const inputTokens = Math.max(15, Math.round(promptText.length / 4));

  const hasToolObservation = messages.some((m) => m.role === "tool");
  const supportsTools = options.tools && options.tools.length > 0;

  // Scenario A: First cycle with tools enabled and no observation yet -> Propose tool call
  if (supportsTools && !hasToolObservation) {
    const userMessage = [...messages].reverse().find((m) => m.role === "user");
    const userPrompt = userMessage ? userMessage.content.toLowerCase() : "";

    const isTime =
      userPrompt.includes("time") ||
      userPrompt.includes("clock") ||
      userPrompt.includes("timezone") ||
      userPrompt.includes("today") ||
      userPrompt.includes("date") ||
      userPrompt.includes("now") ||
      userPrompt.includes("india") ||
      userPrompt.includes("tokyo");

    const isMath =
      userPrompt.includes("calc") ||
      userPrompt.includes("math") ||
      userPrompt.includes("eval") ||
      /\d+\s*[\+\-\*\/%]\s*\d+/.test(userPrompt);

    if (isTime) {
      let timezone = "Asia/Kolkata";
      if (userPrompt.includes("utc")) timezone = "UTC";
      else if (userPrompt.includes("new york") || userPrompt.includes("est") || userPrompt.includes("america/new_york")) timezone = "America/New_York";
      else if (userPrompt.includes("london") || userPrompt.includes("gmt") || userPrompt.includes("europe/london")) timezone = "Europe/London";
      else if (userPrompt.includes("tokyo") || userPrompt.includes("asia/tokyo")) timezone = "Asia/Tokyo";
      else if (userPrompt.includes("paris") || userPrompt.includes("europe/paris")) timezone = "Europe/Paris";

      return {
        content: null,
        toolCall: {
          tool: "get_current_time",
          arguments: { timezone },
          toolCallId: "sim_call_time_1",
        },
        telemetry: {
          provider: `${provider}-simulation`,
          model,
          inputTokens,
          outputTokens: 25,
          totalTokens: inputTokens + 25,
          latencyMs: elapsed,
          estimatedCostUsd: calculateCostUsd(inputTokens, 25),
          status: "SUCCESS",
        },
      };
    }

    if (isMath) {
      const mathMatch = userMessage?.content.match(/[\d\s+\-*/().%]+/);
      const expression = mathMatch ? mathMatch[0].trim() : "((125 * 4) + 50) / 5";

      return {
        content: null,
        toolCall: {
          tool: "calculate",
          arguments: { expression: expression || "45 * 12 + 10" },
          toolCallId: "sim_call_calc_1",
        },
        telemetry: {
          provider: `${provider}-simulation`,
          model,
          inputTokens,
          outputTokens: 25,
          totalTokens: inputTokens + 25,
          latencyMs: elapsed,
          estimatedCostUsd: calculateCostUsd(inputTokens, 25),
          status: "SUCCESS",
        },
      };
    }

    // Default for external queries: propose web_search
    let searchCleaned = userMessage?.content || "latest technology updates";
    searchCleaned = searchCleaned.replace(/^(search for|find|search the web for|look up|search)\s+/i, "").trim();

    return {
      content: null,
      toolCall: {
        tool: "web_search",
        arguments: {
          query: searchCleaned.substring(0, 100) || "latest AI news",
          max_results: 5,
        },
        toolCallId: "sim_call_search_1",
      },
      telemetry: {
        provider: `${provider}-simulation`,
        model,
        inputTokens,
        outputTokens: 30,
        totalTokens: inputTokens + 30,
        latencyMs: elapsed,
        estimatedCostUsd: calculateCostUsd(inputTokens, 30),
        status: "SUCCESS",
      },
    };
  }

  // Scenario B: Observation received -> Synthesize final answer with source attribution
  if (hasToolObservation) {
    const observationMessage = messages.find((m) => m.role === "tool");
    let answer = "Tool execution succeeded.";

    if (observationMessage) {
      try {
        const obs = JSON.parse(observationMessage.content);
        if (obs.tool === "get_current_time" && obs.success) {
          answer = `It is currently ${obs.data.formatted} (Timezone: ${obs.data.timezone}).`;
        } else if (obs.tool === "calculate" && obs.success) {
          answer = `The calculated result for expression '${obs.data.expression}' is ${obs.data.result}.`;
        } else if (obs.tool === "web_search" && obs.success) {
          const results = obs.data.results || [];
          if (results.length > 0) {
            const summaryPoints = results
              .map((r: any) => `• ${r.title}\n  ${r.snippet}`)
              .join("\n\n");
            const sourcesList = results
              .map((r: any, idx: number) => `[${idx + 1}] ${r.title} — ${r.url}`)
              .join("\n");

            answer = `Based on verified web search observations for '${obs.data.query}':\n\n${summaryPoints}\n\n**Sources & Attribution:**\n${sourcesList}`;
          } else {
            answer = `Web search query '${obs.data.query}' completed, but returned no matching public records.`;
          }
        } else if (!obs.success) {
          answer = `Tool execution failed: ${obs.error?.message || "Unknown error"}`;
        }
      } catch {
        answer = `Tool returned observation: ${observationMessage.content}`;
      }
    }

    const outputTokens = Math.max(25, Math.round(answer.length / 4));
    return {
      content: answer,
      toolCall: null,
      telemetry: {
        provider: `${provider}-simulation`,
        model,
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
        latencyMs: elapsed,
        estimatedCostUsd: calculateCostUsd(inputTokens, outputTokens),
        status: "SUCCESS",
      },
    };
  }

  // Scenario C: Structured Plan or standard text response
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
            description: "Establish target company firmographics, headcount thresholds, and automation readiness.",
          },
          {
            order: 2,
            title: "Identify Target Industries",
            description: "Select high-probability sectors such as Enterprise Healthcare, Cloud Infrastructure, and Fintech.",
          },
          {
            order: 3,
            title: "Discover Candidate Companies",
            description: "Extract prospective company domains and verify technical footprint against target criteria.",
          },
          {
            order: 4,
            title: "Verify and Qualify Prospects",
            description: "Cross-reference prospective companies against internal CRM database records and assign qualification score.",
          },
        ],
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
          "System degradations must safely fall back to MySQL if Redis is unavailable.",
        ],
      });
    }
  } else {
    simulatedContent = `Redis should act strictly as a high-speed in-memory cache and temporary coordinator rather than replacing MySQL. MySQL provides durable storage, foreign key constraints, ACID transactions, and auditability for core business entities (users, tasks, customers), whereas Redis reduces read pressure and latency by serving cached representations.`;
  }

  const outputTokens = Math.max(25, Math.round(simulatedContent.length / 4));
  return {
    content: simulatedContent,
    toolCall: null,
    telemetry: {
      provider: `${provider}-simulation`,
      model,
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      latencyMs: elapsed,
      estimatedCostUsd: calculateCostUsd(inputTokens, outputTokens),
      status: "SUCCESS",
    },
  };
}

/**
 * Standard chat completion wrapper for text / structured analysis.
 */
export async function executeChatCompletion(
  messages: ChatMessage[],
  options: GenerateOptions = {}
): Promise<{ content: string; telemetry: LLMTelemetry }> {
  const step = await executeChatStep(messages, options);
  return {
    content: step.content || "",
    telemetry: step.telemetry,
  };
}
