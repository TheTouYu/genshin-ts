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
