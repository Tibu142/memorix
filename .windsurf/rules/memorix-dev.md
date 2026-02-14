---
description: "Memorix development workflow and testing standards"
---
# Memorix Development Workflow

## Testing
- Follow Superpowers TDD methodology: RED → GREEN → REFACTOR
- Every feature must have a failing test before implementation
- Run `npx vitest run` before claiming anything works
- Integration tests must cover the full store → search → detail pipeline

## Rules Sync Development
- Each agent format adapter implements `RuleFormatAdapter` interface
- Content hashing uses SHA-256 (first 16 chars) for deduplication
- Conflict detection compares path-specific rules across different sources
- gray-matter handles all frontmatter parsing

## MCP Server
- All tools must validate input with zod schemas
- Use `type: 'text' as const` for MCP response content
- Project isolation via Git remote URL parsing
- Token budget awareness in all search responses
