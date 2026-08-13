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
- 修复方向：复合路径改从图变量列表（IR 顶层 variables，type='dict'+dict{k,v} 子字段）取类型；
  argVarType→VarType.Dictionary(27)、argVarBaseClass→MapBase(10003)、makeVarBaseValue 按官方样本补
  itemType{kind:Pair,items{key,value}} + bMap + ConcreteBase 包装（indexOfConcrete 待查表）。

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
