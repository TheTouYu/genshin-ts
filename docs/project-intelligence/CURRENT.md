# Genshin-TS Project Intelligence 恢复入口

更新时间：2026-07-30

本文件是有界 Global Router，不复制各 Context 的详细状态。新会话先选择一个 Primary Context，再读取其恢复入口；不要默认读取历史 handoff 或全部知识节点。

## Active Contexts

### `static-gil-assembly-production`（priority 1）

- 目标：把静态 GIL 拼装发展为可配置、可回归、有备份且经过游戏验证的生产工作流。
- 当前状态：正式 `assets:static-assemblies` 第一轮生产闭环已通过。
- 恢复入口：[`contexts/static-gil-assembly-production.md`](contexts/static-gil-assembly-production.md)
- 关联 Nodes：`static-gil-assets`、`game-map-writeback`、`validation-evidence`。

### `compiler-diagnostics`（priority 2）

- 目标：用可复现 IR/GIA 和编辑器/游戏证据诊断复杂编译器问题。
- 当前状态：PPI Composite Pin Alpha 已完成，等待初始化后的首个全新复杂 Bug 做 Formal A/B。
- 恢复入口：[`contexts/compiler-diagnostics.md`](contexts/compiler-diagnostics.md)。
- 当前后端：shared vendor impl Graph 默认启用，legacy handwritten 仅作显式回退；以恢复入口登记的当前源码为准。
- 历史范围提醒：`docs/composite-ir/architecture-redesign/STATUS.md` 适用于旧分支，只作 pointer。

## 知识录入入口

- 常见错误：[`knowledge-capture-common-errors.md`](knowledge-capture-common-errors.md)。
- 固化流程：[`knowledge-capture-canonical-flow.md`](knowledge-capture-canonical-flow.md)。
- 录入原则：从已提交变更开始，固定使用 `python tools/pkc.py`，单计划串行 mutation，最终一次 delta check，精确 hash 审批，apply 后集中验证。

## 路由与安全

1. Context 选择顺序是：用户明确指定 → 可判别任务路径 → 仅共享 workspace/branch 时询问 → 完全没有 Context/path/workspace/branch 提示时才使用唯一 priority 1 Context。
2. 静态 `.gil`、地图写回、注入/覆盖和真实环境验证任务必须先走项目 Adapter，再从项目根运行 canonical `python tools/pkc.py progressive-query ...`，按返回的 `minimum_files` 做 L1→L2 读取；入口自动使用项目 `.local/` 内锁定的非 editable runtime，Agent 不安装或选择版本，也不得直接查询 SQLite。
3. L3 先用 `show-claim` 恢复 Claim/Evidence 边界；progressive query 已返回与命中 Claim 关联的 Authority Ref 子集和 current/stale 状态，不得无差别读取完整引用表。
4. 工作树改动保持受保护；working-tree observation 不能升级为稳定 Claim。
5. 未经任务级明确确认，不注入、覆盖、删除游戏文件，不修改 mapId/nodeGraphId，不提交或推送。
