# GIA 编码：复合节点的二进制/JSON 结构

> 状态：已验证
> 来源：当前代码实现 + 自动回归 + 真实 GIA 验证 + 用户游戏内验证
> 最近校验：2026-07-30
> 适用范围：gsts 当前 Stage 3 复合节点 GIA 编码。pinIndex 默认值仅适用于 gsts 生成输出，真实编辑器文件需看 composite-ir 验证文档。

> 本文档描述 `CompositeDefIR` 如何在阶段三被编码为 GIA 文件中的 accessories（附件数据段）——包括 CompositeDef 定义、impl NodeGraph、引脚构建细节和布局算法。
> 参见：[IR 表示](./ir-representation.md) | [管线追踪](./pipeline-flow.md) | [阶段三 GIA 编码](../stage3-ir-to-gia.md) | [关键 ID 对照（composite-ir/05）](../../composite-ir/05-gia-encoding.md)

---

## 1. 整体结构

每个 `CompositeDefIR` 在 GIA 的 `root.graph.relatedIds` 和 `accessories` 中产生一对 `GraphUnit`：

```
accessories (GraphUnit[]):
  ├── [0] CompositeDef GraphUnit (which: CompositeGraph)
  └── [1] impl NodeGraph GraphUnit (which: EntityNode)
```

每个 `CompositeDefIR` 在 `accessories` 中必须原子地产生这一对 `GraphUnit`。当前
`irToGia()` 逐定义调用 `buildCompositeAccessories()`；每次先完整构建一对附件，成功后才追加。
任一定义的 impl 节点无法解析或编码失败时，会抛出
`GSTS-COMPOSITE-ACCESSORY-BUILD-FAILED`（含 Composite 名称和 ID），而不是返回 GIA。legacy/shared
共用的 impl identity 阶段会拒绝无法解析为节点类型 ID 的普通节点，避免 legacy 静默编码
`genericId.nodeId=0`；这里不限制 `nodeIndex` 或其他允许为 0 的 protobuf 字段。自动回归见
`tests/composite/test-stage3-composite-accessory-fail-fast.ts`；该回归必须分别运行默认 shared 和显式
legacy 后端。

### 结构关系图

```
┌─────────────────────────────────────────────────────────────┐
│ accessories[0]: CompositeDef GraphUnit                        │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ compositeDef.inner.def: CompositeDef                    │  │
│  │  ├── id: { genericId, concreteId, graphId }            │  │
│  │  ├── inflows: [InFlow pin defs]                        │  │
│  │  ├── outflows: [OutFlow pin defs]                      │  │
│  │  ├── inputs: [InParam pin defs]                        │  │
│  │  ├── outputs: [OutParam pin defs]                      │  │
│  │  ├── type: { kind: Composite }                         │  │
│  │  └── name: "Triple"                                    │  │
│  └────────────────────────────────────────────────────────┘  │
│  relatedIds: [{ id: <implGraphId> }]                         │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ accessories[1]: impl NodeGraph GraphUnit                      │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ graph.inner.graph: NodeGraph                           │  │
│  │  ├── id: { ... CompositeGraph, id: <implGraphId> }     │  │
│  │  ├── nodes: [GraphNode, GraphNode, ...]                │  │
│  │  │    ├── nodeIndex                        ← 1-based   │  │
│  │  │    ├── genericId/concreteId              ← SysCall  │  │
│  │  │    ├── pins: [InParam, OutParam, OutFlow]           │  │
│  │  │    ├── x/y：布局坐标                    ← computed  │  │
│  │  │    └── usingStruct: []                              │  │
│  │  ├── compositePins: [outerPin ↔ innerPin]              │  │
│  │  ├── comments: []                                      │  │
│  │  ├── graphValues: []                                   │  │
│  │  └── affiliations: []                                  │  │
│  └────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. CompositeDef 结构

### ID 三元组

```typescript
id: {
  genericId:  { class: SystemDefined, type: Server, kind: SysGraph, id: <def.id> },
  concreteId: { class: SystemDefined, type: Server, kind: SysGraph, id: <def.id> },
  graphId:    { class: UserDefined,   type: BasicNode, kind: CompositeGraph,
                id: <def.id + 10000> }
}
```
- `genericId`/`concreteId` 使用 `SysGraph` kind 标识复合定义类型
- `graphId` 使用 `CompositeGraph` kind + `def.id + 10000`

### 引脚定义

四种引脚类型分别映射为 GIA protobuf 结构。类型信息通过 `typeClassFromValueType` 和 `typeIdFromValueType` 映射：

```typescript
inputs: [{
  name: "x",
  visible: true,
  index: { kind: InParam, index: 0 },
  type: {
    class: IntBase,     // typeClassFromValueType('int') → 2
    type1: Integer,     // typeIdFromValueType('int') → 3
    type2: Integer,
    valueId: null
  },
  pinIndex: 100       // PIN_INDEX_INPUT_BASE + 0
}]
```

bool 参数还必须携带枚举类型元数据，input 和 output 使用相同规则：

```typescript
type: {
  class: EnumBase,     // 6
  type1: Boolean,      // 4
  type2: Boolean,
  enumId: { val: 1 }, // protobuf field 101
  valueId: null
}
```

`enumId.val` 描述复合接口的枚举类型；调用 pin 上的 `value.bEnum.val` 才是实际
`false/true` 值。两者不可互相替代。真实 `user_edit/变量/bool.gia` 缺失 field 101 后再编码，游戏中的 bool 参数控件会显示为空白异常；补回 `enumId.val=1` 后已于 2026-07-11 完成游戏验证。

普通 decoded JSON 可能因 schema 缺失字段而无法展示这种差异。该问题通过 wire 扫描定位到
`CompositeDef.ParameterFlow.Type` 的 `aa06020801`，因此协议调查必须包含 unknown-field 或
round-trip 检查。

### type.kind

`CompositeDef_Type_Kind` 固定为 `Composite`（值为 0，是唯一有效的复合类型）。

---

## 3. impl NodeGraph 内部结构

### 3.1 一对 GraphUnit 的 ID 关联

#### 3.1.1 复合输出到普通节点的主图连接

主图中 `__composite_call__` 的输出代理携带 OutParam metadata。若输出继续连接 `setLocalVariable`、比较节点或 `split3dVector` 等普通节点，该边不能交给普通 Graph pin 的 materializer 校验，因为复合调用节点的 OutParam 是 overlay pin。

当前 Stage 3 将来源为 `__composite_call__` 的数据边分离处理，直接建立复合 OutParam 到普通目标 InParam 的 GIA connection；其余普通数据边继续使用 `materializeOrdinaryGraphEdges()`。回归文件为 `tests/timer_composite_output_types_test.ts`，并已完成 GIA 生成和游戏内验证。

每个复合定义在 `accessories` 中占用连续的两个 GraphUnit：

| Index | which | 内容 | id 规则 | relatedIds |
|-------|-------|------|---------|------------|
| 0 | `CompositeGraph` (12) | CompositeDef 定义 | `class=23, id=<def.id>` | `[{class=5, id=<implGraphId>}]` ← 指向 impl 图 |
| 1 | `EntityNode` (9) | impl 节点图 | `class=5, id=<implGraphId>` | **`[{class=23, id=<calledDef.id>}, ...]`** ← **指向被调用的子复合** |

**关键约束**：`CompositeDef.graphId.id` 必须等于 `EntityNode` 的 `id.id`，否则游戏无法定位 impl 图。

`EntityNode` 的 `relatedIds` 必须列出该 impl 图内所有 `kind=22001 (SysGraph)` 节点所指向的 CompositeDef ID。这是游戏识别"这个复合调用了哪些子复合"的唯一依据。缺失此链接会导致子复合调用节点在编辑器中显示为"空壳"。

参考示例（来自 `user_edit/嵌套.gia`）：

```json
// 创建复合节点 的 impl GraphUnit
{
  "id": { "class": 5, "type": 0, "id": 1610612738 },
  "relatedIds": [
    { "class": 23, "type": 0, "id": 1610612737 }  // ← "加法" 的 CompositeDef.id
  ],
  "which": 9,
  "graph": { ... }
}
```

### GraphNode 列表

```typescript
{
  nodeIndex: 1,              // 从 1 开始的连续编号
  genericId: {
    class: SystemDefined,
    type: Server,
    kind: SysCall,
    nodeId: <vendor node ID>  // 通过 resolveImplNodeId() 解析
  },
  concreteId: { ... },        // 与 genericId 相同
  pins: [NodePin, ...],       // InParam/OutParam/OutFlow 引脚
  x: 0, y: 0,                // 布局坐标
  usingStruct: []
}
```

### compositePins 映射

```typescript
compositePins: [{
  outerPin: { kind: InParam, index: 0 },        // 复合外部的第 0 个 InParam
  innerNodeId: 1,                                 // 内部节点 1（重新编号后）
  innerPin: { kind: InParam, index: 0 },          // 内部节点的第 0 个 InParam
  innerPin2: { kind: InParam, index: 0 }          // 冗余副本
}]
```

`innerNodeId` 使用重新编号后的值（`nodeIndexMap.get(entry.innerNodeId)`）。

---

## 4. Pin 构建细节

`buildImplNodePins()` (`composite.ts:464`) 为每个 impl 节点构造引脚列表。

### 4.1 InParam 引脚

对于 args 中的每个参数：

- **字面量 arg** → `buildLiteralPin()` 构建带具体值的 pin：
  ```typescript
  // int 字面量
  { i1: { kind: InParam, index: 0 }, i2: { kind: InParam, index: 0 },
    value: { class: IntBase, alreadySetVal: true, itemType: {...},
             bInt: { val: 42 } },
    type: Integer }
  ```

- **conn arg** → 根据 IR 连接携带的真实 `conn.type` 构建占位 pin（值用默认 0/""），再在构建阶段最后填充 `connects`：
  ```typescript
  // 例如 float conn 输入 addition / greater_than 时，必须生成 FloatBase，不能按节点默认推成 IntBase
  { i1: { kind: InParam, index: 0 }, i2: { kind: InParam, index: 0 },
    value: { class: FloatBase, alreadySetVal: false, itemType: {...} },
    type: Float }
  // 后在主循环中填充: pin.connects = [{ id: <mappedUpstreamId>,
  //   connect: { kind: OutParam, index: <upstreamPinIndex> },
  //   connect2: { kind: OutParam, index: <upstreamPinIndex> } }]
  ```

大多数非边界 capture 输入不生成物理 InParam pin，但仍占用原始参数序号。Stage 3 跳过 capture 参数时必须保留 pin index 空洞；例如 `get_custom_variable(capturedEntity, name)` 的实体参数占 `InParam[0]`，变量名应编码到 `InParam[1]`，不能压缩到 index 0。

当 capture 输入被当前复合的 `compositePins` 直接指向时，不能套用上述过滤规则：必须在内部 GraphNode 上保留与边界类型一致的物理 InParam pin，再由 `compositePins` 建立外部参数到该 pin 的映射。该规则适用于普通算术、比较、逻辑、向量等数据节点；`data_type_conversion_*` 仍使用其专用 concrete 类型映射。回归见 `tests/composite/reproduce-digital-parameter-operators.ts`、`tests/composite/survey-composite-scalar-families.ts` 和 `tests/composite/survey-composite-vector-families.ts`。当前自动回归已覆盖 legacy 与 vendor impl graph 路径；尚未进行游戏内验证。

有一个重要例外：当 `data_type_conversion_*` 的 capture 输入被当前复合的 `compositePins` 直接指向时，真实编辑器 GIA 会保留类型化的物理 InParam，并同时生成该转换节点的 OutParam。这个 pin 不是由 `compositePins` 凭空创建的；缺失时，外部参数路由和下游数据边都会指向不存在的物理 pin，游戏运行可能失败。当前 Stage 3 会为这种边界 DTC 保留物理 pin，并对其执行物理 pin 完整性检查。回归见 `tests/composite/test-stage3-bool-boundary-dtc-physical-pins.ts`。

同一规则适用于 impl 中的嵌套 `__composite_call__`：`args[0]` 仍是子复合 ID，`args[1..]` 中只有非 capture 输入生成物理 InParam；`capture: true` 输入保留逻辑 input index，并仅通过 impl Graph 的 `compositePins` 路由。针对性回归见 `tests/composite/test-nested-composite-capture-pins.ts`。

这里的逻辑 input index 是**被调用复合的声明输入索引**，不是 `args` 数组下标，也不是外层复合的
输入索引。例如外层 `input[0]` 传给子复合声明中的第二个参数时，IR 绑定位于 `args[1]`，携带
`compositeInputIndex: 1`，而父 impl 的 `compositePins` 为
`outer InParam[0] -> nested InParam[1]`。三层连续 capture 路由由
`tests/composite/test-three-level-nested-capture-routing.ts` 同时覆盖默认 shared 和显式 legacy 后端；
这是自动结构证据，尚不表示游戏内验证。

### 4.2 边界物理 pin 完整性

`compositePins` 记录的是外部 pin 到内部节点 pin 的映射，不会替内部节点创建 `NodePin`。因此对必须有物理 pin 的边界路由，编码器需要同时检查：

```text
outer InParam → impl node InParam
impl node OutParam → downstream data edge
```

当前生产编码对 `data_type_conversion_*` 的复合边界输入启用这项检查；其他 capture、稀疏输入和终端节点仍保留各自的物理 pin 空洞兼容规则。`build_composite_pins.ts` 的通用检查器仍可通过 `requirePhysicalPins` 为完整 pin 集合的专项回归启用。

证据分层：真实 `bool参数-导出版本.gia` 与最初编辑器参考都包含 bool→int 转换节点的 bool InParam 和 int OutParam；坏的 gsts 候选该节点 pins 为空。`tests/composite/test-stage3-bool-boundary-dtc-physical-pins.ts` 从 `irToGia()` 公共入口同时检查 decoded 结构与 raw protobuf oneof presence；`gsts.composite-bool-boundary-dtc.config.ts` 可独立生成 `tests/composite_bool_parameter_reference_repro.ts` 的候选 GIA。2026-07-17，用户导入 `bool参数-gsts修复版.gia` 后确认游戏测试通过；该游戏证据覆盖本例 bool→int→float→string 复合参数链，不自动推广到所有 capture 节点族。

### 4.3 VarBase 值字段命名规则

构建 VarBase 值时，protobuf 字段名由 `varClass` 决定（对应 `gia.proto` 中 `oneof value` 的字段名）：

| varClass | VarBase 枚举值 | protobuf 字段名 | proto 行号 | 示例 |
|----------|----------------|----------------|-----------|------|
| `IdBase` | 1 | `bId` | 101 | `bId: { val: 0 }` |
| `IntBase` | 2 | `bInt` | 102 | `bInt: { val: 42 }` |
| `FloatBase` | 4 | `bFloat` | 104 | `bFloat: { val: 3.14 }` |
| `StringBase` | 5 | `bString` | 105 | `bString: { val: "hello" }` |
| `EnumBase` | **6** | **`bEnum`** | **106** | `bEnum: { val: 1 }` — **不是 `bBool`!** |
| `VectorBase` | 7 | `bVector` | 107 | `bVector: { val: { x:0, y:0, z:0 } }` |
| `StructBase` | 10001 | `bStruct` | 108 | `bStruct: { items: [] }` |
| `ArrayBase` | 10002 | `bArray` | 109 | `bArray: { entries: [] }` |

当前 `makeVarBaseValue` 已覆盖：IdBase(1)、IntBase(2)、FloatBase(4)、StringBase(5)、EnumBase(6)、VectorBase(7)。
**StructBase(10001)、ArrayBase(10002)、MapBase(10003) 尚未覆盖** — 遇到这些类型时需补全对应的 `bStruct`/`bArray` 字段，否则值会丢失。

> 注意：VarBase.Class 枚举值不连续（1,2,4,5,6,7），`FloatBase=4` 而非 3。
| `VectorBase` (8) | `VarType.Vector` (12) | `bVector` | `bVector: { val: { x: 0, y: 0, z: 0 } }` |

**关键陷阱**：EnumBase（bool）的 protobuf 字段名是 **`bEnum`**（`gia.proto:396`），不是 `bBool`。`buildLiteralPin` 和 `makeVarBaseValue` 都必须使用字段名 `bEnum`。

### 4.3 bConcreteValue 包裹

特定节点类型（`data_type_conversion_*`、`addition`、`equal`、比较运算、逻辑运算等）需要 InParam 的 value 被 `bConcreteValue` 包裹：

```typescript
// 无包裹
value = { class: IntBase, bInt: { val: 42 } }

// 有包裹（concreteWrappedNodeTypes）
value = {
  class: 10000,           // ConcreteBase
  alreadySetVal: true,
  bConcreteValue: { indexOfConcrete: 0,
    value: { class: IntBase, bInt: { val: 42 } }
  }
}
```

`needsConcreteWrapping()` 检查节点类型是否属于 `concreteWrappedNodeTypes` 集合或 `data_type_conversion_*` 前缀。

对于 concrete-wrapped 节点，`indexOfConcrete` 必须使用具体值类型，而不是 pin index。当前 gsts 复合 impl 编码使用的常见映射为：

| 方向 | bool | float | str | int |
|---|---:|---:|---:|---:|
| 普通 concrete InParam | 0 | 1 | 2 | 3 |
| 普通 concrete OutParam | 0 | 1 | 2 | 3 |

`data_type_conversion_*` 的输入/输出仍有自己的 concrete map 规则：输入按 DTC map（如 guid→str 使用对应 GUID 项），输出目标 str 使用目标类型对应索引。不要把 `NodePin.index` 或 `compositePins.innerPinIndex` 当成 `indexOfConcrete`。

### 4.3 vec3 节点的特殊处理

vec3 节点（`_3d_vector_addition`、`create_3d_vector` 等）的占位 pin 需要 `VectorBase` 类型：

```typescript
if (vec3NodeTypes.has(nodeType)) {
  varType = VarType.Vector
  varClass = VarBase_Class.VectorBase
}
```

vec3→float 节点（`_3d_vector_dot_product`、`_3d_vector_angle`）的自动 OutParam 需要特殊处理，输出类型从 vec3 改为 float。

### 4.4 OutParam 引脚构建

优先使用 `implOutParamMap`（来自 compositePins 的 OutParam 条目）。显式 OutParam 映射中的 `innerPinIndex` 只决定内部节点的 OutParam pin index；`value.bConcreteValue.indexOfConcrete` 必须按输出类型计算。例如 `addition(float, float)` 作为复合输出时，OutParam pin index 仍可为 `0`，但 concrete index 必须是 `float -> 1`，否则下游 `_3d_vector_zoom` 等 float 输入会在游戏内断线。

若节点无显式 OutParam 映射但自身是数据生产者（`isDataProducerNode`），自动生成一个默认 OutParam。当前实现会扫描 impl 内全部 `conn.value.type`，建立 source node/pin → value type 索引；若输出直接暴露为复合 OutParam、没有普通下游连接，则回退到 `implOutParamMap`。

`get_custom_variable` 使用该类型选择 typed `concreteId`，并复用 vendor typed-node pin 模板。例如 `asType('float')` 生成 `genericId=50`、`concreteId=54`、ConcreteBase float OutParam（`indexOfConcrete=4`）；guid/int 分别使用 `concreteId=53/50` 和 concrete index 3/0。回归脚本见 `tests/composite/test-custom-variable-impl-pins.ts`；`设置物理参数` 复刻已于 2026-07-10 完成游戏内验证。

```typescript
if (!hasExplicitOutParam && pins.length > 0 && isDataProducerNode(node.type)) {
  // 推断输出类型、添加 OutParam pin
}
```

`isDataProducerNode` 规则：
- `needsConcreteWrapping` 为 true 的节点
- vec3 节点
- 以 `get_` 开头（但排除 `get_node_graph_variable`）

### 4.5 OutFlow 引脚

从 `implEdges[node.id]` 检测，按 `source_index` 分组，每组创建一个 OutFlow pin：

```typescript
pins.push({
  i1: { kind: OutFlow, index: srcIdx },
  i2: { kind: OutFlow, index: srcIdx },
  type: 0, value: undefined
})
```

这些 OutFlow pin 的 `connects` 随后在 `buildImplGraphNodes` 主循环中填充。

### 4.6 Connect 填充

数据连线填充：遍历 `allDataConns`，为每个 pin 设置 `connects`：

```typescript
pin.connects = [{
  id: mappedUpstreamId,     // nodeIndexMap 映射后的目标节点 ID
  connect: { kind: OutParam, index: upstreamPinIndex },
  connect2: { kind: OutParam, index: upstreamPinIndex }
}]
```

控制流连线填充：遍历 `outEdges` 分组，为每个 OutFlow pin 设置：

```typescript
outFlowPin.connects = edges.map((edge) => ({
  id: nodeIndexMap.get(targetId),
  connect: { kind: InFlow, index: 0 },
  connect2: { kind: InFlow, index: 0 }
}))
```

---

## 5. 布局计算

`computeImplLayout()` 在独立坐标系中计算所有 impl 节点的 x/y 坐标。

### 常量

```typescript
const LAYOUT_EXEC_H_STEP = 800    // exec 节点水平间距
const LAYOUT_EXEC_V_STEP = 300    // exec 节点垂直间距
const LAYOUT_DATA_H_STEP = 800    // 数据节点水平间距
const LAYOUT_DATA_Y_OFFSET = -400 // 数据节点垂直偏移（在 exec 行上方）
```

### Exec 节点布局：BFS 拓扑排序

1. 找出入口节点（有 exec 产出且无入边的节点）
2. BFS 遍历执行链：`x += 800, y += index * 300`
3. 兄弟分支在垂直方向展开
4. 环中节点（BFS 未达的）放在左上角备用位置，间距 400

### Data 节点布局：Kahn 拓扑排序

1. 识别纯数据节点（无 exec 产出的节点）
2. 构建数据依赖 DAG
3. Kahn 拓扑排序，按深度分列
4. 深度 0 在 x=0，深度 1 在 x=800，依此类推
5. 同一深度的节点在垂直方向堆叠
6. 所有数据节点在 Y 方向偏移 -400（位于 exec 链上方）

### 孤儿节点处理

既无 exec 边又无数据依赖的节点放置在 `(-400, -400)` 起始的备用网格。

---

## 6. 解码后的 GIA JSON 示例

```json
{
  "graph": {
    "inner": {
      "graph": {
        "id": { "kind": 13, "id": 1073741828 },
        "relatedIds": [
          { "class": 10000, "type": 0, "id": 1073741828 },
          { "class": 0, "type": 5000, "id": 1610700000 },
          { "class": 0, "type": 5000, "id": 1610710000 }
        ],
        "nodes": [
          { "nodeIndex": 1, ... },
          { "nodeIndex": 2, "genericId": { "kind": 22001, ... },  // ← SysGraph
            "pins": [...], "x": 0, "y": 0 }
        ]
      }
    }
  },
  "accessories": [
    {
      "id": { "class": 10000, "type": 5000, "id": 1610700000 },
      "which": "CompositeGraph",
      "compositeDef": {
        "inner": {
          "def": {
            "id": { ... "kind": 22001, "id": 1610700000 },
            "inputs": [{"name": "x", "pinIndex": 100, ...}],
            "outputs": [{"name": "result", "pinIndex": 200, ...}],
            "type": { "kind": "Composite" }
          }
        }
      }
    },
    {
      "id": { "class": 0, "type": 5000, "id": 1610710000 },
      "which": "EntityNode",
      "graph": {
        "inner": {
          "graph": {
            "id": { "kind": 13014, "id": 1610710000 },
            "nodes": [...],
            "compositePins": [
              { "outerPin": { "kind": 3, "index": 0 },
                "innerNodeId": 1, "innerPin": { "kind": 3, "index": 0 },
                "innerPin2": { "kind": 3, "index": 0 } }
            ]
          }
        }
      }
    }
  ]
}
```

> 注意：`relatedIds` 中的 `kind=22001` = `SysGraph`、`kind=13014` = `CompositeGraph`。`class=10000` 对应 `AffiliatedNode`。
