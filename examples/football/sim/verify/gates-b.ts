// 门 B：现实标定（B1–B6）—— 参数可调且行为单调
import { Simulation } from '../src/sim.js'
import { kickFromPower } from '../src/kick.js'
import { Vec3, vec3 } from '../src/vec3.js'
import { Harness } from './harness.js'
import { TelemetryRecord } from '../src/telemetry.js'

const G = 9.81

function firstApexAfterBounce(recs: readonly TelemetryRecord[]): number {
  let bounced = false
  for (let k = 2; k < recs.length - 1; k++) {
    if (recs[k - 1].state === 1) bounced = true // BOUNCING
    if (bounced && recs[k - 1].vy > 0 && recs[k].vy <= 0) {
      const dtTick = recs[k].t - recs[k - 1].t
      const tau = (recs[k - 1].vy / (recs[k - 1].vy - recs[k].vy)) * dtTick
      return recs[k - 1].py + recs[k - 1].vy * tau - 0.5 * G * tau * tau
    }
  }
  throw new Error('未找到反弹后 apex')
}

function dropSim(e: number): Simulation {
  const sim = new Simulation({
    params: { surfaces: { hard: { restitution: e } } },
    world: { surfaceKey: 'hard' },
    balls: [{ pos: vec3(0, 2.11, 0) }]
  })
  sim.advanceSeconds(4)
  return sim
}

export function runGateB(h: Harness): void {
  console.log('—— 门 B：现实标定 ——')

  // ============ B1 FIFA 反弹测试：2m 自由落体 ============
  {
    const hard = dropSim(0.85)
    const hHard = firstApexAfterBounce(hard.telemetry[0].all()) - 0.11
    h.expectRange('B1a', 'B', '硬地反弹（e=0.85）回高 ∈ [1.35,1.55]m', '2m 自由落体，表面 hard',
      1.35, 1.55, hHard, 'm', REPRO('B'))
    const grass = dropSim(0.7)
    const hGrass = firstApexAfterBounce(grass.telemetry[0].all()) - 0.11
    h.expectRange('B1b', 'B', '草地反弹（e=0.70）回高 ∈ [0.9,1.3]m（含气动阻力）', '2m 自由落体，表面 grass',
      0.9, 1.3, hGrass, 'm', REPRO('B'))
    let csv = 't,py_hard,py_grass\n'
    const rh = hard.telemetry[0].all()
    const rg = grass.telemetry[0].all()
    for (let k = 0; k < Math.min(rh.length, rg.length); k += 5) {
      csv += rh[k].t.toFixed(4) + ',' + rh[k].py.toFixed(6) + ',' + rg[k].py.toFixed(6) + '\n'
    }
    h.writeCSV('b1-bounce.csv', csv)
  }

  // ============ B2 空中自旋衰减半衰期 T½ ±20% ============
  {
    const sim = new Simulation({
      world: { disableGround: true },
      balls: [{ pos: vec3(0, 1000, 0), vel: vec3(10, 0, 0), angVel: vec3(50.26548245743669, 0, 0) }]
    })
    sim.advanceSeconds(8)
    const recs = sim.telemetry[0].all()
    const half = 50.26548245743669 / 2
    let tHalf = -1
    for (let k = 1; k < recs.length; k++) {
      const wA = Math.hypot(recs[k - 1].wx, recs[k - 1].wy, recs[k - 1].wz)
      const wB = Math.hypot(recs[k].wx, recs[k].wy, recs[k].wz)
      if (wA >= half && wB < half) {
        // 精确指数衰减 → 对数线性插值
        const frac = Math.log(wA / half) / Math.log(wA / wB)
        tHalf = recs[k - 1].t + frac * (recs[k].t - recs[k - 1].t)
        break
      }
    }
    h.expectRange('B2', 'B', '空中自旋衰减半衰期 = 3.5s ±20%（设定 T½=3.5s）',
      'ω0=8 rev/s，空中无接触', 2.8, 4.2, tHalf, 's', REPRO('B'))
  }

  // ============ B3 平地纯滚停距（8 m/s → 20–40m，随 a_roll 单调） ============
  {
    const aRolls = [0.6, 0.8, 1.0, 1.2, 1.6]
    const dists: number[] = []
    for (const a of aRolls) {
      const sim = new Simulation({
        params: { surfaces: { grass: { rollDecel: a } } },
        world: {},
        balls: [{ pos: vec3(0, 0.11, 0), vel: vec3(8, 0, 0), angVel: vec3(0, 0, -8 / 0.11) }]
      })
      sim.advanceSeconds(30)
      const recs = sim.telemetry[0].all()
      dists.push(recs[recs.length - 1].px)
    }
    let monotonic = true
    for (let i = 1; i < dists.length; i++) if (dists[i] >= dists[i - 1] - 1e-9) monotonic = false
    h.expectRange('B3a', 'B', '干草参数（a_roll=1.0 m/s²）停距 ∈ [20,40]m', 'v0=8 m/s 纯滚',
      20, 40, dists[2], 'm', REPRO('B'))
    h.expectTrue('B3b', 'B', '停距随 a_roll 单调递减', 'a_roll ∈ ' + aRolls.join('/'), '严格递减',
      monotonic, dists.map((d, i) => aRolls[i] + '→' + d.toFixed(2) + 'm').join(', '), REPRO('B'))
    h.writeCSV('b3-roll-stop.csv', 'a_roll_mps2,stop_distance_m\n' + aRolls.map((a, i) => a + ',' + dists[i].toFixed(4)).join('\n') + '\n')
  }

  // ============ B4 弧线球三向验证（v=25 m/s，仰角 15°） ============
  {
    const shot = (spin: Vec3): Simulation => {
      const sim = new Simulation({
        world: {},
        balls: [{
          pos: vec3(0, 0.11, 0),
          vel: vec3(0, 25 * Math.sin((15 * Math.PI) / 180), 25 * Math.cos((15 * Math.PI) / 180)),
          angVel: spin
        }]
      })
      sim.advanceSeconds(6)
      return sim
    }
    const rev = (r: number) => r * 2 * Math.PI
    const side = shot(vec3(0, rev(8), 0))
    const top = shot(vec3(rev(8), 0, 0))
    const back = shot(vec3(-rev(8), 0, 0))
    const nospin = shot(vec3(0, 0, 0))
    const xAt = (sim: Simulation, z: number): number => {
      const recs = sim.telemetry[0].all()
      for (let k = 1; k < recs.length; k++) {
        if (recs[k - 1].pz < z && recs[k].pz >= z) {
          const f = (z - recs[k - 1].pz) / (recs[k].pz - recs[k - 1].pz)
          return recs[k - 1].px + (recs[k].px - recs[k - 1].px) * f
        }
      }
      return NaN
    }
    const landRange = (sim: Simulation): { z: number; t: number } => {
      const recs = sim.telemetry[0].all()
      for (let k = 1; k < recs.length; k++) {
        if (recs[k - 1].py > 0.11 && recs[k].py <= 0.11) {
          const f = (recs[k - 1].py - 0.11) / (recs[k - 1].py - recs[k].py)
          return {
            z: recs[k - 1].pz + (recs[k].pz - recs[k - 1].pz) * f,
            t: recs[k - 1].t + f * (recs[k].t - recs[k - 1].t)
          }
        }
      }
      throw new Error('未落地')
    }
    const x20 = xAt(side, 20)
    h.expectRange('B4a', 'B', '侧旋 8 rev/s（ω=+ŷ）：20m 处横向偏移 +X 方向 2–5m', 'v=25 m/s 仰角15° ω=+ŷ·8rev/s',
      2, 5, x20, 'm', REPRO('B'))
    h.expectTrue('B4a-sign', 'B', '侧旋偏移方向为 +X（符号验证）', '同上', 'x > 0',
      x20 > 0, 'x=' + x20.toFixed(3) + 'm', REPRO('B'))
    const rTop = landRange(top)
    const rNo = landRange(nospin)
    const rBack = landRange(back)
    h.expectTrue('B4b', 'B', '上旋（ω=+x̂）射程比无旋短 ≥15% 且更早落地', 'v=25 m/s 仰角15° ω=+x̂·8rev/s',
      'range ≤ ' + (0.85 * rNo.z).toFixed(1) + 'm 且 t < ' + rNo.t.toFixed(2) + 's',
      rTop.z <= 0.85 * rNo.z && rTop.t < rNo.t,
      '上旋 ' + rTop.z.toFixed(2) + 'm/' + rTop.t.toFixed(3) + 's vs 无旋 ' + rNo.z.toFixed(2) + 'm/' + rNo.t.toFixed(3) + 's（短 ' + ((1 - rTop.z / rNo.z) * 100).toFixed(1) + '%）', REPRO('B'))
    h.expectTrue('B4c', 'B', '回旋（ω=−x̂）滞空更长、射程更远', 'v=25 m/s 仰角15° ω=−x̂·8rev/s',
      'range > ' + rNo.z.toFixed(1) + 'm 且 t > ' + rNo.t.toFixed(2) + 's',
      rBack.z > rNo.z && rBack.t > rNo.t,
      '回旋 ' + rBack.z.toFixed(2) + 'm/' + rBack.t.toFixed(3) + 's vs 无旋 ' + rNo.z.toFixed(2) + 'm/' + rNo.t.toFixed(3) + 's', REPRO('B'))
    // CSV：三条轨迹
    let csv = 't,sidespin_x,sidespin_z,topspin_x,topspin_z,backspin_x,backspin_z,nospin_z\n'
    const rs = side.telemetry[0].all()
    const rt = top.telemetry[0].all()
    const rb = back.telemetry[0].all()
    const rn = nospin.telemetry[0].all()
    for (let k = 0; k < rs.length; k += 6) {
      csv += rs[k].t.toFixed(4) + ',' + rs[k].px.toFixed(4) + ',' + rs[k].pz.toFixed(4) + ',' +
        rt[k].px.toFixed(4) + ',' + rt[k].pz.toFixed(4) + ',' + rb[k].px.toFixed(4) + ',' + rb[k].pz.toFixed(4) + ',' + rn[k].pz.toFixed(4) + '\n'
    }
    h.writeCSV('b4-curves.csv', csv)
  }

  // ============ B5 电梯球（ω < 0.5 rev/s）：观察项 ============
  {
    const shotAt = (revs: number): number => {
      const sim = new Simulation({
        world: {},
        balls: [{
          pos: vec3(0, 0.11, 0),
          vel: vec3(0, 25 * Math.sin((15 * Math.PI) / 180), 25 * Math.cos((15 * Math.PI) / 180)),
          angVel: vec3(0, revs * 2 * Math.PI, 0)
        }]
      })
      sim.advanceSeconds(6)
      const recs = sim.telemetry[0].all()
      for (let k = 1; k < recs.length; k++) {
        if (recs[k - 1].pz < 20 && recs[k].pz >= 20) {
          const f = (20 - recs[k - 1].pz) / (recs[k].pz - recs[k - 1].pz)
          return recs[k - 1].px + (recs[k].px - recs[k - 1].px) * f
        }
      }
      return NaN
    }
    const x0 = shotAt(0)
    const x02 = shotAt(0.2)
    const x025 = shotAt(0.25)
    h.observed('B5', 'B', '电梯球（ω≈0.2 rev/s）与无旋差异小但对微小扰动敏感',
      'ω ∈ {0, 0.2, 0.25} rev/s 侧旋',
      'x@20m: ω=0 → ' + x0.toFixed(4) + 'm; ω=0.2 → ' + x02.toFixed(4) + 'm（差 ' + Math.abs(x02 - x0).toFixed(4) + 'm）; ω=0.25 → ' + x025.toFixed(4) + 'm（对 0.05 rev/s 扰动响应 ' + Math.abs(x025 - x02).toFixed(4) + 'm，可观测）', REPRO('B'))
  }

  // ============ B6 踢球 API 范围映射与单调性 ============
  {
    const kinds = ['shot', 'pass', 'dribble'] as const
    const ranges = {
      shot: { v: [25, 35], rev: [8, 10] },
      pass: { v: [10, 20], rev: [2, 4] },
      dribble: { v: [3, 8], rev: [0.3, 1.2] }
    } as const
    let allOk = true
    const detail: string[] = []
    for (const kind of kinds) {
      const speeds: number[] = []
      const spins: number[] = []
      for (const p of [0, 0.25, 0.5, 0.75, 1]) {
        const sim = new Simulation({ world: {}, balls: [{ pos: vec3(0, 0.11, 0) }] })
        sim.applyKick(0, kickFromPower(kind, p, 0, 10))
        const b = sim.balls[0]
        speeds.push(Math.hypot(b.vel.x, b.vel.y, b.vel.z))
        spins.push(Math.hypot(b.angVel.x, b.angVel.y, b.angVel.z) / (2 * Math.PI))
      }
      const mono = speeds.every((s, i) => i === 0 || s > speeds[i - 1])
      const vOk = Math.abs(speeds[0] - ranges[kind].v[0]) < 0.01 && Math.abs(speeds[4] - ranges[kind].v[1]) < 0.01
      const sOk = Math.abs(spins[0] - ranges[kind].rev[0]) < 0.01 && Math.abs(spins[4] - ranges[kind].rev[1]) < 0.01
      allOk = allOk && mono && vOk && sOk
      detail.push(kind + ': v ' + speeds.map((s) => s.toFixed(2)).join('→') + ' m/s, spin ' + spins.map((s) => s.toFixed(2)).join('→') + ' rev/s' + (mono && vOk && sOk ? '' : ' [不达标]'))
    }
    // 方向遵循：pitch 10° → vy/vz = tan10°
    const sim = new Simulation({ world: {}, balls: [{ pos: vec3(0, 0.11, 0) }] })
    sim.applyKick(0, kickFromPower('shot', 0.5, 0, 10))
    const b = sim.balls[0]
    const pitchOk = Math.abs(b.vel.y / b.vel.z - Math.tan((10 * Math.PI) / 180)) < 0.01
    h.expectTrue('B6', 'B', '射门 25–35 m/s & 8–10 rev/s；传球 10–20；带球 3–8；输入→输出单调',
      'power ∈ {0,0.25,0.5,0.75,1} × {shot,pass,dribble}',
      '区间端点精确命中 + 严格单调 + 方向遵循',
      allOk && pitchOk, detail.join('; ') + (pitchOk ? '; 方向遵循 ✓' : '; 方向偏离 ✗'), REPRO('B'))
  }
}

function REPRO(gate: string): string {
  return 'npm run football:sim -- --gate ' + gate
}
