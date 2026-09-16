// src-fb 共享信号单一事实源（地图 1073741908「真实足球」；本地注册 ID 见各 defineSignal 注释）
// @status: active（fb_echo/fb_ball_state 为主链；fb_sv_echo=票14 实验；fb_idle_state=空载历史形态）
// 文件级信号总表：
//   fb_echo        (tag, e, c)     E1 任务/观测回传（ok/tearH/tearE…）
//   fb_ball_state  (tag,tick,pos,vel,spin,state)  R2 物理拍回传（P/T）
//   fb_sv_echo     (tag, e)        票14 原生写通道实验回传（SVA*/SVT*）
//   fb_idle_state  (tag,tick,pos,vel,spin,state)  票19 空载验证（历史/专用）
// 具体 tag 与消费端见各 defineSignal 注释与 BOARD/issue。
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
  //   tag='SVA1..4' 技能变量立即读回值（跨施放保持+零延迟验证，实例编号后缀）
  //   tag='SVT1..4' 客户端自读瞬移位置 x×100（与服务端 fb_tp_seen_x 对照=复制延迟直读）
  fb_sv_echo: defineSignal('fb_sv_echo', [
    ['tag', 'str'],
    ['e', 'int']
  ]),
  // 票 19 空载验证信号（2026-09-03 注册 1610612780/781/782，donor=fb_ball_state 同
  //   6 参 vec3 形态）：空载阶段消费侧 fb-idle-listen 仅计数；wire 与 fb_ball_state 同构。
  //   ⚠️ 当前 fb-phys2 已接管为 fb_ball_state/'P'/'T'，本信号仅用于历史/空载专用场景。
  fb_idle_state: defineSignal('fb_idle_state', [
    ['tag', 'str'],
    ['tick', 'int'],
    ['pos', 'vec3'],
    ['vel', 'vec3'],
    ['spin', 'vec3'],
    ['state', 'int']
  ]),
  // 票 23 v2 驱动包（客户端预算好的"该不该动+怎么动"）：render 变哑执行器
  //   tick  = 计算基 tick；vel = 设备速度向量（已含 /fb_p_drive）；spin = 可视自旋；
  //   pos   = 目标位（|vel|>80 阈值时服务端改走瞬移到 pos）
  //   ⚠️ 需先 assets:signals register 到地图（预注册红线），再注入消费端 render。
  fb_ball_drive: defineSignal('fb_ball_drive', [
    ['tick', 'int'],
    ['vel', 'vec3'],
    ['spin', 'vec3'],
    ['pos', 'vec3']
  ])
} as const
