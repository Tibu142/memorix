import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({
  command: 'node',
  args: ['e:/my_idea_cc/my_copilot/memorix/dist/cli/index.js', 'serve'],
  cwd: 'e:/my_idea_cc/Origin-Notes',
});

const client = new Client({ name: 'memorix-recorder', version: '1.0.1' }, { capabilities: {} });

const narrative = [
  'Goal: run a reproducible production release for LmNotebook (baseline v1.0.11).',
  'Steps:',
  '1) Pre-release checks: pytest backend tests, npm build, npm verify:release.',
  '2) Bump version: npm version 1.0.11 --no-git-tag-version.',
  '3) Commit release changes.',
  '4) Push main branch.',
  '5) Create and push tag v1.0.11.',
  '6) Wait for GitHub Actions Release workflow to complete with success.',
  '7) Verify release assets for win/mac/linux and latest*.yml files.',
  'Outcome: GitHub Release completed and auto-update channel available.',
].join('\n');

try {
  await client.connect(transport);
  const storeRes = await client.callTool({
    name: 'memorix_store',
    arguments: {
      entityName: 'LmNotebook Release Workflow',
      type: 'how-it-works',
      title: 'GitHub release flow for LmNotebook',
      narrative,
      facts: [
        'Repo: AVIDS2/LmNotebook',
        'Tag format: vX.Y.Z',
        'Validated baseline: v1.0.11',
        'Trigger: push tag v*',
        'Gate checks: pytest + build + verify:release'
      ],
      filesModified: ['.github/workflows/release.yml', 'package.json'],
      concepts: ['release', 'github-actions', 'electron-builder', 'auto-update', 'semver']
    }
  });

  const searchRes = await client.callTool({
    name: 'memorix_search',
    arguments: { query: 'GitHub release flow for LmNotebook', limit: 5, scope: 'project' }
  });

  console.log('=== memorix_store ===');
  console.log(JSON.stringify(storeRes, null, 2));
  console.log('=== memorix_search ===');
  console.log(JSON.stringify(searchRes, null, 2));
} finally {
  await client.close();
}
