# Phase 4：隔离 Composite Boundary

> 状态：已完成；Phase 4 退出条件满足（P4-W1–P4-W7 自动 + 用户核验）；待用户确认进入 Phase 5
> 来源：当前 composite/capture/call/definition/compositePins/layout 实现 + P4-W1 自动回归 + P4-W2 capture
> normalization contract + P4-W3 call lowerer contract + P4-W4 definition interface contract +
> P4-W5 compositePins overlay contract + P4-W6 layout isolation contract + P4-W7 orchestration
> contract + 用户批次核验
> 最近校验：2026-07-14
> 适用范围：CompositeDef、synthetic call、capture、compositePins 与 layout isolation

## 目标

在普通节点和普通边已经共享后，把 `composite.ts` 剩余职责拆为明确 boundary pipeline，避免 boundary metadata
重新侵入 ordinary lowering。

## 目标流水线

```text
CompositeDefIR
  ↓ normalize capture/sparse inputs
NormalizedCompositeIR
  ↓ resolve ordinary graph + synthetic calls
ResolvedCompositeGraph
  ↓ shared materializer (ordinary subgraph)
Materialized NodeGraph
  ↓ boundary overlay
CompositeDef + compositePins + GraphUnit pair
```

## 工作项

### 4.1 Capture normalization 模块化

输入原始 capture nodes/marks，输出：

- filtered ordinary nodes；
- redirected ordinary edges；
- boundary bindings；
- deterministic node index mapping requirements。

禁止 ordinary lowerer看到 `__composite_capture__` 节点与 capture 源边。arg 级 `capture: true` 仍由 call/pin
builder 处理（P4-W2 已记录为剩余 boundary 职责，未在 ordinary factory 中新增语义）。

P4-W2（2026-07-14）：已抽取纯函数模块
`src/compiler/ir_to_gia_transform/normalize_capture.ts`（`normalizeCompositeCaptures` /
`encodeBoundaryPins`），并由 `buildCompositeAccessories()` 调用。focused contract：
`tests/composite/test-stage3-p4w2-capture-normalization-contract.ts`。B1 / nested capture / captured
connection 自动回归通过；用户已确认 B1 capture-only 与 nested capture 候选的编辑器加载和可观察执行通过
（2026-07-14）；未注入；已提交。

### 4.2 Composite call lowerer

专门负责：

- `SysGraph` identity；
- child definition inputs/outputs/inflows/outflows；
- sparse `compositeInputIndex`；
- physical pins；
- `compositePinIndex`；
- literal/connection/capture 来源分类。

它可调用共享 value codec，但不是 ordinary vendor node。

P4-W3（2026-07-14）：已抽取纯函数模块
`src/compiler/ir_to_gia_transform/lower_composite_call.ts`（`resolveCompositeCallIdentity` /
`buildCompositeCallPins` / `collectCalledCompositeIds`），并由 `buildCompositeAccessories()` 与
`buildImplGraphNodes()` 接入。focused contract：
`tests/composite/test-stage3-p4w3-call-lowerer-contract.ts`。B2 sparse、B3 nested data、B4 multi
inflow/outflow、nested call/capture 自动回归通过；用户已确认四份 vendor 候选的编辑器加载和可观察执行
通过（2026-07-14）；未注入；已提交。

### 4.3 Definition interface builder

集中构建：

- ParameterFlow；
- bool/enum metadata；
- external pin indices；
- inflow/outflow interface；
- impl graph relation。

P4-W4（2026-07-14）：已抽取纯函数模块
`src/compiler/ir_to_gia_transform/build_composite_definition.ts`（`buildCompositeDefinitionInterface` /
`buildCompositeParameterType` / `resolveImplGraphId`），并由 `buildCompositeAccessories()` 接入。focused
contract：`tests/composite/test-stage3-p4w4-definition-interface-contract.ts`。bool enum metadata、
pinIndex、multi inflow/outflow、nested sparse/capture/call 自动回归通过；用户已确认编辑器加载和可观察执行
通过（2026-07-14）；候选已归档到 `真-测试通过/复合节点`；未注入。

### 4.4 CompositePins overlay

从已编码 node mapping 建立路由，添加完整性断言：

- outer pin 存在；
- inner node/pin 存在；
- kind/index/type 对齐；
- capture route 不产生重复 physical pin；
- nested call route 指向正确 child pin。

P4-W5（2026-07-14）：已抽取纯函数模块
`src/compiler/ir_to_gia_transform/build_composite_pins.ts`（`buildCompositePinsOverlay` /
`materializeCompositePin` / `assertCompositePinsIntegrity`），并由 `buildCompositeAccessories()` 在
ordinary/call materialization 与 nodeIndex remap 之后接入。focused contract：
`tests/composite/test-stage3-p4w5-composite-pins-overlay-contract.ts`。

生产默认完整性：outer definition pin 存在、encoded inner node 存在、物理路由不重复。物理 pin 存在性为
opt-in（`requirePhysicalPins`），因当前 materializer 对 capture/sparse InParam、InFlow 目标、普通 OutFlow
终端与部分 pure-data OutParam 仍有意保留 pin hole。nested/capture/sparse/multi-flow 自动回归通过；用户
已确认五份 vendor 候选的编辑器加载和可观察执行通过（2026-07-14）；候选已归档到 `真-测试通过/复合节点`；
未注入。

### 4.5 Layout isolation

保留 composite virtual anchors 与 impl layout 配置，但布局只消费 normalized graph，不改变节点/pin semantics。

P4-W6（2026-07-14）：已抽取纯函数模块
`src/compiler/ir_to_gia_transform/build_composite_layout.ts`（`buildCompositeLayoutVirtualGraph` /
`computeCompositeImplLayout`），并由 `buildImplGraphNodes()` 在 materialization 前接入。layout 强制消费
capture-normalized `ordinaryNodes` / `ordinaryEdges` / `boundaryPins`；virtual anchors 只进入共享
`layout.ts`，不进入 materializer position map，也不编码为 GraphNode。focused contract：
`tests/composite/test-stage3-p4w6-layout-isolation-contract.ts`。capture / nested / multi-flow / sparse
自动回归通过；用户已确认五份 vendor 候选的编辑器加载和可观察执行通过（2026-07-14）；候选已归档到
`真-测试通过/复合节点`；未注入。

### 4.6 Orchestration 收口 / Phase 4 退出核对

P4-W7（2026-07-14）：`composite.ts` 增加 `COMPOSITE_ORCHESTRATION_CONTRACT`，明确 boundary pipeline 与
模块归属；`buildImplNodePins` 变为 ordinary-only，遇 `__composite_call__` / `__composite_capture__` 直接
失败，不再嵌 call lowerer 或 capture-node skip 外壳。call 路由只发生在 `buildImplGraphNodes`
orchestration 层。arg 级 `capture: true` 仍只用于跳过 physical InParam。default vendor gate 仍关闭，
legacy ordinary backend 仍在（属 Phase 5）。focused contract：
`tests/composite/test-stage3-p4w7-orchestration-contract.ts`。P4 boundary 自动回归通过；用户已确认五份
vendor 候选的编辑器加载和可观察执行通过（2026-07-14）；候选已归档到 `真-测试通过/复合节点`；未注入。

## Tests

- pure data composite；
- single/multiple inflow/outflow；
- nested data + exec call；
- nested capture；
- sparse named literal/connection；
- bool metadata raw wire；
- physical-motion `与` / `can fly` 保持嵌套；
- node-index remap 与 compositePins integrity。

## P4-W1：boundary regression batch

用户于 2026-07-14 确认 Phase 3 退出，并授权将四个彼此独立的 boundary 回归子切片作为一个 P4-W1 批次
实现和集中游戏核验。该授权只改变候选交付节奏，不改变 P4 的 architecture boundary 或本阶段禁止事项。

| 子切片 | 最小风险 | 自动契约与候选观察点 |
|---|---|---|
| B1 | capture-only input | 不生成 ordinary `InParam`；仅有正确 `compositePins` capture route |
| B2 | sparse / optional call binding | 部分/空 binding 不压缩 `compositeInputIndex` 或 declaration index |
| B3 | nested call data boundary | ordinary producer → child call input；child output → ordinary consumer |
| B4 | multi InFlow / OutFlow | 指定 index physical pin、overlay route 与各分支可观察执行 |

每个子切片必须独立生成 vendor-gated candidate、记录 SHA-256 和观察点，并在 manifest 中单独记录用户结论。任何一个
失败只阻塞对应子切片；不得把其余通过结论推广到它，也不得在本批次迁移 capture 语义、ordinary lowering/edge、布局、
default gate 或 legacy 删除。

当前结果（2026-07-14）：B1~B4 的 legacy/vendor focused contracts、nested capture/outflow 与 P3
complex-flow parity 均通过。用户已确认 B1、B2、B4 的编辑器加载和可观察执行通过；B3 初版只验证 outer
producer 连到 child input，未验证 child 实际消费该输入，已收紧为 child input → `compositePins` → DTC → Print，
并以新 SHA 由用户复测通过。四份候选均未注入。

## 退出条件

- [x] ordinary lowering 模块无 composite capture/call 节点分支（P4-W7；arg 级 capture skip 仍保留）；
- [x] capture normalization 有独立输入输出 contract（P4-W2；自动 contract + 用户编辑器/游戏核验通过）；
- [x] call synthetic pins 有单一 builder（P4-W3；自动 contract + 用户编辑器/游戏核验通过）；
- [x] definition interface 有独立 builder（P4-W4；自动 contract + 用户编辑器/游戏核验通过）；
- [x] compositePins 在 materialization 后统一应用（P4-W5；自动 contract + 用户编辑器/游戏核验通过）；
- [x] nested/capture/sparse/bool 回归通过（P4-W5 自动复跑 + 用户编辑器/游戏核验通过）；
- [x] `composite.ts` 只做 orchestration 或已拆成边界模块（P4-W7；boundary 已拆；ordinary legacy backend 属 Phase 5）；
- [x] layout isolation 有独立输入输出 contract（P4-W6；自动 contract + 用户编辑器/游戏核验通过）；
- [x] 跨调用边界的 inflow/outflow 路由、node-index remap 与必要布局附加规则仅由 boundary 处理；普通 flow/layout
  仍使用共享图能力（P4-W6 layout + P4-W7 orchestration）；
- [x] 代表性 vendor-gated boundary 候选已登记到游戏回归 manifest，并由用户确认编辑器加载和可观察执行
  （P4-W1–P4-W7；P4-W7 用户核验 2026-07-14 通过）；
- [x] 不默认开启 shared backend gate，不删除 legacy backend；完成后才可选择独立的 opt-in beta 配置入口工作包。

## 禁止事项

- 不为简化边界而展开 nested composite；
- 不把 capture 编码成游戏普通节点；
- 不根据当前物理布局猜 outer/inner pin route；
- 不把真实编辑器 ID 规律无证据推广到 gsts ID 分配策略。
- 不在 boundary 模块重新实现 ordinary node、ordinary data edge 或 ordinary flow edge。
