/**
 * Phase 15 — Final Task Synthesis & Grounded Result Formatter
 *
 * Implements grounded conclusion generation:
 * 1. Prompts LLM for final synthesis strictly based on completed observations.
 * 2. Structures summary, key findings, and authoritative source citations.
 * 3. Enforces multi-source attribution (Customer CRM, Web Search, Qdrant Vector Knowledge).
 */

import { generateStructured } from "../llm/service";
import { AgentFinalSynthesisSchema, AgentFinalSynthesisDTO } from "./agentSchemas";
import {
  AdvancedAgentPlan,
  AgentObservation,
  AgentFinalSynthesis,
} from "./agentTypes";

const SYNTHESIS_SYSTEM_PROMPT = `
You are the Final Synthesis Engine for the AI Workforce Platform.
Your purpose is to produce an authoritative, verified final report answering the user's task.

STRICT OPERATIONAL RULES:
1. Ground your answers strictly in the verified observations provided.
2. Formulate 1 to 5 concise key findings.
3. Cite actual evidence sources (e.g. "Customer Database (MySQL)", "Web Search", "Internal Knowledge (Qdrant)").
4. Assign an overall confidence score from 0.0 to 1.0.
5. Never invent or hallucinate facts not present in the evidence.
`;

export class AgentResultSynthesizer {
  /**
   * Synthesizes verified final task report from execution plan and recorded observations.
   */
  public static async synthesizeFinalResult(
    synthesisPrompt: string,
    observations: AgentObservation[]
  ): Promise<AgentFinalSynthesis> {
    const llmResult = await generateStructured<AgentFinalSynthesisDTO>(
      synthesisPrompt,
      AgentFinalSynthesisSchema,
      SYNTHESIS_SYSTEM_PROMPT
    );

    const data = llmResult.data;

    // Build authoritative sources set from actual executed tools
    const sourcesSet = new Set<string>(data.sources || []);
    for (const obs of observations) {
      if (obs.tool === "mysql_verify_customer") {
        sourcesSet.add("Customer Database (MySQL)");
      }
      if (obs.tool === "web_search") {
        sourcesSet.add("Web Search");
      }
      if (obs.tool === "vector_search" || obs.tool === "rag_query") {
        sourcesSet.add("Internal Knowledge Base (Qdrant)");
      }
      if (obs.tool === "get_current_time") {
        sourcesSet.add("Authoritative Server Clock");
      }
      if (obs.tool === "calculate") {
        sourcesSet.add("Arithmetic Engine");
      }
    }

    if (sourcesSet.size === 0) {
      sourcesSet.add("Language Model Synthesis");
    }

    return {
      summary: data.summary,
      findings: data.findings || [],
      sources: Array.from(sourcesSet),
      confidence: typeof data.confidence === "number" ? Math.max(0, Math.min(1, data.confidence)) : 0.9,
    };
  }
}
