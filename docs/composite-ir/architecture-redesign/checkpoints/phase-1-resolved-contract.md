# Phase 1 Resolved Node Contract Checkpoint

> 状态：部分验证 / 阶段退出
> 来源：当前代码实现 + 自动回归；复用 Phase 0 vendor / real-GIA 对照
> 最近校验：2026-07-12
> 适用范围：Stage 3 node identity 与 typed-resolution contract；不涵盖 ordinary pin lowering 或 Graph materialization

## Git 基线

- branch: `refactor/composite-stage3-architecture`
- start commit: `4eebc9c refactor(stage3): establish resolved node contract`
- end commit: `d6bc6a8 refactor(stage3): bound impl typed identity legacy adapter`
- working tree: clean at checkpoint preparation

## 完成工作包

- P1-W1：建立 `ResolvedValueType`、`GraphCompileContext`、resolved inputs/identity 和 typed conflict contract。
- P1-W2：root/impl setter/getter family 接入 shared identity；保留 impl handwritten pin schema drift 作为失败契约。
- P1-W3：增加 getter declaration identity 和 missing/unsupported resolution fallback accounting。
- P1-W4：root node-graph variable getter/setter adapter 优先委托 shared resolver。
- P1-W5：root legacy fallback 接入可选 observation sink，不改变 production diagnostics 或输出。
- P1-W6：custom-variable setter/getter 分别从 value input / downstream output 解析 identity。
- P1-W7：将 handwritten impl typed-identity helper 限定为 legacy compatibility adapter。

## 命令与结果

```bash
npm run build                                                  # PASS
npx tsx tests/composite/test-stage3-resolved-node-contract.ts # PASS
npx tsx tests/composite/test-stage3-root-impl-parity.ts       # PASS; retains 11 expected impl pin-schema mismatches
npx tsx tests/composite/test-custom-variable-impl-pins.ts     # PASS
git diff --check                                               # PASS
```

## 观察

- `resolved_node.ts` 现在是 node-graph/custom variable family 的 shared type-source 与
  generic/concrete identity contract。
- float setter 在 root/impl 的 identity 都是 generic `323` + concrete `324`；vec3 setter 都是
  generic `323` + concrete `334`；declared float getter 是 generic `337` + concrete `341`。
- root/impl parity fixture 对 float literal、float connection、vec3 connection 保留 11 个预期 mismatch：
  impl 的 handwritten target pin 缺少 root/vendor 的 concrete wrapper 和 `indexOfConcrete` schema。
- P1-W7 仅把 `legacyImplValueTypeSuffix()` / `resolveLegacyImplTypedNodeId()` 限定到 getter/local
  compatibility family；没有移除 legacy backend。

## 已证明

- Phase 1 shared resolver 可在不从 encoded pin 反推类型的前提下，表达 scalar/list/dict/enum/local-variable
  的最小 contract。
- migrated node-graph variable 与 custom-variable family 的类型来源和 identity decision 可以共享。
- missing declaration、unsupported resolved type 和 root legacy fallback 都可作为观察证据记录。
- legacy impl typed-identity helper 的适用 family 已显式受限，不能成为新 typed-identity path。

## 未证明

- shared resolver 不证明 vendor pin schema、Graph connections 或 impl NodeGraph embedding 正确。
- int/bool/str/entity/guid/list/dict 等各类型族没有因 float/vec3 结果而自动验证。
- `InParam[1]` 的 wrapper/schema drift 仍存在，且尚未由完整 vendor Graph materialization 消除。
- 无新增 raw-wire、真实 GIA、注入或游戏内行为证据。

## 与原计划的偏差

无阶段顺序偏差。ADR-006 的完整 vendor Graph materialization 主路径尚未开始；P1 只完成其前置的
identity/resolution 分层。

## 下一阶段输入

用户已确认进入 Phase 2。首个工作包应先建立 `set_node_graph_variable` vendor ordinary-node lowering 的
最小观察/feature-gate 边界，并在切换前验证 vendor Graph 编码后提取 impl NodeGraph 的 metadata 风险；不得
删除 handwritten impl pin/connect backend，不得注入。
