// @status: 施力测试图（独立于生产链）
// zz-force-test.ts —— **服务端图**：把 Lua 按键翻译成「对球施加的力」，走内核的外部施力通道。
//
// 为什么这么测（用户 2026-10-31 口径）：不再造"测试专用造物图"，而是用**独立服务端图 + Lua 按键**驱动。
//   链路：Lua 键 → fb_input 信号 → 本图 → 写载体实体变量 fb_fx/fb_fy/fb_fz（单位质量力 m/s²）
//         → 内核 kitLoop 每拍读它们并作为加速度叠加（kit-loop.ts:272-274 / 506）
//   按键：1=+x 8  2=−x 8  3=+z 8  4=−z 8  5=+y 12（抬）  6=清零
import { g } from 'genshin-ts/runtime/core'

import { KitSignal } from './signals.js'

const CARRIER = 1082130445n

function writeForce(f: any, fx: number, fy: number, fz: number): void {
  const c = f.queryEntityByGuid(CARRIER)
  f.setCustomVariable(c, 'fb_fx', fx, false)
  f.setCustomVariable(c, 'fb_fy', fy, false)
  f.setCustomVariable(c, 'fb_fz', fz, false)
}

g.server({ id: 1073741832, name: '_GSTS_forceTest' }).onSignal(KitSignal.fb_input, (evt: any, f: any) => {
  const k = evt.params.key
  f.doubleBranch(f.equal(k, 1n), () => { writeForce(f, 8.0, 0.0, 0.0) }, () => {})
  f.doubleBranch(f.equal(k, 2n), () => { writeForce(f, -8.0, 0.0, 0.0) }, () => {})
  f.doubleBranch(f.equal(k, 3n), () => { writeForce(f, 0.0, 0.0, 8.0) }, () => {})
  f.doubleBranch(f.equal(k, 4n), () => { writeForce(f, 0.0, 0.0, -8.0) }, () => {})
  f.doubleBranch(f.equal(k, 5n), () => { writeForce(f, 0.0, 12.0, 0.0) }, () => {})
  f.doubleBranch(f.equal(k, 6n), () => { writeForce(f, 0.0, 0.0, 0.0) }, () => {})
})
