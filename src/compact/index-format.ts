/**
 * Index Formatter
 *
 * Formats observation search results into the compact index table format.
 * Source: claude-mem's Progressive Disclosure index format.
 *
 * Output is a markdown table that agents can scan efficiently:
 *   | ID    | Time     | T  | Title                    | Tokens |
 *   |-------|----------|----|--------------------------|--------|
 *   | #42   | 2:14 PM  | 🔴 | port 3001 conflict fix   | ~155   |
 */

import type { IndexEntry, TimelineContext } from '../types.js';

/**
 * Format a list of IndexEntries as a compact markdown table.
 * Grouped by date for readability (claude-mem pattern).
 */
export function formatIndexTable(entries: IndexEntry[], query?: string): string {
  if (entries.length === 0) {
    return query
      ? `No observations found matching "${query}".`
      : 'No observations found.';
  }

  const lines: string[] = [];

  if (query) {
    lines.push(`Found ${entries.length} observation(s) matching "${query}":\n`);
  }

  lines.push('| ID | Time | T | Title | Tokens |');
  lines.push('|----|------|---|-------|--------|');

  // Check if any entry has matchedFields (explainable recall)
  const hasExplanation = entries.some(e => (e as unknown as Record<string, unknown>)['matchedFields']);

  if (hasExplanation) {
    lines.pop(); // remove previous header
    lines.pop();
    lines.push('| ID | Time | T | Title | Tokens | Matched |');
    lines.push('|----|------|---|-------|--------|---------|');
  }

  for (const entry of entries) {
    const matched = (entry as unknown as Record<string, unknown>)['matchedFields'] as string[] | undefined;
    if (hasExplanation && matched) {
      lines.push(
        `| #${entry.id} | ${entry.time} | ${entry.icon} | ${entry.title} | ~${entry.tokens} | ${matched.join(', ')} |`,
      );
    } else {
      lines.push(
        `| #${entry.id} | ${entry.time} | ${entry.icon} | ${entry.title} | ~${entry.tokens} |`,
      );
    }
  }

  lines.push('');
  lines.push(PROGRESSIVE_DISCLOSURE_HINT);

  return lines.join('\n');
}

/**
 * Format a timeline context around an anchor observation.
 */
export function formatTimeline(timeline: TimelineContext): string {
  if (!timeline.anchorEntry) {
    return `Observation #${timeline.anchorId} not found.`;
  }

  const lines: string[] = [];
  lines.push(`Timeline around #${timeline.anchorId}:\n`);

  if (timeline.before.length > 0) {
    lines.push('**Before:**');
    lines.push('| ID | Time | T | Title | Tokens |');
    lines.push('|----|------|---|-------|--------|');
    for (const entry of timeline.before) {
      lines.push(`| #${entry.id} | ${entry.time} | ${entry.icon} | ${entry.title} | ~${entry.tokens} |`);
    }
    lines.push('');
  }

  lines.push('**► Anchor:**');
  lines.push('| ID | Time | T | Title | Tokens |');
  lines.push('|----|------|---|-------|--------|');
  const a = timeline.anchorEntry;
  lines.push(`| #${a.id} | ${a.time} | ${a.icon} | ${a.title} | ~${a.tokens} |`);
  lines.push('');

  if (timeline.after.length > 0) {
    lines.push('**After:**');
    lines.push('| ID | Time | T | Title | Tokens |');
    lines.push('|----|------|---|-------|--------|');
    for (const entry of timeline.after) {
      lines.push(`| #${entry.id} | ${entry.time} | ${entry.icon} | ${entry.title} | ~${entry.tokens} |`);
    }
    lines.push('');
  }

  lines.push(PROGRESSIVE_DISCLOSURE_HINT);
  return lines.join('\n');
}

/**
 * Format full observation details (Layer 3).
 * Adopted from claude-mem's observation detail format.
 */
export function formatObservationDetail(doc: {
  observationId: number;
  type: string;
  title: string;
  narrative: string;
  facts: string;
  filesModified: string;
  concepts: string;
  createdAt: string;
  projectId: string;
  entityName: string;
}): string {
  const icon = getTypeIcon(doc.type);
  const lines: string[] = [];

  lines.push(`#${doc.observationId} ${icon} ${doc.title}`);
  lines.push('─'.repeat(50));
  lines.push(`Date: ${new Date(doc.createdAt).toLocaleString()}`);
  lines.push(`Type: ${doc.type}`);
  lines.push(`Entity: ${doc.entityName}`);
  lines.push(`Project: ${doc.projectId}`);
  lines.push('');
  lines.push(`Narrative: ${doc.narrative}`);

  const facts = doc.facts ? doc.facts.split('\n').filter(Boolean) : [];
  if (facts.length > 0) {
    lines.push('');
    lines.push('Facts:');
    for (const fact of facts) {
      lines.push(`- ${fact}`);
    }
  }

  const files = doc.filesModified ? doc.filesModified.split('\n').filter(Boolean) : [];
  if (files.length > 0) {
    lines.push('');
    lines.push('Files Modified:');
    for (const file of files) {
      lines.push(`- ${file}`);
    }
  }

  if (doc.concepts) {
    lines.push('');
    lines.push(`Concepts: ${doc.concepts}`);
  }

  return lines.join('\n');
}

/** Icon lookup by observation type string */
function getTypeIcon(type: string): string {
  const icons: Record<string, string> = {
    'session-request': '🎯',
    'gotcha': '🔴',
    'problem-solution': '🟡',
    'how-it-works': '🔵',
    'what-changed': '🟢',
    'discovery': '🟣',
    'why-it-exists': '🟠',
    'decision': '🟤',
    'trade-off': '⚖️',
  };
  return icons[type] ?? '❓';
}

/**
 * Progressive Disclosure instruction hint.
 * Appended to L1/L2 results to teach the agent the workflow.
 */
const PROGRESSIVE_DISCLOSURE_HINT = `💡 **Progressive Disclosure:** This index shows WHAT exists and retrieval COST.
- Use \`memorix_detail\` to fetch full observation details by ID
- Use \`memorix_timeline\` to see chronological context around an observation
- Critical types (🔴 gotcha, 🟤 decision, ⚖️ trade-off) are often worth fetching immediately`;
