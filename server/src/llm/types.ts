import OpenAI from "openai";
import { z } from "zod";

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  name?: string;
  tool_call_id?: string;
}

export interface NormalizedToolCall {
  tool: string;
  arguments: Record<string, unknown>;
  toolCallId?: string;
}

export interface GenerateOptions {
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  responseFormat?: "text" | "json_object";
  tools?: OpenAI.Chat.Completions.ChatCompletionTool[];
  toolChoice?: "auto" | "none" | "required";
}

export interface LLMStepResponse {
  content: string | null;
  toolCall: NormalizedToolCall | null;
  telemetry: LLMTelemetry;
}

export interface LLMTelemetry {
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  latencyMs: number;
  estimatedCostUsd: number;
  status: "SUCCESS" | "FAILED";
}

export interface LLMResult<T = string> {
  data: T;
  telemetry: LLMTelemetry;
}

// Zod Schema for Phase 6 Structured Analysis Endpoint
export const SummarizeAnalysisSchema = z.object({
  summary: z.string().min(5, "Summary must be at least 5 characters long"),
  topics: z.array(z.string()).min(1, "At least one topic must be identified"),
  sentiment: z.enum(["POSITIVE", "NEUTRAL", "NEGATIVE"]),
  confidence: z.number().min(0).max(1, "Confidence must be between 0 and 1"),
  keyInsights: z.array(z.string()).optional(),
});

export type SummarizeAnalysis = z.infer<typeof SummarizeAnalysisSchema>;
