// 踢球/触球 API（核验标准 4.4/门 B6）：冲量事件（作用 ≤1 tick）
// 语义：击打把出球速度设为 direction·speed（冲量 J = m·(v_out − v_in)，纯冲量，留日志），
//      自旋设为 spinAxis·spinRate，触球点偏移在其上叠加附加角冲量 (r_off × J)。
// 幅度区间（B6）：射门 25–35 m/s & 8–10 rev/s；传球 10–20 m/s；带球触球 3–8 m/s；power 单调映射。

import { applyAngularImpulse, applyImpulse } from './core.js'
import { PhysicsParams } from './params.js'
import { BallBody } from './state.js'
import { Vec3, vCross, vNorm, vScale, vSub, vec3 } from './vec3.js'

export type KickKind = 'shot' | 'pass' | 'dribble'

export interface KickKindRange {
  speed: [number, number]
  spinRev: [number, number]
}

/** B6 幅度区间表（power ∈ [0,1] 线性单调映射） */
export const KICK_KIND_RANGES: Record<KickKind, KickKindRange> = {
  shot: { speed: [25, 35], spinRev: [8, 10] },
  pass: { speed: [10, 20], spinRev: [2, 4] },
  dribble: { speed: [3, 8], spinRev: [0.3, 1.2] }
}

export interface KickInput {
  /** 出球方向（单位向量，可含仰角） */
  direction: Vec3
  /** 出球速度 m/s */
  speed: number
  /** 自旋轴（单位向量） */
  spinAxis: Vec3
  /** 自旋速率 rad/s */
  spinRate: number
  /** 触球点偏移（球心→触球点方向单位向量；零向量=中心击打） */
  contactOffset: Vec3
  label: string
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t

/**
 * 由类型+力度构造踢球输入。
 * yawDeg=0 → +Z 前；pitchDeg 仰角；默认自旋轴：射门 +Y（侧旋）、传球/带球 +X（上旋）。
 */
export function kickFromPower(
  kind: KickKind,
  power: number,
  yawDeg = 0,
  pitchDeg = 0,
  spinAxis?: Vec3
): KickInput {
  if (power < 0 || power > 1) throw new Error('kick power ∈ [0,1]')
  const range = KICK_KIND_RANGES[kind]
  const speed = lerp(range.speed[0], range.speed[1], power)
  const spinRev = lerp(range.spinRev[0], range.spinRev[1], power)
  const spinRate = spinRev * 2 * Math.PI
  const yaw = (yawDeg * Math.PI) / 180
  const pitch = (pitchDeg * Math.PI) / 180
  const cp = Math.cos(pitch)
  const direction = vec3(Math.sin(yaw) * cp, Math.sin(pitch), Math.cos(yaw) * cp)
  const axis = spinAxis ?? (kind === 'shot' ? vec3(0, 1, 0) : vec3(1, 0, 0))
  return {
    direction,
    speed,
    spinAxis: vNorm(axis),
    spinRate,
    contactOffset: vec3(0, 0, 0),
    label: kind + ':p' + power.toFixed(2)
  }
}

export interface StrikeResult {
  j: Vec3
  dOmega: Vec3
}

/** 出球语义击打（冲量事件）：J = m·(v_out − v)；ω := axis·rate + (r_off×J)/I */
export function applyStrike(ball: BallBody, params: PhysicsParams, input: KickInput): StrikeResult {
  const vOut = vScale(vNorm(input.direction), input.speed)
  const j = vScale(vSub(vOut, ball.vel), params.ball.mass)
  // 线冲量（中心击打部分；唤醒 REST）
  applyImpulse(ball, params, j)
  // 角冲量：自旋设为目标（差额定为角冲量）
  const wTarget = vScale(vNorm(input.spinAxis), input.spinRate)
  const dBase = vSub(wTarget, ball.angVel)
  applyAngularImpulse(ball, params, vScale(dBase, params.ball.inertia))
  // 触球点偏移的附加角冲量（4.4：偏移产生附加旋转/弧线）
  let extra = vec3(0, 0, 0)
  if (input.contactOffset.x !== 0 || input.contactOffset.y !== 0 || input.contactOffset.z !== 0) {
    const rOff = vScale(input.contactOffset, params.ball.radius)
    extra = vCross(rOff, j)
    applyAngularImpulse(ball, params, extra)
  }
  return { j, dOmega: vAdd3(dBase, vScale(extra, 1 / params.ball.inertia)) }
}

function vAdd3(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }
}
