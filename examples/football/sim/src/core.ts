// 足球物理核心：stepBall(world, params, index, balls, dt) —— 纯步进、无全局可变状态
// [iron:4] 本模块不读时钟、不读随机源、不读渲染状态；同平台同输入逐位一致。
// [iron:1] 球的一切运动只来自数值积分（RK4 气动段 + 精确指数自旋衰减）与碰撞冲量；
//          直接设置位置/速度仅两处：出生初始化（state.ts makeBall，sim 层留日志）与 REST 冻结。
// 力学模型（核验标准 4.3）：
//   重力 F_g = m·g·(0,-1,0)；拖拽 F_d = -½ρCdA|v|v；马格努斯 F_M = k(ω×v)
//   接触：法向冲量 + 恢复系数 e；切向库仑摩擦（接触点滑移 v_slip = v + ω×(-r·n̂)，
//   薄壁球壳停滑冲量 P = -0.4·m·v_slip，Δv_c = 2.5·P/m）；纯滚 F_r = -m·a_roll·v̂（无力矩）
//   自旋衰减 ω̇ = -(ln2/T½)ω（空中全向量；地面滚动态仅法向分量且更快——保证 A5 纯滚一致性）

import { BallState, BallBody } from './state.js'
import { PhysicsParams, SurfaceParams } from './params.js'
import { CapsuleCollider, PlaneCollider, PhysicsWorld } from './world.js'
import { Quat, Vec3, integrateQuat, vAdd, vClone, vCross, vDot, vLen, vLerp, vNorm, vScale, vSub, vTangent, vec3 } from './vec3.js'

/** 力位掩码（遥测 active_forces） */
export const F = {
  GRAVITY: 1,
  DRAG: 2,
  MAGNUS: 4,
  SPIN_DECAY: 8,
  CONTACT_NORMAL: 16,
  IMPACT_FRICTION: 32,
  SLIDE_FRICTION: 64,
  ROLL_RESIST: 128,
  SUPPORT: 256,
  DEPENETRATE: 512,
  IMPULSE: 1024,
  EXT_FORCE: 2048,
  CLAMP: 4096
} as const

export const FORCE_NAMES: [number, string][] = [
  [F.GRAVITY, 'GRAVITY'],
  [F.DRAG, 'DRAG'],
  [F.MAGNUS, 'MAGNUS'],
  [F.SPIN_DECAY, 'SPIN_DECAY'],
  [F.CONTACT_NORMAL, 'CONTACT_NORMAL'],
  [F.IMPACT_FRICTION, 'IMPACT_FRICTION'],
  [F.SLIDE_FRICTION, 'SLIDE_FRICTION'],
  [F.ROLL_RESIST, 'ROLL_RESIST'],
  [F.SUPPORT, 'SUPPORT'],
  [F.DEPENETRATE, 'DEPENETRATE'],
  [F.IMPULSE, 'IMPULSE'],
  [F.EXT_FORCE, 'EXT_FORCE'],
  [F.CLAMP, 'CLAMP']
]

export function forcesToString(bits: number): string {
  const names: string[] = []
  for (const [mask, name] of FORCE_NAMES) if ((bits & mask) !== 0) names.push(name)
  return names.join('|')
}

export class PhysicsError extends Error {
  constructor(message: string) {
    super('PhysicsError: ' + message)
    this.name = 'PhysicsError'
  }
}

/** 碰撞冲量记录（C6 断言与审计用） */
export interface ImpactRecord {
  tick: number
  ball: number
  tag: string
  normal: Vec3
  vPre: Vec3
  vPost: Vec3
  wPre: Vec3
  wPost: Vec3
  jn: number
  jt: number
}

/** 持球者信息（分类用；sim 层注入） */
export interface HolderInfo {
  pos: Vec3
}

interface SubstepCtx {
  world: PhysicsWorld
  params: PhysicsParams
  index: number
  balls: BallBody[]
  tick: number
  impacts: ImpactRecord[]
}

// ============================================================
// 公开冲量 API —— 一切外部影响的唯一入口（5.2 规则 6；日志由 sim 层记录）
// ============================================================

/** 线冲量：Δv = J/m；触球点偏移产生附加角冲量 Δω = (r_off × J)/I */
export function applyImpulse(
  ball: BallBody,
  params: PhysicsParams,
  J: Vec3,
  contactOffset?: Vec3,
  wake = true
): void {
  ball.vel = vAdd(ball.vel, vScale(J, 1 / params.ball.mass))
  if (contactOffset && (contactOffset.x !== 0 || contactOffset.y !== 0 || contactOffset.z !== 0)) {
    const rOff = vScale(contactOffset, params.ball.radius)
    ball.angVel = vAdd(ball.angVel, vScale(vCross(rOff, J), 1 / params.ball.inertia))
  }
  if (wake && ball.state === BallState.Rest) {
    // REST → 任意：外部冲量唤醒（4.4）
    ball.state = BallState.Sliding
    ball.restTicks = 0
  }
  ball.forces |= F.IMPULSE
}

/** 角冲量：Δω = L/I（踢球设定自旋用；唤醒同上） */
export function applyAngularImpulse(ball: BallBody, params: PhysicsParams, L: Vec3, wake = true): void {
  ball.angVel = vAdd(ball.angVel, vScale(L, 1 / params.ball.inertia))
  if (wake && ball.state === BallState.Rest) {
    ball.state = BallState.Sliding
    ball.restTicks = 0
  }
  ball.forces |= F.IMPULSE
}

// ============================================================
// 气动加速度与 RK4
// ============================================================

function aeroAccel(params: PhysicsParams, v: Vec3, w: Vec3, extAccel: Vec3 | null): Vec3 {
  // [iron:6] 全部系数来自 params（无内联系数）
  let a = vec3(0, -params.env.gravity, 0)
  const s = vLen(v)
  if (s > 0 && params.env.airDensity > 0) {
    a = vAdd(a, vScale(v, (-(0.5 * params.env.airDensity * params.env.dragCoeff * params.ball.crossSectionArea) / params.ball.mass) * s))
  }
  if (params.env.magnusK > 0) {
    a = vAdd(a, vScale(vCross(w, v), params.env.magnusK / params.ball.mass))
  }
  if (extAccel) a = vAdd(a, extAccel)
  return a
}

/** RK4 一步（p,v）耦合；常加速度段（真空弹道）在网格点上精确（A1/A2 关键） */
function rk4Step(ball: BallBody, params: PhysicsParams, h: number, extAccel: Vec3 | null): void {
  const p0 = ball.pos
  const v0 = ball.vel
  const w = ball.angVel
  const k1v = aeroAccel(params, v0, w, extAccel)
  const k1p = v0
  const v2 = vAdd(v0, vScale(k1v, 0.5 * h))
  const k2v = aeroAccel(params, v2, w, extAccel)
  const v3 = vAdd(v0, vScale(k2v, 0.5 * h))
  const k3v = aeroAccel(params, v3, w, extAccel)
  const v4 = vAdd(v0, vScale(k3v, h))
  const k4v = aeroAccel(params, v4, w, extAccel)
  ball.pos = vAdd(p0, vScale(vAdd(vAdd(k1p, vScale(v2, 2)), vAdd(vScale(v3, 2), v4)), h / 6))
  ball.vel = vAdd(v0, vScale(vAdd(vAdd(k1v, vScale(k2v, 2)), vAdd(vScale(k3v, 2), k4v)), h / 6))
}

// ============================================================
// 接触求解（冲量法）
// ============================================================

/** 接触点滑移速度（切向）：v_slip = tangent(v + ω×(-r·n), n) */
export function slipVelocity(ball: BallBody, params: PhysicsParams, n: Vec3): Vec3 {
  const rc = vScale(n, -params.ball.radius)
  const vc = vAdd(ball.vel, vCross(ball.angVel, rc))
  return vTangent(vc, n)
}

/**
 * 切向摩擦冲量：P = -0.4·m·v_slip（薄壁球壳停滑冲量；Δv_c = 2.5·P/m），
 * 受库仑预算 |P| ≤ budget 约束。同时改变 v 与 ω（τ = r_c × P）。
 */
function applyTangentImpulse(
  ball: BallBody,
  params: PhysicsParams,
  n: Vec3,
  slip: Vec3,
  budget: number,
  forceBit: number
): number {
  const slipMag = vLen(slip)
  if (slipMag < 1e-12 || budget <= 0) return 0
  const m = params.ball.mass
  let P = vScale(slip, -0.4 * m)
  const Pmag = 0.4 * m * slipMag
  if (Pmag > budget) P = vScale(P, budget / Pmag)
  const rc = vScale(n, -params.ball.radius)
  ball.vel = vAdd(ball.vel, vScale(P, 1 / m))
  ball.angVel = vAdd(ball.angVel, vScale(vCross(rc, P), 1 / params.ball.inertia))
  ball.forces |= forceBit
  return vLen(P)
}

/** 碰撞冲量解算（法向 e 反射 + 切向库仑摩擦），记录冲量日志 */
function resolveImpact(
  ctx: SubstepCtx,
  ball: BallBody,
  n: Vec3,
  surface: SurfaceParams,
  tag: string
): { jn: number; jt: number } {
  const p = ctx.params
  const vn = vDot(ball.vel, n)
  if (vn >= 0) return { jn: 0, jt: 0 }
  const wPre = vClone(ball.angVel)
  const vPre = vClone(ball.vel)
  // 法向冲量 J_n = -(1+e)·m·v_n
  const jn = -(1 + surface.restitution) * p.ball.mass * vn
  ball.vel = vAdd(ball.vel, vScale(n, jn / p.ball.mass))
  ball.forces |= F.CONTACT_NORMAL
  // 切向摩擦（碰撞冲量预算 μ·J_n）
  const slip = slipVelocity(ball, p, n)
  const jt = applyTangentImpulse(ball, p, n, slip, surface.frictionSlide * jn, F.IMPACT_FRICTION)
  ball.impact = true
  ball.state = BallState.Bouncing // 瞬态标记（≤1 tick，tick 末分类立即离开）[iron:5]
  ball.contactNormal = vClone(n)
  ctx.impacts.push({
    tick: ctx.tick,
    ball: ctx.index,
    tag,
    normal: vClone(n),
    vPre,
    vPost: vClone(ball.vel),
    wPre,
    wPost: vClone(ball.angVel),
    jn,
    jt
  })
  return { jn, jt }
}

/** 平滑去穿透（C7：限速推出；纯位置纠偏，不产生速度） */
function depenetrate(ball: BallBody, params: PhysicsParams, n: Vec3, pen: number, h: number): void {
  const corr = Math.min(pen - params.integration.penSlop, params.integration.depenetrationRate * h)
  if (corr > 0) {
    ball.pos = vAdd(ball.pos, vScale(n, corr))
    ball.forces |= F.DEPENETRATE
    if (pen > ball.contactPenetration) ball.contactPenetration = pen
  }
}

/** 持续地面接触：支撑 + 滑动摩擦/滚动阻力 + 滚动约束锁定 + 自旋衰减 */
function persistentGround(ctx: SubstepCtx, ball: BallBody, n: Vec3, h: number): void {
  const p = ctx.params
  const surface = ctx.world.surfaceOf(p, ctx.world.groundSurfaceKey)
  const th = p.thresholds
  ball.groundedContact = true
  ball.contactNormal = vClone(n)
  // 支撑：消去趋近法向速度（微撞击不反弹，防 BOUNCING 抖动）
  const vn = vDot(ball.vel, n)
  if (vn < 0) {
    ball.vel = vSub(ball.vel, vScale(n, vn))
    ball.forces |= F.SUPPORT
  }
  const slip = slipVelocity(ball, p, n)
  const slipMag = vLen(slip)
  if (slipMag > ball.contactSlip) ball.contactSlip = slipMag
  if (slipMag >= th.epsSlipLo) {
    // —— 滑动态：切向动摩擦 F_f = -μ·N·v̂_slip（支撑力 N = m·|g·n̂|）——
    const gVec = vec3(0, -p.env.gravity, 0)
    const N = p.ball.mass * Math.abs(vDot(gVec, n))
    const budget = surface.frictionSlide * N * h
    applyTangentImpulse(ball, p, n, slip, budget, F.SLIDE_FRICTION)
    // 地面自旋衰减（全向量，更快）——4.3「地面可更快」
    ball.angVel = vScale(ball.angVel, Math.pow(2, -h / p.spin.decayHalfLifeGround))
    ball.forces |= F.SPIN_DECAY
  } else {
    // —— 纯滚态：滚动阻力（无力矩）+ 滚动分量约束锁定 + 法向自旋更快衰减 ——
    const vt = vTangent(ball.vel, n)
    const vtm = vLen(vt)
    if (vtm > 1e-9) {
      const dec = Math.min(surface.rollDecel * h, vtm)
      ball.vel = vSub(ball.vel, vScale(vt, dec / vtm))
      ball.forces |= F.ROLL_RESIST
    }
    const wn = vDot(ball.angVel, n) * Math.pow(2, -h / p.spin.decayHalfLifeGround)
    const vt2 = vTangent(ball.vel, n)
    const wRoll = vScale(vCross(n, vt2), 1 / p.ball.radius) // 纯滚约束 ω_t = (n̂×v)/r
    ball.angVel = vAdd(vScale(n, wn), wRoll)
    ball.forces |= F.SPIN_DECAY
  }
  // 位置纠偏：滚动/滑动球每子步因重力下沉 ½gh²，须平滑推回（否则无限下沉）；
  // 皮肤区内慢速球（|vn| < ε_bounce）投影回接触面 d=r——支撑只杀速度不还原位置，
  // 下坠积累会从上方穿越接触面制造幽灵 TOI 冲量（tick 级假弹跳），必须钉回
  const d = ctx.world.groundHeight(ball.pos)
  const pen = p.ball.radius - d
  if (pen > p.integration.penSlop) {
    depenetrate(ball, p, n, pen, h)
  } else if (d > p.ball.radius && d < p.ball.radius + p.integration.contactSkin) {
    const vn2 = vDot(ball.vel, n)
    if (Math.abs(vn2) < th.epsBounce) {
      ball.pos = vSub(ball.pos, vScale(n, d - p.ball.radius))
      ball.forces |= F.DEPENETRATE
    }
  }
}

// ============================================================
// 碰撞体检测（TOI + 就地解算）
// ============================================================

function inRegion(pos: Vec3, r: PlaneCollider['region']): boolean {
  if (!r) return true
  if (r.xMin !== undefined && pos.x < r.xMin) return false
  if (r.xMax !== undefined && pos.x > r.xMax) return false
  if (r.yMin !== undefined && pos.y < r.yMin) return false
  if (r.yMax !== undefined && pos.y > r.yMax) return false
  if (r.zMin !== undefined && pos.z < r.zMin) return false
  if (r.zMax !== undefined && pos.z > r.zMax) return false
  return true
}

/** 球心到线段最近点 */
function closestOnSegment(p: Vec3, a: Vec3, b: Vec3): Vec3 {
  const ab = vSub(b, a)
  const denom = ab.x * ab.x + ab.y * ab.y + ab.z * ab.z
  const t = denom > 1e-12 ? vDot(vSub(p, a), ab) / denom : 0
  const tc = t < 0 ? 0 : t > 1 ? 1 : t
  return vAdd(a, vScale(ab, tc))
}

/** 胶囊有向距离：|p − closest| − (r_ball + r_cap) */
function capsuleSignedDist(p: Vec3, cap: CapsuleCollider, ballR: number): number {
  const c = closestOnSegment(p, cap.a, cap.b)
  const d = vSub(p, c)
  return Math.sqrt(d.x * d.x + d.y * d.y + d.z * d.z) - (ballR + cap.radius)
}

/** 二分 TOI（24 次迭代，确定性）：从子步起点（在外）到终点（穿透）求接触时刻比例 */
function capsuleToiFraction(p0: Vec3, p1: Vec3, cap: CapsuleCollider, ballR: number): number {
  let lo = 0
  let hi = 1
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2
    const pm = vLerp(p0, p1, mid)
    if (capsuleSignedDist(pm, cap, ballR) > 0) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

function resolveColliders(
  ctx: SubstepCtx,
  ball: BallBody,
  h: number,
  depth: number,
  start: { pos: Vec3; vel: Vec3; angVel: Vec3; quat: Quat }
): boolean {
  const p = ctx.params
  for (const col of ctx.world.colliders) {
    if (col.kind === 'plane') {
      if (!inRegion(ball.pos, col.region)) continue
      const s1 = vDot(ball.pos, col.normal) - col.offset
      if (s1 < p.ball.radius) {
        const s0 = vDot(start.pos, col.normal) - col.offset
        const n = col.normal
        const surface = ctx.world.surfaceOf(p, col.surfaceKey)
        if (s0 > p.ball.radius && depth < 3) {
          // TOI 回滚（与地面同法）：精确到接触时刻反射
          const f = (s0 - p.ball.radius) / (s0 - s1)
          rollbackTo(ball, start, f)
          const vnC = vDot(ball.vel, n)
          if (vnC < 0) resolveImpact(ctx, ball, n, surface, col.tag)
          const rem = h * (1 - f)
          if (rem > 1e-12) advanceSubstep(ctx, ball, rem, depth + 1)
          return true
        }
        // 区域门平面（球网）：进入生效区域时已在平面后方（从网上方飞过落到网后）
        // → 不属于本碰撞体职责，跳过（否则产生幽灵巨穿透）
        if (col.region && s0 < -p.ball.radius) continue
        const vn = vDot(ball.vel, n)
        if (vn < -p.thresholds.epsBounce) {
          resolveImpact(ctx, ball, n, surface, col.tag)
        } else if (vn < 0) {
          ball.vel = vSub(ball.vel, vScale(n, vn))
          ball.forces |= F.SUPPORT
        }
        if (s1 < p.ball.radius - p.integration.penSlop) {
          depenetrate(ball, p, n, p.ball.radius - s1, h)
        }
      }
    } else {
      const sNow = capsuleSignedDist(ball.pos, col, p.ball.radius)
      if (sNow < 0) {
        const sStart = capsuleSignedDist(start.pos, col, p.ball.radius)
        if (sStart > 0 && depth < 3) {
          // TOI 回滚：回退到接触时刻 → 冲量 → 剩余时间续推（递归推进处理后续）
          const f = capsuleToiFraction(start.pos, ball.pos, col, p.ball.radius)
          rollbackTo(ball, start, f)
          const c = closestOnSegment(ball.pos, col.a, col.b)
          const n = vNorm(vSub(ball.pos, c))
          resolveImpact(ctx, ball, n, ctx.world.surfaceOf(p, col.surfaceKey), col.tag)
          advanceSubstep(ctx, ball, h * (1 - f), depth + 1)
          return true
        }
        // 子步起点已在胶囊内（出生嵌入等）：就地解算
        const c = closestOnSegment(ball.pos, col.a, col.b)
        const dvec = vSub(ball.pos, c)
        const dist = vLen(dvec)
        let n: Vec3
        if (dist > 1e-9) {
          n = vScale(dvec, 1 / dist)
        } else {
          // 退化（球心在柱轴上）：从门中心向外水平推出（径向）
          const rad = vec3(ball.pos.x, 0, ball.pos.z - col.a.z)
          const rl = vLen(rad)
          n = rl > 1e-9 ? vScale(rad, 1 / rl) : vec3(1, 0, 0)
        }
        const vn = vDot(ball.vel, n)
        if (vn < 0) resolveImpact(ctx, ball, n, ctx.world.surfaceOf(p, col.surfaceKey), col.tag)
        depenetrate(ball, p, n, p.ball.radius + col.radius - dist, h)
      }
    }
  }
  return false
}

/** 回滚到子步内比例 f 处（位置/速度/角速度线性插值；姿态回起点，随后续推进） */
function rollbackTo(ball: BallBody, start: { pos: Vec3; vel: Vec3; angVel: Vec3; quat: Quat }, f: number): void {
  ball.pos = vLerp(start.pos, ball.pos, f)
  ball.vel = vLerp(start.vel, ball.vel, f)
  ball.angVel = vLerp(start.angVel, ball.angVel, f)
  ball.quatState = { x: start.quat.x, y: start.quat.y, z: start.quat.z, w: start.quat.w }
}

// ============================================================
// 子步推进（自适应子步 CCD 见 stepBall；TOI 分裂深度 ≤3）
// ============================================================

function advanceSubstep(ctx: SubstepCtx, ball: BallBody, h: number, depth: number): void {
  const p = ctx.params
  const start = {
    pos: vClone(ball.pos),
    vel: vClone(ball.vel),
    angVel: vClone(ball.angVel),
    quat: { x: ball.quatState.x, y: ball.quatState.y, z: ball.quatState.z, w: ball.quatState.w }
  }
  // 外部持续力（applyForce API）：本子步内作为附加加速度，时长递减
  let extAccel: Vec3 | null = null
  if (ball.extForces.length > 0) {
    let acc = vec3(0, 0, 0)
    for (const ef of ball.extForces) {
      acc = vAdd(acc, vScale(ef.force, 1 / p.ball.mass))
      ef.duration -= h
    }
    ball.extForces = ball.extForces.filter((e) => e.duration > 0)
    extAccel = acc
    ball.forces |= F.EXT_FORCE
  }
  // RK4 气动段积分（重力+拖拽+马格努斯；真空弹道网格点精确）
  ball.forces |= F.GRAVITY
  if (p.env.airDensity > 0) ball.forces |= F.DRAG
  if (p.env.magnusK > 0 && vLen(ball.angVel) > 0) ball.forces |= F.MAGNUS
  rk4Step(ball, p, h, extAccel)
  // 姿态积分
  ball.quatState = integrateQuat(ball.quatState, ball.angVel, h)
  // 空中自旋衰减（精确指数因子；地面持续接触态在 persistentGround 内处理）
  if (!ball.wasPersistentContact) {
    ball.angVel = vScale(ball.angVel, Math.pow(2, -h / p.spin.decayHalfLifeAir))
    ball.forces |= F.SPIN_DECAY
  }
  ball.wasPersistentContact = false

  // —— 地面 TOI（闭式分数：反弹时刻精确，A4 能量守恒关键）——
  if (ctx.world.hasGround) {
    const n = ctx.world.groundNormal
    const d0 = ctx.world.groundHeight(start.pos)
    const d1 = ctx.world.groundHeight(ball.pos)
    const r = p.ball.radius
    if (d0 > r && d1 < r) {
      const f = (d0 - r) / (d0 - d1)
      const tC = f * h
      rollbackTo(ball, start, f)
      const surface = ctx.world.surfaceOf(p, ctx.world.groundSurfaceKey)
      resolveImpact(ctx, ball, n, surface, 'ground')
      const rem = h - tC
      if (rem > 1e-12) {
        advanceSubstep(ctx, ball, rem, depth + 1)
      } else {
        resolveCollidersAndPairs(ctx, ball, h, depth, start)
        persistentGroundIfTouching(ctx, ball, n, h)
      }
      return
    }
  }
  const hit = resolveCollidersAndPairs(ctx, ball, h, depth, start)
  if (hit) return // TOI 递归已处理剩余子步（含持续接触）
  // 持续地面接触：仅在真实重叠（d < r）或慢速贴地（皮肤区内且法向速度不显著趋近）时生效；
  // 快速下落尚未重叠的子步不做支撑消速（否则首触被吞掉反弹能量），交给下一子步 TOI 解算
  if (ctx.world.hasGround) {
    const n = ctx.world.groundNormal
    if (persistentContactActive(ctx, ball)) {
      persistentGround(ctx, ball, n, h)
    }
  }
}

/** 持续接触生效条件：真实重叠，或皮肤区内且非快速趋近（慢速贴地/离地掠过） */
function persistentContactActive(ctx: SubstepCtx, ball: BallBody): boolean {
  const r = ctx.params.ball.radius
  const d = ctx.world.groundHeight(ball.pos)
  if (d < r) return true
  if (d < r + ctx.params.integration.contactSkin) {
    const vn = vDot(ball.vel, ctx.world.groundNormal)
    if (vn > -ctx.params.thresholds.epsBounce) return true
  }
  return false
}

function persistentGroundIfTouching(ctx: SubstepCtx, ball: BallBody, n: Vec3, h: number): void {
  if (persistentContactActive(ctx, ball)) {
    persistentGround(ctx, ball, n, h)
  }
}

function resolveCollidersAndPairs(
  ctx: SubstepCtx,
  ball: BallBody,
  h: number,
  depth: number,
  start: { pos: Vec3; vel: Vec3; angVel: Vec3; quat: Quat }
): boolean {
  const hit = resolveColliders(ctx, ball, h, depth, start)
  resolveBallPairs(ctx, ball, h)
  return hit
}

/** 球-球碰撞（就地解算；i<j 每对只处理一次；法向冲量 + 线性切向摩擦） */
function resolveBallPairs(ctx: SubstepCtx, ball: BallBody, h: number): void {
  const p = ctx.params
  const r2 = 2 * p.ball.radius
  for (let j = ctx.index + 1; j < ctx.balls.length; j++) {
    const other = ctx.balls[j]
    const dv = vSub(ball.pos, other.pos)
    const dist = vLen(dv)
    if (dist >= r2 || dist < 1e-12) continue
    const n = vScale(dv, 1 / dist)
    const vrel = vSub(ball.vel, other.vel)
    const vn = vDot(vrel, n)
    const surface = ctx.world.surfaceOf(p, 'ballBall')
    if (vn < 0) {
      const vPreI = vClone(ball.vel)
      const wPreI = vClone(ball.angVel)
      const mu = p.ball.mass / 2
      const jn = -(1 + surface.restitution) * mu * vn
      ball.vel = vAdd(ball.vel, vScale(n, jn / p.ball.mass))
      other.vel = vSub(other.vel, vScale(n, jn / p.ball.mass))
      ball.forces |= F.CONTACT_NORMAL
      other.forces |= F.CONTACT_NORMAL
      // 线性切向摩擦（球-球自旋交换简化为线性；README 已记录该简化）
      const vt = vTangent(vrel, n)
      const vtm = vLen(vt)
      if (vtm > 1e-9) {
        const jt = Math.min(0.5 * mu * vtm, surface.frictionSlide * jn)
        ball.vel = vAdd(ball.vel, vScale(vt, -jt / (vtm * p.ball.mass)))
        other.vel = vAdd(other.vel, vScale(vt, jt / (vtm * p.ball.mass)))
      }
      ball.impact = true
      other.impact = true
      ball.contactNormal = vClone(n)
      other.contactNormal = vScale(n, -1)
      if (ball.state === BallState.Rest) {
        ball.state = BallState.Sliding
        ball.restTicks = 0
      }
      if (other.state === BallState.Rest) {
        other.state = BallState.Sliding
        other.restTicks = 0
      }
      ctx.impacts.push({
        tick: ctx.tick,
        ball: ctx.index,
        tag: 'ball-ball',
        normal: vClone(n),
        vPre: vPreI,
        vPost: vClone(ball.vel),
        wPre: wPreI,
        wPost: vClone(ball.angVel),
        jn,
        jt: 0
      })
    }
    // 位置纠偏（对半分摊）
    const dNow = vSub(ball.pos, other.pos)
    const distNow = vLen(dNow)
    const pen = r2 - distNow
    if (pen > p.integration.penSlop && distNow > 1e-12) {
      const n2 = vScale(dNow, 1 / distNow)
      const corr = Math.min(pen / 2, p.integration.depenetrationRate * h)
      ball.pos = vAdd(ball.pos, vScale(n2, corr))
      other.pos = vSub(other.pos, vScale(n2, corr))
      ball.forces |= F.DEPENETRATE
      other.forces |= F.DEPENETRATE
    }
  }
}

// ============================================================
// 状态机（4.4 滞回）
// ============================================================

/** 斜坡静摩擦能否保持 REST（C4：坡度驱动 ≤ margin·μ·g·n̂） */
export function slopeHoldOk(world: PhysicsWorld, params: PhysicsParams): boolean {
  const n = world.groundNormal
  const gVec = vec3(0, -params.env.gravity, 0)
  const gn = Math.abs(vDot(gVec, n))
  const gt = vLen(vTangent(gVec, n))
  const mu = world.surfaceOf(params, world.groundSurfaceKey).frictionSlide
  return gt <= params.thresholds.staticHoldMargin * mu * gn
}

export function classifyBall(
  world: PhysicsWorld,
  params: PhysicsParams,
  ball: BallBody,
  holders: HolderInfo[]
): BallState {
  const prev = ball.state
  const th = params.thresholds
  const n = world.groundNormal
  const grounded = ball.groundedContact && world.hasGround
  const speed = vLen(ball.vel)
  const slip = vLen(slipVelocity(ball, params, n))
  const vn = Math.abs(vDot(ball.vel, n))

  if (prev === BallState.Rest) {
    // 休眠保持：静摩擦可 Hold 即冻结（唤醒仅经外部冲量/不可 Hold 坡度）
    if (slopeHoldOk(world, params)) return BallState.Rest
    return grounded ? BallState.Sliding : BallState.Airborne
  }
  if (!grounded || vn > th.epsBounce) return BallState.Airborne
  // —— 贴地 ——（嵌入地面时不得休眠：C7 必须先推出）
  const dG = world.hasGround ? world.groundHeight(ball.pos) : Number.POSITIVE_INFINITY
  const embedded = dG < params.ball.radius - params.integration.contactSkin
  if (!embedded && speed < th.epsRest && slip < th.epsSlipLo) {
    ball.restTicks++
    if (ball.restTicks >= th.restTicks) return BallState.Rest
  } else {
    ball.restTicks = 0
  }
  // 带球态进出（持球者在控球半径内且球速在控球带内）
  let holderNear = false
  if (ball.holder !== null) {
    const h = holders[ball.holder]
    if (h) {
      const dxz = Math.hypot(ball.pos.x - h.pos.x, ball.pos.z - h.pos.z)
      holderNear = dxz < th.controlRadius
    }
  }
  const inBand = speed >= th.controlBandMin && speed <= th.controlBandMax
  if (holderNear && inBand) return BallState.DribbleControlled
  // 滚/滑滞回对（ε_lo < ε_hi）
  if (prev === BallState.Sliding) return slip < th.epsSlipLo ? BallState.Rolling : BallState.Sliding
  if (prev === BallState.Rolling) return slip > th.epsSlipHi ? BallState.Sliding : BallState.Rolling
  return slip < th.epsSlipLo ? BallState.Rolling : BallState.Sliding
}

// ============================================================
// 安全阀与健全性（铁律 3：绝不静默归零，NaN/Inf 直接抛错）
// ============================================================

/**
 * 安全阀钳制。角速度阀分两种情形：
 * - 真纯滚（贴地且 |v_slip| < ε_lo）：只钳自由旋量（ω−ω_roll），滚动分量由速度耦合产生，
 *   不属于自由旋转（8 m/s 纯滚需 72.7 rad/s > 70 阀值，直接钳会制造假滑移破坏 A5/B3）；
 * - 其他（空中/滑动接触）：全向量均匀缩放到阀值。
 */
function clampVelocities(ball: BallBody, params: PhysicsParams, world: PhysicsWorld): void {
  const s = vLen(ball.vel)
  if (s > params.limits.maxSpeed) {
    ball.vel = vScale(ball.vel, params.limits.maxSpeed / s)
    ball.forces |= F.CLAMP
  }
  const n = world.groundNormal
  const slipMag = vLen(slipVelocity(ball, params, n))
  if (ball.groundedContact && world.hasGround && slipMag < params.thresholds.epsSlipLo) {
    const wRoll = vScale(vCross(n, vTangent(ball.vel, n)), 1 / params.ball.radius)
    const free = vSub(ball.angVel, wRoll)
    const fm = vLen(free)
    if (fm > params.limits.maxAngSpeed) {
      ball.angVel = vAdd(wRoll, vScale(free, params.limits.maxAngSpeed / fm))
      ball.forces |= F.CLAMP
    }
  } else {
    const w = vLen(ball.angVel)
    if (w > params.limits.maxAngSpeed) {
      ball.angVel = vScale(ball.angVel, params.limits.maxAngSpeed / w)
      ball.forces |= F.CLAMP
    }
  }
}

export function assertFinite(ball: BallBody, where: string): void {
  const ok =
    Number.isFinite(ball.pos.x) && Number.isFinite(ball.pos.y) && Number.isFinite(ball.pos.z) &&
    Number.isFinite(ball.vel.x) && Number.isFinite(ball.vel.y) && Number.isFinite(ball.vel.z) &&
    Number.isFinite(ball.angVel.x) && Number.isFinite(ball.angVel.y) && Number.isFinite(ball.angVel.z) &&
    Number.isFinite(ball.quatState.x) && Number.isFinite(ball.quatState.y) &&
    Number.isFinite(ball.quatState.z) && Number.isFinite(ball.quatState.w)
  if (!ok) {
    throw new PhysicsError(
      'NaN/Inf 检测于 ' + where + ': pos=' + JSON.stringify(ball.pos) +
      ' vel=' + JSON.stringify(ball.vel) + ' angVel=' + JSON.stringify(ball.angVel)
    )
  }
}

// ============================================================
// 单球一步（固定 dt；CCD 自适应子步）
// ============================================================

export function stepBall(
  world: PhysicsWorld,
  params: PhysicsParams,
  index: number,
  balls: BallBody[],
  dt: number,
  tick: number,
  impactsOut: ImpactRecord[]
): void {
  const ball = balls[index]
  // scratch 重置（保留 wasPersistentContact 供本 tick 首子步衰减速率选择）
  ball.contactNormal = null
  ball.contactPenetration = 0
  ball.contactSlip = 0
  ball.impact = false
  ball.groundedContact = false
  ball.forces = 0

  if (ball.state === BallState.Rest) {
    // 嵌入地面（出生嵌入等）不冻结：必须先被平滑推出（C7）
    const embedded =
      world.hasGround &&
      world.groundHeight(ball.pos) < params.ball.radius - params.integration.contactSkin
    if (!embedded && slopeHoldOk(world, params)) {
      // REST 冻结：不积分（铁律 1 允许的唯二定点之一；唤醒走 applyImpulse）。
      // 冻结仍标记接地（带球走近自动控球依赖 groundedContact）。
      if (world.hasGround) {
        ball.groundedContact = true
        ball.contactNormal = vClone(world.groundNormal)
      }
      return
    }
    // 坡度不可 Hold / 嵌入 → 唤醒
    ball.state = BallState.Sliding
    ball.restTicks = 0
  }

  // [iron:2] CCD：单子步位移 ≤ substepDispFactor·r（0.25r = 27.5mm < 最小合并半径 0.17m，
  // 几何上不可能穿透门柱/他球）；地面反弹另有 TOI 闭式解算
  const speed = vLen(ball.vel)
  const maxDisp = params.ball.radius * params.integration.substepDispFactor
  const nSub = Math.min(
    params.integration.maxSubsteps,
    Math.max(1, Math.ceil((speed * dt) / Math.max(maxDisp, 1e-9)))
  )
  const h = dt / nSub
  const ctx: SubstepCtx = { world, params, index, balls, tick, impacts: impactsOut }
  for (let i = 0; i < nSub; i++) {
    advanceSubstep(ctx, ball, h, 0)
  }
  clampVelocities(ball, params, world)
  assertFinite(ball, 'tick ' + tick + ' ball ' + index)
}
