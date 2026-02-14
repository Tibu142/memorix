/**
 * Embedding Provider Tests
 *
 * Tests the embedding abstraction layer with graceful degradation.
 * Since fastembed is an optional dependency, these tests verify
 * that the system works correctly WITHOUT it (fulltext fallback).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { getEmbeddingProvider, isVectorSearchAvailable, resetProvider } from '../../src/embedding/provider.js';
import { resetDb, isEmbeddingEnabled, generateEmbedding, getDb } from '../../src/store/orama-store.js';

beforeEach(() => {
  resetProvider();
  resetDb();
});

describe('Embedding Provider', () => {
  describe('graceful degradation (no fastembed installed)', () => {
    it('should return null provider when fastembed is not installed', async () => {
      const provider = await getEmbeddingProvider();
      // In test environment, fastembed is not installed → null
      expect(provider).toBeNull();
    });

    it('should report vector search as unavailable', async () => {
      const available = await isVectorSearchAvailable();
      expect(available).toBe(false);
    });

    it('should return null for generateEmbedding', async () => {
      const embedding = await generateEmbedding('test text');
      expect(embedding).toBeNull();
    });

    it('should create DB without embedding field in schema', async () => {
      const db = await getDb();
      expect(db).toBeDefined();
      expect(isEmbeddingEnabled()).toBe(false);
    });
  });

  describe('fulltext search still works without embeddings', () => {
    it('should search using fulltext when no embedding provider', async () => {
      const { storeObservation, initObservations } = await import('../../src/memory/observations.js');
      const { compactSearch } = await import('../../src/compact/engine.js');
      const { promises: fs } = await import('node:fs');
      const path = await import('node:path');
      const os = await import('node:os');

      const testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'memorix-embed-'));
      await resetDb();
      await initObservations(testDir);

      await storeObservation({
        entityName: 'test',
        type: 'decision',
        title: 'Use fastembed for local embeddings',
        narrative: 'Chose fastembed because it runs locally without API',
        projectId: 'test/embed',
      });

      const result = await compactSearch({ query: 'fastembed', projectId: 'test/embed' });
      expect(result.entries).toHaveLength(1);
      expect(result.entries[0].title).toContain('fastembed');
    });
  });

  describe('provider interface', () => {
    it('should reset cleanly', async () => {
      await getEmbeddingProvider(); // initializes
      resetProvider();
      // Should be re-initializable
      const provider = await getEmbeddingProvider();
      expect(provider).toBeNull(); // still null since fastembed not installed
    });
  });
});
