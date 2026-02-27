#!/usr/bin/env node

/**
 * Memorix — Cross-Agent Memory Bridge
 *
 * Entry point for the MCP Server.
 * Connects via stdio transport for compatibility with all MCP-supporting agents.
 *
 * Usage:
 *   node dist/index.js          # Start as MCP server (stdio)
 *   memorix init                # CLI: Initialize project (P1)
 *   memorix sync                # CLI: Sync rules across agents (P2)
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMemorixServer } from './server.js';

async function main(): Promise<void> {
  const { server, projectId, deferredInit } = await createMemorixServer();

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error(`[memorix] MCP Server running on stdio (project: ${projectId})`);
  deferredInit().catch(e => console.error(`[memorix] Deferred init error:`, e));
}

main().catch((error) => {
  console.error('[memorix] Fatal error:', error);
  process.exit(1);
});
