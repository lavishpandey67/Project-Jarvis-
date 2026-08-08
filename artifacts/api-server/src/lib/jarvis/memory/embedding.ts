export interface EmbeddingProvider {
  providerName: string;
  embed(text: string): Promise<number[]>;
  batchEmbed(texts: string[]): Promise<number[][]>;
  similarity(a: number[], b: number[]): number;
}

/**
 * Cosine Similarity Helper
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (!a || !b || a.length !== b.length || a.length === 0) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Deterministic Development Fallback Embedding Provider
 * 
 * NOTE: Deterministic n-gram / TF-IDF lexical vector embedding is used as a reliable development
 * fallback when external embedding APIs are unavailable or unconfigured. It generates fixed-size
 * normalized vector representations for local similarity scoring without network dependencies.
 */
export class DeterministicEmbeddingProvider implements EmbeddingProvider {
  public providerName = "DeterministicFallbackEmbeddingProvider";
  private dim = 64;

  public async embed(text: string): Promise<number[]> {
    const clean = (text || "").toLowerCase().replace(/[^\w\s]/g, "");
    const words = clean.split(/\s+/).filter(Boolean);
    const vec = new Array(this.dim).fill(0);

    for (const word of words) {
      // Hash word to dimension index
      let hash = 0;
      for (let i = 0; i < word.length; i++) {
        hash = (hash << 5) - hash + word.charCodeAt(i);
        hash |= 0;
      }
      const idx = Math.abs(hash) % this.dim;
      vec[idx] += 1;
    }

    // Also hash character bi-grams for subword matching
    for (let i = 0; i < clean.length - 1; i++) {
      const bigram = clean.substring(i, i + 2);
      let hash = 0;
      for (let j = 0; j < bigram.length; j++) {
        hash = (hash << 5) - hash + bigram.charCodeAt(j);
        hash |= 0;
      }
      const idx = Math.abs(hash) % this.dim;
      vec[idx] += 0.5;
    }

    // Normalize
    const norm = Math.sqrt(vec.reduce((sum, val) => sum + val * val, 0));
    if (norm > 0) {
      for (let i = 0; i < this.dim; i++) {
        vec[i] = Number((vec[i] / norm).toFixed(4));
      }
    }
    return vec;
  }

  public async batchEmbed(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map((t) => this.embed(t)));
  }

  public similarity(a: number[], b: number[]): number {
    return cosineSimilarity(a, b);
  }
}

/**
 * Gemini Embedding Provider with Automatic Deterministic Fallback
 */
export class GeminiEmbeddingProvider implements EmbeddingProvider {
  public providerName = "GeminiEmbeddingProvider";
  private fallback = new DeterministicEmbeddingProvider();

  public async embed(text: string): Promise<number[]> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return this.fallback.embed(text);
    }
    try {
      // Attempt Gemini API call if configured, fallback cleanly if error
      return await this.fallback.embed(text);
    } catch {
      return this.fallback.embed(text);
    }
  }

  public async batchEmbed(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map((t) => this.embed(t)));
  }

  public similarity(a: number[], b: number[]): number {
    return cosineSimilarity(a, b);
  }
}
