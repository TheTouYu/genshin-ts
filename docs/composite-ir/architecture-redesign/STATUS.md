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
当前唯一工作包：P4-W4 — Definition interface builder 独立抽取
最近已提交工作包：P4-W3 — Composite call lowerer 独立抽取（用户核验 2026-07-14 通过）
工作树预期：
  - 以下未提交变化均已审查、须保留，且不属于 P4-W3：
    - 独立 docs-search/协议：docs/architecture/docs-search.md、scripts/docs-search.ts、EXECUTION.md
    - 本轮计划治理：README.md、decision-log.md、migration-invariants.md、
      phase-5-legacy-removal-and-hardening.md
  新会话须按 EXECUTION 的 untracked 审查规则读取并保留上述变化；P4-W3 已提交，不得重做或覆盖
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
`buildCompositeAccessories()` / `buildImplGraphNodes()` 接入。

输入 / 输出 contract：

```text
identity input:  ServerNode + compositeDefById
identity output: compositeId, calledDef, SysGraph genericId/nodeId

pin input:
  node, calledDef, implEdges, requiredOutflowIndexes?
pin output:
  pins                 // 非 capture 的 sparse InParam + OutFlow（含 compositePinIndex）
  dataConns            // connection 输入的 deferred ordinary→call data edge
  physicalInputIndexes // 实际物化的 declaration index
  captureInputIndexes  // 跳过物理 pin 的 capture index
```

ordinary lowerer / vendor Graph 不得看见 call pin schema 规则；call 仍是 synthetic SysGraph
（ADR-009），sparse declaration index 与 optional binding 规则保持（ADR-010）。

已运行并通过：

```bash
npm run build
npx tsx tests/composite/test-stage3-p4w3-call-lowerer-contract.ts
npx tsx tests/composite/test-composite-sparse-named-input.ts
npx tsx tests/composite/test-composite-optional-call-inputs.ts
npx tsx tests/composite/test-nested-composite-outflow.ts
npx tsx tests/composite/test-nested-composite-capture-pins.ts
npx tsx tests/composite/test-stage3-p2w9-nested-call-vendor-graph.ts /tmp/P4W3-p2w9-legacy.gia
GSTS_STAGE3_VENDOR_IMPL_GRAPH=1 npx tsx tests/composite/test-stage3-p2w9-nested-call-vendor-graph.ts /tmp/P4W3-p2w9-vendor.gia
npx tsx tests/composite/test-stage3-p2w10-nested-data-input-vendor-graph.ts /tmp/P4W3-p2w10-legacy.gia
GSTS_STAGE3_VENDOR_IMPL_GRAPH=1 npx tsx tests/composite/test-stage3-p2w10-nested-data-input-vendor-graph.ts /tmp/P4W3-p2w10-vendor.gia
npx tsx tests/composite/test-stage3-p2w12-nested-sparse-input-vendor-graph.ts /tmp/P4W3-p2w12-legacy.gia
GSTS_STAGE3_VENDOR_IMPL_GRAPH=1 npx tsx tests/composite/test-stage3-p2w12-nested-sparse-input-vendor-graph.ts /tmp/P4W3-p2w12-vendor.gia
npx tsx tests/composite/test-stage3-p4w1-multi-inflow-outflow-vendor-graph.ts /tmp/P4W3-p4w1-b4-legacy.gia
GSTS_STAGE3_VENDOR_IMPL_GRAPH=1 npx tsx tests/composite/test-stage3-p4w1-multi-inflow-outflow-vendor-graph.ts /tmp/P4W3-p4w1-b4-vendor.gia
npx tsx tests/composite/test-stage3-p2w11-nested-capture-vendor-graph.ts /tmp/P4W3-p2w11-legacy.gia
GSTS_STAGE3_VENDOR_IMPL_GRAPH=1 npx tsx tests/composite/test-stage3-p2w11-nested-capture-vendor-graph.ts /tmp/P4W3-p2w11-vendor.gia
git diff --check
```

用户核验候选（未注入；用户 2026-07-14 确认编辑器加载与可观察执行通过；已归档）：

- `Beyond_Local_Export/真-测试通过/复合节点/P4W3-sparse-binding-vendor.gia`（B2 sparse/optional）
  SHA-256 `900391e99dd0e148f163833201d1084eee8c3649102d9178142d341ebf687d94`
- `Beyond_Local_Export/真-测试通过/复合节点/P4W3-nested-data-vendor.gia`（B3 nested call data）
  SHA-256 `d7817e84477624e394b1ae55829a3f7bc53f20800107042b7682a1c118cc1cfe`
- `Beyond_Local_Export/真-测试通过/复合节点/P4W3-multi-inflow-outflow-vendor.gia`（B4 multi InFlow/OutFlow）
  SHA-256 `ba267e2ab0bec629c34be8d47bb9c1ca3d4905ade480cace8beb1a4ea7bea397`
- `Beyond_Local_Export/真-测试通过/复合节点/P4W3-nested-call-vendor.gia`（nested call flow sentinel）
  SHA-256 `37a2665fb0a4c523e0026173464c572313fcd72dd84a06c3ff6007eda1d96edd`

说明：本包是生产路径重构（call pin/identity 从 `composite.ts` 迁到独立 lowerer）。未改 ordinary
materializer、default gate、legacy backend、布局、capture normalization 语义、definition interface builder
或 compositePins overlay 完整迁移。用户已确认四份候选通过；未注入；已提交。

## 当前唯一工作包：P4-W4

```text
工作包：P4-W4 — Definition interface builder 独立抽取
优先级类别：架构阻塞
解除的上层阻塞：P4-W3 用户核验已通过；call synthetic pins 已有单一 builder；Phase 4 仍要求 CompositeDef
  接口（ParameterFlow / inputs/outputs / inflow/outflow / impl graph relation）从 orchestration 中独立。
输入与修改范围：审计并抽取 CompositeDef interface 构建为独立 builder 或纯函数 contract；必要 focused
  tests 与 Phase 4/STATUS 文档。不改 ordinary materializer、default gate、legacy 删除、布局、注入。
最小观察或失败基线：CompositeDef 接口仍内联于 buildCompositeAccessories；bool/enum metadata、pinIndex
  与 impl graphId relation 缺少独立 contract。
完成条件：形成可引用的 definition interface 输入/输出或单一 builder；nested/sparse/bool 相关回归不退化；
  git diff --check 通过；若产生生产行为变化则请求用户编辑器/游戏核验。
实际验证命令：npm run build；P4-W4 focused contract；相关 boundary focused tests；git diff --check。
回滚边界：P4-W4 definition interface helper/测试与 Phase 4/STATUS 文档；不影响 P4-W2/P4-W3 模块。
明确非目标：compositePins overlay 完整迁移、布局变化、default gate、legacy 删除、真实 GIA/wire 全等、注入。
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
