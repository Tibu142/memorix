/**
 * Memorix Memory Demo
 *
 * 演示上下文记忆的完整流程：
 * 1. 存储记忆（模拟Agent在工作中记录）
 * 2. 搜索记忆（模拟Agent开始新会话）
 * 3. 获取详情（模拟Agent按需深入）
 * 4. 跨Agent共享（同一份数据，不同Agent都能访问）
 */

import { KnowledgeGraphManager } from '../src/memory/graph.js';
import { storeObservation, initObservations } from '../src/memory/observations.js';
import { compactSearch, compactTimeline, compactDetail } from '../src/compact/engine.js';
import { resetDb } from '../src/store/orama-store.js';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

async function demo() {
  // 初始化
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'memorix-demo-'));
  await resetDb();
  const graph = new KnowledgeGraphManager(dataDir);
  await graph.init();
  await initObservations(dataDir);

  const PROJECT = 'my-app/frontend';

  console.log('=== Memorix 上下文记忆演示 ===\n');

  // -----------------------------------------------
  // 场景1: Windsurf 里的开发者修复了一个bug
  // Agent自动调用 memorix_store
  // -----------------------------------------------
  console.log('📝 场景1: 在 Windsurf 中修复bug，Agent自动存储记忆\n');

  const obs1 = await storeObservation({
    entityName: 'port-config',
    type: 'gotcha',
    title: 'Port 3000被占用，必须用3001',
    narrative: '启动dev server时发现port 3000被另一个进程占用。尝试了多种方式后，最终改为3001。这个问题在Windows上经常出现。',
    facts: ['port 3000被占用', '改为port 3001', 'Windows特有问题', '修改了 vite.config.ts:8'],
    filesModified: ['vite.config.ts'],
    concepts: ['port', 'dev-server', 'vite', 'windows'],
    projectId: PROJECT,
  });
  console.log(`  → 存储成功: #${obs1.id} 🔴 ${obs1.title} (~${obs1.tokens} tokens)\n`);

  const obs2 = await storeObservation({
    entityName: 'auth-module',
    type: 'decision',
    title: '选择JWT而非Session进行API认证',
    narrative: '经过讨论，决定使用JWT做无状态认证。主要原因是前后端分离架构下，JWT不需要服务器维护session状态。',
    facts: ['JWT无状态', '24小时过期', 'refresh token 7天', '存在localStorage'],
    filesModified: ['src/auth/jwt.ts', 'src/middleware/auth.ts'],
    concepts: ['JWT', 'authentication', 'stateless', 'security'],
    projectId: PROJECT,
  });
  console.log(`  → 存储成功: #${obs2.id} 🟤 ${obs2.title} (~${obs2.tokens} tokens)\n`);

  const obs3 = await storeObservation({
    entityName: 'deploy-pipeline',
    type: 'problem-solution',
    title: 'Docker构建超时 — 增加到600s解决',
    narrative: 'CI/CD pipeline中Docker build经常超时（默认300s）。根因是npm install在没有缓存时需要很长时间。解决方案：timeout设为600s + 添加npm cache层。',
    facts: ['默认timeout 300s不够', '改为600s', '添加了npm cache Docker layer', 'Dockerfile:12-15'],
    filesModified: ['Dockerfile', '.github/workflows/deploy.yml'],
    concepts: ['docker', 'CI/CD', 'timeout', 'npm-cache'],
    projectId: PROJECT,
  });
  console.log(`  → 存储成功: #${obs3.id} 🟡 ${obs3.title} (~${obs3.tokens} tokens)\n`);

  // 同时建立知识图谱关系
  await graph.createEntities([
    { name: 'port-config', entityType: 'config', observations: [] },
    { name: 'auth-module', entityType: 'component', observations: [] },
    { name: 'deploy-pipeline', entityType: 'infrastructure', observations: [] },
  ]);
  await graph.createRelations([
    { from: 'auth-module', to: 'deploy-pipeline', relationType: 'deployed_by' },
  ]);

  // -----------------------------------------------
  // 场景2: 第二天，开发者用 Cursor 打开同一项目
  // Agent自动调用 memorix_search 查历史
  // -----------------------------------------------
  console.log('─'.repeat(50));
  console.log('\n🔍 场景2: 第二天在 Cursor 中开始新会话，Agent搜索历史\n');

  console.log('  Agent调用: memorix_search({ query: "port" })\n');
  const search1 = await compactSearch({ query: 'port', projectId: PROJECT });
  console.log('  L1 索引结果（仅消耗 ~50 tokens）:');
  console.log(search1.formatted);

  // -----------------------------------------------
  // 场景3: Agent看到索引后，决定看详情
  // -----------------------------------------------
  console.log('\n🔎 场景3: Agent需要详情，调用 memorix_detail\n');

  console.log(`  Agent调用: memorix_detail({ ids: [${obs1.id}] })\n`);
  const detail = await compactDetail([obs1.id], PROJECT);
  console.log('  L3 详情结果:');
  console.log(detail.formatted);

  // -----------------------------------------------
  // 场景4: 搜索认证相关的记忆
  // -----------------------------------------------
  console.log('\n─'.repeat(50));
  console.log('\n🔍 场景4: 在 Codex 中搜索认证相关\n');

  console.log('  Agent调用: memorix_search({ query: "JWT authentication" })\n');
  const search2 = await compactSearch({ query: 'JWT authentication', projectId: PROJECT });
  console.log(search2.formatted);

  // -----------------------------------------------
  // 场景5: 时间线 — 看某个记忆前后发生了什么
  // -----------------------------------------------
  console.log('\n📅 场景5: 查看时间线上下文\n');

  console.log(`  Agent调用: memorix_timeline({ anchor: ${obs2.id} })\n`);
  const timeline = await compactTimeline(obs2.id, PROJECT, 2, 2);
  console.log(timeline.formatted);

  // -----------------------------------------------
  // 总结
  // -----------------------------------------------
  console.log('\n' + '='.repeat(50));
  console.log('\n✅ 关键点:');
  console.log('  1. 记忆存储一次，所有Agent都能访问（通过MCP协议）');
  console.log('  2. L1搜索只返回索引（~50 tokens），不浪费上下文窗口');
  console.log('  3. Agent按需获取详情，实现~10x token节省');
  console.log('  4. 按项目隔离，不同项目的记忆不会交叉');

  // 清理
  await fs.rm(dataDir, { recursive: true, force: true });
}

demo().catch(console.error);
