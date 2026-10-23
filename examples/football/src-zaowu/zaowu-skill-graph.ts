import { g } from 'genshin-ts/runtime/core'

import { ZaowuSignal } from './signals.js'

// 20008 造物技能图（图 ID 1082130434，地图内已存在，绑定技能配置 1191182337「自定义造物技能」f2=28+瞬发）
// 触发权在客户端 AI：决策图 1082130435 → 状态图 1082130433 executeSkill(1) → 技能配置 → 本图 onStart
// 本图只做最小可观测动作：把信号回传给服务端监听图，用于验证通路。
g.creationSkill({ id: 1082130434, name: 'zaowuSkill' }).on('start', (_evt, f) => {
  f.sendSignalToServerNodeGraph(ZaowuSignal.zaowu_probe, 'creation-skill-fired', 'v1')
})
