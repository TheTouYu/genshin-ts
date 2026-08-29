// D2 客户端测试共享信号定义：客户端图经「向服务器节点图发送信号」回传 D2 值
import { defineSignal } from 'genshin-ts/runtime/core'

export const D2ClientSignal = {
  d2lv_client: defineSignal('d2lv_client', [
    ['tag', 'str'],
    ['val', 'int']
  ])
} as const
