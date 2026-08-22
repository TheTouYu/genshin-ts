// 足球输入图（挂操作台实体 1077936137）
// whenTabIsSelected → 解析 tabId → sendSignal(football_kick, tabId) 给物理图
import { g } from 'genshin-ts/runtime/core'
import { FootballSignal } from './signals.js'

const graph = g
  .server({ id: 1073741826 })
  .on('whenTabIsSelected', (evt: any, f: any) => {
    // tabId 1-6 射门 / 7-8 传球 / 9 复位，直接转发给物理图
    f.sendSignal(FootballSignal.football_kick, evt.tabId)
  })

export default graph
