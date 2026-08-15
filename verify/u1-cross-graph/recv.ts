// @ts-nocheck
// U1 差分实验（2026-08-16）：跨图信号投递——接收图
// 监听 verify_ping2（与发送图 1833 同一信号、同一挂载实体、不同节点图 1832）
// 动作：收到后打印 4 行标记（u1-recv-msg / 参数 msg / u1-recv-tag / 参数 tag）
// 判定：见 send.ts 头部；无 u1-recv-* 输出 = 跨图投递不成立
import { defineSignal, g } from 'genshin-ts/runtime/core'

const Ping2 = {
  verify_ping2: defineSignal('verify_ping2', [
    ['msg', 'str'],
    ['tag', 'str']
  ])
} as const

const graph = g
  .server({ id: 1073741832 })
  .onSignal(Ping2.verify_ping2, (evt: any, f: any) => {
    f.printString('u1-recv-msg')
    f.printString(evt.params.msg)
    f.printString('u1-recv-tag')
    f.printString(evt.params.tag)
  })

export default graph
