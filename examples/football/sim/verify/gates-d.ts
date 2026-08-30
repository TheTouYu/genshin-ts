// 门 D：确定性与工程（D1–D4）—— 多人联机前置
import { performance } from 'node:perf_hooks'
import { Simulation, SimEvent } from '../src/sim.js'
import { vec3 } from '../src/vec3.js'
import { Harness } from './harness.js'
import { BALL_STATE_NAMES } from '../src/state.js'

/** D1/D2 共享 60s 确定性剧本（含射门/冲量/传球三种输入） */
function dScript(): SimEvent[] {
  return [
    { type: 'kick', atTick: 60, ball: 0, input: { direction: vec3(0.15, 0.26, 0.95), speed: 31, spinAxis: vec3(0, 1, 0), spinRate: 9 * 2 * Math.PI, contactOffset: vec3(0, 0, 0), label: 'D1-shot' } },
    { type: 'impulse', atTick: 900, ball: 0, impulse: vec3(0.4, 1.2, -0.3), label: 'D1-jab' },
    { type: 'kick', atTick: 3000, ball: 0, input: { direction: vec3(-0.2, 0.1, 0.97), speed: 18, spinAxis: vec3(1, 0, 0), spinRate: 3 * 2 * Math.PI, contactOffset: vec3(0, 0, 0), label: 'D1-pass' } },
    { type: 'impulse', atTick: 5400, ball: 0, impulse: vec3(0, 0.8, 0.2), label: 'D1-flick' }
  ]
}

function dSim(): Simulation {
  return new Simulation({
    world: { goal: { lineZ: 45 }, walls: { xMin: -60, xMax: 60, zMin: -60, zMax: 60 } },
    balls: [{ pos: vec3(0, 0.11, 0) }],
    players: [{ pos: vec3(-6, 0, -8) }],
    seed: 12345,
    script: dScript()
  })
}

function run60s(sim: Simulation): void {
  const frames = Math.round(60 / (1 / 60))
  for (let i = 0; i < frames; i++) sim.advance(1 / 60)
}

export function runGateD(h: Harness): void {
  console.log('—— 门 D：确定性与工程 ——')

  // ============ D1 同一 60s 剧本跑 2 遍：轨迹哈希逐位一致 ============
  {
    const a = dSim()
    run60s(a)
    const b = dSim()
    run60s(b)
    const csvA = a.telemetry[0].toCSV(BALL_STATE_NAMES)
    const csvB = b.telemetry[0].toCSV(BALL_STATE_NAMES)
    h.expectTrue('D1', 'D', '同一 60s 剧本（含种子输入）跑 2 遍，轨迹哈希逐位一致',
      'seed=12345，射门/冲量/传球/冲量 @tick 60/900/3000/5400', 'hash 相等 + CSV 逐字节相等',
      a.trajectoryHash() === b.trajectoryHash() && csvA === csvB,
      'hash ' + a.trajectoryHash() + ' vs ' + b.trajectoryHash() + '；CSV ' + (csvA === csvB ? '逐字节一致' : '不一致') +
        '（' + a.telemetry[0].length + ' 条记录）', REPRO('D'))
    h.writeCSV('d1-determinism.csv', csvA)
  }

  // ============ D2 中间快照重演：回滚就绪 ============
  {
    const a = dSim()
    // 快照点 1：tick 3000（第二次踢球前瞬间）；快照点 2：tick 5100（飞行/滚动中）
    const snaps: { tick: number; hash: string; csv: string }[] = []
    const framesHalf = Math.round(25 / (1 / 60))
    for (let i = 0; i < framesHalf; i++) a.advance(1 / 60) // 至 t=25s（tick 3000）
    const snap1 = a.snapshot()
    for (let i = 0; i < framesHalf; i++) a.advance(1 / 60) // 至 t=50s（tick 6000）
    const snap2 = a.snapshot()
    for (let i = 0; i < Math.round(10 / (1 / 60)); i++) a.advance(1 / 60) // 至 t=60s
    const hashFull = a.trajectoryHash()
    for (const [i, snap] of [snap1, snap2].entries()) {
      const r = dSim()
      r.restore(snap)
      const remaining = 60 - snap.tick / 120
      for (let k = 0; k < Math.round(remaining / (1 / 60)); k++) r.advance(1 / 60)
      snaps.push({ tick: snap.tick, hash: r.trajectoryHash(), csv: 'ok' })
      h.expectTrue('D2-' + (i + 1), 'D', '从 tick ' + snap.tick + ' 快照重演剩余输入，与原轨迹哈希一致',
        '60s 剧本，快照点 tick ' + snap.tick, hashFull,
        r.trajectoryHash() === hashFull, r.trajectoryHash() + (r.trajectoryHash() === hashFull ? ' ✓' : ' ✗'), REPRO('D'))
    }
    void snaps
  }

  // ============ D3 性能：单球 <0.5ms/tick；22 球 <5ms/帧 ============
  {
    // 单球 120Hz（B4 侧旋场景，最高 8 子步）
    const sim = new Simulation({
      world: {},
      balls: [{
        pos: vec3(0, 0.11, 0),
        vel: vec3(0, 25 * Math.sin((15 * Math.PI) / 180), 25 * Math.cos((15 * Math.PI) / 180)),
        angVel: vec3(0, 8 * 2 * Math.PI, 0)
      }]
    })
    const times: number[] = []
    for (let i = 0; i < 1200; i++) {
      const t0 = performance.now()
      sim.stepTick()
      times.push(performance.now() - t0)
    }
    times.sort((x, y) => x - y)
    const med = times[Math.floor(times.length / 2)]
    const p99 = times[Math.floor(times.length * 0.99)]

    // 22 球（网格 + 种子初速）
    const spawns = []
    let idx = 0
    for (let gx = 0; gx < 5; gx++) {
      for (let gz = 0; gz < 5; gz++) {
        if (idx >= 22) break
        spawns.push({
          pos: vec3(-4 + gx * 2, 0.11, -4 + gz * 2),
          vel: vec3((idx % 5) - 2, 2 + (idx % 3), ((idx * 7) % 9) - 4),
          angVel: vec3(0, ((idx * 13) % 20) - 10, 0)
        })
        idx++
      }
    }
    const sim22 = new Simulation({ world: { walls: { xMin: -30, xMax: 30, zMin: -30, zMax: 30 } }, balls: spawns, seed: 777 })
    const times22: number[] = []
    for (let i = 0; i < 600; i++) {
      const t0 = performance.now()
      sim22.stepTick()
      sim22.stepTick() // 一帧 60Hz = 2 个 120Hz tick
      times22.push(performance.now() - t0)
    }
    times22.sort((x, y) => x - y)
    const med22 = times22[Math.floor(times22.length / 2)]
    const p9922 = times22[Math.floor(times22.length * 0.99)]
    h.expectTrue('D3', 'D', '单球 120Hz 单步 <0.5ms；22 刚体 <5ms/帧（本机 Node ' + process.version + '）',
      'B4 场景 1200 tick / 22 球 600 帧', '中位 & p99 双达标',
      med < 0.5 && p99 < 0.5 && med22 < 5 && p9922 < 5,
      '单球 中位 ' + med.toFixed(4) + 'ms p99 ' + p99.toFixed(4) + 'ms；22球/帧 中位 ' + med22.toFixed(4) + 'ms p99 ' + p9922.toFixed(4) + 'ms', REPRO('D'))
    h.writeCSV(
      'd3-perf.csv',
      'metric,value_ms\nsingle_median,' + med.toFixed(5) + '\nsingle_p99,' + p99.toFixed(5) + '\nb22_median,' + med22.toFixed(5) + '\nb22_p99,' + p9922.toFixed(5) + '\n'
    )
  }
}

function REPRO(gate: string): string {
  return 'npm run football:sim -- --gate ' + gate
}
