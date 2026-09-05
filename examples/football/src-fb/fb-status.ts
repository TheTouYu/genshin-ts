// @status: 见 BOARD（20009 造物状态图 1082130434；E1 链路）
// 足球客户端算力最小通路·20009 造物状态图（E1，2026-09-02，地图 1073741908）
//
// 造物状态图 = 持续性行为：决策图切换进来后持续执行，直到被切走。
// start1..start10 = 按顺序唯一执行的行为序列（前一行为失败如 CD 中才走下一个）。
// 本图只有一个行为：执行技能序号 1（= 造物技能管理中引用的第 1 个技能，
// 由用户在编辑器添加 = CLI 创建的 1191182337「GSTS-fb-calc」）。
// 照抄 zaowu-status-graph 模板（1915 已验证形态）。
import { g } from 'genshin-ts/runtime/core'

g.creationStatus({ id: 1082130434, name: '_GSTS_fbPhysStatus' }).on('start1', (_evt, f) => {
  f.executeSkill(true, 1n)
})
