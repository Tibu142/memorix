# Changelog

## 0.1.0 (2026-02-14)

### Core
- Knowledge Graph: Entity-Relation-Observation model (MCP Official compatible)
- 3-Layer Progressive Disclosure: compact search → timeline → detail
- 9 observation types with icon classification
- Full-text search via Orama (BM25)
- Per-project isolation via Git remote detection
- 14 MCP tools (9 official + 5 Memorix extensions)

### Cross-Agent Sync
- Rules Parser: 4 format adapters (Cursor, Claude Code, Codex, Windsurf)
- Rules Syncer: scan → deduplicate → conflict detection → cross-format generation
- Workspace Sync: MCP config migration + workflow sync + apply with backup/rollback

### Intelligence (Competitor-Inspired)
- Access tracking: accessCount + lastAccessedAt (from mcp-memory-service)
- Token budget: maxTokens search trimming (from MemCP)
- Memory decay: exponential decay + retention lifecycle + immunity (from mcp-memory-service + MemCP)
- Entity extraction: regex-based file/module/URL/CamelCase extraction (from MemCP)
- Auto-enrichment: memorix_store auto-extracts and enriches concepts/files
- Causal detection: "because/due to/caused by" pattern detection
- Auto-relations: implicit Knowledge Graph relation creation (causes/fixes/modifies)
- Retention status: memorix_retention MCP tool

### Vector Search
- Embedding provider abstraction layer (extensible)
- fastembed integration (optional, local ONNX, 384-dim bge-small)
- Orama hybrid search mode (BM25 + vector)
- Graceful degradation: no fastembed → fulltext only
- Embedding cache (5000 entries LRU)

### Agent Instructions
- CLAUDE.md: Claude Code usage instructions + lifecycle hooks
- Example configs for Cursor, Windsurf, Codex
