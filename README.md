# Memorix — Cross-Agent Memory Bridge

> Universal memory layer for AI coding agents via MCP

## What is Memorix?

Memorix is a lightweight local MCP server that acts as a **universal memory layer** across AI coding agents. Your knowledge from Cursor, Claude Code, Codex, and Windsurf is stored once and shared everywhere.

### The Problem

- claude-mem only serves Claude Code
- memU only serves OpenClaw
- Your architecture decisions in Cursor are invisible to Claude Code
- Bug fix knowledge in Windsurf doesn't transfer to Codex
- **No one does cross-agent memory**

### The Solution

Memorix stores and indexes project knowledge (architecture decisions, bug fixes, code style preferences) and exposes it via MCP — so **any MCP-supporting agent** can access it.

## Features

### P0 — Core (Current)

- **Knowledge Graph**: Entity-Relation model (MCP Official Memory Server compatible)
- **3-Layer Progressive Disclosure**: Token-efficient search (claude-mem pattern)
  - L1: Compact index (~50-100 tokens/result)
  - L2: Timeline context
  - L3: Full details on demand (~500-1000 tokens/result)
- **9 Observation Types**: 🎯🔴🟡🔵🟢🟣🟠🟤⚖️
- **Full-text Search**: Powered by Orama
- **Per-project Isolation**: Auto-detected via Git remote
- **MCP Compatible**: All 9 official Memory Server tools + 5 Memorix extensions

### P1 — Smart Search

- **Hybrid Search**: Full-text (BM25) + Vector (semantic) via Orama
- **Vector Embeddings**: Optional `fastembed` (local ONNX, zero API calls)
- **Graceful Degradation**: No fastembed? Falls back to BM25 fulltext automatically
- **Token Budget**: `maxTokens` parameter trims results to fit context windows

### P2 — Cross-Agent Sync

- **Rules Parser**: 4 format adapters (Cursor `.mdc`, Claude Code `CLAUDE.md`, Codex `SKILL.md`, Windsurf `.windsurfrules`)
- **Rules Syncer**: Scan → Deduplicate → Conflict detection → Cross-format generation
- **Workspace Sync**: MCP config migration + workflow sync across agents
- **Skills Sync**: Scan `.codex/skills/`, `.cursor/skills/`, `.windsurf/skills/`, `.claude/skills/` → copy entire skill folders across agents (no format conversion needed — SKILL.md is a universal standard)
- **Apply with Safety**: Backup → Atomic write → Auto-rollback on failure

### P3 — Auto-Memory Hooks

- **Hook Events**: `user_prompt`, `post_response`, `post_edit`, `post_command`, `post_tool`, `session_end`
- **Agent Normalizer**: Maps Windsurf/Cursor/Claude/Codex native events to unified hook events
- **Pattern Detection**: Auto-detects decisions, errors, gotchas, configurations, learnings, implementations
- **Cooldown Filtering**: Prevents duplicate storage within configurable time windows
- **Noise Filtering**: Skips trivial commands (`ls`, `cat`, `pwd`, etc.)
- **Agent Rules**: Auto-installs `.windsurf/rules/memorix.md` (or equivalent) to guide agents in proactive memory management
- **One-Command Install**: `memorix hooks install` sets up hooks + rules for your agent

### Context Continuity

- **Session Start**: Agent rules instruct AI to search memories before responding
- **During Session**: Auto-capture decisions, bugs, gotchas via hooks + agent-driven `memorix_store`
- **Session End**: Agent stores a "handoff note" summarizing progress and next steps
- **Result**: Start a new session and your AI already knows everything — no re-explaining needed

### P5 — Intelligence (Competitor-Inspired)

- **Access Tracking**: `accessCount` + `lastAccessedAt` on every search hit (from mcp-memory-service)
- **Memory Decay**: Exponential decay scoring `score = importance × e^(-age/retention) × accessBoost` (from mcp-memory-service)
- **Retention Lifecycle**: Active → Stale → Archive-candidate with immunity rules (from MemCP)
- **Entity Extraction**: Auto-extract files, modules, URLs, CamelCase identifiers from narratives (from MemCP)
- **Auto-Enrichment**: `memorix_store` automatically enriches concepts and filesModified
- **Causal Detection**: Detects "because/due to/caused by" patterns for typed relations
- **Auto-Relations**: Implicit Knowledge Graph relation creation on store (causes/fixes/modifies)
- **Typed Relations**: Recommended types: causes, fixes, supports, opposes, contradicts, depends_on

## Quick Start

### Install

```bash
npm install memorix
```

### Configure in your agent

**Cursor** (`.cursor/mcp.json`):
```json
{
  "mcpServers": {
    "memorix": {
      "command": "node",
      "args": ["node_modules/memorix/dist/index.js"]
    }
  }
}
```

**Claude Code** (`claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "memorix": {
      "command": "node",
      "args": ["node_modules/memorix/dist/index.js"]
    }
  }
}
```

**Windsurf** (`~/.codeium/windsurf/mcp_config.json`):
```json
{
  "mcpServers": {
    "memorix": {
      "command": "node",
      "args": ["node_modules/memorix/dist/index.js"]
    }
  }
}
```

### Available MCP Tools

#### Memorix Extensions (Progressive Disclosure)

| Tool | Layer | Description | Tokens |
|------|-------|-------------|--------|
| `memorix_store` | Write | Store observation with auto-enrichment | — |
| `memorix_search` | L1 | Compact index search (hybrid if fastembed) | ~50-100/result |
| `memorix_timeline` | L2 | Chronological context | ~200/group |
| `memorix_detail` | L3 | Full observation details | ~500-1000/result |
| `memorix_retention` | Analytics | Memory decay & retention status | — |
| `memorix_rules_sync` | Rules | Scan, dedup, convert rules across agents | — |
| `memorix_workspace_sync` | Workspace | Scan/migrate MCP configs, workflows, and skills across agents | — |

#### MCP Official Compatible

| Tool | Description |
|------|-------------|
| `create_entities` | Create knowledge graph entities |
| `create_relations` | Create relations between entities |
| `add_observations` | Add observations to entities |
| `delete_entities` | Delete entities (cascades relations) |
| `delete_observations` | Delete specific observations |
| `delete_relations` | Delete relations |
| `search_nodes` | Search knowledge graph |
| `open_nodes` | Get entities by name |
| `read_graph` | Read entire graph |

## Architecture

```
┌─────────────────────────────────────────────┐
│                 MCP Clients                  │
│   Cursor │ Claude Code │ Codex │ Windsurf   │
└──────────────────┬──────────────────────────┘
                   │ stdio
┌──────────────────▼──────────────────────────┐
│              Memorix MCP Server              │
│                                              │
│  ┌────────────┐  ┌─────────────────────┐    │
│  │ Knowledge  │  │  Compact Engine     │    │
│  │ Graph Mgr  │  │  (3-layer search)   │    │
│  └─────┬──────┘  └──────────┬──────────┘    │
│        │                    │                │
│  ┌─────▼────────────────────▼──────────┐    │
│  │           Orama Store               │    │
│  │    (full-text + vector search)      │    │
│  └─────────────────┬──────────────────┘    │
│                    │                        │
│  ┌─────────────────▼──────────────────┐    │
│  │         Persistence Layer           │    │
│  │   (JSONL + JSON per project)        │    │
│  └─────────────────────────────────────┘    │
│                                              │
│  ┌────────────────────────────────────┐     │
│  │      Rules & Skills Syncer        │     │
│  │  Cursor│Claude│Codex│Windsurf     │     │
│  │  rules: scan→dedup→conflict→gen   │     │
│  │  skills: scan→copy (no convert)   │     │
│  └────────────────────────────────────┘     │
│                                              │
│  ┌────────────────────────────────────┐     │
│  │       Auto-Memory Hooks           │     │
│  │  normalize→detect→filter→store    │     │
│  │  + agent rules (context cont.)    │     │
│  └────────────────────────────────────┘     │
└──────────────────────────────────────────────┘
```

## Tech Stack

| Component | Library | Source |
|-----------|---------|--------|
| MCP Server | `@modelcontextprotocol/sdk` | Official SDK |
| Search | `@orama/orama` | Full-text + Vector + Hybrid |
| Embeddings | `fastembed` (optional) | Local ONNX, zero API calls |
| Token counting | `gpt-tokenizer` | — |
| Data model | Entity-Relation-Observation | MCP Official Memory Server |
| Compact strategy | 3-layer Progressive Disclosure | claude-mem |
| Memory decay | Exponential decay + retention | mcp-memory-service + MemCP |
| Entity extraction | Regex patterns | MemCP |
| Rule parsing | `gray-matter` | — |
| Build | `tsup` | — |
| Test | `vitest` | 219 tests |

## Optional: Enable Vector Search

Install `fastembed` for hybrid (BM25 + semantic) search:

```bash
npm install fastembed
```

Without it, Memorix uses BM25 full-text search (already very effective for code memories). With it, queries like "authentication" will also match observations containing "login flow".

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run tests (219 tests)
npm test

# Type check
npm run lint

# Watch mode
npm run dev
```

## Acknowledgements

Memorix stands on the shoulders of these excellent projects:

- [mcp-memory-service](https://github.com/doobidoo/mcp-memory-service) — Hybrid search, exponential decay, access tracking
- [MemCP](https://github.com/maydali28/memcp) — MAGMA 4-graph, entity extraction, retention lifecycle, token budget
- [claude-mem](https://github.com/anthropics/claude-code) — 3-layer Progressive Disclosure, lifecycle hooks
- [Mem0](https://github.com/mem0ai/mem0) — Memory layer architecture patterns

## License

MIT
