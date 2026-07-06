# Documentation Map

> 状态：当前推荐
> 来源：当前代码实现 + 文档结构审计
> 最近校验：2026-07-06
> 适用范围：gsts 当前文档体系

本文档按任务说明应该阅读哪里。它不是所有文档的完整目录，而是当前可信入口地图。

## 先读什么

| 任务 | 推荐入口 | 说明 |
|---|---|---|
| 写普通 DSL 脚本 | `docs/docs/en/` / `docs/docs/zh/` | Rspress 用户文档，面向普通使用。 |
| 理解编译管线 | [`architecture/composite/pipeline-flow.md`](architecture/composite/pipeline-flow.md) | TS 到 IR 到 GIA 的正向实现视角。 |
| 使用复合节点 API | [`architecture/composite/dsl-api.md`](architecture/composite/dsl-api.md) | `g.defineComposite`、`f.callComposite`、类型和调用语义。 |
| 手动复刻控制流拓扑 | [`architecture/composite/raw-control-flow-dsl-quickstart.md`](architecture/composite/raw-control-flow-dsl-quickstart.md) | 当前低层控制流权威入口。 |
| 查控制流实战模式 | [`architecture/composite/control-flow-api-cookbook.md`](architecture/composite/control-flow-api-cookbook.md) | 混合了真实样本、源码推断和历史验证，阅读时看状态提示。 |
| 分析 `.gia` 文件 | [`gia-tools-reference.md`](gia-tools-reference.md) | trace、decode、layout、diff 工具索引。 |
| 查真实 GIA 逆向结论 | [`composite-ir/index.md`](composite-ir/index.md) | 真实文件验证和复合 IR 规律。 |
| 查历史上下文 | [`composite-ir/handover/README.md`](composite-ir/handover/README.md) | 历史记录，不作为当前教程。 |

## 按来源找文档

### 当前代码实现

这些文档描述 gsts 当前实现，重点关注源码行为和生成结果：

- [`architecture/composite/dsl-api.md`](architecture/composite/dsl-api.md)
- [`architecture/composite/raw-control-flow-dsl-quickstart.md`](architecture/composite/raw-control-flow-dsl-quickstart.md)
- [`architecture/composite/capture-mechanism.md`](architecture/composite/capture-mechanism.md)
- [`architecture/composite/ir-representation.md`](architecture/composite/ir-representation.md)
- [`architecture/composite/gia-encoding.md`](architecture/composite/gia-encoding.md)
- [`architecture/runtime-dsl.md`](architecture/runtime-dsl.md)

注意：部分旧实现文档仍含 `leafMarks`、`outflowExitNodes`、`f.leaf()` 等历史结构。当前实现以 `CompositeCapture.inflowMarks/outflowMarks`、`f.inflow()`、`f.outflow()` 和 raw control-flow DSL 为准。

### 真实 GIA 验证

这些文档来自真实 `.gia` 文件逆向和工具输出：

- [`composite-ir/index.md`](composite-ir/index.md)
- [`composite-ir/01-ir-types.md`](composite-ir/01-ir-types.md)
- [`composite-ir/03-validation-basics.md`](composite-ir/03-validation-basics.md)
- [`composite-ir/04-validation-signal.md`](composite-ir/04-validation-signal.md)
- [`composite-ir/06-advanced-patterns.md`](composite-ir/06-advanced-patterns.md)
- [`composite-ir/analyze-workflow.md`](composite-ir/analyze-workflow.md)

真实 GIA 样本常见位置包括 `复杂gia/` symlink 和 Windows `Beyond_Local_Export/` 下的 `user_edit/`、`布局/`、`实用/` 等目录。路径以当前机器实际存在为准。

### 历史记录

这些文件保留决策过程、失败路径和上下文，不应作为当前 API 教程：

- [`composite-ir/handover/`](composite-ir/handover/)
- [`composite-ir/composite-priority-backlog.md`](composite-ir/composite-priority-backlog.md)
- [`composite-ir/composite-worktree-ops.md`](composite-ir/composite-worktree-ops.md)
- `architecture/composite/*fix*.md`
- `architecture/composite/*gaps*.md`

## 推荐目录演进

当前不做大规模迁移。后续如果需要重整目录，建议按以下目标逐步迁移：

```text
docs/
├── current/              # 当前推荐 API、工具和编译器说明
├── verified-gia/         # 真实 GIA 逆向结论和 case studies
├── implementation/       # 当前代码实现说明
└── archive/              # handover、旧设计、deprecated guides
```

迁移原则：先建立入口和状态标签，再小批量迁移；不要一次性移动全部文档。

## 当前高风险重复区

| 主题 | 重复位置 | 当前处理 |
|---|---|---|
| 低层控制流 API | `dsl-api.md`、`control-flow-api-cookbook.md`、`raw-control-flow-dsl-quickstart.md`、多个 handover | 以 raw quickstart 为权威入口，其它文档只保留上下文和链接。 |
| 多 OutFlow / 多 InFlow | `multi-outflow-composite-guide.md`、`dsl-api.md`、`01-ir-types.md`、cookbook | 标清实现状态：当前代码已支持多 OutFlow 和多 InFlow；旧 guide 是历史分析。 |
| `leafMarks/outflowExitNodes` | `capture-mechanism.md`、`runtime-dsl.md`、`01-ir-types.md`、旧 handover | 当前实现改为 `outflowMarks/inflowMarks`；旧字段只作为历史。 |
| 工具用法 | `gia-tools-reference.md`、`analyze-workflow.md`、handover | `gia-tools-reference.md` 做工具索引；真实 GIA 结论保留命令证据。 |

## 用户文档边界

`docs/docs/en/` 和 `docs/docs/zh/` 是用户可见文档站。后续可以迁移的内容包括：

- `g.defineComposite` / `f.callComposite` 基础用法。
- `f.entry()` / `f.node()` / `f.link()` 的通用 raw control-flow 用法。
- `trace-exec-flow.ts`、`trace-dataflow.ts`、`decode-gia.ts` 的通用调试命令。

不应迁移到用户文档的内容包括：

- `复杂gia/`、`user_edit/`、`Beyond_Local_Export/` 等内部样本路径。
- GIA protobuf 字段细节、pinIndex 逆向常量、真实文件批量结论。
- 标注为 `感觉正确`、`待验证` 或历史失败路径的内容。
