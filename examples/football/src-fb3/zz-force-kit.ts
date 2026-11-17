// @status: 力输入套件服务端图（设计=design/FORCE-KIT-DESIGN.md，2026-11-17）
// zz-force-kit.ts —— 服务端图：Lua 面板/键盘 → fb_input → 镜像 (x,y,z,s) 维护 + 键 7 施力。
//
// 键位（见设计 §2；与 kitListen(1-6)/aimPanel(10,23-28) 无冲突）：
//   31/32 = x −/+     33/34 = y −/+     35/36 = z −/+     37/38 = s −/+
//   39 = 步进循环（fb_kstep int：0=×0.1, 1=×1, 2=×10）
//   41-45 = 预设 P1推射(1,0,0,1) P2抽射(1,0.5,0,1.6) P3吊射(0.5,1.2,0,1)
//                      P4短传(1,0.1,0,1.2) P5弧线(1,0.25,0.7,1.4)
//   7 = 施力（读镜像 + 玩家位 fbvx/fbvz + 球位 fb_rpx/fb_rpz → 世界系力 → fb_f_seq 脉冲）
//   8 = 清力（fb_fx/fy/fz 归零，不脉冲）    9 = 镜像复位 (1,0,0,1) 步进×1
//
// 量纲（设计 §1）：Δv = 0.12 × F_net（内核 PULSE_TICKS=3 × dt=0.04）
//   1 单位 x·s=1 ⇒ 10 m/s 沿连线（H_SCALE=83.33）；1 单位 y·s=1 ⇒ 5 m/s 净上（V_SCALE=41.67，
//   fb_fy 写 G_COMP+净值，内核 accY=extFy−G 抵消重力）；1 单位 z·s=1 ⇒ 10 m/s 侧向。
// ⚠️ G_COMP=9.8 与内核 G_DEFAULT 一致；若用户改球实体 S_P_G，此处不跟随（设计 §9 裁决项）。
// ⚠️ clamp（x/y/z ±100，s 0.1~10）必须与 fb-input.lua 的 FK 镜像完全一致（aimPanel 漂移教训）。
import { g } from 'genshin-ts/runtime/core'

import { KitSignal } from './signals.js'

const CARRIER = 1082130445n
const BALL = 1077936163n

// 量纲换算常数（设计 §1；手感调整改这里重注入）
const H_SCALE = 83.33 // 水平/侧向：1 单位×s=1 ⇒ Δv≈10 m/s
const V_SCALE = 41.67 // 垂直净值：1 单位×s=1 ⇒ Δvy≈5 m/s
const G_COMP = 9.8 // 重力预补偿（内核 accY = extFy − G）

// 镜像硬边界（与 Lua 一致）
const XYZ_LIM = 100.0
const S_MIN = 0.1
const S_MAX = 10.0

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
}

function getF(f: any, name: string): any {
  return f.getCustomVariable(f.queryEntityByGuid(CARRIER), name).asType('float')
}

// 当前步进值（fb_kstep int → 0.1/1/10；int 等值比较用 lessThan 链避免等值节点缺口）
function stepVal(f: any): any {
  const ks = f.getCustomVariable(f.queryEntityByGuid(CARRIER), 'fb_kstep').asType('int')
  const out = f.localVariable('float')
  f.doubleBranch(
    f.lessThan(ks, 1n),
    () => { out.set(0.1) },
    () => {
      f.doubleBranch(
        f.lessThan(ks, 2n),
        () => { out.set(1.0) },
        () => { out.set(10.0) }
      )
    }
  )
  return out.value
}

// 带步进的镜像加减（sign=±1）
function bumpStep(f: any, name: string, sign: number, lo: number, hi: number): void {
  clampSet(f, name, f.addition(getF(f, name), f.multiplication(stepVal(f), sign)), lo, hi)
}

function writeForce(f: any, fx: any, fy: any, fz: any): void {
  const c = f.queryEntityByGuid(CARRIER)
  f.setCustomVariable(c, 'fb_fx', fx, false)
  f.setCustomVariable(c, 'fb_fy', fy, false)
  f.setCustomVariable(c, 'fb_fz', fz, false)
}

// 脉冲：写力 + 自增序号（内核靠序号变化开 3 拍窗口）
function pulse(f: any, fx: any, fy: any, fz: any): void {
  writeForce(f, fx, fy, fz)
  const c = f.queryEntityByGuid(CARRIER)
  const seq = f.getCustomVariable(c, 'fb_f_seq').asType('int')
  f.setCustomVariable(c, 'fb_f_seq', f.addition(seq, 1n), false)
}

function setKit(f: any, x: number, y: number, z: number, s: number): void {
  const c = f.queryEntityByGuid(CARRIER)
  f.setCustomVariable(c, 'fb_kx', x, false)
  f.setCustomVariable(c, 'fb_ky', y, false)
  f.setCustomVariable(c, 'fb_kz', z, false)
  f.setCustomVariable(c, 'fb_ks', s, false)
}

// 键 7：连线单位向量语义施力（设计 §1）
//   û = normalize(球位−玩家位) 水平；ŝ = (−dz, dx)/len（z>0=连线左侧，设计 §9 复测项）
function applyForce(f: any): void {
  const ball = f.queryEntityByGuid(BALL)
  const dx = f.subtraction(f.getCustomVariable(ball, 'fb_rpx').asType('float'), getF(f, 'fbvx'))
  const dz = f.subtraction(f.getCustomVariable(ball, 'fb_rpz').asType('float'), getF(f, 'fbvz'))
  const len = f._3dVectorModuloOperation(f.create3dVector(dx, 0.0, dz))
  f.doubleBranch(
    f.lessThan(len, 0.05),
    () => { /* 球贴脚：方向无意义，跳过（防御） */ },
    () => {
      const ux = f.division(dx, len)
      const uz = f.division(dz, len)
      const sx = f.division(f.multiplication(dz, -1.0), len)
      const sz = f.division(dx, len)
      const kx = getF(f, 'fb_kx')
      const ky = getF(f, 'fb_ky')
      const kz = getF(f, 'fb_kz')
      const ks = getF(f, 'fb_ks')
      const fwdX = f.multiplication(kx, ux)
      const fwdZ = f.multiplication(kx, uz)
      const sideX = f.multiplication(kz, sx)
      const sideZ = f.multiplication(kz, sz)
      const fx = f.multiplication(H_SCALE, f.multiplication(ks, f.addition(fwdX, sideX)))
      const fz = f.multiplication(H_SCALE, f.multiplication(ks, f.addition(fwdZ, sideZ)))
      const fy = f.addition(G_COMP, f.multiplication(V_SCALE, f.multiplication(ky, ks)))
      pulse(f, fx, fy, fz)
    }
  )
}

g.server({ id: 1073741835, name: '_GSTS_forceKit' })
  .onSignal(KitSignal.fb_input, (evt: any, f: any) => {
    const k = evt.params.key
    f.multipleBranches(k, {
      31: () => { bumpStep(f, 'fb_kx', -1.0, -XYZ_LIM, XYZ_LIM) },
      32: () => { bumpStep(f, 'fb_kx', 1.0, -XYZ_LIM, XYZ_LIM) },
      33: () => { bumpStep(f, 'fb_ky', -1.0, -XYZ_LIM, XYZ_LIM) },
      34: () => { bumpStep(f, 'fb_ky', 1.0, -XYZ_LIM, XYZ_LIM) },
      35: () => { bumpStep(f, 'fb_kz', -1.0, -XYZ_LIM, XYZ_LIM) },
      36: () => { bumpStep(f, 'fb_kz', 1.0, -XYZ_LIM, XYZ_LIM) },
      37: () => { bumpStep(f, 'fb_ks', -1.0, S_MIN, S_MAX) },
      38: () => { bumpStep(f, 'fb_ks', 1.0, S_MIN, S_MAX) },
      39: () => {
        const c = f.queryEntityByGuid(CARRIER)
        const ks = f.getCustomVariable(c, 'fb_kstep').asType('int')
        // 注意：f.lessThan 返回节点引脚不是 boolean，禁用 JS 三元（恒真）——必须 doubleBranch
        f.doubleBranch(
          f.lessThan(ks, 2n),
          () => { f.setCustomVariable(c, 'fb_kstep', f.addition(ks, 1n), false) },
          () => { f.setCustomVariable(c, 'fb_kstep', 0n, false) }
        )
      },
      41: () => { setKit(f, 1.0, 0.0, 0.0, 1.0) },
      42: () => { setKit(f, 1.0, 0.5, 0.0, 1.6) },
      43: () => { setKit(f, 0.5, 1.2, 0.0, 1.0) },
      44: () => { setKit(f, 1.0, 0.1, 0.0, 1.2) },
      45: () => { setKit(f, 1.0, 0.25, 0.7, 1.4) },
      7: () => { applyForce(f) },
      8: () => { writeForce(f, 0.0, 0.0, 0.0) },
      9: () => {
        setKit(f, 1.0, 0.0, 0.0, 1.0)
        f.setCustomVariable(f.queryEntityByGuid(CARRIER), 'fb_kstep', 1n, false)
      },
      default: () => {}
    })
  })
