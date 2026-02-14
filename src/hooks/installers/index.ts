/**
 * Hook Installers
 *
 * Auto-detect installed agents and generate hook configurations.
 * Each agent has a different config format but the hook command is the same:
 *   memorix hook
 *
 * The hook handler reads stdin JSON from the agent, normalizes it, and auto-stores.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import type { AgentName, AgentHookConfig } from '../types.js';

/** Hook command — the script all agents will call */
const HOOK_COMMAND = 'memorix';
const HOOK_ARGS = ['hook'];

/**
 * Generate Claude Code / VS Code Copilot hook config.
 * Both use the same format: .claude/settings.json or .github/hooks/*.json
 */
function generateClaudeConfig(): Record<string, unknown> {
  const hookEntry = {
    type: 'command',
    command: `${HOOK_COMMAND} ${HOOK_ARGS.join(' ')}`,
    timeout: 10,
  };

  return {
    hooks: {
      SessionStart: [hookEntry],
      PostToolUse: [hookEntry],
      UserPromptSubmit: [hookEntry],
      PreCompact: [hookEntry],
      Stop: [hookEntry],
    },
  };
}

/**
 * Generate Windsurf Cascade hooks config.
 */
function generateWindsurfConfig(): Record<string, unknown> {
  const hookEntry = {
    command: `${HOOK_COMMAND} ${HOOK_ARGS.join(' ')}`,
    timeout: 10,
  };

  return {
    hooks: {
      post_write_code: [hookEntry],
      post_run_command: [hookEntry],
      post_mcp_tool_use: [hookEntry],
      pre_user_prompt: [hookEntry],
      post_cascade_response: [hookEntry],
    },
  };
}

/**
 * Generate Cursor hooks config.
 */
function generateCursorConfig(): Record<string, unknown> {
  return {
    hooks: {
      beforeSubmitPrompt: {
        command: `${HOOK_COMMAND} ${HOOK_ARGS.join(' ')}`,
      },
      afterFileEdit: {
        command: `${HOOK_COMMAND} ${HOOK_ARGS.join(' ')}`,
      },
      stop: {
        command: `${HOOK_COMMAND} ${HOOK_ARGS.join(' ')}`,
      },
    },
  };
}

/**
 * Generate Kiro hooks config (Markdown + YAML format).
 */
function generateKiroHookFile(): string {
  return `---
title: Memorix Auto-Memory
description: Automatically record development context for cross-agent memory sharing
event: file_saved
filePattern: "**/*"
---

Run the memorix hook command to analyze changes and store relevant memories:

\`\`\`bash
memorix hook
\`\`\`
`;
}

/**
 * Get the config file path for an agent (project-level).
 */
function getProjectConfigPath(agent: AgentName, projectRoot: string): string {
  switch (agent) {
    case 'claude':
    case 'copilot':
      return path.join(projectRoot, '.github', 'hooks', 'memorix.json');
    case 'windsurf':
      return path.join(projectRoot, '.windsurf', 'cascade.json');
    case 'cursor':
      return path.join(projectRoot, '.cursor', 'hooks.json');
    case 'kiro':
      return path.join(projectRoot, '.kiro', 'hooks', 'memorix.hook.md');
    case 'codex':
      return path.join(projectRoot, '.codex', 'hooks.json');
    default:
      return path.join(projectRoot, '.memorix', 'hooks.json');
  }
}

/**
 * Get the global config file path for an agent.
 */
function getGlobalConfigPath(agent: AgentName): string {
  const home = os.homedir();
  switch (agent) {
    case 'claude':
    case 'copilot':
      return path.join(home, '.claude', 'settings.json');
    case 'windsurf':
      return path.join(home, '.codeium', 'windsurf', 'cascade.json');
    case 'cursor':
      return path.join(home, '.cursor', 'hooks.json');
    default:
      return path.join(home, '.memorix', 'hooks.json');
  }
}

/**
 * Detect which agents are installed on the system.
 */
export async function detectInstalledAgents(): Promise<AgentName[]> {
  const agents: AgentName[] = [];
  const home = os.homedir();

  // Check for Claude Code
  const claudeDir = path.join(home, '.claude');
  try {
    await fs.access(claudeDir);
    agents.push('claude');
  } catch { /* not installed */ }

  // Check for Windsurf
  const windsurfDir = path.join(home, '.codeium', 'windsurf');
  try {
    await fs.access(windsurfDir);
    agents.push('windsurf');
  } catch { /* not installed */ }

  // Check for Cursor
  const cursorDir = path.join(home, '.cursor');
  try {
    await fs.access(cursorDir);
    agents.push('cursor');
  } catch { /* not installed */ }

  // Check for VS Code (always assume available if Claude is not)
  if (!agents.includes('claude')) {
    const vscodeDir = path.join(home, '.vscode');
    try {
      await fs.access(vscodeDir);
      agents.push('copilot');
    } catch { /* not installed */ }
  }

  // Check for Kiro
  const kiroConfig = path.join(home, '.kiro');
  try {
    await fs.access(kiroConfig);
    agents.push('kiro');
  } catch { /* not installed */ }

  return agents;
}

/**
 * Install hooks for a specific agent.
 */
export async function installHooks(
  agent: AgentName,
  projectRoot: string,
  global = false,
): Promise<AgentHookConfig> {
  const configPath = global
    ? getGlobalConfigPath(agent)
    : getProjectConfigPath(agent, projectRoot);

  let generated: Record<string, unknown> | string;

  switch (agent) {
    case 'claude':
    case 'copilot':
      generated = generateClaudeConfig();
      break;
    case 'windsurf':
      generated = generateWindsurfConfig();
      break;
    case 'cursor':
      generated = generateCursorConfig();
      break;
    case 'kiro':
      generated = generateKiroHookFile();
      break;
    default:
      generated = generateClaudeConfig(); // fallback
  }

  // Ensure directory exists
  await fs.mkdir(path.dirname(configPath), { recursive: true });

  if (agent === 'kiro') {
    // Kiro uses markdown files
    await fs.writeFile(configPath, generated as string, 'utf-8');
  } else {
    // JSON-based configs: merge with existing if present
    let existing: Record<string, unknown> = {};
    try {
      const content = await fs.readFile(configPath, 'utf-8');
      existing = JSON.parse(content);
    } catch { /* file doesn't exist yet */ }

    const merged = {
      ...existing,
      ...(generated as Record<string, unknown>),
    };

    await fs.writeFile(configPath, JSON.stringify(merged, null, 2), 'utf-8');
  }

  const events: Array<import('../types.js').HookEvent> = [];
  switch (agent) {
    case 'claude':
    case 'copilot':
      events.push('session_start', 'post_tool', 'user_prompt', 'pre_compact', 'session_end');
      break;
    case 'windsurf':
      events.push('post_edit', 'post_command', 'post_tool', 'user_prompt', 'post_response');
      break;
    case 'cursor':
      events.push('user_prompt', 'post_edit', 'session_end');
      break;
    case 'kiro':
      events.push('post_edit');
      break;
  }

  return {
    agent,
    configPath,
    events,
    generated: typeof generated === 'string' ? { content: generated } : generated,
  };
}

/**
 * Uninstall hooks for a specific agent.
 */
export async function uninstallHooks(
  agent: AgentName,
  projectRoot: string,
  global = false,
): Promise<boolean> {
  const configPath = global
    ? getGlobalConfigPath(agent)
    : getProjectConfigPath(agent, projectRoot);

  try {
    if (agent === 'kiro') {
      await fs.unlink(configPath);
    } else {
      // For JSON configs, remove the hooks key
      const content = await fs.readFile(configPath, 'utf-8');
      const config = JSON.parse(content);
      delete config.hooks;

      if (Object.keys(config).length === 0) {
        await fs.unlink(configPath);
      } else {
        await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
      }
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Check hook installation status for all agents.
 */
export async function getHookStatus(
  projectRoot: string,
): Promise<Array<{ agent: AgentName; installed: boolean; configPath: string }>> {
  const results: Array<{ agent: AgentName; installed: boolean; configPath: string }> = [];
  const agents: AgentName[] = ['claude', 'copilot', 'windsurf', 'cursor', 'kiro', 'codex'];

  for (const agent of agents) {
    const projectPath = getProjectConfigPath(agent, projectRoot);
    const globalPath = getGlobalConfigPath(agent);

    let installed = false;
    let usedPath = projectPath;

    try {
      await fs.access(projectPath);
      installed = true;
    } catch {
      try {
        await fs.access(globalPath);
        installed = true;
        usedPath = globalPath;
      } catch { /* not installed */ }
    }

    results.push({ agent, installed, configPath: usedPath });
  }

  return results;
}
