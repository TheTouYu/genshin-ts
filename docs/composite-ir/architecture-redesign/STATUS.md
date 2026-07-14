# Composite Stage 3 Redesign 当前状态

> 状态：当前推荐 / 实时状态
> 来源：当前 Git 工作树 + 当前 Phase 计划 + ADR-012/013 + 已归档工作包记录
> 最近校验：2026-07-14
> 适用范围：`refactor/composite-stage3-architecture`；新会话的最小实时恢复入口

> 历史工作包的目标、命令、候选路径、SHA-256 和失败过程不在本文件重复；见
> [work-packages/README.md](work-packages/README.md)。当前计划见
> [phase-3-unified-graph-materialization.md](phase-3-unified-graph-materialization.md)。

## 当前定位

```text
当前分支：refactor/composite-stage3-architecture
当前 Phase：P3.5 exception — local-variable getter output pin schema（已完成，待审核提交）
当前唯一工作包：无 — P3.5 已完成，等待用户审核提交后恢复 P4-W1
挂起工作包：P4-W1 — boundary regression batch（B1~B4；已授权，等待 P3.5 提交）
最近已提交工作包：P3-W21 — encoded ordinary-edge integrity checks（`2b48804`）
最近已完成、待审核提交工作包：P3.5 — local-variable getter output pin schema
工作树预期：以下未提交变化均已审查、须保留：
  - 独立 docs-search/协议：docs/architecture/docs-search.md、scripts/docs-search.ts、EXECUTION.md
  - 本轮计划治理：README.md、STATUS.md、decision-log.md、migration-invariants.md、phase-3-unified-graph-materialization.md、
    phase-4-composite-boundary-isolation.md、phase-5-legacy-removal-and-hardening.md、game-regression-manifest.md（新增未追踪）
  - P3.5/P4-W1：src/compiler/ir_to_gia_transform/index.ts、composite.ts、
    tests/composite/test-local-variable-impl-concrete-type.ts、test-stage3-p2w6-capture-vendor-graph.ts、
    test-stage3-p4w1-multi-inflow-outflow-vendor-graph.ts
  新会话须按 EXECUTION 的 untracked 审查规则读取并保留上述变化；P3-W21 已提交，不得重做或覆盖
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
- P2 已对指定 setter/getter、local/custom variable、DTC、nested boundary 与同型 int/float 四则运算建立 scoped 自动和部分用户编辑器证据；这不等于所有 ordinary family 已验证。
- P2-W17b：`addition`、`subtraction`、`multiplication`、`division` 的同型 int/float 在 root、legacy impl 与 vendor-gated impl 使用 shared identity；可执行 fixture 的控制流为 event/复合 `执行` InFlow → Print 链，数据流为 arithmetic → DTC → Print。用户编辑器已确认通过；归档候选：`Beyond_Local_Export/真-测试通过/复合节点/P2W17b-scalar-arithmetic-vendor-shared-resolution.gia`，SHA-256 `929847e8078744dc6cd0356bfe726c1d91fcb5869ed1a4b2b397d3c18e4cc4a1`；未注入。

## 当前未证明 / 停止边界

- 不证明异型 arithmetic、comparison、vec3、list/dict、未采样 API、全部 signal/dynamic pin/payload 或全部 impl embedding。
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

## 最近完成：P3-W20

P3-W20 将 root 与 vendor-gated impl closed ordinary subgraph 的 ordinary data/flow edges 收束至
`ordinary_graph_materializer.ts`；synthetic call/capture overlay 仍独立。自动回归通过，且用户已确认四份
vendor-gated 候选在游戏内实际运行通过；未注入。候选 SHA-256、命令与回滚边界见 Phase 3 文档。

## 当前唯一工作包：P3.5

```text
工作包：P3.5 — local-variable getter output pin schema（P4-W1 B1 阻塞修复）
优先级类别：最小例外修复包；用户于 2026-07-14 批准。
解除的上层阻塞：P4-W1 B1 在 vendor-gated capture fixture 中触发 P3-W21 endpoint integrity error。根因是 root/vendor-gated impl 均删除 get_local_variable OutParam[0]，但它是 setter 所需 local-variable handle；OutParam[1] 是 ordinary value consumer 所需 typed value。
输入与修改范围：root/vendor-gated impl getter pin filter、focused local-variable/capture contracts、P3/manifest/STATUS；不改 capture 语义、ordinary resolver、vendor/generated、default gate、legacy backend、布局、游戏目录或注入。
完成条件：root 与 vendor-gated impl 均保留 getter OutParam[0] handle 和 OutParam[1] typed value；capture input 不进入 vendor ordinary data edges；P2-W5、P2-W6/P2-W7、P2-W10/P2-W12、nested、P3 materializer 回归通过；新候选经用户编辑器加载和可观察执行核验；git diff --check 通过。
当前结果：自动回归通过；候选 `Beyond_Local_Export/P35-local-variable-getter-output-vendor.gia`，SHA-256 `b32b810dc88c9318b0842ccc76c7f63b5a995d469150e6bf2e03316507b7ada2`。用户于 2026-07-14 确认编辑器加载和可观察执行通过；未注入。
实际验证命令：npm run build；local-variable impl concrete contract；P2-W5 legacy/vendor；P2-W6/P2-W7、P2-W10/P2-W12 vendor；nested capture/outflow；P3 materializer；git diff --check。
回滚边界：P3.5 getter pin filters、focused contracts、候选 manifest 与状态/Phase 文档；不影响 P4 boundary semantics 或独立 docs-search/治理改动。
明确非目标：继续 P4-W1 B1~B4、capture/ordinary edge 语义迁移、布局、default gate、legacy 删除、真实 GIA/wire 全等、注入或操作游戏目录。
后续候选（非当前工作包）：P3.5 经用户审核提交后恢复 P4-W1 boundary regression batch。
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
