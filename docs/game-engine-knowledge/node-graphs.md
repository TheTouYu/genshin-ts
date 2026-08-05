# 节点图与拓扑

> 状态：部分已验证
> 来源：真实 GIL 相邻快照（node-graph-systematic 2026-08-05 v1-v6）+ 第三方仓库 data.json/gia.proto 对照 + 用户编辑器说明
> 最近校验：2026-08-05
> 适用范围：节点图的概念结构、节点实例编码、SysCall 基础节点身份

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

- nodeIndex 从 1 开始，同图内连续递增；新增节点 = nodes 数组 append（图记录 +44B）
- x/y = float32（fixed32 wire）；坐标由编辑器画布位置决定
- 无 pins 字段落盘（实例 pin 仅在赋值/连接时生成）

### 参数实例 pin（NodePin，v5-v6 样本）

给参数赋固定值后，节点插入 pins 容器（f4），每条 NodePin：

```text
NodePin {
  i1: NodePin_Index{kind:3(InParam), index: 定义 ShellIndex}   # index=0 时 wire 缺失
  i2: NodePin_Index{kind:3(InParam), index: ?}                 # 语义未闭合（v6: 5/7 与 data.json Kernel 不对齐）
  value: VarBase{
    class: 1=IdBase / 2=IntBase / 6=EnumBase / 7=VectorBase ...
    alreadySetVal: true
    itemType: {1: classBase(1=Server), 100: {1: VarType}}
    oneof: 101=bId / 102=bInt / 106=bEnum / 107=bVector{1:{1:x,2:y,3:z}} ...
  }
  type: VarType 数字（21=Pfb / 12=Vec / 4=Bol / 3=Int）
}
```

- **i1.index 与第三方 data.json 的 ShellIndex 完全对齐**（252 实测 0,1,2,5,6）→ 参数顺序裁决
  以 data.json（v2.2.10）为准；game_nodes.ts md 注释版已过时
- bool=false 编码 = EnumBase + bEnum 空消息（true = bEnum{1:1}，见 signals.md）
- SysCall 固定节点 InParam 无 compositePinIndex（仅 SysGraph 有 CPI）
- 解码工具：`scripts/inspect-graph-nodes.py <map.gil> <graphId> --pins`

### 待闭合

- i2.index 语义（疑为 UI/定义内部序，需更多样本）
- 控制流连接在 SysCall 节点上的实例化（OutFlow pin 规则见 signals.md，普通图内连线待验证）

## 待逐步还原（剩余）

- 不同节点图类型允许使用的节点范围。
- 编辑器自动布局或规范化字段。
