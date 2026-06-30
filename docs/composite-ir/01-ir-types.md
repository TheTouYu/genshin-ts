# 复合节点 IR 类型定义

覆盖：CompositeDefIR、CompositePinEntry、CompositeCallMeta、compositeDataEdges、CompositeCapture、SignalDef、structureDef。

## 1. CompositeDefIR — 复合节点定义

**类型定义**: `src/runtime/IR.d.ts:233-249`

```json
{
  "name": "整数加法",
  "id": 1610700000,
  "type": "composite",

  "inflows":      [ /* ControlFlowDef[] */ ],
  "outflows":     [ /* ControlFlowDef[] */ ],
  "inputs":       [ /* ParamFlowDef[]  */ ],
  "outputs":      [ /* ParamFlowDef[]  */ ],

  "implNodes":    [ /* ServerNode[] — 实现图的节点 */ ],
  "implEdges":    { /* Record<number, NextConnection[]> — 执行连线 */ },
  "compositePins": [ /* CompositePinEntry[] — 内外引脚映射 */ ],
  "implVariables": [ /* Variable[]（可选） */ ]
}
```

### 1.1 接口定义字段：inflows / outflows / inputs / outputs

#### ControlFlowDef（执行流引脚）

```typescript
interface ControlFlowDef {
  name: string      // 名称
  visible: boolean  // 是否可见
  index: number     // 在该类别中的序号（从 0 开始）
  pinIndex: number  // Pin Index 值
}
```

| 场景 | inflows | outflows |
|------|---------|----------|
| 纯数据复合（无 exec 节点） | `[]` | `[]` |
| 基本执行型（单 InFlow + 单 OutFlow） | `[{ pinIndex:1974 }]` | `[{ pinIndex:4 }]` |
| 多 OutFlow | `[{ pinIndex:6 }]` | `[{ pinIndex:8 }, { pinIndex:9 }, ...]` |
| 信号型（inflows=0, outflows>0） | `[]` | `[{ ... }]` |
| **终端下沉型**（inflows>0, outflows=0） | `[{ ... }]` | `[]` |

> ⚠️ **2026-06-30 更新**：上述 pinIndex 值（1974/4/8-11/6）是 `toCompositeDefIR()` 的硬编码默认值**仅对 gsts 生成的复合有效**。游戏编辑器创建或用户编辑的复合使用编辑器分配的值：
> - `docs/architecture/composite/ir-representation.md` 中的常量表描述的是 **gsts 编译器的默认值**
> - 我们用 3 个真实 GIA 文件（传球/弹球/物理运动）验证：**所有 97 个复合无一个使用这些默认值**
> - 例如 传球.gia 中 InFlow 实际值: 982, 1280, 1291, 1316, 2514（非 1974 或 6）
> - 三条源码 `complexgia/` 文件中无任何复合 ID 在 `1610700000+` 空间——它们都来自游戏编辑器，非 gsts 生成
>
> **关键约束是两端的值必须一致，而非具体数值。**

> 见 [docs/architecture/composite/ir-representation.md](../architecture/composite/ir-representation.md) §1 ControlFlowDef（gsts 默认值）和验证脚本 `tools/_verify-arch-claims.ts`。

#### ParamFlowDef（数据引脚）

```typescript
interface ParamFlowDef {
  name: string
  visible: boolean
  index: number
  type: ValueType
  pinIndex: number   // InParam 默认 100+index, OutParam 默认 200+index
  dict?: { k: DictKeyType; v: DictValueType }
  enum?: string
}
```

**代码中的默认分配**（`composite_registry.ts:120-129`）：
```typescript
PIN_INDEX_INPUT_BASE = 100   // → 100, 101, 102, ...
PIN_INDEX_OUTPUT_BASE = 200  // → 200, 201, 202, ...
```

### 1.2 实现图字段：implNodes / implEdges

#### implNodes

与主图 `nodes` 使用相同的 `ServerNode` 结构（`IR.d.ts:77-81`）：

```typescript
export type ServerNode = {
  id: number        // 运行时捕获阶段的原始 ID
  type: string      // 节点类型（如 "addition"、"print_string"）
  args?: Argument[] // 参数列表
  position?: [number, number]
  next?: NextConnection[]
}
```

**关键规则**：
- 节点包含 `execNodes` 和 `dataNodes` 的并集
- 包含特殊节点 `__composite_capture__`（输入占位）和 `__composite_call__`（嵌套调用）
- 数据连接 → `{ type: "conn", value: { node_id, index, type } }`
- 字面量 → `{ type: "int", value: 42 }`

**impl 节点 pin 规则**（基于真实文件验证）：
- 仅在 **有内部连线** 时才需要物理 pin
- 纯由 compositePins 路由的不需要物理 pin（经常见 `pins: []`）
- 有内部连线 → `pins=1+`

#### implEdges

```json
{ "3": [4] }
```

键是源节点 ID，值是 `NextConnection[]`。仅记录 exec 连接（数据连接通过 args 隐式表达）。

### 1.3 CompositePinEntry — 内外引脚映射表

复合节点最核心的路由表。

```typescript
interface CompositePinEntry {
  outerPinKind: number   // 1=InFlow, 2=OutFlow, 3=InParam, 4=OutParam
  outerPinIndex: number  // 外部引脚在该类中的索引
  innerNodeId: number    // 内部节点 ID（重编号后的 nodeIndex）
  innerPinKind: number   // 内部引脚种类
  innerPinIndex: number  // 内部引脚在该类中的索引
  innerPin2?: NodePin_Index  // protobuf 编码中与 innerPin 值相同
}
```

> **innerPin2**：在 GIA protobuf 编码中，每条 compositePins 映射额外有一个 `innerPin2` 字段，值与 `innerPin` 完全一致。这是 protobuf 编码的冗余要求，在 IR JSON 中语义上不需要，但在 GIA 编码时必须存在（参见 `src/compiler/ir_to_gia_transform/composite.ts:164-167`）。

> 四类映射：

| outerPinKind | 名称 | 出现条件 | 数量 |
|:-----------:|------|---------|:----:|
| 1 | InFlow | 有 exec 节点 | 1~N 条（可**扇出**到多个内部节点，物理运动中有 InFlow 扇出 10 条的复合） |
| 2 | OutFlow | 有 exec 节点 | 1~N 条 |
| 3 | InParam | 有输入参数 | 1~N 条（同一输入可 fanout 多条，物理运动中有 17 条 InParam 映射的复合） |
| 4 | OutParam | 有输出参数 | 1~N 条 |

**完整示例**（条件+数据复合）：

```json
{
  "compositePins": [
    { "outerPinKind": 1, "outerPinIndex": 0, "innerNodeId": 3, "innerPinKind": 1, "innerPinIndex": 0 },
    { "outerPinKind": 2, "outerPinIndex": 0, "innerNodeId": 3, "innerPinKind": 2, "innerPinIndex": 0 },
    { "outerPinKind": 2, "outerPinIndex": 1, "innerNodeId": 3, "innerPinKind": 2, "innerPinIndex": 1 },
    { "outerPinKind": 3, "outerPinIndex": 0, "innerNodeId": 3, "innerPinKind": 3, "innerPinIndex": 0 },
    { "outerPinKind": 3, "outerPinIndex": 1, "innerNodeId": 4, "innerPinKind": 3, "innerPinIndex": 0 },
    { "outerPinKind": 3, "outerPinIndex": 1, "innerNodeId": 4, "innerPinKind": 3, "innerPinIndex": 1 },
    { "outerPinKind": 4, "outerPinIndex": 0, "innerNodeId": 4, "innerPinKind": 4, "innerPinIndex": 0 }
  ]
}
```

**关键特性**：一个外部 InParam 可以 fanout 到多个内部节点 pin（同一输入多处消费）。

### 1.4 生成规则

`toCompositeDefIR()`（`composite_registry.ts:114-248`）：

1. **inputs/outputs**：从声明转换，pinIndex = base + index
2. **inflows**：有 exec 节点 → 1 条
3. **outflows**：根据 `leafMarks` 或 `outflowExitNodes` 数量
4. **implNodes**：execNodes + dataNodes 合并，参数转 IR 字面量或连接
5. **compositePins**：
   - InFlow → 首个 exec node 的 InFlow
   - OutFlow → 遍历 leafMarks 或 outflowExitNodes
   - InParam → 扫描所有内部节点 arg 中的 `__captureInputName`
   - OutParam → 读取 outputValues 中每个值的 metadata

---

## 2. CompositeCallMeta — 复合调用元数据

**类型定义**: `src/runtime/IR.d.ts:271-280`

```typescript
interface CompositeCallMeta {
  compositeId: number          // 引用的 CompositeDef.id
  markerNodeId: number         // 主图中 __composite_call__ 标记节点的 ID
  implNodeIds: number[]        // 从复合定义复制来的实现节点 ID 列表
  compositePinEntries: CompositePinEntry[]  // 引脚映射
}
```

> **当前状态**：`CompositeCallMeta` 在 IR JSON 中尚未实际使用。调用关系通过 `compositeDataEdges` 和 `__composite_call__` 标记节点隐式表达。

---

## 3. compositeDataEdges — 复合数据连线

**注入位置**: `core.ts:1574-1576`

```json
[
  {
    "fromNodeId": 3,
    "fromPinIndex": 0,
    "toMarkerId": 5,
    "toPinIndex": 0
  }
]
```

| 字段 | 含义 |
|------|------|
| `fromNodeId` | 数据源节点 ID |
| `fromPinIndex` | 源节点的 OutParam 索引 |
| `toMarkerId` | 目标 `__composite_call__` 节点的 ID |
| `toPinIndex` | 目标复合的 InParam 索引 |

**记录条件**：仅当数据来源节点来自另一个复合的输出（`nodeType === '__composite_call__'`）时记录。普通节点→复合的数据连线由标准 dataConnections 处理。

---

## 4. CompositeCapture — 运行时捕获

**类型定义**: `src/runtime/composite_registry.ts:37-57`

内存中的捕获结果，不在 IR JSON 中直接出现：

```typescript
type CompositeCapture = {
  execNodes: MetaCallRecord[]          // 执行节点
  dataNodes: MetaCallRecord[]          // 数据节点
  edges: Record<number, NextConnection[]>  // 执行连线
  outputValues: Record<string, value>  // build() 返回值（含 pin 元数据）
  isPureData: boolean                  // 是否纯数据
  outflowExitNodes?: number[]          // 多出口节点 ID 列表
  leafMarks?: Record<number, number>   // leaf(outflowIndex) 标记
}
```

**捕获过程**（`core.ts:1487-1543`）：首次生成 IR 时，系统为每个复合定义创建临时注册表，执行 build 函数，自动记录节点和连线。

---

## 5. SignalDef — 信号发送定义

> 来源：`04-validation-signal.md §7`，来自 `实用/log系统.gia` 的发现。

SignalDef 是一种与 CompositeDef 平级的 accessory 类型（`which=14`），用于定义自定义信号的发送接口。

### 接口定义

```typescript
interface SignalDef {
  name: string           // 信号名称
  id: number             // 唯一 ID
  relatedIds: number[]   // 关联的 CompositeDef ID
  inflows: ControlFlowDef[]
  outflows: ControlFlowDef[]
  inputs: ParamFlowDef[]
  outputs: ParamFlowDef[]
}
```

**与 CompositeDef 的关键区别**：

| 属性 | SignalDef (which=14) | CompositeDef (which=12) |
|:----|:-------------------:|:-----------------------:|
| 有 impl 图 | ❌ 无（信号是内置的） | ✅ 有 |
| `relatedIds` | ✅ 关联到监听信号 CompositeDef | ❌ 通常为空 |
| `id.type` | `0 (ServerGraph)` | `20000 (CompositeGraph)` |
| 有效负载字段 | `compositeDef.inner.def`（仅接口声明） | `compositeDef.inner.def`（接口声明 + impl 节点） |
| 对应的附件图 | ❌ 无 `which=9` 附件 | ✅ 有一个 `which=9` 附件 |

### 已知实例（来自 `log系统.gia`）

| ID | 名称（来自文件） | 关联 CompositeDef | inputs |
|:--:|:--------------:|:-----------------:|:------:|
| 1610612807 | 向服务器节点图发送信号 | 监听log信号 (1610612806) | 已同步数量/总数量/定时器实体/msgs实体/数据列表/索引列表 |
| 1610612891 | 向服务器节点图发送信号 | 监听计时器信号 (1610612890) | 事件名称/msg/日志操作/i |

### relatedIds 关联机制

SignalDef 通过 `relatedIds` 与其对应的"监听信号"CompositeDef 关联：

```
SignalDef "log信号发送器" (id=1610612807, which=14)
  relatedIds[0] → CompositeDef "监听log信号" (id=1610612806, which=12)
```

> **注意**：`relatedIds` 也用于 structureDef（`which=29`）来聚合操作同一结构体类型的 CompositeDef，参见下节及 `06-advanced-patterns.md §1`。

---

## 6. structureDef — 结构体类型注册表

> 来源：`06-advanced-patterns.md §1`，来自 `实用/log系统.gia` 的发现。

structureDef（`which=29`）是一种注册结构体类型的 accessory，定义 struct 数据类型的字段结构。用于配合拼装/拆分/修改结构体的 CompositeDef。

### 接口定义

```typescript
interface StructureDef {
  structName: string                // 结构体名称（如 "字符串超列表"）
  classBase: number                 // 基础类（1=IdBase）
  index: number                     // 结构体索引（从 2 开始，0/1 为系统保留）
  itemCount: number                 // 字段数 + 1
  genericField: { vars: StructureDefField[] }    // 字段定义列表
  connectField: { vars: StructureDefField[] }    // 连接器字段定义（与 genericField 一致）
}

interface StructureDefField {
  name: string       // 字段名称（如 "列表1"）
  name2: string      // 字段名称副本（目前与 name 一致）
  type: number       // 字段类型（如 11=StringList）
  index: number      // 字段索引（从 2 开始）
}
```

### ID 特征

- `id.type = 15 (StructureDefinition)` — 独立的 ID 命名空间
- `index` 从 2 开始计数（0 和 1 为系统保留）

### relatedIds 聚合

structureDef 通过 `relatedIds` 聚合所有操作该 struct 类型的 CompositeDef：

```
structureDef "字符串超列表" (id=1077936139, which=29)
  ├── relatedIds → 拼装结构体 ×4 (10输入→1输出)
  ├── relatedIds → 拆分结构体 ×4 (1输入→10输出)
  └── relatedIds → 修改结构体 ×1 (22输入→0输出)
```

一个 struct 类型在 GIA 中由三部分构成：
1. **structureDef** — 类型注册表（定义字段）
2. **拼装/拆分/修改 CompositeDef** — 操作定义
3. **调用处的数据连线** — 运行时数据流

> 更多使用上下文参见 `06-advanced-patterns.md §1`（structureDef 详情）和 `06-advanced-patterns.md §2`（struct 三操作复合）。

---

## 7. 生成规则

> 原 §5 的内容（`toCompositeDefIR()` 生成规则）。
