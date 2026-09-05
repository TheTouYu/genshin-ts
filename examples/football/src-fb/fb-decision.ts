// @status: 见 BOARD（20007 造物决策图 1082130435；E1 链路）
// 足球客户端算力最小通路·20007 造物状态决策图（E1，2026-09-02，地图 1073741908）
//
// 决策图持续执行：start1 分支无条件切换到造物状态图。
//   switchToSelfExecutionStatus(execute, 状态节点图配置ID, 自主逻辑参数序号)
//     - 状态图 = _GSTS_fbPhysStatus（1082130434，executeSkill 技能序号 1）
//     - 自主逻辑参数序号 1 = 用户编辑器「自主逻辑参数设置」新建并初始生效的模板_1
//
// ⚠️ 本图 CLI 建不了（20007 自动节点未采样，fail closed）——实际由用户在编辑器建空图并回填 ID。
// 当前 ID=1082130435 已实际占用；注入前必须核对实际 ID 与本文件一致，不一致先改这里。
// 注入时走 patch graph-clear（编辑器默认名非空图会被注入器安全门拒）。
import { g } from 'genshin-ts/runtime/core'

g.creationStatusDecision({ id: 1082130435, name: '_GSTS_fbPhysDecision' }).on('start1', (_evt, f) => {
  f.switchToSelfExecutionStatus(true, configId(1082130434n), 1n)
})
