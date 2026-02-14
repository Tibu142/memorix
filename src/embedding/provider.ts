/**
 * Embedding Provider — Abstraction Layer
 *
 * Extensible embedding interface. Supports graceful degradation:
 *   - fastembed installed → local ONNX inference (384-dim bge-small)
 *   - nothing installed   → null provider, search falls back to BM25
 *
 * Architecture inspired by MemCP's `get_provider()` pattern.
 * Adding a new embedding backend only requires implementing EmbeddingProvider.
 */

export interface EmbeddingProvider {
  /** Provider name for logging/cache keys */
  readonly name: string;
  /** Vector dimensions (e.g., 384 for bge-small) */
  readonly dimensions: number;
  /** Generate embedding for a single text */
  embed(text: string): Promise<number[]>;
  /** Generate embeddings for multiple texts (batch) */
  embedBatch(texts: string[]): Promise<number[][]>;
}

/** Singleton provider instance (null = not available) */
let provider: EmbeddingProvider | null = null;
let initialized = false;

/**
 * Get the embedding provider. Returns null if none available.
 * Lazy-initialized on first call.
 */
export async function getEmbeddingProvider(): Promise<EmbeddingProvider | null> {
  if (initialized) return provider;
  initialized = true;

  // Try fastembed first (local ONNX, recommended)
  try {
    const { FastEmbedProvider } = await import('./fastembed-provider.js');
    provider = await FastEmbedProvider.create();
    console.error(`[memorix] Embedding provider: ${provider!.name} (${provider!.dimensions}d)`);
    return provider;
  } catch {
    // fastembed not installed — that's fine, degrade gracefully
  }

  console.error('[memorix] No embedding provider available — using fulltext search only');
  return null;
}

/**
 * Check if vector search is available.
 */
export async function isVectorSearchAvailable(): Promise<boolean> {
  const p = await getEmbeddingProvider();
  return p !== null;
}

/**
 * Reset provider (for testing).
 */
export function resetProvider(): void {
  provider = null;
  initialized = false;
}
