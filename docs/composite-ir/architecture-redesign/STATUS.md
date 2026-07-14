# Composite Stage 3 Redesign 当前状态

> 状态：当前推荐 / 实时状态
> 来源：当前 Git 工作树 + 当前 Phase 计划 + ADR-012 + 已归档工作包记录
> 最近校验：2026-07-14
> 适用范围：`refactor/composite-stage3-architecture`；新会话的最小实时恢复入口

> 历史工作包的目标、命令、候选路径、SHA-256 和失败过程不在本文件重复；见
> [work-packages/README.md](work-packages/README.md)。当前计划见
> [phase-2-shared-vendor-node-lowering.md](phase-2-shared-vendor-node-lowering.md)。

## 当前定位

```text
当前分支：refactor/composite-stage3-architecture
当前 Phase：Phase 3 — Unified Ordinary Graph Materialization
当前唯一工作包：P3-W21 — encoded ordinary-edge integrity checks（待执行）
最近已提交工作包：P3-W20 — shared ordinary Graph edge materializer（见 HEAD 提交标题）
工作树预期：仅此前独立 docs-search JSON 输出修复与执行协议改动；P3-W20 提交后不得遗留未提交变化
默认 backend：handwritten impl backend；GSTS_STAGE3_VENDOR_IMPL_GRAPH=1 仍是实验 gate
```

## 当前可依赖事实

- ADR-006：ordinary impl graph 的目标主路径是完整 vendor `Graph` materialization；默认 gate 不开启，legacy backend 未删除。
- ADR-009：`__composite_call__` 是 synthetic boundary node，不进入 vendor ordinary Graph；ordinary↔synthetic edge 由 composite overlay 处理。
- ADR-010：definition capture 使用完整 typed placeholders；call-site 可独立省略任意绑定输入，并保持 sparse declaration index。
- ADR-011：root 与 composite impl 的 ordinary system node/API 能力目标同源；composite 只增加 call/capture/`compositePins`/inflow/outflow/layout 等 boundary 职责。
- ADR-012：ordinary API 按共享框架默认覆盖、实际问题驱动补洞；此工程策略不等于所有 ordinary family 已验证。
- P2 已对指定 setter/getter、local/custom variable、DTC、nested boundary 与同型 int/float 四则运算建立 scoped 自动和部分用户编辑器证据；这不等于所有 ordinary family 已验证。
- P2-W17b：`addition`、`subtraction`、`multiplication`、`division` 的同型 int/float 在 root、legacy impl 与 vendor-gated impl 使用 shared identity；可执行 fixture 的控制流为 event/复合 `执行` InFlow → Print 链，数据流为 arithmetic → DTC → Print。用户编辑器已确认通过；归档候选：`Beyond_Local_Export/真-测试通过/复合节点/P2W17b-scalar-arithmetic-vendor-shared-resolution.gia`，SHA-256 `929847e8078744dc6cd0356bfe726c1d91fcb5869ed1a4b2b397d3c18e4cc4a1`；未注入。

## 当前未证明 / 停止边界

- 不证明异型 arithmetic、comparison、vec3、list/dict、未采样 API、全部 signal/dynamic pin/payload 或全部 impl embedding。
- 不证明真实 GIA/wire 全等；decoded defaults 不证明 protobuf field presence。
- 不证明注入或游戏内行为；本轮没有注入。
- 不默认开启 vendor gate，不删除 handwritten backend，不改变 `graphValues`、`affiliations`、capture、nested、sparse 或布局语义。
- signal/dynamic pin family 的能力目标由 ADR-011 确认与 root 同源，但专属 payload/schema/wire 仍需真实可执行案例验证。
- P3-W20 已将 root 的 ordinary data/flow edges 与 vendor-gated impl closed ordinary subgraph 的 data/flow edges 接入同一 shared materializer；synthetic call/capture overlay 仍独立。自动回归通过，用户已确认四份 P3-W20 vendor-gated 候选在游戏内实际运行通过；未注入。

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

## 最近完成：P3-W20

P3-W20 将 root 与 vendor-gated impl closed ordinary subgraph 的 ordinary data/flow edges 收束至
`ordinary_graph_materializer.ts`；synthetic call/capture overlay 仍独立。自动回归通过，且用户已确认四份
vendor-gated 候选在游戏内实际运行通过；未注入。候选 SHA-256、命令与回滚边界见 Phase 3 文档。

## 当前唯一工作包：P3-W21

```text
工作包：P3-W21 — encoded ordinary-edge integrity checks
优先级类别：架构阻塞
解除的上层阻塞：P3-W20 已共享 ordinary edge materializer，但 Phase 3 仍缺少对 encoded endpoint pin、target uniqueness、nodeIndex 和 capture/boundary exclusion 的集中 integrity contract；该缺口阻塞 Phase 3 退出与 P4 选择。
输入与修改范围：shared materializer 的可选 integrity contract、P3 focused parity fixture 与本状态/Phase 文档；不改 vendor/generated、ordinary resolution/factory、synthetic/capture overlay、default gate、legacy backend、游戏目录或注入。
最小观察或失败基线：P3-W20 仅以类别 fixture 观察解码 connects，未对每一条待 materialize ordinary edge 集中断言 endpoint pin 存在、同一 data target 唯一、encoded nodeIndex 对齐及 capture-filtered endpoint 排除。
完成条件：root 与 vendor-gated impl 的 focused fixture 对 ordinary data/flow encoded integrity 形成共享、可失败的契约；所有 boundary/capture edge 仍由 overlay 排除；既有 P3-W20 regressions 不退化；git diff --check 通过。若生产编码行为改变，另生成候选并请求用户游戏内核验。
实际验证命令：npm run build；P3 materializer direct contract；P3 complex-flow legacy/vendor parity；DTC、custom target、scalar arithmetic vendor fixtures；nested capture/outflow；git diff --check。
回滚边界：P3-W21 integrity helper/contract、focused fixture 与本状态/Phase 文档；不影响已提交 P3-W20 或独立 docs-search 改动。
明确非目标：默认开启 gate、legacy 删除、改变 ordinary edge 语义、将 synthetic/capture 纳入 ordinary materializer、逐 API 验收、真实 GIA 覆盖或注入。
后续候选（非当前工作包）：P4 capture/call/compositePins boundary isolation；仅在 P3 退出条件满足后选择。
```

工作包排序与例外分类见 [工作包选择协议](work-package-selection.md)。map、注入、覆盖真实参考、删除/清理、默认 gate、
legacy 删除、类型/边界语义变更仍须先取得用户确认。

## 新会话最小恢复

1. 读取 `EXECUTION.md`、本文件、当前 Phase 文档、`migration-invariants.md` 及与当前包直接相关的 ADR。
2. 检查 branch/status/log；若工作树与本文件不符，先停止并报告。
3. 仅在当前包涉及编辑器协作时读取 `COLLABORATION-PLAYBOOK.md`；仅在维护手册时读取其 maintenance 文档。
4. 按任务加载工作包历史、验证矩阵、真实 GIA、源码和测试；不要以历史归档代替当前状态。
5. 修改前提交恢复报告；用户未明确授权时不修改、不提交、不操作游戏目录。
