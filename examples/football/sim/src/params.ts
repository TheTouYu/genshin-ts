// 集中物理参数表 —— 铁律 6：力/力矩计算中的所有系数只来自这里，支持热更新
// [iron:6] 禁止魔法数字：core.ts 等实现代码只引用 params.*，不得出现内联系数。
// 默认值依据《足球游戏·第一阶段物理核验标准》4.2 基准参数表：
//   球质量 0.43 kg（FIFA 410–450g）、半径 0.11 m（周长 68–70cm）、薄壁球壳惯量 2/3·m·r²
//   硬地 e=0.85（2m 落反弹含气动阻力 1.38m ∈ [1.35,1.55]）、草地 e=0.70（含阻力 0.95m ∈ [0.9,1.3]）
//   a_roll=1.0 m/s²（8m/s 纯滚停距 32m ∈ [20,40]）、magnusK 由 B4 实测校准（等效 Cl≈0.31 @ S=0.22）

export interface SurfaceParams {
  name: string
  /** 恢复系数 e ∈ [0,1] */
  restitution: number
  /** 滑动摩擦系数 μ_slide */
  frictionSlide: number
  /** 滚动阻力减速度 a_roll（m/s²，等效简化） */
  rollDecel: number
}

export interface BallParams {
  /** 质量 kg（FIFA 410–450g） */
  mass: number
  /** 半径 m（FIFA 周长 68–70cm） */
  radius: number
  /** 转动惯量 kg·m²（薄壁球壳 2/3·m·r²，由质量/半径派生，不手填） */
  inertia: number
  /** 截面面积 m²（π·r²，派生） */
  crossSectionArea: number
}

export interface EnvParams {
  /** 重力加速度 m/s² */
  gravity: number
  /** 空气密度 kg/m³（海平面标准大气） */
  airDensity: number
  /** 拖拽系数 Cd（高速段） */
  dragCoeff: number
  /** 马格努斯系数 k：F_M = k·(ω×v)（由 B4 三向验证校准；0.00356 ⇔ Cl≈0.31 @ S=rω/v=0.22） */
  magnusK: number
}

export interface SpinParams {
  /** 空中自旋衰减半衰期 T½（s） */
  decayHalfLifeAir: number
  /** 地面（滚动态法向分量）自旋衰减半衰期（s，更快） */
  decayHalfLifeGround: number
}

export interface LimitsParams {
  /** 速度安全阀 m/s（职业上限之外） */
  maxSpeed: number
  /** 角速度安全阀 rad/s（≈11 rev/s） */
  maxAngSpeed: number
}

export interface ThresholdsParams {
  /** 滑速滞回带：|v_slip| < ε_lo 判纯滚 */
  epsSlipLo: number
  /** 滑速滞回带：|v_slip| > ε_hi 判滑动（ε_lo < ε_hi） */
  epsSlipHi: number
  /** 反弹后法向分离速度阈值（低于则不再弹起，转滚/滑） */
  epsBounce: number
  /** 静止速度阈值 */
  epsRest: number
  /** 静止持续 tick 数（进入 REST） */
  restTicks: number
  /** 斜坡静摩擦保持裕度（坡度驱动加速度 ≤ margin·μ·g·cosθ 则保持休眠） */
  staticHoldMargin: number
  /** 带球控制半径 m */
  controlRadius: number
  /** 控球带：球速 ∈ [bandMin, bandMax] 判 DRIBBLE_CONTROLLED */
  controlBandMin: number
  controlBandMax: number
  /** 走近自动控球半径 m */
  acquireRadius: number
  /** 自动控球要求的球速上限 m/s */
  acquireMaxBallSpeed: number
  /** 带球触球距离（球在脚前 ≤ 该值时施加触球冲量） */
  touchGap: number
  /** 脱球距离（与持球者水平距离超过该值释放） */
  dropRadius: number
}

export interface IntegrationParams {
  /** 固定物理步长 s（1/120） */
  dt: number
  /** 帧间 dt 钳制上限 s（0.25） */
  maxFrameDt: number
  /** 单子步最大位移（× 半径）：CCD 子步界（0.25 → 27.5mm @ r=0.11） */
  substepDispFactor: number
  /** 每 tick 子步上限 */
  maxSubsteps: number
  /** 穿透容许缝隙 m（位置纠偏保留 slop，防抖） */
  penSlop: number
  /** 平滑去穿透速率 m/s（C7：出生嵌入 0.5s 内推出） */
  depenetrationRate: number
  /** 接触判定皮肤厚度 m（分类用） */
  contactSkin: number
}

export interface DribbleParams {
  /** 触球目标超前球速（触球后球速 = 球员速 + lead） */
  touchLeadSpeed: number
  /** 单次触球冲量 Δv 上限 m/s */
  maxTouchDv: number
}

export interface PhysicsParams {
  ball: BallParams
  env: EnvParams
  spin: SpinParams
  limits: LimitsParams
  thresholds: ThresholdsParams
  integration: IntegrationParams
  dribble: DribbleParams
  surfaces: {
    hard: SurfaceParams
    grass: SurfaceParams
    wall: SurfaceParams
    post: SurfaceParams
    net: SurfaceParams
    ballBall: SurfaceParams
  }
}

export class PhysicsParamsError extends Error {
  constructor(message: string) {
    super('PhysicsParamsError: ' + message)
    this.name = 'PhysicsParamsError'
  }
}

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K]
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function deepMerge<T>(base: T, over: unknown): T {
  if (over === undefined || over === null) return structuredClonePlain(base)
  if (!isPlainObject(base) || !isPlainObject(over)) return over as T
  const out: Record<string, unknown> = {}
  for (const k of Object.keys(base as Record<string, unknown>)) {
    out[k] = deepMerge((base as Record<string, unknown>)[k], (over as Record<string, unknown>)[k])
  }
  for (const k of Object.keys(over as Record<string, unknown>)) {
    if (!(k in out)) {
      throw new PhysicsParamsError('未知参数字段: ' + k)
    }
  }
  return out as T
}

function structuredClonePlain<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T
}

/** 默认参数（每次调用返回全新对象，禁止共享引用） */
export function defaultParams(): PhysicsParams {
  return {
    ball: { mass: 0.43, radius: 0.11, inertia: 0, crossSectionArea: 0 },
    env: { gravity: 9.81, airDensity: 1.225, dragCoeff: 0.25, magnusK: 0.00356 },
    spin: { decayHalfLifeAir: 3.5, decayHalfLifeGround: 1.2 },
    limits: { maxSpeed: 50, maxAngSpeed: 70 },
    thresholds: {
      epsSlipLo: 0.1,
      epsSlipHi: 0.5,
      epsBounce: 0.3,
      epsRest: 0.05,
      restTicks: 10,
      staticHoldMargin: 0.8,
      controlRadius: 0.55,
      controlBandMin: 3,
      controlBandMax: 8,
      acquireRadius: 1.2,
      acquireMaxBallSpeed: 2,
      touchGap: 0.3,
      dropRadius: 2.5
    },
    integration: {
      dt: 1 / 120,
      maxFrameDt: 0.25,
      substepDispFactor: 0.25,
      maxSubsteps: 64,
      penSlop: 0.001,
      depenetrationRate: 1.0,
      contactSkin: 0.02
    },
    dribble: { touchLeadSpeed: 1.6, maxTouchDv: 4.5 },
    surfaces: {
      hard: { name: 'hard', restitution: 0.85, frictionSlide: 0.45, rollDecel: 1.2 },
      grass: { name: 'grass', restitution: 0.7, frictionSlide: 0.45, rollDecel: 1.0 },
      wall: { name: 'wall', restitution: 0.65, frictionSlide: 0.4, rollDecel: 1.5 },
      post: { name: 'post', restitution: 0.72, frictionSlide: 0.35, rollDecel: 1.5 },
      net: { name: 'net', restitution: 0.08, frictionSlide: 0.6, rollDecel: 8.0 },
      ballBall: { name: 'ballBall', restitution: 0.62, frictionSlide: 0.25, rollDecel: 1.0 }
    }
  }
}

/** 在 base 上合并 overrides，重派生惯量/面积并校验；任何非法值抛 PhysicsParamsError */
export function resolveParams(base: PhysicsParams, overrides?: DeepPartial<PhysicsParams>): PhysicsParams {
  const merged = (overrides ? deepMerge(base, overrides) : structuredClonePlain(base)) as PhysicsParams
  deriveBall(merged)
  validateParams(merged)
  return merged
}

export function loadParams(overrides?: DeepPartial<PhysicsParams>): PhysicsParams {
  return resolveParams(defaultParams(), overrides)
}

function deriveBall(p: PhysicsParams): void {
  // 薄壁球壳：I = 2/3·m·r²；截面面积 A = π·r²（4.2 派生量不手填）
  p.ball.inertia = (2 / 3) * p.ball.mass * p.ball.radius * p.ball.radius
  p.ball.crossSectionArea = Math.PI * p.ball.radius * p.ball.radius
}

function walkFinite(v: unknown, path: string, bad: string[]): void {
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) bad.push(path + '=' + String(v))
  } else if (isPlainObject(v)) {
    for (const k of Object.keys(v)) walkFinite(v[k], path + '.' + k, bad)
  }
}

export function validateParams(p: PhysicsParams): void {
  const bad: string[] = []
  walkFinite(p, 'params', bad)
  if (bad.length > 0) throw new PhysicsParamsError('存在 NaN/Inf: ' + bad.join(', '))
  if (p.ball.mass <= 0 || p.ball.radius <= 0) throw new PhysicsParamsError('球质量/半径必须为正')
  if (p.env.gravity <= 0) throw new PhysicsParamsError('重力必须为正')
  if (p.env.magnusK < 0 || p.env.dragCoeff < 0 || p.env.airDensity < 0) {
    throw new PhysicsParamsError('气动系数不得为负')
  }
  for (const [k, s] of Object.entries(p.surfaces)) {
    if (s.restitution < 0 || s.restitution > 1) throw new PhysicsParamsError(k + '.restitution ∈ [0,1]')
    if (s.frictionSlide < 0 || s.rollDecel < 0) throw new PhysicsParamsError(k + ' 摩擦/滚动阻力不得为负')
  }
  if (p.thresholds.epsSlipLo >= p.thresholds.epsSlipHi) {
    throw new PhysicsParamsError('滞回带要求 epsSlipLo < epsSlipHi')
  }
  if (p.thresholds.controlBandMin >= p.thresholds.controlBandMax) {
    throw new PhysicsParamsError('控球带要求 min < max')
  }
  if (p.integration.dt <= 0 || p.integration.maxFrameDt < p.integration.dt) {
    throw new PhysicsParamsError('积分步长非法')
  }
  if (p.thresholds.restTicks < 1) throw new PhysicsParamsError('restTicks ≥ 1')
  if (p.limits.maxSpeed <= 0 || p.limits.maxAngSpeed <= 0) throw new PhysicsParamsError('安全阀必须为正')
}

/** 参数表 dump（核验报告 §3 用） */
export function dumpParams(p: PhysicsParams): string {
  const rows: string[][] = []
  rows.push(['球质量 m', p.ball.mass.toFixed(4) + ' kg', 'FIFA 410–450g'])
  rows.push(['球半径 r', p.ball.radius.toFixed(4) + ' m', 'FIFA 周长 68–70cm'])
  rows.push(['截面面积 A', p.ball.crossSectionArea.toFixed(6) + ' m²', 'πr²（派生）'])
  rows.push(['转动惯量 I', p.ball.inertia.toExponential(6) + ' kg·m²', '2/3·m·r² 薄壁球壳（派生）'])
  rows.push(['重力 g', p.env.gravity.toFixed(4) + ' m/s²', '—'])
  rows.push(['空气密度 ρ', p.env.airDensity.toFixed(4) + ' kg/m³', '海平面标准大气'])
  rows.push(['拖拽系数 Cd', p.env.dragCoeff.toFixed(4), '足球风洞常见值'])
  rows.push([
    '马格努斯系数 k',
    p.env.magnusK.toFixed(6),
    'B4 实测校准；0.00356 ⇔ Cl≈0.31 @ S=0.22 ∈ [0,0.33]'
  ])
  rows.push(['空中自旋半衰期 T½', p.spin.decayHalfLifeAir.toFixed(3) + ' s', '文献 2–5s'])
  rows.push(['地面法向自旋半衰期', p.spin.decayHalfLifeGround.toFixed(3) + ' s', '地面更快'])
  for (const s of Object.values(p.surfaces)) {
    rows.push([
      '表面[' + s.name + '] e/μ/a_roll',
      s.restitution.toFixed(3) + ' / ' + s.frictionSlide.toFixed(3) + ' / ' + s.rollDecel.toFixed(3),
      s.name === 'hard' ? '2m 落反弹 ' + (2 * s.restitution * s.restitution).toFixed(3) + 'm' : '—'
    ])
  }
  rows.push(['速度/角速度安全阀', p.limits.maxSpeed + ' m/s / ' + p.limits.maxAngSpeed + ' rad/s', '职业上限外'])
  const t = p.thresholds
  rows.push([
    '滞回带 ε_slip_lo/hi',
    t.epsSlipLo + ' / ' + t.epsSlipHi + ' m/s',
    '4.4 滞回对'
  ])
  rows.push(['ε_bounce / ε_rest / N_rest', t.epsBounce + ' m/s / ' + t.epsRest + ' m/s / ' + t.restTicks, '4.4'])
  rows.push(['控球半径/控球带', t.controlRadius + ' m / [' + t.controlBandMin + ',' + t.controlBandMax + '] m/s', '4.4'])
  const i = p.integration
  rows.push([
    '步长/最大帧间 dt',
    i.dt.toFixed(6) + ' s / ' + i.maxFrameDt + ' s',
    '1/120 固定步长 + 累加器'
  ])
  rows.push([
    'CCD 子步界/上限',
    '≤ ' + (i.substepDispFactor * 100).toFixed(0) + '%·r 位移/子步， ≤ ' + i.maxSubsteps,
    '铁律 2 连续碰撞（子步界）'
  ])
  rows.push(['穿透容差/去穿透速率', i.penSlop + ' m / ' + i.depenetrationRate + ' m/s', 'C7 平滑推出'])
  let out = '| 参数 | 值 | 依据 |\n|---|---|---|\n'
  for (const r of rows) out += '| ' + r[0] + ' | ' + r[1] + ' | ' + r[2] + ' |\n'
  return out
}
