/**
 * memorix serve — Start MCP Server on stdio
 */

import { defineCommand } from 'citty';

export default defineCommand({
  meta: {
    name: 'serve',
    description: 'Start Memorix MCP Server on stdio transport',
  },
  args: {
    cwd: {
      type: 'string',
      description: 'Project working directory (defaults to process.cwd())',
      required: false,
    },
  },
  run: async ({ args }) => {
    const { StdioServerTransport } = await import(
      '@modelcontextprotocol/sdk/server/stdio.js'
    );
    const { createMemorixServer } = await import('../../server.js');
    const { execSync } = await import('node:child_process');

    // Priority: explicit --cwd arg > INIT_CWD (npm lifecycle) > process.cwd()
    let projectRoot = args.cwd || process.env.INIT_CWD || process.cwd();

    // Verify git is available at the projectRoot; if not, try the script's
    // own directory (useful when memorix runs from a global npm install
    // but the user's project is at a known location).
    try {
      execSync('git rev-parse --show-toplevel', {
        cwd: projectRoot,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch {
      // cwd is not inside a git repo — try the script directory
      const scriptDir = new URL('.', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
      try {
        const gitRoot = execSync('git rev-parse --show-toplevel', {
          cwd: scriptDir,
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
        }).trim();
        if (gitRoot) {
          projectRoot = gitRoot;
          console.error(`[memorix] CWD has no git, using script dir: ${projectRoot}`);
        }
      } catch {
        // Neither has git — fall through with original projectRoot
      }
    }

    const { server, projectId } = await createMemorixServer(projectRoot);
    const transport = new StdioServerTransport();
    await server.connect(transport);

    console.error(`[memorix] MCP Server running on stdio (project: ${projectId})`);
    console.error(`[memorix] Project root: ${projectRoot}`);
  },
});
