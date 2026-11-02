// @status: 面板（可调试验台；内核读的就是这三个变量）
// zz-aim-panel.ts —— 服务端图：把 Lua 面板按键变成**latch 参数**（点一次永久生效）。
//
// 键位（Lua 侧：F5..F10 + 0）——S6（2026-11-02 用户「粒度不够」）：
//   23 = 力度 ×1.05     24 = 力度 ÷1.05      （百分比步进，初始 1.0，clamp [0.2, 2.2]）
//   25 = 角度 +5°       26 = 角度 −5°         （fb_t_ang，clamp ±75°，替代旧 fb_t_right）
//   27 = 上偏 +1 m/s    28 = 上偏 −1
//   10 = 全部复位（1.0 / 0 / 0）
// 内核 kitLoop 每拍读载体 fb_t_pow/fb_t_ang/fb_t_up；踢球方向 = 前向绕 Y 旋 fb_t_ang × 力度。
// ⚠️ clamp 必须与 fb-input.lua 的 PANEL 镜像完全一致——Lua 显示是本地镜像，两边边界不同=显示漂移
//    （旧版就漂过：Lua [0,3] vs 服务端 [0.2,2.2]）。
import { g } from 'genshin-ts/runtime/core'

import { KitSignal } from './signals.js'

const CARRIER = 1082130445n

// 面板硬边界（与内核 kit-loop 的 POW_MIN/POW_MAX 一致）：
// 修前 bump 只累加不夹 ⇒ 连按 14 次力度到 3.8，水平冲量 38 m/s 被限速夹到 18、
// 自旋却按 38 算（152 rad/s vs 纯滚动 72）⇒ 球打滑注能、越跑越快。
const POW_MIN = 0.2
const POW_MAX = 2.2 // 与球实体 fb_maxv(22)/K1_SPD(10) 对齐：全程线性有效
const ANG_MAX = 75.0 // 角度范围 ±75°（F7 连按 15 次到顶）
const OFF_LIM = 8.0 // 上偏范围 ±8 m/s
const POW_UP = 1.05
const POW_DN = 0.9523809523809524 // = 1/1.05

function clampSet(f: any, name: string, raw: any, lo: number, hi: number): void {
  const c = f.queryEntityByGuid(CARRIER)
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

// 加法步进（角度/上偏）
function bump(f: any, name: string, delta: number, lo: number, hi: number): void {
  clampSet(f, name, f.addition(f.getCustomVariable(f.queryEntityByGuid(CARRIER), name).asType('float'), delta), lo, hi)
}

// 乘法步进（力度百分比）
function bumpMul(f: any, name: string, factor: number, lo: number, hi: number): void {
  clampSet(f, name, f.multiplication(f.getCustomVariable(f.queryEntityByGuid(CARRIER), name).asType('float'), factor), lo, hi)
}

g.server({ id: 1073741834, name: '_GSTS_aimPanel' }).onSignal(KitSignal.fb_input, (evt: any, f: any) => {
  const k = evt.params.key
  f.multipleBranches(k, {
    23: () => { bumpMul(f, 'fb_t_pow', POW_UP, POW_MIN, POW_MAX) },
    24: () => { bumpMul(f, 'fb_t_pow', POW_DN, POW_MIN, POW_MAX) },
    25: () => { bump(f, 'fb_t_ang', 5.0, -ANG_MAX, ANG_MAX) },
    26: () => { bump(f, 'fb_t_ang', -5.0, -ANG_MAX, ANG_MAX) },
    27: () => { bump(f, 'fb_t_up', 1.0, -OFF_LIM, OFF_LIM) },
    28: () => { bump(f, 'fb_t_up', -1.0, -OFF_LIM, OFF_LIM) },
    10: () => {
      const c = f.queryEntityByGuid(CARRIER)
      f.setCustomVariable(c, 'fb_t_pow', 1.0, false)
      f.setCustomVariable(c, 'fb_t_ang', 0.0, false)
      f.setCustomVariable(c, 'fb_t_up', 0.0, false)
      // 旧右偏变量已无消费者，顺手清零防回来
      f.setCustomVariable(c, 'fb_t_right', 0.0, false)
      print('fb-panel')
    },
    default: () => {}
  })
})
