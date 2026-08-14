// @ts-nocheck
// 实验 3：signal 族——复合内 sendSignal（带 str 参数）+ 图级 onSignal 消费参数（2026-08-14 规则闭合 v2）
// 触发时机：实体创建时（whenEntityIsCreated）send → onSignal 触发 → print 两个参数
// 判定：日志出现 ping-msg 和 tagA
import { defineSignal, g } from 'genshin-ts/runtime/core'
import { str } from 'genshin-ts/runtime/value'

const Ping = {
  verify_ping: defineSignal('verify_ping', [
    ['msg', 'str'],
    ['tag', 'str']
  ])
} as const

const sigSend = g.defineComposite('verify_sig_send', {
  inputs: {},
  outputs: {},
  build: (_a, f) => {
    f.sendSignal(Ping.verify_ping, new str('ping-msg'), new str('tagA'))
    return {}
  }
})

const graph = g
  .server({ id: 1073741827 })
  .on('whenEntityIsCreated', (_e: any, f: any) => {
    f.callComposite(sigSend, {})
  })
  .onSignal(Ping.verify_ping, (evt: any, f: any) => {
    f.printString(evt.params.msg)
    f.printString(evt.params.tag)
  })
export default graph
