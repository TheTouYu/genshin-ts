# Phase 3：统一普通 Graph Materialization

> 状态：待执行
> 来源：目标架构设计；依赖 Vendor Graph 实验
> 最近校验：2026-07-12
> 适用范围：普通 data/flow edges；composite boundary overlay 仍独立

## 目标

让 root 和 impl 的普通节点连接使用同一个 materializer，逐步移除 impl 对 `NodePin.connects` 的手工写入。

## P2-W5 前置观察（已验证但范围有限）

2026-07-12 的 P2-W5 先以同一 DSL 建立用户编辑器通过的 legacy reference，再在
`GSTS_STAGE3_VENDOR_IMPL_GRAPH=1` gate 下把一个**无 capture、无 nested composite call 的闭合 ordinary
impl 图**交给 vendor `Graph.add_node/connect/flow`，提取 encoded nodes 后套入既有 CompositeDef wrapper。
用户确认候选在编辑器正常。覆盖 local-variable float getter/setter、literal、Addition data edge、DTC、Print 和
两条 flow；它证明此组合可用，不证明 raw/wire 全等，也不证明 boundary metadata 的普遍兼容。

仍必须满足：

- Phase 2 至少完成 setter 和变量节点族；
- logical→physical pin index 已在 resolved contract 中固定；
- 每个新增 boundary/synthetic family 都要独立观察，不得因 P2-W5 直接默认开启 gate。

## 工作项

### 3.1 Pending edge contract

```ts
type PendingDataEdge = {
  fromNodeId: number
  fromPhysicalPin: number
  toNodeId: number
  toPhysicalPin: number
}
```

Flow 同理。进入 materializer 后禁止再次按 node type remap。

### 3.2 Shared materializer

统一执行：

```text
add_node
connect ordinary data edges
flow ordinary execution edges
encode
```

Root 先接入并验证输出保持，再由 impl 以 family/fixture 逐步接入。

### 3.3 Impl index mapping

在 materialization 前完成 IR ID→encoded nodeIndex 映射，保证 ordinary edges 与后续 `compositePins` 使用同一 mapping。

### 3.4 Boundary edge 分类

必须在连接前分类：

- ordinary→ordinary：shared materializer；
- boundary/capture→ordinary：composite overlay；
- ordinary→composite output：`compositePins`；
- ordinary→synthetic composite call：call lowerer + ordinary connection adapter。

禁止同一 edge 同时由 materializer 和 overlay 写入。

### 3.5 Encoded integrity checks

- 每个 data target 最多一个 source（除非真实 schema 明确允许）；
- edge endpoint pin 存在；
- connects 指向 encoded nodeIndex；
- source/target type compatible；
- capture-filtered node 不出现在 connects；
- no dangling compositePins。

## Tests

- float and vec setters with connection；
- arithmetic chain with multiple outputs；
- hidden input/output pin nodes；
- multi outflow branch；
- nested composite call data edge；
- capture redirect；
- root/impl normalized edge parity。

## 退出条件

- [ ] ordinary data/flow edge 只有共享 materializer 实现；
- [ ] impl 不再直接为 ordinary pin 设置 `connects`；
- [ ] index remap 只发生一次；
- [ ] capture/boundary edges 明确不进入 ordinary materializer；
- [ ] root/impl edge parity 通过；
- [ ] encoded integrity checks 无 fallback。

## 回滚条件

若 vendor Graph 不能保留 impl 所需连接结构，不应回到散落手写；应建立唯一 graph encoding adapter，并在
`decision-log.md` 记录 vendor gap、真实证据和退出条件。
