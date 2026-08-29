# 节点图与拓扑

> 状态：部分已验证
> 来源：真实 GIL 相邻快照（node-graph-systematic 2026-08-05 v1-v12 + 2026-08-06 v13-v21）+ 第三方仓库 data.json/gia.proto 对照 + 用户编辑器说明与游戏核验
> 最近校验：2026-08-06
> 适用范围：节点图的概念结构、新建图/节点实例编码、批量注入（SysCall 基础节点）

节点图是关卡逻辑的主要载体。一个节点图包含各种节点，以及节点之间的控制流和数据流连接。节点图必须挂载在实体或元件上才能运行，详见[节点图挂载与生命周期](graph-mounting.md)。

## 核心组成

```text
节点图 = 事件 + 节点 + 拓扑结构
```

### 事件

事件是逻辑的执行起点，例如：

- 实体创建时；
- 变量变化时；
- 收到信号时。

事件触发后，执行沿控制流连接进入后续节点。

### 节点

节点表示一个操作、判断、查询或计算。节点通过不同种类的引脚接收执行流、输出执行流、接收参数或输出数据。

除普通控制流节点和数据流节点外，用户还可以定义[复合节点](composite-nodes.md)。复合节点在外层表现为一个节点，打开后进入独立内部画布，并且可以继续嵌套。

参数类型见[参数类型](parameter-types.md)，两类连接分别见[控制流](control-flow.md)和[数据流与连接](data-flow.md)。

### 拓扑结构

控制流节点相互连接，形成逻辑脉络。执行从事件开始，沿分支、循环和普通执行节点移动，最终在没有后续连接的位置结束。

## 布局原则

节点坐标不只影响外观，也影响人能否读懂图。复杂逻辑通常采用竖向、分叉的“叉子状”布局，而不是把所有节点排成一条很长的直线。用户也可以按类型或职责把节点放在画布的不同区域。

外层节点图和每个复合节点内部都是独立画布。坐标只在所属画布中表达位置；打开复合节点后，看到的是它自己的内部布局，而不是外层画布的延伸。

```text
事件
  │
  ├── 分支 A
  │     ├── 子步骤 A1
  │     └── 子步骤 A2
  │
  └── 分支 B
        └── 子步骤 B1
```

布局应帮助读者看出事件、主干、分支和终点。布局规则与执行语义需要分别记录：节点位置变化不应被误认为逻辑变化。

## 节点实例编码（SysCall 基础节点，真实快照 v1-v6）

实验：`genshin-ts-evidence/node-graph-logic/node-graph-systematic/2026-08-05-systematic-v1/`，地图 1073741849 图 1073741835「学习专用」。

### 节点身份（NodeProperty）

```text
genericId = concreteId = NodeProperty{
  1: NodeOrigin = 10001
  2: NodeCategory = 20000      # ENTITY_NODE_GRAPH 常量
  3: NodeKind = 22000          # SysCall 家族
  5: 节点 ID（类型目录编号）
}
```

第三方 `data.json` 的 `SystemConstants.GRAPH_CATEGORY_CONSTS.ENTITY_NODE_GRAPH` 与 wire 逐字段对齐
（GraphOrigin=10000 / GraphCategory=20000 / GraphKind=21001；NodeOrigin=10001 / NodeCategory=20000 /
NodeKind=22000；COMPOSITE_NODE_DECL.GraphKind=21002）。节点身份编码 CONFIRMED。

**Variant 节点 concreteId = 选中变体的 KernelID（2026-08-06 v9-v11 + v18 + v21 快照 + data.json `Variants` 表闭环）**：

- Fixed 节点：`concreteId = genericId = 节点 ID`（编辑器保存后保留）；
- Variant 节点：`concreteId = 选中变体的 KernelID`；**未配置变体时 concreteId 不落盘**（9 个
  Variant 节点保存后 concreteId 全缺失）；
- 实例验证：337 获取节点图变量连 Int → concreteId=339，切 Str → 342（data.json 337 的
  `Variants`：`C<T:Int> KernelID=339` / `C<T:Str> KernelID=342`）；3 多分支选 Int → 3，
  切 Str → 4；node 23 获取自定义变量连 Int 目标 → 50；node 18 是否相等手动选 Int → 370；
- **手动选型与连线自动实例化同构**（v21 vs v18）：concreteId 缺失→KernelID +
  **所有 R<T> 数据 pin 实例化**（i1/i2 index=ShellIndex 默认省略/非默认显式、type 跟随、
  无 connects）；**固定类型 pin 不实例化**（v21：是否相等 result Out Bol 不落盘）；
- 实例化 pin 的 value=ConcreteBase(class=10000, alreadySetVal=true) +
  `bConcreteValue.indexOfConcrete = TypeSelectorIndex`（data.json `Variants` 列表 0-based
  位置；0 省略：50 Int=0，非 0 显式：337 Int=2/Str=5、14 Int=5）+
  value={class: 具体类型 base, itemType:{classBase:Server, type_server:{type: VarType}}}；
- 连线时若 Variant 未配置，编辑器**按目标 pin 类型自动选型**并实例化（v18：node 23 连
  Int 目标 → concreteId=50 C<T:Int> + OutParam Int），随后正常挂 connects；
- 变体切换联动：pin `type`（3=Int→6=Str）、`value.bConcreteValue.f1 = TypeSelectorIndex`
  （337 Int=2/Str=5，多分支 Int=0 省略/Str=1）、cases 列表类型（IntegerList=8→StringList=11）
  全部跟随变体；
- **已连线 Variant 改类型（v22 实测）**：源侧联动重写（concreteId=新 KernelID、R<T> pin
  type/value/indexOfConcrete 跟随），**类型不匹配的线自动断开且目标 InParam pin 整个移除**
  （不只是 clears connects，与"替换线改 connects.id"对照：替换是改 id，类型失效是删整 pin）；
- 推论：批量注入写 `concreteId=ID` 对 Variant 节点是冗余（编辑器保存会移除，Fixed 保留）；
  游戏/编辑器显示不依赖它（434 节点注入核验通过）。signals.md 既有记录

### 多分支（SysCall 3）实操场景（2026-08-09 tab-input-multibranch 快照闭合）

编辑器放置多分支 + key 数据流 + case 出边的完整落盘（地图 1073741849 `_GSTS_tab-input`，
证据 `~/genshin-ts-evidence/node-graph-logic/tab-input-multibranch/raw/`）：

- **节点创建**：f2/f3 引用 `{1:10001, 2:20000, 3:22000, 5:3}`（generic=concrete=3，Int
  变体 KernelID=3，与工具 `nodeRefWire(3, 22000)` 构造一致）；两个 InParam 落盘：
  `[0]` key（type=3 Int，ConcreteBase，connects 挂目标侧←事件 Int），`[1]` cases
  （type=8 IntegerList，ConcreteBase 空列表）；未连线前无 OutFlow pin；
- **key 数据流**：`connects=[{1:1, 2:{1:4,2:2}, 3:{1:4,2:2}}]`（id=源 nodeIndex，kind 4
  OutParam index=2 = When Tab Is Selected 的 Int 输出）；
- **case 出边**：Case1 = OutFlow[1]（index=1 显式）→ 目标默认 InFlow（省略 index）；
  默认分支（若连线）= OutFlow[0]（index 省略）——与 control-flow.md 规则一致；
  未连线的 case 不实例化 OutFlow pin；新 OutFlow 排在 InParam 前；
- **cases 列表值**：条目结构见 data-flow.md；bInt(102) 的 val 在字段 1。
  （获取局部变量 str=2656/int=20/bool=18）即 KernelID，与 data.json 一致。
- **Str 变体（cid=4，2026-08-09 param-turn Q2 真实快照 log.add n35 闭合）**：key/cases
  的 ConcreteBase `bConcreteValue.f1=1`（Str 在 reflectMap 位置 1）；key pin 无 f4 type
  字段；cases = ConcreteBase + ArrayBase{class=10002} + bArray{entries=StringBase 条目×N}，
  每条目 `{1:5, 2:1, 4:itemType{1:1,100:{1:6}}, 105:bString{1:val}}`；f4=11（StringList）
- **跨图复制 Variant 节点（2026-08-09 Q2 一次性脚本）**：提取 donor 节点 raw → 改
  f1=新 nodeIndex/f5/f6=pos → 改引脚字节（key connects.id、cases 条目、OutFlow connects）
  → 注入目标图 nodes 组（升序插入）；未做成正式 op，需要时临时脚本

### 节点 ID 目录（第三方 data.json，558 节点）

节点 ID 是全局 SysCall 目录编号（不连续）：

| ID | 中文名（用户声明 + data.json 一致） | Identifier | Domain |
|---|---|---|---|
| 70 | 创建实体 | Execution.Entity_Related.Create_Entity | Execution |
| 71 | 实体创建时 | Trigger.Entity_Related.On_Created | Trigger |
| 252 | 创建元件（Create Prefab） | Execution.Entity_Related.Create_Prefab | Execution |

查看目录：`python .agents/skills/editor-incremental-gia-investigator/scripts/extract-node-defs.py <data.json> --list`。

### 未配置节点（无参数/无连线）

```text
42B：{1: nodeIndex, 2: genericId(13B), 3: concreteId(13B), 5: x(fixed32), 6: y(fixed32)}
```

- nodeIndex 从 1 开始；**新增节点 = 最小空闲空洞**，但**删除造成的空洞不复用**
  （node-add-case2 v57→v58：node 3 删除后新增取 4 而非 3；node-add-case1 空洞 3..10
  从未分配过故取 3；空图新增取 1 即 append，是其特例）——删除号墓碑是编辑器会话内
  内存态，快照不可见，工具需在同一命令序列内跟踪；**nodes 数组按 nodeIndex 升序
  插入/删除**（node-del-case1 v56→v57：删除 = 移除记录，def 记录不删），其余记录逐字节
  不动（新增 +44B / 删除 -44B）；**新增节点不落盘默认 pin**（打印字符串有默认参数
  也 pinCount=0，node-add-case2）
- x/y = float32（fixed32 wire）；坐标由编辑器画布位置决定
- 无 pins 字段落盘（实例 pin 仅在赋值/连接时生成）

### 参数实例 pin（NodePin，v5-v6 样本）

给参数赋固定值后，节点插入 pins 容器（f4），每条 NodePin：

```text
NodePin {
  i1: NodePin_Index{kind:3(InParam) / 4(OutParam), index: 定义 ShellIndex}   # index=0 时 wire 缺失
  i2: NodePin_Index{kind:同 i1, index: ?}                 # 数据连接样本中 i1==i2；252 pin4/5 不等，语义未闭合
  value: VarBase{
    class: 1=IdBase / 2=IntBase / 5=StringBase / 6=EnumBase / 7=VectorBase / 10000=ConcreteBase / 10002=ArrayBase
    alreadySetVal: true
    itemType: {1: classBase(1=Server), 100: {1: VarType}}
    oneof: 101=bId / 102=bInt / 105=bString / 106=bEnum / 107=bVector{1:{1:x,2:y,3:z}} ...
  }
  type: VarType 数字（21=Pfb / 12=Vec / 4=Bol / 3=Int / 6=Str / 8=IntegerList / 11=StringList）
}
```

**R<T> 泛型 pin 固定值（2026-08-09 param-turn Q3 闭合；裸 VarBase 游戏不识别显示为空）**：

```text
VarBase{ class=10000(ConcreteBase), alreadySetVal=true,
  bConcreteValue(110){ indexOfConcrete=reflectMap 位置(0 省略), value=具体 VarBase } }
```

具体 VarBase（StringBase 例）：`{1:5, 2:1, 4:itemType{1:1,100:{1:6}}, 105:bString{1:val}, 4:6}`
（尾随 f4=VarType 码；EnumBase 例无 alreadySetVal，见 平滑反弹面y n31 pin[2]）。
真实快照：run.main n43（Equal Str，indexOfConcrete 省略）、平滑反弹面y n31/n34（Set Bol
indexOfConcrete=2）、n50（Set Flt=1）、param-turn n32（Equal Str 省略）。indexOfConcrete
= reflectMap 0-based 位置（Set Str=3、Get Str=5、Equal Str=0、MultiBranch Str=1）。
CLI param op 对 R<T> pin 自动包装（reflectConcreteIndex 查位置）。

**数据连接（DataOut→DataIn，普通图 SysCall，2026-08-06 v10-v21 快照 CONFIRMED）**：

- 连接挂在**目标侧 InParam** pin 上：`connects=[{1: id=源节点 nodeIndex, 2: connect={kind:4 OutParam}, 3: connect2={kind:4 OutParam}}]`；
- 源 OutParam index=0 时 connect/connect2 均无 index 字段（2B 形态 `08 04`）；源非默认显式源 ShellIndex；
- 源侧：Fixed 源只实例化 OutParam pin（i1/i2={kind:4} 无 index），**不挂 connects**（与 signals.md 监听消费一致）；
  一源多目标源仍不落盘；**Variant 源连线时自动实例化**（concreteId=目标类型 KernelID + OutParam pin）；
- 目标侧：多 pin 目标新增 pin 按 ShellIndex 升序插入数组（v19 实测）；已有线被新线**替换**（connects.id 改写，
  不新增 pin，v18 实测）；
- 实例：337.value OutParam → 3.key InParam：目标 key `connects=[{1:1, 2:{1:4}, 3:{1:4}}]`；
- 列表参数值：`ArrayBase(class=10002)` + `bArray(109)` 元素列表，cases 三元素 [1,2,3] →
  IntBase bInt 1/2/3；[a,b,c] → StringBase bString a/b/c；

- **i1.index 与第三方 data.json 的 ShellIndex 完全对齐**（252 实测 0,1,2,5,6）→ 参数顺序裁决
  以 data.json（v2.2.10）为准；game_nodes.ts md 注释版已过时
- bool=false 编码 = EnumBase + bEnum 空消息（true = bEnum{1:1}，见 signals.md）
- SysCall 固定节点 InParam 无 compositePinIndex（仅 SysGraph 有 CPI）
- 解码工具：`scripts/inspect-graph-nodes.py <map.gil> <graphId> --pins`

### 新建节点图 wire 配方（真实快照 v1 / v7-v8）

新建图 = 两个原子变化（编辑器原生行为，注入时同构复刻）：

```text
root 10 末尾追加一条 field 1 记录（双层包装 field1 -> field1 -> NodeGraph）：
  NodeGraph = {1: Id, 2: name(UTF-8), 3: nodes[*]}
  Id        = {1: 10000(GraphOrigin), 2: 20000(GraphCategory), 3: 21001(GraphKind), 5: 图ID}
  node      = {1: nodeIndex(1..N 连续), 2/3: NodeProperty{1:10001,2:20000,3:22000,5:节点ID},
               5/6: x/y fixed32(float32)}
root 6（f1=4 记录）的 f2.f4（「调试」文件夹）末尾追加 f5={1:800, 2:图ID}   # 800 = server 图 folder 值
```

- 图 ID 全局分配（与图外对象共用 ID 池）：编辑器新建图会跳过已占用 ID（v1：1830→1835，
  1831-1834 被非图对象占用）；脚本注入取已用 ID max+1（1836+），空洞/内存池规则未闭合
- 图名仅存于 NodeGraph.name 单处；节点创建不碰 root 6 folder（v2-v4 证据）
- root 46 等长变化 = 编辑器保存副作用，不模拟；root 10 field4 的 field106 同理
- **GIL header 长度字段必须同步**（见 gil-structure-semantics.md），否则游戏报文件损坏

### 客户端图 20010（CharacterControlSkill）wire 配方（2026-08-29）

来源：1073741914 真实相邻快照 v0（`cdcb56d0…`）→ v1（`45267e07…`），编辑器新建
「角色操控技能」图并保存；/tmp 同构重放后 root 6/10 与 after 逐字节一致。
`CONFIRMED`（真实编辑器观察 + 同构重放 + `tools/list-gil-node-graphs.ts` 回读 type=20010/nodeCount=1）。

```text
root 10：在最后一张既有图 field 1 记录之后（field 2 之前）插入一条 field 1 记录：
  记录 value = {1: NodeGraph}                        # 双层包装
  NodeGraph = {1: Id, 2: name(UTF-8), 3: nodes[1], 100: entrySlotIndex=1}
  Id        = {1: 10000(UserDefined), 2: 20010(CharacterControlSkill), 3: 21001(NodeGraph), 5: 图ID}
  node[0]   = 节点图开始（编辑器自动生成，nodeCount=1 非空）：
              nodeIndex=1
              genericId  = {1:10001(SystemDefined), 2:20002(Skills), 3:22000(SysCall), 5:200042}
              concreteId = {1:10001, 2:20002, 3:22000, 5:2001}
              contextDeclaration(f8) = {1: kind=6(ClientSignal)}
root 6：重写「未分类页签」聚合 record（本图 folderId=67），其 f3 末尾追加：
  f5 = {1: 7400, 2: 图ID}                            # 7400 = client 图 20010 folder typeValue
```

- 编辑器默认图名 = `新建角色操控技能节点图`（CLI 的 name 参数可替换）。
- folder typeValue 真实样本（2026-08-29 相邻快照，已补入 `src/injector/folder.ts` 的
  `DEFAULT_GRAPH_TYPE_VALUES`）：

  | 图类型 | 名称 | folder typeValue |
  |---|---|---|
  | 20000 | 服务端 BasicNode | 800 |
  | 20001 | 布尔过滤器 BooleanFilter | 2100 |
  | 20002 | 角色技能 Skills | 2200 |
  | 20003 | 状态 StatusNode | 2300 |
  | 20004 | ClassNode | 2400（代码，未采样） |
  | 20005 | ItemNode | 4300（代码，未采样） |
  | 20006 | 整数过滤器 IntegerFilter | 6300 |
  | 20007 | 造物状态决策 CreationStatusDecision | 6600 |
  | 20008 | 造物技能 CreationSkill | 6700 |
  | 20009 | 造物状态 CreationStatus | 6800 |
  | 20010 | 角色操控技能 CharacterControlSkill | 7400 |
  | 技能配置资产 | skill config | 7500 |

  不同图类型落在不同「未分类页签」folder record：**folderId 是类型级常量**（1073741914 与
  参考图 1073741913 两张地图一致；该记录在 v0 基线中已作为空记录存在，新建图=重写空记录追加
  条目，编辑器从不创建新 folder 记录）。20000→4、20001→13、20002→14、20003→15、20006→57、
  20007→58、20008→59、20009→60、20010→67、技能配置 7500→68、2800→12、6900→61。
- 客户端图 ID 与 server 图 ID 分属不同数值段（1082130xxx vs 1073741xxx）：连续建 20010→20002
  依次取 1082130433 → 1082130434（+1 递增）；参考图 20010 为 1082130436。跨类型/跨保存的
  全局分配与复用规则未闭合，CLI 建图按显式 `--graph-id` 处理。
- **空图自动节点因图类别而异**（2026-08-29 快照 v1/v5 逐字节复核）：
  - 技能类（20002 角色技能 / 20008 造物技能 / 20010 角色操控技能）：自动节点 = 节点图开始
    `genericId.nodeId=200042 / concreteId.nodeId=2001` + `contextDeclaration f8={1:6}`，
    NodeGraph 带 `entrySlotIndex(f100)=1`。
  - 造物状态 20009：自动节点 = `genericId.nodeId=200126 / concreteId.nodeId=4000` +
    额外 f11={1:1, 20:{1:1}}，`f100=1`。
  - 过滤器类（20001 布尔 / 20006 整数）：自动节点 = 过滤节点（20001→`genericId.nodeId=200000`，
    20006→`genericId.nodeId=200122`）**带 concreteId.nodeId=2001** + 参数块（f4×2，值因类型而异）
    + `f100=1`，NodeGraph 另带 `evaluationInterval(f101)=0.3`（fixed32，官方文档默认值）。
    （2026-08-29 复核修正：早期笔记「无 concreteId、无 f100」与真实字节不符——v5 快照
    record[13]/[14] 逐字节确认两者均存在。）

## 精准修改工具（2026-08-08）

`gsts assets:node-graphs read|patch` 提供记录级精准读-改-写：位置、参数固定值、
数据/控制流连线、复合改名与参数改名（已闭合规则）；节点增删、复合接口结构变更、
Variant 自动实例化等未闭合规则 fail closed。操作与证据见
[`docs/architecture/gil-node-graph-edit.md`](../architecture/gil-node-graph-edit.md)，
回归为 `tests/gil_nodegraph_edit_test.ts`（真实快照同构重放，逐字节断言）。

## 批量注入（一图多节点，2026-08-05 已闭环 434 节点）

工具：`scripts/create-graphs.py`（skill 目录），每批一个图、网格排列（默认 5 列，
dx/dy 可调）；`--all-server` 枚举 data.json 全部 Server 节点（ID 升序）自动分批，
`--graph-id` 指向已有图时自动排除图中已有节点 ID 并补齐。详见
`node-graph-creation.md`。

- 样本-01..09（1073741836-44）：50×8 + 34 = 434 节点 = data.json 全部 Server 定义
  （Fixed 376 + Variant 58 + Hidden 13；Hidden/Variant 编辑器显示行为待用户观察记录）
- 用户游戏核验通过（2026-08-05）：无显示异常；Variant/Hidden 具体行为反馈待补充
- 注入前必须确认游戏/编辑器已关闭（编辑器内存不感知磁盘变化，打开期间注入后保存会覆盖）

## 待闭合

- i2.index 语义（数据连接样本 i1==i2 一致，252 样本 5/7 不等；疑为 UI/定义内部序，需更多样本）
- 普通图 SysCall 的基础 FlowOut→FlowIn wire 已闭合：连接挂源 OutFlow、默认 index 省略、
  非默认 OutFlow[1]/[2]/[3]/[4] 显式保留 index、目标 GraphNode 不变（详见[控制流](control-flow.md)）
- Variant 选型对已连线的联动已闭合（2026-08-06 v22）：先连线后手动改类型 → 源联动重写 +
  类型不匹配的线自动断开 + 目标 InParam pin 整个移除（见上）
- 更高源 OutFlow index（>4）与游戏执行语义（游戏验证范畴）

## 待逐步还原（剩余）

- 不同节点图类型允许使用的节点范围。
- 编辑器自动布局或规范化字段。

## 节点图数量上限（2000，2026-08-27 用户更正定稿）

> 更正记录：2026-08-21 曾按游戏拒载实验定为 3000；2026-08-27 用户明确「单个节点图数量不能超 2000 不是 3000」——引擎在 3000+ 时拒载（4043/3270 实证），但**生产红线是单图 ≤2000**（用户 2026-08-24 定义的 engineExpanded ≤2000 口径，本页统一为 2000）。

游戏启动时按**单个节点图**统计"节点图数量"（不是地图总量、不是实体挂载合并、不是全部图展开总和），
超过 2000 即超生产红线（引擎 3000+ 拒载）。实测公式（10/10 回归通过，4 快照点零误差）：

```
gameNodeCount = (28/11) * mainExpanded - (761/1056) * implTotal - 39343/66
```

- `mainExpanded`：根图递归展开节点数（每个复合实例展开一份 impl，含嵌套）
- `implTotal`：从根图**可达**的 impl 图展开之和（不可达复合不计；H:304 → I/J/K:400）
- M 系数 28/11 由两次"干净实验"锁定（仅新增未连线复合实例、impl 图集合不变：Δactual/ΔM = 224/88）
- implTotal 负系数 -0.72 与常数 -596.1 暂无物理直觉，待"只改变可达性"实验单独验证
- 统计实现：`src/cli/static_assembly/graph_edit.ts` 的 `compositeNodeBudget` / `predictGameNodeCount`；
  回归：`examples/rubik-3x3/tools/node-count-regression.ts`；快照：`snapshot-state.ts` + `diff-state.ts`
- 嵌套统计已全量核对自洽：expand = direct + Σ(嵌套 expand × 实例数)（33 图全过）
