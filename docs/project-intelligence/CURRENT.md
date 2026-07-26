# Genshin-TS Project Intelligence 恢复入口

更新时间：2026-07-26
当前 Context：`compiler-diagnostics`（active）

## 当前状态

PPI 有界接入与 Composite Pin Alpha 已完成：Approved Blueprint `alpha-focused` 已应用为 3 Nodes / 5 Topics，生产最小知识集包含 5 Claims、5 Authority References、2 Sources、5 Evidence events 和 12 条代表查询。所有 Domain 写入均通过用户逐包批准。

- Profile hash：`3b109d2c80b62028259f82e58165c23fd4d210378b306617f6cba9b5d05266b2`
- Approved hash：`0f15b68c028288a681fedf69ece26fbe010108e36d425fb3133208e2070ae863`
- Alpha fixture：`tests/composite/test-stage3-bool-boundary-dtc-physical-pins.ts`
- pre-fix：`c581001d00efbd010bba8f185d7cf4fd14a46706`
- fix：`95f3e629bbc8774dc66650d343c56bcd10360c11`
- scalar 自动覆盖：`2189434477a399df405dedf99f213a509007a137`

## Alpha 验证

- 父基线隔离重放按预期红灯：DTC 边界缺少 `compositePins` 所指向的物理 InParam。
- 当前 HEAD：`npm run build` 与 focused DTC fixture 通过。
- 真实 GIA、编辑器和游戏证据只覆盖记录中的 bool→int→float→string 候选；common scalar fixture 不能冒充全族外部验证。
- 同模型隔离 A/B 均正确且工作区零变化。PPI 组 62 次工具调用、170,959 input、$0.0280；原项目组 42 次工具调用、218,626 input、$0.0318。PPI 降低输入与费用，但工具调用更多，后续应优化查询到 authority ref 的直达路由。

## 下一恢复点

1. 保持功能面冻结，只修 Formal、跨平台或兼容门暴露的问题。
2. 等待接入后的首个全新复杂编译器 Bug，按相同模型运行 Formal A/B；不得用 Alpha 历史案例替代。
3. 保护 `feat/composite` 既有 dirty working tree；不读取或提交无关变更正文。
4. 未经明确确认，不修改生产代码、注入/覆盖游戏文件或推送。

## Scope mismatch

`docs/composite-ir/architecture-redesign/STATUS.md` 声明适用于旧分支 `refactor/composite-stage3-architecture`，只作历史 pointer，不作为当前 `feat/composite` 状态。
