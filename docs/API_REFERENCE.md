# Memorix MCP 工具 API 参考

> 最后更新: 2026-02-15
> 所有 MCP 工具的完整参数说明和使用示例

---

## 概览

Memorix 注册了 **16 个 MCP 工具**，分为 4 类:

| 类别 | 工具 | 用途 |
|------|------|------|
| **Memorix 扩展** | memorix_store, memorix_search, memorix_detail, memorix_timeline, memorix_retention | 结构化记忆管理 |
| **MCP 官方兼容** | create_entities, create_relations, add_observations, delete_entities, delete_observations, delete_relations, search_nodes, open_nodes, read_graph | 知识图谱操作 |
| **规则同步** | memorix_rules_sync | 跨 Agent 规则同步 |
| **工作空间同步** | memorix_workspace_sync | 跨 Agent 工作空间迁移 |

---

## Memorix 扩展工具

### `memorix_store`

存储新的 observation/记忆。自动索引、实体抽取、关系推断。

**参数:**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `entityName` | string | ✅ | 所属实体名 (如 "auth-module") |
| `type` | enum | ✅ | 分类类型 (见下表) |
| `title` | string | ✅ | 简短标题 (~5-10 词) |
| `narrative` | string | ✅ | 完整描述 |
| `facts` | string[] | ❌ | 结构化事实 |
| `filesModified` | string[] | ❌ | 涉及的文件列表 |
| `concepts` | string[] | ❌ | 相关概念/关键词 |

**Observation 类型:**
| 类型 | 图标 | 说明 |
|------|------|------|
| `session-request` | 🎯 | 用户的原始目标 |
| `gotcha` | 🔴 | 严重陷阱/坑 |
| `problem-solution` | 🟡 | Bug 修复或变通方案 |
| `how-it-works` | 🔵 | 技术说明 |
| `what-changed` | 🟢 | 代码/架构变更 |
| `discovery` | 🟣 | 新发现/洞察 |
| `why-it-exists` | 🟠 | 设计原因 |
| `decision` | 🟤 | 架构决策 |
| `trade-off` | ⚖️ | 权衡妥协 |

**返回示例:**
```
✅ Stored observation #42 "Fixed JWT auth timeout" (~155 tokens)
Entity: auth-module | Type: problem-solution | Project: user/repo
Auto-enriched: +2 files extracted, +3 concepts enriched, +1 relations auto-created, causal language detected
```

**自动丰富行为:**
- 从标题+叙述+事实中自动抽取文件路径、模块名、CamelCase 标识符
- 抽取的文件自动添加到 `filesModified`
- 抽取的标识符自动添加到 `concepts`
- 检测因果语言 ("because", "due to" 等) 并自动创建知识图谱关系

---

### `memorix_search`

搜索项目记忆。返回紧凑索引 (~50-100 tokens/条)。

**参数:**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `query` | string | ✅ | 搜索查询 (自然语言或关键词) |
| `limit` | number | ❌ | 最大结果数 (默认 20) |
| `type` | enum | ❌ | 按类型过滤 |
| `maxTokens` | number | ❌ | Token 预算 (0=无限) |

**返回示例:**
```
Found 3 observation(s) matching "auth":

| ID | Time | T | Title | Tokens |
|----|------|---|-------|--------|
| #42 | 2:14 PM | 🟡 | Fixed JWT auth timeout | ~155 |
| #38 | 1:30 PM | 🔵 | How JWT refresh works | ~220 |
| #35 | 11:00 AM | 🟤 | Decided on JWT over sessions | ~180 |

💡 Progressive Disclosure: Use memorix_detail for full content, memorix_timeline for context.
```

**搜索模式:**
- 无 embedding: BM25 全文搜索
- 有 embedding: 混合搜索 (全文 + 向量相似度)

---

### `memorix_timeline`

获取特定 observation 的时间线上下文。

**参数:**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `anchorId` | number | ✅ | 中心 observation ID |
| `depthBefore` | number | ❌ | 前置数量 (默认 3) |
| `depthAfter` | number | ❌ | 后续数量 (默认 3) |

---

### `memorix_detail`

按 ID 获取完整 observation 详情 (~500-1000 tokens/条)。

**参数:**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `ids` | number[] | ✅ | Observation ID 列表 |

**最佳实践:** 先用 `memorix_search` 找到相关 ID，再用 `memorix_detail` 获取详情。

---

### `memorix_retention`

显示记忆保留状态面板。

**参数:** 无

**返回内容:**
- Active / Stale / Archive Candidates / Immune 计数
- Archive Candidates 列表 (最多 10 条)
- Top 5 最相关的 observations (含衰减分数)

---

## MCP 官方兼容工具

这些工具与 [MCP Official Memory Server](https://github.com/modelcontextprotocol/servers/tree/main/src/memory) 完全兼容。

### `create_entities`
```json
{
  "entities": [
    {
      "name": "auth-module",
      "entityType": "component",
      "observations": ["负责 JWT 认证"]
    }
  ]
}
```

### `create_relations`
```json
{
  "relations": [
    {
      "from": "auth-module",
      "to": "user-service",
      "relationType": "depends_on"
    }
  ]
}
```

**推荐关系类型:** causes, fixes, supports, opposes, contradicts, depends_on, implements, extends, replaces, documents

### `add_observations`
```json
{
  "observations": [
    {
      "entityName": "auth-module",
      "contents": ["添加了 refresh token 支持"]
    }
  ]
}
```

### `delete_entities`
```json
{ "entityNames": ["deprecated-module"] }
```

### `delete_observations`
```json
{
  "deletions": [
    {
      "entityName": "auth-module",
      "observations": ["过时的信息"]
    }
  ]
}
```

### `delete_relations`
```json
{
  "relations": [
    { "from": "a", "to": "b", "relationType": "depends_on" }
  ]
}
```

### `search_nodes`
```json
{ "query": "auth" }
```
返回名称、类型或观察内容匹配的实体及其关系。

### `open_nodes`
```json
{ "names": ["auth-module", "user-service"] }
```
按名称精确查找实体及相关关系。

### `read_graph`
无参数。返回完整知识图谱。

---

## 规则同步工具

### `memorix_rules_sync`

**参数:**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `action` | "status" \| "generate" | ✅ | 操作类型 |
| `target` | enum | ❌ | 目标 Agent (generate 时必填) |

**支持的目标:** cursor, claude-code, codex, windsurf, antigravity, copilot

**示例 - 查看同步状态:**
```json
{ "action": "status" }
```

**示例 - 生成 Cursor 规则:**
```json
{ "action": "generate", "target": "cursor" }
```

---

## 工作空间同步工具

### `memorix_workspace_sync`

**参数:**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `action` | "scan" \| "migrate" \| "apply" | ✅ | 操作类型 |
| `target` | enum | ❌ | 目标 Agent (migrate/apply 时必填) |
| `items` | string[] | ❌ | 选择性同步的项目名称列表 |

**操作说明:**
- `scan`: 检测所有 Agent 的工作空间配置
- `migrate`: 预览迁移结果 (不写入磁盘)
- `apply`: 执行迁移并写入磁盘 (带备份/回滚)

**示例 - 扫描:**
```json
{ "action": "scan" }
```

**示例 - 选择性同步到 Cursor:**
```json
{
  "action": "apply",
  "target": "cursor",
  "items": ["figma-remote-mcp-server", "create-subagent"]
}
```

---

## 使用建议

### 对 AI Agent 的指导
1. 会话开始时，用 `memorix_search` 搜索相关上下文
2. 发现重要信息时，用 `memorix_store` 存储
3. 只获取需要的详情 — 先 L1 扫描，再 L3 获取
4. 关键类型 (🔴 gotcha, 🟤 decision, ⚖️ trade-off) 通常值得立即获取
5. 定期用 `memorix_retention` 检查记忆健康状态

### 首次搜索的同步建议
第一次调用 `memorix_search` 时，如果检测到其他 Agent 的配置:
- 会附带一条跨 Agent 同步建议
- 列出可用的 MCP servers / skills / rules
- 提示用户是否需要同步
