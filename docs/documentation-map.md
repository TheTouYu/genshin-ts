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
| 查游戏引擎 API 用法 | [`architecture/docs-search.md`](architecture/docs-search.md) + `engine-api-usage`；官方节点规则不足时补用项目级 `miliastra-knowledge` skill | 先按任务路由和本地 docs-search 查事件、实体、向量、变量、集合、定时器、信号和控制流；需要确认编辑器公开节点规则/合法类型组合时，可用 skill 查询外部官方资料。检索不替代真实 GIA、源码或游戏验证。 |
| 查精确 API/事件签名 | [`architecture/docs-search.md`](architecture/docs-search.md) + `engine-api-signatures` | 查询方法、事件、参数、返回类型和生成定义来源；签名不是教程或游戏验证。 |
| 理解编译管线 | [`architecture/composite/pipeline-flow.md`](architecture/composite/pipeline-flow.md) | TS 到 IR 到 GIA 的正向实现视角。 |
| 读取或写回玩家 / CustomPrefab 初始自定义变量 | [`architecture/gil-custom-variables.md`](architecture/gil-custom-variables.md) | GIL 资产读取、变量注入、真实地图证据与安全边界；不要与 `.gia` 节点图注入混用。 |
| 使用或开发客户端节点图 | 用户入口：[`docs/zh/doc/events/client-graphs.md`](docs/zh/doc/events/client-graphs.md)；历史旧实现见 [`architecture/client-node-support-plan.md`](architecture/client-node-support-plan.md) 和 [`architecture/client-gia-encoding.md`](architecture/client-gia-encoding.md) | 当前实现是 `g.characterSkill()`、`g.characterControlSkill()`、`g.creationSkill()`、`g.creationStatus()`、`g.creationStatusDecision()`、`g.boolFilter()`、`g.intFilter()` 七类客户端图；旧 `g.client()`/signal-list materializer 文档仅保留历史证据。 |
| 执行复合 Stage 3 架构重构 | [`composite-ir/architecture-redesign/`](composite-ir/architecture-redesign/) | root/impl 双 backend 审计、目标架构、阶段计划、迁移不变量和验证矩阵；规划内容不要当成当前实现。 |
| 使用复合节点 API | [`architecture/composite/dsl-api.md`](architecture/composite/dsl-api.md) | `g.defineComposite`、`f.callComposite`、类型和调用语义。 |
| 手动复刻控制流拓扑 | [`architecture/composite/raw-control-flow-dsl-quickstart.md`](architecture/composite/raw-control-flow-dsl-quickstart.md) | 当前低层控制流权威入口。 |
| 查控制流实战模式 | [`architecture/composite/control-flow-api-cookbook.md`](architecture/composite/control-flow-api-cookbook.md) | 混合了真实样本、源码推断和历史验证，阅读时看状态提示。 |
| 分析 `.gia` 文件 | [`gia-tools-reference.md`](gia-tools-reference.md) | trace、decode、layout、diff 工具索引。 |
| 查真实 GIA 逆向结论 | [`composite-ir/index.md`](composite-ir/index.md) | 真实文件验证和复合 IR 规律。 |
| 复刻 `物理运动.gia` / 学习复杂 GIA API 写法 | [`composite-ir/physics-motion-recreate-guide.md`](composite-ir/physics-motion-recreate-guide.md) | 面向 AI 复刻真实复杂 GIA 的持续维护知识库；记录每轮确认过的系统 API、复合节点、参数来源和已知差异。 |
| 查历史上下文 | [`composite-ir/handover/README.md`](composite-ir/handover/README.md) | 历史记录，不作为当前教程。 |
| 已有明确 handover + 最小真实 GIA | 任务 handover 的目标/下一步段 + [`composite-ir/handover/layout-working-rules.md`](composite-ir/handover/layout-working-rules.md) 路径速查 | 满足下述快速路径条件时，不必先通读治理层和完整 API 文档。 |

## 明确样本任务快速路径

当任务同时满足以下条件时，优先走快速路径：

1. 用户给出了具体 handover 或明确描述了单一待修行为。
2. 用户给出了最小真实 `.gia` 文件或精确路径。
3. 比较方法和验收字段明确，例如 node ID、pin、wrapper、connects。
4. 不涉及新 API 设计、结构歧义、破坏性操作或游戏状态取舍。

最小阅读集：

1. 只读 handover 的状态、失败链路和“下一轮目标”段。
2. 只读 `layout-working-rules.md` 的路径速查及匹配的命令模板。
3. 直接解码真实样本并写同构测试。
4. 用结构化 JSON 比较定位差异，再读取对应源码函数和现有针对性测试。
5. 修复后运行针对性回归；只有共享编译器行为受影响时才扩大验证范围。

在快速路径中，`documentation-governance.md` 的来源分级仍然有效，但无需每次完整加载。除非比较结果暴露 API 语义不清或跨模块影响，否则不要预先通读完整 `dsl-api.md`、旧 handover、布局算法文档，也不要先做广泛代码库探索。

退出快速路径的条件：出现真实 GIA 与当前实现冲突但无法判定适用范围、需要设计新接口、发现多个可能根因、用户要求架构审计，或操作将注入/覆盖/删除用户数据。此时回到治理层和对应权威文档，并按项目规则向用户确认。

## 按来源找文档

### 当前代码实现

这些文档描述 gsts 当前实现，重点关注源码行为和生成结果：

- [`architecture/composite/dsl-api.md`](architecture/composite/dsl-api.md)
- [`architecture/composite/raw-control-flow-dsl-quickstart.md`](architecture/composite/raw-control-flow-dsl-quickstart.md)
- [`architecture/composite/capture-mechanism.md`](architecture/composite/capture-mechanism.md)
- [`architecture/composite/ir-representation.md`](architecture/composite/ir-representation.md)
- [`architecture/composite/gia-encoding.md`](architecture/composite/gia-encoding.md)
- [`architecture/runtime-dsl.md`](architecture/runtime-dsl.md)

正在规划但尚未成为当前实现的 Stage 3 重构见
[`composite-ir/architecture-redesign/`](composite-ir/architecture-redesign/)。该目录明确区分当前审计、目标设计和待执行实验。

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
