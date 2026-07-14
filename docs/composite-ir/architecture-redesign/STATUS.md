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
当前 Phase：Phase 4 — Composite Boundary Isolation
当前唯一工作包：无 — P4-W1 已完成，等待用户审核提交和选择下一 P4 工作包
最近已提交工作包：P3.5 — local-variable getter output pin schema（`d4b6276`）
最近已完成、待审核提交工作包：P4-W1 — boundary regression batch（B1~B4）
工作树预期：以下未提交变化均已审查、须保留：
  - 独立 docs-search/协议：docs/architecture/docs-search.md、scripts/docs-search.ts、EXECUTION.md
  - 本轮计划治理：README.md、STATUS.md、decision-log.md、migration-invariants.md、phase-3-unified-graph-materialization.md、
    phase-4-composite-boundary-isolation.md、phase-5-legacy-removal-and-hardening.md、game-regression-manifest.md（新增未追踪）
  - P4-W1：tests/composite/test-stage3-p4w1-multi-inflow-outflow-vendor-graph.ts、game-regression-manifest.md、
    phase-4-composite-boundary-isolation.md、STATUS.md
  新会话须按 EXECUTION 的 untracked 审查规则读取并保留上述变化；P3.5 已提交，不得重做或覆盖
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

## 当前唯一工作包：P4-W1

```text
工作包：P4-W1 — boundary regression batch（B1 capture-only、B2 sparse/optional binding、B3 nested call data、B4 multi InFlow/OutFlow）
优先级类别：架构阻塞
解除的上层阻塞：P3.5 已由 `d4b6276` 提交，且用户已确认精确候选 SHA 的编辑器加载和可观察执行；P4 继续以最小可失败契约确认 capture/call/compositePins 的边界归属。
输入与修改范围：P4 focused tests、必要的 boundary-only integrity helper、game-regression-manifest、Phase 4/STATUS；不改 ordinary resolver/factory/materializer、vendor/generated、default gate、legacy backend、布局、游戏目录或注入。
最小观察或失败基线：现有 nested/capture/sparse focused tests 分散验证结构，尚无 B1~B4 分别拥有 boundary route、physical pin、nodeIndex remap 与可观察执行的独立 manifest 候选。
完成条件：B1~B4 各有独立自动契约、vendor-gated candidate、SHA-256、manifest 观察点和用户结论；任一失败只阻塞对应子切片；既有 P3/P2 回归不退化；git diff --check 通过。
当前结果：B1、B2、B4 已由用户确认编辑器加载和可观察执行通过。B3 初版只验证 outer producer 连到 child
input，未验证 child 实际消费输入；已收紧为 child input → `compositePins` → DTC → Print，并以新 SHA 由用户复测
通过。P4-W1 四份候选均通过，均未注入。
实际验证命令：npm run build；B1~B4 focused contract/fixture 的 legacy/vendor 命令；nested capture/outflow、sparse binding、P3 complex-flow；git diff --check。每个候选 SHA 改变均须请求用户核验。
回滚边界：P4-W1 boundary helper/fixture、四项 manifest 条目与 Phase 4/STATUS 文档；不影响 P3 shared materializer 或独立 docs-search/治理改动。
明确非目标：capture/ordinary edge 语义迁移、ordinary lowering、布局变化、default gate、legacy 删除、真实 GIA/wire 全等、注入或操作游戏目录。
批次授权：用户允许 B1~B4 在本唯一工作包内一次实现并集中请求游戏核验；每项必须独立记录，不能相互外推或顺手扩范围。
后续候选（非当前工作包）：P4-W2 — capture normalization 的独立输入/输出 contract 与 boundary builder 归属审计；
只有 P4-W1 提交并经用户确认后，才将其设为唯一当前工作包。
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
