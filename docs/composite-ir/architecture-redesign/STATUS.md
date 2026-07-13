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
当前 Phase：Phase 2 — Shared Vendor Ordinary-Node Lowering
当前未提交工作包：P2-W18 — 框架优先排期决策与工作包调度协议（验证完成，待用户审核）
最近已提交代码工作包：P2-W17b — scalar same-type arithmetic shared identity resolution
工作树预期：包含 P2-W18 架构文档与此前 docs-search JSON 输出修复的未提交变化；不得覆盖、混淆或越过 P2-W18 开始 P2-W19
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

## 当前唯一工作包：P2-W18

```text
工作包：P2-W18 — 框架优先排期决策与工作包调度协议
优先级类别：架构阻塞
解除的上层阻塞：此前 STATUS 只给出 comparison 候选，无法将下一轮稳定引导到消除 root/impl 双 backend 的最高优先级工作；
  未提交状态若被写成已完成，会让后续会话错误越过验证和审核。
输入与修改范围：architecture-redesign 的 ADR、全局/Phase 计划、执行入口、STATUS 和工作包选择协议；不改生产代码、
  vendor/generated 文件、真实 GIA 或游戏目录。
最小观察或失败基线：只读恢复演练发现 P2-W18 尚未出现在 Git history，且此前 npm run docs:index 于 3200/4475 超时，
  但旧 STATUS 错写为已完成并将 P2-W19 设为当前工作包。
完成条件：ADR-012、调度协议与 STATUS 一致；STATUS 明确当前未提交工作包、验证状态和下一包的选择边界；
  文档索引已成功完成。现等待用户审核，审核后才可按提交协议提交或明确授权保留 checkpoint。
实际验证命令：git diff --check（PASS）；相对链接检查（PASS，8 个 P2-W18 相关 Markdown 文件）；
  npm run docs:index（首次 PASS，2026-07-14，267 documents / 4476 chunks）。写入本次核验记录后启动的复跑被中断；
  用户已确认该中断暂不处理且不阻塞 P2-W18，不据此推断索引脚本或索引内容存在问题。
回滚边界：仅 P2-W18 架构重构文档；不影响此前独立 docs-search JSON 修复。
明确非目标：启动 P2-W19、comparison、任何 Stage 3 生产编码、默认开启 vendor gate、legacy 删除、注入或游戏内验证。
后续候选（非当前工作包）：P2-W19 — ordinary shared factory 泛化与显式例外出口；仅在 P2-W18 通过审核并提交，
  或用户明确授权将其作为未提交 checkpoint 保留后才可选择。
```

## 已定义但未选择的后续工作包：P2-W19

P2-W19 的优先级类别为“架构阻塞”，目标是 ordinary shared factory 泛化与显式例外出口，解除 P3 shared
materializer 前仍只有少数 family 使用 shared resolver/factory 的阻塞。其详细调度卡只能在 P2-W18 结束后成为
`STATUS.md` 的当前唯一工作包；不得在此期间读取源码或开始实现。

工作包排序与例外分类见 [工作包选择协议](work-package-selection.md)。map、注入、覆盖真实参考、删除/清理、默认 gate、
legacy 删除、类型/边界语义变更仍须先取得用户确认。

## 新会话最小恢复

1. 读取 `EXECUTION.md`、本文件、当前 Phase 文档、`migration-invariants.md` 及与当前包直接相关的 ADR。
2. 检查 branch/status/log；若工作树与本文件不符，先停止并报告。
3. 仅在当前包涉及编辑器协作时读取 `COLLABORATION-PLAYBOOK.md`；仅在维护手册时读取其 maintenance 文档。
4. 按任务加载工作包历史、验证矩阵、真实 GIA、源码和测试；不要以历史归档代替当前状态。
5. 修改前提交恢复报告；用户未明确授权时不修改、不提交、不操作游戏目录。
