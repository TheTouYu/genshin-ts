import { g } from 'genshin-ts/runtime/core'

// 造物技能路径探针·20007 造物状态决策图（C 线 Round 0，2026-08-31，地图 1073741915「变量」）
//
// 决策图持续执行：按顺序唯一执行 → start1 分支无条件切换到造物状态图。
//   switchToSelfExecutionStatus(execute, 状态节点图配置ID, 自主逻辑参数序号)
//     - 状态图 = _GSTS_zaowuStatus（1082130437，executeSkill 技能序号 1）
//     - 自主逻辑参数序号 1 = 用户在编辑器「自主逻辑参数设置」新建并初始生效的 模板_1
//       （仅用于切换入战/脱战/领地等自主逻辑配置；行为本身在状态图里）。
g.creationStatusDecision({ id: 1082130438, name: '_GSTS_zaowuDecision' }).on('start1', (_evt, f) => {
  f.switchToSelfExecutionStatus(true, configId(1082130437n), 1n)
})
