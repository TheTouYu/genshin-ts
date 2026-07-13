# 目标架构与接口草案

> 状态：待验证 / 目标设计
> 来源：当前实现约束 + vendor API 阅读 + 真实 GIA 差异
> 最近校验：2026-07-11
> 适用范围：Stage 3 内部架构；接口名称是草案，不是已实现 API

## 1. 分层

```text
A. IR normalization
   list expansion, capture rewrite, sparse input normalization

B. graph semantic resolution
   scope, variables, connection/output types, diagnostics

C. node variant resolution
   logical node name + resolved types → generic/concrete identity

D. ordinary node lowering
   vendor Node + value assignment + centralized normalization

E. graph materialization
   vendor Graph.add_node/connect/flow + encode

F. boundary wrapping
   root metadata OR CompositeDef/compositePins/call overlays
```

每层只能依赖上层产物，不允许 D/E 回头猜 B 层类型。

## 2. Graph scope

```ts
type GraphScope =
  | {
      kind: 'root'
      mode: ServerGraphMode
      variablesByName: Map<string, Variable>
    }
  | {
      kind: 'composite-impl'
      mode: ServerGraphMode
      definition: CompositeDefIR
      variablesByName: Map<string, Variable>
      compositeDefsById: Map<number, CompositeDefIR>
    }
```

Scope 决定可见变量、synthetic boundary 和 diagnostics 上下文，不决定普通节点 pin schema。

### 能力同源原则

用户确认的目标能力模型是：主图能够表达和执行的 ordinary system node、API 调用及其数据/控制流关系，
原则上也必须能在 composite impl 中表达和执行。复合不是受限 ordinary-node 子集；scope 变化只能增加
CompositeDef、synthetic call、capture、`compositePins`、inflow/outflow 和布局等 boundary 职责，不能产生第二套
ordinary node 能力或 schema。

这是一项目标架构约束，不是“所有 API 已验证”的现状声明。实现共享 resolution/lowering/materializer 后，仍须对
各 family 用可执行 root + impl fixture、真实 GIA 和用户编辑器案例逐步验证；signal/dynamic pin 等有专属规则的 family
应接入共享 ordinary contract 下的专用 lowerer/normalization，而不是恢复独立 composite backend。详见
[ADR-011](decision-log.md#adr-011普通能力在-root-与-composite-impl-中同源)。

## 3. Resolved Graph IR

建议新增 Stage 3 内部 contract，不修改跨阶段 `IR.d.ts`：

```ts
type ResolvedValueType =
  | { kind: 'scalar'; name: ScalarType }
  | { kind: 'list'; element: ResolvedValueType }
  | { kind: 'dict'; key: ResolvedValueType; value: ResolvedValueType }
  | { kind: 'enum'; enumName: string; enumId?: number }
  | { kind: 'local-variable'; value: ResolvedValueType }

type ResolvedInput = {
  logicalArgIndex: number
  physicalPinIndex: number
  type: ResolvedValueType
  source:
    | { kind: 'literal'; value: unknown }
    | { kind: 'connection'; nodeId: number; pinIndex: number }
    | { kind: 'omitted' }
}

type ResolvedNodeIdentity = {
  logicalType: string
  genericNodeId: number
  concreteNodeId?: number
}

type ResolvedOrdinaryNode = {
  kind: 'ordinary'
  irId: number
  identity: ResolvedNodeIdentity
  inputs: ResolvedInput[]
  outputs: ResolvedOutput[]
  flow: ResolvedFlowShape
}
```

`physicalPinIndex` 在 resolution 阶段由统一 hidden-pin/schema 规则确定，避免连接阶段再次 remap。

Synthetic nodes 单独建模：

```ts
type ResolvedSyntheticNode =
  | ResolvedCompositeCall
  | ResolvedCompositeInputAnchor
  | ResolvedCompositeOutputAnchor
```

`__composite_capture__` 应在进入 resolved graph 前被消除，不成为 lowerable node。

## 4. 类型仲裁

### Setter 示例

```text
目标变量声明类型 ─┐
赋值 literal/conn ─┼─ unify → resolved value type
vendor node schema ─┘
```

建议规则：

1. 收集所有候选，不先覆盖；
2. 候选一致则确认；
3. 合法隐式转换必须在更早阶段显式变成 conversion node，Stage 3 不暗转；
4. 冲突产生 diagnostic，包含 scope、node id、arg/pin、变量名和来源；
5. 无法解析 reflective node 时默认报错，兼容 fallback 必须显式开启并记录 telemetry。

示例：

```text
E_TYPED_INPUT_CONFLICT
scope: composite 更新v、w
node: 13 set_node_graph_variable
pin: 1
variable declaration: 额外压力=float
assigned argument: int literal
```

## 5. Shared variant resolver

共享核心只接收已解析信息：

```ts
function resolveNodeVariant(
  logicalType: string,
  inputs: readonly ResolvedInput[],
  outputs: readonly ResolvedOutput[],
  mode: ServerGraphRuntimeMode
): ResolvedNodeIdentity
```

它负责：

- mode-specific ID；
- reflective variant；
- dict/list K/V suffix；
- enum concrete kind；
- special generic/concrete pairs。

它不负责：

- 查 composite capture；
- 找变量；
- 看布局；
- 创建 pins；
- 连接节点。

当前 `resolveGiaNodeId()` 应逐步拆成“scope adapter + 共享 resolver”，而不是被复制。

## 6. Vendor ordinary-node factory

```ts
type LoweredOrdinaryNode = {
  node: GiaNode
  dataEdges: PendingDataEdge[]
  flowEdges: PendingFlowEdge[]
}

function lowerOrdinaryNode(
  resolved: ResolvedOrdinaryNode,
  context: LoweringContext
): LoweredOrdinaryNode
```

流程：

1. 用 resolved concrete ID 构造 `new Node(...)`；
2. vendor `setConcrete()` 建立真实 pin schema；
3. literal 只通过共享 value adapter/`Pin.setVal()` 设置；
4. connection 不创建目标 pin，只记录 edge；
5. 应用集中 normalization；
6. 断言 expected physical pin 存在且类型兼容。

禁止 ordinary factory 手写 `bConcreteValue`。如果 vendor 无法表示真实结构，先记录 vendor gap，再在唯一
normalization adapter 中补丁，不允许 root/impl 分叉补丁。

## 7. Vendor normalization adapter

```ts
type VendorNodeNormalizationRule = {
  id: string
  appliesTo: (node: ResolvedOrdinaryNode) => boolean
  evidence: string
  apply: (node: GiaNode) => void
}
```

首批候选规则来自当前 root：

- hidden/null-hole argument layout；
- `get_node_graph_variable` name pin；
- `filterUnkPins`；
- local-variable hidden output；
- signal exec payload（若仍归 ordinary；也可独立 family lowerer）。

每条规则要区分：

- vendor schema 缺口；
- IR logical argument 到 physical pin 的 adapter；
- GIA 真实输出 normalization。

## 8. Shared graph materializer

```ts
function materializeOrdinaryGraph(
  resolved: ResolvedGraph,
  graph: GiaGraph
): MaterializedGraph
```

职责：

- add ordinary nodes；
- 根据已解析 physical indices 调用 `Graph.connect/flow`；
- 编码；
- 不处理 composite definition metadata。

Root 直接包装 materialized graph。Impl 从 materialized graph 提取普通 NodeGraph 后应用 boundary overlay。

在 Phase 0 证明 vendor `Graph.connect/flow` 与真实 impl 不一致前，不允许假定此设计已成立。

## 9. Composite boundary backend

保留并隔离：

```text
normalizeCompositeCaptures()
resolveCompositeCallNode()
buildCompositeDefinitionInterface()
applyCompositePins()
wrapCompositeGraphUnitPair()
```

### Composite call

由于 node ID 是 composite ID、kind 是 `SysGraph`，它是 synthetic node，由专门 lowerer 创建。它可以复用共享
value adapter，但不伪装成 vendor system call。

### Capture

Capture 是 IR routing construct：

```text
capture node/filter/redirection
→ normalized impl edges + boundary mappings
→ ordinary graph resolution
```

普通 node factory 不得识别 `capture: true` 或 `__composite_capture__`。

### Composite pins

`compositePins` 是 outer interface 到 encoded inner node pin 的 overlay，必须在 node index remap 与 ordinary graph
materialization后应用，并有独立 integrity checks。

## 10. 模块草案

不要求一次移动，但目标职责如下：

```text
ir_to_gia_transform/
├─ resolve_context.ts
├─ resolved_graph.ts
├─ node_variant.ts
├─ ordinary_node.ts
├─ vendor_normalization.ts
├─ graph_materializer.ts
├─ composite/
│  ├─ normalize_capture.ts
│  ├─ call_node.ts
│  ├─ boundary.ts
│  └─ accessories.ts
├─ index.ts
└─ ...
```

迁移期可先在现目录增加共享文件，最后再移动 `composite.ts`；不要先做无行为收益的大规模 rename。

## 11. 架构验收问题

任何实现提案必须回答：

1. 同一 ordinary node 在 root/impl 是否走同一 resolver 和 factory？
2. concrete ID 与 pin concrete index 谁决定，证据是什么？
3. literal 与 connection 是否保留同一 vendor target pin？
4. 类型冲突在哪里报错？
5. hidden pin remap 是否只发生一次？
6. capture 是否在 ordinary lowering 前消失？
7. synthetic call 与 system node 是否明确分离？
8. vendor gap 是否只有一个补丁位置？
9. 如何证明不破坏已通过的 nested/capture/sparse/metadata？
