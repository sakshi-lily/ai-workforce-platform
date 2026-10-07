import { ScoredVectorResult } from "../vector/types";
import { RagContext, RagSource } from "./types";

export interface ContextBuilderOptions {
  maxChunks?: number; // Default: 4
  maxCharsPerChunk?: number; // Default: 800
  maxTotalChars?: number; // Default: 3200
  scoreThreshold?: number; // Optional relevance threshold
}

/**
 * Phase 12 — RAG Context Builder
 *
 * Owns deterministic context construction from semantic vector chunks:
 * 1. Enforces resource limits (max chunks, max characters)
 * 2. Assigns stable, application-owned source identifiers ([S1], [S2]...)
 * 3. Sorts deterministically by similarity score
 * 4. Preserves source attribution and metadata
 * 5. Sanitizes document content to ensure it is treated strictly as data
 */
export class RagContextBuilder {
  private readonly defaultOptions: Required<ContextBuilderOptions> = {
    maxChunks: 4,
    maxCharsPerChunk: 800,
    maxTotalChars: 3200,
    scoreThreshold: 0.0,
  };

  /**
   * Builds bounded, structured context from normalized retrieval results.
   */
  public buildContext(
    retrievedChunks: ScoredVectorResult[],
    options: ContextBuilderOptions = {}
  ): RagContext {
    const opts = { ...this.defaultOptions, ...options };

    // 1. Filter by score threshold (if configured)
    let filtered = retrievedChunks.filter(
      (c) => c.score >= (opts.scoreThreshold ?? 0)
    );

    // 2. Sort deterministically by similarity score (descending)
    filtered.sort((a, b) => b.score - a.score);

    // 3. Bound number of chunks
    const candidateChunks = filtered.slice(0, opts.maxChunks);

    const sources: RagSource[] = [];
    const sourceMap: Record<string, RagSource> = {};
    const contextBlocks: string[] = [];
    let currentTotalChars = 0;

    for (let i = 0; i < candidateChunks.length; i++) {
      const chunk = candidateChunks[i] as any;
      const sourceId = `S${i + 1}`; // [S1], [S2], ...

      const rawText = String(chunk.text || chunk.payload?.text || "");
      // Bound character length per chunk
      const boundedText = rawText.slice(0, opts.maxCharsPerChunk).trim();

      // Check total context budget
      const blockEstimatedSize = boundedText.length + 150;
      if (currentTotalChars + blockEstimatedSize > opts.maxTotalChars && sources.length > 0) {
        break; // Reached context budget limit
      }

      const documentId = String(chunk.document_id || chunk.payload?.document_id || "");
      const chunkId = String(chunk.chunk_id || chunk.payload?.chunk_id || "");
      const title = String(chunk.title || chunk.payload?.title || "Untitled Document");
      const source = String(chunk.source || chunk.payload?.source || "internal");
      const version = typeof chunk.version === "number" ? chunk.version : (typeof chunk.payload?.version === "number" ? chunk.payload.version : 1);
      const chunkIndex = typeof chunk.chunk_index === "number" ? chunk.chunk_index : (typeof chunk.payload?.chunk_index === "number" ? chunk.payload.chunk_index : 0);
      const score = typeof chunk.score === "number" ? chunk.score : 0;

      const ragSource: RagSource = {
        sourceId,
        documentId,
        chunkId,
        title,
        source,
        score,
        text: boundedText,
        version,
        chunkIndex,
      };

      sources.push(ragSource);
      sourceMap[sourceId] = ragSource;

      // Deterministic data block (Prompt Injection Defense: data is isolated)
      const block = [
        `[Source ${sourceId}] [${sourceId}]`,
        `Title: ${title}`,
        `Document: ${source}`,
        `Chunk ID: ${chunkId}`,
        `Relevance Score: ${score}`,
        `Content:`,
        `"""`,
        boundedText,
        `"""`,
      ].join("\n");

      contextBlocks.push(block);
      currentTotalChars += block.length;
    }

    const formattedContext = contextBlocks.join("\n\n");

    return {
      sources,
      formattedContext,
      totalCharacters: formattedContext.length,
      totalChunks: sources.length,
      sourceMap,
    };
  }
}

// Global Singleton
export const ragContextBuilder = new RagContextBuilder();
