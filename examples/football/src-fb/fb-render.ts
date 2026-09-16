// @status: active（服务端渲染图，挂球实体 1077936135；票 23 v2——信号驱动哑执行器）
// fb-render.ts —— 渲染器（单一职责）：无定时器、无轮询、无分支判定。
// 客户端物理图预算好一切（变化门控 + fb_ball_drive 驱动包：vel 已含 /dur、pos=目标位），
// 本图只做两件事：|vel|>80 → 瞬移到 pos（RESET/大跳）；否则挂 线性(可选旋转) 运动设备。
import { g } from 'genshin-ts/runtime/core'
import { float } from 'genshin-ts/runtime/value'
import { FbSignal } from './signals.js'
import { fbDriveDirect, fbTeleport } from './fb-shared.js'

const graph = g
  .server({
    id: 1073741830,
    name: '_GSTS_fbRender'
  })
  .onSignal(FbSignal.fb_ball_drive, (evt, f) => {
    const ball = f.getSelfEntity()
    const vel = evt.params.vel
    const spd = f._3dVectorModuloOperation(vel)
    const dur = f.getCustomVariable(ball, 'fb_p_drive').asType('float')
    f.doubleBranch(f.greaterThan(spd, new float(80)), () => {
      // 大跳（RESET/进球复位/落体重摆）：INSTANT 瞬移防百米条纹
      f.callComposite(fbTeleport, { ball, pos: evt.params.pos })
    }, () => {
      // 常态：客户端已算好 设备速度（含 /dur）与自旋——零计算直加设备
      f.callComposite(fbDriveDirect, { ball, dur, vel, spin: evt.params.spin })
    })
  })

export default graph