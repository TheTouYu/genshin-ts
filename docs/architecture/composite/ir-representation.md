# IR 中间表示：复合节点定义与调用

> 状态：当前实现 + 部分待验证
> 来源：当前代码实现 + 真实 GIA 验证
> 最近校验：2026-07-06
> 适用范围：gsts 当前 IR 表示；真实编辑器输出的 pinIndex 和 ID 分配需看 composite-ir 验证文档。

> ⚠️ **pinIndex 值注意事项**
> 本文档描述的 pinIndex 常量（InFlow=1974, OutFlow=4/8+index, InFlowOut=6）是 `toCompositeDefIR()` 的硬编码默认值，**仅对 gsts 编译器生成的复合有效**。
> 游戏编辑器创建或用户编辑的复合使用编辑器分配的值。验证发现 97 个真实复合（复杂gia/ 目录）无一使用这些默认值。
> 详情见 [`docs/composite-ir/01-ir-types.md`](../../composite-ir/01-ir-types.md) §pinIndex 真实值。

> 本文档描述复合节点在 IR JSON 中的表示——`CompositeDefIR`、`CompositeCallMeta`、`CompositePinEntry` 等类型及其在阶段二产物中的具体结构。
> 参见：[DSL API](./dsl-api.md) | [捕获机制](./capture-mechanism.md) | [管线追踪](./pipeline-flow.md) | [阶段二 IR](../stage2-gs-to-ir.md) | [复合 IR 类型参考（权威）](../../composite-ir/01-ir-types.md)

---

## 1. CompositeDefIR 完整类型

复合 IR 的类型定义（`CompositeDefIR`、`ControlFlowDef`、`ParamFlowDef`、`CompositePinEntry`、`CompositeCallMeta`、`compositeDataEdges`、`CompositeCapture`）见 [`docs/composite-ir/01-ir-types.md`](../../composite-ir/01-ir-types.md) — 包含来自 97 个真实复合验证的权威定义。

### 编译器默认 pinIndex

以下是 gsts 编译器在 `toCompositeDefIR()` 中使用的硬编码默认值（注意：见上方 ⚠️ caveat，这些值**仅对 gsts 生成的复合有效**，游戏编辑器使用不同的值）：

| 常量名 | 单 OutFlow | 多 OutFlow |
|--------|-----------|------------|
| InFlow pinIndex | 1974 | 6 |
| OutFlow pinIndex | 4 | 8 + index |
| InParam pinIndex base | 100 | 100 + index |
| OutParam pinIndex base | 200 | 200 + index |

### implNodes 的 arg 表示

内部节点的 args 有两种形态：

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

## 2. implEdges：控制流连线

```typescript
// implEdges: source node ID → target connections
{
  "1": [{ "node_id": 2, "source_index": 0, "target_index": 0 }],
  "2": [{ "node_id": 4, "source_index": 0, "target_index": 0 }]
}
```

每条边指示执行流从源节点的指定 OutFlow (source_index) 流向目标节点的 InFlow (target_index)。

---

## 3. `__composite_call__` 标记节点

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
- 后续 args 为实际传入的输入参数值；每个输入 arg 可带 `compositeInputIndex`，表示它在 definition inputs 中的声明位置
- 调用可绑定任意输入子集或空集：例如声明 `[first, second]` 时，first-only / second-only / both / empty 分别保留
  `[0]` / `[1]` / `[0,1]` / `[]`，不得因 args 数组压缩改变 declaration index
- definition capture 始终使用完整声明输入；某次 call 未绑定的输入不应删除 impl 的 `compositePins` route，也不应在该
  call marker 上伪造 literal、ordinary edge 或 capture route
- 纯数据复合：该节点注册为 data 类型（无 next 字段）
- exec 复合：该节点注册为 exec 类型，有 next 连线

---

上述是当前 Runtime/IR 的通用结构契约。真实 GIA 证据为
`Beyond_Local_Export/user_edit/复合节点/调用参数.gia`：同一加法 definition 的 impl 消费两个输入，四个 marker 的
physical input presence 为 `[0]` / `[1]` / `[0,1]` / `[]`。该证据不自动证明各类型的 concrete wrapper、wire presence
或未绑定输入参与游戏计算时的默认结果。

## 4. compositeDataEdges

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

## 5. IR JSON 完整结构示例

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
