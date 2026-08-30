// C2S 变量通道核验共享信号：客户端图经「向服务器节点图发送信号」回传读到的变量值
import { defineSignal } from 'genshin-ts/runtime/core'

export const C2sCvSignal = {
  d2cv: defineSignal('d2cv', [
    ['tag', 'str'],
    ['val', 'int']
  ])
} as const
