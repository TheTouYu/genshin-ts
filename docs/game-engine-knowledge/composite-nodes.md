# 复合节点

> 状态：框架草案
> 来源：用户对复合节点和编辑器布局的说明
> 最近校验：2026-08-15
> 适用范围：用户自定义复合节点的概念、接口和内部画布
>
> **作者视角请直接看 [composite-usage-guide.md](composite-usage-guide.md)**（使用指南：何时复合化、
> 四种形态、接口设计、三种模式、已知边界、验证流程、检查清单）；本文档是规则与 wire 细节全集。

复合节点是由用户定义的节点。它在外层节点图中表现为一个普通节点，但内部拥有独立画布，可以包含其他节点、连接和更深层的复合节点。

## 核心结构

```text
复合节点
├── 外部接口
│   ├── 控制流输入和输出
│   └── 数据参数输入和输出
└── 内部实现
    ├── 普通控制流节点
    ├── 普通数据流节点
    ├── 其他复合节点
    └── 输入、输出之间的映射逻辑
```

外部使用者只需看到复合节点公开的引脚；内部实现由复合节点作者定义。

## 三种主要形式

### 纯控制流复合节点

只负责执行路径的组织，可以公开多个控制流输入和输出。

玩家可以自由定义输入与输出之间的映射，例如：

- 一个输入依次执行四个输出；
- 四个输入分别对应四个输出；
- 四个输入汇聚或映射到两个输出。

因此，不能只根据输入和输出数量推断内部执行顺序，必须查看复合节点内部实现。

### 纯数据流复合节点

内部由数据查询和计算组成，没有控制流接口。

例如，一个计算力的复合节点可以接收质量、速度、方向等多个参数，在内部执行复杂物理公式，最后输出力、加速度或其他计算结果。

```text
多个数据输入
→ 内部计算网络
→ 一个或多个数据输出
```

### 控制流与数据流混合复合节点

同时公开控制流引脚和数据参数。

例如“执行运动”复合节点：

- 控制流输入决定何时执行；
- 实体、速度、方向等数据参数决定对谁执行以及如何运动；
- 控制流输出连接后续逻辑。

它同时遵循[控制流](control-flow.md)和[数据流与连接](data-flow.md)的基本连接规则。

## 独立画布与嵌套

外层节点图是一张可以上下左右拖动的大画布。复合节点在外层只占一个节点位置；打开复合节点后，会进入另一张独立画布，只显示它的内部内容。

```text
外层节点图画布
└── 复合节点 A
    └── A 的内部画布
        ├── 普通节点
        └── 复合节点 B
            └── B 的内部画布
                └── ……
```

这种结构允许人类分层编辑和阅读规模很大、嵌套很深的逻辑，而不必在一张画布中同时展示所有细节。

## 布局原则

- 外层布局表达复合节点与其他节点之间的关系。
- 内部布局表达复合节点自己的实现。
- 类型相近或职责相关的节点可以摆放在同一区域。
- 节点坐标影响可读性，不应直接当作执行顺序。
- 真正的执行和数据依赖由连接决定。

## 编译产物体检工具（2026-08-14 自动化防线）

```bash
# --scan 目录模式（CI 自动防线，2026-08-15 起为默认）：递归扫描全部 .gia 产物，
# 任一文件 FAIL 即退出码 1；已接入 npm test 尾部（批量编译后自动体检）
npm run health:composite
npx tsx scripts/composite-health-check.ts --scan dist/tests
# GIA 单文件模式：检查已编译 .gia
npx tsx scripts/composite-health-check.ts <file.gia>
# IR 构建模式：直接检查入口源码构建的 compositeDefs（小 case；需 dist 已构建）
npx tsx scripts/composite-health-check.ts --ir <entry.ts>
```

> 2026-08-15 修复：IR 模式 C3-ir 曾误用 `conn.targetId` 检查 implEdges——真实形状是
> `NextConnection = number | { node_id }`（IR.d.ts 权威类型），导致任何带执行边的复合
> 都误报"目标节点不存在 id=undefined"；已改为兼容两种形状，layout-sequence 等入口
> 复绿。接入 npm test 时全量扫描 71 个测试产物（22 个含复合）0 FAIL，无噪音。

四类检查（对应已闭合规则 → 自动防线）：

- **C1 capture 路由完整性（#17）**：主图/复合内每个 composite call 的 InParam 必须有
  连接、字面量值或 compositePins 路由——无连接且无值 = capture 路由丢失或编辑器保存清空。
  注意：capture 路由（outer InParam → call InParam）**调用点物理 pin 不落盘是 #17 正常行为**，
  不检查 InParam/OutParam 物理 pin；仅 flow 路由（InFlow/OutFlow）要求内部节点存在物理
  flow pin（#11 缺陷模式）。
- **C2 字面量参数值（#18 + 编辑器保存副作用）**：get/set_node_graph_variable 类节点
  （识别 = InParam0 str + OutParam 或 InParam1）变量名必须字面量 str；编辑器保存会清空
  变量名/调用点字面量参数（固定参数变 0）。事件节点（whenCustomVariableChanges 变量名
  参数来自事件对象 conns）已排除，避免误报。
- **C3 flow pin exec 链（#12/#13/#15）**：exec 边 OutFlow connects 目标节点必须存在；
  flow 路由内部节点缺物理 flow pin = FAIL；exec 链尾无 outflow 路由消费 = WARN
  （#15 f.node detached 链尾模式）。
- **C4 OutParam 惰性求值（#15）**：输出 OutParam 指向 get 类节点且同 impl 内有同名
  变量 set 写入 = FAIL（写后读派生值必错——tab_lock 历史 bug 模式）；仅 get 无写入 =
  正常读取不报。

验证方式：rubik 19 复合 + 7 主图调用全绿；篡改实验（图变量名清空 → C2 FAIL、
调用点字面量清空 → C1-host FAIL）确认检出能力；2026-08-15 全量扫描 71 个测试产物
（22 含复合）0 FAIL 后接入 npm test。退出码 1 = 有 FAIL（scan 模式任一文件 FAIL 即退出 1）。

## #20 事件复合/混合复合与 impl 内部 exec 边（2026-08-14 v20 回归系列，读图自检闭环）

### 背景：调用流复合 / 事件流复合分离架构（用户 2026-08-14 架构指导）

复合节点应明确区分两类（接口语义清晰）：

- **调用流复合**（如 gsts_orbit_scheduler "设置定时器"）：输入参数 + InFlow 入口 + outflow
  出口——由调用方执行流驱动；复合输入 capture 在**同一条执行流**内可见。
- **事件流复合**（如 gsts_orbit_trigger "定时器触发时"）：**无 inputs/outputs/inflows/
  outflows**，入口 = 复合内 f.on 注册的事件节点（whenTimerIsTriggered 等）——由事件驱动，
  与调用流完全独立。

**关键语义（2690 日志实证）**：复合输入 capture 在**事件回调（延迟执行路径）**中是惰性
引用而非调用时快照——事件触发时引擎沿数据链追回宿主数据源（主图循环变量已复位 → 得 0）。
所以事件回调需要调用时值，**必须用事件载荷字段**（timerName/timerSequenceId/
eventSourceEntity）或字面量，不能引用 capture 参数。旧 setTimeout 机制正常，是因为编译器
用 __gsts_timeout_N_cap_i 字典做了显式值快照。

### 规则 #20a：事件回调里不要用 capture 匹配（2690 日志）

症状：定时器触发后 dispatch 永不执行（5 段公转缺失）。根因：回调里
`f.equal(evt.timerName, tname)` 的 tname 依赖 capture i——注册时 i=1→"1"（rec1[334]），
触发时 capture 重求值=0→"0"（rec7[6]），Equal 失败。
修复：用 evt.timerName 做 multipleBranches 分发（case 内 i 字面量）、
evt.timerSequenceId 传段、evt.eventSourceEntity 传 target——全部事件自带数据。

### 规则 #20b：impl 内部 exec 边指向的复合调用节点必须有物理 InFlow pin（2691 日志）

症状：trigger 事件 → MB 匹配 case → dispatch 调用帧出现，但 **dispatch 内部零帧**
（无 seg 分发/无 orbit_segment/无运动器）。读图自检（gil-node-graph-reading）发现
注入后 .gil 里 dispatch 复合只有 1 条执行流——MB 4 分支 → orbit_segment 调用边全丢。
根因链：
1. `buildCompositeCallPins` 只生成显式声明的 flow pin；impl 内部 exec 边（MB 分支 →
   复合调用）目标的 InFlow 不在其中（`requiredCompositeCallInflows` 只从 boundaryPins
   收集——即复合自己的 InFlow 边界映射）。
2. 主图路径有同样逻辑但目标在 ordinary materializer 中（graph.flow 自动建 pin）；
   impl 路径合成节点后生成（materializeLegacyImplGraphNode），漏了。
修复：syntheticNodes 生成后扫描 implEdges，收集每个合成节点被内部 exec 边指向的
InFlow index，补物理 InFlow pin（与 #11/#12 同构）。

### 规则 #20c：纯事件复合判定（v20 回归，读图自检发现）

症状：注入后 MB 分支边丢失（同 #20b 表象）。根因：v20 加的 `hasCompositeEventNode`
判定太宽——只要 impl 含 when_* 事件节点就当纯事件复合，把 **混合复合**
（gsts_orbit_segment：whenCustomVariableChanges 事件 + done outflow + 调用流需求）
的调用流 InFlow 路由砍掉 → CompositeDef inflows=[] → 注入器按接口裁剪调用点引脚 →
MB 分支边无接口对应被丢。
修复：纯事件复合判定 = **事件节点 + 无 outflow 标记 + 无显式 inflow 声明** 三条件
（trigger 符合、orbit_segment 不符合）。

### 流程沉淀：修复后必须读图自检（用户 2026-08-14 方法论强制）

修复生产代码并编译/注入后，**第一件事**是用 gil-node-graph-reading 技能读解析出的
节点图（.gil 注入结果）验证结构符合预期——通过后才交用户游戏测试；读图自检发现
问题则直接修复，不浪费用户测试轮次。若读图技能覆盖面不足无法定位，再查日志。
经验：**编译产物 .gia 正确 ≠ 注入后 .gil 正确**（#20b/#20c 都是 .gia 有边、
.gil 丢边——注入器按 CompositeDef 接口裁剪调用点引脚）。

### 验证命令（读图自检）

```bash
# 主图全景 + 复合 impl 图
npx tsx tools/list-gil-node-graphs.ts <地图.gil>
npx tsx tools/explain-gil-node-graph.ts <地图.gil> --graph _GSTS_game
npx tsx tools/explain-gil-node-graph.ts <地图.gil> --composite gsts_orbit_segment_dispatch
# 判定标准：dispatch 类复合应显示 "外部入口 InFlow → MB 分支 → 各子复合调用"，
# 执行流条数 = MB 分支数 + 后续链；接口 inflows 非空（混合复合必须有调用流入口）
```

## #21 复合族能力验证（2026-08-14 游戏实测，2696 日志全通过）

### 复合内 finite_loop（有限循环）✅

复合 build 内可直接用 `f.finiteLoop(0, 7, (i, brk) => {...})`——纯 exec 节点，编码/执行
正常（2696 日志：每次触发 8 次循环体帧）。与 setTimeout 不同（#3：setTimeout 宿主 API
复合内不可用）；finite_loop 是图节点，复合内完全可用。

### 复合内事件触发语义（轮 12f + 2695 独立复现）✅

- **whenCustomVariableChanges（实体自定义变量，触发事件=是）触发**：主图/复合内
  `setCustomVariable(entity, name, value, true)` → 复合内事件节点触发。
- **whenNodeGraphVariableChanges（图变量变化）不触发**：即使主图 Set Node Graph Variable。
- 复合内事件节点 = impl 普通节点（OutParam 0-4 + OutFlow[0] → 回调节点），
  compositePins 仅 InFlow 映射主链头（事件节点不入 compositePins）。

### 复合内 sendSignal + 图级 onSignal ✅

复合 build 内 `f.sendSignal(Signal.x, ...params)` 可编码（send 复合）；图级
`g.server().onSignal(Signal.x, (evt, f) => ...)` 接收并消费参数（2696 日志：ping-msg/tagA）。
信号注册表需先注册信号（含参数布局——donor 布局或未来内置布局）。

### 混合复合模式（事件 + 调用流共存）✅

复合同时含事件节点和调用流时，必须用**混合复合模式**（参考 gsts_tab_lock）：
- 调用流：`f.entry() → ... → f.outflow('done', tail, 0)`——提供 InFlow/OutFlow 接口
- 事件节点：`f.on(...)` 独立旁路（不参与调用流，OutFlow 直连回调节点）
- 纯事件复合（无 inflow/outflow）**不能被调用流链式调用**（调用后无 outflow 出口 →
  注入器裁剪调用点引脚 → 边丢失，2026-08-14 实证）

## 待逐步还原

- 复合节点外部接口的定义结构。
- 多控制流输入和输出的内部映射方式。
- 数据参数如何跨越外部接口与内部画布。
- 混合型复合节点的控制流和数据流边界。
- 嵌套复合节点如何引用内部定义。
- 外层实例与内部画布之间的身份关系。
- 复合节点布局、接口顺序和连接的真实关卡编码。

## wire 编码（2026-08-06 v22-v48 真实相邻快照 CONFIRMED）

> 状态：当前推荐
> 来源：真实 GIL 相邻快照（composite-case1..26）+ 第三方 gia.proto 对照 + 既有复合普查
> 最近校验：2026-08-06
> 适用范围：用户自建复合节点的定义、映射与调用三层 wire

创建/修改一个复合节点时，编辑器在三处位置联动（Level payload root 10 容器内）：

```text
宿主图实例（root 10.field1 NodeGraph 内）
├── SysGraph(22001) 节点：genericId=concreteId={SystemDefined, Server, SysGraph, 0x6000000N}，
│   有坐标、默认零 pins；nodeId 前缀 0x60000000 递增（0x60000008 为本轮样本）
├── 未赋值/未连线的输入不落盘（惰性实例化）
CompositeDef（root 10.field2 列表末尾追加，一一对应复合定义）
├── field4 Id{genericId=SysGraph 0x6000000N, concreteId=同, graphId=CompositeGraph(21002) 同}
├── field107 Type{kind=1000=Composite}
├── field200 name（默认"创建复合节点"，可改）
├── field203 = 6（语义待查）
├── inputs(102)/outputs(103)/inflows(100)/outflows(101) 参数流列表（零参数时全省略）
└── 与 field2 列表 59 项 vs 内部图 field4 列表 29 项数量不对应（信号类复合可能共享/无内部图，未深究）
内部实现图（root 10.field4 列表末尾追加）
├── NodeGraph id={UserDefined, BasicNode, CompositeGraph(21002), 0x6000000N}
├── nodes=内部节点列表（按 nodeIndex 升序；内部 nodeIndex 独立分配，与宿主图空间无关）：
│   ├── **包装搬入的节点**：原样保留 genericId/concreteId/pin，**无坐标字段**（v23）
│   └── **内部画布新放置的节点**：带坐标 f5/f6（fixed32 float bits）；Variant 未配置时
│       无 concreteId、未连线/配置时零 pins（v33，与宿主图 v9 规则同）
└── compositePins(4)：外壳 pin ↔ 内部节点 pin 的映射表
```

### 参数流定义（CompositeDef.inputs/outputs/inflows/outflows）

ParameterFlow（数据参数）与 ControlFlow（控制流）共用骨架（v36 首次实测 ControlFlow）：

| 字段 | 含义 |
|---|---|
| name(1) | 参数名（UTF-8，如“目标实体”）；**ControlFlow 可选**——节点 FlowIn/FlowOut 映射无 name（v36），多分支 DefaultBranch 映射带 name="默认"（case23，= 内部引脚显示名） |
| visible(2) | 恒 1 |
| index(3) | NodePin.Index：数据={kind=3 InParam / 4 OutParam, ShellIndex 默认省略/非默认显式}；控制流={kind=2 OutFlow / 1 InFlow, 同规则} |
| type(4) | ParameterFlow 类型：Ety={type1=1, type2=1, class 省略}；Int={class=2, type1=3, type2=3}；Flt={class=4 FloatBase, type1=5, type2=5}；Str={class=5 StringBase, type1=6, type2=6}；**Bol={class=6, type1=4, type2=4, 101={1:1}}（case2/case6 两样本实测，逐字节一致
  080618042004aa06020801；field101 子消息语义待查）**；type2 恒=type1；class 仅非 Server 基础类型落盘（class 大类型号：Int=2/Flt=4/Str=5/Bol=6，Ety 无；与 type1/type2=VAR_TYPE_NAME 值不同）；**未配置变体的 Variant 源输出 = {type1=1, type2=1}（v35 已定性：默认变体 Ety）** |
| description(4) | ControlFlow 描述（常空，**显式落 len=0**） |
| pinIndex(8) | **全局唯一身份号**（同复合内按**创建顺序**递增，样本 47→48→49→51→52→53/54/56/57/58/59→60→89；交换/排序参数顺序不改变；实例 pin 用 field7 引用它）。**分配器规律（2026-08-08 case6/case7 四样本 CONFIRMED）**：①无手动删除史时**单调递增**（现存 max+1 起跳过全局占用/墓碑，case1=60、case2=89）；②**手动删除参数后该 def 全部已删号（含合并/类型删除墓碑）回收进池，新分配取池最小**（case6=51、case7=52；配对样本：是否触发事件 89→删→51、控制表达式 60→删→52） |

### CompositePin 映射（内部图 compositePins）

```text
{outerPin(1)={kind, ShellIndex}, innerNodeId(2)=内部节点 nodeIndex,
 innerPin(3)={kind, ShellIndex}, innerPin2(4)=innerPin 双写}
```

- `outerPin` = 外壳 pin（顺序号：参数列表第 N 个 → ShellIndex=N）
- `innerPin` = 内部节点被绑定的真实 pin（身份：永远指向内部实际 Shell，如 target_entity=0、var_name=1）
- 映射按**参数身份**（名字）绑定，与参数列表顺序无关
- **共享参数（多对一）**：一个外壳参数可被多个内部 pin 共享——多个 CompositePin 指向同一
  outer ShellIndex（数据输入 v37、控制流输出 case25、控制流输入 case26 均实测；被合并参数的
  映射不删除，仅 outerPin.index 改写为目标参数 ShellIndex，数组按 outer Shell 升序重排）
- **compositePins 数组顺序 = f2 参数出现顺序**（inflows → outflows → inputs → outputs，组内按
  参数顺序；共享参数的多个映射按创建顺序排）——v30/v37/case21/case22/case23/case24 六样本
  支持；v35/v36 观察到的乱序是“加参数未触发重排”的中间态，交换/合并/共享改写操作会触发重排

### 内部控制流参数（v36/case23/case24 实测）

- inflows(100)/outflows(101) 定义：{visible=1, index={kind=1 InFlow / 2 OutFlow}, description=显式空, pinIndex}；**name 可选**（323 的 FlowIn/FlowOut 映射无；多分支 DefaultBranch 映射带 name="默认"）
- compositePins 追加同构映射：{outerPin={kind=1/2}, innerNodeId=内部节点, innerPin={kind=1/2} 双写}
- 控制流参数定义后**实例不落控制流 pin**（惰性，与数据输入同规则；主图连线时才实例化 kind=1/2 pin + field7）
- **排序**：与数据参数同规则——交换/前移 → ShellIndex 重写、pinIndex 身份保持、compositePin
  outer 跟随、innerPin 保持；实例已落盘的控制流 pin 的 index 也跟随重写（case23：outflow 53
  排序到第二后实例 OutFlow pin 的 Shell0→Shell1 显式）
- **追加**：新参数插参数组尾部、compositePin 插对应组 ShellIndex 升序位置（case24）
- **pinIndex 分配顺序：outflow 先于 inflow**（53/54、57/58 两样本，固定序或 UI 操作序）
- **共享**：控制流输入/输出均支持多对一共享（case25/26，与数据输入共享同构）

### 内部节点连线（v35 首次实测，与宿主图普通连线同构）

- connects 挂**目标侧** InParam（id=内部源 nodeIndex、connect/connect2={kind=4 OutParam} 双写），
  源侧不落 connects；value 与 connects 并存（Variant 自动实例化自带 value）
- **未配置变体的 Variant 目标按源类型自动实例化**（同宿主图 v18 规则）：如源 337 默认 Ety →
  目标 323 concreteId 缺失→328（Ety，TypeSelectorIndex=5）+ R<T> pin 实例化
- **未配置变体的默认变体 = genericId**（= Variants 第一个 KernelID）：337 默认 Ety、323 默认 Int；
  加输出参数时内部 Variant 源自动实例化为默认变体（v34：337 落 concreteId=337 + value Out pin，
  输出 type 随之 = Ety {1,1}）
- **内部控制流连线与宿主图完全同构**（case19）：源侧落 OutFlow pin（i1/i2={kind=2, ShellIndex
  省略/显式}）+ connects=[{id=内部目标 nodeIndex, connect={kind=1 InFlow}, connect2 双写}]，
  目标内部节点零感知；多分支的默认分支输出 = **DefaultBranch（Shell0）**，Case1..10 为
  Shell1..10；**控制流连线不触发 Variant 自动实例化**（未配置变体的多分支源 cid 缺失——
  实例化只为数据流类型绑定，v17 规则不扩展到控制流）；内部连线不产生 compositePins

### 调用侧（宿主图实例 pin）

与普通节点 pin 完全同构，仅多 `field7`：

```text
数据输入：i1/i2={kind=3 InParam, index=ShellIndex} + type=VarType +
  field7=pinIndex + （连线→connects / 填值→value，二选一）
控制流输出：i1/i2={kind=2 OutFlow, index} + connects→目标 + field7=pinIndex
```

- **惰性实例化**：只落被赋值/连线的输入；实例 pin 顺序=参数定义顺序、index=ShellIndex；
  新 pin 按 ShellIndex 升序插入数组（case3：Shell3 追加尾部，既有 0/1 逐字节不变）
- 连线：connects=[{id=源节点, connect={kind=4 OutParam, 源 ShellIndex 默认省略/显式}, connect2 双写}]（与 data-flow.md 普通连接一致）；**type 落 VAR_TYPE_NAME 值（Bol=4，case3 实测）**；源侧零落盘
- 填值：value=具体类型 base（如 StringBase{class=5, alreadySetVal, itemType, bString(105)="arst"}），无 connects
- **输出**：实例**永不落输出 pin**（v32 实测：输出被主图连线消费后实例零变化）——调用侧直接以
  `connects=[{id=复合实例 nodeIndex, connect={kind=4 OutParam, ShellIndex 默认省略/显式}, connect2 双写}]`
  引用它，与普通 Fixed 源完全同构；Variant 目标被此连线触发自动实例化（concreteId=目标类型
  KernelID + 全部 R<T> pin 实例化，value=ConcreteBase 与 connects 并存，见 data-flow 规则）；
  输出参数**排序交换只影响 f2/compositePins**（实例输出侧不落盘故零变化，case22）
- **控制流**（v38 实测）：输入（InFlow）作连线目标**不落 pin**（源侧 connects→实例 id，普通控制流
  目标规则）；输出（OutFlow）作源**落 pin**：i1/i2={kind=2 OutFlow, ShellIndex 默认省略/显式} +
  connects→目标 + **field7=outflows pinIndex**（样本：kind=2 无 index + connects→24 + field7=53，
  与普通控制流源同构仅多 field7；与 v28 _GSTS 样本一致）

### 内部 Variant 选型与改类型（case17/18/19 实测）

- **内部 Variant 手动选型**：与宿主图同规则（v20/v21）——concreteId=选中变体 KernelID、R<T>
  pin 全量实例化/重写（type、value.indexOfConcrete=TypeSelectorIndex 跟随），固定类型 pin 不实例化
  （case17：337 选 Flt → concreteId 337→341、value Out pin type {1,1}→{class=4,5,5}、
  indexOfConcrete 0→4 显式）
- **改类型触发自身联动重写**：无论源方向还是目标方向（case18 宿主 node 19 改 Flt→Int：
  cid 2659→20、自身两个 R<T> pin 全部重写）——Variant 节点自身 R<T> pin 联动与连线方向无关
- **类型不匹配的复合输出参数被整个删除，非类型联动**（case17）：f2 outputs 项 + compositePins
  映射项同步删（编辑器不追踪“输出参数 ← 内部节点 pin”的类型联动，类型一变即失效删除）
- **断线行为由目标节点类型决定**（case18 闭合，非“内部图 vs 宿主图”差异）：
  - **Variant 目标**（自动实例化 pin 带 value 配置）：断线 → **pin 保留、connects 移除**
    （case17 内部 323、case18 宿主 node 19 两样本；type/value 随目标自身变体重写）
  - **Fixed 目标**（连线新建 pin 无 value）：断线 → **整 pin 移除**（v21→v22 node 24 样本）

### 编辑器行为（v22-v48 逐轮单变化实测）

| 操作 | wire 变化 |
|---|---|
| 创建（包装节点） | 宿主图删原节点+加 SysGraph 实例；CompositeDef 追加（无参数流）；内部图追加（原节点搬入，无坐标） |
| 改复合名字 | 只写 CompositeDef.name(200)，实例/内部图不变 |
| 加输入 pin（提升内部节点输入） | CompositeDef.inputs 追加 ParameterFlow（插到 inputs 列表末尾，纯插入）+ 内部图 compositePins 按 (kind,index) 升序插入 {outerPin={kind,Shell}, innerNodeId, innerPin 双写}；**宿主实例与内部节点 pins 零变化（case2/6/7 三样本实测 2026-08-08：提升不要求内部 pin 已落盘）**；实例重编号 = 重建分配器（见下方模型：case2 原位因排除自身后最小空闲==原位；case7 移走因 innerNode==实例位置，单样本 INSUFFICIENT） |
| 加输出 pin | CompositeDef.outputs 追加 ParameterFlow（kind=4 OutParam）+ 内部图 compositePins 追加 OutParam 侧映射（innerNodeId 指向内部输出节点）+ 实例 nodeIndex 重编号；**实例不落输出 pin**（v32 证实：被消费也不落盘，输出侧永不实例化） |
| 加第二个输出 | outputs 追加（index=1 显式 Shell1）+ compositePins 追加（outerPin index=1、innerNodeId=新内部节点）；多输出时 ShellIndex 升序、pinIndex 继续用全局分配器（v34：49→51，中间 50 被其它占用）；内部节点零感知 |
| 内部图加节点 | 内部图 nodes 插入（按 nodeIndex 升序，新放置带坐标 f5/f6）；CompositeDef f2 不变；**实例 nodeIndex 重编号且宿主图所有引用它的 connects.id 跟随改写**（v33：node19 connects 3→5） |
| 内部节点连线 | 内部图内：目标侧落 connects（id=内部源 nodeIndex）、未配置 Variant 目标按源类型自动实例化（v35：323→328 Ety）；CompositeDef f2 不变；实例重编号 + 引用跟随 |
| 控制流参数 | CompositeDef inflows/outflows 追加（无 name、description 显式空）+ compositePins 头部插入 kind=1/2 映射 + 实例重编号；实例不落控制流 pin（惰性） |
| 合并输入 | f2 删一个 input（保留长名）+ 被删映射的 compositePin **不删除**、outerPin.index 改写为保留输入 ShellIndex（共享，多对一）+ 按 outer Shell 升序重排 + 实例重编号 |
| 主图连线控制流 | 输入（InFlow）作目标：实例不落 pin，源侧 connects→实例 id；输出（OutFlow）作源：实例落 OutFlow pin（kind=2 + connects→目标 + field7=outflows pinIndex）；实例不重编号（主图连线不重建） |
| 改参数名 | 只写 CompositeDef.inputs[].name(1)，内部图/实例/编号都不动 |
| 删除参数（case4/case5 实测 2026-08-08） | 三处联动：①f2 删 ParameterFlow 记录（含 tag+len 整段删除）②compositePins **整个删除**对应映射（与合并输入的"映射保留+outer 改写"不同）+ 中间删除时**后续映射 outer 跟随 ShellIndex 前移**（inner 保持；末尾删除无改写）③中间删除时后续参数 **ShellIndex 前移补洞**、**pinIndex 保持**（身份号）；**实例重编号**（最小空洞排除墓碑，3→5、5→6）+ 宿主图 connects.id 跟随改写 + 实例其余 pins 逐字节不变，**被删参数已落盘的调用侧 pin 整个删除**（case5：field7=89 pin 删） |
| 调用填值 | 实例新增 InParam pin（value 形态），定义层不动；**不触发实例重编号（case3 实测）** |
| 调用连线 | 实例新增 InParam pin（connects 形态，type 落 VAR_TYPE_NAME 值），定义层/内部图零感知（运行时绑定）；**不触发实例重编号（case3 实测）** |
| 调用消费输出 | 目标侧挂 connects（id=复合实例，kind=4 OutParam）触发目标 Variant 自动实例化；**实例零落盘**（输出 pin 永不实例化），定义层/内部图零感知 |
| 交换参数顺序 | 三处联动：inputs 重排且 **ShellIndex 按新顺序重写（0,1…）**、pinIndex 保持、CompositePin outer 跟随而 **innerPin 保持内部真实 Shell**、实例 pins 跟随；**输出参数交换同规则**（case22：仅 f2/compositePins 变化，实例输出侧零变化）；**控制流参数排序同规则**（case23：实例已落盘 OutFlow pin 的 index 跟随重写） |
| 内部 Variant 选型 | concreteId=选中 KernelID + R<T> pin 全量重写（type/TypeSelectorIndex 跟随）；内部节点零感知，映射只经 compositePin（case17） |
| 内部 Variant 改类型 | 自身联动重写 + **类型不匹配的复合输出参数整个删除**（f2 项 + compositePins 映射项，非类型联动）+ 断线（目标 Variant 保留 pin 清 connects / Fixed 删 pin）+ 实例重编号（case17） |
| 追加控制流参数 | f2 inflows/outflows 追加（尾部、ShellIndex 顺延）+ compositePin 插对应组 ShellIndex 升序位置 + 实例重编号；pinIndex 分配 outflow 先于 inflow（case24） |
| 合并共享参数 | f2 删被合并参数（pinIndex 不释放）+ 被删方 compositePin **不删除**、outerPin.index 改写为保留参数 ShellIndex + 按 outer Shell 升序重排 + 实例重编号；数据输入（v37）/控制流输出（case25）/控制流输入（case26）三向同构 |

**三个“号”各司其职**：ShellIndex=顺序号（交换/排序时重写）；pinIndex=身份号（保持，实例 field7
引用）；innerPin=内部真实 pin（保持）。实例 nodeIndex 在“修改 CompositeDef 结构”的保存后可能
重编号（样本 51→3→5→6→7→8→3→5…：复用宿主图空闲 nodeIndex；主图连线不触发重建）。
**实例重建分配器模型（2026-08-08 case1-9 全样本细化）**：任何 def 参数结构变化（加输入/删参数/
交换顺序/加输出）→ 编辑器重建复合实例（删旧建新）。分配 = **排除自身后最小空闲 nodeIndex**：
case1 51→3、case6 6→3、case9 8→3、case8 7→8、case4 3→5、case5 5→6（排除 3+5）。
**原位（wire 零变化）当且仅当排除自身后最小空闲 == 原位**（case2 3→3：无墓碑史场景）；
case7 3→5 是唯一“在最小空闲位却移走”的样本，其可观测差异 = **innerNode == 实例 nodeIndex
（3==3）** → 推断“innerNode 冲突时排除原位”，但仅单样本 INSUFFICIENT（case3/4 零 pins 实例
同样移走，双样本）。**墓碑跨轮（删参数轮之间累积、消费模型）**：case4 墓碑 3 → case5 排除 3
（跨轮有效）→ case6 时 3 可用（已消费）；跨轮墓碑仅覆盖删参数轮，提升轮自身墓碑只在本轮有效。
调用侧填值/连线不改 def → 不重建（case3）。**工具 fail closed 边界**：innerNode==原位、实例零
pins 均拒绝；pinIndex 回收池（case6=51/case7=52）与全局分配史（case2=89）单快照不可推断。

**节点图工具（gsts assets:node-graphs patch，2026-08-08 round3）**：`composite create`
（case8 骨架闭合：锚点原位变实例、出口自动提升、内部搬入、defId=0x6000000N 最小空闲、
pinIndex 默认全文件 max+1——有删除史时编辑器取回收池，工具需显式 pinStart 重放）、
`composite del-input`（case4 逐字节闭合）、`composite swap-input`（case8 def/impl/pins
逐字节闭合）。del/swap 实例重编号 = 排除原位取最小空闲（总是移动）；跨轮墓碑无会话史，
编辑器手动删过参数后工具可能选到更小号（case5/swap-case8 文档边界）。

**重编号分配规律（composite-add-param-case1 v59→v60 + case4 闭合）**：实例 nodeIndex =
**最小空洞且排除墓碑**（case4：node 3 刚删为墓碑 → 跳过取 5；case1：51→3 中 3 非墓碑直接取）；
重编号 = 节点记录 f1 改写 + 记录移到 nodeIndex 升序位置 + 全图源侧 connects 目标 ID 改写，pin
内容（cpi/connects/value/位置）逐字节不变。

**加输入参数＝提升内部节点输入（case2/case6/case7 三样本同构闭合，2026-08-08）**：① def 参数流
追加 {1:name, 2:1, 3:{1:kind, 2:shell}, 4:type 流, 8:pinIndex}（插该 kind 列表末尾）；
② impl 图 compositePins 追加 {1:{1:kind,2:shell}outer, 2:innerNodeId, 3:{innerPin},
4:{innerPin}双写}（按 kind/index 升序插入；innerPin=被提升内部 pin 身份，与 ShellIndex
可重合如 08031002）；③ 实例重编号（见下方分配器模型）；④ 宿主图源侧 connects 更新；⑤ **宿主实例
与内部节点 pins 零变化**（提升不新增调用侧 pin，未填值/连线；被提升 pin 可本无落盘——
node 1 提升前仅落盘 1 pin）。type 流 = {1:f1(class), 3:VarType, 4:VarType}；**Ety 无 class f1**
（= {3:1, 4:1}，case3 实测 18012001）；f1 映射 {Int:2, Flt:4, Str:5, **Bol:6**}（Bol=6 由
case2/case6 实测闭合，非早前推断的 3；Bol 另有 field101={1:1}）。

### 复合内部图变量节点（get/set_node_graph_variable，2026-08-14 差分 CONFIRMED）

> 状态：已闭合（轮 1 获取 / 轮 2 设置，rubik 地图 1073741882 编辑器相邻保存差分 + 生产 .gia 生成对照）
> 证据：编辑器官方 wire（orbit_calc 内部图 nodeIndex 1 / 23）vs 生产 game.gia 宿主图 nodeIndex 60（同构）

**核心结论：复合内部放图变量读/写节点 = 与宿主图完全同构，不走 implVariables。**

- 复合节点是**资产**（不属于某张图/关卡）：复合内部画布中"获取/设置图变量"的**变量选择列表为空**
  （编辑器无法枚举图变量），但变量名可手填，节点可正常放置，运行时经调用上下文读宿主图变量。
- wire 同构（以 vels1 = dict(int,vec3) 为例，key=3 Integer / value=12 Vector）：

| 节点 | genericId | concreteId（按变量类型选变体） | pins |
|---|---|---|---|
| 获取图变量 | 337 | Get_Node_Graph_Variable__Dict_Int_Vec = 3046 | InParam:StringBase 变量名字面量 + OutParam:type=27 |
| 设置图变量 | 323 | Set_Node_Graph_Variable__Dict_Int_Vec = 2905 | InParam:StringBase 变量名字面量 + InParam(1):type=27 值 |

- **变量名 = InParam 字面量字符串**（bString "vels1"，type=6），无特殊变量引用结构。
- **OutParam/值 pin 的 dict 编码**：type=27(Dictionary) + value =
  `ConcreteBase{alreadySetVal, bConcreteValue{indexOfConcrete:20, value: MapBase{
  itemType{type_server{type:27, kind:2(Pair), items{key, value, structId 省略}}, bMap{mapPairs:[]}}},
  structs{class:1, inner{wrapper{class:10003 MapBase, mapPair{key, value}}}}}}`
- **indexOfConcrete=20** 对 Dict<Int,Vec>（获取 3046 与设置 2905 两样本一致；其他 k/v 组合待样本）。
- **值输入不连线不填值 → 编辑器落"默认空 dict"**：ConcreteBase + MapBase + bMap:{}（key/value 类型仍按变量类型编码，
  alreadySetVal=true）——未连线值 pin 的惰性默认形态。
- **dict 变体按 k/v 类型细分**（第三方 node_id.ts CONFIRMED）：Set_Node_Graph_Variable__Dict_* 从 2858 起按
  (key∈Entity/GUID/Int/Bool/Float/Str/Faction/Vec/Config/Prefab × value∈同集+List 族) 枚举；Dict_Int_Vec=2905。
- 内部图新放置节点带坐标（x/y，fixed32 float bits）；包装搬入节点无坐标（既有规则）。

**生产对照（#4 根因修正）**：
- 宿主图路径已正确（生产 game.gia 宿主图 get_node_graph_variable 编码与官方逐字段一致，仅 .gia/.gil class 编码层
  差异：UserDefined/20000/22000 vs SystemDefined/Server/SysCall——注入转换通用差异）。
- 复合路径错误：①composite.ts 从 `def.implVariables` 取变量类型，但该字段仅来自复合定义显式声明
  `variables` 选项（composite_registry.ts:376），复合内读的是**图变量**，官方 wire 证明不走 implVariables；
  ②argVarType/argVarBaseClass 无 dict 分支返回 0（Ety）；③makeVarBaseValue 无 MapBase 分支。
- **修复（2026-08-14 提交 ddacb2e + 字典入复合配套）**：
  ①buildCompositeAccessories 新增 graphVariables 参数（index.ts 传 IR 顶层 variables），与 def.implVariables 合并进
  buildImplGraphNodes 的 variablesByName（复合自身声明优先）；
  ②resolved_node.ts resolveNodeIdentity 的 suffix 计算补 dict 分支（dict_<k>_<v>，vec3→vec、config_id/prefab_id
  replaceAll 兼容双出现）——get_node_graph_variable 由此经 inferVarSuffix 解析到 concreteId=3046（Dict_Int_Vec），
  vendor 物化路径自动生成与官方 golden 逐字段一致的 OutParam（type=27、ConcreteBase indexOfConcrete=20、
  MapBase{items{key:3,value:12}}）；
  ③**set_or_add_key_value_pairs_to_dictionary 等 dict 动作入复合的完整链**（rubik v4 字典入复合实战驱动）：
    a) composite_registry.ts implNodes args 序列化补 conn dict 子字段（与 ir_builder.buildConnectionArgument 同构，
    之前 dict 连接的 k/v 丢失 → 无法选 kv 变体）；
    b) buildImplConnTypeIndex 保存 dict 子字段（connTypeIndex 供 resolveArgumentTypes 推断 dict 类型）；
    c) resolved_node.ts usesSharedVariantResolution 纳入 set_or_add + resolveNodeIdentity 加 kv 特判
    （枚举键不带 Dict_ 前缀：Set_or_Add_Key_Value_Pairs_to_Dictionary__Int_Vec=995）；
    d) composite.ts ordinaryConcreteNid 扩展 set_or_add（sharedConcreteNid 落到 concreteId）；
    e) buildConnPin 支持 dict（官方形态：ConcreteBase{indexOfConcrete:0} + MapBase{itemType{type:27, kind:2 Pair,
    items{key,value}}, bMap{mapPairs:[]}}，与宿主图 set_or_add InParam 逐字段一致）；
  ④回归：新测试 shared+legacy 双后端 PASS + E2E 全链路 PASS；rubik 编译通过（impl 图 setOrAdd concreteId=995、
    get 节点 3046、宿主节点 190→180）。

### 复合公开 dict 输出参数（2026-08-14 轮 3 差分 CONFIRMED）

> 证据：orbit_calc 内部「获取图变量 vels1」节点提升为输出，编辑器相邻保存差分（after-轮2 → after-轮3）
> 范围：dict 类型 ParameterFlow 编码 + 提升联动

- **CompositeDef.outputs 追加 dict ParameterFlow**：name=编辑器默认「变量值」、index={kind=4 OutParam, idx=5}、
  type=ParameterFlow.Type：`{class=10003 MapBase, type1=27(Dictionary), type2=27, mapType{key=3, value=12,
  f6=1, f7=1}}`（wire 080x：08 93 4e 18 1b 20 1b ca 06 08 18 03 20 0c 30 01 38 01；f6/f7 语义待查，
  可能客户端类型标记）、pinIndex=43（编辑器全局分配器，与生产 200-204 不同源）。
- **compositePins 追加**：`{outerPin={kind:4 OutParam, index:5}, innerNodeId=1（内部获取节点）,
  innerPin={kind:4}, innerPin2 双写}`——映射到内部节点 OutParam（与 vec3 输出同构）。
- **实例重编号**：宿主图 gsts_orbit_calc 实例 nodeIndex 84→108（加输出参数触发重建，已知规则）；
  宿主图引用该实例的 connects.id 全部跟随改写（node 61/63/65/67/69/70 changed，pinCount 不变）。
- **实例不落输出 pin**（既有规则，提升后未被消费）。
- 内部图 nodes 零变化（23→23）；提升只写 def + compositePins。

### 复合公开 dict 输入参数（2026-08-14 轮 4 差分 CONFIRMED）

> 证据：orbit_calc 内部「设置图变量」值输入提升为复合输入，编辑器相邻保存差分（after-轮3 → after-轮4）

- **CompositeDef.inputs 追加 dict ParameterFlow**：name=「变量值」、index={kind=3 InParam, idx=3}、
  type=ParameterFlow.Type **与 dict 输出逐字节相同**（08934e181b201bca06081803200c30013801）——
  输入/输出共用 ParameterFlow.Type 编码（class=10003 MapBase, type1/type2=27, mapType{key,value,f6,f7}）、
  pinIndex=44（继续全局分配器）。
- **compositePins 插入输入组尾部**：{outerPin={kind:3 InParam, index:3}, innerNodeId=23（设置节点）,
  innerPin={kind:3 InParam, index:1}（内部真实 pin=值输入）, innerPin2 双写}；原 outputs 映射整体后移一位
  （outerPin.index 保持，kind 升序插入规则再验证）。
- **内部节点零变化**（nodes 23→23；提升不要求内部 pin 已落盘——既有规则）。
- **实例重编号**：宿主图实例 108→109 + 引用 connects.id 跟随改写（6 节点 changed，pinCount 不变）。

### 嵌套复合调用（2026-08-14 轮 5 差分 CONFIRMED）

> 证据：orbit_calc 内部手工放置 gsts_orbit_point 复合 + 连线到新增 DTC 节点，编辑器相邻保存差分（after-轮4 → after-轮5）

- **内部图放复合节点 = SysGraph 实例，与主图调用完全同构**：genericId=concreteId=被调复合 id（1610700001）、
  有坐标、kind=SysGraph。
- **嵌套调用不产生新 CompositeDef**（field2 仍 5 项；复合是全局资产，被调复合只引用不重复定义）✅ 资产模型实证。
- **已连线输入 pin 落 compositePinIndex = 被调 def 参数 pinIndex**（c=103, s=104 与 def[1] inputs pinIndex 精确对应）——
  注意内部嵌套实例用 compositePinIndex 字段（非主图实例的 field7？解码字段名差异待查）。
- **未连线输入惰性**：vp/vPerp/axv 未落盘；c/s 落盘（FloatBase 0.587785/0.809017 = 编辑器 UI 记住的默认值，
  wire 无默认值字段，来源=实例 UI 状态，待验证；生产显式传值不受影响）。
- **连线 = 目标侧 connects**（{id:嵌套实例, connect:{kind:4 OutParam} 双写}，ShellIndex 省略=输出0）——与主图调用同构；
  源侧（嵌套实例）零落盘（实例不落 OutParam pin——既有规则）。
- **DTC 目标按源类型自动实例化**：genericId 180 → concreteId 189、InParam value=ConcreteBase(indexOfConcrete=5=Vector)
  → VectorBase bVector{} + connects——与生产 DTC_IN_PARAM_VARTYPE_SEQUENCE[5]=Vector 完全一致（生产已知规则再验证）。
- **联动**：宿主图 orbit_calc 实例重编号 109→134 + 引用 connects 跟随改写（6 节点）；内部 compositePins 零变化
  （嵌套调用不产生 compositePins——既有规则）。

### 提升输入 → 内部节点物理 pin 落盘（2026-08-14 轮 6 差分 CONFIRMED，addition 样本）

> 证据：orbit_calc 内部新增「加法」节点（不连线）+ 提升输入 0 为复合输入，编辑器相邻保存差分（vs v5 注入基线）

- **提升的输入落盘物理 InParam**：compositePins 新增 {outer={3:4}, innerNode=1(加法), inner={3:0}}，
  加法节点 pins=[3:0, 3:1, 4:0]——提升的输入 0 有物理 InParam。
- **编辑器 Fixed 节点全 pin 物化**：未提升未连线的输入 1（3:1）和输出（4:0）也落盘——
  与生产 vendor materialize 的惰性（只落盘有连线/边界 pin）不同；无连线默认值 pin 对游戏无影响（观察项）。
- **裁决**：生产 materialize 的"boundary capture 保留物理 pin"（composite.ts capturedInputIndexes 边界
  逻辑）与编辑器一致 ✅——旧测试 test-custom-variable 断言"captured InParam 不编码"与编辑器行为冲突
  （节点族不同：测试对象为 Variant 的 get_custom_variable，本轮为 Fixed 加法——严格裁决需 custom
  variable 专属样本，暂标记"断言待更新，证据倾向陈旧"）。

### 复合节点族覆盖矩阵（2026-08-14 编译层批量验证）

> 证据：tests/composite/test-composite-node-family-coverage.ts（自动迭代收敛：构建全部→失败定位→移除重试）
> 分层：编译层 PASS ≠ 游戏正确——游戏层以 rubik 实际用例核验为准；矩阵每轮差分/核验后更新

| 族 | 代表节点 | 编译层 | 游戏层 |
|---|---|---|---|
| 算术 | addition/multiplication | ✅ | ✅（rubik 速度计算） |
| 比较 | equal | ✅ | ✅（lock 检查） |
| 向量 | _3d_vector_add/cross/create3d_vector | ✅ | ✅（rubik 轨道计算） |
| 三角 | sine/cosine | ✅ | ✅（自旋轴转换） |
| 列表 | get_corresponding_value_from_list | ✅ | ✅（blocks 查询） |
| 字典 | query/keys/set_or_add/clear | ✅ | ✅（vels/axes） |
| 图变量 | get/set_node_graph_variable | ✅ | ✅（vels/blocks） |
| 查询 | get_entity_location_and_rotation | ✅ | ✅（层判断） |
| 动作 | print/create_prefab/线性运动器 | ✅ | ✅（角块创建/轨道） |
| 控制流 | double_branch/multiple_branches | ✅ | ⏳ 待游戏核验（多出口语义） |
| 自定义变量 | get/set_custom_variable | ✅ | ⏳ 待核验 |
| 转换 | data_type_conversion | ✅ | ⏳ 待核验 |
| 局部变量 | get/set_local_variable | ✅（既有测试） | ⏳ |
| 定时器 | start_timer | ✅（8-14 实证） | ✅（v2 定时器宿主） |
| 组合 | loc+vec 链 / dict+vec 链 | ✅ | ✅ |

**已知 DSL 约束**（编译层暴露）：
- createPrefab 的 prefabId 参数不支持数据节点（只接受字面量/实例）——复合输入传 prefabId 实例
- 复合内空列表参数需 listLiteral（list 基类 toIRLiteral 返回 null）
- 复合内 setTimeout 不可用（生产发现 #3，定时器留宿主）
- 事件注册留宿主（复合是资产，不挂事件）

### 打包自动注册输入（2026-08-14 轮 7 差分 CONFIRMED，manifest 缺口闭合）

> 证据：宿主图选中 2 个相邻 doubleBranch 节点 → 创建复合 → 编辑器保存差分（vs v6 注入基线）

- **打包时源在范围外的连线 → 自动注册为复合输入**：def inputs 追加（自动命名「输入1」、类型=源类型 bool、
  pinIndex 继续全局分配器）；compositePins 追加 {outer={3:0}, innerNode=内部条件节点, inner={3:0}}；
  实例落 InParam + 源侧连线改写（实例 connects→源节点，源侧零落盘——与普通调用连线同构）。
- **控制流自动注册**：打包内 doubleBranch 的控制流提升为复合 inflow/outflow（inflow name 空、outflow name=「是」
  ——分支名直接提升）；实例落 OutFlow pin（field7 引用）。
- **打包内既有连线保留**（内部节点条件 ← 内部节点输出，connects 保持）。
- **打包节点保留坐标**（x/y 有值——与 v23「包装搬入无坐标」不同，观察项：可能 exec/控制流节点打包保留坐标，
  或编辑器版本差异）。
- **def id ≠ 实例 id**：打包复合 def id=1610612749、宿主实例 gid=1610612741（差 8）——与生产复合
  （实例 id=def id）不同，观察项（编辑器打包复合的引用 id 空间）。
- 生产对照：DSL defineComposite 是声明式（inputs 显式声明），无需打包自动注册——该规律服务于
  「整图打包」理论（用户）：编辑器可把任意主图逻辑打包为复合，外部连线自动成为输入。

### 复合内多分支默认形态（2026-08-14 轮 8 差分 CONFIRMED）

> 证据：orbit_calc 内部添加「多分支」节点（全部默认、无分支条件、无新增分支），编辑器保存差分

- **默认未配置多分支 = 空壳节点**：genericId=3（Multiple_Branches）、**无 concreteId**（Variant 未配置）、
  **零 pins**（无分支条件值、无分支输出）——与内部图普通 Variant 节点规则一致（v33：未配置无 cid、零 pins）。
- 新增节点取 nodeIndex 1（内部图最小空闲分配器）。
- 后续分支配置（条件值/Case 分支）需差分轮 8b 补 golden。

### 复合内多分支配置形态（2026-08-14 轮 8b 差分 CONFIRMED）

> 证据：orbit_calc 内多分支节点配置——局部变量节点作条件 + 新增 2 分支（值 1/2）+ 三分支连线，编辑器保存差分

- **concreteId 按条件类型选变体**：条件为 int → Multiple_Branches__Int=3（Generic=3 同 id）。
- **pins 形态**：
  - OutFlow 0/1/2（DefaultBranch=0、Case1=1、Case2=2——与宿主图 v38/case19 规则一致）+ connects→目标 InFlow（内部连线同构）
  - InParam(0) 条件：type=条件类型（int=3）、value=ConcreteBase{IntBase}（默认）+ connects→数据源
  - **InParam(1) 分支值列表**：type=**XXList**（int→IntegerList=8）、value=ConcreteBase{ArrayBase,
    bArray.entries:[IntBase{val:1}, IntBase{val:2}]}——每个 Case 值一个 entry（有序）
- 局部变量节点（Get_Local_Variable gid 18 / cid 20）作条件源：OutParam(1)=局部变量值 + 初始值 InParam(0)
  （IntBase 默认）——复合内局部变量与宿主图同构。
- compositePins 零变化（条件/分支值未提升为复合参数——纯内部节点）。
- 生产对照：DSL f.multipleBranches(v, [...]) 编译层通过（fam_ctl_mbranch）；官方 golden 已可逐字段对照。

### 提升输入物理 pin 落盘：Fixed vs Variant（2026-08-14 轮 6/9 差分 CONFIRMED）

> 轮 6：加法节点（Fixed）提升输入 → 全 pin 物化（3:0 提升 + 3:1 未连线 + 4:0 输出都落盘）
> 轮 9：get_custom_variable（Variant，未配置 concreteId）提升变量名输入 → **不落 InParam(1)**；
> 仅目标实体（连线）落 InParam(0)

- **完整规则（轮 6/9/9b 差分终裁）**：
  | 节点状态 | 提升 capture | 证据 |
  |---|---|---|
  | Fixed（加法等） | **落盘**（全 pin 物化） | 轮 6 |
  | Variant **未配置**（无 concreteId） | **不落盘**（compositePins overlay 提供） | 轮 9 get_custom_variable |
  | Variant **已配置**（cid 如 Equal__Int=370） | **落盘**（默认值形态，ioc 正确如 5） | 轮 9b equal |
- **生产对齐（已提交）**：materialize（shared）+ buildImplNodePins（legacy）的 boundary capture 例外
  改为仅已配置时保留；test-custom-variable 断言按裁决更新（已配置落盘，cid 54/53/50）。
- 观察项：目标实体源 node 34（gid 73）自动补入（编辑器为用户填充实体源）。

### 复合内局部变量节点（2026-08-14 轮 9c 差分 CONFIRMED）

> 证据：orbit_calc 内部添加「获取局部变量」节点（vec3，未连线未提升），编辑器保存差分

- **编辑器官方形态：无 handle pin**——只有 InParam(0) 初始值（ConcreteBase ioc=6 VectorBase）+ OutParam(1) 值输出；
  handle（local_variable 类型）pin **未连接时不物化**。
- **生产对照**：复合路径保留 handle pin（set_local_variable 连接需要），但 value 曾编码为 {}（vendor
  encode 对 local_variable 类型生成空 VarBase）——与宿主路径不一致（index.ts 771-778 置 null 省略）。
- **修复**：materialize GIA 对象层对 type=16 pin 置 value=null（对齐宿主；GIA 字节省略 value 字段）。
- test-local-variable 断言更新（undefined → null）；两个旧测试（local/custom-variable）全部转绿。

### 打包 exec 链：outflow 自动提升（2026-08-14 轮 10 差分 CONFIRMED）

> 证据：宿主图打包 lock 检查链（equal 46 + double_branch 47 + set lock 48——数据+控制流+动作混合链），编辑器保存差分

- **outflow 自动提升 = 执行链尾**：打包复合 outflow → 链尾 set lock（exec 动作）的 OutFlow；
  inflow → 链头 double_branch 的 InFlow（入口）——与轮 7 控制流提升同构，动作节点作为链尾时出口指向它。
- **自动注册输入**：打包范围外连线（get lock → equal 条件）→ 复合输入「输入1」（bool）——与轮 7 一致；
  内部字面量（set lock 的写入值 true/false、变量名 "lock"）不注册（内部值）。
- **打包保留已配置变体**：equal cid=786（Bool）、set lock cid=325（Bool）原样搬入。
- **内部连线保留**：equal → double_branch（条件）connects 保持。
- **嵌套打包**（轮 7 的复合实例再打包）编辑器允许（用户方案确认），实例作为内部节点搬入（本轮最终
  打包的是普通节点链——46/47/48 重排后为 lock 链）。

### 生产 #12：合成→普通 exec 边完整规则（2026-08-14 日志实证 + 双后端回归）

> 触发：v8/v8fix3/v8f 注入后游戏仍失败——turn_block 复合内全部节点执行但 m1 运动器
> （Add Uniform Basic Linear Motion Device 84）零帧 → outflow('done', m1, 0) 不触发 →
> 宿主链零帧 → 锁永不释放。日志 2026-08-14_13-55-55_2678 逐帧确认 head=3205 零帧。
> 三份日志（2675/2677/2678）帧分布逐字节一致 → 排除注入时序变量。

- **规则 1（core.ts connect）**：f.connect(compositeCallResult, 0, execNode, 0) 的 IR 边源
  必须是 composite call 的**真实 node id**。composite call 返回对象只有 __markerNodeId
  （无 id 属性）；connect 曾用 sourceRef.id（undefined）→ IR implEdges 源写成
  "undefined" → materialize Number("undefined")=NaN 找不到源 → **边静默丢弃**。
  修复：addEdge(current, sourceId, ...)（用已解析的 __markerNodeId）。
- **规则 2（materialize vendor 路径）**：synthetic→ordinary exec 边的目标**普通 exec 节点**
  必须有物理 InFlow pin（vendor 物化不生成 exec 节点的 flow pins；#11 只补了 compositePins
  覆盖的节点）。overlay 循环补 target InFlow pin（unshift 前插，flow pin 在前）。
- **规则 3（materialize legacy 路径同族）**：legacy-handwritten 后端同样缺目标 InFlow pin
  （buildImplNodePins 只生成 OutFlow）——S12 回归 legacy 模式实证，同补。
- **exec 链完整性判据**（turn_block 实证，注入副本 read 确认）：宿主 InFlow → doubleBranch(n2)
  → spin_block(n3) OutFlow(cpi=4) → store(n4) InFlow → store OutFlow(cpi=4) → m1(n5) InFlow[0]
  → m1 OutFlow[0]（done）→ 宿主 outflow 链。任一环缺 pin 或 connects 即断链。
- **回归**：tests/composite/test-composite-synthetic-to-ordinary-exec-edge.ts（IR + GIA 双层，
  vendor/legacy 双后端，红绿验证）；相关套件 9 项全 PASS。
- **状态**：自动回归通过、生产 GIA 重编译通过、副本注入 read 验证通过；
  **用户游戏验证通过（2026-08-14 15:21 日志 2679）**：m1 运动器 head=3205 4 帧（修复前 0 帧）、
  宿主链恢复（head=34/36/3a/3f 等）、定时器恢复（__gsts_timeout_N_index 写入）、锁释放可连续转动。

### 复合内事件节点 wire（2026-08-14 轮 12 差分 CONFIRMED）

> 证据：用户编辑器在 gsts_orbit_segment 复合内添加「自定义变量变化时」事件节点（未连线）并保存；
> before 6536e43a（v12 注入版）→ after aeb66738。root10 field4 impl 图 [3] 484B→513B nodes 3→4。

- **事件节点 = impl 图普通节点记录**：新节点 index=1（最小空闲索引分配，before 的 n2/n3/n4 不变）；
  genericId=36（When Custom Variable Changes）、**无 concreteId**、**0 pins**（未连线时无 OutFlow/
  OutParam，与"未配置 Variant 不落盘"规则同构）；有位置 x/y。
- **CompositeDef 无事件声明**：field2 12→12 不变——事件不产生 inflows/outflows 式 def 扩展。
- **compositePins 无事件映射**（5 条不变）；**宿主调用实例无变化**（4 pins 不变）。
- **连线后（轮 12b，after 3bcf2f61）**：事件节点 OutFlow[0] connects → {id:2, kind:1, index:0}
  （事件 → 运动器 InFlow[0]）——事件 OutFlow 连线后落盘；目标运动器**无物理 InFlow pin**
  （编辑器规范：exec 边靠 connects 驱动）。
- **触发语义（轮 12c 游戏实证，2026-08-14）**：编辑器保存版（含连线事件节点 + 无 flow pin）
  游戏完美通过——转动/定时器/锁释放全正常（日志 2681：m1 4 帧、__gsts_timeout 208 次）。
  自定义变量变化事件**未被触发**（用户测试未改变自定义变量，日志事件帧 0）——事件触发链
  的运行语义仍待专门测试（改变自定义变量 → 事件 OutFlow → 运动器）。
- **配置监听变量后（轮 12d，after d1c498a5）**：事件节点获得 **concreteId=36**（reflectMap 36 =
  Int 变体；监听变量类型决定变体）；输出 OutParam3/4（R<T> 旧值/新值）连线后落盘（OutParam0-2
  Ety/Gid/Str 未连线不落——"无 connects 不落盘"规则一致）；用户构建测试链：事件 OutFlow[0] →
  Set Custom Variable(22) InFlow[0]（变量名 ← 事件 OutParam2、新值 ← 事件 OutParam4、
  InParam4 Bol false=不触发事件）；目标 n6 无物理 InFlow pin（再次证实 connects 驱动）。
  监听变量名的配置字段不在 CLI 可见 pins 中（待用户面板核对或 raw 深挖）。
- **触发语义（轮 12f 日志实证，2026-08-14，完全闭合）**：主图 Set Custom Variable（触发事件=是，
  head=5f，IN4:Boolean=1）设置变量"测试"=666 → **复合全部实例的事件节点同时触发**（head=41/48/
  57/58 = 4 个 orbit_segment 调用实例）；事件节点两级帧 {N.04 子先 OUT, N.03 主后 IN0:Boolean=}
  （与图变量 get/set 同构），OUT 序列：Entity=2 / GUID=1077936138 / Str=变量名"测试" / R<T>=旧值
  （首次空）/ R<T>=新值 666 / Boolean=；事件 OutFlow → 内部 Set Custom Variable（IN4=空=不触发）
  → 无死循环。**监听边界**：图变量变化不触发（轮 12e），仅实体自定义变量（触发事件=是）触发；
  复合实例激活即监听（实例级监听器）。
- **生产实现完成（2026-08-14 #13，游戏验证通过）**：
  - DSL：build 内 f.on(eventName, (evt, ef) => {...})——复合 impl 图注册事件入口节点；
    evt 提供 eventSourceEntity/eventSourceGuid/variableName/preChangeValue/postChangeValue
    （与主图 ServerEventMetadata 同源）。
  - 编码：事件节点 = impl 普通节点（nodeType 事件名 → vendor genericId 36/concreteId 变体），
    OutParam 0-4 + OutFlow[0] connects → 回调节点；compositePins 仅 InFlow 映射主链头
    （事件节点不入 compositePins）。
  - generic pin 放宽：matchType/parseValue 对 generic pin（事件 R<T> 输出）放行标量具体类型
    （dict/_list 除外，需具体泛型）——主图事件同样受益。
  - 回归：tests/composite/test-composite-event-node.ts（IR+GIA 双层）；8 项套件无回归。
  - 提交：37d1e9b（生产支持）+ 92d6d77（rubik 演示链）。

### 大规模复合化与回归修复（2026-08-14 #14/#15，分层复盘）

> 用户标准：每层区域节点数 5~7，超限即复合化（哪怕单次调用）——维护/查错/布局收益。

- **#14 大规模复合化（a186e67）**：主图 155→116 节点——gsts_spawn_rubik（实体创建 70+ 节点 → 1
  调用，8×create_corner + b0-b7 变量）+ gsts_tab_lock（锁门）。主图 whenEntityIsCreated 区域 5 节点达标。
- **#15 回归修复（3d9a449，2685→2686 日志实证）**——两个生产缺陷：
  - **缺陷 1（f.node detached 链尾）**：f.node 注册的节点不自动连 tail（detached）；链尾节点
    必须显式 f.link（spawn 的 setB7 未 link → c7 后链断，blocks 永不设置——rec0 帧截断实证）。
    **规则**：复合 build 链尾动作节点优先用 f.registerExecNode/便捷方法（自动连），
    或 f.node + 显式 f.link。
  - **缺陷 2（OutParam 惰性求值）——生产语义缺口**：复合 return { x } 的输出 OutParam 在宿主
    消费时**重新求值**其引用的内部数据链（非调用时刻快照）。「读变量→写同一变量→输出派生值」
    必错（tab_lock 原设计 unlocked=equal(lock,false)：宿主 doubleBranch 消费时二次求值读到
    写入后的 lock → false → 不转动；rec1 两组 get+equal 实证）。
    **规则**：复合输出勿派生自会被复合内部写入的变量；条件动作用 **outflow 分支语义**
    （done 只在实际分支触发，宿主调用后无条件续链——锁着时 done 不触发自然不执行）。
  - **分层复盘**（用户要求三层检查）：①用法层——f.node 自动连/输出快照两个假设未验证就写
    （违反不猜原则）；②设计层——setNodeGraphVariable 返回 void 迫使 f.node+link 脆弱模式
    （待改进：返回 ref）；OutParam 惰性求值语义需文档化；③实现层——OutParam 求值时机与编辑器
    是否一致待差分验证（编辑器复合输出派生自被写入变量时的行为）；分支 outflow 编辑器对比
    （轮 10 只见过链尾无条件 outflow，分支条件 outflow 由 2686 游戏日志验证）。
  - **游戏验证（2686）**：tab_lock 单次求值（get→equal→true→真分支→set lock）→ done 触发 →
    宿主循环正常执行；8 块创建、转动、事件链、定时器全恢复。

### 复合输入→子复合调用参数（2026-08-14 轮 13 差分 CONFIRMED + #17 生产修复）

> 触发：v16 递归拆分引入「复合输入传给子复合调用参数」——orbit_step 的 c/s（capture）传
> orbit_point 调用 → 编辑器显示 NaN → 游戏无法启动（加载类型错误）。
> 差分：用户把 orbit_step 输入 c/s 连到 orbit_point 调用 c/s（after 862b635b）。

- **编辑器规则**：复合输入 → 子复合调用参数 = **compositePins 路由**——调用点（子复合）的
  capture InParam **物理 pin 不落盘**（after：orbit_point 调用只剩连接输入，c/s 无 pin）；
  compositePins 提供 outer InParam → 子复合调用 InParam 的路由。
- **生产缺陷（#17 根因）**：capture 输入是未赋值占位值，toIRLiteral() 返回 null——
  composite_registry 序列化按 null 占位处理（丢 capture 标记）→ 下游 classify 当 missing →
  子复合调用参数丢失（null/NaN）。**修复**：capture 占位保留 capture: true + 类型标记
  （与 conn 分支同构）→ classify 走 capture 路由 → compositePins 正确生成。
- **游戏验证（2688）**：turn_check capture 输入 IN1 有值（0/1，之前空）、velocity prep 链
  数值正确、转动/公转/事件链/定时器全正常。
- **编辑器保存副作用（用户澄清，与规则无关）**：修改复合输入参数定义（类型）会导致所有
  调用点的参数被重置为默认值（如 C1/S1 字面量清零）——编辑器改定义联动行为，不是
  参数传递规则的一部分；生产注入不受影响。

### 变体族覆盖差集与事件项（2026-08-14 系统扩展检查）
> DICT_KV_VARIANT_NODE_TYPES + usesSharedOrdinaryConcreteIdentity + gv/custom/local concrete）求差集

- **已纳管（差集补充，2026-08-14）**：create_dictionary / query_if_dictionary_contains_specific_key /
  query_if_dictionary_contains_specific_value / remove_key_value_pairs_from_dictionary_by_key
  → DICT_KV_VARIANT_NODE_TYPES（12 个）；覆盖测试 24→27 族全 PASS。
- **assembly 族**：已有 special-arg 处理（isAssemblySpecialArgNodeType），非缺口。
- **事件节点（when_custom_variable_changes / when_node_graph_variable_changes）**：
  **用户澄清：编辑器复合内可放事件节点（复合可包含一切节点，甚至整图打包成复合）**——
  生产 DSL 复合 build 无事件注册 API（g.server().on 是图级入口）＝**生产 DSL 知识/实现缺口**，
  不排除；**轮 12 差分已闭合 wire 形态（2026-08-14）**，见下方独立章节。
- **编辑器保存会丢注入 flow pin（2026-08-14 轮 12 实证，专门调查闭环）**：编辑器打开含注入
  复合的 .gil 再保存时，按编辑器规范重写 impl 节点 pins——**无 connects 的 flow pin 不落盘**
  （n2 InFlow0 / m1 InFlow0+OutFlow0 被丢弃；有 connects 的 n4 OutFlow0 保留）。
  **但游戏执行不受影响（轮 12c 游戏实证）**：编辑器保存版（flow pin 已丢）游戏完美通过、
  m1 运动器 4 帧执行——**exec 链由 connects 记录驱动，目标节点无需物理 InFlow pin**
  （与编辑器自建复合 impl 节点全无物理 flow pin 但正常一致）。
  **推论**：生产补的物理 flow pin 非必要但无害（编辑器会丢、游戏不看）；#12 游戏通过的关键
  = core.ts 边修复（IR 边存在 → connects 存在）。生产未来可对齐编辑器规范（不落裸 flow pin）。
- **观察项（低风险）**：复合输出 OutParam 的 ioc 用硬编码 concreteOutputIndex（bool→0/float→1/
  str→2/int→3，其他 default 0）——与 vendor 输出 ioc 可能不同（v5/v7 输出核验正常——运行时值
  不受影响）；待差分验证输出 ioc 编辑器值后决定是否对齐。

### 复现命令

```bash
# 图级差分（摘要 → --full 定点）
npx tsx tools/compare-gil-node-graph.ts "$BEFORE" "$AFTER" "$GID"
# 宿主实例 pin / 内部图 compositePins 定点 raw
npx tsx .agents/skills/editor-incremental-gia-investigator/scripts/extract-node-raw.ts \
  "$AFTER" "$GID" "$NODE" --pins
# root 10 容器 field2（CompositeDef）/field4（内部图）列表差分见 manifest v22-v30 各段
```

## 待逐步还原

- 混合型复合节点的控制流和数据流边界。
- 嵌套复合节点如何引用内部定义。
- 复合节点布局、接口顺序和连接的真实关卡编码。
- 内部节点在内部图中的连线与内部消费输入的方式（运行时绑定，wire 层已闭合，执行语义属游戏验证）。
- field203=6 语义、f2/f4 列表数量差（59 vs 29，可只读普查）。
- 实例 nodeIndex 重编号的空闲号池精确分配规律（v59→v60 已闭合：最小空洞含墓碑；
  新增节点分配器是否同源待验证）。
- 复合节点执行语义（共享输入/输出运行时行为、分支执行顺序，游戏验证范畴）。
