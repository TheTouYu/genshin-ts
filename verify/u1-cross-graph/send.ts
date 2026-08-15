// @ts-nocheck
// U1 差分实验（2026-08-16，S4 测评暴露的架构命门）：跨图信号投递——发送图
// 背景：2698 只验证了"同图内" sendSignal → onSignal（signal-family2，图 1828）。
//       信号玩法（第二 demo 灯阵）要求：图 A 发送、图 B 接收。本分支验证跨图投递。
// 触发：whenTabIsSelected（用户驱动，避免实体加载时序导致监听未注册的假阴性；
//       实体 1077936151 的 tabBar 已在 2698 验证可用）
// 动作：printString('u1-send-fire') + sendSignal verify_ping2('ping-u1','tag-u1')
// 判定（见 recv.ts 与核验说明）：
//   日志出现 u1-send-fire + u1-recv-msg + ping-u1 + u1-recv-tag + tag-u1
//     = 跨图投递成立（图 1833 发送、图 1832 收到）
//   日志只有 u1-send-fire、无 u1-recv-* = 跨图投递不成立（接收必须与发送同图）
import { defineSignal, g } from 'genshin-ts/runtime/core'
import { str } from 'genshin-ts/runtime/value'

const Ping2 = {
  verify_ping2: defineSignal('verify_ping2', [
    ['msg', 'str'],
    ['tag', 'str']
  ])
} as const

const graph = g
  .server({ id: 1073741833 })
  .on('whenTabIsSelected', (_e: any, f: any) => {
    f.printString('u1-send-fire')
    f.sendSignal(Ping2.verify_ping2, new str('ping-u1'), new str('tag-u1'))
  })

export default graph
