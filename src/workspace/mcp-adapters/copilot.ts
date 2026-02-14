import type { MCPConfigAdapter, MCPServerEntry } from '../../types.js';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';

/**
 * VS Code Copilot MCP config adapter.
 *
 * Config location: %APPDATA%/Code/User/settings.json (global)
 *                  or .vscode/mcp.json (workspace-level)
 *
 * Format inside settings.json:
 *   { "mcp": { "servers": { [name]: { command, args, env? } } } }
 *
 * IMPORTANT: settings.json contains many non-MCP settings.
 * generate() merges MCP servers into the existing file instead of overwriting.
 */
export class CopilotMCPAdapter implements MCPConfigAdapter {
  readonly source = 'copilot' as const;

  parse(content: string): MCPServerEntry[] {
    try {
      const config = JSON.parse(content);

      // settings.json format: { "mcp": { "servers": { ... } } }
      const servers = config?.mcp?.servers ?? {};

      return Object.entries(servers).map(([name, entry]: [string, any]) => {
        const result: MCPServerEntry = {
          name,
          command: entry.command ?? '',
          args: entry.args ?? [],
        };

        if (entry.url) {
          result.url = entry.url;
        }

        if (entry.env && typeof entry.env === 'object' && Object.keys(entry.env).length > 0) {
          result.env = entry.env;
        }

        return result;
      });
    } catch {
      return [];
    }
  }

  generate(servers: MCPServerEntry[]): string {
    const mcpServers: Record<string, any> = {};
    for (const s of servers) {
      const entry: Record<string, any> = {};
      if (s.url) {
        entry.url = s.url;
      } else {
        entry.command = s.command;
        entry.args = s.args;
      }
      if (s.env && Object.keys(s.env).length > 0) {
        entry.env = s.env;
      }
      mcpServers[s.name] = entry;
    }

    // Merge into existing settings.json if it exists
    const configPath = this.getConfigPath();
    let existing: Record<string, any> = {};
    if (existsSync(configPath)) {
      try {
        existing = JSON.parse(readFileSync(configPath, 'utf-8'));
      } catch {
        // If parse fails, start fresh
      }
    }

    // Merge MCP servers into existing mcp.servers (preserve other servers)
    const existingMcp = existing.mcp ?? {};
    const existingServers = existingMcp.servers ?? {};
    existing.mcp = {
      ...existingMcp,
      servers: { ...existingServers, ...mcpServers },
    };

    return JSON.stringify(existing, null, 4);
  }

  getConfigPath(_projectRoot?: string): string {
    // VS Code user settings path varies by OS
    const home = homedir();
    if (process.platform === 'win32') {
      return join(home, 'AppData', 'Roaming', 'Code', 'User', 'settings.json');
    } else if (process.platform === 'darwin') {
      return join(home, 'Library', 'Application Support', 'Code', 'User', 'settings.json');
    } else {
      return join(home, '.config', 'Code', 'User', 'settings.json');
    }
  }
}
