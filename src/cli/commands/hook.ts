/**
 * CLI Command: memorix hook
 *
 * Entry point called by agent hooks via stdin/stdout.
 * Reads agent's JSON from stdin, normalizes, auto-stores, outputs response.
 *
 * Usage (called by agent hook configs, not by users directly):
 *   memorix hook
 */

import { defineCommand } from 'citty';

export default defineCommand({
  meta: {
    name: 'hook',
    description: 'Handle agent hook event (called by agent hook configs)',
  },
  run: async () => {
    const { runHook } = await import('../../hooks/handler.js');
    await runHook();
  },
});
