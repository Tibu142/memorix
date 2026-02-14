// Hook wrapper: logs stdin for debugging + runs memorix hook
const fs = require('fs');
const { spawn } = require('child_process');

const LOG = 'C:/Users/Lenovo/.memorix/hook-stdin.log';
const chunks = [];

process.stdin.on('data', (chunk) => chunks.push(chunk));
process.stdin.on('end', () => {
  const stdin = Buffer.concat(chunks).toString('utf-8');

  // Log raw stdin
  fs.appendFileSync(LOG, `${new Date().toISOString()}\n${stdin}\n---\n`);

  // Pass to memorix hook
  const child = spawn('node', [
    'e:/my_idea_cc/my_copilot/memorix/dist/cli/index.js',
    'hook'
  ], { stdio: ['pipe', 'pipe', 'pipe'] });

  child.stdin.write(stdin);
  child.stdin.end();

  child.stdout.on('data', (d) => process.stdout.write(d));
  child.stderr.on('data', (d) => process.stderr.write(d));
  child.on('close', (code) => process.exit(code || 0));
});
