/**
 * Embedding Provider — Abstraction Layer
 *
 * Extensible embedding interface. Supports graceful degradation:
 *   - fastembed installed       → local ONNX inference (384-dim bge-small)
 *   - @huggingface/transformers → pure JS WASM inference (384-dim MiniLM)
 *   - nothing installed         → null provider, search falls back to BM25
 *
 * Architecture inspired by Mem0's multi-provider embedding design.
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
 *
 * Provider priority:
 *   1. fastembed (fastest, but requires native ONNX binding)
 *   2. @huggingface/transformers (pure JS, best cross-platform compatibility)
 *   3. null → fulltext search only (BM25)
 */
export async function getEmbeddingProvider(): Promise<EmbeddingProvider | null> {
  if (initialized) return provider;
  initialized = true;

  // Try fastembed first (local ONNX, fastest)
  try {
    const { FastEmbedProvider } = await import('./fastembed-provider.js');
    provider = await FastEmbedProvider.create();
    console.error(`[memorix] Embedding provider: ${provider!.name} (${provider!.dimensions}d)`);
    return provider;
  } catch {
    // fastembed not installed — try next
  }

  // Try @huggingface/transformers (pure JS, no native deps)
  try {
    const { TransformersProvider } = await import('./transformers-provider.js');
    provider = await TransformersProvider.create();
    console.error(`[memorix] Embedding provider: ${provider!.name} (${provider!.dimensions}d)`);
    return provider;
  } catch {
    // transformers not installed — degrade to fulltext
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
