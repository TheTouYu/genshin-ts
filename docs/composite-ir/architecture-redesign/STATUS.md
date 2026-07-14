# Composite Stage 3 Redesign 当前状态

> 状态：当前推荐 / 实时状态
> 来源：当前 Git 工作树 + 当前 Phase 计划 + ADR-012/013 + 已归档工作包记录
> 最近校验：2026-07-14
> 适用范围：`refactor/composite-stage3-architecture`；新会话的最小实时恢复入口

> 历史工作包的目标、命令、候选路径、SHA-256 和失败过程不在本文件重复；见
> [work-packages/README.md](work-packages/README.md)。当前计划见
> [phase-4-composite-boundary-isolation.md](phase-4-composite-boundary-isolation.md)。

## 当前定位

```text
当前分支：refactor/composite-stage3-architecture
当前 Phase：Phase 4 — Composite Boundary Isolation
当前唯一工作包：P4-W6 — Layout isolation
最近已提交工作包：P4-W5 — CompositePins overlay 独立抽取（用户核验 2026-07-14 通过）
工作树预期：
  - 以下未提交变化均已审查、须保留，且不属于 P4-W5：
    - 独立 docs-search/协议：docs/architecture/docs-search.md、scripts/docs-search.ts、EXECUTION.md
    - 本轮计划治理：README.md、decision-log.md、migration-invariants.md、
      phase-5-legacy-removal-and-hardening.md
  新会话须按 EXECUTION 的 untracked 审查规则读取并保留上述变化；P4-W5 已提交，不得重做或覆盖
默认 backend：handwritten impl backend；GSTS_STAGE3_VENDOR_IMPL_GRAPH=1 仍是实验 gate
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

## 当前唯一工作包：P4-W6

```text
工作包：P4-W6 — Layout isolation
优先级类别：架构阻塞
解除的上层阻塞：P4-W2/P4-W3/P4-W4/P4-W5 已分别抽出 capture/call/definition/compositePins；Phase 4 仍要求
  layout 只消费 normalized graph，不改变节点/pin semantics，且不侵入 ordinary materialization。
输入与修改范围：审计并隔离 composite virtual anchors / impl layout 配置为 boundary 职责；必要 focused
  tests 与 Phase 4/STATUS 文档。不改 ordinary materializer、default gate、legacy 删除、注入。
最小观察或失败基线：layout 仍与 composite.ts / ordinary path 耦合，可能在 boundary 收口后仍改语义或
  依赖未归一化 graph。
完成条件：layout 仅消费 normalized graph；node/pin semantics 不变；相关回归不退化；git diff --check
  通过；若产生生产行为变化则请求用户编辑器/游戏核验。
实际验证命令：npm run build；P4-W6 focused contract 或 layout/boundary focused tests；git diff --check。
回滚边界：P4-W6 layout isolation helper/测试与 Phase 4/STATUS 文档；不影响 P4-W2–P4-W5 模块。
明确非目标：default gate、legacy 删除、真实 GIA/wire 全等、注入、重排为“更好看”的布局。
后续候选（非当前工作包）：P4 阶段退出核对 / composite.ts orchestration 收口；P5 legacy 删除。
```

工作包排序与例外分类见 [工作包选择协议](work-package-selection.md)。map、注入、覆盖真实参考、删除/清理、默认 gate、
legacy 删除、类型/边界语义变更仍须先取得用户确认。

## 新会话最小恢复

1. 读取 `EXECUTION.md`、本文件、当前 Phase 文档、`migration-invariants.md` 及与当前包直接相关的 ADR。
2. 检查 branch/status/log；若工作树不符，先停止并报告。若含 `??`，按 EXECUTION 运行 untracked 清单并读取本段
   明列的预期新增文件；不得只用 `git diff` 将其视为已审查。
3. 仅在当前包涉及编辑器协作时读取 `COLLABORATION-PLAYBOOK.md`；仅在维护手册时读取其 maintenance 文档。
4. 按任务加载工作包历史、验证矩阵、真实 GIA、源码和测试；不要以历史归档代替当前状态。
5. 修改前提交恢复报告；用户未明确授权时不修改、不提交、不操作游戏目录。阶段退出的候选与用户结论以
   [游戏回归 manifest](game-regression-manifest.md) 为准。
