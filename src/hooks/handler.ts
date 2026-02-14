/**
 * Hook Handler
 *
 * Unified entry point for all agent hooks.
 * Reads stdin JSON, normalizes it, detects patterns, and auto-stores memories.
 * Outputs JSON to stdout to control agent behavior (e.g., inject context).
 */

import type { ObservationType } from '../types.js';
import { normalizeHookInput } from './normalizer.js';
import { detectBestPattern, patternToObservationType } from './pattern-detector.js';
import type { HookEvent, HookOutput, NormalizedHookInput } from './types.js';

/** Cooldown tracker: eventType → lastTimestamp */
const cooldowns = new Map<string, number>();

/** Cooldown duration in ms (30 seconds) */
const COOLDOWN_MS = 30_000;

/** Minimum content length for auto-store */
const MIN_STORE_LENGTH = 100;

/** Max content length (truncate beyond this) */
const MAX_CONTENT_LENGTH = 4000;

/**
 * Check if an event is in cooldown.
 */
function isInCooldown(eventKey: string): boolean {
  const last = cooldowns.get(eventKey);
  if (!last) return false;
  return Date.now() - last < COOLDOWN_MS;
}

/**
 * Mark an event as triggered (start cooldown).
 */
function markTriggered(eventKey: string): void {
  cooldowns.set(eventKey, Date.now());
}

/**
 * Build content string from the normalized input for pattern detection.
 */
function extractContent(input: NormalizedHookInput): string {
  const parts: string[] = [];

  if (input.userPrompt) parts.push(input.userPrompt);
  if (input.aiResponse) parts.push(input.aiResponse);
  if (input.toolResult) parts.push(input.toolResult);
  if (input.commandOutput) parts.push(input.commandOutput);
  if (input.command) parts.push(`Command: ${input.command}`);
  if (input.filePath) parts.push(`File: ${input.filePath}`);
  if (input.edits) {
    for (const edit of input.edits) {
      parts.push(`Edit: ${edit.oldString} → ${edit.newString}`);
    }
  }

  return parts.join('\n').slice(0, MAX_CONTENT_LENGTH);
}

/**
 * Derive an entity name from the hook input.
 */
function deriveEntityName(input: NormalizedHookInput): string {
  // From file path: extract filename without extension
  if (input.filePath) {
    const parts = input.filePath.replace(/\\/g, '/').split('/');
    const filename = parts[parts.length - 1];
    return filename.replace(/\.[^.]+$/, '');
  }

  // From tool name
  if (input.toolName) return input.toolName;

  // From command: extract first word
  if (input.command) {
    const firstWord = input.command.split(/\s+/)[0];
    return firstWord.replace(/[^a-zA-Z0-9-_]/g, '');
  }

  return 'session';
}

/**
 * Generate a concise title from the content and pattern.
 */
function generateTitle(input: NormalizedHookInput, patternType: string): string {
  const maxLen = 60;

  if (input.filePath) {
    const filename = input.filePath.replace(/\\/g, '/').split('/').pop() ?? '';
    const verb =
      patternType === 'problem-solution'
        ? 'Fixed issue in'
        : patternType === 'what-changed'
          ? 'Changed'
          : 'Updated';
    return `${verb} ${filename}`.slice(0, maxLen);
  }

  if (input.command) {
    return `Ran: ${input.command}`.slice(0, maxLen);
  }

  if (input.userPrompt) {
    return input.userPrompt.slice(0, maxLen);
  }

  return `Session activity (${patternType})`;
}

/**
 * Build a memorix_store-compatible observation payload.
 */
function buildObservation(input: NormalizedHookInput, content: string) {
  const pattern = detectBestPattern(content);
  const obsType = (pattern ? patternToObservationType(pattern.type) : 'discovery') as ObservationType;

  return {
    entityName: deriveEntityName(input),
    type: obsType,
    title: generateTitle(input, obsType),
    narrative: content.slice(0, 2000),
    facts: [
      `Agent: ${input.agent}`,
      `Session: ${input.sessionId}`,
      ...(input.filePath ? [`File: ${input.filePath}`] : []),
      ...(input.command ? [`Command: ${input.command}`] : []),
    ],
    concepts: pattern?.matchedKeywords ?? [],
    filesModified: input.filePath ? [input.filePath] : [],
  };
}

/**
 * Handle a hook event.
 *
 * Returns:
 * - observation payload if content should be stored (caller persists it)
 * - null if nothing to store
 * - HookOutput for stdout response to agent
 */
export async function handleHookEvent(input: NormalizedHookInput): Promise<{
  observation: ReturnType<typeof buildObservation> | null;
  output: HookOutput;
}> {
  const defaultOutput: HookOutput = { continue: true };

  // Skip memorix's own MCP calls to avoid recursion
  if (input.toolName === 'memorix_store' || input.toolName === 'memorix_search') {
    return { observation: null, output: defaultOutput };
  }

  // Event-specific handling
  switch (input.event) {
    case 'session_start':
      // TODO: Search relevant memories and inject via systemMessage
      return {
        observation: null,
        output: {
          continue: true,
          systemMessage:
            'Memorix is active. Your memories from previous sessions are available via memorix_search.',
        },
      };

    case 'pre_compact':
      // Context is about to be compressed — save what we can
      return {
        observation: buildObservation(input, extractContent(input)),
        output: defaultOutput,
      };

    case 'session_end':
      // Always record session end (no cooldown)
      return {
        observation: buildObservation(input, extractContent(input)),
        output: defaultOutput,
      };

    case 'post_edit':
    case 'post_command':
    case 'post_tool':
    case 'post_response':
    case 'user_prompt': {
      // Check cooldown
      const cooldownKey = `${input.event}:${input.filePath ?? input.command ?? 'general'}`;
      if (isInCooldown(cooldownKey)) {
        return { observation: null, output: defaultOutput };
      }

      const content = extractContent(input);
      if (content.length < MIN_STORE_LENGTH) {
        return { observation: null, output: defaultOutput };
      }

      // Detect pattern
      const pattern = detectBestPattern(content);
      if (!pattern) {
        // No recognizable pattern — skip (avoid noise)
        return { observation: null, output: defaultOutput };
      }

      markTriggered(cooldownKey);
      return {
        observation: buildObservation(input, content),
        output: defaultOutput,
      };
    }

    default:
      return { observation: null, output: defaultOutput };
  }
}

/**
 * Main entry point: read stdin, process, write stdout.
 * Called by the CLI: `memorix hook`
 */
export async function runHook(): Promise<void> {
  // Read stdin
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  const rawInput = Buffer.concat(chunks).toString('utf-8').trim();

  if (!rawInput) {
    // No input — output default continue
    process.stdout.write(JSON.stringify({ continue: true }));
    return;
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawInput);
  } catch {
    process.stdout.write(JSON.stringify({ continue: true }));
    return;
  }

  // Normalize
  const input = normalizeHookInput(payload);

  // Handle
  const { observation, output } = await handleHookEvent(input);

  // Store observation if any
  if (observation) {
    try {
      // Dynamic import to avoid circular deps and keep hook handler lightweight
      const { storeObservation } = await import('../memory/observations.js');
      const { detectProject } = await import('../project/detector.js');
      const project = await detectProject(input.cwd || process.cwd());
      await storeObservation({ ...observation, projectId: project.id });
    } catch {
      // Silent fail — hooks must never break the agent
    }
  }

  // Output response to agent
  process.stdout.write(JSON.stringify(output));
}
