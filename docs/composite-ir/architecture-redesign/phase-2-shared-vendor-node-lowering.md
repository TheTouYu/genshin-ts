# Phase 2：共享 Vendor Ordinary-Node Lowering

> 状态：当前推荐 / 进行中
> 来源：目标架构 + 当前实现/自动回归 + scoped 用户编辑器核验
> 最近校验：2026-07-14
> 适用范围：ordinary vendor subgraph 与 composite synthetic/boundary overlay；不代表默认 backend 或全部类型/API 已验证

> 本文件保留 Phase 2 的当前目标、活动边界和摘要。P2-W1~P2-W17b 的完整命令、候选、SHA、失败与修正过程已归档到
> [phase-2-detailed-history-2026-07-13.md](work-packages/phase-2-detailed-history-2026-07-13.md)。

## Phase 目标

建立 root 与 composite impl 共用的 ordinary node resolution、vendor pin schema 和 Graph materialization 路径：

```text
same ordinary IR node + same resolved type/connection/flow
→ same generic/concrete identity
→ same ordinary input/output schema
→ same vendor data/flow materialization semantics
```

按 ADR-011，主图可表达和执行的 ordinary system node/API 能力目标上也应在 composite impl 中可表达和执行。
Composite 只保留 CompositeDef、synthetic call、capture、`compositePins`、inflow/outflow 与布局等 boundary 职责；这不是
“所有 ordinary family 已验证”的声明。

## 当前机制与边界

- `resolveNodeIdentity()` 是已迁移 node family 的 shared identity 决策；root adapter 与 impl 必须消费同一结果。
- `GSTS_STAGE3_VENDOR_IMPL_GRAPH=1` 仅 materialize ordinary impl subgraph；synthetic composite call 保留 composite backend，再补 ordinary↔synthetic overlay。
- Capture 仍只由 `compositePins` 表达，不物化为 ordinary literal/data edge；non-capture input 保留 physical pin/edge。
- 默认 handwritten backend、legacy fallback、`graphValues`、`affiliations` 与布局不因 Phase 2 的单一 family 切片自动改变。
- 普通 API/node family 的目标能力与 root 同源；signal/dynamic pin/payload 等若有专属规则，应在共享 ordinary contract 下增加专用 lowerer/normalization，不恢复独立 composite ordinary backend。

## 已完成切片摘要

| 工作包 | scoped 结论 | 证据层级 | 详情 |
|---|---|---|---|
| P2-W1/W2 | graph-variable setter/getter 的 shared identity 与 vendor schema | 自动；setter 有用户编辑器验证 | [历史](work-packages/phase-2-detailed-history-2026-07-13.md#p2-w1-当前结果standalone-vendor-graph-metadata-observation) |
| P2-W3/W4 | custom/local float getter/setter 的 shared lowering | 自动 + 用户编辑器 | [历史](work-packages/phase-2-detailed-history-2026-07-13.md#p2-w3-当前结果custom-variable-gettersetter-shared-vendor-lowering) |
| P2-W5~W8 | vendor Graph ordinary embedding 与 captured float/custom target 组合 | 自动 + 用户编辑器 | [历史](work-packages/phase-2-detailed-history-2026-07-13.md#p2-w5-当前结果composite-impl-vendor-graph-embedding-observation) |
| P2-W9~W12a | synthetic-call isolation、nested data/capture、optional sparse call binding | 自动 + 用户编辑器 | [历史](work-packages/phase-2-detailed-history-2026-07-13.md#p2-w9-调查结果nested-synthetic-call-不是-vendor-ordinary-node) |
| P2-W16 | 当前映射的 11 个 DTC variant shared identity | 自动 + 用户编辑器 | [历史](work-packages/phase-2-detailed-history-2026-07-13.md#p2-w16-当前结果all-mapped-dtc-shared-identity--vendor-graph-validation) |
| P2-W17a/W17b | 同型 int/float 四则运算 shared identity；可执行 data/control-flow fixture | 自动 + 用户编辑器 | [历史](work-packages/phase-2-detailed-history-2026-07-13.md#p2-w17bscalar-same-type-arithmetic-shared-identity-resolution用户编辑器核验通过待审核提交) |
| P2-W18 | ADR-012：框架优先、问题驱动的排期；下一包转向 ordinary factory 泛化 | 用户确认 + 文档协议；相对链接检查与 docs:index 通过（267 documents / 4476 chunks） | [工作包选择协议](work-package-selection.md) |

## P2-W17b 当前证据

`addition`、`subtraction`、`multiplication`、`division` 的同型 int/float 现在经 shared resolver 选择
`${node}__int` / `${node}__float`。可执行 fixture 让 event / composite `执行` InFlow 进入 Print 链，数据边为
arithmetic → DTC → Print；root、legacy impl 和 vendor-gated impl 均断言 literal/connection target identity、typed schema、
ordinary data edge 和 control-flow/boundary route。用户已确认修正候选在编辑器中通过，归档文件：
`Beyond_Local_Export/真-测试通过/复合节点/P2W17b-scalar-arithmetic-vendor-shared-resolution.gia`，SHA-256
`929847e8078744dc6cd0356bfe726c1d91fcb5869ed1a4b2b397d3c18e4cc4a1`；未注入。

这只覆盖同型 int/float 四则运算，不证明异型 arithmetic、comparison、vec3/list/dict 或所有 API 的 wire/编辑器行为。

## 当前工作包与后续顺序

P2-W17b 已完成自动与用户编辑器核验。根据 ADR-012，P2 后续不再以 comparison 或其他单一 ordinary
family 的逐项观察作为默认主线；优先完成 ordinary factory 泛化，使主图 ordinary API 默认走 shared resolution 和
vendor schema 路径，并为 dynamic/list/dict/特殊 ID 等实际缺口提供显式 fallback 或集中 adapter。

每轮的唯一工作包由 [工作包选择协议](work-package-selection.md) 排序。comparison 只在其解除框架阻塞、暴露可复现
例外或用户明确指定时成为工作包。不要把 ordinary factory、ordinary edge materialization、capture/boundary 或 legacy
删除混在同一包。

## Phase 退出条件

- [x] 已迁移切片在 root/impl 使用共享 identity，literal/connection 不产生 target schema 分叉。
- [x] vendor Graph gate 已覆盖 closed ordinary subgraph、指定 capture/nested/synthetic overlay 与部分 ordinary family。
- [ ] shared graph materializer 覆盖 ordinary data/flow edge，且普通边不再由 handwritten backend 编码。
- [ ] root/impl executable parity 扩展至核心 typed/dynamic family，并有相应真实 GIA/用户编辑器 evidence。
- [ ] `graphValues`、`affiliations`、signal/dynamic pin、list/dict、特殊 ID family 的边界已单独确认。
- [ ] legacy removal gate 全部满足。

## 当前最低验证

每个 Phase 2 工作包至少运行当前 family fixture、受影响 nested/capture regression、`npm run build`（生产 TS 变更时）和
`git diff --check`。候选必须使用可执行控制流 + 有消费者的数据流；自动通过、候选复制、用户编辑器核验、注入和游戏行为分别报告。
