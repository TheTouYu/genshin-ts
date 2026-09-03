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
  ]),
  // R2 物理拍回传（票 01 注册 → **09-03 用户知识修正后改 6 参 vec3 形态**：
  //   引擎信号参数上限=10，11 参标量形态超限（注册可过/运行不行）→ 浮点九连合并
  //   pos/vel/spin 三个 vec3，send/monitor/server=1610612774/775/776 不变）：
  //   tag='P' 物理拍提交 / 'T' 撕裂（二读不一致，服务端不应用该拍）
  //   tick  = 计算所基于的镜像 tick（base_tick，first-wins 仲裁键）
  //   pos/vel/spin = 本拍积分后的位置/速度/自旋（t+0.2s 预测值）
  //   state = 六态枚举（sim/src/state.ts：0=Airborne 1=Bouncing 2=Sliding 3=Rolling
  //           4=Rest 5=DribbleControlled——03 票 fb-phys 必须同枚举）
  fb_ball_state: defineSignal('fb_ball_state', [
    ['tag', 'str'],
    ['tick', 'int'],
    ['pos', 'vec3'],
    ['vel', 'vec3'],
    ['spin', 'vec3'],
    ['state', 'int']
  ]),
  // 票 14 原生写通道实验回传（2026-09-03 注册 1610612777/778/779，内置布局两参数）：
  //   tag='SVA' 技能变量立即读回值（跨施放保持+零延迟验证）
  //   tag='SVT' 客户端自读瞬移位置 x×100（与服务端 fb_tp_seen_x 对照=复制延迟直读）
  fb_sv_echo: defineSignal('fb_sv_echo', [
    ['tag', 'str'],
    ['e', 'int']
  ])
} as const
