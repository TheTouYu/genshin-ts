# 复合节点

> 状态：框架草案
> 来源：用户对复合节点和编辑器布局的说明
> 最近校验：2026-08-01
> 适用范围：用户自定义复合节点的概念、接口和内部画布

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

## 待逐步还原

- 复合节点外部接口的定义结构。
- 多控制流输入和输出的内部映射方式。
- 数据参数如何跨越外部接口与内部画布。
- 混合型复合节点的控制流和数据流边界。
- 嵌套复合节点如何引用内部定义。
- 外层实例与内部画布之间的身份关系。
- 复合节点布局、接口顺序和连接的真实关卡编码。

## wire 编码（2026-08-06 v22-v30 真实相邻快照 CONFIRMED）

> 状态：当前推荐
> 来源：真实 GIL 相邻快照（composite-case1..8）+ 第三方 gia.proto 对照 + 既有复合普查
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
├── nodes=被包装节点原样搬入（保留 genericId/concreteId/pin，**无坐标字段**）
└── compositePins(4)：外壳 pin ↔ 内部节点 pin 的映射表
```

### 参数流定义（CompositeDef.inputs/outputs/inflows/outflows）

ParameterFlow（数据参数）与 ControlFlow（控制流）共用骨架：

| 字段 | 含义 |
|---|---|
| name(1) | 参数名（UTF-8，如"目标实体"） |
| visible(2) | 恒 1 |
| index(3) | NodePin.Index：数据={kind=3 InParam / 4 OutParam, ShellIndex 默认省略/非默认显式}；控制流={kind=2 OutFlow / 1 InFlow, 同规则} |
| type(4) | ParameterFlow 类型：Ety={type1=1, type2=1, class 省略}；Str={class=5 StringBase, type1=6, type2=6}；type2 恒=type1 |
| description(4) | ControlFlow 描述（常空） |
| pinIndex(8) | **全局唯一身份号**（跨复合递增分配，样本 47/48 连续；实例 pin 用 field7 引用它） |

### CompositePin 映射（内部图 compositePins）

```text
{outerPin(1)={kind, ShellIndex}, innerNodeId(2)=内部节点 nodeIndex,
 innerPin(3)={kind, ShellIndex}, innerPin2(4)=innerPin 双写}
```

- `outerPin` = 外壳 pin（顺序号：参数列表第 N 个 → ShellIndex=N）
- `innerPin` = 内部节点被绑定的真实 pin（身份：永远指向内部实际 Shell，如 target_entity=0、var_name=1）
- 映射按**参数身份**（名字）绑定，与参数列表顺序无关

### 调用侧（宿主图实例 pin）

与普通节点 pin 完全同构，仅多 `field7`：

```text
数据输入：i1/i2={kind=3 InParam, index=ShellIndex} + type=VarType +
  field7=pinIndex + （连线→connects / 填值→value，二选一）
控制流输出：i1/i2={kind=2 OutFlow, index} + connects→目标 + field7=pinIndex
```

- **惰性实例化**：只落被赋值/连线的输入；实例 pin 顺序=参数定义顺序、index=ShellIndex
- 连线：connects=[{id=源节点, connect={kind=4 OutParam, 源 ShellIndex 默认省略/显式}, connect2 双写}]（与 data-flow.md 普通连接一致）
- 填值：value=具体类型 base（如 StringBase{class=5, alreadySetVal, itemType, bString(105)="arst"}），无 connects

### 编辑器行为（v22-v30 逐轮单变化实测）

| 操作 | wire 变化 |
|---|---|
| 创建（包装节点） | 宿主图删原节点+加 SysGraph 实例；CompositeDef 追加（无参数流）；内部图追加（原节点搬入，无坐标） |
| 改复合名字 | 只写 CompositeDef.name(200)，实例/内部图不变 |
| 加输入 pin | CompositeDef.inputs 追加 ParameterFlow + 内部图 compositePins 追加映射 + 实例 nodeIndex 重编号 |
| 改参数名 | 只写 CompositeDef.inputs[].name(1)，内部图/实例/编号都不动 |
| 调用填值 | 实例新增 InParam pin（value 形态），定义层不动 |
| 调用连线 | 实例新增 InParam pin（connects 形态），定义层/内部图零感知（运行时绑定） |
| 交换参数顺序 | 三处联动：inputs 重排且 **ShellIndex 按新顺序重写（0,1…）**、pinIndex 保持、CompositePin outer 跟随而 **innerPin 保持内部真实 Shell**、实例 pins 跟随 |

**三个"号"各司其职**：ShellIndex=顺序号（交换时重写）；pinIndex=身份号（保持，实例 field7 引用）；
innerPin=内部真实 pin（保持）。实例 nodeIndex 在"修改 CompositeDef 结构"的保存后会重编号
（样本 3→5→6→7→8；主图连线不重建），规律与编辑器保存路径相关，未完全闭合。

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

- 复合节点外部接口的定义结构。
- 多控制流输入和输出的内部映射方式。
- 数据参数如何跨越外部接口与内部画布。
- 混合型复合节点的控制流和数据流边界。
- 嵌套复合节点如何引用内部定义。
- 外层实例与内部画布之间的身份关系。
- 复合节点布局、接口顺序和连接的真实关卡编码。
- 输出参数（outputs/OutParam 侧）的对称结构（2026-08-06 尚未实测）。
- 内部节点在内部图中的连线与内部消费输入的方式（运行时绑定，wire 层待观察）。
- field203=6、pinIndex 全局分配器位置、f2/f4 列表数量差（59 vs 29）。
- 实例 nodeIndex 重编号的确切触发条件。
