// rbStatus.ts —— 造物状态图（20009，1082130438，票 03）
// 唯一行为：执行技能序号 1（= 造物技能管理引用的第 1 个技能：1191182338「测试-CLI造物-瞬发」，
// body-78-f5 绑 20008 图 1082130435）。照 zaowu-basic/足球 fb-status 已验证模板。
import { g } from 'genshin-ts/runtime/core'

g.creationStatus({ id: 1082130438, name: '_GSTS_rbCrossStatus' }).on('start1', (_evt: any, f: any) => {
  f.executeSkill(true, 1n)
})

export default g
