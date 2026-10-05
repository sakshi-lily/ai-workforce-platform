import { z } from "zod";
import { executeChatCompletion } from "./client";
import { ChatMessage, GenerateOptions, LLMResult, SummarizeAnalysisSchema, SummarizeAnalysis } from "./types";

const DEFAULT_SYSTEM_PROMPT =
  "You are an AI assistant for the AI Workforce Platform. Provide direct, accurate, and concise technical responses.";

/**
 * Generates natural language text using system/user message separation.
 */
export async function generateText(
  prompt: string,
  systemPrompt: string = DEFAULT_SYSTEM_PROMPT,
  options: GenerateOptions = {}
): Promise<LLMResult<string>> {
  const trimmed = prompt.trim();
  if (!trimmed) {
    throw new Error("Prompt cannot be empty");
  }

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: trimmed },
  ];

  const { content, telemetry } = await executeChatCompletion(messages, {
    ...options,
    responseFormat: "text",
  });

  return {
    data: content.trim(),
    telemetry,
  };
}

/**
 * Generates and validates structured JSON output against a runtime Zod schema.
 * Rejects malformed responses, missing fields, or incorrect types.
 */
export async function generateStructured<T>(
  prompt: string,
  schema: z.ZodType<T>,
  systemPrompt: string = DEFAULT_SYSTEM_PROMPT,
  options: GenerateOptions = {}
): Promise<LLMResult<T>> {
  const trimmed = prompt.trim();
  if (!trimmed) {
    throw new Error("Prompt cannot be empty");
  }

  const structuredSystemPrompt = `${systemPrompt}\nIMPORTANT: You must respond ONLY with a valid, raw JSON object matching the requested schema. Do not include markdown code block backticks.`;

  const messages: ChatMessage[] = [
    { role: "system", content: structuredSystemPrompt },
    { role: "user", content: trimmed },
  ];

  const { content, telemetry } = await executeChatCompletion(messages, {
    ...options,
    responseFormat: "json_object",
  });

  // 1. JSON Parse Check
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(content);
  } catch (err) {
    throw new Error(`LLM output was not valid JSON: ${err instanceof Error ? err.message : "Parse failed"}`);
  }

  // 2. Runtime Schema Validation Check
  const validationResult = schema.safeParse(parsedJson);
  if (!validationResult.success) {
    const errorDetails = validationResult.error.issues
      .map((e) => `${e.path.join(".")}: ${e.message}`)
      .join(", ");
    throw new Error(`Structured output validation failed: ${errorDetails}`);
  }

  return {
    data: validationResult.data,
    telemetry,
  };
}

/**
 * Specialized helper for customer/task analysis and summarization.
 */
export async function analyzeContent(
  text: string,
  systemPrompt: string = "Analyze the provided text and produce structured business intelligence."
): Promise<LLMResult<SummarizeAnalysis>> {
  return generateStructured<SummarizeAnalysis>(
    `Analyze and summarize the following text:\n\n${text}`,
    SummarizeAnalysisSchema,
    systemPrompt
  );
}
