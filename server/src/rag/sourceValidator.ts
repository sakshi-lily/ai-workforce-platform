import { RagLLMOutput, RagLLMOutputSchema } from "./schemas";
import { RagContext, RagSource } from "./types";

export interface SourceValidationResult {
  valid: boolean;
  sanitizedOutput: RagLLMOutput;
  validatedSources: RagSource[];
  rejectedSourceIds: string[];
  error?: string;
}

/**
 * Phase 12 — Source & Citation Validator
 *
 * Verifies citation integrity and guards against hallucinated or fabricated citations.
 * Ensures every source cited by the LLM strictly exists in the application-controlled retrieval set.
 */
export class RagSourceValidator {
  /**
   * Validates and sanitizes raw LLM output against the trusted context.
   */
  public validate(rawJson: unknown, context: RagContext): SourceValidationResult {
    // 1. Validate structure against Zod RagLLMOutputSchema
    const parseResult = RagLLMOutputSchema.safeParse(rawJson);
    if (!parseResult.success) {
      const details = parseResult.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ");
      return {
        valid: false,
        sanitizedOutput: {
          answer: "Output schema validation failed.",
          grounded: false,
          sources: [],
          insufficient_context: true,
        },
        validatedSources: [],
        rejectedSourceIds: [],
        error: `RAG output schema violation: ${details}`,
      };
    }

    const output = parseResult.data;
    const validatedSources: RagSource[] = [];
    const rejectedSourceIds: string[] = [];

    // 2. Validate Citation Integrity (Section 25 & 26)
    for (const sourceId of output.sources) {
      const matchedSource = context.sourceMap[sourceId];
      if (matchedSource) {
        validatedSources.push(matchedSource);
      } else {
        // Model fabricated or cited a non-existent source ID (e.g. S99)
        rejectedSourceIds.push(sourceId);
      }
    }

    // If the model fabricated citations, reject the output
    if (rejectedSourceIds.length > 0) {
      return {
        valid: false,
        sanitizedOutput: {
          answer: output.answer,
          grounded: false,
          sources: validatedSources.map((s) => s.sourceId),
          insufficient_context: true,
        },
        validatedSources,
        rejectedSourceIds,
        error: `Fabricated citation detected: Model cited non-existent source ID(s): ${rejectedSourceIds.join(", ")}. Valid source IDs are: [${Object.keys(context.sourceMap).join(", ")}]`,
      };
    }

    // 3. Grounding Consistency Verification (Section 28)
    let isGrounded = output.grounded;
    let isInsufficient = output.insufficient_context;

    if (context.totalChunks === 0) {
      // If no chunks were retrieved, it is impossible for the answer to be grounded
      isGrounded = false;
      isInsufficient = true;
    }

    if (isInsufficient) {
      isGrounded = false;
      // Insufficient context cannot claim citations
      output.sources = [];
    } else if (isGrounded && validatedSources.length === 0 && context.totalChunks > 0) {
      // Grounded answer must cite at least one source
      isGrounded = false;
    }

    const sanitizedOutput: RagLLMOutput = {
      answer: output.answer,
      grounded: isGrounded,
      sources: validatedSources.map((s) => s.sourceId),
      insufficient_context: isInsufficient,
    };

    return {
      valid: true,
      sanitizedOutput,
      validatedSources,
      rejectedSourceIds: [],
    };
  }
}

// Global Singleton
export const ragSourceValidator = new RagSourceValidator();
