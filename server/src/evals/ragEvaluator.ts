export interface RagEvaluationSample {
  id: string;
  query: string;
  retrievedSources: Array<{ sourceId: string; content: string }>;
  generatedAnswer: string;
  expectedElements?: string[];
}

export interface CitationValidationResult {
  valid: boolean;
  citedSources: string[];
  invalidCitations: string[];
  missingCitations: boolean;
}

export interface GroundednessScore {
  score: number; // 0.0 to 1.0
  grounded: boolean;
  supportedElements: string[];
  unsupportedElements: string[];
  citationValidation: CitationValidationResult;
  details: string;
}

export class RagEvaluator {
  /**
   * Validates citations in generated answers.
   * Ensures that any [S1], [S2] tokens exist in the retrieved sources,
   * and flags any invented source IDs (e.g., [S99]).
   */
  public static validateCitations(
    answer: string,
    availableSources: Array<{ sourceId: string }>
  ): CitationValidationResult {
    const citationRegex = /\[(S\d+)\]/g;
    const matches = Array.from(answer.matchAll(citationRegex)).map((m) => m[1]);
    const validSourceSet = new Set(availableSources.map((s) => s.sourceId));

    const invalidCitations: string[] = [];
    const citedSources: string[] = [];

    for (const citation of matches) {
      if (!validSourceSet.has(citation)) {
        if (!invalidCitations.includes(citation)) {
          invalidCitations.push(citation);
        }
      } else {
        if (!citedSources.includes(citation)) {
          citedSources.push(citation);
        }
      }
    }

    return {
      valid: invalidCitations.length === 0 && citedSources.length > 0,
      citedSources,
      invalidCitations,
      missingCitations: citedSources.length === 0,
    };
  }

  /**
   * Computes grounding score based on presence of expected elements and source content support.
   */
  public static evaluateGroundedness(sample: RagEvaluationSample): GroundednessScore {
    const citationCheck = this.validateCitations(sample.generatedAnswer, sample.retrievedSources);

    // If citations are completely fabricated, immediate grounding failure
    if (citationCheck.invalidCitations.length > 0) {
      return {
        score: 0.0,
        grounded: false,
        supportedElements: [],
        unsupportedElements: sample.expectedElements || [],
        citationValidation: citationCheck,
        details: `Fabricated citations detected: ${citationCheck.invalidCitations.join(", ")}`,
      };
    }

    const answerLower = sample.generatedAnswer.toLowerCase();
    const sourceTexts = sample.retrievedSources.map((s) => s.content.toLowerCase()).join(" ");

    const supportedElements: string[] = [];
    const unsupportedElements: string[] = [];

    if (sample.expectedElements && sample.expectedElements.length > 0) {
      for (const element of sample.expectedElements) {
        const elementLower = element.toLowerCase();
        // Element must be present in answer and backed by source text
        const inAnswer = answerLower.includes(elementLower);
        const inSource = sourceTexts.includes(elementLower);

        if (inAnswer && inSource) {
          supportedElements.push(element);
        } else {
          unsupportedElements.push(element);
        }
      }
    }

    const totalElements = (sample.expectedElements?.length) || 1;
    const elementsRatio = supportedElements.length / totalElements;
    const score = citationCheck.valid ? Number(elementsRatio.toFixed(2)) : 0.0;

    return {
      score,
      grounded: score >= 0.7 && citationCheck.valid,
      supportedElements,
      unsupportedElements,
      citationValidation: citationCheck,
      details: score >= 0.7 ? "Answer grounded with valid citations" : "Insufficient source support or ungrounded claims",
    };
  }

  /**
   * Evaluates retrieval precision (ratio of retrieved chunks that match the query intent)
   */
  public static evaluateRetrievalPrecision(
    retrievedChunks: Array<{ sourceId: string; content: string }>,
    expectedSources: string[]
  ): number {
    if (retrievedChunks.length === 0) return 0;
    const expectedSet = new Set(expectedSources);
    const relevantRetrieved = retrievedChunks.filter((c) => expectedSet.has(c.sourceId));
    return Number((relevantRetrieved.length / retrievedChunks.length).toFixed(2));
  }
}
