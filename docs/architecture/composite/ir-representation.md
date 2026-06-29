# IR 中间表示：复合节点定义与调用

> 本文档描述复合节点在 IR JSON 中的表示——`CompositeDefIR`、`CompositeCallMeta`、`CompositePinEntry` 等类型及其在阶段二产物中的具体结构。
> 参见：[DSL API](./composite/dsl-api.md) | [捕获机制](./composite/capture-mechanism.md) | [管线追踪](./composite/pipeline-flow.md) | [阶段二 IR](../stage2-gs-to-ir.md)

---

## 1. CompositeDefIR 完整类型

```typescript
interface CompositeDefIR {
  name: string                     // 复合节点名称
  id: number                       // 唯一 ID（1610700000+）
  type: 'composite'                // 固定标识
  inflows: ControlFlowDef[]        // 执行流入引脚
  outflows: ControlFlowDef[]       // 执行流出引脚
  inputs: ParamFlowDef[]           // 数据输入引脚
  outputs: ParamFlowDef[]          // 数据输出引脚
  implNodes: ServerNode[]          // 内部实现节点列表
  implEdges: Record<number, NextConnection[]>  // 内部执行连线
  compositePins: CompositePinEntry[]  // 内外引脚映射
  implVariables?: Variable[]       // 内部变量（当前未使用）
}
```

### ControlFlowDef

```typescript
interface ControlFlowDef {
  name: string      // 引脚名（当前为空字符串）
  visible: boolean  // 可见性
  index: number     // 逻辑序号
  pinIndex: number  // GIA pin index 字面量
}
```

引脚索引常量（`composite_registry.ts`）：

| 常量名 | 单 OutFlow | 多 OutFlow |
|--------|-----------|------------|
| InFlow pinIndex | 1974 | 6 |
| OutFlow pinIndex | 4 | 8 + index |
| InParam pinIndex base | 100 | 100 + index |
| OutParam pinIndex base | 200 | 200 + index |

### ParamFlowDef

```typescript
interface ParamFlowDef {
  name: string
  visible: boolean
  index: number
  type: ValueType          // 'int' | 'float' | 'str' | 'bool' | 'vec3' | ...
  pinIndex: number         // InParam 基=100, OutParam 基=200
}
```

---

## 2. CompositePinEntry：四种 kind

```typescript
interface CompositePinEntry {
  outerPinKind: number   // 1=InFlow, 2=OutFlow, 3=InParam, 4=OutParam
  outerPinIndex: number  // 复合外部的引脚索引
  innerNodeId: number    // 对应内部节点的 ID
  innerPinKind: number   // 内部引脚种类（与 outerPinKind 同值）
  innerPinIndex: number  // 内部节点的引脚索引
}
```

### 映射举例

```
假设复合定义有输入 x (index=0)，内部使用方式为:
  f.add(args.x, args.x)
                                  ┌─────────────────┐
                                  │ CompositeDefIR    │
                                  │ inputs: [x: int] │
                                  └────────┬────────┘
                                           │ outerPinKind: 3 (InParam)
                                           │ outerPinIndex: 0
                                           ▼
  ┌───────────────────────────────────────────────────┐
  │ implNodes (内部节点图)                              │
  │                                                    │
  │  Node 5: addition                                  │
  │    args: [                                         │
  │      { __captureInputName: 'x' },  ← argIdx=0      │
  │      { __captureInputName: 'x' }   ← argIdx=1      │
  │    ]                                                │
  └───────────────────────────────────────────────────┘
                           │
  生成两条 compositePins:   │
  [0]: { outerPinKind:3, outerPinIndex:0,              │
         innerNodeId:5,   innerPinKind:3, innerPinIndex:0 }
  [1]: { outerPinKind:3, outerPinIndex:0,              │
         innerNodeId:5,   innerPinKind:3, innerPinIndex:1 }
```

---

## 3. implNodes 的 arg 表示

内部节点的 args 有两种形态：

### 字面量

```json
{ "type": "int", "value": 42 }
```

由 `toIRLiteral()` 产生，对应不依赖其他节点输出的常量值。

### conn 类型（数据连线）

```json
{
  "type": "conn",
  "value": {
    "node_id": 3,
    "index": 0,
    "type": "int"
  }
}
```

由 `getMetadata()?.kind === 'pin'` 检测触发。表示该参数是内部节点 3 的 OutParam pin 0 的输出。

---

## 4. implEdges：控制流连线

```typescript
// implEdges: source node ID → target connections
{
  "1": [{ "node_id": 2, "source_index": 0, "target_index": 0 }],
  "2": [{ "node_id": 4, "source_index": 0, "target_index": 0 }]
}
```

每条边指示执行流从源节点的指定 OutFlow (source_index) 流向目标节点的 InFlow (target_index)。

---

## 5. CompositeCallMeta

在主图中，每个 `f.callComposite()` 调用被记录为：

```typescript
interface CompositeCallMeta {
  compositeId: number       // 对应 CompositeDefIR.id
  markerNodeId: number      // __composite_call__ 标记节点 ID
}
```

这个元数据在 `buildServerGraphRegistriesIRDocuments()` 中被嵌入到 `IRDocument.compositeCalls` 数组中（通过 `registry.getCompositeCallMetas()` 收集）。

但当前 IR JSON 输出中 `compositeCalls` 主要用于内部追踪，GIA 编码阶段从节点扫描 `__composite_call__` 类型提取 compositeId。

---

## 6. `__composite_call__` 标记节点

在主图中的表现形式：

```json
{
  "id": 10,
  "type": "__composite_call__",
  "args": [
    { "type": "int", "value": 1610700000 }   // compositeId
  ],
  "next": [{ "node_id": 11, "source_index": 0, "target_index": 0 }]
}
```

- `args[0]` 始终是 `int(BigInt(compositeId))`
- 后续 args 为传入的输入参数值
- 纯数据复合：该节点注册为 data 类型（无 next 字段）
- exec 复合：该节点注册为 exec 类型，有 next 连线

---

## 7. compositeDataEdges

跨复合边界的数据连线记录（`server_globals.ts`）：

```typescript
type CompositeDataEdge = {
  fromNodeId: number    // 源（上游复合的 marker）
  fromPinIndex: number  // 源 OutParam pin 索引
  toMarkerId: number    // 目标复合的 marker
  toPinIndex: number    // 目标 InParam pin 索引
}
```

在 IR JSON 中附加在文档顶层：

```json
{
  "compositeDataEdges": [
    { "fromNodeId": 10, "fromPinIndex": 0, "toMarkerId": 12, "toPinIndex": 0 }
  ]
}
```

---

## 8. IR JSON 完整结构示例

```json
[
  {
    "ir_version": 1,
    "ir_type": "node_graph",
    "graph": { "name": "main", "id": 1073741828, "type": "server", "mode": "beyond" },
    "nodes": [
      { "id": 1, "type": "time_scale_change_event", "args": [],
        "next": [{ "node_id": 2 }] },
      { "id": 2, "type": "__composite_call__", "args": [
          { "type": "int", "value": 1610700000 },
          { "type": "int", "value": 42 }
        ],
        "next": [{ "node_id": 3 }] },
      { "id": 3, "type": "log", "args": [] }
    ],
    "compositeDefs": [
      {
        "name": "Triple",
        "id": 1610700000,
        "type": "composite",
        "inflows": [],
        "outflows": [],
        "inputs": [{ "name": "x", "visible": true, "index": 0, "type": "int", "pinIndex": 100 }],
        "outputs": [{ "name": "result", "visible": true, "index": 0, "type": "int", "pinIndex": 200 }],
        "implNodes": [
          {
            "id": 1,
            "type": "addition",
            "args": [
              { "type": "conn", "value": { "node_id": 1, "index": 0, "type": "int" } },
              { "type": "conn", "value": { "node_id": 1, "index": 0, "type": "int" } }
            ]
          }
        ],
        "implEdges": {},
        "compositePins": [
          { "outerPinKind": 3, "outerPinIndex": 0, "innerNodeId": 1, "innerPinKind": 3, "innerPinIndex": 0 },
          { "outerPinKind": 3, "outerPinIndex": 0, "innerNodeId": 1, "innerPinKind": 3, "innerPinIndex": 1 },
          { "outerPinKind": 4, "outerPinIndex": 0, "innerNodeId": 1, "innerPinKind": 4, "innerPinIndex": 0 }
        ]
      }
    ],
    "compositeDataEdges": []
  }
]
```
