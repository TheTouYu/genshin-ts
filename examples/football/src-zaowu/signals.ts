// 造物技能路径·回传信号（地图 1073741827「真实足球v3」，2026-10-23）
// 20008 造物技能图执行时经「向服务器节点图发送信号」回传，服务端监听图 onSignal 接收。
// 注意：客户端图编译期会从**真实地图**解析信号注册表 —— 必须先
//   node ./bin/gsts.mjs assets:signals register --map-id 1073741827 --name zaowu_probe --param tag:str --param val:str --write
// 否则编译报信号编码错误。
import { defineSignal } from 'genshin-ts/runtime/core'

export const ZaowuSignal = {
  zaowu_probe: defineSignal('zaowu_probe', [
    ['tag', 'str'],
    ['val', 'str']
  ])
} as const
