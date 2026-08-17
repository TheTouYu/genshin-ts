# 数据流与连接

> 状态：框架草案
> 来源：用户对游戏编辑器和关卡结构的说明
> 最近校验：2026-08-06
> 适用范围：参数来源、数据节点和数据引脚连接

数据流描述一个参数值从哪里产生、经过什么处理，以及最终进入哪个节点输入。实体级变量、节点图级变量和局部变量的可见范围见[变量与作用域](variables.md)。

## 参数来源

### 直接填写

适合编辑器允许直接输入的值，例如数字、文字、布尔值或向量。

```text
直接值 → 控制流节点的参数输入
```

服务器发送信号节点中，`int`、`float`、`vec3`、`str`、`bool`、`guid`、`prefab_id` 和 `config_id` 的固定值编码已经通过真实相邻 GIL 快照验证。它们共享参数 pin 骨架，但使用各自的 VarType 和 value 字段，详见[信号](signals.md)。

### 从数据流节点获取

数据流节点接收输入、执行查询或计算，并输出新的数据。例如：

```text
两个向量 → 向量加法 → 速度参数
当前节点图 → 获取自身实体 → 实体参数
实体 → 获取位置 → 位置或方向计算
```

数据流节点本身通常不决定执行脉络，而是为事件或控制流节点提供参数。变量读取也可以成为数据来源，变量设置则可能同时依赖控制流时机和数据流输入。`Ety` 参数连线已闭合（ety-wire-case1：与普通数据线完全同构，type=1）；**Ety 无固定值**（动态值，游戏未启动时无值，只能由节点输出获取，编辑器不支持直接填写）。

## 基本连接规则

```text
输入数据 → 数据节点处理 → 输出数据 → 下游参数输入
```

连接双方必须使用兼容的[参数类型](parameter-types.md)。连接不仅需要指出来源节点和目标节点，还需要指出来源输出和目标输入。

### wire 编码（普通图 SysCall 数据连接，2026-08-06 v10-v21 + dataflow-case1-4 真实快照 CONFIRMED）

```text
目标侧 InParam pin 挂 connects（f5）：
  connects = [{1: id=源节点 nodeIndex, 2: connect, 3: connect2}]
  connect / connect2 = NodePin_Index{1: kind=4(OutParam)}，源 OutParam index=0 时无 index 字段
目标 InParam 的 i1/i2 index=ShellIndex：默认（Shell 0）缺失、非默认显式（case1: preset_index=1，
case2: scale=1/preset_value=2，case4: target_entity=0 缺失）
type 落盘（Int=3、Flt=5、Ety=1）；无默认值时不落 value
Fixed 源 OutParam **不实例化**（case1/2/4：默认与非默认源、一源多目标、缺号源侧 bytes 全不变）；
Variant 源连线时自动实例化（v18）：concreteId=目标类型 KernelID + OutParam pin（属变体选型，见 node-graphs.md）
connect/connect2 指向源 OutParam：源默认（Shell0）省略 index，源非默认显式源 ShellIndex
（case2: 拆分三维向量 y Shell=1 → connect.index=connect2.index=1）
**多 pin 目标新增 pin 按 ShellIndex 升序插入数组**（case4: 已有 1/2 时补 0 号插头部，非尾部追加）
**替换语义**（case3）：目标 InParam 已有线时，新线改写该 pin 的 connects.id（不新增 pin/connects）
```

- 例：337 获取节点图变量 value → 3 多分支 key：目标 key
  `connects=[{1:1, 2:{1:4}, 3:{1:4}}]`（id=源 nodeIndex 1）；
- 列表参数值（如多分支 cases）：`ConcreteBase` 内 `ArrayBase(class=10002)` + `bArray(109)`
  元素列表，`type` = 列表 VarType（8=IntegerList / 11=StringList）；
  **cases 条目结构**（2026-08-09 tab-input-multibranch 快照闭合）：条目 =
  `{1:2, 2:1, 4:{1:1, 6:{2:3}}, 102:{1:val}}`——`102` 是 `IntBaseValue`（bInt），
  **val 在字段 1**（`IntBaseValue { int32 val = 1 }`，gia.proto）；条目末尾追加新值
  只需克隆末条并把 `102.{1}` 改为新 key 值；
- 变体切换（Int→Str）联动：concreteId=新 KernelID、pin type、`value.bConcreteValue.f1`
  = TypeSelectorIndex、列表元素类型全部同步（详见 node-graphs.md）；
- 跨类型数据直连（如 Int→L<Int>）被编辑器拒绝（用户游戏内确认，2026-08-06），需先手动
  改 Variant 类型再连线；
- 完整解码样例见 `inspect-graph-nodes.py <map.gil> <graphId> --pins`。

## 输出复用

### 单节点多连线

一个数据节点的输出连接多个下游节点：

```text
          ┌→ 下游 A
数据节点 ─┼→ 下游 B
          └→ 下游 C
```

优点是节点少；缺点是连线多时不容易阅读。

### 多节点单连线

复制多个相同数据节点，每个节点只服务一个下游：

```text
数据节点 A → 下游 A
数据节点 B → 下游 B
数据节点 C → 下游 C
```

节点数量更多，但局部结构更清晰。两种方式在语义上是否始终等价，需要按节点是否纯查询、是否有状态或副作用分别验证。

### 单节点输出多消费的二次求值陷阱（缺陷 6，2026-08-16 闭合）

> 验证层级：真实 Beyond_Debug_Log 逐帧铁证（日志 2723 rec643：7→8→9 直接 win）+ 代码绕行已游戏核验

**规则**：服务端 DSL 中一个**纯数据表达式**（`f.addition`/`f.multiplication`/`f.equal` 等读型节点）的
结果被 **≥2 个调用消费**时，引擎在**每个消费点重新求值**该表达式（data 节点连线不是值快照）。
若表达式输入来自图变量，且两次消费之间发生了对该变量的写入，第二次求值会读到**新值**，
一次逻辑被重复计算。典型事故形态（读-算-写-判）：

```ts
const count = f.getCustomVariable(self, new str('winCount')).asType('int')
const next = f.addition(count, 1)
f.setCustomVariable(self, new str('winCount'), next, false)  // 写入 winCount
f.equal(next, WIN_TARGET)  // ⚠️ 引擎重新求值 addition，基于 set 后的新 count → 多计一次
```

**绕行模式（代码侧，已核验）**：set 之后**重新 get**，比较用独立读取：

```ts
f.setCustomVariable(self, new str('winCount'), next, false)
const after = f.getCustomVariable(self, new str('winCount')).asType('int')
f.doubleBranch(f.equal(after, WIN_TARGET), ...)
```

**工具链侧（2026-08-16 交付）**：ESLint 规则 `gsts/server-repeated-evaluation`（推荐配置 warn）
检测服务端作用域内「纯数据表达式 const 被 ≥2 个 f.* 调用消费」，命中即提示先 set 后 get 或保证
单次消费。注意该规则是保守告警：纯读型双消费（消费之间无写入）实际无害，也会被警告。

## 与控制流的关系

控制流决定“什么时候执行”；数据流决定“执行时使用什么值”。一个完整逻辑通常同时包含两者：

```text
事件 ──控制流──→ 执行节点
                    ↑
数据源 ──数据流─────┘
```

## 待逐步还原

- 普通数据节点的身份、输入、输出和值结构。
- 数据输出连接到控制流节点参数的编码（普通 SysCall 已闭合；事件节点、复合节点待验证）。
- 一个输出连接多个消费者时的存储顺序和语义（一源多目标已闭合：各目标各挂 connects、源不落盘）。
- 相同数据节点复制后的身份和布局规则。
- 查询节点、计算节点、有状态节点和有副作用节点的边界。
- 列表、结构体和字典在数据流中的创建、拆分和连接。
- 执行语义（数据值在 fork/分支中的实际求值时机，游戏验证范畴）。
