import OpenAI from "openai";
import crypto from "crypto";
import { EmbeddingProvider } from "./types";

/**
 * Standard configuration for internal knowledge vectors
 */
export const EMBEDDING_CONFIG = {
  MODEL: "text-embedding-3-small",
  DIMENSIONS: 1536,
  DISTANCE: "Cosine" as const,
  COLLECTION_NAME: "internal_knowledge",
} as const;

/**
 * Normalizes an arbitrary numerical vector to unit length (L2 norm = 1.0)
 * so that dot product equals cosine similarity.
 */
function normalizeVector(vector: number[]): number[] {
  let sumSq = 0;
  for (let i = 0; i < vector.length; i++) {
    sumSq += vector[i] * vector[i];
  }
  const norm = Math.sqrt(sumSq) || 1e-12;
  return vector.map((v) => v / norm);
}

/**
 * Deterministic semantic word clusters for local offline vector generation.
 * Maps high-level enterprise concepts into overlapping deterministic dimension clusters.
 */
const SEMANTIC_CLUSTERS: Record<string, number> = {
  remote: 42,
  telework: 42,
  home: 42,
  workplace: 42,
  policy: 42,
  attendance: 42,
  hours: 42,
  approval: 42,
  employee: 42,

  support: 88,
  ticket: 88,
  sla: 88,
  response: 88,
  escalation: 88,
  customer: 88,
  urgent: 88,

  security: 150,
  encryption: 150,
  compliance: 150,
  confidential: 150,
  retention: 150,
  tls: 150,
  access: 150,

  sales: 220,
  icp: 220,
  qualification: 220,
  lead: 220,
  prospect: 220,
  pipeline: 220,
  deal: 220,

  product: 310,
  platform: 310,
  architecture: 310,
  agent: 310,
  workforce: 310,
  governance: 310,
};

/**
 * Deterministic local embedding provider for offline environments, unit tests,
 * and deterministic regression testing.
 */
export class DeterministicLocalEmbeddingProvider implements EmbeddingProvider {
  public readonly name = "deterministic-local";
  public readonly model = EMBEDDING_CONFIG.MODEL;
  public readonly dimensions = EMBEDDING_CONFIG.DIMENSIONS;

  public async embedText(text: string): Promise<number[]> {
    const vector = new Array(this.dimensions).fill(0);
    const words = text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 1);

    // 1. Base deterministic projection from word hashes
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      const hash = crypto.createHash("sha256").update(word).digest();
      const primaryIndex = hash.readUInt16BE(0) % this.dimensions;
      const secondaryIndex = hash.readUInt16BE(2) % this.dimensions;
      const weight = (hash.readInt8(4) / 128.0) * (1.0 / Math.sqrt(words.length));

      vector[primaryIndex] += weight;
      vector[secondaryIndex] += weight * 0.5;

      // 2. Add semantic cluster resonance
      for (const [key, clusterBase] of Object.entries(SEMANTIC_CLUSTERS)) {
        if (word.includes(key) || key.includes(word)) {
          const clusterIndex = (clusterBase * 3 + (i % 5)) % this.dimensions;
          vector[clusterIndex] += 0.85;
          vector[(clusterIndex + 7) % this.dimensions] += 0.45;
        }
      }
    }

    // Return normalized unit vector
    return normalizeVector(vector);
  }

  public async embedBatch(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map((t) => this.embedText(t)));
  }
}

/**
 * Real OpenAI embedding provider (when valid API key is present)
 */
export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  public readonly name = "openai";
  public readonly model = EMBEDDING_CONFIG.MODEL;
  public readonly dimensions = EMBEDDING_CONFIG.DIMENSIONS;
  private client: OpenAI;

  constructor(apiKey?: string) {
    this.client = new OpenAI({
      apiKey: apiKey || process.env.OPENAI_API_KEY,
    });
  }

  public async embedText(text: string): Promise<number[]> {
    const response = await this.client.embeddings.create({
      model: this.model,
      input: text.replace(/\n+/g, " "),
      dimensions: this.dimensions,
    });

    return response.data[0].embedding;
  }

  public async embedBatch(texts: string[]): Promise<number[][]> {
    const cleanTexts = texts.map((t) => t.replace(/\n+/g, " "));
    const response = await this.client.embeddings.create({
      model: this.model,
      input: cleanTexts,
      dimensions: this.dimensions,
    });

    return response.data.map((d) => d.embedding);
  }
}

// Active singleton instance
let activeEmbeddingProvider: EmbeddingProvider | null = null;

export function getEmbeddingProvider(): EmbeddingProvider {
  if (activeEmbeddingProvider) {
    return activeEmbeddingProvider;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  const forceMock = process.env.MOCK_AI === "true" || process.env.EMBEDDING_PROVIDER === "local";

  if (!forceMock && apiKey && !apiKey.startsWith("demo_") && apiKey.length > 20) {
    activeEmbeddingProvider = new OpenAIEmbeddingProvider(apiKey);
  } else {
    activeEmbeddingProvider = new DeterministicLocalEmbeddingProvider();
  }

  return activeEmbeddingProvider;
}

export function setEmbeddingProvider(provider: EmbeddingProvider | null): void {
  activeEmbeddingProvider = provider;
}
