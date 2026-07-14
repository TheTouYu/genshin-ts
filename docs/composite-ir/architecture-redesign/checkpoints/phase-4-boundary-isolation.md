# Phase 4 Composite Boundary Isolation Checkpoint

> 状态：已验证 / 当前阶段 checkpoint
> 来源：当前代码实现 + focused 自动回归 + vendor-gated fixture + 用户编辑器/游戏核验
> 最近校验：2026-07-14
> 适用范围：Composite boundary pipeline（capture / call / definition / compositePins / layout /
> orchestration）；不代表 default vendor gate、legacy 删除或真实 GIA/wire 全等

## 目的

汇总 P4-W1–P4-W7 后的 boundary 架构状态：`composite.ts` 只做 orchestration 与 ordinary impl backend
接线；capture/call/definition/compositePins/layout 各自有独立模块与 focused contract。本文件不替代
[`STATUS.md`](../STATUS.md) 的实时工作树状态。

## Git 基线

- branch：`refactor/composite-stage3-architecture`
- 最近已提交工作包：P4-W6（`b84847a` layout isolation）
- P4-W7 完成时工作树：未提交（待用户审核后提交）
- 默认 backend：handwritten impl；`GSTS_STAGE3_VENDOR_IMPL_GRAPH=1` 仍是实验 gate

## 完成工作包

| 工作包 | 交付 | 用户编辑器证据 |
|---|---|---|
| P4-W1 | boundary 回归批次 B1–B4 | 通过 |
| P4-W2 | `normalize_capture.ts` | 通过 |
| P4-W3 | `lower_composite_call.ts` | 通过 |
| P4-W4 | `build_composite_definition.ts` | 通过 |
| P4-W5 | `build_composite_pins.ts` | 通过 |
| P4-W6 | `build_composite_layout.ts` | 通过 |
| P4-W7 | `COMPOSITE_ORCHESTRATION_CONTRACT` + ordinary-only pin builder | 通过 |

## 目标流水线（当前实现）

```text
CompositeDefIR
  → normalize_capture
  → resolve ordinary + synthetic call
  → computeCompositeImplLayout
  → materialize (legacy default | vendor-gated ordinary + synthetic overlay)
  → build_composite_definition
  → build_composite_pins overlay
  → GraphUnit pair
```

## 已证明

- ordinary pin builder 不再嵌 `__composite_call__` / `__composite_capture__` 节点分支；遇 boundary 节点失败。
- call 只在 orchestration 层调用 `buildCompositeCallPins`。
- capture 节点与 capture 源边在 normalize 后不可见；arg 级 `capture: true` 仅跳过 physical InParam。
- definition / compositePins / layout 均有独立 I/O contract，并在生产路径接线。
- nested/capture/sparse/bool/multi-flow 自动回归通过。
- P4-W1–P4-W7 代表性 vendor-gated 候选由用户确认编辑器加载与可观察执行；均未注入。

## 未证明

- 默认开启 vendor shared backend。
- 删除 handwritten legacy ordinary backend。
- 真实 GIA/wire 字节全等或 protobuf field presence。
- 全部 ordinary API family 的 root/impl 游戏验证。
- 注入或生产地图行为。

## 与原计划的偏差

- Phase 4 结束时 `composite.ts` 仍承载 ordinary legacy helpers；这是 Phase 5 删除对象，不是 boundary 回归。
- arg 级 `capture: true` 未提前从 IR 剥离；P4-W7 明确保留为 pin skip 语义。

## 下一阶段输入

进入 Phase 5 前须用户确认。建议首包：

```text
P5-W1 — no-legacy assertions / legacy ordinary call-site inventory
```

明确非目标：本 checkpoint 不授权删除 legacy、改 default gate 或注入。
