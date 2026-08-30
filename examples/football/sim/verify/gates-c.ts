// 门 C：状态机与操作手感（C1–C7）—— headless 脚本部分（C1 人工操作部分见报告说明）
import { Simulation } from '../src/sim.js'
import { kickFromPower } from '../src/kick.js'
import { BallState, BALL_STATE_NAMES } from '../src/state.js'
import { vec3 } from '../src/vec3.js'
import { Harness } from './harness.js'
import { TransitionRecord } from '../src/state.js'

export function makeDribbleSim(): Simulation {
  return new Simulation({
    world: { walls: { xMin: -20, xMax: 20, zMin: -10, zMax: 40 } },
    balls: [{ pos: vec3(0, 0.11, 0) }],
    players: [{ pos: vec3(0, 0, -2) }],
    script: [
      { type: 'playerVel' as const, atTick: 0, player: 0, vel: vec3(0, 0, 6) },
      { type: 'playerVel' as const, atTick: 400, player: 0, vel: vec3(0, 0, 0) }
    ]
  })
}

/** C1/C5 场景跑完并返回仿真（含完整遥测/转换） */
function runDribble(seconds: number): Simulation {
  const sim = makeDribbleSim()
  sim.advanceSeconds(seconds)
  return sim
}

export function runGateC(h: Harness): void {
  console.log('—— 门 C：状态机与操作手感（headless） ——')

  // ============ C1 带球直线 20m ============
  {
    const sim = runDribble(5)
    const recs = sim.telemetry[0].all()
    const touches = sim.impulseLog.filter((e) => e.kind === 'dribble_touch')
    const firstTouchTick = touches.length > 0 ? touches[0].tick : -1
    const stopTick = 400
    let gapMin = Infinity
    let gapMax = -Infinity
    let speedMin = Infinity
    let speedMax = -Infinity
    let maxStep = 0
    const statesSeen = new Set<string>()
    for (let k = 0; k < recs.length; k++) {
      const r = recs[k]
      if (r.tick > firstTouchTick && r.tick <= stopTick) {
        const playerZ = -2 + 6 * (r.tick / 120) // 匀速 6 m/s（tick≤400）
        const gap = r.pz - playerZ
        const spd = Math.hypot(r.vx, r.vy, r.vz)
        if (gap < gapMin) gapMin = gap
        if (gap > gapMax) gapMax = gap
        if (spd < speedMin) speedMin = spd
        if (spd > speedMax) speedMax = spd
        statesSeen.add(sim.stateNames()[r.state])
      }
      if (k > 0) {
        const step = Math.hypot(r.px - recs[k - 1].px, r.py - recs[k - 1].py, r.pz - recs[k - 1].pz)
        if (step > maxStep) maxStep = step
      }
    }
    h.expectTrue('C1a', 'C', '带球 20m：球始终在持球者前方 0.3–1.5m',
      '球员 6 m/s 直线 +Z 20m，球初始静止', '[0.3, 1.5] m',
      gapMin >= 0.3 - 1e-6 && gapMax <= 1.5,
      '间距范围 [' + gapMin.toFixed(3) + ', ' + gapMax.toFixed(3) + '] m', REPRO('C'))
    h.expectTrue('C1b', 'C', '球速呈 4–8 m/s 脉冲振荡（触球可见）', '同上',
      '[4, 8] m/s 且触球 ≥2 次',
      speedMin >= 4 - 1e-6 && speedMax <= 8 + 1e-6 && touches.length >= 2,
      '球速 [' + speedMin.toFixed(3) + ', ' + speedMax.toFixed(3) + '] m/s, 触球 ' + touches.length + ' 次', REPRO('C'))
    h.expectTrue('C1c', 'C', '无瞬移（单 tick 位移 ≤ 9 m/s·dt）', '同上',
      '≤ ' + (9 / 120).toFixed(4) + ' m/tick',
      maxStep <= 9 / 120 + 1e-9, maxStep.toFixed(5) + ' m/tick', REPRO('C'))
    h.expectTrue('C1d', 'C', '状态在 DRIBBLE_CONTROLLED/ROLLING 间合理切换', '同上',
      '两种状态均出现',
      statesSeen.has('DRIBBLE_CONTROLLED') && statesSeen.has('ROLLING'),
      Array.from(statesSeen).join('+'), REPRO('C'))
    // CSV
    let csv = 't,player_z,ball_z,gap,ball_speed,state\n'
    for (const r of recs) {
      if (r.tick % 4 === 0) {
        const playerZ = r.tick <= 400 ? -2 + 6 * (r.tick / 120) : 18
        csv += r.t.toFixed(4) + ',' + playerZ.toFixed(3) + ',' + r.pz.toFixed(3) + ',' +
          (r.pz - playerZ).toFixed(3) + ',' + Math.hypot(r.vx, r.vy, r.vz).toFixed(3) + ',' + sim.stateNames()[r.state] + '\n'
      }
    }
    h.writeCSV('c1-dribble.csv', csv)
  }

  // ============ C2 带球中直接起脚 ============
  {
    const sim = makeDribbleSim()
    sim.advanceSeconds(1.25) // tick 150，带球中
    const pre = sim.balls[0]
    void pre
    sim.applyKick(0, kickFromPower('shot', 0.7, 0, 10))
    sim.advanceSeconds(3)
    const recs = sim.telemetry[0].all()
    const after = recs[151]
    const spd = Math.hypot(after.vx, after.vy, after.vz)
    const spinRev = Math.hypot(after.wx, after.wy, after.wz) / (2 * Math.PI)
    let stuckBouncing = false
    for (let k = 1; k < recs.length; k++) {
      if (recs[k - 1].state === 1 && recs[k].state === 1) stuckBouncing = true
    }
    h.expectTrue('C2', 'C', '带球中直接起脚：无死锁、不卡 BOUNCING、出脚符合 B6 区间',
      'tick150 带球中 shot p=0.7 pitch10°', '状态立即离开，速度 ∈[25,35]，旋转 ∈[8,10] rev/s',
      !stuckBouncing && after.state !== 1 && spd >= 25 && spd <= 35 && spinRev >= 8 && spinRev <= 10,
      '出脚速度 ' + spd.toFixed(2) + ' m/s, 旋转 ' + spinRev.toFixed(2) + ' rev/s, 出脚态 ' + sim.stateNames()[after.state] +
        ', 无连续 BOUNCING', REPRO('C'))
  }

  // ============ C3 凌空/半凌空抽射 ============
  {
    const sim = new Simulation({
      world: { walls: { xMin: -20, xMax: 20, zMin: -20, zMax: 20 } },
      balls: [{ pos: vec3(0, 0.11, 8), vel: vec3(0, 0, -6), angVel: vec3(-6 / 0.11, 0, 0) }],
      players: [{ pos: vec3(0, 0, 4) }]
    })
    // 球迎面滚来，间距 ≤0.8 时起脚（模拟人工时机）
    let kicked = false
    for (let i = 0; i < 400; i++) {
      const ball = sim.balls[0]
      const gap = ball.pos.z - 4
      if (!kicked && gap <= 0.8 && gap > 0.2) {
        sim.applyKick(0, kickFromPower('shot', 0.6, 0, 12))
        kicked = true
      }
      sim.advance(1 / 120)
    }
    const recs = sim.telemetry[0].all()
    const kickTick = sim.impulseLog.find((e) => e.kind === 'kick')?.tick ?? -1
    const after = recs[kickTick + 1]
    const spd = Math.hypot(after.vx, after.vy, after.vz)
    const spinRev = Math.hypot(after.wx, after.wy, after.wz) / (2 * Math.PI)
    const maxPen = Math.max(...recs.map((r) => r.penetration))
    const allFinite = recs.every((r) => [r.px, r.py, r.pz, r.vx, r.vy, r.vz, r.wx, r.wy, r.wz].every(Number.isFinite))
    h.expectTrue('C3', 'C', '移动中命中球正确解算冲量：无穿模、无 NaN',
      '球 6 m/s 迎面滚来，间距 0.8m 时 shot p=0.6 pitch12°',
      '出脚 ∈[25,35] m/s、穿透 ≤6mm、全记录有限',
      kicked && spd >= 25 && spd <= 35 && spinRev >= 8 && spinRev <= 10 && maxPen <= 0.006 && allFinite,
      '出脚 ' + spd.toFixed(2) + ' m/s（+Z ' + after.vz.toFixed(2) + '），旋转 ' + spinRev.toFixed(2) +
        ' rev/s，最大穿透 ' + maxPen.toExponential(2) + ' m，有限性 ✓', REPRO('C'))
  }

  // ============ C4 2° 斜坡静置 60s ============
  {
    const rad = (2 * Math.PI) / 180
    const n = vec3(0, Math.cos(rad), Math.sin(rad))
    const sim = new Simulation({
      world: { groundNormal: n },
      balls: [{ pos: vec3(0, 0.11 * Math.cos(rad), 0.11 * Math.sin(rad)) }]
    })
    sim.advanceSeconds(60)
    const recs = sim.telemetry[0].all()
    const first = recs[0]
    const last = recs[recs.length - 1]
    const drift = Math.hypot(last.px - first.px, last.py - first.py, last.pz - first.pz)
    const restForces = recs.slice(100).every((r) => r.forces === 0 && r.state === 4)
    h.expectTrue('C4', 'C', '2° 斜坡静置 60s：零状态转换、漂移 <1cm、保持休眠',
      '出生静止于 2° 斜坡（绕 X 轴倾）', 'transitions=0, drift<0.01m, REST',
      sim.transitions.length === 0 && drift < 0.01 && last.state === 4 && restForces,
      '转换 ' + sim.transitions.length + ' 次，漂移 ' + drift.toExponential(3) + ' m，末态 ' + sim.stateNames()[last.state] +
        '（休眠期力=0 ✓）', REPRO('C'))
  }

  // ============ C5 反振荡审计（60s × 3 场景） ============
  {
    const scenarios: { name: string; transitions: TransitionRecord[] }[] = []
    scenarios.push({ name: '带球60s（含停球沉降）', transitions: runDribble(60).transitions })
    {
      const sim = new Simulation({
        params: { surfaces: { grass: { restitution: 0.68 } } },
        world: {},
        balls: [{ pos: vec3(0, 2.11, 0), vel: vec3(3, 0, 0) }]
      })
      sim.advanceSeconds(60)
      scenarios.push({ name: '草地落体60s', transitions: sim.transitions })
    }
    {
      const sim = new Simulation({
        params: {
          env: { airDensity: 0, magnusK: 0 },
          surfaces: { hard: { restitution: 1, frictionSlide: 0, rollDecel: 0 } }
        },
        world: { surfaceKey: 'hard' },
        balls: [{ pos: vec3(0, 2.11, 0) }]
      })
      sim.advanceSeconds(60)
      scenarios.push({ name: 'e=1 持续弹跳60s', transitions: sim.transitions })
    }
    // 滑动 1s 窗口内每对状态转换次数 ≤ 10（>10 Hz 振荡即 FAIL）
    let worst = { pair: '', rate: 0, scenario: '' }
    for (const sc of scenarios) {
      const byPair = new Map<string, number[]>()
      for (const t of sc.transitions) {
        const key = t.from + '->' + t.to
        const arr = byPair.get(key) ?? []
        arr.push(t.tick)
        byPair.set(key, arr)
      }
      for (const [key, ticks] of byPair) {
        for (let i = 0; i < ticks.length; i++) {
          const winEnd = ticks[i] + 120
          let cnt = 0
          for (let j = i; j < ticks.length && ticks[j] <= winEnd; j++) cnt++
          if (cnt > worst.rate) worst = { pair: key, rate: cnt, scenario: sc.name }
        }
      }
    }
    h.expectTrue('C5', 'C', '任意 60s 场景无状态对以 >10 Hz 持续振荡',
      '带球/草地落体/e=1 弹跳 × 60s', '1s 窗口内同对转换 ≤10 次',
      worst.rate <= 10,
      '最大同对转换速率 ' + worst.rate + ' 次/s（' + worst.scenario + ' ' + worst.pair + '）', REPRO('C'))
    h.writeCSV(
      'c5-transitions.csv',
      'scenario,tick,from,to' + String.fromCharCode(10) +
        scenarios
          .flatMap((sc) => sc.transitions.map((t) => sc.name + ',' + t.tick + ',' + BALL_STATE_NAMES[t.from] + ',' + BALL_STATE_NAMES[t.to]))
          .join('\n') +
        '\n'
    )
  }

  // ============ C6 30 m/s 射门击中门柱 ============
  {
    // 瞄准右门柱 (3.66, y∈柱段, z=20)：真空弹道 + 气动阻力补偿（数值标定瞄准点）
    // 速度必须走出生参数（构造后直接改 vel 会被出生 REST 分类冻结）
    const aim = vec3(3.6, 1.4, 19.4)
    const len = Math.hypot(aim.x, aim.y - 0.11, aim.z - 10)
    const shotVel = vec3((aim.x / len) * 30, ((aim.y - 0.11) / len) * 30, ((aim.z - 10) / len) * 30)
    const sim = new Simulation({
      world: { goal: { lineZ: 20 }, walls: { xMin: -60, xMax: 60, zMin: -60, zMax: 60 } },
      balls: [{ pos: vec3(0, 0.11, 10), vel: shotVel }]
    })
    sim.impulseLog.push({ tick: 0, ball: 0, kind: 'kick', detail: 'aim-post shot 30 m/s（出生初始化通道）' })
    sim.advanceSeconds(6)
    const postImpacts = sim.contactLog.filter((c) => c.tag.startsWith('post'))
    const recs = sim.telemetry[0].all()
    const maxPen = Math.max(...recs.map((r) => r.penetration))
    const impact = postImpacts[0]
    let reflectOk = false
    let spinChanged = false
    let reflectDetail = '无门柱碰撞记录'
    if (impact) {
      const vnPre = impact.vPre.x * impact.normal.x + impact.vPre.y * impact.normal.y + impact.vPre.z * impact.normal.z
      const vnPost = impact.vPost.x * impact.normal.x + impact.vPost.y * impact.normal.y + impact.vPost.z * impact.normal.z
      const ratio = Math.abs(vnPost / vnPre)
      reflectOk = Math.abs(ratio - 0.72) / 0.72 < 0.05
      spinChanged =
        Math.abs(Math.hypot(impact.wPost.x, impact.wPost.y, impact.wPost.z) - Math.hypot(impact.wPre.x, impact.wPre.y, impact.wPre.z)) > 1e-4
      reflectDetail = '法向反射比 ' + ratio.toFixed(4) + '（期望 e=0.72 ±5%），|ω| ' +
        Math.hypot(impact.wPre.x, impact.wPre.y, impact.wPre.z).toFixed(3) + '→' +
        Math.hypot(impact.wPost.x, impact.wPost.y, impact.wPost.z).toFixed(3) + ' rad/s'
    }
    const impactTickHasNormal = impact ? recs[impact.tick + 1]?.hasContact === 1 : false
    const allFinite = recs.every((r) => [r.px, r.py, r.pz, r.vx, r.vy, r.vz].every(Number.isFinite))
    h.expectTrue('C6', 'C', '30 m/s 射门击中门柱：不穿透、法线反射+恢复系数、自旋改变、遥测完整',
      '距门 10m 瞄准右门柱（阻力补偿），e_post=0.72', '穿透≤30mm, 反射比≈e, Δ|ω|>0, 接触法线入遥测',
      postImpacts.length > 0 && maxPen <= 0.03 && reflectOk && spinChanged && impactTickHasNormal && allFinite,
      reflectDetail + '; 最大穿透 ' + maxPen.toExponential(2) + ' m; 冲突记录 ' + postImpacts.length + ' 条；遥测有限性 ✓', REPRO('C'))
    let csv = 't,px,py,pz,vx,vy,vz,penetration,hasContact\n'
    for (const r of recs) {
      if (r.tick % 3 === 0) {
        csv += r.t.toFixed(4) + ',' + r.px.toFixed(4) + ',' + r.py.toFixed(4) + ',' + r.pz.toFixed(4) + ',' +
          r.vx.toFixed(3) + ',' + r.vy.toFixed(3) + ',' + r.vz.toFixed(3) + ',' + r.penetration.toFixed(5) + ',' + r.hasContact + '\n'
      }
    }
    h.writeCSV('c6-post-impact.csv', csv)
  }

  // ============ C7 极端出生（嵌入地面/门柱） ============
  {
    // (a) 嵌入地面 y=-0.3
    const simA = new Simulation({ world: {}, balls: [{ pos: vec3(0, -0.3, 0) }] })
    simA.advanceSeconds(1)
    const recsA = simA.telemetry[0].all()
    let tOut = -1
    for (const r of recsA) {
      if (r.py >= 0.108) {
        tOut = r.t
        break
      }
    }
    const maxSpeedA = Math.max(...recsA.map((r) => Math.hypot(r.vx, r.vy, r.vz)))
    // (b) 嵌入门柱（球心在柱轴上）
    const simB = new Simulation({
      world: { goal: { lineZ: 20 } },
      balls: [{ pos: vec3(3.66, 0.3, 20) }]
    })
    simB.advanceSeconds(1)
    const recsB = simB.telemetry[0].all()
    let tOutB = -1
    for (const r of recsB) {
      if (Math.hypot(r.px - 3.66, r.pz - 20) >= 0.165) {
        tOutB = r.t
        break
      }
    }
    const maxSpeedB = Math.max(...recsB.map((r) => Math.hypot(r.vx, r.vy, r.vz)))
    const allFinite =
      recsA.every((r) => Number.isFinite(r.px) && Number.isFinite(r.py)) &&
      recsB.every((r) => Number.isFinite(r.px) && Number.isFinite(r.py))
    h.expectTrue('C7', 'C', '极端出生 0.5s 内平滑推出、无 NaN、无爆炸',
      '球心 y=−0.3（入地 0.41m）/ 球心置于门柱轴', '≤0.5s 推出, |v|≤5, 全程有限',
      tOut >= 0 && tOut <= 0.5 && tOutB >= 0 && tOutB <= 0.5 && maxSpeedA <= 5 && maxSpeedB <= 5 && allFinite,
      '入地推出 ' + (tOut >= 0 ? tOut.toFixed(3) : '未') + 's (峰值速度 ' + maxSpeedA.toFixed(3) +
        ' m/s)；入柱推出 ' + (tOutB >= 0 ? tOutB.toFixed(3) : '未') + 's (峰值速度 ' + maxSpeedB.toFixed(3) + ' m/s)', REPRO('C'))
  }
}

function REPRO(gate: string): string {
  return 'npm run football:sim -- --gate ' + gate
}

