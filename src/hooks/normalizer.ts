/**
 * Hook Normalizer
 *
 * Converts agent-specific stdin JSON into a unified NormalizedHookInput.
 * Each agent has a different event naming convention and payload structure,
 * but they all communicate via stdin/stdout JSON.
 */

import type { AgentName, HookEvent, NormalizedHookInput } from './types.js';

/**
 * Map agent-specific event names → normalized event names.
 */
const EVENT_MAP: Record<string, HookEvent> = {
  // Claude Code / VS Code Copilot
  SessionStart: 'session_start',
  UserPromptSubmit: 'user_prompt',
  PreToolUse: 'post_tool', // we handle pre as post for memory purposes
  PostToolUse: 'post_tool',
  PreCompact: 'pre_compact',
  Stop: 'session_end',

  // Windsurf
  pre_user_prompt: 'user_prompt',
  post_write_code: 'post_edit',
  post_read_code: 'post_tool',
  post_run_command: 'post_command',
  pre_mcp_tool_use: 'post_tool',
  post_mcp_tool_use: 'post_tool',
  post_cascade_response: 'post_response',

  // Cursor
  beforeSubmitPrompt: 'user_prompt',
  beforeShellExecution: 'post_command',
  beforeMCPExecution: 'post_tool',
  afterFileEdit: 'post_edit',
  stop: 'session_end',
};

/**
 * Detect which agent sent this hook event based on payload structure.
 */
function detectAgent(payload: Record<string, unknown>): AgentName {
  // Windsurf uses agent_action_name
  if ('agent_action_name' in payload) return 'windsurf';

  // Cursor uses hook_event_name (lowercase) + conversation_id
  if ('hook_event_name' in payload && 'conversation_id' in payload) return 'cursor';

  // Claude Code / VS Code Copilot use hookEventName (camelCase)
  if ('hookEventName' in payload) {
    // VS Code Copilot has transcript_path; Claude Code also has it
    // They use the same format, so we distinguish by sessionId pattern if needed
    return 'copilot'; // treat as copilot (same format as claude)
  }

  // Kiro uses event_type
  if ('event_type' in payload) return 'kiro';

  // Codex
  if ('hook_type' in payload) return 'codex';

  return 'claude'; // default fallback
}

/**
 * Extract the raw event name string from agent-specific payload.
 */
function extractEventName(payload: Record<string, unknown>, agent: AgentName): string {
  switch (agent) {
    case 'windsurf':
      return (payload.agent_action_name as string) ?? '';
    case 'cursor':
      return (payload.hook_event_name as string) ?? '';
    case 'copilot':
    case 'claude':
      return (payload.hookEventName as string) ?? '';
    case 'kiro':
      return (payload.event_type as string) ?? '';
    case 'codex':
      return (payload.hook_type as string) ?? '';
    default:
      return '';
  }
}

/**
 * Normalize a Claude Code / VS Code Copilot payload.
 */
function normalizeClaude(payload: Record<string, unknown>, event: HookEvent): Partial<NormalizedHookInput> {
  const result: Partial<NormalizedHookInput> = {
    sessionId: (payload.sessionId as string) ?? '',
    cwd: (payload.cwd as string) ?? '',
    transcriptPath: payload.transcript_path as string | undefined,
  };

  // PostToolUse with write tool → post_edit
  const toolName = (payload.tool_name as string) ?? '';
  if (toolName) {
    result.toolName = toolName;
    result.toolInput = payload.tool_input as Record<string, unknown> | undefined;
    result.toolResult = payload.tool_result as string | undefined;

    // Detect file edits
    if (toolName === 'write' || toolName === 'edit' || toolName === 'multi_edit') {
      const input = payload.tool_input as Record<string, unknown> | undefined;
      result.filePath = (input?.file_path as string) ?? (input?.filePath as string);
    }
  }

  // UserPromptSubmit
  if (event === 'user_prompt') {
    result.userPrompt = (payload.prompt as string) ?? '';
  }

  return result;
}

/**
 * Normalize a Windsurf payload.
 */
function normalizeWindsurf(payload: Record<string, unknown>, event: HookEvent): Partial<NormalizedHookInput> {
  const toolInfo = (payload.tool_info as Record<string, unknown>) ?? {};
  const result: Partial<NormalizedHookInput> = {
    sessionId: (payload.trajectory_id as string) ?? '',
    cwd: '',
  };

  switch (event) {
    case 'post_edit':
      result.filePath = toolInfo.file_path as string | undefined;
      if (Array.isArray(toolInfo.edits)) {
        result.edits = (toolInfo.edits as Array<Record<string, string>>).map((e) => ({
          oldString: e.old_string ?? '',
          newString: e.new_string ?? '',
        }));
      }
      break;
    case 'post_command':
      result.command = toolInfo.command_line as string | undefined;
      result.cwd = (toolInfo.cwd as string) ?? '';
      break;
    case 'post_tool':
      result.toolName = toolInfo.mcp_tool_name as string | undefined;
      result.toolInput = toolInfo.mcp_tool_arguments as Record<string, unknown> | undefined;
      result.toolResult = toolInfo.mcp_result as string | undefined;
      break;
    case 'user_prompt':
      result.userPrompt = toolInfo.user_prompt as string | undefined;
      break;
    case 'post_response':
      result.aiResponse = toolInfo.response as string | undefined;
      break;
  }

  return result;
}

/**
 * Normalize a Cursor payload.
 */
function normalizeCursor(payload: Record<string, unknown>, event: HookEvent): Partial<NormalizedHookInput> {
  const result: Partial<NormalizedHookInput> = {
    sessionId: (payload.conversation_id as string) ?? '',
    cwd: (payload.cwd as string) ?? '',
  };

  const roots = payload.workspace_roots as string[] | undefined;
  if (roots?.length && !result.cwd) {
    result.cwd = roots[0];
  }

  switch (event) {
    case 'user_prompt':
      result.userPrompt = (payload.prompt as string) ?? '';
      break;
    case 'post_command':
      result.command = (payload.command as string) ?? '';
      break;
    case 'post_edit':
      result.filePath = (payload.file_path as string) ?? '';
      break;
  }

  return result;
}

/**
 * Main normalizer: convert any agent's stdin payload → NormalizedHookInput.
 */
export function normalizeHookInput(payload: Record<string, unknown>): NormalizedHookInput {
  const agent = detectAgent(payload);
  const rawEventName = extractEventName(payload, agent);
  const event: HookEvent = EVENT_MAP[rawEventName] ?? 'post_tool';
  const timestamp = (payload.timestamp as string) ?? new Date().toISOString();

  let agentSpecific: Partial<NormalizedHookInput> = {};
  switch (agent) {
    case 'claude':
    case 'copilot':
      agentSpecific = normalizeClaude(payload, event);
      break;
    case 'windsurf':
      agentSpecific = normalizeWindsurf(payload, event);
      break;
    case 'cursor':
      agentSpecific = normalizeCursor(payload, event);
      break;
    default:
      agentSpecific = { sessionId: '', cwd: '' };
  }

  return {
    event,
    agent,
    timestamp,
    sessionId: agentSpecific.sessionId ?? '',
    cwd: agentSpecific.cwd ?? '',
    raw: payload,
    ...agentSpecific,
  };
}
