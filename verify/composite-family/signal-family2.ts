// @ts-nocheck
// 验证 A（2026-08-15）：从零注册信号 verify_ping2（无 donor 内置布局）游戏内可用性
// 触发：whenTabIsSelected → 复合内 sendSignal verify_ping2(msg/tag) → 图级 onSignal 接收打印
// 判定：日志出现 ping-msg2 和 tagA2（信号发出+接收+参数全通）
import { defineSignal, g } from 'genshin-ts/runtime/core'
import { str } from 'genshin-ts/runtime/value'

const Ping2 = {
  verify_ping2: defineSignal('verify_ping2', [
    ['msg', 'str'],
    ['tag', 'str']
  ])
} as const

const sigSend2 = g.defineComposite('verify_sig_send2', {
  inputs: {},
  outputs: {},
  build: (_a, f) => {
    f.sendSignal(Ping2.verify_ping2, new str('ping-msg2'), new str('tagA2'))
    return {}
  }
})

const graph = g
  .server({ id: 1073741830 })
  .on('whenTabIsSelected', (_e: any, f: any) => {
    f.callComposite(sigSend2, {})
  })
  .onSignal(Ping2.verify_ping2, (evt: any, f: any) => {
    f.printString(evt.params.msg)
    f.printString(evt.params.tag)
  })
export default graph

