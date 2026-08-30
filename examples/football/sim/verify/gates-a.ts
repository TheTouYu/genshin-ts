// 门 A：解析解对齐（A1–A5）—— 全部 headless，实测数字必须可追溯到 CSV
import { Simulation } from '../src/sim.js'
import { vec3 } from '../src/vec3.js'
import { Harness } from './harness.js'
import { TelemetryRecord } from '../src/telemetry.js'

const G = 9.81

function interpCross(
  recs: readonly TelemetryRecord[],
  idx: (r: TelemetryRecord) => number,
  level: number,
  from: number
): { frac: number; a: TelemetryRecord; b: TelemetryRecord } {
  for (let k = Math.max(1, from); k < recs.length; k++) {
    const a = recs[k - 1]
    const b = recs[k]
    if ((idx(a) - level) * (idx(b) - level) <= 0 && idx(b) !== idx(a)) {
      const frac = (level - idx(a)) / (idx(b) - idx(a))
      return { frac, a, b }
    }
  }
  throw new Error('interpCross: 未找到穿越点')
}

export function runGateA(h: Harness): void {
  console.log('—— 门 A：解析解对齐 ——')

  // ============ A1 真空无旋无阻力抛射 v=20 m/s 45° ============
  {
    const v0 = 20
    const ang = Math.PI / 4
    const vx = v0 * Math.cos(ang)
    const vy = v0 * Math.sin(ang)
    const sim = new Simulation({
      params: { env: { airDensity: 0, magnusK: 0 } },
      world: { disableGround: true },
      balls: [{ pos: vec3(0, 0, 0), vel: vec3(vx, vy, 0) }]
    })
    sim.advanceSeconds(3.1)
    const recs = sim.telemetry[0].all()
    let maxPosErr = 0
    const detail: string[] = []
    for (const t of [1, 2, 3]) {
      const r = recs[t * 120]
      const ex = vx * t
      const ey = vy * t - 0.5 * G * t * t
      const err = Math.max(Math.abs(r.px - ex), Math.abs(r.py - ey))
      maxPosErr = Math.max(maxPosErr, err / Math.hypot(ex, ey))
      detail.push('t=' + t + ': (' + r.px.toFixed(4) + ',' + r.py.toFixed(4) + ') vs (' + ex.toFixed(4) + ',' + ey.toFixed(4) + ')')
    }
    h.expectTrue('A1a', 'A', '真空抛射 t=1/2/3s 位置 vs 闭式解（<0.5%）', 'v0=20 m/s, 45°, ρ=0, k=0',
      '闭式解位置', maxPosErr < 0.005,
      maxPosErr.toExponential(3) + ' 最大相对误差; ' + detail.join('; '), REPRO(h, 'A'))

    // 射程 / 飞行时间 / 最高点（y=0 平面下降沿穿越插值；出生 y=0 不算）
    let cross = { frac: 0, a: recs[0], b: recs[1] }
    for (let k = 2; k < recs.length; k++) {
      if (recs[k - 1].py > 0 && recs[k].py <= 0) {
        cross = {
          frac: (0 - recs[k - 1].py) / (recs[k].py - recs[k - 1].py),
          a: recs[k - 1],
          b: recs[k]
        }
        break
      }
    }
    const tFlight = (cross.a.tick + cross.frac) / 120
    const range = cross.a.px + (cross.b.px - cross.a.px) * cross.frac
    const apexCross = interpCross(recs, (r) => r.vy, 0, 1)
    const tApex = (apexCross.a.tick + apexCross.frac) / 120
    const apexH = apexCross.a.py + apexCross.a.vy * (tApex - apexCross.a.t) - 0.5 * G * (tApex - apexCross.a.t) ** 2
    const expRange = (v0 * v0 * Math.sin(2 * ang)) / G
    const expT = (2 * v0 * Math.sin(ang)) / G
    const expApex = (v0 * v0 * Math.sin(ang) ** 2) / (2 * G)
    const errR = Math.abs(range - expRange) / expRange
    const errT = Math.abs(tFlight - expT) / expT
    const errA = Math.abs(apexH - expApex) / expApex
    h.expectTrue('A1b', 'A', '射程 40.77m ±1% / 飞行时间 2.88s ±1% / 最高点 10.19m ±1%',
      '同上', expRange.toFixed(2) + 'm/' + expT.toFixed(3) + 's/' + expApex.toFixed(2) + 'm',
      errR < 0.01 && errT < 0.01 && errA < 0.01,
      '射程 ' + range.toFixed(3) + 'm(' + (errR * 100).toFixed(4) + '%) 时间 ' + tFlight.toFixed(4) + 's(' + (errT * 100).toFixed(4) + '%) 最高 ' + apexH.toFixed(4) + 'm(' + (errA * 100).toFixed(4) + '%)', REPRO(h, 'A'))
    // CSV
    let csv = 't,px_sim,py_sim,px_closed,py_closed\n'
    for (let k = 0; k < recs.length; k += 10) {
      const r = recs[k]
      csv += r.t.toFixed(4) + ',' + r.px.toFixed(6) + ',' + r.py.toFixed(6) + ',' + (vx * r.t).toFixed(6) + ',' + (vy * r.t - 0.5 * G * r.t * r.t).toFixed(6) + '\n'
    }
    h.writeCSV('a1-projectile.csv', csv)
  }

  // ============ A2 真空无接触 10s 能量漂移 < 0.1% ============
  // v0=49 m/s 竖直上抛：全程 |v| ≤ 49.1 m/s < 50 m/s 安全阀（阀值与 10s 自由飞落在规范内冲突，
  // 取不触发阀值的工况检验积分器本身；阀值行为由 5.2 规则 3 单独覆盖）
  {
    const sim = new Simulation({
      params: { env: { airDensity: 0, magnusK: 0 } },
      world: { disableGround: true },
      balls: [{ pos: vec3(0, 0, 0), vel: vec3(0, 49, 0) }]
    })
    sim.advanceSeconds(10)
    const m = 0.43
    const e0 = 0.5 * m * 49 * 49
    let maxDrift = 0
    for (const r of sim.telemetry[0].all()) {
      const e = 0.5 * m * (r.vx * r.vx + r.vy * r.vy) + m * G * r.py
      maxDrift = Math.max(maxDrift, Math.abs(e - e0) / e0)
    }
    h.expectTrue('A2', 'A', '真空无接触 10s 动能+势能漂移 < 0.1%', 'v0=49 m/s 竖直上抛（全程<50m/s 阀值）', '<0.001',
      maxDrift < 0.001, maxDrift.toExponential(3), REPRO(h, 'A'))
  }

  // ============ A3 拖拽竖直下落 30s 末速 ≈ 26.9 m/s（<10%） ============
  {
    const sim = new Simulation({
      params: { env: { magnusK: 0 } },
      world: { disableGround: true },
      balls: [{ pos: vec3(0, 1000, 0) }]
    })
    sim.advanceSeconds(30)
    const last = sim.telemetry[0].at(sim.telemetry[0].length - 1)
    const vEnd = Math.hypot(last.vx, last.vy, last.vz)
    h.expectRange('A3', 'A', '重力+拖拽竖直下落 30s 末速趋近 26.9 m/s', '从 y=1000m 静止落下 30s',
      26.9 * 0.9, 26.9 * 1.1, vEnd, 'm/s', REPRO(h, 'A'))
  }

  // ============ A4 e=1 无摩擦反复弹跳：每次回到原高度 ±1%，无能量增加 ============
  {
    const sim = new Simulation({
      params: {
        env: { airDensity: 0, magnusK: 0 },
        surfaces: { hard: { restitution: 1, frictionSlide: 0, rollDecel: 0 } }
      },
      world: { surfaceKey: 'hard' },
      balls: [{ pos: vec3(0, 2.11, 0) }]
    })
    sim.advanceSeconds(10)
    const recs = sim.telemetry[0].all()
    // 反弹后 apex（vy 由正变负，tick 间二次插值）
    const apexes: number[] = []
    const apexTicks: number[] = []
    for (let k = 2; k < recs.length - 1; k++) {
      if (recs[k - 1].vy > 0 && recs[k].vy <= 0 && recs[k].py > 0.5) {
        const dtTick = recs[k].t - recs[k - 1].t
        const tau = (recs[k - 1].vy / (recs[k - 1].vy - recs[k].vy)) * dtTick
        const apex = recs[k - 1].py + recs[k - 1].vy * tau - 0.5 * G * tau * tau
        if (apexes.length === 0 || recs[k].tick - apexTicks[apexTicks.length - 1] > 50) {
          apexes.push(apex)
          apexTicks.push(recs[k].tick)
        }
      }
    }
    const heights = apexes.slice(0, 5).map((a) => a - 0.11)
    const allInRange = heights.length >= 5 && heights.every((x) => x > 1.98 && x < 2.02)
    // 能量审计：机械能（以接触面为零势能面）不得增加
    const m = 0.43
    let maxRise = 0
    for (let k = 1; k < recs.length; k++) {
      const eK = 0.5 * m * (recs[k].vx ** 2 + recs[k].vy ** 2) + m * G * (recs[k].py - 0.11)
      const eK1 = 0.5 * m * (recs[k - 1].vx ** 2 + recs[k - 1].vy ** 2) + m * G * (recs[k - 1].py - 0.11)
      maxRise = Math.max(maxRise, (eK - eK1) / (m * G * 2))
    }
    h.expectTrue('A4', 'A', 'e=1 反弹每次回高 2m ±1% 且能量无增加', '2m 自由落体（真空/无摩擦/e=1）',
      '5 次回高 ∈ [1.98,2.02]m, ΔE≤0',
      allInRange && maxRise < 1e-9,
      '回高 ' + heights.map((x) => x.toFixed(5)).join(', ') + ' m; 最大能量增幅 ' + maxRise.toExponential(2), REPRO(h, 'A'))
    let csv = 't,py,vy\n'
    for (const r of recs) csv += r.t.toFixed(4) + ',' + r.py.toFixed(6) + ',' + r.vy.toFixed(6) + '\n'
    h.writeCSV('a4-bounce-e1.csv', csv)
  }

  // ============ A5 平地纯滚一致性 |v_slip| < 0.01 m/s ============
  {
    const sim = new Simulation({
      params: { surfaces: { grass: { rollDecel: 0 } } },
      world: {},
      balls: [{ pos: vec3(0, 0.11, 0), vel: vec3(8, 0, 0), angVel: vec3(0, 0, -8 / 0.11) }]
    })
    sim.advanceSeconds(10)
    let maxSlip = 0
    let maxSlipTick = 0
    for (const r of sim.telemetry[0].all()) {
      if (r.vSlip > maxSlip) {
        maxSlip = r.vSlip
        maxSlipTick = r.tick
      }
    }
    h.expectTrue('A5', 'A', '纯滚 10s 内 |v−(ω×r·n̂)切向| < 0.01 m/s（滚动阻力=0，初速自旋匹配）',
      'v0=8 m/s, ω0=−8/r ẑ', '<0.01 m/s',
      maxSlip < 0.01, maxSlip.toExponential(3) + ' m/s @tick ' + maxSlipTick + '（阻力减速与再锁定间的瞬态）', REPRO(h, 'A'))
  }
}

function REPRO(h: Harness, gate: string): string {
  void h
  return 'npm run football:sim -- --gate ' + gate
}
