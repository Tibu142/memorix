# Memorix 已知问题 & 未来路线图

> 最后更新: 2026-02-15

---

## 已知问题 & 限制

### 🔴 严重

| # | 问题 | 影响 | 状态 |
|---|------|------|------|
| 1 | **无文件锁** — 多 Agent 同时写入 `observations.json` 可能导致数据丢失 | 数据完整性 | 未修复 |
| 2 | **Orama where 过滤不可靠** — 空 term + number filter 时结果可能不正确 | `compactDetail` 已绕过 (使用内存查找) | 已变通 |

### 🟡 中等

| # | 问题 | 影响 | 状态 |
|---|------|------|------|
| 3 | **非 Git 项目的 projectId 不稳定** — 基于目录名，不同机器或路径会不同 | 数据隔离 | 未修复 |
| 4 | **retention 只有报告没有执行** — 无自动归档/删除过期记忆 | 数据膨胀 | 需要新工具 |
| 5 | **实体抽取不支持中文标识符** — 正则只匹配英文 | 中文项目覆盖不足 | 未修复 |
| 6 | **auto-relations 每次读取全图** — 大图谱时性能可能下降 | 性能 | 未优化 |
| 7 | **高重要性 observations 永远免疫** — gotcha/decision/trade-off 永不过期 | 数据膨胀 | 设计如此，需评估 |

### 🟢 轻微

| # | 问题 | 影响 | 状态 |
|---|------|------|------|
| 8 | **Kiro/Trae Agent hooks 未实现** — normalizer 中有基础识别但无完整逻辑 | 功能缺失 | 待实现 |
| 9 | **fastembed 首次使用需下载模型** — ~30MB，可能在网络不好时超时 | 用户体验 | npm 可选依赖 |
| 10 | **npx 缓存可能损坏** — 见 `MODULE_NOT_FOUND chownr` 问题 | 安装体验 | 需文档说明 |

---

## 未来路线图

### Phase 1: 稳定化 (当前)
- [x] Copilot Adapter 实现
- [x] Antigravity Adapter 实现
- [x] MCP Server 集成验证
- [x] 274 测试通过
- [x] 开发文档编写
- [ ] README 优化 (安装指南, 演示 GIF)
- [ ] npm 发布配置优化

### Phase 2: 推广 & 用户获取
- [ ] 社区推广 (Reddit, HN, X, Discord)
- [ ] 技术博客文章
- [ ] 演示视频
- [ ] 与其他 MCP Server 项目的对比文档

### Phase 3: Web Dashboard
- [ ] 知识图谱可视化 (D3.js / vis.js)
- [ ] Observation 搜索/浏览 Web UI
- [ ] 记忆保留状态仪表板
- [ ] 跨项目记忆概览

### Phase 4: 功能增强
- [ ] `memorix_compact` — 自动压缩/归档过期记忆
- [ ] `memorix_export` — 导出记忆为 Markdown / JSON
- [ ] 多项目记忆关联搜索
- [ ] 记忆去重和冲突检测
- [ ] LLM-based 实体抽取 (替代正则)
- [ ] 文件锁机制 (多进程安全)

### Phase 5: 新 Agent 集成
- [ ] Kiro 完整支持
- [ ] Trae 支持
- [ ] Claude Desktop 支持
- [ ] JetBrains AI 支持
- [ ] VS Code + Continue.dev 支持

### Phase 6: 高级功能
- [ ] 记忆压缩 (合并相关 observations)
- [ ] 语义去重 (embedding 相似度)
- [ ] 多用户协作记忆
- [ ] 记忆导入/导出联邦协议
- [ ] 自定义 embedding 模型支持

---

## 依赖关系

### 运行时依赖
| 包 | 版本 | 用途 |
|---|------|------|
| `@modelcontextprotocol/sdk` | ^latest | MCP 协议 SDK |
| `@orama/orama` | ^latest | 全文/向量搜索 |
| `gpt-tokenizer` | ^latest | Token 计数 |
| `citty` | ^latest | CLI 框架 |
| `@clack/prompts` | ^latest | CLI 交互提示 |
| `zod` | ^3 | 参数验证 |

### 可选依赖
| 包 | 版本 | 用途 |
|---|------|------|
| `fastembed` | ^latest | 本地 ONNX embedding (384d) |

### 开发依赖
| 包 | 版本 | 用途 |
|---|------|------|
| `vitest` | ^latest | 测试框架 |
| `tsup` | ^latest | 打包构建 |
| `typescript` | ^5 | 类型系统 |

---

## 技术债务

| 优先级 | 项目 | 说明 |
|--------|------|------|
| P0 | 文件锁 | 多进程写入安全 |
| P1 | 自动归档 | retention 模块只有评估没有执行 |
| P1 | projectId 稳定性 | 非 Git 项目需要更好的识别策略 |
| P2 | 中文实体抽取 | 添加中文模式匹配正则 |
| P2 | auto-relations 性能 | 缓存图谱或增量查询 |
| P3 | Orama 持久化 | 考虑 Orama 的原生持久化而非每次重建 |
| P3 | 测试覆盖 | 添加集成测试 (端到端 MCP 调用) |

---

## 历史重要事件

| 日期 | 事件 |
|------|------|
| 2026-02-13 | Copilot Adapter 实现完成，274 测试全部通过 |
| 2026-02-13 | Antigravity MCP 配置修复，Memorix MCP Server 首次成功运行 |
| 2026-02-13 | 发现并修复 npx 缓存损坏问题 (MODULE_NOT_FOUND chownr) |
| 2026-02-15 | 完成全部核心模块的深度代码审查 |
| 2026-02-15 | 开发文档完成 (ARCHITECTURE, MODULES, DEVELOPMENT, DESIGN_DECISIONS, API_REFERENCE) |
