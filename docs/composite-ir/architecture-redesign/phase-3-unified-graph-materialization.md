# Phase 3：统一普通 Graph Materialization

> 状态：当前实现 / P3-W20 已提交
> 来源：当前代码实现 + focused 自动回归 + 用户游戏内实际运行确认
> 最近校验：2026-07-14
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
- `compositePins` 不在本阶段检查；它属于 Phase 4 的 materialization 后 boundary overlay integrity。

## Tests

- float and vec setters with connection；
- arithmetic chain with multiple outputs；
- hidden input/output pin nodes；
- multi outflow branch；
- nested composite call data edge；
- capture redirect；
- root/impl normalized edge parity。

## P3-W20 当前结果

- [x] root ordinary data/flow edge 与 vendor-gated impl closed ordinary subgraph 均调用
  `ordinary_graph_materializer.ts` 的 `materializeOrdinaryGraphEdges()`。
- [x] vendor-gated impl ordinary pin 不再由本路径直接手写 `connects`；synthetic call/capture 仍留在显式 overlay。
- [x] root 的 hidden-pin physical remap 在传入 shared materializer 时执行；impl ordinary edge 没有额外 remap。
- [x] DTC、captured custom target、scalar arithmetic 的 legacy/vendor fixtures，以及 nested capture/outflow 回归通过。
- [x] P3-W20 complex-flow legacy/vendor parity fixture 覆盖 ordinary fan-out、两个 indexed nested synthetic OutFlow overlay，以及 shared addition producer 到两个 DTC/Print consumer 的 ordinary data edges。
- [x] 四份 P3-W20 vendor-gated 候选已复制到 `Beyond_Local_Export` 根目录并回读 SHA-256；用户已确认均在游戏内实际运行通过，未注入。

## 退出条件

- [x] ordinary data/flow edge 只有共享 materializer 实现；
- [x] impl 不再直接为 ordinary pin 设置 `connects`；
- [x] index remap 只发生一次；
- [x] capture/boundary edges 明确不进入 ordinary materializer；
- [x] root/impl edge parity 通过现有跨类别哨兵；
- [x] P3-W21 为 shared materializer 建立无 fallback 的 encoded integrity contract：ordinary data
  endpoint pin、同一 data target 唯一性、vendor impl encoded `nodeIndex` 对齐，以及 synthetic/capture
  exclusion；direct contract 另锁定错误 pin、重复 target、boundary 越界与 nodeIndex 漂移。
- [x] 用户明确确认 P3-W20 候选在游戏内实际运行通过。
- [x] P3-W21 对 ordinary endpoint、data target uniqueness、encoded nodeIndex、type compatibility（限当前可获得的 schema/IR 证据）与 boundary/capture exclusion 建立无 fallback 的共享可失败契约。
- [x] P3-W22 已建立游戏回归 manifest，并以精确 SHA 重生成四份代表性 vendor-gated P3 哨兵；用户于
  2026-07-14 确认编辑器加载和可观察执行通过。候选 SHA 改变不继承旧结论。
- [x] P3 exit audit 已确认普通 data/flow（complex-flow）、literal/connection（scalar/custom target）、fan-out
  （complex-flow）、hidden-pin remap（P3-W20 root/impl parity）与 boundary exclusion（P3-W21 integrity contract）的
  最小跨类别哨兵；四份 manifest 候选均已由用户核验通过。任一后续游戏回归失败先阻塞并建立最小修复包。

P3-W21 已完成：`ordinary_graph_materializer.ts` 在写入前检查 ordinary endpoint pin、pin type、同一 data
目标唯一性与 nodeIndex 唯一性；vendor impl 额外以 `nodeIndexMap` 断言 encoded index 对齐，并明确排除 synthetic
call。P3-W21 focused 自动回归通过，未改变候选 GIA 的语义目标、未注入；这不是真实 GIA/wire 全等结论。
P3-W22 已将 complex-flow、DTC、captured custom target 与 scalar arithmetic 四份 vendor-gated 候选重生成并登记
精确 SHA；用户于 2026-07-14 确认四份均可在编辑器加载和可观察执行，未注入。所有 Phase 3 退出项已满足，用户
已确认进入 Phase 4。

P4-W1 B1 自动回归暴露 P3.5 例外：root 与 vendor-gated impl 都曾删除 `get_local_variable` 的 OutParam[0]，但它是
local-variable handle；同时 OutParam[1] 是 typed value。该删除会使 handle → setter 或 value → ordinary consumer
产生 endpoint 缺失。用户已批准最小 P3.5 修复：两条路径保留两个输出，vendor ordinary edge 忽略 `capture: true`
输入。自动回归通过；用户于 2026-07-14 确认候选可在编辑器加载和可观察执行，未注入。P3.5 不改变 P3 已完成的
exit 结论；P4-W1 可在 P3.5 审核提交后恢复。

## 回滚条件

若 vendor Graph 不能保留 impl 所需连接结构，不应回到散落手写；应建立唯一 graph encoding adapter，并在
`decision-log.md` 记录 vendor gap、真实证据和退出条件。
