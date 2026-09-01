// 足球客户端算力最小通路（E1，2026-09-02，地图 1073741908「真实足球」）
// 客户端 20008 图回传信号：(tag, epoch, counter)
//   tag = 'ok' 快照完整已计算 / 'tearH' 哈希不符 / 'tearE' 二读 epoch 变了
//   e   = 本次计算对应的 epoch（服务端 ack 只前进不回退）
//   c   = 客户端图内计数器当前值（E2 图变量跨拍保持验证：服务端应看到 c 逐拍 +1 递增）
// 注册：sendId=1610612771 monitorId=1610612772 serverId=1610612773（本地图 1908，内置布局三参数）
import { defineSignal } from 'genshin-ts/runtime/core'

export const FbSignal = {
  fb_echo: defineSignal('fb_echo', [
    ['tag', 'str'],
    ['e', 'int'],
    ['c', 'int']
  ])
} as const
