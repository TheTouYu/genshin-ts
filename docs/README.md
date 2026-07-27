# GS-TS 文档体系

> 状态：当前推荐
> 来源：文档结构审计
> 最近校验：2026-07-06
> 适用范围：gsts 当前文档体系

## 治理入口
- [`documentation-governance.md`](documentation-governance.md) — 文档状态、来源、验证和归档规则
- [`documentation-map.md`](documentation-map.md) — 按任务查找当前可信文档
- [`project-intelligence/knowledge-tree-expansion-plan.md`](project-intelligence/knowledge-tree-expansion-plan.md) — Project Memory 与 Domain Knowledge 范围扩大计划

## 导航入口
- [`docs/composite-ir/index.md`](composite-ir/index.md) — 复合 IR 知识体系总入口（最活跃、最权威）
- [`docs/architecture/`](architecture/) — 编译管线架构文档

## 用户文档和内部文档边界
- `docs/docs/en/` 和 `docs/docs/zh/` 是 Rspress 用户文档站，面向普通 DSL 使用者。
- `docs/architecture/`、`docs/composite-ir/`、`docs/traces/`、`docs/gia-tools-reference.md` 是内部开发和逆向分析文档。
- 内部逆向结论不要直接搬进用户文档；可迁移 API 用法和通用调试流程，但应剥离内部样本路径、GIA 字段细节和未验证推测。

## 文档分体系

### 架构文档 (architecture/)
- 编译管线三个阶段文档
- 复合节点机制（API、IR 表示、Capture、GIA 编码、Pipeline 流程）
- 客户端节点支持的冻结方案与真实 GIA 验证门禁：
  [`architecture/client-node-support-plan.md`](architecture/client-node-support-plan.md)
- 验证与测试
- **推荐入口**: `architecture/composite/pipeline-flow.md`

### 复合 IR 体系 (composite-ir/)
- 类型定义（确认过的 $real 值，非 gsts 默认值）、验证规则、GIA 编码
- 高级模式（信号驱动、数据共享、多 outflow、structureDef）
- 分析工作流、编译器合规检查
- 跨轮 handover 记录

### 复合 DSL 实战（architecture/composite/）
- [`architecture/composite/raw-control-flow-dsl-quickstart.md`](architecture/composite/raw-control-flow-dsl-quickstart.md) — 新版低层控制流 DSL 快速上手（`f.entry()`/`f.node()`/`f.link()`/`f.inflow()`/`f.outflow()`），当前低层控制流权威参考
- [`architecture/composite/control-flow-api-cookbook.md`](architecture/composite/control-flow-api-cookbook.md) — **新增**：控制流复合 API 实战速查 (顺序执行 / 多 OutFlow 派发 / 真实 GIA 样本对照) — **2026-07-05**

### 维护记录 (maintenance/)
- 节点例行维护、一致性风险审查

### 分析工具 (tools/)
- `decode-gia.ts` — GIA 解码为 JSON
- `trace-exec-flow.ts --io` — 控制流输入/输出汇总，适合拓扑比对
- `trace-dataflow.ts` — 数据流追踪，支持跨复合边界
- `analyze-gia-arch.ts` — GIA 架构分析
- `analyze-composite-gia.ts` — 复合 GIA 分析
- `gap-scan.ts` — 编译器与参考文件缺口扫描
- `coverage.ts` — 覆盖追踪
- `topology.ts` — ASCII 执行流拓扑
- `preview_markdown.ts` — Markdown ANSI 预览

### 跨会话知识 (`.claude/memory/`)
- `MEMORY.md` 索引全部 22 条经验教训和完成记录
- 新会话先读该索引进入状态

### 参考 GIA 文件
- `user_edit/` — 用户手动编辑的参考文件
- `复杂gia/` — 复杂场景分析文件
- `真-测试通过/` — 已验证通过的测试输出

---

## 重要提醒

> ⚠️ `architecture/composite/` 中的 pinIndex 常量（1974/4/8+idx/6）是 gsts 编译器的硬编码默认值，**仅对 gsts 生成的复合有效**。
> 游戏编辑器创建的文件使用不同的值。详情见 [`composite-ir/01-ir-types.md`](composite-ir/01-ir-types.md)。

---

## Rspress 网站

本项目也包含 Rspress 驱动的用户文档网站（`docs/en/` 和 `docs/zh/`），面向 DSL 用户使用。要构建网站：

```bash
npm install
npm run dev     # 启动本地开发服务器
npm run build   # 构建生产版本
npm run preview # 预览构建结果
```

