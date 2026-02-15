# Memorix 模块详解

> 最后更新: 2026-02-15
> 本文档详细记录每个模块的实现细节、关键算法和注意事项

---

## 1. Orama 搜索引擎 (`store/orama-store.ts`)

### 概述
基于 [Orama](https://github.com/orama/orama) 的全文/混合搜索引擎，344行。

### Schema 设计
```typescript
// 动态 Schema — embedding 可用时自动添加 vector 字段
const schema = {
  id: 'string',
  observationId: 'number',
  entityName: 'string',
  type: 'string',        // 用于 where 过滤
  title: 'string',       // 全文搜索
  narrative: 'string',   // 全文搜索 (权重最高)
  facts: 'string',       // 全文搜索
  filesModified: 'string',
  concepts: 'string',    // 全文搜索
  tokens: 'number',
  createdAt: 'string',
  projectId: 'string',
  accessCount: 'number',
  lastAccessedAt: 'string',
  // 条件字段:
  vector: 'vector[384]', // 仅当 embedding provider 可用时存在
};
```

### 搜索策略
1. **纯全文 (BM25)**: 无 embedding 时的默认模式
2. **混合搜索**: `term` + `vector` 联合搜索，embedding 从查询文本生成
3. **过滤**: 支持按 `type` 和 `projectId` 进行 where 过滤

### 访问追踪
每次搜索结果返回时，自动更新命中文档的:
- `accessCount += 1`
- `lastAccessedAt = now()`

这些数据驱动 retention 引擎的衰减计算。

### ⚠️ 注意事项
- Orama 的 where 子句在 `term: '' + number filter` 时可能不可靠，因此 `compactDetail` 使用内存查找而非 Orama 查询
- 数据库是内存中的，重启后需要通过 `reindexObservations()` 重建
- `resetDb()` 用于热重载场景 — 先清空再重建

---

## 2. 持久化层 (`store/persistence.ts`)

### 存储目录
```
~/.memorix/data/<projectId>/
├── observations.json      # 所有 observation 的 JSON 数组
├── id-counter.txt         # 下一个 observation ID (纯文本数字)
├── entities.jsonl         # 知识图谱节点 (每行一个 JSON)
└── relations.jsonl        # 知识图谱边 (每行一个 JSON)
```

### JSONL 格式 (MCP 兼容)
```jsonl
{"name":"auth-module","entityType":"component","observations":["JWT 认证实现"]}
{"name":"port-config","entityType":"config","observations":["默认端口 3001"]}
```

### 设计决策
- **全局共享目录** (`~/.memorix/data/`): 让不同 Agent 看到同一份数据
- **JSONL 而非单 JSON**: 与 MCP Official Memory Server 的格式兼容
- **observations.json 用 JSON 而非 JSONL**: observation 结构更复杂，JSON 更方便整体读写
- **ID 计数器单独文件**: 避免扫描所有 observation 来确定下一个 ID

### ⚠️ 注意事项
- `projectId` 做目录名时，特殊字符 (如 `/`) 会被 path.join 处理
- 没有文件锁机制 — 多进程同时写入可能导致数据丢失
- 热重载依赖 `fs.watch` 监听 `observations.json` 变化

---

## 3. 知识图谱 (`memory/graph.ts`)

### 操作
| 方法 | 说明 |
|------|------|
| `createEntities` | 创建实体，同名跳过 (幂等) |
| `deleteEntities` | 删除实体 + 关联的关系 |
| `createRelations` | 创建关系，完全相同则跳过 |
| `deleteRelations` | 精确匹配删除 |
| `addObservations` | 追加 observation 文本到实体 |
| `deleteObservations` | 从实体中移除特定 observation 文本 |
| `searchNodes` | 大小写不敏感搜索实体名/类型/观察内容 |
| `openNodes` | 按名称精确查找实体 + 相关关系 |
| `readGraph` | 返回完整图谱 |

### 持久化时机
- 每次 CRUD 操作后立即写入磁盘
- `init()` 时从磁盘加载

### ⚠️ 注意事项
- `createEntities` 对同名实体是幂等的 — 不会覆盖已有观察
- 关系的 `from` 和 `to` 必须引用已存在的实体名

---

## 4. 记忆保留与衰减 (`memory/retention.ts`)

### 核心公式
```
relevance = baseImportance × e^(-ageDays / retentionPeriod) × accessBoost
```

### 参数配置
```typescript
// 重要性 → 保留期
critical: 365天, base=1.0
high:     180天, base=0.8   (gotcha, decision, trade-off)
medium:    90天, base=0.5   (problem-solution, how-it-works, etc.)
low:       30天, base=0.3   (session-request)

// 访问加速
accessBoost = min(2.0, 1 + 0.1 × accessCount)

// 免疫条件 (任一满足)
- importance === 'critical' || 'high'
- accessCount >= 3
- concepts 包含 'keep' | 'important' | 'pinned' | 'critical'
```

### 生命周期分区
```
Active:            7天内被访问 | 免疫 | age < 50% retention
Stale:             age > 50% retention
Archive-candidate: age > 100% retention & !immune
```

### ⚠️ 注意事项
- 免疫的 observation 最低 relevance 为 0.5
- `high` 重要性的 observation 也被视为免疫 — 这意味着 `gotcha`, `decision`, `trade-off` 永远不会被自动归档
- 目前没有实际的自动归档/删除逻辑 — retention 只提供状态报告

---

## 5. 实体抽取器 (`memory/entity-extractor.ts`)

### 正则模式
```
文件路径:  (?:^|[\s"'(])([.\w/-]+\.\w{1,10})(?:[\s"'),]|$)
模块路径:  (@[\w-]+\/[\w.-]+) 或 (a.b.c.d 格式)
URL:       https?://[^\s"'<>)]+
@提及:     @([a-zA-Z_]\w+)
CamelCase: ([A-Z][a-z]+(?:[A-Z][a-z]+)+)
```

### 因果语言检测
```
because | therefore | due to | caused by | as a result | decided to |
chosen because | so that | in order to | leads to | results in |
fixed by | resolved by
```

### 概念丰富规则
- 文件路径 → 取最后一段文件名 (去扩展名) → 概念
- 模块路径 → 取最后一段 → 概念
- CamelCase 标识符 → 直接作为概念
- 所有概念与用户提供的概念去重合并

### ⚠️ 注意事项
- 最小实体长度: 通用3字符, 文件路径5字符
- 全局正则需要在每次使用前重置 `lastIndex`
- 不支持中文标识符抽取

---

## 6. 自动关系创建 (`memory/auto-relations.ts`)

### 关系推断逻辑
```
有因果语言         → "causes"
problem-solution   → "fixes"
decision/trade-off → "decides"
what-changed       → "modifies"
gotcha             → "warns_about"
其他               → "references"
filesModified 匹配 → "modifies" (始终)
```

### 匹配流程
1. 从 extracted entities 中收集候选词 (identifiers + 文件名 + 模块名)
2. 与知识图谱中所有已有实体进行**大小写不敏感**匹配
3. 跳过自引用 (entityName === candidate)
4. 去重后批量创建

### ⚠️ 注意事项
- 每次都读取完整图谱 (`readGraph()`) — 大图谱时可能有性能问题
- 只能匹配**已存在**的实体 — 不会自动创建新实体

---

## 7. Embedding 层 (`embedding/`)

### 架构
```
EmbeddingProvider (接口)
  ├── embed(text) → number[384]
  ├── embedBatch(texts) → number[384][]
  ├── name: string
  └── dimensions: number

FastEmbedProvider (实现)
  ├── 模型: BAAI/bge-small-en-v1.5
  ├── 维度: 384
  ├── 大小: ~30MB (首次使用自动下载)
  ├── 缓存: 内存 Map, 最多 5000 条, FIFO 淘汰
  └── 批量: batch size = 64
```

### 优雅降级
```
getEmbeddingProvider()
  ├── 尝试 import('fastembed') → 成功 → 返回 FastEmbedProvider
  └── 失败 → 返回 null → Orama 退化为纯 BM25 搜索
```

### ⚠️ 注意事项
- `fastembed` 是**可选依赖** — 不在 `dependencies` 中
- Singleton 模式: 全局只有一个 provider 实例
- `resetProvider()` 仅用于测试
- Float32Array → number[] 转换是必要的 (Orama 需要 plain array)

---

## 8. Hooks 系统 (`hooks/`)

### Normalizer — Agent 格式映射

**Claude Code / VS Code Copilot:**
```json
{"hookEventName": "PostToolUse", "sessionId": "xxx", "tool_name": "write", ...}
```

**Windsurf:**
```json
{"agent_action_name": "post_write_code", "trajectory_id": "xxx", "tool_info": {...}}
```

**Cursor:**
```json
{"hook_event_name": "afterFileEdit", "conversation_id": "xxx", ...}
```

### Pattern Detector — 置信度计算
```
confidence = baseConfidence + matchCount × 0.05
上限: 1.0
```
多个关键词匹配 → 置信度更高 → 更可能被记录

### Handler — 冷却和过滤机制
- **全局冷却 Map**: `eventType → lastTimestamp`
- **冷却期**: 30秒 (同一事件类型不会重复记录)
- **噪音命令过滤**: ls, cd, pwd, echo 等不记录
- **最小长度**: 通用 100 字符, 代码编辑 30 字符
- **内容截断**: 最大 4000 字符
- **自引用保护**: 跳过 memorix 自己的工具调用

### ⚠️ 注意事项
- Hooks **必须永远不能崩溃** — 所有错误都静默处理
- `pre_compact` 事件无冷却 — 上下文压缩前抢救式保存
- `session_end` 也无冷却 — 会话结束总是值得记录
- handler 通过 **动态 import** 加载 observations 模块以避免循环依赖

---

## 9. Compact 引擎 (`compact/`)

### Token 计数
使用 `gpt-tokenizer` (OpenAI tiktoken 的 JS 移植)。

### 截断策略
```
1. 按句子边界截断 (逐句添加直到超出预算)
2. 无完整句子 → 字符估算 (1 token ≈ 2 chars 混合语言)
3. 二分递减: 每次保留 90% 直到符合预算
4. 加 "..." 后缀表示截断
```

### Index Format — 图标映射
```
🎯 session-request   🔴 gotcha          🟡 problem-solution
🔵 how-it-works      🟢 what-changed    🟣 discovery
🟠 why-it-exists     🟤 decision        ⚖️ trade-off
```

---

## 10. 工作空间同步 (`workspace/`)

### MCP 适配器
| Agent | 配置格式 | 路径 |
|-------|---------|------|
| Windsurf | JSON (`mcp_config.json`) | `~/.codeium/windsurf/mcp_config.json` |
| Cursor | JSON (`mcp.json`) | `.cursor/mcp.json` (项目级) |
| Claude Code | JSON (`claude_desktop_config.json`) | 平台特定 |
| Codex | TOML | `codex.toml` |
| Copilot | JSON | `.github/copilot/mcp.json` |
| Antigravity | JSON | `~/.gemini/antigravity/mcp_config.json` |

### Workflow 同步
- 扫描 Windsurf 的 `.windsurf/workflows/` 目录
- 转换为 Codex skills / Cursor rules / CLAUDE.md 格式
- 保留原始描述和步骤

### Skills 同步
- 扫描各 Agent 的 skills 目录
- 名字冲突时保留第一个发现的，记录冲突
- 通过文件系统复制迁移

### Apply 流程
```
1. 扫描所有 Agent 配置
2. 生成目标格式文件
3. 备份已有配置 (.bak)
4. 写入新配置
5. 失败时回滚
```

---

## 11. 规则同步 (`rules/`)

### UnifiedRule 中间表示
```typescript
interface UnifiedRule {
  id: string;           // 唯一标识
  content: string;      // 规则内容
  description?: string;
  source: RuleSource;   // 来源 Agent
  scope: 'global' | 'project' | 'path-specific';
  paths?: string[];     // 适用的文件路径 glob
  alwaysApply?: boolean;
  priority: number;     // 0-100
  hash: string;         // 内容哈希 (去重用)
}
```

### 去重策略
- 基于 `hash` (内容的 SHA-256 前8位)
- 相同内容但不同来源 → 保留优先级最高的

### 冲突检测
- 同一 scope 但内容不同的规则 → 标记为冲突
- 返回冲突列表供用户决策

---

## 12. 项目检测 (`project/detector.ts`)

### 检测优先级
```
1. Git root (git rev-parse --show-toplevel)
2. package.json 目录 (向上遍历)
3. CWD (当前工作目录)
```

### Git Remote 规范化
```
https://github.com/user/repo.git  → user/repo
git@github.com:user/repo.git      → user/repo
ssh://git@github.com/user/repo    → user/repo
无 Git remote                      → 目录名
```

### ⚠️ 注意事项
- `execSync` 调用 — 阻塞式, 但只在启动时运行一次
- 非 Git 项目回退为目录名, 可能导致不同机器上 projectId 不同
