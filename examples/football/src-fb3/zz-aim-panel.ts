// @status: 面板（可调试验台；内核读的就是这三个变量）
// zz-aim-panel.ts —— 服务端图：把 Lua 面板按键变成**latch 参数**（点一次永久生效）。
//
// 键位（Lua 侧：F5..F10 + 0）：
//   23 = 力度 +0.2     24 = 力度 −0.2
//   25 = 右偏 +1 m/s   26 = 右偏 −1
//   27 = 上偏 +1       28 = 上偏 −1
//   10 = 全部复位（1.0 / 0 / 0）
// 内核 kitLoop 每拍读载体 fb_t_pow/fb_t_right/fb_t_up，踢球方向 = 朝向×力度 + 右轴×右偏，竖直加 up。
import { g } from 'genshin-ts/runtime/core'

import { KitSignal } from './signals.js'

const CARRIER = 1082130445n

// 面板硬边界（与内核 kit-loop 的 POW_MIN/POW_MAX 一致）：
// 修前 bump 只累加不夹 ⇒ 连按 14 次力度到 3.8，水平冲量 38 m/s 被限速夹到 18、
// 自旋却按 38 算（152 rad/s vs 纯滚动 72）⇒ 球打滑注能、越跑越快。
const POW_MIN = 0.2
const POW_MAX = 2.5
const OFF_LIM = 8.0 // 右偏/上偏范围 ±8 m/s

function bump(f: any, name: string, delta: number, lo: number, hi: number): void {
  const c = f.queryEntityByGuid(CARRIER)
  const raw = f.addition(f.getCustomVariable(c, name).asType('float'), delta)
  const clamped = f.localVariable('float')
  f.doubleBranch(
    f.lessThan(raw, lo),
    () => { clamped.set(lo) },
    () => {
      f.doubleBranch(
        f.greaterThan(raw, hi),
        () => { clamped.set(hi) },
        () => { clamped.set(raw) }
      )
    }
  )
  f.setCustomVariable(c, name, clamped.value, false)
  print('fb-panel')
}

g.server({ id: 1073741834, name: '_GSTS_aimPanel' }).onSignal(KitSignal.fb_input, (evt: any, f: any) => {
  const k = evt.params.key
  f.multipleBranches(k, {
    23: () => { bump(f, 'fb_t_pow', 0.2, POW_MIN, POW_MAX) },
    24: () => { bump(f, 'fb_t_pow', -0.2, POW_MIN, POW_MAX) },
    25: () => { bump(f, 'fb_t_right', 1.0, -OFF_LIM, OFF_LIM) },
    26: () => { bump(f, 'fb_t_right', -1.0, -OFF_LIM, OFF_LIM) },
    27: () => { bump(f, 'fb_t_up', 1.0, -OFF_LIM, OFF_LIM) },
    28: () => { bump(f, 'fb_t_up', -1.0, -OFF_LIM, OFF_LIM) },
    10: () => {
      const c = f.queryEntityByGuid(CARRIER)
      f.setCustomVariable(c, 'fb_t_pow', 1.0, false)
      f.setCustomVariable(c, 'fb_t_right', 0.0, false)
      f.setCustomVariable(c, 'fb_t_up', 0.0, false)
      print('fb-panel')
    },
    default: () => {}
  })
})
