# 基础验证：01.gia 单文件校验 + 跨文件对比

> 状态：已验证
> 来源：真实 GIA 验证（user_edit 分支/嵌套样本 + 后续复杂样本对照）
> 最近校验：2026-07-06
> 适用范围：真实 GIA 逆向结论；与 gsts 当前实现对照仅在明确标注的段落适用。

覆盖：分支目录 7 个文件 + 嵌套目录 1 个文件。

## 1. `01.gia` 单文件校验

解码 `user_edit/分支/01.gia`（691 字节），验证 IR JSON 表示的正确性。

### 文件基本特征

| 属性 | 值 |
|------|-----|
| gameVersion | `6.6.0` |
| graph.which | `9`（EntityNode — 使用格式） |
| 主图名称 | `最简单的条件分支` |
| accessories | 2（CompositeDef + Impl Graph） |

### CompositeDef（accessory[0], which=12）

```
id: {genericId: {class:10001, type:20000, kind:22001(SysGraph), id:1610612755},
     concreteId: 同上,
     graphId: {kind:21002(CompositeGraph), id:1610612739}}
name: "双分支-user"
type.kind: 1000(Composite)
```

| Pin 类型 | 数量 | 详情 |
|---------|:---:|------|
| InFlow | 1 | pinIndex=47 |
| OutFlow | 2 | "是" pi=66, "否" pi=67 |
| InParam | 1 | "条件" pi=51, type=(EnumBase, Bool) |
| OutParam | 0 | — |

### Impl Graph（accessory[1], which=9）

```
id: {class:5(Basic), type:0, id:1610612739}  ← 与 CompositeDef.graphId 相同
```

内部节点（1 个）：
```
node[2] kind=22000 nodeId=2 (Sequence/Branch)
  pins: []  ← 关键：无显式 pin
```

**compositePins（4 条映射）**：

| # | outerPin | → | innerNodeId | innerPin | 含义 |
|:-|----------|---|-------------|---------|------|
| 1 | InFlow(1,0) | → | 2 | InFlow(1,0) | 执行入口 |
| 2 | OutFlow(2,0) | → | 2 | OutFlow(2,0) | "是"出口 |
| 3 | OutFlow(2,1) | → | 2 | OutFlow(2,1) | "否"出口 |
| 4 | InParam(3,0) | → | 2 | InParam(3,0) | 条件输入 |

每条映射均有 `innerPin2` 字段，值与 `innerPin` 一致。

### 主图

```
graph.graph.id: {kind:21001(RegularGraph), id:1073742305}
```

| node | kind | nodeId | 类型 | pins |
|:----:|------|--------|------|------|
| 1 | 22001(SysGraph) | 1610612755（→CompositeDef） | 复合调用 | InParam(3,0) cpi=51, bool(true) |
| 2 | 22000(SysCall) | 71 | event | OutFlow(2,0) →[1] |

**关键观察**：
- 复合调用节点无 OutFlow pin → **终端复合**
- event 节点只有 1 个 OutFlow(2,0) pin，无多余 OutParam ✓
- `compositePinIndex: 51` = CompositeDef.inputs[0].pinIndex ✓

### 验证结论

| 描述 | 真实文件 | 结论 |
|------|---------|:----:|
| CompositeDef kind=22001 | ✅ | 正确 |
| compositePins 对应关系 | ✅ 4 条映射 | 正确 |
| impl 节点无显式 pin | ✅ pins=[] | 正确 |
| event 仅 OutFlow | ✅ | 正确 |
| pinIndex 为固定值 | ❌ 实际为 47/66/67/51 | 编辑器分配，非默认值 |
| 终端复合无 OutFlow pin | ✅ 主图复合节点只有 InParam | 正确 |

### 关键经验

> **pinIndex 与 compositePinIndex 的匹配是 GIA 复合正确工作的核心约束**。系统默认值（1974/4/100-base）仅为方便，真正重要的是两端一致性。

---

## 2. 跨文件对比（8 个文件）

### 2.1 文件一览

| 文件 | 主图名 | CompositeDef | event? | 复合调用 | 终端 | 非终端 | 特征 |
|:----|--------|-------------|:------:|:--------:|:---:|:-----:|------|
| `01.gia` | 最简单的条件分支 | 双分支-user (2out/1in) | ✅→1 | 1 | 1 | 0 | 最简终端 |
| `分支.gia` | 条件分支 | 同上 | ✅→2 | 2 | 2 | 0 | event fork 到 2 个终端 |
| `分支2.gia` | 条件分支 | 同上 | ✅→2 | 2 | **0** | **2** | 完全非终端 |
| `分支3.gia` | 条件分支 | 同上 | ✅→**4** | **4** | **0** | **4** | event 4 叉 fork |
| `debug.gia` | 新建节点图 | 创建复合节点 | ❌ | 5 | 5 | 0 | 无 event 实验图 |
| `debug2.gia` | 新建节点图 | **2 个**复合 | ❌ | 6 | 6 | 0 | 含纯数据复合 |
| `debug3.gia` | 新建节点图 | **2 个**复合 | ❌ | 6 | 4 | **2** | OutFlow fork+汇聚 |
| `嵌套.gia` | 嵌套 | **3 个**复合(3层) | ❌ | 1 | 1 | 0 | 嵌套+串行内部连线 |
| `复杂_exec.gia` | two_exec | 2 个复合 | ✅ | **3** | 2 | **1** | **非终端复合 OutFlow fork 到多目标** |
| `复杂2_exec.gia` | mixed_composite_and_normal | 2 个复合 | ✅ | 2 | 1 | **1** | 终端排前、非终端排后的链式 |
| `顺序执行.gia` | 顺序执行 | **4 OutFlow** | ✅ | 1 | 0 | **1** | 4 OutFlow 复合，仅用 2 个出口 |
| `数据流输入参数合并比对.gia` | 数据流输入参数合并比对 | **2 个纯数据** | ❌ | 2 | 2 | 0 | **同输入 fanout 到 2 个 InParam** |
| `各种flow.gia` | flow | **6 个复合**（含多InFlow/循环） | ❌ | 6 | 6 | 0 | 最大复合定义集合 |
| `两个复合节点.gia` | 两个复合节点 | 2 个复合（含 **local_variable + vec3**） | ✅ | 2 | 2 | 0 | **local_variable 类型输入 + 2节点impl图** |
| `基础节点复合.gia` | flow | **4 个复合**（含有限循环/列表循环） | ❌ | 4 | 4 | 0 | **循环复合验证（finite_loop/list_iteration）** |
| `顺序执行2.gia` | 顺序执行 | 4 OutFlow | ✅ | 1 | 0 | **1** | **OutFlow fork + 汇聚到同一下游** |
| `two_simple.gia` | two_simple_1 | **3 个复合**（纯数据+exec混合） | ✅ | 3 | 3 | 0 | 纯数据复合之间数据连线 |
| `gsts/输出.gia` | composite_signal_normal | 信号复合 | ✅ | 1 | 0 | **1** | **gsts 生成**（id=1610700000, game=6.3.0） |
| `two_exec.gia` | two_exec | 2 个终端复合 | ✅ | 2 | 2 | 0 | event fork 到 2 个终端复合 |
| `two_exec2.gia` | two_exec | **同 ID 不同定义** | ✅ | 2 | 1 | **1** | **同一 ID (1073741864) 在 two_exec 中是终端，此处非终端** |
| `基本调用节点.gia` | basic_call | 1 个终端复合（系统 pi） | ✅ | 1 | 1 | 0 | pi=1974（系统默认） |
| `带参数打印复合节点.gia` | basic_call_param | 1 个参数化复合 | ✅ | 1 | 1 | 0 | **系统默认 pi（1974/4/100）+ InParam type=(StringBase,Str)** |

### 2.2 pinIndex 值汇总

> 本表仅覆盖 `user_edit/` 文件。`实用/log系统.gia` 使用不同的 pinIndex 值范围（如"异步迭代"中 pi=1024-1712），详见 `06-advanced-patterns.md`。

| CompositeDef | InFlow | OutFlow[0] | OutFlow[1] | InParam[0] | InParam[1] | OutParam[0] |
|-------------|:------:|:----------:|:----------:|:----------:|:----------:|:-----------:|
| 双分支-user | 47 | 66 | 67 | 51 | — | — |
| 创建复合节点 | 70 | 79 | 85 | 71 | — | — |
| 创建复合节点(1)（纯数据） | — | — | — | 86 | — | — |
| 嵌套 | 1806 | 1809/1810/1812/1813/1814 | — | 1807/1808 | 1811 | 1815 |
| 顺序执行3 | 76 | 77/78/1433 | — | 1803/1804 | — | 1805 |
| 加法(2)（纯数据） | — | — | — | 1795/1800 | — | 1802 |
| **第一个执行(1)**（系统默认） | **1974** | **4** | — | — | — | — |
| **顺序执行**（4 OutFlow, 系统默认） | **6** | **8/9/10/11** | — | — | — | — |
| **有限循环**（循环复合） | 55/60 | 58/59 | — | 56/57 | — | 61 |
| **列表循环迭代** | 68/69 | 73/74 | — | 72（entity_list） | — | 75 |
| **设置局部变量** | 13 | — | — | 12（local_var）/14（vec3） | — | — |
| **向量加法**（vec3, 2 impl节点） | — | — | — | 16/17 | — | 15/18 |

所有 cpi 匹配 ✓

> ✅ **终于找到了使用系统默认 pinIndex 的真实文件！** `复杂_exec.gia` 的 "第一个执行(1)" 使用 InFlow=1974, OutFlow=4；`顺序执行.gia` 使用 InFlow=6, OutFlow=8/9/10/11。这两个文件是**由游戏编辑器用默认值创建**而非 gsts 生成的。

### 2.3 关键发现

#### 1. 终端/非终端是调用位置的属性，非 CompositeDef 属性

"双分支-user" 在 01.gia 中是终端、在 分支2.gia 中是非终端。

**机制**：
- 终端：主图调用节点的 OutFlow pin 无 connects（或无 OutFlow pin）
- 非终端：OutFlow pin 有 connects → 下游节点

#### 2. Impl 节点 pin 规则：有内部连线才需要物理 pin

简单复合中 impl 节点 `pins: []`。嵌套复合中有内部连线时：
```
node[5] OutFlow(2) cpi=1433 →[6]   ← 内部 exec 连线
node[6] InParam(0) cpi=1803 →[5]   ← 内部数据连线
```
这两个节点的 `pins=1`。

**规则**：
- 仅在 compositePins 中映射 → ❌ 不需要物理 pin
- 有内部连线 → ✅ 需要物理 pin
- 同时有 compositePins 映射 + 内部连线 → ✅ 需要物理 pin

#### 3. compositePinIndex 是关键字段

每个主图复合调用节点的 pin 上有 `compositePinIndex`，与 CompositeDef 的 `pinIndex` 匹配。

#### 4. Event OutFlow fork

Event 的 OutFlow pin 可以有多个 connect。分支3.gia 中 event fork 到 4 个目标。

#### 5. 复合调用节点完全空 pin 合法

debug 系列文件有 `pins: []` 的复合调用——输入用默认值，输出不连下游。

#### 6. 纯数据复合在 GIA 中

`inflows: []`, `outflows: []`。调用时也是 `kind=22001`，但只有数据 pins。

#### 7. 嵌套复合：impl 图中有 kind=22001 节点

"嵌套" 的 impl 图有 2 个 `kind=22001 nodeId=1610612752` 节点（调用 "顺序执行3"）。

特征：kind=22001 (SysGraph)，nodeId 指向 CompositeDef.id，可以有物理 pin（有内部连线时）。

#### 8. compositePins 穿透路由

外层 InFlow/OutFlow/InParam/OutParam 可以直接路由到嵌套复合调用节点 pin 上：
```
外层(嵌套) InFlow → node[5](顺序执行3) InFlow
外层(嵌套) OutParam → node[6](顺序执行3) OutParam
```

#### 9. 串行组合：内部连线连接两个嵌套实例

```
外部 InFlow → node[5] InFlow → 执行 → OutFlow[2] 触发
  → node[6] InFlow（内部连线）→ 执行 → OutFlow 暴露到外部
```

#### 10. 纯数据复合作为嵌套调用

"顺序执行3" 的 node[8] 是 `kind=22001 nodeId=1610612998`（调用纯数据 "加法(2)"），无 InFlow/OutFlow pin。

#### 11. 无 event 的文件是合法的"未激活"图

debug 系列无 event（kind=22000 nodeId=71）——游戏编辑器可保存未完成图。

#### 12. 非终端复合的 OutFlow 可以 fork 到多个目标

`复杂_exec.gia` 中 "第一个执行(1)" 是 non-terminal composite，其 OutFlow(0) cpi=4 **同时连到 2 个下游节点**：

```
comp(1) OutFlow(0) cpi=4 → [3, 6]
  ↓                     ↓
 node[3] (comp2)  +  node[6] (printString)
```

同一 composite 的 OutFlow 分叉到多个下游——这是复合调用节点的 **fork 语义**。

#### 13. graph.which=12：纯复合定义文件格式

`纯复合节点-顺序执行.gia` 用 `graph.which=12` (CompositeGraph) 格式，表示这是一个**独立的复合定义文件**而非使用文件：

```
graph.which = 12（vs 常规的 9）
graph.compositeDef → CompositeDef（直接挂在 graph 下，不在 accessories 中）
accessories[0] → impl graph（which=9）
```

注意此时 `graph.compositeDef.inner.def` 的 id.genericId/concreteId 和 graphId 相同（都是 1610612738），表示这是一个自包含的定义。

#### 14. 复合可以有多个 InFlow 入口

`各种flow.gia` 中有三个 **multi-InFlow** 复合定义：

| CompositeDef | InFlow pins | OutFlow pins | Input pins | 说明 |
|-------------|:-----------:|:------------:|:----------:|------|
| "独立执行" | **2** (pi=37,38) | 2 (pi=39,40) | 0 | 双入口复合 |
| "有限循环" | **2** (pi=55,60) | 2 (pi=58,59) | 2 (pi=56,57) | 循环复合（起点+继续） |

这说明复合可以定义多个执行入口或多模式入口。`ControlFlowDef[]` 数组长度 > 1 在此场景下有效。

#### 15. 同一输入多次消费的内外映射

`数据流输入参数合并比对.gia` 的 "加法-双倍" 复合印证了 **InParam fanout** 模式：只有 1 个外部输入参数（`pi=30`），但在 compositePins 中映射了**两次**到同一个内部 addition 节点的 InParam(0) 和 InParam(1)：

```json
{ "outerPinKind": 3, "outerPinIndex": 0, "innerNodeId": 2, "innerPinKind": 3, "innerPinIndex": 0 },
{ "outerPinKind": 3, "outerPinIndex": 0, "innerNodeId": 2, "innerPinKind": 3, "innerPinIndex": 1 }
```

这和信号 composites 中的重复条目不同——这里的 `innerPinIndex` 不同（0 和 1），表示同一外部输入被传递到 addition 的两个输入端，实现 `double(input)`。

#### 16. 有限循环复合（finite_loop）的 compositePins

`基础节点复合.gia` 的 "有限循环" 复合展示了 multi-InFlow 复合的标准 compositePins 结构（**7 条映射**）：

> ⚠️ 在 user_edit 的 40 个文件中，7 条映射是最多的。但更大的文件（如物理运动.gia）中有 35 条映射的复合（物理运动控制器）。"7 条最完整"的定义仅限于 user_edit 文件集。

```
外 InFlow(1,0) → node[14](finite_loop) InFlow(1,0)    ← 循环入口
外 InFlow(1,1) → node[14]         InFlow(1,1)          ← 循环继续
外 OutFlow(2,0) → node[14]        OutFlow(2,0)         ← 循环体（每迭代）
外 OutFlow(2,1) → node[14]        OutFlow(2,1)         ← 循环完成之后
外 InParam(3,0) → node[14]        InParam(3,0)         ← 循环起始值
外 InParam(3,1) → node[14]        InParam(3,1)         ← 循环终止值
外 OutParam(4,0) → node[14]       OutParam(4,0)        ← 当前循环值
```

复合的 inflows 有两个 pin 是常见模式——有限循环和列表循环均如此。

#### 17. local_variable 类型在复合输入中可用

`两个复合节点.gia` 的 "设置局部变量" 复合有 `InParam(0) type=(0,16)`——即 **local_variable** 类型。这推翻了之前"local_variable 类型不支持作为复合 InParam"的认知。

```
"设置局部变量" 复合
  impl 节点: node[3] kind=22000 nodeId=19 (set_local_variable)
  compositePins:
    InFlow(0) → node[3] InFlow(0)
    InParam(0) → node[3] InParam(0)  ← local_variable
    InParam(1) → node[3] InParam(1)  ← vec3
```

主图中 node[7] 的 InParam(0) cpi=12 连接到 node[5]（get_local_variable, nodeId=18）的输出——local_variable 通过数据连线传入复合。

#### 18. Vec3 复合多输出 + 多内部节点

"向量加法" 复合（impl 有 2 个内部节点）：
```
node[1] kind=22000 nodeId=10  (_3d_vector_addition) → OutParam[0] = 向量
node[2] kind=22000 nodeId=220 (vec3_length)         → OutParam[1] = 模
compositePins:
  InParam(0) → node[1] InParam(0)
  InParam(1) → node[1] InParam(1)
  OutParam(0) → node[1] OutParam(0)  ← 向量结果
  OutParam(1) → node[2] OutParam(0)  ← 模结果
```

**注意**：node[1] 和 node[2] 之间通过内部数据连线连接（不在 compositePins 中显式出现）。

#### 19. OutFlow fork + 汇聚到同一下游

`顺序执行2.gia` 展示了一个重要的 exec 流模式：

```
composite OutFlow(0) cpi=8 → [6, 8]   ← fork 到 2 个下游
composite OutFlow(1) cpi=9 → [8]       ← 与 OutFlow(0) 汇聚到 node[8]
```

node[8] 被**两个 OutFlow pin 同时连接**——这是一个**汇聚点**。同一节点可以被多个执行路径流入。

#### 20. 同一 CompositeDef ID 在不同文件中可以有不同定义

`two_exec.gia` 和 `two_exec2.gia` 共享同一组 CompositeDef ID（1073741864, 1073741865），但定义不同：

| 属性 | two_exec.gia | two_exec2.gia |
|------|:-----------:|:-------------:|
| "第一个执行" OutFlow | **0**（终端） | **1** pi=3（非终端） |
| 事件 fork | → [3, 4] 直接 | → [1] → [4] 链式 |
| 调用 | 2 终端 | 1 非终端 + 1 终端 |

这证实了：**同一 ID 在不同的 GIA 文件中可以对应不同的 CompositeDef，互不影响。** GIA 文件是自包含的。

#### 21. graph.which=12 用于信号定义文件

5 个信号定义文件（`1234567890123456.gia`, `1信号.gia`, `ts_g_define_使用测试信号.gia`, `使用信号.gia`, `纯复合节点-顺序执行.gia`）均使用 `graph.which=12`（CompositeGraph）格式。此时：

- `graph.compositeDef.inner.def` 中包含 CompositeDef
- impl graph 在 `accessories[0]` 中（which=9）
- 对于信号定义（`graphId=0`），accessories 为空

信号定义文件的 "监听信号" 的 outputs 数量由信号参数个数决定：

| 文件 | outputs | 参数数 |
|:----|:-------:|:------:|
| 使用信号.gia | 4 | 1 |
| 1234567890123456.gia | 4 | 1 |
| 1信号.gia | 4 | 1 |
| ts_g_define_使用测试信号.gia | **6** | **3** |

#### 22. 全部 40 个文件的完整覆盖率

| 类型 | 文件数 | 覆盖内容 |
|:----|:-----:|:---------|
| 分支系列 | 7 | 终端/非终端/纯数据/event fork |
| 嵌套复合 | 1 | 3 层嵌套/内部连线/串行组合 |
| 信号系列 | 6 | 内置信号/ClientExec/重复条目 |
| 顺序执行系列 | 5 | 4 OutFlow/fork+汇聚/系统默认 pi |
| 流程控制 | 4 | 复杂_exec/multi-InFlow/循环复合 |
| gsts 生成 | 2 | 分支2.gia + gsts/输出.gia |
| 基本调用 | 2 | 简单终端/参数化复合 |
| 纯定义 | 5 | which=12 格式/信号定义文件 |
| 无复合 | 2 | 类型转化（纯节点图） |
| **总计** | **40** | 全部 user_edit 文件已分析 |

> **注意**：以上 22 条规律和覆盖率统计基于 `user_edit/` 的 40 个文件。`实用/` 目录的 `log系统.gia`（90KB, 48 CompositeDefs）包含 SignalDef（which=14）和 structureDef（which=29）等新 accessory 类型，不在 user_edit 文件中出现。详见 `06-advanced-patterns.md` 的补充分析。

### 2.4 log系统.gia 覆盖情况

`实用/log系统.gia`（90KB, 48 CompositeDefs）的分析独立于 user_edit 的 40 个文件，其覆盖情况如下：

| 状态 | CompositeDef 数 | 占比 |
|:----|:--------------:|:----:|
| ✅ 已深入分析（已记录到 06-advanced-patterns.md） | 18 | 37% |
| ⏳ 需补充分析（模式已知但细节待定） | 8 | 17% |
| 👀 暂不需要（已有文档覆盖的已知模式变体） | 17 | 35% |
| ❌ 跳过（内置信号/graphId=0） | 5 | 10% |

**关键差异**（与 user_edit 的 22 条规律对比）：
1. **新 accessory 类型**：logSystem.gia 发现了 `which=14`（SignalDef）和 `which=29`（structureDef），在 user_edit 文件中不存在
2. **不同 pinIndex 范围**：logSystem.gia 的 pinIndex 值范围更广（如"异步迭代"使用 1024-1712），远大于 user_edit 的 47-1815
3. **数据驱动架构**：主图采用数据驱动而非执行流驱动（14 个复合调用之间通过 23 条数据连线互联）

> 以上分析的详细内容见 `06-advanced-patterns.md`，待补充的 P0/P1 项目见 `todo.md`。

### 2.5 物理运动.gia 覆盖情况

`复杂gia/物理运动.gia`（118KB, 50 CompositeDefs, gameVersion 6.6.0）的分析独立于 user_edit 和 log系统.gia，其覆盖情况如下：

| 状态 | CompositeDef 数 | 占比 |
|:----|:--------------:|:----:|
| ✅ 已深入分析（已记录到 06-advanced-patterns.md §11-14） | 33 | 66% |
| ⏳ 需补充分析（模式已知但细节待定） | 5 | 10% |
| 👀 暂不需要（已有文档覆盖的已知模式变体） | 12 | 24% |
| ❌ 跳过（内置信号/graphId=0） | 0 | 0% |

**关键差异**（与 user_edit 的 22 条规律对比）：
1. **纯数据主导**：物理运动.gia 的 29 个纯数据复合（58%）远超 user_edit 的比例——这是一个完整的物理引擎计算流水线
2. **12 个 SignalDef**：信号作为主要通信机制（log系统 仅 2 个），参数包含完整物理量（v, w, f, 位置, 旋转）
3. **71 条数据连线**：比 user_edit 典型数量高一个数量级，主图是密集计算网络
4. **54 节点超大型复合**：物理运动控制器有 10 InFlow，均创纪录
5. **无 structureDef**：物理运动不需要自定义 struct 类型（log系统 有 1 个）
6. **向量运算复合族**：7 个相互嵌套的纯数据复合，形成"复合组合体"模式

> 以上分析的详细内容见 `06-advanced-patterns.md` §11（物理引擎数据流水线）、§12（大规模信号网络）、§13（向量运算复合族）、§14（下沉式复合）。

### 2.6 传球.gia + 弹球.gia 覆盖情况

`复杂gia/传球.gia`（21KB, 14 CompositeDefs, gameVersion 6.6.0）和 `复杂gia/弹球.gia`（55KB, 33 CompositeDefs, gameVersion 6.6.0）是同一"球类运动"游戏的不同部分。两者的联合分析验证了跨文件一致性和三种架构风格分类：

| 状态 | 传球.gia | 弹球.gia |
|:----|:--------:|:--------:|
| ✅ 已深入分析（已记录到 06-advanced-patterns.md §15-17） | 14 (100%) | 33 (100%) |
| ⏳ 需补充分析（模式已知但细节待定） | 0 | 0 |
| 👀 暂不需要（内建库/已有文档覆盖） | 11 （内建共享） | 13 （内建共享） |
| ❌ 跳过（内置信号/graphId=0） | 1（监听信号） | 4（监听信号） |

**关键发现**（区别于已有 22 条规律）：
1. **信号驱动架构**（新规律 28）：弹球.gia 无 event 节点，7 个 ClientExec 信号触发——这是首个验证的纯信号驱动 GIA
2. **共享复合库**（新规律 29）：11 个 CompositeDef + 2 个 SignalDef 跨文件接口完全一致——证明游戏编辑器有内建复合基元库
3. **三种架构风格可分类**（新规律 30）：事件驱动（传球.gia）、信号驱动（弹球.gia）、计算流水线（物理运动.gia）
4. **弹球.gia 的 0 入边入口**（新规律 31）：所有执行流最终由 ClientExec 信号触发，无独立启动的入口

#### 规律 28：信号驱动架构——无 Event 的纯信号触发图

弹球.gia 是首个验证的**信号驱动** GIA 文件：

| 特征 | 值 |
|:----|:----|
| event 节点 | ❌ 无 |
| ClientExec 节点 | **7 个** |
| 主图 SysGraph | 36 个 |
| 主图 SysCall | 38 个 |
| 无入边执行节点 | **0 个** |
| 数据连线 | **72 条** |

**机制**：全部执行流由监听信号通过 ClientExec 触发，形成一个纯反应式执行网络。

与规律 11（无 event 的文件是合法的"未激活"图）的关系：规律 11 发现 user_edit 中无 event 的文件是小规模**未完成**图，而弹球.gia（33 CDs, 8 SignalDefs）的大规模无 event 架构是**设计目标而非未完成**——信号驱动架构是合法、完整、独立的第三种 GIA 执行模型。

详见 `06-advanced-patterns.md §15`。

#### 规律 29：共享复合库——跨文件接口一致的内建复合

同一 CompositeDef ID 在不同 GIA 文件中可以有**完全相同的结构**。11 个共享复合在传球.gia 和弹球.gia 中全部接口一致：

| ID 命名空间 | 内建复合示例 | 接口一致性 |
|:-----------|:------------|:----------:|
| `16106128xx` | 条件branch、获取三实体、职业branch | ✅ 100% |
| `10737418xx` | 顺序执行、定时器、查询实体 | ✅ 100% |
| `10737422xx` | 定时器设置、计时器时间 | ✅ 100% |

**判断规则**：同一 ID 跨文件接口一致 → 内建库；同一 ID 跨文件接口不同 → 用户自定义。

详见 `06-advanced-patterns.md §16`。

#### 规律 30：GIA 文件可按三种架构风格分类

基于主图结构（event 有无、ClientExec 数量、数据连线密度、纯数据复合比例），GIA 文件可归入三种风格：

| 风格 | event | ClientExec | 数据连线 | 示例 |
|:----|:----:|:---------:|:--------:|:----|
| **事件驱动** (A) | ✅ | < 2 | < 20 | 传球.gia、log系统.gia、user_edit |
| **信号驱动** (B) | ❌ | ≥ 5 | 20-80 | 弹球.gia |
| **计算流水线** (C) | ✅ | 不限 | 50-150 | 物理运动.gia |

这种分类首次将分析视角从"单个复合的模式"提升到"整个 GIA 文件的架构风格"。

详见 `06-advanced-patterns.md §17`。

#### 规律 31：弹球.gia 零入边入口——纯反应式图特征

弹球.gia 的主图有 36 个 SysGraph（复合调用）节点和 38 个 SysCall 节点，但 **0 个无入边的可执行节点**。这意味着：

- 所有有 InFlow 的节点都从某个 OutFlow 或 ClientExec 接收执行流
- 纯数据复合（无 InFlow）通过数据连线被动参与计算
- **信号是唯一的执行流源头**

这与"事件驱动为主"的 GIA（event 节点是唯一的 InFlow 源头）形成对比——信号驱动图中可以有**多个**执行流源头（多个监听信号），但没有任何节点是"自主启动"的。

详见 `06-advanced-patterns.md §15.3`。---

#### 23. 纯数据复合可构成多级嵌套组合体

> 来自 `复杂gia/物理运动.gia`。已通过真实文件验证（2026-06-30）。

纯数据复合（I=0/O=0）可以像函数组合一样嵌套调用，形成**复合组合体**：

```
add3（2个原生节点）              ← 基础数学运算
  └── 向量×（嵌套add3, 5个节点）        ← 叉乘/标量乘法
        └── 向量乘法（嵌套向量×, 3个节点）     ← 向量×标量+内积
              └── 向量内积乘法（嵌套向量乘法, 2个节点） ← 点积
```

这与编排器模式不同——编排器控制子复合的执行顺序，而组合体将多个数学运算连接为公式。

#### 24. 下沉式复合（Sink Composite）—— I=1/O=0 模式

> 来自 `复杂gia/物理运动.gia`。已通过真实文件验证（2026-06-30）。

复合定义层面可以有 **InFlow ≥ 1、OutFlow = 0** 的下沉模式：

```
设置物理参数:      I=1, O=0, impl=30, compositePins=21（InFlow扇出10条）
更新w,v信号版本:   I=1, O=0, impl=5, compositePins=1
设置额外碰撞重力:  I=1, O=0, impl=6, compositePins=3
```

**机制**：执行流流入复合内部执行（多个内部节点共享同一 InFlow），完成工作后不将执行流传出。

**与终端复合的区别**：终端复合的 CompositeDef 有 OutFlow，只是在调用侧未连接；下沉式复合的 CompositeDef 本身就没有 OutFlow。

#### 25. InFlow 扇出（Fan-out）——单入口多路径路由

> 来自 `复杂gia/物理运动.gia`。已通过真实文件验证（2026-06-30）。

同一外部 InFlow 可通过 compositePins **路由到多个内部节点**：

| 复合名 | InFlow 扇出数 | 路由目标 |
|:------|:------------:|:---------|
| 设置物理参数 | **10** 条映射 | node[1,6,11,13,14,15,19,20,26,28] |
| 物理运动控制器 | **10** 条映射 | node[3,6,10,15,19,21,26,34,39,61] |

对比 `基础节点复合.gia` 的有限循环 compositePins（7 条映射），InFlow 扇出翻倍。

#### 26. 71 条数据连线的密集主图是物理引擎的标志

> 来自 `复杂gia/物理运动.gia`。已通过真实文件验证（2026-06-30）。

物理运动.gia 的主图有 **71 条数据连线**，是 logSystem 的 3 倍、user_edit 典型文件的 10 倍以上。

**特征**：
- 数据连线不全是"控制信号"——包含 vec3 向量数据的传递（aerodynamic_forces:f → 计算合力:air）
- 复合调用节点的数据 pin 可以连到多个复合和数据源节点
- 信号源（监听信号）的 OutParam 直接驱动计算链入口

#### 27. 同一复合多次实例化为不同调用节点

> 来自 `复杂gia/物理运动.gia`。已通过真实文件验证（2026-06-30）。

物理运动控制器中，同一内部复合被多次实例化（不同的 nodeIndex）：

```
地面变为空中状态: node[12] + 另一个实例（同 compositeDef ID 1610612766）
向量内积乘法: node[9] + 另一个实例（同 compositeDef ID 1610612838）
mul3: 主图中也有多个调用节点（nodeId=1610612762）
```

这与 `log系统.gia` 中"顺序执行被调用了 4 次"的现象一致，但在物理运动.gia 中表现为**纯数据复合的多实例化**——而非仅限执行复合。这进一步验证了"复合定义可被同一 graph 中的多个节点实例化"的通用规律。`kind=22001 nodeId=<CompositeDef.id>` 区分不同的调用实例。
