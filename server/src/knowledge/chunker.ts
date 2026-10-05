import crypto from "crypto";

export interface ChunkMetadata {
  documentId: string;
  version: number;
  chunkIndex: number;
  totalChunks: number;
  chunkId: string;
  pointId: string;
  characterCount: number;
}

export interface DocumentChunk {
  chunkId: string;
  pointId: string; // Deterministic UUID for Qdrant point
  documentId: string;
  version: number;
  chunkIndex: number;
  text: string;
  metadata: ChunkMetadata;
}

export interface ChunkerOptions {
  targetChunkSize?: number; // Target size in characters (e.g., 400-600)
  overlap?: number; // Context overlap in characters (e.g., 50-80)
}

/**
 * Generates a deterministic RFC 4122 v4-formatted UUID from a stable string identifier.
 * Ensures idempotent point upserts into Qdrant across re-indexing runs.
 */
export function generateDeterministicPointId(stableChunkId: string): string {
  const hash = crypto.createHash("sha256").update(stableChunkId).digest("hex");
  // Format as 8-4-4-4-12 UUID
  return [
    hash.substring(0, 8),
    hash.substring(8, 12),
    "4" + hash.substring(13, 16), // Set version 4
    ((parseInt(hash.substring(16, 18), 16) & 0x3f) | 0x80).toString(16).padStart(2, "0") + hash.substring(18, 20),
    hash.substring(20, 32),
  ].join("-");
}

/**
 * Deterministic, paragraph-aware text chunker with bounded character overlap.
 * Prefers natural paragraph and sentence boundaries.
 */
export function chunkText(
  documentId: string,
  text: string,
  version: number = 1,
  options: ChunkerOptions = {}
): DocumentChunk[] {
  const targetSize = options.targetChunkSize ?? 450;
  const overlap = options.overlap ?? 60;

  // Split by double newline (paragraphs) first
  const rawParagraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  const rawChunks: string[] = [];
  let currentBuffer = "";

  for (const para of rawParagraphs) {
    if ((currentBuffer + "\n\n" + para).trim().length <= targetSize) {
      currentBuffer = currentBuffer ? currentBuffer + "\n\n" + para : para;
    } else {
      if (currentBuffer.length > 0) {
        rawChunks.push(currentBuffer.trim());
      }

      // If the paragraph itself exceeds targetSize, split by sentences or bounded length
      if (para.length > targetSize) {
        const sentences = para.split(/(?<=[.?!])\s+/);
        let sentenceBuffer = "";
        for (const sentence of sentences) {
          if ((sentenceBuffer + " " + sentence).trim().length <= targetSize) {
            sentenceBuffer = sentenceBuffer ? sentenceBuffer + " " + sentence : sentence;
          } else {
            if (sentenceBuffer.length > 0) {
              rawChunks.push(sentenceBuffer.trim());
            }
            sentenceBuffer = sentence;
          }
        }
        if (sentenceBuffer.length > 0) {
          currentBuffer = sentenceBuffer.trim();
        } else {
          currentBuffer = "";
        }
      } else {
        currentBuffer = para;
      }
    }
  }

  if (currentBuffer.trim().length > 0) {
    rawChunks.push(currentBuffer.trim());
  }

  // If text was short and produced no paragraphs, use the raw text if non-empty
  if (rawChunks.length === 0 && text.trim().length > 0) {
    rawChunks.push(text.trim());
  }

  // Apply deterministic overlap and build chunk objects
  const totalChunks = rawChunks.length;
  const chunks: DocumentChunk[] = [];

  for (let i = 0; i < totalChunks; i++) {
    let chunkContent = rawChunks[i];

    // If there is a previous chunk, prefix with overlap tail
    if (i > 0 && overlap > 0) {
      const prevChunk = rawChunks[i - 1];
      const overlapText = prevChunk.slice(-overlap).trim();
      if (overlapText.length > 0 && !chunkContent.startsWith(overlapText)) {
        chunkContent = `[...${overlapText}] ` + chunkContent;
      }
    }

    const chunkIndex = i;
    const stableChunkId = `${documentId}:v${version}:chunk-${String(chunkIndex).padStart(3, "0")}`;
    const pointId = generateDeterministicPointId(stableChunkId);

    chunks.push({
      chunkId: stableChunkId,
      pointId,
      documentId,
      version,
      chunkIndex,
      text: chunkContent,
      metadata: {
        documentId,
        version,
        chunkIndex,
        totalChunks,
        chunkId: stableChunkId,
        pointId,
        characterCount: chunkContent.length,
      },
    });
  }

  return chunks;
}
