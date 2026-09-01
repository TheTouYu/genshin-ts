// 足球客户端算力最小通路·20007 造物状态决策图（E1，2026-09-02，地图 1073741908）
//
// 决策图持续执行：start1 分支无条件切换到造物状态图。
//   switchToSelfExecutionStatus(execute, 状态节点图配置ID, 自主逻辑参数序号)
//     - 状态图 = _GSTS_fbPhysStatus（1082130434，executeSkill 技能序号 1）
//     - 自主逻辑参数序号 1 = 用户编辑器「自主逻辑参数设置」新建并初始生效的模板_1
//
// ⚠️ 本图 CLI 建不了（20007 自动节点未采样，fail closed）——用户在编辑器建空图。
// 1908 客户端段当前空图占用：1082130433(fb-phys)/1082130434(fb-status)已由 CLI 建，
// 编辑器建的下一张 = 预期 1082130435。注入前必须核对实际 ID 与本文件一致，不一致先改这里。
// 注入时走 patch graph-clear（编辑器默认名非空图会被注入器安全门拒）。
import { g } from 'genshin-ts/runtime/core'

g.creationStatusDecision({ id: 1082130435, name: '_GSTS_fbPhysDecision' }).on('start1', (_evt, f) => {
  f.switchToSelfExecutionStatus(true, configId(1082130434n), 1n)
})
