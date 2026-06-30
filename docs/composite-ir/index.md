# IR JSON 复合节点表示 — 文档索引

> 本文档集完整描述复合节点从运行时捕获 → IR JSON 序列化 → GIA 编码全链路的数据结构。基于 **user_edit 目录全部 40 个真实 GIA 文件**的逆向验证 + **实用/log系统.gia**、**复杂gia/物理运动.gia**、**复杂gia/弹球.gia + 传球.gia** 的三轮交叉核验。
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
| **查看待验证的疑点** | → [todo.md §6（需后续验证的疑点）](todo.md#-需后续验证的疑点) |
| **判断我的发现是否已有记录** | → 见下方文件列表 + todo.md §6 疑点表 |
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
| [`todo`](todo.md) | **待办清单** — 覆盖状态、P0/P1 优先级、文档更新计划、核验发现 | logSystem + 物理运动 |

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

## 核心认知

- **CompositeDefIR** 是 IR JSON 中的复合节点定义结构（接口声明 + 实现图 + 引脚映射）
- **compositePins** 是最核心的路由表，定义外部引脚和内部节点引脚之间的映射
- **pinIndex 匹配** 是 GIA 复合正确工作的核心约束——两端必须一致
- **终端/非终端** 不是 CompositeDef 的属性，而是调用位置的属性
- **核验先于更新**：拿到新文件先找矛盾，而不是加章节
- **三种架构风格**：GIA 文件可分为事件驱动（A）、信号驱动（B）、计算流水线（C）三种执行模型
- **共享复合库**：跨文件接口一致的 CompositeDef 是编辑器内建库，区别于用户自定义
