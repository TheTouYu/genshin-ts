// rbVStatus.ts —— 造物状态图（20009，1082130444，票 06）
// 唯一行为：执行技能序号 1（= 造物技能管理引用的第 1 个技能：新建 28+瞬发配置 1191182340（1191182340 已被探针占）
// 「测试-CLI造物-渲染」，body-78-f5 绑 20008 图 1082130443）。照 rbStatus（票 03）模板。
import { g } from 'genshin-ts/runtime/core'

g.creationStatus({ id: 1082130444, name: '_GSTS_rbVStatus' }).on('start1', (_evt: any, f: any) => {
  f.executeSkill(true, 1n)
})

export default g
