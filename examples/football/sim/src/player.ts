// 球员：本阶段仅为「可控冲量输入源」（核验标准 Out of Scope 球员身体物理）
// 运动学推进 + 带球控制器宿主；一切对球的影响经 applyImpulse/applyStrike（留日志）。

import { Vec3, vNorm, vScale, vAdd, vec3 } from './vec3.js'

export interface PlayerState {
  idx: number
  pos: Vec3
  vel: Vec3
  /** 面向（水平单位向量） */
  facing: Vec3
}

export function makePlayer(idx: number, pos: Vec3, facing?: Vec3): PlayerState {
  let f = facing ? vec3(facing.x, facing.y, facing.z) : vec3(0, 0, 1)
  f = vNorm(vec3(f.x, 0, f.z))
  if (f.x === 0 && f.z === 0) f = vec3(0, 0, 1)
  return { idx, pos: vec3(pos.x, pos.y, pos.z), vel: vec3(0, 0, 0), facing: f }
}

/** 运动学一步（球员不做刚体解算；out of scope） */
export function stepKinematic(p: PlayerState, dt: number): void {
  p.pos = vAdd(p.pos, vScale(p.vel, dt))
}

export interface PlayerSnapshot {
  pos: [number, number, number]
  vel: [number, number, number]
  facing: [number, number, number]
}

export function serializePlayer(p: PlayerState): PlayerSnapshot {
  return {
    pos: [p.pos.x, p.pos.y, p.pos.z],
    vel: [p.vel.x, p.vel.y, p.vel.z],
    facing: [p.facing.x, p.facing.y, p.facing.z]
  }
}

export function deserializePlayer(s: PlayerSnapshot, idx: number): PlayerState {
  return {
    idx,
    pos: vec3(s.pos[0], s.pos[1], s.pos[2]),
    vel: vec3(s.vel[0], s.vel[1], s.vel[2]),
    facing: vec3(s.facing[0], s.facing[1], s.facing[2])
  }
}
