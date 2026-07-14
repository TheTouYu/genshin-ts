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
当前未提交工作包：P2-W19 — ordinary shared factory 泛化与显式例外出口（验证完成，待用户审核）
最近已提交工作包：P2-W18 — framework-first work package scheduling（`56aa3af`）
工作树预期：P2-W19 的源码、测试和状态文档变化，以及此前独立 docs-search JSON 输出修复；不得覆盖或混淆 docs-search 改动
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

## 当前唯一工作包：P2-W19

```text
工作包：P2-W19 — ordinary shared factory 泛化与显式例外出口
优先级类别：架构阻塞
解除的上层阻塞：root 和 composite impl 仍各自持有 ordinary Node 创建、literal 写入和 pin normalization；仅少数 family
  已共享 identity，阻塞 P3 将 ordinary data/flow edge 收束为 shared materializer。
输入与修改范围：`ir_to_gia_transform` 的 root/impl ordinary Node 物化、shared resolution contract、focused composite
  regressions 与本状态/Phase 文档；不改 vendor/generated、synthetic call/capture overlay、legacy default backend、真实 GIA 或游戏目录。
最小观察或失败基线：源码审计确认 root 在 `index.ts` 内联 value/special-pin/Unk 处理，impl 在 `composite.ts` 分别以 vendor
  Graph 循环和 family-specific temporary Graph 物化；两条路径无法保证新增 ordinary family 使用同一 factory。
完成条件：root 与 vendor-gated impl 共享一个 ordinary factory 的 Node 创建、literal/enum 写入和通用 Unk
  normalization；synthetic/capture overlay 仍由 composite backend 显式排除，不静默 fallback；既有 scoped root/impl、nested/capture 回归不退化；用户完成 P2-W19 候选的编辑器/游戏核验。
实际验证命令：npm run build（PASS）；ordinary factory direct contract（PASS）；resolved contract（PASS）；DTC、captured custom
  target、scalar arithmetic vendor-gated fixtures（PASS）；custom-variable pin、nested capture/outflow regressions（PASS）；git diff --check（PASS）。
  候选已复制到 `Beyond_Local_Export` 根目录并以 SHA-256 回读确认；用户已确认编辑器加载和实际运行均通过；未注入。
回滚边界：新增 shared factory 与其 root/vendor-gated impl 调用点、对应 focused test 和状态/Phase 文档；不影响独立 docs-search 改动。
明确非目标：shared identity resolver 或 shared ordinary edge materializer、默认开启 gate、删除 handwritten legacy backend、
  改变 graphValues/affiliations、synthetic call/capture 语义、list/dict/signal/dynamic payload 扩展或注入；用户编辑器/游戏核验只验证本包候选。
编辑器/游戏候选：`P2W19-dtc-vendor.gia`（SHA-256 `9130ceb40d13550b53557c9fabb97b7726b306bb46155b36e83027cd837daab3`）、
  `P2W19-custom-target-vendor.gia`（SHA-256 `a2bbff1122c8da81d78ebdaf4e8f1f3c624b5786253f46ea9b5cda81f931e078`）、
  `P2W19-scalar-arithmetic-vendor.gia`（SHA-256 `0c9f3eea52789b826a505cdab097423c85ccd81bad0e0589be7a4da7a238aa7b`）；均在
  `Beyond_Local_Export` 根目录。用户已确认编辑器加载和实际运行均通过；未注入。
生成差异风险：最终自动回归重新生成的 `/tmp/P2W19-*-final.gia` 与上述已核验候选 SHA-256 不同；尚未做结构或 wire
  diff，不能推断根因或认为 final 文件已编辑器核验。用户选择接受原候选作为 P2-W19 编辑器/实际运行证据，暂不调查该
  差异且不阻塞提交。
后续候选（非当前工作包）：P3 shared ordinary Graph materializer；仅在 P2-W19 的 factory 边界与显式例外出口通过审核后选择。
```

工作包排序与例外分类见 [工作包选择协议](work-package-selection.md)。map、注入、覆盖真实参考、删除/清理、默认 gate、
legacy 删除、类型/边界语义变更仍须先取得用户确认。

## 新会话最小恢复

1. 读取 `EXECUTION.md`、本文件、当前 Phase 文档、`migration-invariants.md` 及与当前包直接相关的 ADR。
2. 检查 branch/status/log；若工作树与本文件不符，先停止并报告。
3. 仅在当前包涉及编辑器协作时读取 `COLLABORATION-PLAYBOOK.md`；仅在维护手册时读取其 maintenance 文档。
4. 按任务加载工作包历史、验证矩阵、真实 GIA、源码和测试；不要以历史归档代替当前状态。
5. 修改前提交恢复报告；用户未明确授权时不修改、不提交、不操作游戏目录。
