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
当前唯一工作包：P4-W2 — capture normalization 独立 I/O contract 与 boundary builder 归属审计
最近已提交工作包：P2-W18 — scalar same-type comparison shared identity（`1015d99`）
工作树预期：以下未提交变化均已审查、须保留，且不属于 P2-W18/P4-W2：
  - 独立 docs-search/协议：docs/architecture/docs-search.md、scripts/docs-search.ts、EXECUTION.md
  - 本轮计划治理：README.md、decision-log.md、migration-invariants.md、
    phase-5-legacy-removal-and-hardening.md
  新会话须按 EXECUTION 的 untracked 审查规则读取并保留上述变化；P2-W18 已提交，不得重做或覆盖
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

## 当前唯一工作包：P4-W2

```text
工作包：P4-W2 — capture normalization 独立 I/O contract 与 boundary builder 归属审计
优先级类别：架构阻塞
解除的上层阻塞：P2-W18 用户核验已完成并提交；Phase 4 退出条件仍要求 capture normalization 有独立
  输入/输出 contract，且 ordinary lowering 不得继续依赖内嵌 capture 分支。
输入与修改范围：只读审计当前 capture 归一化/重定向与 boundary builder 归属；新增 capture normalization 的
  独立输入→输出 contract（focused tests 和/或纯函数模块边界）；必要的 Phase 4/STATUS/decision 文档更新。
  不改 ordinary resolver/factory/materializer、vendor/generated、default gate、legacy backend、布局、
  call synthetic pins、compositePins overlay 语义、游戏目录或注入；不在本包完成完整 composite.ts 拆分。
最小观察或失败基线：现有 nested/capture focused tests 覆盖部分结果形状，但 capture 过滤 ordinary nodes、
  边重定向、boundary bindings 与 node-index 要求仍与 composite 主路径耦合，缺少可独立调用的 I/O contract。
完成条件：形成可引用的 capture normalization 输入/输出 contract；明确列出 ordinary lowerer 不得看见的
  capture 字段与 boundary builder 职责边界；B1 及既有 nested capture 回归不退化；git diff --check 通过。
  若本包仅做 contract/审计而不抽模块，须在完成报告标明模块抽取为后续工作包。
实际验证命令：npm run build（若改生产 TS）；P4-W2 focused contract；既有 nested capture / B1 capture-only
  focused tests（legacy + 必要时 vendor gate）；git diff --check。
回滚边界：P4-W2 contract/helper 与 Phase 4/STATUS 文档；不影响 P2-W18、P4-W1 候选、shared materializer 或
  独立 docs-search/治理改动。
明确非目标：call lowerer 完整抽取、definition interface builder、compositePins overlay 迁移、布局变化、
  ordinary edge 语义迁移、default gate、legacy 删除、真实 GIA/wire 全等、注入或操作游戏目录。
后续候选（非当前工作包）：P4-W3 — Composite call lowerer 或 capture 模块正式抽取（待 P4-W2 完成后按审计结果选择）。
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
