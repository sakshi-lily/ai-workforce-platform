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

    const isCustomerVerify =
      userPrompt.includes("verify") ||
      userPrompt.includes("customer") ||
      userPrompt.includes("crm") ||
      userPrompt.includes("database") ||
      userPrompt.includes("check customer") ||
      userPrompt.includes("@");

    const isVectorSearch =
      userPrompt.includes("policy") ||
      userPrompt.includes("remote") ||
      userPrompt.includes("telework") ||
      userPrompt.includes("handbook") ||
      userPrompt.includes("sla") ||
      userPrompt.includes("support ticket") ||
      userPrompt.includes("security") ||
      userPrompt.includes("compliance") ||
      userPrompt.includes("architecture") ||
      userPrompt.includes("sales playbook") ||
      userPrompt.includes("icp") ||
      userPrompt.includes("internal document") ||
      userPrompt.includes("qdrant") ||
      userPrompt.includes("vector") ||
      userPrompt.includes("mars");

    // Phase 12: Internal Grounded RAG Query
    if (isVectorSearch && options.tools?.some((t) => (t as any).function?.name === "rag_query")) {
      return {
        content: null,
        toolCall: {
          tool: "rag_query",
          arguments: {
            question: userMessage?.content.trim() || "What is our customer support SLA?",
            top_k: 5,
          },
          toolCallId: "sim_call_rag_1",
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

    // Phase 11: Internal Semantic Knowledge Retrieval
    if (isVectorSearch && options.tools?.some((t) => (t as any).function?.name === "vector_search")) {
      return {
        content: null,
        toolCall: {
          tool: "vector_search",
          arguments: {
            query: userMessage?.content.trim() || "company remote work policy",
            top_k: 5,
          },
          toolCallId: "sim_call_vector_1",
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

    // If query is specifically about customer verification, or contains an email without explicit web search instruction
    const asksWebSearchFirst = (userPrompt.includes("search") || userPrompt.includes("research") || userPrompt.includes("look up online")) && !userPrompt.startsWith("check customer");

    if (isCustomerVerify && !asksWebSearchFirst && options.tools?.some((t) => (t as any).function?.name === "mysql_verify_customer")) {
      const emailMatch = userMessage?.content.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
      const email = emailMatch ? emailMatch[0].trim().toLowerCase() : "sarah@apexcloud.io";

      return {
        content: null,
        toolCall: {
          tool: "mysql_verify_customer",
          arguments: { email },
          toolCallId: "sim_call_mysql_1",
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

  // Scenario B: Observations received -> Check for multi-tool chaining or synthesize final answer
  if (hasToolObservation) {
    const userMessage = [...messages].reverse().find((m) => m.role === "user");
    const userPrompt = userMessage ? userMessage.content.toLowerCase() : "";

    // Multi-tool chaining: if web_search finished and prompt also requested MySQL customer verification
    const hasWebSearchObs = messages.some((m) => m.role === "tool" && m.content.includes('"web_search"'));
    const hasMysqlObs = messages.some((m) => m.role === "tool" && m.content.includes('"mysql_verify_customer"'));
    const needsCustomerVerify =
      userPrompt.includes("verify") ||
      userPrompt.includes("customer") ||
      userPrompt.includes("database") ||
      userPrompt.includes("crm");

    if (
      hasWebSearchObs &&
      !hasMysqlObs &&
      needsCustomerVerify &&
      options.tools?.some((t) => (t as any).function?.name === "mysql_verify_customer")
    ) {
      const emailMatch = userMessage?.content.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
      const email = emailMatch ? emailMatch[0].trim().toLowerCase() : "sarah@apexcloud.io";

      return {
        content: null,
        toolCall: {
          tool: "mysql_verify_customer",
          arguments: { email },
          toolCallId: "sim_call_mysql_multi_1",
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

    // Synthesize final multi-source response
    const toolObservations = messages
      .filter((m) => m.role === "tool")
      .map((m) => {
        try {
          return JSON.parse(m.content);
        } catch {
          return { tool: "unknown", success: false, data: m.content };
        }
      });

    let answer = "Tool execution completed.";
    const webObs = toolObservations.find((o) => o.tool === "web_search");
    const mysqlObs = toolObservations.find((o) => o.tool === "mysql_verify_customer");
    const timeObs = toolObservations.find((o) => o.tool === "get_current_time");
    const calcObs = toolObservations.find((o) => o.tool === "calculate");
    const vectorObs = toolObservations.find((o) => o.tool === "vector_search");
    const ragObs = toolObservations.find((o) => o.tool === "rag_query");

    if (webObs && mysqlObs) {
      // Multi-Tool Combined Synthesis (Web Search + MySQL Verification)
      let webSummary = "No external results found.";
      let sourcesList = "";
      if (webObs.success && webObs.data.results?.length > 0) {
        webSummary = webObs.data.results
          .map((r: any) => `• ${r.title}\n  ${r.snippet}`)
          .join("\n\n");
        sourcesList = webObs.data.results
          .map((r: any, idx: number) => `[${idx + 1}] ${r.title} — ${r.url}`)
          .join("\n");
      }

      let mysqlSummary = "Customer lookup failed or produced no match.";
      if (mysqlObs.success) {
        if (mysqlObs.data.found && mysqlObs.data.customer) {
          const c = mysqlObs.data.customer;
          mysqlSummary =
            `• Status: Customer VERIFIED in internal CRM\n` +
            `• Account: ${c.company_name} (${c.domain})\n` +
            `• Contact: ${c.contact_name || "N/A"} <${c.contact_email || "N/A"}>\n` +
            `• Industry: ${c.industry || "N/A"}\n` +
            `• CRM Stage: ${c.status}\n` +
            `• Qualification Score: ${c.qualification_score ?? "N/A"}/100`;
        } else {
          mysqlSummary = `• Status: NOT FOUND in internal database. No existing records match this customer.`;
        }
      }

      answer =
        `### Multi-Source Intelligence Verification Report\n\n` +
        `**1. External Web Findings (Public Untrusted Data):**\n${webSummary}\n\n` +
        `**2. Internal Database Records (Authoritative MySQL Truth):**\n${mysqlSummary}\n\n` +
        `**Sources & Attribution:**\n${sourcesList ? sourcesList + "\n" : ""}` +
        `[Internal] MySQL 8.4 'customers' table (read-only verification query)`;
    } else if (mysqlObs) {
      if (mysqlObs.success) {
        if (mysqlObs.data.found && mysqlObs.data.customer) {
          const c = mysqlObs.data.customer;
          answer =
            `### Customer Verification Report\n\n` +
            `• **Verification Status**: ✓ VERIFIED in internal CRM\n` +
            `• **Company Name**: ${c.company_name}\n` +
            `• **Domain**: ${c.domain}\n` +
            `• **Primary Contact**: ${c.contact_name || "N/A"} (${c.contact_email || "N/A"})\n` +
            `• **Industry**: ${c.industry || "General"}\n` +
            `• **Lifecycle Stage**: ${c.status}\n` +
            `• **Qualification Score**: ${c.qualification_score ?? "N/A"}/100\n` +
            `• **Created At**: ${new Date(c.created_at).toLocaleDateString()}\n\n` +
            `**Sources & Attribution:**\n` +
            `[Internal] MySQL 8.4 database (\`customers\` table, parameterized email query)`;
        } else {
          answer =
            `### Customer Verification Report\n\n` +
            `• **Verification Status**: ✗ NOT FOUND in internal database\n` +
            `• **Detail**: No matching customer record exists in our CRM for the specified email address.\n\n` +
            `**Sources & Attribution:**\n` +
            `[Internal] MySQL 8.4 database (\`customers\` table, verified zero rows matched)`;
        }
      } else {
        answer = `Database verification failed: ${mysqlObs.error?.message || "Unknown error"}`;
      }
    } else if (webObs) {
      const results = webObs.data?.results || [];
      if (results.length > 0) {
        const summaryPoints = results
          .map((r: any) => `• ${r.title}\n  ${r.snippet}`)
          .join("\n\n");
        const sourcesList = results
          .map((r: any, idx: number) => `[${idx + 1}] ${r.title} — ${r.url}`)
          .join("\n");

        answer = `Based on verified web search observations for '${webObs.data.query}':\n\n${summaryPoints}\n\n**Sources & Attribution:**\n${sourcesList}`;
      } else {
        answer = `Web search query '${webObs.data?.query}' completed, but returned no matching public records.`;
      }
    } else if (timeObs && timeObs.success) {
      answer = `It is currently ${timeObs.data.formatted} (Timezone: ${timeObs.data.timezone}).`;
    } else if (calcObs && calcObs.success) {
      answer = `The calculated result for expression '${calcObs.data.expression}' is ${calcObs.data.result}.`;
    } else if (vectorObs) {
      if (vectorObs.success) {
        const results = vectorObs.data?.results || [];
        if (results.length > 0) {
          const formattedChunks = results
            .map(
              (r: any, idx: number) =>
                `### Result ${idx + 1} — Score: ${r.score}\n` +
                `**Document:** ${r.title} (\`${r.source}\`)\n` +
                `**Chunk ID:** \`${r.chunk_id}\`\n\n` +
                `> ${r.text.replace(/\n/g, "\n> ")}`
            )
            .join("\n\n");

          answer =
            `### Internal Knowledge Retrieval Results (Phase 11)\n\n` +
            `Retrieved ${results.length} relevant chunk(s) from internal knowledge vector store in ${vectorObs.data.duration_ms}ms:\n\n` +
            `${formattedChunks}\n\n` +
            `*(Note: Phase 11 ends at vector retrieval. The relevant chunks above are verified observations; full grounded generation begins in Phase 12).*`;
        } else {
          answer = `Vector search in internal knowledge index completed (${vectorObs.data?.duration_ms ?? 0}ms), but found no relevant documents matching the query.`;
        }
      } else {
        answer = `Internal knowledge vector search failed: ${vectorObs.error?.message || "Unknown retrieval error"}`;
      }
    } else if (ragObs) {
      if (ragObs.success && ragObs.data) {
        const citedSources = (ragObs.data.source_details || [])
          .map((s: any) => `• [${s.sourceId}] ${s.title} (${s.source}, similarity: ${typeof s.score === 'number' ? s.score.toFixed(4) : s.score})`)
          .join("\n");
        answer =
          `### Grounded Knowledge Synthesis (Phase 12 RAG)\n\n` +
          `${ragObs.data.answer}\n\n` +
          `**Attributed Sources:**\n${citedSources || "None"}`;
      } else {
        answer = `Internal knowledge RAG query failed: ${ragObs.error?.message || "Unknown error"}`;
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
    const lowerPrompt = promptText.toLowerCase();

    // 1. Final Synthesis Engine (AgentFinalSynthesisSchema)
    if (
      lowerPrompt.includes("final synthesis engine") ||
      lowerPrompt.includes("produce an authoritative, verified final report")
    ) {
      if (lowerPrompt.includes("time") || lowerPrompt.includes("calculate") || lowerPrompt.includes("clock")) {
        simulatedContent = JSON.stringify({
          summary: "Current time and arithmetic calculation verified successfully.",
          findings: [
            { title: "Current Time", value: "Verified server timestamp in requested timezone." },
            { title: "Calculation", value: "Expression evaluated successfully to 1000." },
          ],
          sources: ["Authoritative Server Clock", "Local Arithmetic Evaluator"],
          confidence: 0.99,
        });
      } else {
        simulatedContent = JSON.stringify({
          summary: "Apex Cloud is an existing customer verified in our internal MySQL database and supported by public web intelligence and internal knowledge documentation.",
          findings: [
            { title: "Customer Verification", value: "Verified active enterprise customer in MySQL CRM database." },
            { title: "External Footprint", value: "Cloud infrastructure and AI solutions provider." },
            { title: "Internal Knowledge", value: "Active SLA contract and master service agreement retrieved." },
          ],
          sources: [
            "Customer Database (MySQL)",
            "Web Search",
            "Internal Knowledge Base (Qdrant)",
          ],
          confidence: 0.94,
        });
      }
    }
    // 2. Structured Decision Engine (AgentDecisionSchema)
    else if (
      lowerPrompt.includes("execution decision engine") ||
      lowerPrompt.includes("current active step to execute:")
    ) {
      // Extract permitted tools specifically from the active step block:
      // "- Permitted Tools for this step: [tool1, tool2]"
      const permittedMatch = promptText.match(/Permitted Tools for this step:\s*\[(.*?)\]/i);
      const permittedToolsStr = permittedMatch ? permittedMatch[1].toLowerCase() : "";

      const activeHeaderMatch = promptText.match(/Step ID:\s*([a-zA-Z0-9_-]+)/i);
      const activeStepId = activeHeaderMatch ? activeHeaderMatch[1].toLowerCase() : "";

      if (permittedToolsStr.includes("rag_query") || activeStepId.includes("rag")) {
        simulatedContent = JSON.stringify({
          type: "CALL_TOOL",
          reasoningSummary: "Querying internal knowledge repository via RAG.",
          toolCall: {
            tool: "rag_query",
            arguments: { question: "Apex Cloud contract terms and SLA notes" },
          },
        });
      } else if (permittedToolsStr.includes("mysql_verify_customer") || activeStepId.includes("verify")) {
        simulatedContent = JSON.stringify({
          type: "CALL_TOOL",
          reasoningSummary: "Verifying customer records in internal MySQL CRM database.",
          toolCall: {
            tool: "mysql_verify_customer",
            arguments: { customerName: "Apex Cloud", email: "sarah@apexcloud.io" },
          },
        });
      } else if (permittedToolsStr.includes("web_search") || activeStepId.includes("web")) {
        simulatedContent = JSON.stringify({
          type: "CALL_TOOL",
          reasoningSummary: "Searching web for external company intelligence.",
          toolCall: {
            tool: "web_search",
            arguments: { query: "Apex Cloud products and overview" },
          },
        });
      } else if (permittedToolsStr.includes("get_current_time") || activeStepId.includes("time")) {
        const tzMatch = promptText.match(/(?:in\s+)([A-Za-z_/]+)/i);
        const timezone = tzMatch ? tzMatch[1] : "America/New_York";
        simulatedContent = JSON.stringify({
          type: "CALL_TOOL",
          reasoningSummary: "Checking authoritative system clock for requested timezone.",
          toolCall: { tool: "get_current_time", arguments: { timezone } },
        });
      } else if (permittedToolsStr.includes("calculate") || activeStepId.includes("calc")) {
        const calcMatch = promptText.match(/(\d+\s*[\+\-\*\/]\s*\d+)/);
        const expression = calcMatch ? calcMatch[1] : "50 * 20";
        simulatedContent = JSON.stringify({
          type: "CALL_TOOL",
          reasoningSummary: "Evaluating numerical expression.",
          toolCall: { tool: "calculate", arguments: { expression } },
        });
      } else {
        simulatedContent = JSON.stringify({
          type: "CONTINUE",
          reasoningSummary: "Step requirements satisfied from observation evidence.",
        });
      }
    }
    // 3. Replanning Engine (AdvancedAgentPlanSchema replan mode)
    else if (
      lowerPrompt.includes("replan") ||
      lowerPrompt.includes("execution obstacle") ||
      lowerPrompt.includes("remaining work to reach the original goal")
    ) {
      simulatedContent = JSON.stringify({
        goal: "Investigate company",
        summary: "Bounded replanned alternative discovery strategy",
        steps: [
          {
            id: "step_replan_1",
            order: 2,
            title: "Search Alternative Business Registry",
            description: "Query secondary public directory for corporate records",
            dependencies: ["step_1"],
            allowedTools: ["web_search"],
          },
        ],
      });
    }
    // 4. DAG Planning Engine (AdvancedAgentPlanSchema)
    else if (
      lowerPrompt.includes("lead planning engine") ||
      lowerPrompt.includes("dag execution plan") ||
      lowerPrompt.includes("dag rules")
    ) {
      if (lowerPrompt.includes("time") || lowerPrompt.includes("calculate") || lowerPrompt.includes("clock")) {
        simulatedContent = JSON.stringify({
          goal: "Time and calculation verification",
          summary: "Check current time and evaluate calculation",
          steps: [
            {
              id: "step_time",
              order: 1,
              title: "Check System Time",
              description: "Determine current time in requested timezone",
              dependencies: [],
              allowedTools: ["get_current_time"],
            },
            {
              id: "step_calc",
              order: 2,
              title: "Perform Calculation",
              description: "Compute arithmetic expression",
              dependencies: ["step_time"],
              allowedTools: ["calculate"],
            },
          ],
        });
      } else {
        simulatedContent = JSON.stringify({
          goal: "Research and verify Apex Cloud",
          summary: "Structured multi-step verification and profiling pipeline",
          steps: [
            {
              id: "step_1",
              order: 1,
              title: "Web Discovery",
              description: "Search web for external footprint and company profile",
              dependencies: [],
              allowedTools: ["web_search"],
            },
            {
              id: "step_2",
              order: 2,
              title: "Customer Database Verification",
              description: "Check internal MySQL customer table for Apex Cloud",
              dependencies: ["step_1"],
              allowedTools: ["mysql_verify_customer"],
            },
            {
              id: "step_3",
              order: 3,
              title: "Internal Knowledge Retrieval",
              description: "Search company knowledge documents for Apex Cloud",
              dependencies: ["step_2"],
              allowedTools: ["rag_query"],
            },
          ],
        });
      }
    }
    // 5. Legacy Task Planning (Phase 7/14 simple plans)
    else if (
      lowerPrompt.includes("plan") ||
      lowerPrompt.includes("goal") ||
      lowerPrompt.includes("steps")
    ) {
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
    }
    // 6. Generic Text Analysis Fallback
    else {
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
