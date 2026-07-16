# 文档待办清单

> 状态：历史记录
> 来源：多轮 GIA 文件逆向分析 + 开发过程记录
> 最近校验：2026-07-06
> 适用范围：记录多轮分析的完成状态和待验证疑点。不作为当前 API 教程；当前入口见 [documentation-map.md](../documentation-map.md)。

> 基于 `实用/log系统.gia`（90KB, 48 CompositeDefs）、`复杂gia/物理运动.gia`（118KB, 50 CompositeDefs）、`复杂gia/弹球.gia`（55KB, 33 CompositeDefs）和`复杂gia/传球.gia`（21KB, 14 CompositeDefs）的三轮联合分析。
>
> 更新于 2026-06-30 — 已完成三轮分析（log系统 核验通过，物理运动 完整文档化，弹球+传球 跨文件对比）。

## 1. 覆盖状态总览

| 状态 | log系统.gia | 物理运动.gia | 说明 |
|:----|:-----------:|:-----------:|------|
| ✅ 已深入分析 | 48 (100%) | 50 (100%) | 模式分类全覆盖 |
| ✅ 已深入文档化 | 全面 | **全面** | §11-14 + §9 + 23-27 + §4.1 扩 |
| ❌ 跳过（内置信号/graphId=0） | 5 | 0 | — |

> **重要区分**：`coverage.ts` 报告 100% 覆盖率是指**基础模式分类**（纯数据/编排器/信号等），不代表具体架构已被文档化。物理运动.gia 是一个完整的物理引擎实现，其架构模式现有文档从未覆盖。

## 2. 物理运动.gia 分析任务（全新）

> `复杂gia/物理运动.gia` — 118KB, gameVersion 6.6.0, 50 CompositeDefs, **12 SignalDefs**, 71条数据连线

### P0 — 全新架构模式 ✅ 已完成

| 主题 | 特征 | 完成情况 |
|:----|:-----|:---------|
| **物理引擎数据流水线** | 纯数据复合链：aerodynamic_forces → friction_force → 计算合力 → 更新v、w | ✅ §11 完成 |
| **54 节点超大型复合** | 物理运动控制器: **54 impl 节点**, 10 InFlow, 9 嵌套调用 | ✅ §4.1 更新 |
| **SignalDef ×12（大规模信号网络）** | 12 个 SignalDef vs log系统 的 2 个 | ✅ §12 + §9 完成 |
| **向量/力学纯数据复合族** | mul3, add3, 向量乘法, 向量内积乘法, 向量×, 向量缩放除法, 三维向量逆旋转, 世界向量转本地向量 | ✅ §13 完成 |
| **I=1/O=0 下沉式复合** | 设置物理参数 (30节点), 更新w, v信号版本, 设置额外碰撞重力 | ✅ §14 完成 |

### P1 — 已知模式需扩展 ✅ 已完成

| 主题 | 理由 | 工作量 |
|:----|:----|:------|
| **编排器模式扩展** | 当前 §4.1 基于 40 节点；物理运动控制器 54 节点需补充 | ✅ 小 |
| **多 InFlow 超大规模** | 当前 §14 基于有限循环/异步迭代（2-5 InFlow）；物理运动控制器 10 InFlow | ✅ 中 |
| **复合组合体（嵌套纯数据）** | 向量运算复合相互嵌套（向量乘法 → 向量内积乘法）——纯数据复合之间的嵌套 vs 之前的执行嵌套 | ✅ 中 |
| **数据流拓扑分析** | 71 条数据连线的完整拓扑 vs log系统 23 条 | ✅ 中 |

### P2 — 跨文件对比

| 对比 | log系统.gia | 物理运动.gia | 意义 |
|:----|:-----------|:------------|:----|
| CompositeDef 数量 | 48 | 50 | 接近 |
| SignalDef 数量 | **2** | **12** | 6× 差异——信号作为架构层级的信号 |
| structureDef | 1 | 0 | 物理运动不需要自定义 struct |
| 数据连线 | 23 | **71** | 3× 复杂度——物理引擎的计算流水线 |
| 最大 impl 图 | 40（删除日志数据） | **54（物理运动控制器）** | 新纪录 |
| gameVersion | 6.5.0 | 6.6.0 | 版本差异可能引入新特性 |
| 主图模式 | 信号+数据驱动 | 事件+信号+纯数据计算 | 完全不同的架构风格 |

## 3. 文档更新计划

> 第 1 轮（物理运动.gia）：已完成 §§11-14。第 2 轮（弹球.gia + 传球.gia）：已全部完成。

### 3.1 06-advanced-patterns.md (第 1 轮)

- [x] 新增 §11: **物理引擎架构——纯数据计算流水线**
  - 数据流水线拓扑分析（71 条连线的主干链）
  - aerodynamics → friction → resultant force → velocity update
- [x] 新增 §12: **大规模信号网络**
  - 12 SignalDef 的拓扑与组织模式
  - 与数据连线的协同关系
- [x] 更新 §4: 最大 impl 图（增加 54 节点记录）
- [x] 更新 §4: 编排器模式扩展（10 InFlow 场景）
- [x] 新增 §13: **向量运算复合族——纯数据复合组合体**
- [x] 新增 §14: **I=1/O=0 下沉式复合**

### 3.2 04-validation-signal.md

- [x] 新增 §9: **大规模信号网络实践**（基于物理运动.gia 的 12 SignalDef）
- [x] 分析：信号 vs 数据连线——什么时候用信号，什么时候用数据连线

### 3.3 03-validation-basics.md

- [x] 新增 §2.5: 物理运动.gia 覆盖情况（与 §2.4 log系统 并列）
- [x] 新增规律 23-27：基于物理运动.gia 的新发现

### 3.4 第 2 轮：弹球.gia + 传球.gia 文档化（已完成）

> 2026-06-30 完成。基于复杂gia/三个文件的跨文件对比。

#### 06-advanced-patterns.md 新增

- [x] 新增 §15: **信号驱动架构**——弹球.gia 无 event、7 ClientExec、0 入边入口
- [x] 新增 §16: **共享复合库**——11 个 CompositeDef + 2 SignalDef 跨文件一致
- [x] 新增 §17: **三种架构风格分类**——事件驱动(A)/信号驱动(B)/计算流水线(C)
- [x] 更新 §4 最大 impl 图：增加弹球.gia 记录（发生碰撞带球 25、处理传球 16）

#### 03-validation-basics.md 新增

- [x] 新增 §2.6: 传球.gia + 弹球.gia 覆盖情况
- [x] 新增规律 28: 信号驱动架构——无 event 的纯信号触发图
- [x] 新增规律 29: 共享复合库——跨文件接口一致的内建复合
- [x] 新增规律 30: GIA 文件可按三种架构风格分类
- [x] 新增规律 31: 弹球.gia 零入边入口——纯反应式图特征

#### index.md 更新

- [x] 文档描述：增加 第 2 轮 + 三种架构风格 + 共享复合库
- [x] 交叉引用：增加与 `docs/architecture/` 的关系说明表

### 3.5 交叉引用 `docs/architecture/`（新任务，已完成）

> 2026-06-30 完成。作者 jack.li 在 `docs/architecture/composite/` 中新增了 7 个文档（capture-mechanism, dsl-api, ir-representation, gia-encoding, json-walkthrough, pipeline-flow, testing），从编译器源码正向描述了复合节点全链路。

- [x] `01-ir-types.md`：引用作者确认的 pinIndex 常量（1974/4/8+idx/100+idx/200+idx）
- [x] `05-gia-encoding.md`：引用作者确认的 graphId 推导规则（def.id + 10000）
- [x] `06-advanced-patterns.md` §16.3：用 ID 空间 1610700000+ 确认共享复合非 gsts 生成
- [x] `index.md`：新增"与 docs/architecture 的关系"对照表
- [x] 覆盖表：增加 弹球.gia + 传球.gia
- [x] 核心认知：增加 架构风格 + 共享复合库

## 4. 工具改进

- [x] `tools/topology.ts` — 无 event 节点时输出根节点遍历 + 数据连线拓扑（已实现，弹球.gia 72 条连线）[2026-06-30]
- [x] `tools/coverage.ts` — 修复 which=12 主图漏检 Bug（只搜 accessories，漏了 data.graph 自身）[2026-06-30]
- [x] `tools/coverage.ts` — 增加"终端下沉型"（I=1/O=0）基本模式分类 [2026-06-30]
- [ ] `tools/topology.ts` — 数据连线超过 50 条时增加分组/聚合显示（2026-06-30 → 待完成）
- [ ] `tools/coverage.ts` — 增加跨文件对比模式（同时分析多个 .gia 比较模式分布）（2026-06-30 → 待完成）
- [ ] 考虑创建 `tools/signal-topology.ts` — SignalDef 关联网络可视化（2026-06-30 → 延迟评估）

## 6. 核验发现

> 2026-06-30 — 第 1 轮：基于物理运动.gia 的交叉审查。第 2 轮：基于 传球.gia + 弹球.gia 的跨文件审查。

### ❌ 已修正的错误

| # | 位置 | 原论断 | 修正 | 依据 |
|:-|:----|:------|:----|:-----|
| 1 | 01-ir-types.md §1.3 | InFlow compositePins = "1 条" | 改为 "1~N 条（可扇出）" | 物理运动：设置物理参数 1 InFlow → 10 条 compositePins |
| 2 | 03-validation-basics.md 规律 16 | "有限循环包含了迄今最完整的 compositePins（7 条映射）" | 增加上下文说明：仅限 user_edit | 物理运动：物理运动控制器 35 条 |
| 3 | 04-validation-signal.md §7.2 | CompositeDef relatedIds "❌ 通常为空" | 改为 "指向 impl 图附件或关联信号" | 物理运动：所有 50 个 CompositeDef 均有 relatedIds |
| **4** | **01-ir-types.md §1.1** | **缺少 I=1/O=0（终端下沉）基本复合类型** | **新增一行到基本类型表，定义"终端下沉型"模式** | **user_edit 9 个复合实例（two_exec/两个复合节点/基本调用节点/复杂_exec 等）** |

### ✅ 已修复合工具错误

| # | 工具 | 错误 | 修正 |
|:-|:----|:----|:----|
| 1 | coverage.ts | 只搜 `accessories` 找 which=12，漏了 `data.graph` 自身为 which=12 | 改为搜 `allUnits = [r.graph, ...accessories]` |
| 2 | coverage.ts | 缺少 I=1/O=0 终端下沉模式 → 被标记为"未覆盖" | 新增 "终端下沉型" pattern |

### ⚠️ 已标记的推测内容

| # | 位置 | 原内容 | 处理 |
|:-|:----|:------|:----|
| 1 | 06-advanced-patterns.md §11.2 | "这是计算密集型架构的标志" | 删除（主观定性） |
| 2 | 06-advanced-patterns.md §11.3 | "有限状态机或多阶段流水线控制器" | 标注为推测 |
| 3 | 06-advanced-patterns.md §12.3 | "角色状态信号"/"物理仿真同步信号" | 删除主观命名 |

### 📌 需后续验证的疑点

| # | 疑点 | 涉及文档 | 需要什么数据 | 状态 |
|:-|:----|:--------|:-----------|:----|
| 1 | 监听信号分类为"复合模式"的合理性（graphId=0 的内置节点） | §9 | 其他文件中的监听信号是否也是 graphId=0 | ✅ **已关闭** — 传球(1)+弹球(4)=5个监听信号全部 graphId=0 |
| 2 | 信号复合 InParam "每参数 2 条" **→ refined** | 04 §5 | 需要一个有 impl graph 的**发送信号**复合（which=14 SignalDef）来验证 | ❓ 待验证 — 此文件的监听信号无 impl graph（graphId=0 内置），需找用户自定义的信号发送复合 |
| 3 | CompositeDef relatedIds 是否总是指向 impl graph | 04 §7.2 | 更多文件的 cross-check | ✅ **已确认** — 传球(13+2)+弹球(29+8)=47个，全部指向 impl graph 或 SignalDef，无其他目标 |

### 📌 新发现的疑点（传球.gia + 弹球.gia 第 2 轮）

| # | 疑点 | 涉及 | 需要什么数据 |
|:-|:----|:----|:-----------|
| 4 | **信号驱动架构**：弹球.gia 无 event 节点，7 个 ClientExec 节点 → 全部执行由信号触发。这是否是"复合模式图"的通用特征（graph.which=9 专属）？ | 06-advanced-patterns | 更多 graph.which=9 的文件确认 event 缺失规律 |
| 5 | **共享复合库**：11 个 CompositeDef + 2 个 SignalDef 跨文件完全一致 → 这些是"游戏内建库"还是"用户重用"？跨文件共享的复合是否一定是接口完全一致的？ | 01-ir-types | 需要更多游戏（文件夹）的跨文件对比 |
| 6 | **弹球.gia 0 入边执行入口**：无 event + 0 个无入边的可执行节点 → 推导出所有执行流最终由 ClientExec 信号触发启动。纯信号触发图是否有特殊的数据耦合模式？ | 03-validation-basics | 需要另一个信号驱动 GIA 做对比 |
| 7 | **物理运动.gia vs 弹球.gia 的物理计算对比**：两者都涉及物理运动但架构完全不同（物理运动=纯数据流水线，弹球=信号驱动编排器）。同一领域的不同架构风格是否有规律？ | 06-advanced-patterns §§11-14 | 需要更多物理相关的 GIA |

### 📌 新发现的疑点（user_edit 40 文件第 3 轮，2026-06-30）

| # | 疑点 | 涉及 | 需要什么数据 |
|:-|:----|:----|:-----------|
| 8 | **user_edit 中监听信号/发送信号的 ID 每个文件不同**：已用 `多信号2.gia` 与 `多信号3.gia` 交叉确认：同一 B 信号在两文件保持 `1610612751/2752/2753`；不同信号组占用连续三元组，组间可能被其他 GraphUnit 占用。仍待确认 gsts 如何取得外部注册 identity。 | 01-ir-types / 04-validation-signal / 05-gia-encoding | 对比 gsts 输出与编辑器输出的 ID 分配策略；需要地图/信号注册表输入 | 部分关闭：真实 GIA 规律已确认；gsts 接入方式待实现 |
| 9 | **类型转化.gia 和 类型转化_gen.gia 是唯二空复合文件**：没有 CompositeDef，只有原始节点图。这是测试边界用例，还是 gsts 编译器在无复合定义时的退化输出？ | 01-ir-types / gsts-compiler-gap | 确认 gsts 何时产出空复合 GIA |
| 10 | **I=1/O=0 终端下沉型是纯 gsts 产物还是通用模式？**：user_edit 中 9 个实例全是小文件（1-3 节点），物理运动.gia 的"设置物理参数"（30 节点，I=1/O=0）规模差异极大。终端下沉型是否应再细分"基础终端"和"大型下沉"？ | 06-advanced-patterns §14 | 更多 medium 规模（10-30 节点）的 I=1/O=0 复合 |

### 长期 TODO

- [x] 覆盖 user_edit 全部 40 个 GIA 文件的系统分析（2026-06-30）
  → 71 个 CompositeDef 全部 100% 覆盖。发现终端下沉模式缺口并修正。
- [ ] 覆盖实用/ + 复杂gia/ 目录（DEFERRED: 2026-06-30，100% 模式覆盖率已达，剩余文件补充已非必要）
- [ ] 建立"已知架构模式库"——不仅是复合模式，还有完整 GIA 的架构风格分类（DEFERRED: 2026-06-30，三种架构风格已分类于 §17，扩展至整个库需要更系统的跨目录分析）
- [ ] 验证 gsts 编译器的输出是否与游戏编辑器的输出在结构上一致（DEFERRED: 2026-06-30，gsts-compiler-gap.md 已有完整差异清单，P0-P2 逐步修复中）

### 🎨 布局优化（r11 完成，2026-07-03）

> 游戏内节点排列优化

**✓ 已完成（r11）**：
- [x] **主图间距 columnWidth 350→800** — 匹配游戏参考（demo_B_exec_call 实测 ~800）
- [x] **Y 对齐精度 ≤5px** — exec 链上各节点 Y 差异不超过 5 像素
- [x] **数据节点位置优化** — 偏移 cx−400 / cy+150，居中在 producer-consumer 间隙

**P1（待优化）**：
- [ ] **复合内部 impl 图 Y 负坐标** — `LAYOUT_DATA_Y_OFFSET = -250` 导致数据节点在 Y<0 区域

### 🔧 编译器合规（新增，2026-06-30；最后审核 2026-07-02）

> gsts 首次编译出 basic_call.gia 后 vs 编辑器 基本调用节点.gia 的对比。完整差异清单见 [gsts-compiler-gap.md](gsts-compiler-gap.md)。

**P0**（影响 inject 运行）：
- [ ] 修复 `gameVersion` 硬编码（gsts=6.3.0，编辑器=6.6.0）← gap.md §1.1
- [ ] 修复 `graphId` 分配规则（gsts 用 id+10000，编辑器独立分配）← gap.md §2.1
- [ ] 修复 event `nodeIndex`（gsts=2，编辑器=1）
- [ ] 修复 nodeIndex 编序为其非连续、非 1-based（匹配编辑器）

**P1**（影响结构一致性）：
- [ ] 终端复合不输出 OutFlow pin 和 compositePins 条目 ← 当前已支持（`buildImplNodePins` 处理）
- [ ] Impl nodeIndex 起始偏移（编辑器从 2 开始）
- [ ] 布局坐标对齐 ← impl 图布局已完成（BFS+Kahn）

**P2**（待验证）：
- [~] SignalDef 编码支持：当前 gsts 已有实验性 `build_signal_definition.ts` 输出，但真实编辑器要求外部注册的 SignalDef identity；自造 ID / 固定复用 ID 尚未完成游戏验证，不能视为完成
- [ ] structureDef 编码支持（which=29 编码器尚不输出）
- [ ] 多 OutFlow pinIndex 对齐
- [~] ClientExec 信号触发支持：节点字符串与 cpi 的自动结构检查存在，但新 signal 的编辑器/游戏接受仍待外部 SignalDef identity 和用户验证

### 📝 文档：控制流 API 实战速查（2026-07-05 新增）

> 新增文档 [`docs/architecture/composite/control-flow-api-cookbook.md`](../../architecture/composite/control-flow-api-cookbook.md)

**背景**: 用户 2026-07-05 在分析 `复杂gia/物理运动.gia` 时发现现有的"多 OutFlow 复合"文档**没有覆盖 DSL 层的实际 API 用法**, 且**之前的"并行 fork"理解是错的**。

**核心内容**:
- 关键概念纠正: 顺序执行 ≠ 并行, 而是**严格串行** (按 impl 内 connects 数组顺序)
- 4 种控制流复合的触发行为对照 (顺序执行 / Multiple Branches / Double Branch / Multi-InFlow)
- 6 个 f.* API 的完整实战写法（历史列表：f.fork, f.connectOutFlow, f.doubleBranch, f.multipleBranches, f.registerExecNode, f.branchExec, f.leaf；当前新代码优先看 `f.node()` / `f.link()` / `f.inflow()` / `f.outflow()`）
- 物理运动.gia 真实样本的 GIA 形态 ↔ 感觉正确的 API 写法对照
- **"感觉正确"标注**: 8 项未验证的 API 行为 + 已知可能存在的 gap
- 与现有 `dsl-api.md` / `multi-outflow-composite-guide.md` 的引用关系

**标注 "感觉正确" 的部分** (需手动在游戏中验证):
- f.multipleBranches 的 default 分支行为
- 顺序执行 复合的"等待"语义 (等下游完全终止 vs 等下游触发到 terminal)
- 顺序执行 复合的 OutFlow 闲置时的引擎行为
- Multi-InFlow 复合 (10 InFlow) 在 gsts 中的支持情况
- f.connectOutFlow 的 outflowIdx 越界处理
- f.fork 嵌套
- f.branchExec 后的 tail 状态
- 多 OutFlow 复合在 gsts 编译器内部的实现完整性 (multi-outflow-composite-guide.md:7 提到"当前仅支持 0/1 个 OutFlow")

### 🔧 gsts 新增 API (2026-07-05 fan-in 支持)

**修改文件**:
- `src/runtime/core.ts`: 新增 `linkOutflowToMarker`, `getEventMarkerId`, `runDetachedCompositeCall` 3 个内部方法 (~120 行)
- `src/definitions/nodes.ts`: 新增 `f.declareDetached`, `f.linkTo`, `f.eventMarker` 3 个用户面 API (~30 行)

**新增 API 能力**:
- **fan-in 共享节点** (1 节点被多源触发): `f.declareDetached()` + `f.linkTo()` 组合
- **detached 复合调用** (不自动串联): `f.declareDetached(handle, inputs)`
- **从 event 显式连边**: `f.linkTo(f.eventMarker(), 0, target)`

**复刻成功案例**: `tests/composite/recreate-debug4-v2.ts` 用新 API 复刻 `user_edit/分支/debug4.gia`:
- 节点数 6/6 ✅ 完全匹配
- exec 边 8/8 ✅ 完全匹配 (含 fan-in n=5/n=6)
- data 边 1/1 ✅

**Regression 测试**: 3 个新方法没引入新 regression. 3 个 pre-existing fail (phase1 P2-S2, mixed_composite, exec-with-data) 跟我改动无关, 是 gsts 既有 bug.
