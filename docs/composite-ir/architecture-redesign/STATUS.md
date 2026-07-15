# Composite Stage 3 Redesign 当前状态

> 状态：当前推荐 / 实时状态
> 来源：当前 Git 工作树 + 当前 Phase 计划 + ADR-012/013 + 已归档工作包记录
> 最近校验：2026-07-16
> 适用范围：`refactor/composite-stage3-architecture`；新会话的最小实时恢复入口

> 历史工作包的目标、命令、候选路径、SHA-256 和失败过程不在本文件重复；见
> [work-packages/README.md](work-packages/README.md)。当前计划见
> [phase-5-legacy-removal-and-hardening.md](phase-5-legacy-removal-and-hardening.md)。

## 当前定位

```text
当前分支：refactor/composite-stage3-architecture
当前 Phase：Phase 5 进行中（P5-W1..P5-W4、P5-W6、P5-W7 完成；待提交）
当前唯一工作包：P5-W8 — enumerations_equal residual 身份迁 shared resolver（候选）
最近完成工作包：P5-W7 — residual scalar ordinary 身份迁 shared resolver（用户核验通过，已归档，待提交）
更早完成：P5-W6 — root→shared-beta ordinary 覆盖矩阵骨架（W1）
更早完成：P5-W4 — 删除空的 legacy typed-identity adapter；P5-W3 — root ordinary 能力清单；P5-W2 — opt-in beta
更早完成：P5-W1 — no-legacy assertions / legacy ordinary call-site inventory
更早完成：P4-W7 — composite.ts orchestration 收口 / Phase 4 退出核对（用户核验通过）
默认 backend：handwritten impl backend
opt-in beta：options.stage3.vendorImplGraphBeta / --stage3-shared-impl-beta / GSTS_STAGE3_VENDOR_IMPL_GRAPH=1
覆盖完成表面：shared beta（grilling S4）；默认旧路只保历史哨兵
STATUS 不记录 git commit SHA；提交身份以 git log 为准（见 EXECUTION 提交协议）
```

## 当前可依赖事实

- ADR-006：ordinary impl graph 的目标主路径是完整 vendor `Graph` materialization；默认 gate 不开启，legacy backend 未删除。
- ADR-009：`__composite_call__` 是 synthetic boundary node，不进入 vendor ordinary Graph；ordinary↔synthetic edge 由 composite overlay 处理。
- ADR-010：definition capture 使用完整 typed placeholders；call-site 可独立省略任意绑定输入，并保持 sparse declaration index。
- ADR-011：root 与 composite impl 的 ordinary system node/API 能力目标同源；composite 只增加 call/capture/`compositePins`/inflow/outflow/layout 等 boundary 职责。
- ADR-012：ordinary API 按共享框架默认覆盖、实际问题驱动补洞；此工程策略不等于所有 ordinary family 已验证。
- ADR-013：当前 root 已支持的 ordinary 能力必须经 root/impl 同一 resolver、factory 和 materializer 表达；Composite
  仅处理增量 boundary。缺口按 0–6 层归因，vendor 缺口走 compat patch → 有来源同步；不允许 Composite 专属 ordinary fallback。
- P2 已对指定 setter/getter、local/custom variable、DTC、nested boundary、同型 int/float 四则与同型 int/float 比较建立 scoped 自动和部分用户编辑器证据；这不等于所有 ordinary family 已验证。
- P2-W17b：`addition`、`subtraction`、`multiplication`、`division` 的同型 int/float 在 root、legacy impl 与 vendor-gated impl 使用 shared identity；可执行 fixture 的控制流为 event/复合 `执行` InFlow → Print 链，数据流为 arithmetic → DTC → Print。用户编辑器已确认通过；归档候选：`Beyond_Local_Export/真-测试通过/复合节点/P2W17b-scalar-arithmetic-vendor-shared-resolution.gia`，SHA-256 `929847e8078744dc6cd0356bfe726c1d91fcb5869ed1a4b2b397d3c18e4cc4a1`；未注入。
- P2-W18：`equal`、`less_than`、`less_than_or_equal_to`、`greater_than`、`greater_than_or_equal_to` 的同型 int/float 在 root、legacy impl 与 vendor-gated impl 使用 shared identity；可执行 fixture 为 comparison → bool→str DTC → Print。用户编辑器已确认通过；归档候选：`Beyond_Local_Export/真-测试通过/复合节点/P2W18-scalar-comparison-vendor-shared-resolution.gia`，SHA-256 `0b1e414dd836b62dadb7a0e4dff47642fcb2c96e126298bbb73ace6b57033f62`；未注入。legacy handwritten OutParam 的 bool schema 修正不在本包。

## 当前未证明 / 停止边界

- 不证明异型 arithmetic、异型 comparison、非 int/float equal 全族、logical ops、vec3、list/dict、未采样 API、全部 signal/dynamic pin/payload 或全部 impl embedding。
- 不证明真实 GIA/wire 全等；decoded defaults 不证明 protobuf field presence。
- 不证明注入或游戏内行为；本轮没有注入。
- 不默认开启 vendor gate，不删除 handwritten backend，不改变 `graphValues`、`affiliations`、capture、nested、sparse 或布局语义。
- signal/dynamic pin family 的能力目标由 ADR-011 确认与 root 同源，但专属 payload/schema/wire 仍需真实可执行案例验证。
- P3-W20 已将 root 的 ordinary data/flow edges 与 vendor-gated impl closed ordinary subgraph 的 data/flow edges 接入同一 shared materializer；synthetic call/capture overlay 仍独立。自动回归通过，用户已确认四份 P3-W20 vendor-gated 候选在游戏内实际运行通过；未注入。
- P3-W21 已在 shared materializer 中加入 ordinary endpoint pin、pin type、data target 唯一性和 nodeIndex 唯一性检查；vendor impl 以 `nodeIndexMap` 额外断言编码 index 对齐，synthetic call 明确排除。direct contract 与 P3/P2 focused 自动回归通过；未生成新候选、未注入，且不构成真实 GIA/wire 或游戏行为结论。

## 当前验证与归档

P2-W17b 已运行并通过：

```bash
npm run build
npx tsx tests/composite/test-stage3-resolved-node-contract.ts
npx tsx tests/composite/test-stage3-p2w17a-scalar-arithmetic-observation.ts /tmp/P2W17b-scalar-arithmetic-flow-legacy.gia
GSTS_STAGE3_VENDOR_IMPL_GRAPH=1 npx tsx tests/composite/test-stage3-p2w17a-scalar-arithmetic-observation.ts /tmp/P2W17b-scalar-arithmetic-flow-vendor.gia
npx tsx tests/composite/test-stage3-p2w16-all-dtc-vendor-graph.ts /tmp/P2W17b-dtc-legacy.gia
GSTS_STAGE3_VENDOR_IMPL_GRAPH=1 npx tsx tests/composite/test-stage3-p2w16-all-dtc-vendor-graph.ts /tmp/P2W17b-dtc-vendor.gia
npx tsx tests/composite/test-nested-composite-capture-pins.ts
npx tsx tests/composite/test-nested-composite-outflow.ts
git diff --check
```

Node 26 的 `module.register()` 弃用警告不影响上述命令退出码。完整工作包时间线见
[归档记录](work-packages/status-history-2026-07-13.md#p2-w17b-完成记录scalar-same-type-arithmetic-shared-identity-resolution)。

## 最近完成：P2-W18

P2-W18 将同型 int/float 的 `equal` / `less_than` / `less_than_or_equal_to` / `greater_than` /
`greater_than_or_equal_to` 接入 shared same-type binary identity；root、legacy impl 与 vendor-gated impl 使用
同一 resolver。自动契约与 legacy/vendor 可执行 fixture 通过；用户已确认编辑器加载和可观察执行；未注入。
归档候选：`Beyond_Local_Export/真-测试通过/复合节点/P2W18-scalar-comparison-vendor-shared-resolution.gia`，
SHA-256 `0b1e414dd836b62dadb7a0e4dff47642fcb2c96e126298bbb73ace6b57033f62`。legacy handwritten OutParam bool
schema 修正不在本包。已提交。

此前已提交：P4-W1（`d277682`）。

## 最近完成：P4-W2

P4-W2 将 capture normalization 抽为可独立调用的纯函数模块
`src/compiler/ir_to_gia_transform/normalize_capture.ts`，并由 `buildCompositeAccessories()` 接入。

输入 / 输出 contract：

```text
input:
  implNodes, implEdges, compositePins
output:
  captureNodeId, captureFirstChildId
  ordinaryNodes        // 不含 __composite_capture__
  ordinaryEdges        // 已移除 capture 源边
  boundaryPins         // IR node id；指向 capture 的 InFlow 重定向到首个 exec 子节点
  nodeIndexMap         // ordinary IR id → encoded nodeIndex（默认从 2 起）
```

ordinary lowerer 不得看见：`__composite_capture__` 节点、capture 源流边。arg 级 `capture: true` 仍由 call/pin
builder 处理（本包未提前剥离）。boundary builder 职责：路由重定向、`encodeBoundaryPins`、与 ordinary
materialization 分离的 compositePins overlay。

已运行并通过：

```bash
npm run build
npx tsx tests/composite/test-stage3-p4w2-capture-normalization-contract.ts
npx tsx tests/composite/test-nested-composite-capture-pins.ts
npx tsx tests/composite/test-stage3-p2w6-capture-vendor-graph.ts /tmp/P4W2-final-legacy.gia
GSTS_STAGE3_VENDOR_IMPL_GRAPH=1 npx tsx tests/composite/test-stage3-p2w6-capture-vendor-graph.ts /tmp/P4W2-final-vendor.gia
npx tsx tests/composite/test-stage3-p2w7-captured-connection-vendor-graph.ts /tmp/P4W2-p2w7.gia
GSTS_STAGE3_VENDOR_IMPL_GRAPH=1 npx tsx tests/composite/test-stage3-p2w7-captured-connection-vendor-graph.ts /tmp/P4W2-p2w7v.gia
npx tsx tests/composite/test-stage3-p2w11-nested-capture-vendor-graph.ts /tmp/P4W2-nested-capture-legacy.gia
GSTS_STAGE3_VENDOR_IMPL_GRAPH=1 npx tsx tests/composite/test-stage3-p2w11-nested-capture-vendor-graph.ts /tmp/P4W2-nested-capture-vendor.gia
git diff --check
```

用户核验候选（未注入）：

- `Beyond_Local_Export/P4W2-capture-normalization-vendor.gia`（B1 capture-only）
  SHA-256 `671d93b20afb2bb34cbbe09b0abd63911479e5fc38a7a0ef8fbe42c98d103b11`
- `Beyond_Local_Export/P4W2-nested-capture-vendor.gia`（nested capture）
  SHA-256 `44e3340f17c630cb12796ff6b873d76ba60ab251409c7adeba036c8653c919d9`

说明：同一 fixture 连续重生的字节 SHA 本身存在既有非确定性（P4-W2 前后都不稳）；自动证据以 focused
structural contract 为准，不以 SHA 字节全等证明行为。未改 ordinary resolver/factory/materializer、default
gate、legacy backend、布局、call lowerer 完整抽取。用户已确认两份候选的编辑器加载和可观察执行通过
（2026-07-14）；未注入；已提交。

## 最近完成：P4-W3

P4-W3 将 `__composite_call__` 的 SysGraph identity、sparse/capture/literal/connection 分类与 pin builder
抽为独立纯函数模块 `src/compiler/ir_to_gia_transform/lower_composite_call.ts`，并由
`buildCompositeAccessories()` / `buildImplGraphNodes()` 接入。用户已确认四份候选通过；未注入；已提交。

## 最近完成：P4-W4

P4-W4 将 CompositeDef 接口编码抽为独立纯函数模块
`src/compiler/ir_to_gia_transform/build_composite_definition.ts`，并由 `buildCompositeAccessories()` 接入。

输入 / 输出 contract：

```text
input:
  def.id / def.name / inflows / outflows / inputs / outputs
  implGraphId?                 // 默认 def.id + 10000
output:
  implGraphId
  compositeDef                 // ParameterFlow + ControlFlow + SysGraph identity + graphId relation
  definitionGraphUnit          // which=CompositeGraph；relatedIds[0].id = implGraphId
```

bool ParameterFlow 仍写 `enumId.val = 1`（R20）；非 bool 不写 `enumId`。ordinary lowerer / call lowerer /
capture normalization / compositePins overlay 不在本包。

已运行并通过：

```bash
npm run build
npx tsx tests/composite/test-stage3-p4w4-definition-interface-contract.ts
npx tsx tests/composite/test-composite-bool-input-gia.ts
npx tsx tests/composite/test-local-variable-impl-concrete-type.ts
npx tsx tests/composite/test-composite-sparse-named-input.ts
npx tsx tests/composite/test-composite-optional-call-inputs.ts
npx tsx tests/composite/test-nested-composite-outflow.ts
npx tsx tests/composite/test-nested-composite-capture-pins.ts
npx tsx tests/composite/test-stage3-p4w3-call-lowerer-contract.ts
npx tsx tests/composite/test-stage3-p4w2-capture-normalization-contract.ts
npx tsx tests/composite/test-stage3-p4w1-multi-inflow-outflow-vendor-graph.ts /tmp/P4W4-p4w1-b4-legacy.gia
GSTS_STAGE3_VENDOR_IMPL_GRAPH=1 npx tsx tests/composite/test-stage3-p4w1-multi-inflow-outflow-vendor-graph.ts /tmp/P4W4-p4w1-b4-vendor.gia
npx tsx tests/composite/test-stage3-p2w9-nested-call-vendor-graph.ts /tmp/P4W4-p2w9-legacy.gia
GSTS_STAGE3_VENDOR_IMPL_GRAPH=1 npx tsx tests/composite/test-stage3-p2w9-nested-call-vendor-graph.ts /tmp/P4W4-p2w9-vendor.gia
npx tsx tests/composite/test-stage3-p2w12-nested-sparse-input-vendor-graph.ts /tmp/P4W4-p2w12-legacy.gia
GSTS_STAGE3_VENDOR_IMPL_GRAPH=1 npx tsx tests/composite/test-stage3-p2w12-nested-sparse-input-vendor-graph.ts /tmp/P4W4-p2w12-vendor.gia
npx tsx tests/composite/test-stage3-p2w11-nested-capture-vendor-graph.ts /tmp/P4W4-p2w11-legacy.gia
GSTS_STAGE3_VENDOR_IMPL_GRAPH=1 npx tsx tests/composite/test-stage3-p2w11-nested-capture-vendor-graph.ts /tmp/P4W4-p2w11-vendor.gia
git diff --check
```

用户核验候选（未注入；用户 2026-07-14 确认编辑器加载与可观察执行通过；已归档）：

- `Beyond_Local_Export/真-测试通过/复合节点/P4W4-bool-definition-vendor.gia`（bool ParameterFlow / enumId）
  用户核验时 SHA-256 `fc56d8c9cdb8af62bfc83584a1e186bee3443ff9d4429ec77241000bd262a1fa`
- `Beyond_Local_Export/真-测试通过/复合节点/P4W4-multi-inflow-outflow-vendor.gia`（multi InFlow/OutFlow）
  用户核验时 SHA-256 `580e5f1ae0df4ac5abe2fee22c255e7800a088f1bea25e46689faf1e585f980f`
- `Beyond_Local_Export/真-测试通过/复合节点/P4W4-nested-sparse-vendor.gia`（nested sparse binding）
  用户核验时 SHA-256 `8314a4a4454b8503906a582762d29ad2befd683941436b8878a89592c17efeda`
- `Beyond_Local_Export/真-测试通过/复合节点/P4W4-nested-capture-vendor.gia`（nested capture route）
  用户核验时 SHA-256 `de770f551e69d6197b6d65d9cc8b58e9ccc0856f4d4335e284dfe4cf4ab15ff6`
- `Beyond_Local_Export/真-测试通过/复合节点/P4W4-nested-call-vendor.gia`（nested call flow sentinel）
  用户核验时 SHA-256 `75b9c29ab143684dae034a88f1ea3536598633543b463d49978f381898272ca1`

说明：本包是生产路径重构（CompositeDef interface 从 `composite.ts` 迁到独立 builder）。未改 ordinary
materializer、default gate、legacy backend、布局、capture/call 语义或 compositePins overlay 完整迁移。
未注入。用户确认通过后已归档；连续重生字节 SHA 仍可能因既有非确定性变化，自动证据以 focused structural
contract 为准。

## 最近完成：P4-W5

P4-W5 将 impl GraphUnit 的 `compositePins` overlay 抽为独立纯函数模块
`src/compiler/ir_to_gia_transform/build_composite_pins.ts`，并由 `buildCompositeAccessories()` 接入。

输入 / 输出 contract：

```text
input:
  boundaryPins                 // capture 归一化后的 IR 路由
  nodeIndexMap                 // IR id → encoded nodeIndex
  definition?                  // outer InFlow/OutFlow/InParam/OutParam indexes
  encodedNodes?                // materialised GraphNode list
  strictIntegrity?             // default true
  requirePhysicalPins?         // default false（生产默认）
output:
  encodedBoundaryPins          // 含 encodedInnerNodeId
  compositePins                // protobuf CompositePin[]；innerPin2 mirrors innerPin
```

完整性断言（生产默认）：outer definition pin 存在、encoded inner node 存在、物理路由不重复。
`inner-node-pin-exists` 保留为 opt-in（`requirePhysicalPins`），因为当前 materializer 对 capture/sparse
InParam、InFlow 目标、普通 OutFlow 终端和部分 pure-data OutParam 仍有意保留 pin hole；不得据此声称真实
GIA pin schema 全等。ordinary materializer、default gate、legacy backend、布局、call/capture/definition
语义不在本包。

已运行并通过：

```bash
npm run build
npx tsx tests/composite/test-stage3-p4w5-composite-pins-overlay-contract.ts
npx tsx tests/composite/test-stage3-p4w2-capture-normalization-contract.ts
npx tsx tests/composite/test-stage3-p4w3-call-lowerer-contract.ts
npx tsx tests/composite/test-stage3-p4w4-definition-interface-contract.ts
npx tsx tests/composite/test-nested-composite-capture-pins.ts
npx tsx tests/composite/test-nested-composite-outflow.ts
npx tsx tests/composite/test-composite-sparse-named-input.ts
npx tsx tests/composite/test-composite-optional-call-inputs.ts
npx tsx tests/composite/test-composite-bool-input-gia.ts
npx tsx tests/composite/test-local-variable-impl-concrete-type.ts
npx tsx tests/composite/test-stage3-p4w1-multi-inflow-outflow-vendor-graph.ts /tmp/P4W5-p4w1-b4-legacy.gia
GSTS_STAGE3_VENDOR_IMPL_GRAPH=1 npx tsx tests/composite/test-stage3-p4w1-multi-inflow-outflow-vendor-graph.ts /tmp/P4W5-p4w1-b4-vendor.gia
npx tsx tests/composite/test-stage3-p2w9-nested-call-vendor-graph.ts /tmp/P4W5-p2w9-legacy.gia
GSTS_STAGE3_VENDOR_IMPL_GRAPH=1 npx tsx tests/composite/test-stage3-p2w9-nested-call-vendor-graph.ts /tmp/P4W5-p2w9-vendor.gia
npx tsx tests/composite/test-stage3-p2w12-nested-sparse-input-vendor-graph.ts /tmp/P4W5-p2w12-legacy.gia
GSTS_STAGE3_VENDOR_IMPL_GRAPH=1 npx tsx tests/composite/test-stage3-p2w12-nested-sparse-input-vendor-graph.ts /tmp/P4W5-p2w12-vendor.gia
npx tsx tests/composite/test-stage3-p2w11-nested-capture-vendor-graph.ts /tmp/P4W5-p2w11-legacy.gia
GSTS_STAGE3_VENDOR_IMPL_GRAPH=1 npx tsx tests/composite/test-stage3-p2w11-nested-capture-vendor-graph.ts /tmp/P4W5-p2w11-vendor.gia
npx tsx tests/composite/test-stage3-p2w6-capture-vendor-graph.ts /tmp/P4W5-p2w6-legacy.gia
GSTS_STAGE3_VENDOR_IMPL_GRAPH=1 npx tsx tests/composite/test-stage3-p2w6-capture-vendor-graph.ts /tmp/P4W5-p2w6-vendor.gia
git diff --check
```

用户核验候选（未注入；用户 2026-07-14 确认编辑器加载与可观察执行通过；已归档）：

- `Beyond_Local_Export/真-测试通过/复合节点/P4W5-capture-vendor.gia`（B1 capture-only）
  用户核验时 SHA-256 `7deee3dde708f23026b48589932b3f3692ae18e6eb82c3f349e9a5dab24dcbfd`
- `Beyond_Local_Export/真-测试通过/复合节点/P4W5-nested-capture-vendor.gia`（nested capture route）
  用户核验时 SHA-256 `0fc511100bd384956c40bbbdbb6f093a9a95530942339a5621e370a607c2c690`
- `Beyond_Local_Export/真-测试通过/复合节点/P4W5-nested-sparse-vendor.gia`（nested sparse binding）
  用户核验时 SHA-256 `3bf6efd4370c92cc3eef12daa2900ea83b7f635b4e06c83a45b5800e68289a92`
- `Beyond_Local_Export/真-测试通过/复合节点/P4W5-multi-inflow-outflow-vendor.gia`（multi InFlow/OutFlow）
  用户核验时 SHA-256 `1f2f157190571e8f9aed0bb6a279d4315220385cf36f4e81e1a637879c890561`
- `Beyond_Local_Export/真-测试通过/复合节点/P4W5-nested-call-vendor.gia`（nested call flow sentinel）
  用户核验时 SHA-256 `eb72d853cb90a2f4865c4e1e56394060d3d6f59fe5bca507625cdad743ad75a7`

说明：本包是生产路径重构（compositePins 从 `composite.ts` 迁到独立 overlay builder）。未改 ordinary
materializer、default gate、legacy backend、布局、capture/call/definition 语义。未注入。用户确认通过后已归档；
连续重生字节 SHA 仍可能因既有非确定性变化，自动证据以 focused structural contract 为准。

## 最近完成：P4-W6

P4-W6 将 composite virtual anchors / impl layout 抽为独立纯函数模块
`src/compiler/ir_to_gia_transform/build_composite_layout.ts`，并由 `buildImplGraphNodes()` 接入。

输入 / 输出 contract：

```text
input:
  ordinaryNodes               // capture 归一化后的 ordinary + synthetic call 节点
  ordinaryEdges               // 已移除 capture 源边
  boundaryPins                // capture 归一化后的 IR 路由（InFlow 已重定向）
  compositeDefs?              // 仅用于 nested call 视觉高度估计
  execLaneSpacingScale?       // 默认 0.6
output:
  positions                   // 仅 ordinaryNodes 的 x/y；不含 virtual anchors
  virtualGraph                // 诊断用：anchors / extraDataConnections / layoutNodes
```

关键不变量：
- layout 只消费 capture-normalized graph + boundaryPins，不再读 raw `def.compositePins`；
- virtual anchors 仅喂给共享 `layout.ts`，不得编码进 GraphNode；
- 返回的 position map 只含 ordinary / synthetic call 节点；
- 不改变 node/pin/edge 语义，不改 nodeIndex、default gate、legacy backend。

同时：`buildImplGraphNodes` 的 OutFlow required-index 收集也改为消费 `boundaryPins`，与 layout /
compositePins overlay 同源。

已运行并通过：

```bash
npm run build
npx tsx tests/composite/test-stage3-p4w6-layout-isolation-contract.ts
npx tsx tests/composite/test-stage3-p4w2-capture-normalization-contract.ts
npx tsx tests/composite/test-stage3-p4w3-call-lowerer-contract.ts
npx tsx tests/composite/test-stage3-p4w4-definition-interface-contract.ts
npx tsx tests/composite/test-stage3-p4w5-composite-pins-overlay-contract.ts
npx tsx tests/composite/test-nested-composite-capture-pins.ts
npx tsx tests/composite/test-nested-composite-outflow.ts
npx tsx tests/composite/test-composite-sparse-named-input.ts
npx tsx tests/composite/test-composite-optional-call-inputs.ts
npx tsx tests/composite/test-composite-bool-input-gia.ts
npx tsx tests/composite/test-stage3-p4w1-multi-inflow-outflow-vendor-graph.ts /tmp/P4W6-p4w1-b4-legacy.gia
GSTS_STAGE3_VENDOR_IMPL_GRAPH=1 npx tsx tests/composite/test-stage3-p4w1-multi-inflow-outflow-vendor-graph.ts /tmp/P4W6-p4w1-b4-vendor.gia
npx tsx tests/composite/test-stage3-p2w6-capture-vendor-graph.ts /tmp/P4W6-p2w6-legacy.gia
GSTS_STAGE3_VENDOR_IMPL_GRAPH=1 npx tsx tests/composite/test-stage3-p2w6-capture-vendor-graph.ts /tmp/P4W6-p2w6-vendor.gia
npx tsx tests/composite/test-stage3-p2w11-nested-capture-vendor-graph.ts /tmp/P4W6-p2w11-legacy.gia
GSTS_STAGE3_VENDOR_IMPL_GRAPH=1 npx tsx tests/composite/test-stage3-p2w11-nested-capture-vendor-graph.ts /tmp/P4W6-p2w11-vendor.gia
npx tsx tests/composite/test-stage3-p2w9-nested-call-vendor-graph.ts /tmp/P4W6-p2w9-legacy.gia
GSTS_STAGE3_VENDOR_IMPL_GRAPH=1 npx tsx tests/composite/test-stage3-p2w9-nested-call-vendor-graph.ts /tmp/P4W6-p2w9-vendor.gia
npx tsx tests/composite/test-stage3-p2w12-nested-sparse-input-vendor-graph.ts /tmp/P4W6-p2w12-legacy.gia
GSTS_STAGE3_VENDOR_IMPL_GRAPH=1 npx tsx tests/composite/test-stage3-p2w12-nested-sparse-input-vendor-graph.ts /tmp/P4W6-p2w12-vendor.gia
git diff --check
```

用户核验候选（未注入；用户 2026-07-14 确认编辑器加载与可观察执行通过；已归档；清理根目录残留后重生）：

- `Beyond_Local_Export/真-测试通过/复合节点/P4W6-capture-vendor.gia`（B1 capture-only）
  用户核验时 SHA-256 `338906e9ec90bde1976daa5c4a089ae51627ab08e52fb24dba51b316d85eecee`
- `Beyond_Local_Export/真-测试通过/复合节点/P4W6-nested-capture-vendor.gia`（nested capture route）
  用户核验时 SHA-256 `e87090229e6dc00a158e290116a570aa7149ad775c4715a949d7ba1aafbb1562`
- `Beyond_Local_Export/真-测试通过/复合节点/P4W6-nested-sparse-vendor.gia`（nested sparse binding）
  用户核验时 SHA-256 `72c04ad8e376eb38902853810e1c40b01f175408961d15a473ceeaca91aa22fe`
- `Beyond_Local_Export/真-测试通过/复合节点/P4W6-multi-inflow-outflow-vendor.gia`（multi InFlow/OutFlow）
  用户核验时 SHA-256 `4a377264ee68c24797f6a302ebc31afc7799eac42237dae3c80af3704812abf2`
- `Beyond_Local_Export/真-测试通过/复合节点/P4W6-nested-call-vendor.gia`（nested call flow sentinel）
  用户核验时 SHA-256 `edb60eaa3bba903ff56daec2bb39983b16a2786308ac19fd6eb0995a80f8b3b4`

说明：本包是生产路径重构（impl layout 从 `composite.ts` 迁到独立 boundary builder，并强制消费
capture-normalized boundaryPins）。未改 ordinary materializer、default gate、legacy backend、
capture/call/definition/compositePins 语义。未注入。用户确认通过后已归档；连续重生字节 SHA 仍可能因既有非确定性变化，
自动证据以 focused structural contract 为准。

## 最近完成（已提交）：P4-W7

P4-W7 将 `composite.ts` 收口为 boundary orchestration + ordinary impl backend 接线：

- 新增 `COMPOSITE_ORCHESTRATION_CONTRACT`（pipeline / boundaryModules /
  ordinaryPinBuilderForbiddenNodeTypes / default gate 状态）；
- `buildImplNodePins` 变为 ordinary-only：遇 `__composite_call__` / `__composite_capture__` 直接失败；
  删除嵌套 call lowerer 与 capture-node skip 外壳；
- call 路由只发生在 `buildImplGraphNodes` orchestration 层（`buildCompositeCallPins`）；
- arg 级 `capture: true` 仍只跳过 physical InParam；
- Phase 4 退出条件全部满足；阶段切换仍须用户确认。

已运行并通过：

```bash
npm run build
npx tsx tests/composite/test-stage3-p4w7-orchestration-contract.ts
npx tsx tests/composite/test-stage3-p4w2-capture-normalization-contract.ts
npx tsx tests/composite/test-stage3-p4w3-call-lowerer-contract.ts
npx tsx tests/composite/test-stage3-p4w4-definition-interface-contract.ts
npx tsx tests/composite/test-stage3-p4w5-composite-pins-overlay-contract.ts
npx tsx tests/composite/test-stage3-p4w6-layout-isolation-contract.ts
npx tsx tests/composite/test-nested-composite-capture-pins.ts
npx tsx tests/composite/test-nested-composite-outflow.ts
npx tsx tests/composite/test-composite-sparse-named-input.ts
npx tsx tests/composite/test-composite-optional-call-inputs.ts
npx tsx tests/composite/test-composite-bool-input-gia.ts
npx tsx tests/composite/test-stage3-p4w1-multi-inflow-outflow-vendor-graph.ts /tmp/P4W7-p4w1-b4-legacy.gia
GSTS_STAGE3_VENDOR_IMPL_GRAPH=1 npx tsx tests/composite/test-stage3-p4w1-multi-inflow-outflow-vendor-graph.ts <候选>
npx tsx tests/composite/test-stage3-p2w6-capture-vendor-graph.ts /tmp/P4W7-p2w6-legacy.gia
GSTS_STAGE3_VENDOR_IMPL_GRAPH=1 npx tsx tests/composite/test-stage3-p2w6-capture-vendor-graph.ts <候选>
npx tsx tests/composite/test-stage3-p2w11-nested-capture-vendor-graph.ts /tmp/P4W7-p2w11-legacy.gia
GSTS_STAGE3_VENDOR_IMPL_GRAPH=1 npx tsx tests/composite/test-stage3-p2w11-nested-capture-vendor-graph.ts <候选>
npx tsx tests/composite/test-stage3-p2w9-nested-call-vendor-graph.ts /tmp/P4W7-p2w9-legacy.gia
GSTS_STAGE3_VENDOR_IMPL_GRAPH=1 npx tsx tests/composite/test-stage3-p2w9-nested-call-vendor-graph.ts <候选>
npx tsx tests/composite/test-stage3-p2w12-nested-sparse-input-vendor-graph.ts /tmp/P4W7-p2w12-legacy.gia
GSTS_STAGE3_VENDOR_IMPL_GRAPH=1 npx tsx tests/composite/test-stage3-p2w12-nested-sparse-input-vendor-graph.ts <候选>
git diff --check
```

用户核验候选（未注入；用户 2026-07-14 确认编辑器加载与可观察执行通过；已归档）：

- `Beyond_Local_Export/真-测试通过/复合节点/P4W7-capture-vendor.gia`（B1 capture-only）
  用户核验时 SHA-256 `48b428233b4487ae7281d13788e51b6534d23441ff5cd1969fd70bcb10bad05d`
- `Beyond_Local_Export/真-测试通过/复合节点/P4W7-nested-capture-vendor.gia`（nested capture route）
  用户核验时 SHA-256 `805f45c51d1c017712e289b7d1ed6e9d9b277854c1e0b9539e95bd2dff8d93d7`
- `Beyond_Local_Export/真-测试通过/复合节点/P4W7-nested-sparse-vendor.gia`（nested sparse binding）
  用户核验时 SHA-256 `b67c1077a9f00b8dc6333930f9aa77ab51b589a74f357bb615b0974f60a6969d`
- `Beyond_Local_Export/真-测试通过/复合节点/P4W7-multi-inflow-outflow-vendor.gia`（multi InFlow/OutFlow）
  用户核验时 SHA-256 `901baf90dbf6cd374b1498d9ad9e4cede4df2b866e54dd76516439049c746dd0`
- `Beyond_Local_Export/真-测试通过/复合节点/P4W7-nested-call-vendor.gia`（nested call flow sentinel）
  用户核验时 SHA-256 `d64611d80a435f333ae1c6255ef4cba559fcde15a61ff8fab79ee50e5eba0cde`

说明：本包是生产路径重构（ordinary pin builder 去掉 capture/call 节点分支；orchestration contract）。
未改 ordinary materializer 语义、default gate、legacy backend 删除、布局算法、capture/call/definition/
compositePins 业务语义。未注入。用户确认通过后已归档；连续重生字节 SHA 仍可能因既有非确定性变化，
自动证据以 focused structural contract 为准。Phase 4 checkpoint：
[checkpoints/phase-4-boundary-isolation.md](checkpoints/phase-4-boundary-isolation.md)。

## 最近完成（已提交）：P5-W1

P5-W1 建立可复用的 ordinary legacy call-site inventory，并给 boundary 模块加 no-legacy 静态守卫。
不删除 handwritten backend，不改 default gate，不注入，不生成新游戏候选。

交付：

```text
src/compiler/ir_to_gia_transform/legacy_ordinary_inventory.ts
  COMPOSITE_LEGACY_INVENTORY_CONTRACT
  LEGACY_ORDINARY_HELPER_SYMBOLS (22)
  LEGACY_ORDINARY_CALL_SITES (13 families)
  BOUNDARY_NO_LEGACY_FORBIDDEN_PATTERNS
  CALL_BOUNDARY_ALLOWED_SYNTHETIC_PIN_HELPERS

src/compiler/ir_to_gia_transform/composite.ts
  COMPOSITE_ORCHESTRATION_CONTRACT.legacyInventory → inventory contract
  re-export inventory helpers

tests/composite/test-stage3-p5w1-legacy-inventory-contract.ts
  inventory completeness + boundary no-legacy static asserts
```

已证明（自动）：

- 5 个 boundary 模块不含 ordinary `buildConnPin` / `buildLiteralPin` / `buildPlaceholderPin` /
  `wrapConcreteValueForNodeInput` / `needsConcreteWrapping` / `resolveImplNodeId` /
  `buildImplNodePins` / `bConcreteValue`；
- call lowerer 仅保留 synthetic `buildCallConnPin` / `buildCallLiteralPin` 等 boundary pin helpers；
- `composite.ts` 仍承载 13 类 legacy call-site（identity、pin、concrete wrapper、legacy materialize、
  vendor-gate bridge）；删除条件已写入 inventory，供后续包逐项消减；
- default gate 仍为 false；`legacyOrdinaryBackendPresent` 仍为 true。

未证明 / 非目标：

- 未删除任何 legacy helper；
- 未默认开启 vendor shared backend；
- 无新游戏候选、未注入、无真实 GIA/wire 结论；
- root ordinary 能力清单（P5 后续包）未建立。

已运行并通过：

```bash
npm run build
npx tsx tests/composite/test-stage3-p5w1-legacy-inventory-contract.ts
npx tsx tests/composite/test-stage3-p4w7-orchestration-contract.ts
npx tsx tests/composite/test-stage3-resolved-node-contract.ts
git diff --check
```

## 最近完成（已提交）：P5-W2

P5-W2 为 shared vendor-impl Graph 建立正式 opt-in beta 配置/CLI/诊断入口；默认仍为 handwritten；
不删除 legacy；不改 default gate；未注入。用户 2026-07-14 确认编辑器加载与可观察执行通过。

交付：

```text
src/compiler/ir_to_gia_transform/stage3_backend.ts
  STAGE3_BACKEND_CONTRACT
  resolveStage3ImplBackend / applyStage3ImplBackendEnv / formatStage3BackendDiagnostic
  isSharedVendorImplGraphEnabled

src/compiler/gsts_config.ts
  GstsStage3Options.vendorImplGraphBeta
  options.stage3

src/cli/gsts.ts
  --stage3-shared-impl-beta
  applyStage3BackendSurfaces（config + CLI → env + 诊断）

src/i18n/locales/{zh-CN,en-US}/main.json
  optStage3SharedImplBeta / warnStage3SharedImplBeta

src/compiler/ir_to_gia_transform/composite.ts
  生产路径经 isSharedVendorImplGraphEnabled()
  COMPOSITE_ORCHESTRATION_CONTRACT.stage3Backend

tests/composite/test-stage3-p5w2-beta-config-contract.ts
```

优先级 / 入口：

```text
1. explicit API option
2. CLI --stage3-shared-impl-beta
3. config options.stage3.vendorImplGraphBeta
4. env GSTS_STAGE3_VENDOR_IMPL_GRAPH=1（内部/测试兼容）
5. default = legacy-handwritten
```

已证明（自动）：

- 默认 backend 仍为 handwritten；`defaultVendorImplGraphGate=false`；
- config / CLI / env / explicit 优先级与 force-off 行为；
- 开启 beta 时诊断包含 backend、source、highRiskPending、回退说明；
- env 兼容 gate 仍可驱动既有 vendor-gated sentinel；
- P5-W1 inventory 与 P4-W7 orchestration contract 未破坏。

未证明 / 非目标：

- 未删除任何 legacy helper；
- 未默认开启 vendor gate；
- 未注入；无真实 GIA/wire 全等结论；
- 用户编辑器核验已通过（2026-07-14）；未注入；无真实 GIA/wire 全等结论。

已运行并通过：

```bash
npm run build
npx tsx tests/composite/test-stage3-p5w2-beta-config-contract.ts
npx tsx tests/composite/test-stage3-p5w1-legacy-inventory-contract.ts
npx tsx tests/composite/test-stage3-p4w7-orchestration-contract.ts
npx tsx tests/composite/test-stage3-p2w6-capture-vendor-graph.ts /tmp/P5W2-p2w6-legacy.gia
GSTS_STAGE3_VENDOR_IMPL_GRAPH=1 npx tsx tests/composite/test-stage3-p2w6-capture-vendor-graph.ts /tmp/P5W2-p2w6-vendor.gia
GSTS_STAGE3_VENDOR_IMPL_GRAPH=1 npx tsx tests/composite/test-stage3-p4w1-multi-inflow-outflow-vendor-graph.ts /tmp/P5W2-p4w1-b4-vendor.gia
git diff --check
node dist/src/cli/gsts.js --help   # 可见 --stage3-shared-impl-beta
```

用户核验候选（未注入；用户 2026-07-14 确认编辑器加载与可观察执行通过；核验时重生 SHA）：

- `Beyond_Local_Export/P5W2-capture-vendor.gia`（B1 capture-only）
  SHA-256 `6aae55dd7235a8ae390d9f877c33fc229f23fd72f5fdd55126e0fb25f7749ccd`
- `Beyond_Local_Export/P5W2-nested-capture-vendor.gia`（nested capture route）
  SHA-256 `631850977f1c2b15c3c9d3c13c5943f2e8e1de4cec40033586c5647f203ab7c2`
- `Beyond_Local_Export/P5W2-nested-sparse-vendor.gia`（nested sparse binding）
  SHA-256 `7caeb6fc22a4943766c1e2986e43827975ab0bec4f2b79fe317a1c93d1644adc`
- `Beyond_Local_Export/P5W2-multi-inflow-outflow-vendor.gia`（multi InFlow/OutFlow）
  SHA-256 `ec6aa74850b341128d4e3131f577b3ecfbb46e18ba99f331374398b15a45c208`
- `Beyond_Local_Export/P5W2-nested-call-vendor.gia`（nested call flow sentinel）
  SHA-256 `1131c2d9de6910c38bfa82a3e0a528d4dd8ad090b536592b4ceea4d7a7b6ed71`

说明：本包是配置/诊断 surface，不改变 ordinary materializer 业务语义、layout、capture/call/definition。
开启 beta 后走既有 shared vendor path；候选用于确认“正式入口启用后的 shared backend”仍可编辑器加载。
连续重生字节 SHA 仍可能因既有非确定性变化，自动证据以 focused contract 为准。

## 最近完成（已提交）：P5-W3

P5-W3 建立可机读/可测的 root ordinary 能力清单与例外审计；不删除 legacy；不改 default gate；
未注入；本包不生成新游戏候选（仅审计）。用户编辑器核验以同批 P5-W2 候选通过为准。

交付：

```text
src/compiler/ir_to_gia_transform/root_ordinary_capability_inventory.ts
  ROOT_ORDINARY_CAPABILITY_CONTRACT
  ROOT_ORDINARY_CAPABILITIES（19 项：6 shared-path / 8 named-shared-adapter / 3 boundary / 2 root-unsupported）
  shared variant 表、pin-hole / special-arg / typed-identity adapter 表
  high-risk pending families（与 P5-W2 同源）

src/compiler/ir_to_gia_transform/composite.ts
  COMPOSITE_ORCHESTRATION_CONTRACT.rootOrdinaryCapabilities
  re-export inventory helpers

tests/composite/test-stage3-p5w3-root-ordinary-capability-inventory.ts
```

分类摘要（ADR-013）：

```text
shared-path:
  generic vendor factory、ordinary edges、generic literals、variable identity、DTC、same-type scalar binary
named-shared-adapter:
  SPECIAL_NODE_IDS/MAPPINGS、mode-specific identity、root typed-identity、pin-hole layouts、
  special-arg layouts（signal/assembly/multiple_branches）、graphValues、affiliations
boundary:
  __composite_call__、__composite_capture__、definition/pins/layout overlay
root-unsupported:
  enum signal parameters；heterogeneous arithmetic/comparison（不声称已支持）
```

已证明（自动）：

- 每项能力已分类；shared/adapter 必须命名共享路径；boundary 不得声称 ordinary shared path；
- shared variant 表与 `usesSharedVariantResolution` 一致；
- root pin-hole / special-arg / typed-identity adapter 在 `index.ts` / `node_id.ts` 仍有活表面；
- high-risk pending 与 P5-W2 diagnostics 同源；
- default gate 仍为 false；legacy backend 仍存在；
- P5-W1 / P5-W2 / P4-W7 / resolved-node contract 未破坏。

未证明 / 非目标：

- 不是全 API 游戏验证声明；
- 未删除任何 legacy helper；未默认开启 vendor gate；
- 无新游戏候选、未注入、无真实 GIA/wire 结论；
- root named adapter 尚未提升为独立共享模块（仅审计记录）。

已运行并通过：

```bash
npm run build
npx tsx tests/composite/test-stage3-p5w3-root-ordinary-capability-inventory.ts
npx tsx tests/composite/test-stage3-p5w2-beta-config-contract.ts
npx tsx tests/composite/test-stage3-p5w1-legacy-inventory-contract.ts
npx tsx tests/composite/test-stage3-p4w7-orchestration-contract.ts
npx tsx tests/composite/test-stage3-resolved-node-contract.ts
git diff --check
```

说明：P5-W3 是审计/清单包，不改 ordinary materializer 业务语义。用户编辑器核验以同批 P5-W2 候选通过为准（见上节）。

## 最近完成（已提交）：P5-W4

P5-W4 删除已空的 legacy typed-identity adapter 表面；不改 default gate；不删除 handwritten
pin/materialize 主路径。用户 2026-07-15 确认编辑器加载与可观察执行通过；未注入；已归档。

交付：

```text
src/compiler/ir_to_gia_transform/composite.ts
  删除 LEGACY_IMPL_TYPED_IDENTITY_NODE_TYPES
  删除 usesLegacyImplTypedIdentityAdapter
  删除 resolveLegacyImplTypedNodeId
  删除 legacyImplValueTypeSuffix
  node-graph getter/setter concrete id 仅来自 shared resolveNodeIdentity()
  （result.gvConcreteNid 字段仍作为 pin/materialize 的 shared concrete 载体）

src/compiler/ir_to_gia_transform/legacy_ordinary_inventory.ts
  移除 helper 符号与 legacy-typed-identity-adapter call-site
  remainingHelpers=19；remainingCallSites=12

tests/composite/test-stage3-p5w4-empty-typed-identity-adapter-removal.ts
tests/composite/test-stage3-resolved-node-contract.ts
  改为静态断言 adapter 表面已删除
```

已证明（自动）：

- adapter 四符号在 `composite.ts` 中不存在；
- inventory 不再列出 typed-identity-adapter family；
- node-graph float/vec3 getter/setter concrete id 仍由 shared resolver 给出；
- default gate 仍为 false；legacy pin/materialize 仍存在；
- P5-W1 / P5-W2 / P5-W3 / P4-W7 / resolved-node / P2-W6 / P4-W1 B4 sentinel 通过。

未证明 / 非目标：

- 未删除 handwritten pin/materialize 主路径；
- 未默认开启 vendor gate；
- 无真实 GIA/wire 全等结论；未注入；
- residual concreteWrapped identity（`resolveImplOrdinaryConcreteNodeId`）仍在，属 P5-W5。

已运行并通过（提交前重跑）：

```bash
npm run build
npx tsx tests/composite/test-stage3-p5w4-empty-typed-identity-adapter-removal.ts
npx tsx tests/composite/test-stage3-p5w1-legacy-inventory-contract.ts
npx tsx tests/composite/test-stage3-p5w3-root-ordinary-capability-inventory.ts
npx tsx tests/composite/test-stage3-resolved-node-contract.ts
npx tsx tests/composite/test-stage3-p5w2-beta-config-contract.ts
npx tsx tests/composite/test-stage3-p4w7-orchestration-contract.ts
npx tsx tests/composite/test-stage3-p2w6-capture-vendor-graph.ts /tmp/P5W4-p2w6-legacy.gia
GSTS_STAGE3_VENDOR_IMPL_GRAPH=1 npx tsx tests/composite/test-stage3-p2w6-capture-vendor-graph.ts /tmp/P5W4-p2w6-vendor.gia
GSTS_STAGE3_VENDOR_IMPL_GRAPH=1 npx tsx tests/composite/test-stage3-p4w1-multi-inflow-outflow-vendor-graph.ts /tmp/P5W4-p4w1-b4-vendor.gia
git diff --check
```

用户核验候选（未注入；用户 2026-07-15 确认编辑器加载与可观察执行通过；已归档）：

- `Beyond_Local_Export/真-测试通过/复合节点/P5W4-capture-vendor.gia`（B1 capture-only）
  SHA-256 `7d37a964fe98377be35ef97df1ea68029efe4627a55d84bca28d7f16b2e231db`
- `Beyond_Local_Export/真-测试通过/复合节点/P5W4-nested-capture-vendor.gia`（nested capture route）
  SHA-256 `52416110d962b58df72f6eab1386e9ff62589d42433dfeb8cb6dcb17ffcda79d`
- `Beyond_Local_Export/真-测试通过/复合节点/P5W4-nested-sparse-vendor.gia`（nested sparse binding）
  SHA-256 `12213296143e4cb7b083cb86b7de19586dfdffa59a6b74028a01c788f4fce0a0`
- `Beyond_Local_Export/真-测试通过/复合节点/P5W4-multi-inflow-outflow-vendor.gia`（multi InFlow/OutFlow）
  SHA-256 `0fafd5de8d5e345f66e1c0209a9829b5dcecc7969c434c825b2bbc3eec0b6a14`
- `Beyond_Local_Export/真-测试通过/复合节点/P5W4-nested-call-vendor.gia`（nested call flow sentinel）
  SHA-256 `aaeb529e1206c1b0c2e7e999000f6bcbcc4b9cca8a6c87f95a60caeb464bbd00`

说明：本包删除的是已空 adapter（原先恒返回 undefined）。node-graph concrete id 仍走 shared resolver。
连续重生字节 SHA 仍可能因既有非确定性变化，自动证据以 focused structural contract 为准。

## 最近完成：P5-W6

P5-W6（grilling W1）建立可机读的 root→shared-beta ordinary 覆盖矩阵，并在 shared beta 下自动探测
residual concrete + generic `print_string`。不改生产编码路径，不切 default gate，不删 legacy，不注入。

Grilling 共享理解（用户确认 2026-07-15）：

```text
A  能力完成（shared 表面能编能跑；非默认切换/删 legacy）
A4 分层证据（默认自动合同；哨兵升级编辑器/游戏）
S4 完成表面 = shared beta；默认旧路只保历史哨兵
P3 覆盖 root 今天能编的全部 ordinary（含 named adapter）
M3 一次共享主路径 + 可机读矩阵；禁止按 API 流水线实现
C4 行通过默认 = 结构合同 + 无 composite 私有 ordinary 分叉
I4 行来自 root 活代码表面，映射 inventory 分类
F4 ordinary 失败只修共享层；boundary 可改 boundary 模块
W1/E3 本包只建矩阵 + shared-beta 自动探测
```

交付：

```text
src/compiler/ir_to_gia_transform/root_impl_ordinary_coverage_matrix.ts
  ROOT_IMPL_ORDINARY_COVERAGE_CONTRACT
  ORDINARY_COVERAGE_GRILLING_DECISIONS
  RESIDUAL_CONCRETE_WRAPPED_NODE_TYPES（14）
  listStaticOrdinaryCoverageRows / classifyStaticCoverageStatuses

src/compiler/ir_to_gia_transform/root_impl_ordinary_coverage_probe.ts
  runOrdinaryCoverageProbes / encodeResidualAndGenericFixtureOnce

src/compiler/ir_to_gia_transform/composite.ts
  COMPOSITE_ORCHESTRATION_CONTRACT.ordinaryCoverageMatrix
  re-export matrix helpers（不 re-export probe，避免 index↔composite 环）

tests/composite/test-stage3-p5w6-ordinary-coverage-matrix.ts
```

自动探测结果（shared beta，2026-07-15）：

```text
total=73 green=32 red=0 unknown=41
generic-ordinary: green=1
variable: green=6
dtc: green=1
scalar-binary: green=9
residual-concrete: green=13 unknown=1（enumerations_equal）
boundary: green=2
pin-hole/special-arg/typed-identity/mode/special-id/graph-container/root-unsupported: unknown
```

已证明（自动）：

- 矩阵行从 root 活表面抽出并映射 inventory 分类；
- residual 14 与 shared 同型标量二进制 9 互斥且与 `usesSharedVariantResolution` 一致；
- shared beta 下 residual（除 `enumerations_equal`）+ `print_string` 编码探测绿；
- default gate 仍为 false；legacy backend 仍存在；生产 ordinary 编码路径未改；
- P5-W1 / P5-W3 / P4-W7 focused contract 未破坏。

未证明 / 非目标：

- 不宣称 P3 能力完成（unknown=41，含 named adapter 与 enum residual）；
- 未迁 residual identity 到 shared resolver（旧 P5-W5 议题并入矩阵调度）；
- 未默认开启 vendor gate；未删除 handwritten pin/materialize；
- 无新游戏候选、未注入、无真实 GIA/wire 全等结论；无用户编辑器核验义务。

已运行并通过：

```bash
npm run build
npx tsx tests/composite/test-stage3-p5w6-ordinary-coverage-matrix.ts
npx tsx tests/composite/test-stage3-p5w1-legacy-inventory-contract.ts
npx tsx tests/composite/test-stage3-p5w3-root-ordinary-capability-inventory.ts
npx tsx tests/composite/test-stage3-p4w7-orchestration-contract.ts
git diff --check
```

说明：旧 STATUS 的 P5-W5（residual concreteWrapped identity 收口）被矩阵调度取代；
P5-W7 已按最高优先族把 residual scalar identity 迁入 shared resolver（见下节）。

## 最近完成：P5-W7

P5-W7 将矩阵 residual-concrete 中 13 个 scalar residual ordinary 身份迁入 shared
`resolveNodeIdentity`；`enumerations_equal` 仍为 residual-concrete unknown。
生产 ordinary concrete identity 接线已改；default gate 未切；handwritten pin/materialize 未删。
用户 2026-07-16 确认编辑器加载与可观察执行通过；已归档到 `真-测试通过/复合节点`；未注入；待提交。

交付：

```text
src/compiler/ir_to_gia_transform/resolved_node.ts
  usesSharedResidualScalarResolution / usesSharedOrdinaryConcreteIdentity
  residual scalar typed + generic-only shared identity resolution

src/compiler/ir_to_gia_transform/composite.ts
  ordinaryConcreteNid 对 residual scalar 走 sharedConcreteNid

src/compiler/ir_to_gia_transform/node_id.ts
  root resolveGiaNodeId 对 residual scalar 委托 shared resolver

src/compiler/ir_to_gia_transform/root_impl_ordinary_coverage_matrix.ts
  residual-scalar family（13）shared-path green
  residual-concrete 仅 enumerations_equal（unknown）

src/compiler/ir_to_gia_transform/root_ordinary_capability_inventory.ts
  ROOT_SHARED_RESIDUAL_SCALAR_NODE_TYPES + shared-residual-scalar-identity

tests/composite/test-stage3-p5w7-residual-scalar-shared-identity.ts
```

自动探测结果（shared beta，2026-07-16）：

```text
total=73 green=32 red=0 unknown=41
residual-scalar: green=13
residual-concrete: unknown=1（enumerations_equal）
```

已证明（自动 + 用户编辑器）：

- 13 residual scalar 在 root/impl 使用 shared identity；typed 族 int/float concrete 与 generic-only 族 generic id 正确；
- composite ordinaryConcreteNid 对 residual scalar 不再调用 resolveImplOrdinaryConcreteNodeId；
- 矩阵 residual-scalar 行 sharedIdentity=true / green；enumerations_equal 仍 residual-concrete unknown；
- default gate 仍 false；legacy pin/materialize 主路径未删除；
- focused：P5-W7 / P5-W6 / P5-W3 / P5-W1 / P4-W7 / resolved-node / P2-W6 / P4-W1 B4；
- 用户 2026-07-16 确认主 residual scalar 候选 + 5 份 boundary sentinel 编辑器加载与可观察执行通过。

未证明 / 非目标：

- enumerations_equal residual 未迁移；
- 未默认开启 vendor gate；未删除 handwritten pin/materialize；
- 未注入；无真实 GIA/wire 全等结论。

已运行并通过：

```bash
npm run build
npx tsx tests/composite/test-stage3-p5w7-residual-scalar-shared-identity.ts
npx tsx tests/composite/test-stage3-p5w6-ordinary-coverage-matrix.ts
npx tsx tests/composite/test-stage3-p5w3-root-ordinary-capability-inventory.ts
npx tsx tests/composite/test-stage3-resolved-node-contract.ts
npx tsx tests/composite/test-stage3-p5w1-legacy-inventory-contract.ts
npx tsx tests/composite/test-stage3-p4w7-orchestration-contract.ts
npx tsx tests/composite/test-stage3-p2w6-capture-vendor-graph.ts /tmp/P5W7-p2w6-legacy.gia
GSTS_STAGE3_VENDOR_IMPL_GRAPH=1 npx tsx tests/composite/test-stage3-p2w6-capture-vendor-graph.ts /tmp/P5W7-p2w6-vendor.gia
GSTS_STAGE3_VENDOR_IMPL_GRAPH=1 npx tsx tests/composite/test-stage3-p4w1-multi-inflow-outflow-vendor-graph.ts /tmp/P5W7-p4w1-b4-vendor.gia
git diff --check
```

用户核验候选（未注入；用户 2026-07-16 确认编辑器加载与可观察执行通过；已归档）：

- `Beyond_Local_Export/真-测试通过/复合节点/P5W7-residual-scalar-shared-vendor.gia`（主 residual scalar）
  SHA-256 `ed6f566a441a51f21044b905b671cffffb71102357db403c1dfe92c61a0c8001`
- `Beyond_Local_Export/真-测试通过/复合节点/P5W7-capture-vendor.gia`
  SHA-256 `7f61a8e2f21cb56db9c42d01ca73fd7c5674cbe92208612d75a43b18da9bc675`
- `Beyond_Local_Export/真-测试通过/复合节点/P5W7-nested-capture-vendor.gia`
  SHA-256 `4ab931348b6552308198e5cf4f95f6f42060dc1ff5e21560d9b726f8c5f2ec74`
- `Beyond_Local_Export/真-测试通过/复合节点/P5W7-nested-sparse-vendor.gia`
  SHA-256 `35108d3d075951225d6dc1ea612667bf19317d21ae49cd8fdae645c8559faf15`
- `Beyond_Local_Export/真-测试通过/复合节点/P5W7-multi-inflow-outflow-vendor.gia`
  SHA-256 `ef5ea6f781253cde2741e8fa80f80ffd5693243896f624c703bb692e81705e14`
- `Beyond_Local_Export/真-测试通过/复合节点/P5W7-nested-call-vendor.gia`
  SHA-256 `238c990cbcb0cb7bddc9218151f8e23912d355d603a85a58958f9b3e821bd26a`

说明：本包是 residual scalar ordinary identity 共享路径迁移。未改 default gate、capture/call/layout、
handwritten pin/materialize 删除。连续重生字节 SHA 仍可能因既有非确定性变化，自动证据以 focused
structural contract 为准。

## 当前唯一工作包：P5-W8

```text
工作包：P5-W8 — enumerations_equal residual 身份迁 shared resolver
优先级类别：架构阻塞 / fallback-vendor gap（矩阵 residual-concrete 唯一剩余）
状态：待实现；P5-W7 用户核验通过并归档，待提交
解除的上层阻塞：enumerations_equal 仍依赖 composite resolveImplOrdinaryConcreteNodeId /
  root typed-identity adapter；矩阵 residual-concrete unknown=1。
输入与修改范围：enumerations_equal 共享 enum identity resolution；更新矩阵/inventory/focused；
  STATUS/Phase 5；必要时最小 enum 可执行 fixture。
最小观察或失败基线：P5-W7 后 residual-concrete 仅 enumerations_equal unknown；
  residual-scalar green=13；legacy helpers 仍含 resolveImplOrdinaryConcreteNodeId。
完成条件：enumerations_equal 在 shared beta 下 unknown → green（C4），或具名 shared adapter +
  删除条件；focused contract 通过；触及生产路径则用户编辑器核验。
实际验证命令：实现时确定；至少 npm run build +
  npx tsx tests/composite/test-stage3-p5w6-ordinary-coverage-matrix.ts +
  residual/enum focused + git diff --check。
回滚边界：仅 enumerations_equal shared identity/adapter/probe；不切 default gate；
  不整包删除 handwritten pin/materialize。
明确非目标：默认开启 vendor gate、全量 unknown 清完、注入、改 capture/call/layout、
  composite 专属 ordinary 补丁。
后续候选（非当前工作包）：
  pin-hole / special-arg / typed-identity 其余 unknown；legacy inventory 分项删除；
  default 切换（须用户批准）。
用户闸门：若触及 default gate / 主路径 legacy 删除 / 注入，必须停止。
```

工作包排序与例外分类见 [工作包选择协议](work-package-selection.md)。map、注入、覆盖真实参考、删除/清理、默认 gate、
legacy 删除、类型/边界语义变更仍须先取得用户确认。

## 新会话最小恢复

1. 读取 `EXECUTION.md`、本文件、当前 Phase 文档、`migration-invariants.md` 及与当前包直接相关的 ADR。
2. 检查 branch/status/log；用 Git 判断工作树与最近提交，**不要**到 STATUS 找 commit SHA。
   若工作树有无法由当前包解释的改动，先停止并报告。若含 `??`，按 EXECUTION 运行 untracked 清单。
3. 仅在当前包涉及编辑器协作时读取 `COLLABORATION-PLAYBOOK.md`；仅在维护手册时读取其 maintenance 文档。
4. 按任务加载工作包历史、验证矩阵、真实 GIA、源码和测试；不要以历史归档代替当前状态。
5. 修改前提交恢复报告；用户未明确授权时不修改、不提交、不操作游戏目录。阶段退出的候选与用户结论以
   [游戏回归 manifest](game-regression-manifest.md) 为准。
