import { g } from 'genshin-ts/runtime/core'

// 20009 造物状态图（图 ID 1082130433）。start1..start10 = 按顺序唯一执行；
// 前一个行为失败（如技能 CD 中）才走下一个。本图只放一个行为：执行技能序号 1
//（= 用户编辑器「造物技能管理」里引用的第 1 个技能 = 1191182337）。
g.creationStatus({ id: 1082130433, name: 'zaowuStatus' }).on('start1', (_evt, f) => {
  f.executeSkill(true, 1n)
})
