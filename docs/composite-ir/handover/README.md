# Handover 文档说明

> **历史会话记录** — 这些文档记录开发过程中的轮次交接、阶段性分析、以及架构决策的演变过程。

## ⚠️ 使用提示

1. **API 名称已更新**：这些 handover 文档中的 API 名称（如 `eventMarker`、`linkTo`、`registerExecNode`、`leaf`）反映当时的实现状态。当前权威的低层控制流 DSL 请参考 [`../../architecture/composite/raw-control-flow-dsl-quickstart.md`](../../architecture/composite/raw-control-flow-dsl-quickstart.md)，其中：
   - `eventMarker()` → `entry()`（旧名仍可用）
   - `linkTo()` → `link()`（旧名仍可用）
   - `registerExecNode`（自动串联）→ `node()`（detached）
   - `leaf(idx)` → `outflow(name, source, idx)`

2. **这些文档是开发历史记录**，保留原始术语和当时的分析结论。新的 API 用法和模式以 `docs/architecture/composite/` 中当前版本文档为准。

3. **代码示例**：handover 中的代码片段是当时的实验性代码，可能使用了已弃用的 API 名称。实际开发以 `tests/composite/` 目录中的测试源码为准。

## 最近交接轮次一览

| 轮次       | 文件                                                                                               | 主要主题                         | 当前状态                                                                                                                                                      |
| :--------- | :------------------------------------------------------------------------------------------------- | :------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| r21        | [r21-outflow-api-redesign-pending.md](r21-outflow-api-redesign-pending.md)                         | outflow API 重设计（未完成）     | 设计已被 r22/r23 和当前 raw control-flow DSL 替代                                                                                                             |
| r22        | [r22-fan-in-and-debug-3456.md](r22-fan-in-and-debug-3456.md)                                       | fan-in API 实现，debug3/4 复刻   | fan-in 概念仍有效；API 名称已被后续文档整理                                                                                                                   |
| r23        | [r23-outflow-api-done-debug56-next.md](r23-outflow-api-done-debug56-next.md)                       | outflow API 正交化               | 核心思路保留；debug5/6 做法被 r24/r25 后续复刻替代                                                                                                            |
| r24        | [r24-debug56-recreate-draft-review.md](r24-debug56-recreate-draft-review.md)                       | debug5/6 草稿复刻 review         | 已被 r25 的结构复刻和 r26 当前 DSL 文档替代                                                                                                                   |
| r25        | [r25-debug56-structural-recreate-dsl-api-next.md](r25-debug56-structural-recreate-dsl-api-next.md) | debug5/6 结构复刻与 DSL API 建议 | API 建议已落到当前 raw control-flow DSL，阅读时以 quickstart 为准                                                                                             |
| r26        | [r26-documentation-governance-next.md](r26-documentation-governance-next.md)                       | 文档治理计划                     | 计划已开始执行；当前规则见 [../../documentation-governance.md](../../documentation-governance.md) 和 [../../documentation-map.md](../../documentation-map.md) |
| layout-r8  | [layout-handover-round-8.md](layout-handover-round-8.md)                                           | 场景 C：多执行泳道真实样本探索   | 已由 layout-r9 的中间实现和游戏内反馈继续推进                                                                                                                 |
| layout-r9  | [layout-handover-round-9.md](layout-handover-round-9.md)                                           | 多执行泳道 block-aware 中间实现  | 游戏内反馈：下移系数偏高，测试未复刻参考文件；已由 layout-r10 严格复刻和分步验证继续推进                                                                      |
| layout-r10 | [layout-handover-round-10.md](layout-handover-round-10.md)                                         | `布局c` 严格复刻与布局调参       | `layout-r6-c-reference-repro` 与 long-input 变体已游戏内验证通过；当前参数已提交，但仍属 gsts 当前输出经验值                                                  |
