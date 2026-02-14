/**
 * memorix serve — Start MCP Server on stdio
 */

import { defineCommand } from 'citty';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export default defineCommand({
  meta: {
    name: 'serve',
    description: 'Start Memorix MCP Server on stdio transport',
  },
  run: async () => {
    const { StdioServerTransport } = await import(
      '@modelcontextprotocol/sdk/server/stdio.js'
    );
    const { createMemorixServer } = await import('../../server.js');

    // Derive project root from script location (handles CWD mismatch when
    // started by Windsurf/Codex/etc. as an MCP server subprocess)
    const scriptDir = path.dirname(fileURLToPath(import.meta.url));
    // scriptDir = .../memorix/dist/cli  →  project root = 2 levels up
    const projectRoot = path.resolve(scriptDir, '..', '..');

    const { server, projectId } = await createMemorixServer(projectRoot);
    const transport = new StdioServerTransport();
    await server.connect(transport);

    console.error(`[memorix] MCP Server running on stdio (project: ${projectId})`);
    console.error(`[memorix] Project root: ${projectRoot}`);
  },
});
