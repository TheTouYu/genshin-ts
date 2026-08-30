// 球体状态：六态状态机（4.4）+ 刚体状态量 + 每 tick 接触摘要
// 状态集合：AIRBORNE / BOUNCING(≤1 tick 瞬态) / SLIDING / ROLLING / REST / DRIBBLE_CONTROLLED

import { Quat, Vec3, quat, vec3 } from './vec3.js'

export enum BallState {
  Airborne = 0,
  Bouncing = 1,
  Sliding = 2,
  Rolling = 3,
  Rest = 4,
  DribbleControlled = 5
}

export const BALL_STATE_NAMES: string[] = [
  'AIRBORNE',
  'BOUNCING',
  'SLIDING',
  'ROLLING',
  'REST',
  'DRIBBLE_CONTROLLED'
]

export interface ExternalForce {
  /** 力向量 N，持续 duration 秒（下一 tick 起被积分并消耗） */
  force: Vec3
  duration: number
}

export interface BallBody {
  /** 球心位置 m（世界坐标） */
  pos: Vec3
  /** 球心速度 m/s */
  vel: Vec3
  /** 角速度 rad/s */
  angVel: Vec3
  /** 姿态四元数（遥测/回放表现用） */
  quatState: Quat
  /** 当前状态机状态 */
  state: BallState
  /** 连续低速 tick 计数（REST 进入条件） */
  restTicks: number
  /** 持球者索引（DRIBBLE_CONTROLLED 时非空） */
  holder: number | null
  /** 外部持续力队列（applyForce API） */
  extForces: ExternalForce[]
  // —— 每 tick 接触摘要（stepBall 开头重置；遥测消费）——
  /** 本 tick 接触法线（最近一次接触；无接触为 null） */
  contactNormal: Vec3 | null
  /** 本 tick 最大穿透深度 m */
  contactPenetration: number
  /** 接触点滑移速度 |v_slip| m/s */
  contactSlip: number
  /** 本 tick 是否发生碰撞冲量（BOUNCING 瞬态标记） */
  impact: boolean
  /** 持续接地接触（支撑/摩擦生效） */
  groundedContact: boolean
  /** 本 tick 生效的力位掩码（core.F） */
  forces: number
  /** 上一个子步是否处于持续地面接触（自旋衰减速率选择） */
  wasPersistentContact: boolean
}

export interface BallSpawn {
  pos: Vec3
  vel?: Vec3
  angVel?: Vec3
  state?: BallState
}

/** 出生初始化——铁律 1 唯一允许直接设置位置/速度的入口之一（另一处 REST 冻结），由 sim 层留日志 */
export function makeBall(spawn: BallSpawn): BallBody {
  return {
    pos: { x: spawn.pos.x, y: spawn.pos.y, z: spawn.pos.z },
    vel: spawn.vel ? { ...spawn.vel } : vec3(0, 0, 0),
    angVel: spawn.angVel ? { ...spawn.angVel } : vec3(0, 0, 0),
    quatState: quat(),
    state: spawn.state ?? BallState.Airborne,
    restTicks: 0,
    holder: null,
    extForces: [],
    contactNormal: null,
    contactPenetration: 0,
    contactSlip: 0,
    impact: false,
    groundedContact: false,
    forces: 0,
    wasPersistentContact: false
  }
}

/** 序列化（D2 快照）：仅持久状态；scratch 每步重算，不入快照 */
export interface BallSnapshot {
  pos: [number, number, number]
  vel: [number, number, number]
  angVel: [number, number, number]
  quat: [number, number, number, number]
  state: number
  restTicks: number
  holder: number | null
  extForces: { force: [number, number, number]; duration: number }[]
}

export function serializeBall(b: BallBody): BallSnapshot {
  return {
    pos: [b.pos.x, b.pos.y, b.pos.z],
    vel: [b.vel.x, b.vel.y, b.vel.z],
    angVel: [b.angVel.x, b.angVel.y, b.angVel.z],
    quat: [b.quatState.x, b.quatState.y, b.quatState.z, b.quatState.w],
    state: b.state,
    restTicks: b.restTicks,
    holder: b.holder,
    extForces: b.extForces.map((f) => ({
      force: [f.force.x, f.force.y, f.force.z],
      duration: f.duration
    }))
  }
}

export function deserializeBall(s: BallSnapshot): BallBody {
  const b = makeBall({
    pos: vec3(s.pos[0], s.pos[1], s.pos[2]),
    vel: vec3(s.vel[0], s.vel[1], s.vel[2]),
    angVel: vec3(s.angVel[0], s.angVel[1], s.angVel[2])
  })
  b.quatState = quat(s.quat[0], s.quat[1], s.quat[2], s.quat[3])
  b.state = s.state
  b.restTicks = s.restTicks
  b.holder = s.holder
  b.extForces = s.extForces.map((f) => ({
    force: vec3(f.force[0], f.force[1], f.force[2]),
    duration: f.duration
  }))
  return b
}

export interface TransitionRecord {
  tick: number
  ball: number
  from: BallState
  to: BallState
}
