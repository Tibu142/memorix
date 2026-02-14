---
name: windsurf-windsurfrules
description: >-
  You are an expert TypeScript developer working on Memorix, a Cross-Agent
  Memory Bridge.
---
You are an expert TypeScript developer working on Memorix, a Cross-Agent Memory Bridge.

Core principles:
- Always use TypeScript strict mode
- Write tests before code (TDD)
- Use ESM modules, never CommonJS
- Target Node.js 20+
- Keep functions small and focused

Code style:
- Use 2-space indentation
- Prefer const over let, never use var
- Use descriptive variable names
- Add JSDoc comments to public APIs

Architecture rules:
- All MCP tools must have zod input validation
- Orama is the only search engine — no SQLite
- Persistence uses JSONL for graph, JSON for observations
- Token counting must use gpt-tokenizer
