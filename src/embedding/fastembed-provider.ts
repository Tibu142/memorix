/**
 * FastEmbed Provider
 *
 * Local ONNX-based embedding using fastembed (Qdrant).
 * Model: BAAI/bge-small-en-v1.5 (384 dimensions, ~30MB)
 *
 * This is an optional dependency — if fastembed is not installed,
 * the provider module gracefully falls back to fulltext-only search.
 */

import type { EmbeddingProvider } from './provider.js';

// Simple in-memory cache to avoid recomputing embeddings
const cache = new Map<string, number[]>();
const MAX_CACHE_SIZE = 5000;

export class FastEmbedProvider implements EmbeddingProvider {
  readonly name = 'fastembed-bge-small';
  readonly dimensions = 384;

  private model: { embed: (docs: string[], batchSize?: number) => AsyncGenerator<number[][]>; queryEmbed: (query: string) => Promise<number[]> };

  private constructor(model: FastEmbedProvider['model']) {
    this.model = model;
  }

  /**
   * Initialize the FastEmbed provider.
   * Downloads model on first use (~30MB), cached locally after.
   */
  static async create(): Promise<FastEmbedProvider> {
    // Dynamic import — throws if fastembed is not installed
    const { EmbeddingModel, FlagEmbedding } = await import('fastembed');
    const model = await FlagEmbedding.init({
      model: EmbeddingModel.BGESmallENV15,
    });
    return new FastEmbedProvider(model);
  }

  async embed(text: string): Promise<number[]> {
    // Check cache first
    const cached = cache.get(text);
    if (cached) return cached;

    const result = await this.model.queryEmbed(text);
    this.cacheSet(text, result);
    return result;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    const results: number[][] = new Array(texts.length);
    const uncachedIndices: number[] = [];
    const uncachedTexts: string[] = [];

    // Check cache for each text
    for (let i = 0; i < texts.length; i++) {
      const cached = cache.get(texts[i]);
      if (cached) {
        results[i] = cached;
      } else {
        uncachedIndices.push(i);
        uncachedTexts.push(texts[i]);
      }
    }

    // Batch embed uncached texts
    if (uncachedTexts.length > 0) {
      let batchIdx = 0;
      for await (const batch of this.model.embed(uncachedTexts, 64)) {
        for (const vec of batch) {
          const originalIdx = uncachedIndices[batchIdx];
          results[originalIdx] = vec;
          this.cacheSet(uncachedTexts[batchIdx], vec);
          batchIdx++;
        }
      }
    }

    return results;
  }

  private cacheSet(key: string, value: number[]): void {
    // Evict oldest entries if cache is full
    if (cache.size >= MAX_CACHE_SIZE) {
      const firstKey = cache.keys().next().value;
      if (firstKey !== undefined) cache.delete(firstKey);
    }
    cache.set(key, value);
  }
}
