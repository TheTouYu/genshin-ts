// 仿真编排：累加器固定步进（1/120s）、确定性输入事件表、带球控制器、遥测采集、
// 轨迹哈希、快照/恢复（D2 回滚就绪）。
// [iron:4] 不读系统时钟/Date/performance；随机只经 Rng（固定种子）。
// [iron:7] 无渲染依赖，headless 完整运行。

import {
  HolderInfo,
  ImpactRecord,
  applyImpulse,
  classifyBall,
  slopeHoldOk,
  stepBall
} from './core.js'
import { KickInput, applyStrike } from './kick.js'
import { DeepPartial, PhysicsParams, loadParams, resolveParams } from './params.js'
import { Rng } from './rng.js'
import {
  BALL_STATE_NAMES,
  BallBody,
  BallSpawn,
  BallState,
  TransitionRecord,
  deserializeBall,
  makeBall,
  serializeBall
} from './state.js'
import { Hash64 } from './hash.js'
import { Telemetry, TelemetryRecord, hashRecord } from './telemetry.js'
import {
  PlayerState,
  deserializePlayer,
  makePlayer,
  serializePlayer,
  stepKinematic
} from './player.js'
import { PhysicsWorld, WorldDef, goalCheck } from './world.js'
import { Vec3, vDot, vLen, vScale, vSub, vTangent, vec3 } from './vec3.js'

export type ImpulseKind =
  | 'spawn'
  | 'kick'
  | 'impulse'
  | 'force'
  | 'dribble_touch'
  | 'possess'
  | 'drop'
  | 'params'

export interface ImpulseLogEntry {
  tick: number
  ball: number
  kind: ImpulseKind
  detail: string
}

export type SimEvent =
  | { type: 'kick'; atTick: number; ball: number; input: KickInput }
  | { type: 'impulse'; atTick: number; ball: number; impulse: Vec3; offset?: Vec3; label?: string }
  | { type: 'force'; atTick: number; ball: number; force: Vec3; duration: number; label?: string }
  | { type: 'playerVel'; atTick: number; player: number; vel: Vec3 }
  | { type: 'playerFacing'; atTick: number; player: number; facing: Vec3 }

export interface SimOptions {
  params?: DeepPartial<PhysicsParams>
  world: WorldDef
  balls: BallSpawn[]
  players?: { pos: Vec3; facing?: Vec3 }[]
  seed?: number
  telemetryCap?: number
  script?: SimEvent[]
}

export interface SimSnapshot {
  tick: number
  time: number
  accumulator: number
  rngState: number
  hashHex: string
  cursor: number
  balls: ReturnType<typeof serializeBall>[]
  players: ReturnType<typeof serializePlayer>[]
}

export class Simulation {
  params: PhysicsParams
  world: PhysicsWorld
  balls: BallBody[]
  players: PlayerState[]
  telemetry: Telemetry[]
  transitions: TransitionRecord[] = []
  impulseLog: ImpulseLogEntry[] = []
  contactLog: ImpactRecord[] = []
  goals: { tick: number; ball: number }[] = []
  rng: Rng
  tick = 0
  time = 0
  accumulator = 0
  private script: SimEvent[]
  private cursor = 0
  private hash = new Hash64()

  constructor(opts: SimOptions) {
    this.params = loadParams(opts.params)
    this.world = new PhysicsWorld(opts.world)
    this.rng = new Rng(opts.seed ?? 1)
    // 稳定排序（atTick 相同保持脚本原顺序，确定性）
    const ordered = (opts.script ?? [])
      .map((e, i) => ({ e, i }))
      .sort((a, b) => a.e.atTick - b.e.atTick || a.i - b.i)
      .map((x) => x.e)
    this.script = ordered
    this.balls = opts.balls.map((sp) => makeBall(sp))
    // 出生初始化（铁律 1 唯一允许直接设置位置/速度的入口）——全部留日志
    const th = this.params.thresholds
    this.balls.forEach((b, i) => {
      this.impulseLog.push({
        tick: 0,
        ball: i,
        kind: 'spawn',
        detail:
          'pos=(' + b.pos.x.toFixed(3) + ',' + b.pos.y.toFixed(3) + ',' + b.pos.z.toFixed(3) + ')' +
          ' vel=(' + b.vel.x.toFixed(3) + ',' + b.vel.y.toFixed(3) + ',' + b.vel.z.toFixed(3) + ')' +
          ' angVel=(' + b.angVel.x.toFixed(3) + ',' + b.angVel.y.toFixed(3) + ',' + b.angVel.z.toFixed(3) + ')'
      })
      // C4：静止出生、贴地且坡度可静 Hold → 直接判 REST（出生分类，零后续转换）
      const groundedSpawn =
        this.world.hasGround &&
        this.world.groundHeight(b.pos) <= this.params.ball.radius + th.epsRest &&
        this.world.groundHeight(b.pos) > -this.params.ball.radius
      if (vLen(b.vel) < th.epsRest && groundedSpawn && slopeHoldOk(this.world, this.params)) {
        b.state = BallState.Rest
        b.restTicks = th.restTicks
      }
    })
    this.players = (opts.players ?? []).map((p, i) => makePlayer(i, p.pos, p.facing))
    this.telemetry = this.balls.map(() => new Telemetry(opts.telemetryCap ?? 1 << 20))
    // 记录出生初始状态（t=0，含出生分类后的状态），遥测索引与 tick 对齐
    this.balls.forEach((b, i) => this.pushTelemetry(i, b, b.state))
  }

  /** 参数热更新（铁律 6） */
  setParams(over: DeepPartial<PhysicsParams>): void {
    this.params = resolveParams(this.params, over)
    this.impulseLog.push({
      tick: this.tick,
      ball: -1,
      kind: 'params',
      detail: JSON.stringify(over)
    })
  }

  /** 帧推进：累加器 + 固定 1/120 步长；帧间 dt 钳制 ≤ 0.25s；不读时钟 */
  advance(frameDt: number): void {
    const fd = Math.min(Math.max(frameDt, 0), this.params.integration.maxFrameDt)
    this.accumulator += fd
    const dt = this.params.integration.dt
    let guard = 0
    while (this.accumulator >= dt - 1e-12 && guard < 100000) {
      this.stepTick()
      this.accumulator -= dt
      guard++
    }
  }

  /** 便捷推进：按 60Hz 帧供 dt（与 advance 一致，不读时钟） */
  advanceSeconds(seconds: number): void {
    const frames = Math.round(seconds / (1 / 60))
    for (let i = 0; i < frames; i++) this.advance(1 / 60)
  }

  stepTick(): void {
    const impacts: ImpactRecord[] = []
    this.runEvents()
    this.runControllers()
    const holders: HolderInfo[] = this.players.map((p) => ({ pos: p.pos }))
    const displays: BallState[] = []
    const prevs: BallState[] = []
    for (const b of this.balls) prevs.push(b.state)
    for (let i = 0; i < this.balls.length; i++) {
      const ball = this.balls[i]
      stepBall(this.world, this.params, i, this.balls, this.params.integration.dt, this.tick, impacts)
      const next = classifyBall(this.world, this.params, ball, holders)
      ball.state = next
      displays.push(ball.impact ? BallState.Bouncing : next)
    }
    this.contactLog.push(...impacts)
    if (this.contactLog.length > 20000) this.contactLog.splice(0, this.contactLog.length - 10000)
    this.tick++
    this.time += this.params.integration.dt
    for (let i = 0; i < this.balls.length; i++) {
      const ball = this.balls[i]
      // 转换记录（BOUNCING 瞬态：impact tick 记 from→BOUNCING→resolved，驻留 ≤1 tick）
      if (displays[i] === BallState.Bouncing && prevs[i] !== BallState.Bouncing) {
        this.recordTransition(i, prevs[i], BallState.Bouncing)
        this.recordTransition(i, BallState.Bouncing, ball.state)
      } else if (prevs[i] !== ball.state) {
        this.recordTransition(i, prevs[i], ball.state)
      }
      if (this.world.goal && goalCheck(ball, this.world, this.params.ball.radius)) {
        this.goals.push({ tick: this.tick, ball: i })
      }
      // 遥测记录（步后递增）：records[k].tick === k，records[k] = t=k·dt 时刻状态
      this.pushTelemetry(i, ball, displays[i])
    }
  }

  private recordTransition(ball: number, from: BallState, to: BallState): void {
    this.transitions.push({ tick: this.tick, ball, from, to })
  }

  private pushTelemetry(i: number, ball: BallBody, display: BallState): void {
    const r: TelemetryRecord = {
      t: this.time,
      tick: this.tick,
      state: display,
      px: ball.pos.x,
      py: ball.pos.y,
      pz: ball.pos.z,
      qw: ball.quatState.w,
      qx: ball.quatState.x,
      qy: ball.quatState.y,
      qz: ball.quatState.z,
      vx: ball.vel.x,
      vy: ball.vel.y,
      vz: ball.vel.z,
      wx: ball.angVel.x,
      wy: ball.angVel.y,
      wz: ball.angVel.z,
      forces: ball.forces,
      cnx: ball.contactNormal ? ball.contactNormal.x : 0,
      cny: ball.contactNormal ? ball.contactNormal.y : 0,
      cnz: ball.contactNormal ? ball.contactNormal.z : 0,
      hasContact: ball.contactNormal ? 1 : 0,
      penetration: ball.contactPenetration,
      vSlip: ball.contactSlip
    }
    this.telemetry[i].push(r)
    hashRecord(this.hash, r)
  }

  /** 轨迹哈希（D1/D2 确定性比对） */
  trajectoryHash(): string {
    return this.hash.hex()
  }

  // ==================== 外部影响 API（全部留日志） ====================

  applyKick(ballIdx: number, input: KickInput): void {
    const ball = this.balls[ballIdx]
    const res = applyStrike(ball, this.params, input)
    ball.holder = null // 踢球即脱控（转换事件，非驻留状态）
    this.impulseLog.push({
      tick: this.tick,
      ball: ballIdx,
      kind: 'kick',
      detail:
        input.label +
        ' J=(' + res.j.x.toFixed(3) + ',' + res.j.y.toFixed(3) + ',' + res.j.z.toFixed(3) + ')' +
        ' dOmega=(' + res.dOmega.x.toFixed(3) + ',' + res.dOmega.y.toFixed(3) + ',' + res.dOmega.z.toFixed(3) + ')'
    })
  }

  applyImpulseAt(ballIdx: number, impulse: Vec3, offset?: Vec3, label = 'external'): void {
    const ball = this.balls[ballIdx]
    applyImpulse(ball, this.params, impulse, offset)
    this.impulseLog.push({
      tick: this.tick,
      ball: ballIdx,
      kind: 'impulse',
      detail:
        label +
        ' J=(' + impulse.x.toFixed(3) + ',' + impulse.y.toFixed(3) + ',' + impulse.z.toFixed(3) + ')'
    })
  }

  applyForceAt(ballIdx: number, force: Vec3, duration: number, label = 'external'): void {
    const ball = this.balls[ballIdx]
    ball.extForces.push({ force: vec3(force.x, force.y, force.z), duration })
    if (ball.state === BallState.Rest) {
      ball.state = BallState.Sliding
      ball.restTicks = 0
    }
    this.impulseLog.push({
      tick: this.tick,
      ball: ballIdx,
      kind: 'force',
      detail: label + ' F=(' + force.x + ',' + force.y + ',' + force.z + ') dur=' + duration
    })
  }

  private runEvents(): void {
    while (this.cursor < this.script.length && this.script[this.cursor].atTick <= this.tick) {
      const ev = this.script[this.cursor++]
      if (ev.type === 'kick') {
        this.applyKick(ev.ball, ev.input)
      } else if (ev.type === 'impulse') {
        this.applyImpulseAt(ev.ball, ev.impulse, ev.offset, ev.label)
      } else if (ev.type === 'force') {
        this.applyForceAt(ev.ball, ev.force, ev.duration, ev.label)
      } else if (ev.type === 'playerVel') {
        const p = this.players[ev.player]
        if (p) p.vel = vec3(ev.vel.x, ev.vel.y, ev.vel.z)
      } else if (ev.type === 'playerFacing') {
        const p = this.players[ev.player]
        if (p) {
          const f = vTangent(vec3(ev.facing.x, ev.facing.y, ev.facing.z), vec3(0, 1, 0))
          const fn = vLen(f)
          p.facing = fn > 1e-9 ? vScale(f, 1 / fn) : vec3(0, 0, 1)
        }
      }
    }
  }

  /** 带球控制器：走近自动控球 → 周期触球冲量保持跟随 → 脱脚释放（全部冲量化） */
  private runControllers(): void {
    const th = this.params.thresholds
    const dr = this.params.dribble
    const dt = this.params.integration.dt
    const up = vec3(0, 1, 0)
    for (const player of this.players) {
      stepKinematic(player, dt)
      for (let i = 0; i < this.balls.length; i++) {
        const ball = this.balls[i]
        if (ball.holder === player.idx) {
          const rel = vSub(ball.pos, player.pos)
          const gap = vDot(rel, player.facing)
          const lateral = vLen(vTangent(rel, player.facing))
          const playerSpeed = vLen(player.vel)
          const ballAlong = vDot(ball.vel, player.facing)
          if (lateral > th.dropRadius || gap < -0.6 || playerSpeed < 0.05) {
            ball.holder = null
            this.impulseLog.push({
              tick: this.tick,
              ball: i,
              kind: 'drop',
              detail: 'ball_dropped lateral=' + lateral.toFixed(3) + ' gap=' + gap.toFixed(3)
            })
            continue
          }
          // 周期触球冲量（4.4 DRIBBLE_CONTROLLED：触球冲量保持跟随，禁止位置锁定）
          const target = playerSpeed + dr.touchLeadSpeed
          if (gap <= th.touchGap && ballAlong < target - 0.05) {
            const desired = vScale(player.facing, target)
            const dv = vSub(vTangent(desired, up), vTangent(ball.vel, up))
            const dvm = vLen(dv)
            if (dvm > 1e-9) {
              const clamped = dvm > dr.maxTouchDv ? vScale(dv, dr.maxTouchDv / dvm) : dv
              const j = vScale(clamped, this.params.ball.mass)
              applyImpulse(ball, this.params, j)
              this.impulseLog.push({
                tick: this.tick,
                ball: i,
                kind: 'dribble_touch',
                detail:
                  'gap=' + gap.toFixed(3) +
                  ' dv=(' + clamped.x.toFixed(2) + ',' + clamped.y.toFixed(2) + ',' + clamped.z.toFixed(2) + ')'
              })
            }
          }
        } else if (ball.holder === null) {
          const dxz = Math.hypot(ball.pos.x - player.pos.x, ball.pos.z - player.pos.z)
          const speed = vLen(ball.vel)
          if (dxz < th.acquireRadius && speed < th.acquireMaxBallSpeed && ball.groundedContact) {
            ball.holder = player.idx
            this.impulseLog.push({
              tick: this.tick,
              ball: i,
              kind: 'possess',
              detail: 'possess dist=' + dxz.toFixed(3)
            })
          }
        }
      }
    }
  }

  // ==================== 快照/恢复（D2） ====================

  snapshot(): SimSnapshot {
    return {
      tick: this.tick,
      time: this.time,
      accumulator: this.accumulator,
      rngState: this.rng.getState(),
      hashHex: this.hash.hex(),
      cursor: this.cursor,
      balls: this.balls.map(serializeBall),
      players: this.players.map(serializePlayer)
    }
  }

  restore(s: SimSnapshot): void {
    this.tick = s.tick
    this.time = s.time
    this.accumulator = s.accumulator
    this.rng.setState(s.rngState)
    this.hash = new Hash64(s.hashHex)
    this.cursor = s.cursor
    this.balls = s.balls.map((b) => deserializeBall(b))
    this.players = s.players.map((p, i) => deserializePlayer(p, i))
    this.impulseLog.push({
      tick: this.tick,
      ball: -1,
      kind: 'params',
      detail: 'snapshot restored at tick ' + s.tick
    })
  }

  stateNames(): string[] {
    return BALL_STATE_NAMES
  }
}
