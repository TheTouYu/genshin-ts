# Genshin-TS Project Intelligence 恢复入口

更新时间：2026-07-26

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
- 恢复入口：本节及已登记的 `compiler-diagnostics`、`composite-boundary`、`validation-evidence` Nodes。
- 历史范围提醒：`docs/composite-ir/architecture-redesign/STATUS.md` 适用于旧分支，只作 pointer。

## 路由与安全

1. Context 选择顺序是：用户明确指定 → 可判别任务路径 → 仅共享 workspace/branch 时询问 → 完全没有 Context/path/workspace/branch 提示时才使用唯一 priority 1 Context。
2. 静态 `.gil`、地图写回、注入/覆盖和真实环境验证任务必须先走项目 Adapter，再按 L1→L2 查询关联 Nodes。
3. L3 先用 `show-claim` 恢复 Claim/Evidence 边界；该命令不内嵌 Authority Refs，必须再按 Claim ID 连接 `data/knowledge/authority-refs.json` 的 `claim_ids`，报告 Ref ID/path 和 current/stale 状态。
4. 工作树改动保持受保护；working-tree observation 不能升级为稳定 Claim。
5. 未经任务级明确确认，不注入、覆盖、删除游戏文件，不修改 mapId/nodeGraphId，不提交或推送。
