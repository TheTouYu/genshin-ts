// 物理核心冒烟检查（非验收用例，开发自检）
import { Simulation } from '../src/sim.js'
import { BallState } from '../src/state.js'
import { vec3 } from '../src/vec3.js'

const g = 9.81

// 1) 真空弹道精确性
{
  const sim = new Simulation({
    params: { env: { airDensity: 0, magnusK: 0 } },
    world: { disableGround: true },
    balls: [{ pos: vec3(0, 0, 0), vel: vec3(14.142135623730951, 14.142135623730951, 0) }]
  })
  sim.advanceSeconds(3)
  const t1 = sim.telemetry[0].at(120)
  const t2 = sim.telemetry[0].at(240)
  const t3 = sim.telemetry[0].at(360)
  const err = (a: number, e: number) => Math.abs(a - e)
  console.log('A1 t=1:', t1.px.toFixed(9), t1.py.toFixed(9), 'err', err(t1.px, 14.142135623730951).toExponential(2), err(t1.py, 14.142135623730951 - 0.5 * g).toExponential(2))
  console.log('A1 t=3:', t3.px.toFixed(9), t3.py.toFixed(9), 'err', err(t3.px, 42.4264).toExponential(2), err(t3.py, 42.4264 - 44.145).toExponential(2))
  // 能量漂移
  const e0 = 0.5 * 0.43 * 400
  let maxDrift = 0
  for (const r of sim.telemetry[0].all()) {
    const e = 0.5 * 0.43 * (r.vx * r.vx + r.vy * r.vy + r.vz * r.vz) + 0.43 * g * r.py
    maxDrift = Math.max(maxDrift, Math.abs(e - e0) / e0)
  }
  console.log('A2 能量漂移:', maxDrift.toExponential(3))
}

// 2) 终速
{
  const sim = new Simulation({
    params: { env: { magnusK: 0 } },
    world: { disableGround: true },
    balls: [{ pos: vec3(0, 1000, 0) }]
  })
  sim.advanceSeconds(30)
  const last = sim.telemetry[0].at(sim.telemetry[0].length - 1)
  console.log('A3 30s 末速:', Math.hypot(last.vx, last.vy, last.vz).toFixed(4), '(期望≈26.92)')
}

// 3) e=1 反弹回高
{
  const sim = new Simulation({
    params: { env: { airDensity: 0, magnusK: 0 }, surfaces: { hard: { restitution: 1, frictionSlide: 0, rollDecel: 0 } } },
    world: { surfaceKey: 'hard' },
    balls: [{ pos: vec3(0, 2.11, 0) }]
  })
  sim.advanceSeconds(10)
  const recs = sim.telemetry[0].all()
  const apexes: number[] = []
  for (let i = 1; i < recs.length - 1; i++) {
    if (recs[i].py > recs[i - 1].py && recs[i].py >= recs[i + 1].py && recs[i].py > 0.15 && recs[i].py < 2.5) {
      if (apexes.length === 0 || recs[i].tick - apexes[apexes.length - 1] > 50) apexes.push(recs[i].tick)
    }
  }
  const heights = apexes.map((tk) => recs[tk].py - 0.11)
  console.log('A4 反弹回高:', heights.slice(0, 5).map((h) => h.toFixed(5)).join(', '), '(期望≈2.0)')
}

// 4) 滚动停距（草地 a_roll=1.0 → 32m）
{
  const sim = new Simulation({
    world: {},
    balls: [{ pos: vec3(0, 0.11, 0), vel: vec3(8, 0, 0), angVel: vec3(0, 0, -8 / 0.11) }]
  })
  sim.advanceSeconds(15)
  const recs = sim.telemetry[0].all()
  let stopX = recs[recs.length - 1].px
  const last = recs[recs.length - 1]
  console.log('B3 停距:', (last.px).toFixed(3), '末态:', last.state, '(期望≈32, ROLLING→REST)')
  const maxSlip = Math.max(...recs.map((r) => r.vSlip))
  console.log('A5 纯滚最大滑移:', maxSlip.toExponential(3), '(期望<0.01)')
}

// 5) 马格努斯侧偏（B4 预估）
{
  const sim = new Simulation({
    world: {},
    balls: [{
      pos: vec3(0, 0.11, 0),
      vel: vec3(0, 25 * Math.sin((15 * Math.PI) / 180), 25 * Math.cos((15 * Math.PI) / 180)),
      angVel: vec3(0, 8 * 2 * Math.PI, 0)
    }]
  })
  sim.advanceSeconds(4)
  const recs = sim.telemetry[0].all()
  let at20 = recs[0]
  for (const r of recs) { if (r.pz >= 20) { at20 = r; break } }
  console.log('B4 侧偏 @z=20m:', at20.px.toFixed(3), '(期望 2–5, +X)')
  console.log('B4 最终 z:', recs[recs.length - 1].pz.toFixed(2), 'y:', recs[recs.length - 1].py.toFixed(3))
}

// 6) 状态机走查（落体 → 弹 → 滚 → 停）
{
  const sim = new Simulation({
    params: { surfaces: { grass: { restitution: 0.68 } } },
    world: {},
    balls: [{ pos: vec3(0, 2.11, 0), vel: vec3(3, 0, 0) }]
  })
  sim.advanceSeconds(12)
  const seq: string[] = []
  for (const t of sim.transitions) seq.push(t.tick + ':' + BallState[t.from] + '→' + BallState[t.to])
  console.log('状态转换:', seq.slice(0, 24).join(' '))
  const last = sim.telemetry[0].at(sim.telemetry[0].length - 1)
  console.log('末态:', last.state, '末速:', Math.hypot(last.vx, last.vy, last.vz).toFixed(4))
}
