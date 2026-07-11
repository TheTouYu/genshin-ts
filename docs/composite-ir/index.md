# IR JSON 复合节点表示 — 文档索引

> 状态：已验证 / 当前推荐入口
> 来源：真实 GIA 验证 + 当前代码实现对照
> 最近校验：2026-07-06
> 适用范围：真实 GIA 逆向结论；与 gsts 当前实现对照时需看具体章节标注

> 本文档集描述复合节点从真实 GIA 逆向结论到 gsts 当前实现对照的知识体系。真实 GIA 结论基于 `user_edit/`、`复杂gia/`、`实用/` 等样本的多轮验证；代码实现结论必须回指到当前源码或测试。
> >
> > 最新更新：已验证三种 GIA 执行模型（事件驱动/信号驱动/计算流水线）和跨文件共享复合库。
>
> 本文档是反馈系统的 **知识库（②）** 部分。分析工作流见 [analyze-workflow.md](analyze-workflow.md)，待办清单见 [todo.md](todo.md)，思维纠偏工具见 `/think-check`。

---

## 快速入口

| 你想做什么 | 从哪里开始 |
|:---------|:---------|
| **分析新 GIA 文件** | → [analyze-workflow.md](analyze-workflow.md)（从 Phase 0 开始） |
| **检查还有哪些文档缺口** | → [todo.md §3（文档更新计划）](todo.md#3-文档更新计划下一轮) |
| **了解新版低层控制流 DSL** | → [Raw Control-Flow DSL Quickstart](../architecture/composite/raw-control-flow-dsl-quickstart.md)（`f.entry()`/`f.node()`/`f.link()`/`f.inflow()`/`f.outflow()`） |
| **查看文档状态和来源规则** | → [documentation-governance.md](../documentation-governance.md) |
| **按任务找当前可信文档** | → [documentation-map.md](../documentation-map.md) |
| **查看待验证的疑点** | → [todo.md §6（需后续验证的疑点）](todo.md#-需后续验证的疑点) |
| **判断我的发现是否已有记录** | → 见下方文件列表 + todo.md §6 疑点表 |
| **复盘一次完整的 GIA 协议问题修复** | → [R20 bool EnumId 元数据复盘](retrospectives/r20-bool-enum-metadata.md) |
| **gsts 编译器要改什么才能匹配编辑器输出** | → [gsts-compiler-gap.md](gsts-compiler-gap.md)（合规清单） |
| **参与复合 Stage 3 架构重构** | → [architecture-redesign/](architecture-redesign/)（统一普通图编译器的全局规划与阶段执行文档） |
| **我感觉思路跑偏了** | → 在对话中键入 `/think-check` |

---

## 文件列表

| 文件 | 内容 | 覆盖范围 |
|:----|:-----|:--------|
| [`01-ir-types`](01-ir-types.md) | **类型定义** — CompositeDefIR、CompositePinEntry、CompositeCallMeta、compositeDataEdges、CompositeCapture、SignalDef(which=14)、structureDef(which=29) | user_edit 40 文件 + logSystem + 物理运动 |
| [`02-ir-examples`](02-ir-examples.md) | **完整示例** — 纯数据复合、执行型复合、主图调用的 IR JSON 示例 | user_edit 文件 |
| [`03-validation-basics`](03-validation-basics.md) | **基础验证** — 01.gia 单文件校验 + 跨文件对比（user_edit 40 文件，**22 条关键规律** + log系统.gia + 物理运动.gia 覆盖情况） | user_edit 40 文件 + logSystem + 物理运动 |
| [`04-validation-signal`](04-validation-signal.md) | **信号型复合验证** — 内置信号、ClientExec pin (kind=5)、compositePins 重复条目、特殊 ID 范围、SignalDef 与 relatedIds 机制、大规模信号网络 | 信号目录 6 文件 + logSystem + 物理运动 |
| [`05-gia-encoding`](05-gia-encoding.md) | **GIA 编码** — 从 IR JSON 到 GIA 的数据流 + 代码位置速查 + which=14/29 编码规则 | 编译器代码 + 真实文件验证 |
| [`06-advanced-patterns`](06-advanced-patterns.md) | **高级模式** — structureDef、SignalDef、编排器、物理引擎流水线、大规模信号网络、向量运算复合族、下沉式复合、**信号驱动架构**、**共享复合库**、**三种架构风格分类** | logSystem + 物理运动 + 弹球+传球 |
| [`analyze-workflow`](analyze-workflow.md) | **分析工作流** — 反馈系统组件 ①，定义 5 Phase 执行顺序和守卫条件 | 自参考（自我进化） |
| [`gsts-compiler-gap`](gsts-compiler-gap.md) | **编译器合规清单** — gsts 输出 vs 编辑器的逐字段差异、优先级、代码位置 | 首次 gsts 编译对比 2026-06-30 |
| [`todo`](todo.md) | **待办清单** — 覆盖状态、P0/P1 优先级、文档更新计划、核验发现 | logSystem + 物理运动 + 弹球+传球 |
| [`retrospectives/r20-bool-enum-metadata`](retrospectives/r20-bool-enum-metadata.md) | **完整案例复盘** — field 101、wire-level 定位、编译器修复、自动回归、游戏验证和 vendor 维护 | CompositeDef bool 参数 |
| [`architecture-redesign/`](architecture-redesign/) | **当前架构重审与迁移计划** — root/impl 双 backend 审计、Resolved Graph IR、vendor-backed ordinary lowering、阶段闸门和验证矩阵 | Stage 3 普通节点 + composite boundary |

---

## 验证覆盖

| 文件集 | 文件数 | 覆盖内容 |
|:------|:-----:|:---------|
| `user_edit/` 分支系列 | 7 | 终端/非终端/纯数据/event fork |
| `user_edit/` 信号系列 | 6+5 | 内置信号/ClientExec/重复条目/定义文件格式 |
| `user_edit/` 嵌套复合 | 1 | 3 层嵌套/内部连线/串行组合 |
| `user_edit/` 顺序执行 | 5 | 4 OutFlow/fork+汇聚/系统默认 pi |
| `user_edit/` 流程控制 | 4 | 复杂_exec/multi-InFlow/循环复合 |
| `user_edit/` gsts 生成 | 2 | 系统 ID 范围 + 默认 pi 输出 |
| `user_edit/` 基本调用 | 2 | 简单终端/参数化复合 |
| `user_edit/` 纯定义文件 | 5 | which=12 格式 |
| `user_edit/` 无复合 | 2 | 纯节点图对照 |
| `实用/` log系统.gia | **48 CompositeDefs** | 数据驱动架构、SignalDef、structureDef |
| `复杂gia/` 物理运动.gia | **50 CompositeDefs** | 物理引擎计算流水线、大规模信号网络、向量复合族 |
| `复杂gia/` 弹球.gia | **33 CompositeDefs** | 信号驱动架构、跨文件共享复合、72 条数据连线 |
| `复杂gia/` 传球.gia | **14 CompositeDefs** | 事件驱动逻辑、11 个内建共享复合 |

---

## 与 docs/architecture 的关系

本目录（`docs/composite-ir/`）与 `docs/architecture/` 构成**对比验证关系**：

| 维度 | 本目录 `docs/composite-ir/` | `docs/architecture/` |
|:----|:--------------------------|:--------------------|
| 视角 | **逆向**（从真实 GIA 文件倒推规律） | **正向**（从编译器代码描述输出） |
| 方法 | 分析 ~50 个真实 GIA 文件的模式 | 追踪三阶段编译管线的源代码 |
| 覆盖 | 模式分类、跨文件对比、架构风格 | Capture 机制、DSL API、管线流水线 |
| 假设 | 每个 GIA 文件可独立分析 | gsts 编译器产生所有 GIA 文件 |
| 验证 | 用真实文件做 cross-check | 部分断言（graphId、pinIndex）与真实文件**冲突** |

**经验教训（2026-06-30）**：
- `docs/architecture/` 的主要假设是"gsts 编译器产生所有输出"，但 `复杂gia/` 的 3 个文件中 **97 个复合无一在 gsts ID 空间 (1610700000+)**——它们来自游戏编辑器
- `graphId = def.id + 10000`、`pinIndex 常量(1974/4/8+idx)` 等核心断言在真实数据中 **0% 通过率**（85/85 和 36/36 FAIL）
- 两套文档的正确关系是**互相验证**而非互相引用：arch 文档描述 gsts 编译器行为，本目录描述真实 GIA 文件规律

交叉引用均标注了验证结果和适用范围。

- **CompositeDefIR** 是 IR JSON 中的复合节点定义结构（接口声明 + 实现图 + 引脚映射）
- **compositePins** 是最核心的路由表，定义外部引脚和内部节点引脚之间的映射
- **pinIndex 匹配** 是 GIA 复合正确工作的核心约束——两端必须一致
- **终端/非终端** 不是 CompositeDef 的属性，而是调用位置的属性
- **核验先于更新**：拿到新文件先找矛盾，而不是加章节
- **三种架构风格**：GIA 文件可分为事件驱动（A）、信号驱动（B）、计算流水线（C）三种执行模型
- **共享复合库**：跨文件接口一致的 CompositeDef 是编辑器内建库，区别于用户自定义
