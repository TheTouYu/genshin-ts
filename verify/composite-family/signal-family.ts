// @ts-nocheck
// 实验 3：signal 族——复合内 sendSignal 编码 + 图级 onSignal 监听（2026-08-14 规则闭合）
// 预期：按 Tab → 复合内 send verify_ping → 图级 onSignal 触发 → print
// 判定：日志出现 sig-received
import { defineSignal, g } from 'genshin-ts/runtime/core'
import { str } from 'genshin-ts/runtime/value'

const Ping = { verify_ping: defineSignal('verify_ping', []) } as const

const sigSend = g.defineComposite('verify_sig_send', {
  inputs: {},
  outputs: {},
  build: (_a, f) => {
    f.sendSignal(Ping.verify_ping as never)
    return {}
  }
})

const graph = g
  .server({ id: 1073741828 })
  .on('whenTabIsSelected', (_e: any, f: any) => {
    f.callComposite(sigSend, {})
  })
  .onSignal(Ping.verify_ping, (_evt: any, f: any) => {
    f.printString('sig-received')
  })
export default graph
