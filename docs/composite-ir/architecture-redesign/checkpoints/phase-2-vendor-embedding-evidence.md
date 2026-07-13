# Phase 2 Vendor Graph Embedding Checkpoint

> 状态：已验证 / 当前阶段 checkpoint
> 来源：当前代码实现 + focused 自动回归 + 真实 GIA 对照 + 用户游戏编辑器验证 + 第三方 `dev` 分支只读审计
> 最近校验：2026-07-13
> 适用范围：`GSTS_STAGE3_VENDOR_IMPL_GRAPH=1` 实验 gate 与已验证的 Runtime optional-call contract；不代表默认 backend 或全部类型编码场景

## 目的

本 checkpoint 汇总 P2-W5 至 P2-W8 的实测范围、可复用方法和明确停止条件。它不替代
[`STATUS.md`](../STATUS.md) 的实时工作树状态，也不把单个编辑器样本推广为所有类型或 boundary family。

## 已验证的最小覆盖

| 工作包 | 新增变量 | 自动证据 | 用户编辑器证据 | 结论边界 |
|---|---|---|---|---|
| P2-W5 | closed local-float ordinary impl 图 | vendor `add_node/connect/flow`、data/flow、nodeIndex | 通过 | ordinary-only 图可嵌入既有 impl wrapper |
| P2-W6 | captured float literal → local getter | `compositePins` route、getter pin 无 ordinary connects | 通过 | literal capture overlay 可与 vendor ordinary nodes 共存 |
| P2-W7 | root Addition connection → captured input | root ordinary edge 与 impl boundary route 分别断言 | 通过 | 一个 root producer connection 可跨 boundary 到 vendor impl |
| P2-W8 | captured entity target → custom getter/setter | 三条 target route、custom IDs、literal/connection value | 通过 | custom target boundary 可与 vendor custom nodes 共存 |
| P2-W10 | outer ordinary float producer → nested synthetic input | child physical InParam data edge、producer OutParam、无错误 capture route | 通过 | 该 float ordinary→synthetic data 边可与 vendor subgraph 共存 |
| P2-W11 | outer captured float → nested child input | child无 physical input/ordinary edge、outer `compositePins` route | 通过 | 单 float nested capture 可与 vendor subgraph 共存 |
| P2-W12a | definition inputs + first-only/second-only/both/empty call binding | direct/nested Runtime contract、`[0]/[1]/[0,1]/[]` pin matrix、child完整 routes | 通过 | definition/call-site binding 分离是通用结构契约；类型编码细节另验 |

P2-W8 中 vendor custom setter value pin 的原生 `alreadySetVal=false` 与旧 root/impl parity fixture 的
`true` 不同。用户明确选择保留 vendor schema，且编辑器通过；因此本样本不添加手工 normalization。该结论只适用于
已覆盖的 float custom-target 场景。

## 已验证工作流

1. **先保留 legacy 路径。** 用同一 DSL 生成 legacy baseline；它只能作为候选/真实参考，不证明重构路径。
2. **每轮只改变一个变量。** 依次增加 closed graph、capture literal、capture connection、custom target；不能把
   DTC、新节点族和 nested call 一起加入。
3. **自动断言跨层边界。** root ordinary edge、impl ordinary edge 和 `compositePins` route 必须分别断言，不能仅检查
   节点数量或 decode defaults。
4. **gate 不得静默 fallback。** unsupported family 必须明确失败，避免把 legacy 输出误报为 vendor evidence。
5. **编辑器是行为判定。** 自动通过后生成新 candidate、复制到已授权目录、记录 SHA-256；用户确认才记为 L6。
6. **字段差异按证据处理。** raw/parity drift 不自动等于 defect；先区分 vendor schema、boundary overlay 和真实行为，
   没有真实证据不添加 patch。

## P2-W9 失败基线：nested synthetic call

最小 fixture 的 legacy baseline 通过，但在 gate 下失败：

```text
[error] vendor impl graph gate missing __composite_call__ InParam[0]
```

根因来自当前源码和第三方审计：`__composite_call__` 是 gsts runtime/IR synthetic marker，Stage 3 将其 lower 为
`SysGraph`（kind `22001`）且 nodeId 为 child CompositeDef ID。它还承载 child pin 的 `compositePinIndex`、
`relatedIds`、capture/sparse-input 和 ordinary↔synthetic edge 规则。vendor ordinary `Node` 从普通 node record/
reflectMap 创建 schema，不能为任意 CompositeDef ID 创建 SysGraph schema。

第三方仓库 `/home/h/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack` 的 `dev`（`a9174c9`，与
`origin/dev` 相同）有新的 `NodeInterface` protobuf 类型，但其 `utils/gia_gen/interface.ts` 未提供 composite call /
SysGraph factory、NodeInterface registry、nested call encoder、relatedIds/compositePins API 或测试。不能把它视为 vendor
nested-composite 支持，也不得为 P2-W9 直接升级/修改 vendor。

## P2-W9 isolation 自动验证

用户已授权最小 **synthetic-call isolation**。当前实现将 `__composite_call__` 从 vendor ordinary Graph 排除，保留既有
composite backend 的 SysGraph/pins/`relatedIds` lowering；vendor encode ordinary nodes 后，才为 synthetic ↔ ordinary 的
execution-flow 边写单一 overlay。它不为跨 boundary data connection 创建 fallback。

自动验证（2026-07-13）：

```bash
npm run build
npx tsx tests/composite/test-stage3-p2w9-nested-call-vendor-graph.ts /tmp/P2W9-nested-call-legacy-baseline.gia
GSTS_STAGE3_VENDOR_IMPL_GRAPH=1 npx tsx tests/composite/test-stage3-p2w9-nested-call-vendor-graph.ts /tmp/P2W9-nested-call-refactored-candidate.gia
npx tsx tests/composite/test-nested-composite-outflow.ts
npx tsx tests/composite/test-nested-composite-capture-pins.ts
```

均 PASS。vendor-gated candidate：`/tmp/P2W9-nested-call-refactored-candidate.gia`，SHA-256：
首次候选（SHA-256 `369eabb44dd71ce3d7370351285f30ee75c7124659d62e9c03c1e3d90c368309`）的编辑器反馈为：outer
内部可见 nested call 与 Print，但 Print 流线断开。该反馈确认 fixture 的 inner composite 未声明 OutFlow，故 nested call
没有可连接的 child completion pin；同时检查发现 isolation overlay 重复写入了 legacy synthetic → ordinary flow edge。

修复：fixture 显式声明 inner `完成` OutFlow，并将 inner Print 从 entry 接入后以 `f.outflow('完成', innerPrint, 0)` 标记；
materializer 仅 overlay vendor ordinary → legacy synthetic 的反向 flow，legacy synthetic → ordinary edge 保持原有 lowering。
自动回归再次通过。修复候选 SHA-256：
`41d1df1ba73279004abca845a6cdc438ec6b1b4a8bcf085b7126216326065d42`，已按用户授权覆盖
`Beyond_Local_Export/P2W9-nested-call-vendor-graph-candidate.gia`；源/目标 SHA-256 一致。未注入，待用户编辑器复验。

复杂 flow 自动回归（2026-07-13）发现并修复另一项 capture 边界问题：vendor Graph 会为被 `compositePins` 路由的
`double_branch` 条件保留 ordinary `InParam[0]`，与 boundary route 重复。当前实现保留 P2-W6 已验证的
`get_local_variable` captured handle schema；其他 captured ordinary InParam 在 vendor materialization 后过滤。
`test-phase2-reference-patterns.ts`、P2-W6/P2-W8 legacy/vendor regressions 均 PASS。

按用户持续授权，已生成并复制到 `Beyond_Local_Export` 根目录、待编辑器回归的候选：

```text
P2W9-complex-multi-inflow-outflow.gia  SHA-256 2ea56cebadd47dfab113bb2de28e72bc663562120f05f0bb02aad892b24782f9
P2W9-nested-multi-outflow.gia          SHA-256 57af3262396118bb60c318025a297f0e58fa2fde79da21a099789d636338a60e
P2W9-reference-flow-patterns.gia       SHA-256 38655390fa36544056186c9ace2e8568034601efcca56e7d7d21ac57a0d5883d
```

源/目标 SHA-256 均一致，未注入。用户编辑器核验（2026-07-13）：上述三个复杂控制流候选及
`P2W9-nested-call-vendor-graph-candidate.gia` 均通过；确认 multi-OutFlow 顺序、nested 四独立 OutFlow、child
OutFlow[3] → outer continuation 和复杂 data/flow 组合正常。该结果不推广到 nested data input、capture 或 sparse
named input。

## P2-W10~W12a 边界闭合

### Nested data / capture

P2-W10（`70455ee`）把 outer vendor-materialized float Addition 输出接入 nested synthetic child 的非 capture
input；该 data edge 保留在 child physical InParam，未变成 `compositePins`。P2-W11（`2f1e497`）把 outer captured
float 传给 nested child；该 input 仅由 outer `compositePins` 路由，child 不物化重复 physical pin/ordinary edge。两者均有
legacy/vendor fixture 与用户编辑器核验；不推广到其他 producer/type 或多 capture。

### Optional call-input contract

真实样本 `Beyond_Local_Export/user_edit/复合节点/调用参数.gia`，SHA-256
`599f3c06bdd3946cb93c3a498fb89237dd2fbc6e5f8661bfa80918f252bf3b1b`，经
`decode-gia.ts --compact`、`trace-exec-flow.ts --io`、`trace-dataflow.ts --list-nodes` 观察：同一双 float 加法
CompositeDef 的 impl 同时消费两个 definition input，四个 call marker 的 physical input presence 分别为
`[0]`、`[1]`、`[0,1]`、`[]`。这是 definition contract 与 call-site binding 分离的真实 GIA 结构证据。

P2-W12a（`bba105b`）在 `core.ts` 用完整 definition typed placeholders 捕获 child build，保留每个 call marker
仅物化实际绑定 input 的行为；`test-composite-optional-call-inputs.ts` 覆盖 direct call，
`test-stage3-p2w12-nested-sparse-input-vendor-graph.ts` 覆盖 nested vendor gate 及四分支 flow。用户编辑器确认候选
`P2W12-nested-sparse-input-vendor-graph-candidate.gia` 的四种绑定和 outer 4-way fan-out 正常。此结论适用于全部
composite 的 definition/call-site **结构契约**；不以 float/Add 样本推广各类型的 wrapper/wire/default 或未绑定值的运行时结果。

用户已授权后续 Stage 3 名称明确的候选 `.gia` 直接复制到或覆盖 `Beyond_Local_Export` 根目录；真实参考、归档、
地图/注入目录、未知同名文件、删除/清理和注入仍须单独确认。

## 未证明 / 禁止推论

- gate 不能设为默认，handwritten backend 不能删除；
- 未证明 multiple/other-type capture、其他 producer/type 的 nested data、optional connection/capture binding、
  `graphValues`、`affiliations` 或其他 ordinary family；
- 编辑器通过不证明 raw wire 全等；P2-W5 仍观察到 legacy 与 vendor schema 字段差异；
- optional call-input 的结构契约不自动证明 int/bool/list/dict/entity/guid 等类型的 wrapper、concrete metadata、wire
  presence 或未绑定值的游戏运行时结果。
