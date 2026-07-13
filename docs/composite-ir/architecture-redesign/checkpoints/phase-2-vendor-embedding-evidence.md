# Phase 2 Vendor Graph Embedding Checkpoint

> 状态：已验证 / 当前阶段 checkpoint
> 来源：当前代码实现 + focused 自动回归 + 用户游戏编辑器验证 + 第三方 `dev` 分支只读审计
> 最近校验：2026-07-12
> 适用范围：`GSTS_STAGE3_VENDOR_IMPL_GRAPH=1` 实验 gate；不代表默认 backend 或全部 Composite 场景

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

## 下一轮推荐入口

P2-W9 需要先由用户决定是否授权 **synthetic-call isolation**。若获授权，最小子工作包只验证：

```text
legacy synthetic nested call + vendor-materialized ordinary Print
+ nested OutFlow → ordinary Print 的单一 post-materialization overlay
```

后续 nested data input、capture、sparse named input 必须各自独立。若不授权，保持 nested call 在 gate 外，转向 DTC
或另一个 ordinary node family。

## 未证明 / 禁止推论

- gate 不能设为默认，handwritten backend 不能删除；
- 未证明 multiple/other-type capture、nested call、synthetic call、`graphValues`、`affiliations` 或其他 ordinary family；
- 编辑器通过不证明 raw wire 全等；P2-W5 仍观察到 legacy 与 vendor schema 字段差异；
- 不得由单一 float/custom sample 推论 int/bool/list/dict/entity/guid 等类型族。
