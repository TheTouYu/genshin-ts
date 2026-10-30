#!/usr/bin/env node
// AI 能力读数（v5 重写）：把「AI 强不强 / 方块动不动」变成可复现数字。
//
// 用法（全部 headless，不需要 web 服务）：
//   node qxqy/measure-ai.mjs demo   --tier hard   --games 20 --out .scratch/ai/demo-hard.json
//   node qxqy/measure-ai.mjs battle --tier hard   --games 10 --out .scratch/ai/battle-hard.json
//   node qxqy/measure-ai.mjs perf   --frames 1500
//
// 三条路径：
//   demo   = 标题页入场自演（guideStage 0）。一局 = 一次 `demo reset` 到下一次 reset；
//            停机判据：堆到 12 行（reset stack）或顶死（reset plan）。
//   battle = ai-battle（玩家盘空转、AI 盘 G[2] 由 aiTickCore 驱动）。一局 = `guide start` 到
//            `guide gameover`；局间 R 回主页 → 再按 2 重开（模拟器实况，见 SETTLE_ACT.restart）。
//   perf   = 逐帧墙钟探针（p50/p95），帧按当时 AI 阶段分桶（thinking/acting/dropping）。
//
// 指标口径（写进 docs/v5-ai-plan.md，改前/改后同一口径）：
//   PPS        = 块数 / 该板 AI 活跃秒数（不含局间/倒计时）
//   avgPieceS  = 每块平均用时（= 1/PPS 的独立读数，来自 `demo pace total=` 的均值）
//   ρ          = 消行总数 / 块数（与 `demo auto … rho=` 同口径）
//   lines/min  = 消行 / 分钟；garbage/min = 送出垃圾行 / 分钟（battle 路径，去掉 dryness 自伤行）
//   堆高       = `demo auto … stack=` 心跳读数（avg/max）
//   静止帧段   = 逐帧采样 200 个棋盘格 imageColor 的哈希；哈希不变即"棋盘零变化"。
//                按日志锚把静止段归属到 thinking / acting / dropping 三个阶段。
//
// 注意：battle 路径必须用 pc-16-9（mobile 画布按裁决⑨禁用双屏，按 2 会走「请去 PC」浮层）。
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createStudio } from '/home/h/miliastra-beyond-simulator/studio/index.js'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const argSave = (() => { const i = process.argv.indexOf('--save'); return i > 0 ? process.argv[i + 1] : '' })()
const savePath = argSave ? (argSave.startsWith('/') ? argSave : join(root, argSave)) : join(root, 'tetris.save.json')
const save = JSON.parse(readFileSync(savePath, 'utf8'))

const DT = 1 / 30
const TIERS = { easy: 1, normal: 2, hard: 3 }

function parseArgs(argv) {
  const out = { path: 'demo', tier: 'hard', games: 20, frames: 1500, canvas: '', out: '', maxSim: 3600, sample: 2, win: 0 }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith('--')) { out.path = a; continue }
    const k = a.slice(2)
    const v = argv[i + 1]
    if (['tier','games','frames','canvas','out','maxSim','sample','win','save'].includes(k)) {
      out[k] = v
      i += 1
    } else if (k === 'path') { out.path = v; i += 1 }
  }
  out.games = Number(out.games) || 20
  out.frames = Number(out.frames) || 1500
  out.maxSim = Number(out.maxSim) || 3600
  out.sample = Math.max(1, Number(out.sample) || 2)
  out.win = Number(out.win) || 0
  if (!out.canvas) out.canvas = out.path === 'battle' ? 'pc-16-9' : 'pc-16-9'
  return out
}

// ── 一个 headless 会话 + 增量日志/采样收集 ───────────────────────────────────
class Rig {
  constructor({ canvas, sample = 2 }) {
    this.studio = createStudio(save, { workspacePath: root })
    this.studio.playStart({ canvasId: canvas })
    this.sample = sample
    this.frame = 0
    this.time = 0
    this.logs = []            // { t, text }
    this.logSeen = 0
    this.boards = { a: null, b: null }        // 上一帧哈希
    this.lastChange = { a: 0, b: 0 }          // 最后一次棋盘变化时刻
    this.segStart = { a: 0, b: 0 }
    this.segments = { a: [], b: [] }           // { start, end, phase }
    this.phase = 'idle'                        // idle → thinking → acting → dropping → idle
    this.phaseSince = 0
    this.samples = 0
    this.resetCount = 0
    this.startCount = 0
    this.overCount = 0
  }

  // 采一帧：step + （按 sample 间隔）读 paint 并更新哈希；始终读日志（增量）
  tick({ paint = true } = {}) {
    this.studio.playStep(DT, { observe: false })
    this.frame += 1
    this.time = this.frame * DT
    if (paint && this.frame % this.sample === 0) {
      const snap = this.studio.playGet({ paint: true })
      this.ingestLogs(snap.logs)
      const h = hashBoards(snap.paint)
      this.#hash('a', h.a, this.time)
      this.#hash('b', h.b, this.time)
      this.samples += 1
      return snap
    }
    return null
  }

  // 只推进日志（不读 paint）：给「等倒计时/等重开」这类不需要静止判据的时段用
  tickQuiet() {
    this.studio.playStep(DT, { observe: false })
    this.frame += 1
    this.time = this.frame * DT
    if (this.frame % this.sample === 0) {
      const snap = this.studio.playGet({ compact: true })
      this.ingestLogs(snap.logs, true)
    }
  }

  flush() {
    const snap = this.studio.playGet({})
    this.ingestLogs(snap.logs)
    // 关闭未闭合的静止段
    for (const k of ['a', 'b']) {
      if (this.segStart[k] < this.time) {
        this.segments[k].push({ start: this.segStart[k], end: this.time, phase: this.phaseAt(this.segStart[k]) })
      }
      this.segStart[k] = this.time
    }
    return this
  }

  ingestLogs(rows, treatAsTail = false) {
    const all = rows || []
    let fresh
    if (treatAsTail) {
      // compact 模式只给尾部 100 条：按「上一条已见文本的出现位置」对齐
      const last = this.logs[this.logs.length - 1]
      if (!last) { fresh = all; }
      else {
        let idx = -1
        for (let i = all.length - 1; i >= 0; i--) {
          if (all[i].text === last.text && Math.abs(all[i].time - last.t) < 1e-6) { idx = i; break }
        }
        fresh = idx >= 0 ? all.slice(idx + 1) : all
      }
    } else {
      fresh = all.slice(this.logSeen)
      this.logSeen = all.length
    }
    for (const row of fresh) {
      this.logs.push({ t: row.time, text: row.text })
      if (/^demo reset /.test(row.text)) this.resetCount += 1
      if (/^guide start$/.test(row.text)) this.startCount += 1
      if (/^guide gameover/.test(row.text)) this.overCount += 1
      this.trackPhase(row.text, row.time)
    }
  }

  // 日志锚 → AI 阶段（与 aiTickCore 状态机一一对应）
  trackPhase(text, t) {
    if (/^(p2 )?bag=\d+ piece=/.test(text)) {
      this.phase = 'thinking'
      this.phaseSince = t
    } else if (/^demo plan /.test(text)) {
      this.phase = 'acting'
      this.phaseSince = t
    } else if (/^demo act drop=/.test(text)) {
      this.phase = 'dropping'
      this.phaseSince = t
    } else if (/^demo pace /.test(text)) {
      this.phase = 'idle'
      this.phaseSince = t
    }
  }

  #hash(key, h, t) {
    if (h == null) return
    if (this.boards[key] == null) { this.boards[key] = h; this.segStart[key] = t; this.lastChange[key] = t; return }
    if (h !== this.boards[key]) {
      if (this.segStart[key] < t - 1e-9) {
        this.segments[key].push({ start: this.segStart[key], end: t, phase: this.phaseAt(this.segStart[key]) })
      }
      this.boards[key] = h
      this.segStart[key] = t
      this.lastChange[key] = t
    }
  }

  // 段开始时刻的阶段：用日志里 t ≤ 该时刻的最后一条阶段锚
  phaseAt(t) {
    let ph = 'idle'
    for (let i = this.logs.length - 1; i >= 0; i--) {
      const row = this.logs[i]
      if (row.t > t + 1e-9) continue
      if (/^(p2 )?bag=\d+ piece=/.test(row.text)) ph = 'thinking'
      else if (/^demo plan /.test(row.text)) ph = 'acting'
      else if (/^demo act drop=/.test(row.text)) ph = 'dropping'
      else if (/^demo pace /.test(row.text)) ph = 'idle'
      else continue
      return ph
    }
    return ph
  }

  readLogs() {
    const snap = this.studio.playGet({ compact: true })
    this.ingestLogs(snap.logs, true)
    return this.logs
  }

  key(typeName) {
    this.studio.playKey(typeName + 'Down', { observe: false })
    this.tick({ paint: false })
    this.studio.playKey(typeName + 'Up', { observe: false })
  }

  stop() { try { this.studio.playStop() } catch { /* 停不掉不影响判定 */ } }
}

// 200 格棋盘哈希（a=主盘 cellN，b=双屏 AI 盘 p2cellN）
function hashBoards(paint) {
  const a = new Array(200)
  let b = null
  for (const p of paint || []) {
    const n = p.name || ''
    let m = /^cell(\d+)$/.exec(n)
    if (m) { a[Number(m[1]) - 1] = p.imageColor; continue }
    m = /^p2cell(\d+)$/.exec(n)
    if (m) { (b || (b = new Array(200)))[Number(m[1]) - 1] = p.imageColor }
  }
  return { a: hashArr(a), b: b ? hashArr(b) : null }
}

function hashArr(arr) {
  let h = 2166136261
  for (let i = 0; i < arr.length; i++) {
    const v = arr[i] == null ? -1 : arr[i] | 0
    h ^= v
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

// ── 日志 → 指标 ────────────────────────────────────────────────────────────
function analyze(logs, { path, tier, gameIndex, startT, endT, segments, samples }) {
  const inWin = logs.filter((r) => r.t >= startT - 1e-6 && r.t <= endT + 1e-6)
  const text = (re) => inWin.filter((r) => re.test(r.text))

  const spawnRe = path === 'battle' ? /^p2 bag=\d+ piece=/ : /^bag=\d+ piece=/
  const spawns = text(spawnRe)
  // 计「块」= 一次锁定（`demo pace` 每块一条；Hold 换块会多一条 bag= 但没锁定，不能算一块）
  const paceRows = text(/^demo pace /)
  const pieces = paceRows.length || spawns.length
  const durS = Math.max(1e-6, endT - startT)
  const pps = pieces / durS

  const clears = { 1: 0, 2: 0, 3: 0, 4: 0 }
  for (const r of text(/^demo clear n=/)) {
    const n = Number(/n=(\d)/.exec(r.text)[1])
    clears[n] = (clears[n] || 0) + 1
  }
  const lines = clears[1] + 2 * clears[2] + 3 * clears[3] + 4 * clears[4]
  const totalClears = clears[1] + clears[2] + clears[3] + clears[4]
  const multi = clears[2] + clears[3] + clears[4]
  const rho = pieces ? lines / pieces : 0

  // 每块用时：`demo pace … total=`（Lua 自报，含全部动作；改前/改后同口径）
  const paces = paceRows.map((r) => {
    const g = (k) => { const m = new RegExp(k + '=([\\d.]+)').exec(r.text); return m ? Number(m[1]) : NaN }
    return {
      t: r.t, think: g('think'), rot: Number(/rot=(\d+)/.exec(r.text)?.[1] ?? NaN),
      moveCells: Number(/move=(\d+)\*/.exec(r.text)?.[1] ?? NaN),
      moveGap: Number(/move=\d+\*([\d.]+)/.exec(r.text)?.[1] ?? NaN),
      soft: Number(/soft=([\d.]+)/.exec(r.text)?.[1] ?? NaN),
      hover: g('hover'), drop: /drop=(\w+)/.exec(r.text)?.[1] || '',
      total: g('total')
    }
  })
  const avg = (xs) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0
  const totals = paces.map((p) => p.total).filter((x) => Number.isFinite(x))
  const avgPieceS = avg(totals)
  const softRate = paces.length ? paces.filter((p) => p.drop === 'soft').length / paces.length : 0

  // 真实分段（日志时间戳）：spawn → plan → drop → pace
  const marks = []
  for (const r of inWin) {
    if (spawnRe.test(r.text)) marks.push({ k: 'spawn', t: r.t })
    else if (/^demo plan /.test(r.text)) marks.push({ k: 'plan', t: r.t })
    else if (/^demo act drop=/.test(r.text)) marks.push({ k: 'drop', t: r.t })
    else if (/^demo pace /.test(r.text)) marks.push({ k: 'lock', t: r.t })
  }
  // 顺序配对（不跨块回找）：spawn → plan → drop → lock；缺段就跳过这一块。
  const real = { think: [], act: [], drop: [], total: [] }
  let cur = null
  for (const m of marks) {
    if (m.k === 'spawn') {
      if (cur && cur.spawn != null && cur.plan != null) closePiece(cur, real, false)
      cur = { spawn: m.t, plan: null, drop: null, lock: null }
    } else if (!cur) continue
    else if (m.k === 'plan' && cur.plan == null) cur.plan = m.t
    else if (m.k === 'drop' && cur.drop == null) cur.drop = m.t
    else if (m.k === 'lock' && cur.lock == null) { cur.lock = m.t; closePiece(cur, real, true); cur = null }
  }
  if (cur && cur.plan != null) closePiece(cur, real, false)

  // 堆高 / 垃圾（`demo auto n=… stack=… rho=…` 每 10 块一条）
  const autos = text(/^demo auto /).map((r) => ({
    n: Number(/n=(\d+)/.exec(r.text)[1]),
    rho: Number(/rho=([\d.]+)/.exec(r.text)[1]),
    stack: Number(/stack=(\d+)/.exec(r.text)[1]),
    pieces: Number(/pieces=(\d+)/.exec(r.text)[1])
  }))
  const stacks = autos.map((a) => a.stack)
  const garbageRows = text(/^garbage n=/)
    .filter((r) => !/dryness/.test(r.text))
    .reduce((a, r) => a + Number(/n=(\d+)/.exec(r.text)[1]), 0)
  const drynessRows = text(/^garbage n=/)
    .filter((r) => /dryness/.test(r.text))
    .reduce((a, r) => a + Number(/n=(\d+)/.exec(r.text)[1]), 0)

  // 静止段（只看有 AI 在跑的那块板：demo=a；battle 看 b=AI 盘）
  const board = path === 'battle' ? 'b' : 'a'
  const segs = (segments?.[board] || []).filter((s) => s.end > startT && s.start < endT)
  const clipped = segs.map((s) => ({ phase: s.phase, len: Math.min(s.end, endT) - Math.max(s.start, startT) }))
  // 「完全静止」= 棋盘零变化间隔；长静止段阈值 0.4s（用户判据）
  const longSegs = clipped.filter((s) => s.len > 0.4)
  const staticTotal = longSegs.reduce((a, s) => a + s.len, 0)
  const staticByPhase = {}
  for (const s of longSegs) staticByPhase[s.phase] = (staticByPhase[s.phase] || 0) + s.len
  const byPhaseLen = {}
  for (const s of longSegs) (byPhaseLen[s.phase] || (byPhaseLen[s.phase] = [])).push(s.len)
  const maxByPhase = {}
  for (const [k, v] of Object.entries(byPhaseLen)) maxByPhase[k] = Math.max(...v)
  const thinkingGaps = clipped.filter((s) => s.phase === 'thinking').map((s) => s.len)
  const maxThinking = thinkingGaps.length ? Math.max(...thinkingGaps) : 0
  const maxStatic = clipped.length ? Math.max(...clipped.map((s) => s.len)) : 0

  // 死因
  const endReasons = text(/demo reset |gameover score=|guide gameover/).map((r) => r.text)
  let endReason = 'window'
  if (endReasons.some((x) => /reset stack=/.test(x))) endReason = 'stack>=12'
  if (endReasons.some((x) => /reset plan=/.test(x))) endReason = 'topout-plan'
  if (endReasons.some((x) => /gameover score=/.test(x))) endReason = 'topout'
  if (endReasons.some((x) => /guide gameover/.test(x))) endReason = 'topout'

  return {
    path, tier, gameIndex, startT: round(startT), endT: round(endT), durS: round(durS),
    pieces, spawns: spawns.length, pps: round(pps, 3), avgPieceS: round(avgPieceS, 2),
    lines, linesPerMin: round(lines / durS * 60, 1),
    garbageRows, garbagePerMin: round(garbageRows / durS * 60, 1), drynessRows,
    rho: round(rho, 3), clears, multiCleanRate: totalClears ? round(multi / totalClears, 2) : 0,
    tetrisRate: totalClears ? round(clears[4] / totalClears, 3) : 0,
    stackAvg: stacks.length ? round(avg(stacks), 2) : null,
    stackMax: stacks.length ? Math.max(...stacks) : null,
    softDropRate: round(softRate, 2),
    realSeg: {
      think: round(avg(real.think), 2), act: round(avg(real.act), 2),
      drop: round(avg(real.drop), 2), total: round(avg(real.total), 2)
    },
    paceSeg: {
      think: round(avg(paces.map((p) => p.think).filter(Number.isFinite)), 2),
      rot: round(avg(paces.map((p) => p.rot).filter(Number.isFinite)), 1),
      move: round(avg(paces.map((p) => p.moveCells).filter(Number.isFinite)), 1),
      gap: round(avg(paces.map((p) => p.moveGap).filter(Number.isFinite)), 2),
      hover: round(avg(paces.map((p) => p.hover).filter(Number.isFinite)), 2),
      total: round(avg(totals), 2)
    },
    static: {
      samples, staticFrac: round(staticTotal / durS, 3), maxSeg: round(maxStatic, 2),
      top: [...clipped].sort((a, b) => b.len - a.len).slice(0, 5).map((s) => round(s.len, 2)),
      maxThinking: round(maxThinking, 2), longSegs04: longSegs.length,
      thinkingLong: longSegs.filter((s) => s.phase === 'thinking').length,
      byPhase: mapRound(staticByPhase), maxByPhase: mapRound(maxByPhase)
    },
    endReason
  }
}

const round = (x, n = 2) => (Number.isFinite(x) ? Number(x.toFixed(n)) : x)
const mapRound = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, round(v)]))

// 一局 = 时间窗；把某局切片所需的边界从日志里找出来
function splitLong(wins, cap) {
  if (!cap || cap <= 0) return wins
  const out = []
  for (const w of wins) {
    let t = w.start
    while (w.end - t > cap + 1e-6) { out.push({ start: t, end: t + cap }); t += cap }
    if (w.end - t > 1) out.push({ start: t, end: w.end })
  }
  return out
}

function closePiece(p, real, closed) {
  if (p.plan == null || p.spawn == null) return
  real.think.push(p.plan - p.spawn)
  if (p.drop != null) real.act.push(p.drop - p.plan)
  if (p.drop != null && p.lock != null) real.drop.push(p.lock - p.drop)
  if (p.lock != null) real.total.push(p.lock - p.spawn)
  else if (!closed && p.drop != null) real.total.push(p.drop - p.spawn)
}

function gameWindows(logs, { path, maxGames, win = 0 }) {
  if (path === 'battle') {
    const wins = []
    let start = null
    for (const r of logs) {
      if (/^guide start$/.test(r.text)) start = r.t
      else if (start != null && /^guide gameover/.test(r.text)) { wins.push({ start, end: r.t }); start = null }
    }
    if (start != null) wins.push({ start, end: logs[logs.length - 1]?.t || start })
    return splitLong(wins, win).slice(0, maxGames)
  }
  // demo：开局锚 = 首条 bag= / newgame / demo level=；收局锚 = demo reset
  const wins = []
  let start = null
  for (const r of logs) {
    if (!start && (/^(p2 )?bag=\d+ piece=/.test(r.text) || /^newgame$/.test(r.text) || /^demo level=/.test(r.text))) start = r.t
    if (start != null && /^demo reset /.test(r.text)) { wins.push({ start, end: r.t }); start = null }
  }
  if (start != null) wins.push({ start, end: logs[logs.length - 1]?.t || start })
  return splitLong(wins, win).slice(0, maxGames)
}

// ── demo：标题页自演，按 reset 分局 ─────────────────────────────────────────
function runDemo({ tier, games, canvas, maxSim, sample, win }) {
  const rig = new Rig({ canvas, sample })
  // 冷启动 ~2s：标题页卡片建完之前切档键不生效（实测：0.33s 按 = 无 demo level 日志）
  for (let i = 0; i < 60; i++) rig.tickQuiet()
  // 固定种子：切档会调 demoLoopReset + 重置 RHO，切到目标档等于重新开局（同一起点）
  for (let i = 0; i < 3; i++) {
    rig.key('KeyboardSwitchToWalkOrRunKey')
    rig.readLogs()
    const levelLogs = rig.logs.filter((r) => /^demo level=/.test(r.text))
    const cur = levelLogs.length ? levelLogs[levelLogs.length - 1].text.split('=')[1] : ''
    if (cur === tier) break
  }
  const maxFrames = Math.round(maxSim / DT)
  while (rig.frame < maxFrames) {
    rig.tick()
    if (rig.resetCount >= games) break
  }
  rig.flush()
  const logs = rig.logs
  const wins = gameWindows(logs, { path: 'demo', maxGames: games, win }).filter((w) => w.end - w.start > 2)
  let idx = 0
  const runs = wins.map((w, i) => analyze(logs, {
    path: 'demo', tier, gameIndex: i + 1, startT: w.start, endT: w.end,
    segments: rig.segments, samples: rig.samples
  }))
  // 剩余时间窗（最后一局未收）也计一组
  const lastT = logs[logs.length - 1]?.t || 0
  const lastEnd = wins.length ? wins[wins.length - 1].end : 0
  if (lastT - lastEnd > 5) {
    runs.push(analyze(logs, {
      path: 'demo', tier, gameIndex: runs.length + 1, startT: lastEnd || 0, endT: lastT,
      segments: rig.segments, samples: rig.samples
    }))
  }
  return { path: 'demo', tier, canvas, tierSwitchLog: rig.logs.filter((r) => /^demo level=/.test(r.text)).map((r) => r.text), runs }
}

// ── battle：ai-battle，局间 R 回主页再按 2 ──────────────────────────────────
// 流程（模拟器实测）：按 2 → `guide keys ai-battle` → 按 Jump 确认 → 3-2-1 → `guide start`
// → 玩家盘空转（自己中心堆到顶，~60-70s）→ `guide gameover` → V=CraftspersonKey22 回主页（实测 R 在 ai-battle 结算无效）→ 再按 2。
function runBattle({ tier, games, canvas, maxSim, sample, win }) {
  const rig = new Rig({ canvas, sample })
  for (let i = 0; i < 60; i++) rig.tickQuiet()   // 冷启动（同上：切档键要等卡片建完）
  for (let i = 0; i < 3; i++) {
    rig.key('KeyboardSwitchToWalkOrRunKey')
    rig.readLogs()
    const levelLogs = rig.logs.filter((r) => /^demo level=/.test(r.text))
    const cur = levelLogs.length ? levelLogs[levelLogs.length - 1].text.split('=')[1] : ''
    if (cur === tier) break
  }
  const maxFrames = Math.round(maxSim / DT)
  const seen = (re, after = -1) => rig.logs.some((r) => r.t > after && re.test(r.text))
  let state = 'menu'          // menu → keys → count → run → settle
  let mark = -1               // 状态切换时刻（日志时间）
  let gamesStarted = 0
  rig.tickQuiet()
  while (rig.frame < maxFrames && gamesStarted < games) {
    rig.tick()
    if (state === 'menu' && !seen(/^mode=/, mark)) { rig.key('KeyboardCraftspersonKey2'); state = 'keys'; mark = rig.time }
    else if (state === 'keys' && seen(/^guide keys /, mark)) { rig.key('KeyboardJumpKey'); state = 'count'; mark = rig.time }
    else if (state === 'count' && seen(/^guide start$/, mark)) { state = 'run'; mark = rig.time; gamesStarted += 1 }
    else if (state === 'run' && seen(/^guide gameover/, mark)) { state = 'settle'; mark = rig.time }
    else if (state === 'settle' && rig.time - mark > 0.8) { rig.key('KeyboardCraftspersonKey22'); state = 'back'; mark = rig.time }
    else if (state === 'back' && rig.time - mark > 1.0) { state = 'menu'; mark = rig.time }
  }
  rig.flush()
  const logs = rig.logs
  const wins = gameWindows(logs, { path: 'battle', maxGames: games, win }).filter((w) => w.end - w.start > 2)
  const runs = wins.map((w, i) => analyze(logs, {
    path: 'battle', tier, gameIndex: i + 1, startT: w.start, endT: w.end,
    segments: rig.segments, samples: rig.samples
  }))
  return { path: 'battle', tier, canvas, runs, modes: logs.filter((r) => /^mode=/.test(r.text)).map((r) => r.text) }
}

// ── perf：1500 帧墙钟探针（按 AI 阶段分桶）──────────────────────────────────
function runPerf({ frames, canvas, sample }) {
  const rig = new Rig({ canvas, sample })
  for (let i = 0; i < 30; i++) rig.tickQuiet()
  const buckets = { thinking: [], acting: [], dropping: [], idle: [] }
  const t0 = process.hrtime.bigint()
  for (let i = 0; i < frames; i++) {
    const phase = rig.phase
    const a = process.hrtime.bigint()
    rig.studio.playStep(DT, { observe: false })
    const dtMs = Number(process.hrtime.bigint() - a) / 1e6
    rig.frame += 1
    rig.time = rig.frame * DT
    ;(buckets[phase] || buckets.idle).push(dtMs)
    if (rig.frame % rig.sample === 0) {
      const snap = rig.studio.playGet({ compact: true })
      rig.ingestLogs(snap.logs, true)
    }
  }
  const wall = Number(process.hrtime.bigint() - t0) / 1e6
  const pct = (xs, p) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return round(s[Math.min(s.length - 1, Math.floor(p * s.length))], 3) }
  const all = Object.values(buckets).flat()
  return {
    path: 'perf', frames, wallMs: Math.round(wall), simS: round(frames / 30, 1),
    buckets: Object.fromEntries(Object.entries(buckets).map(([k, v]) => [k, {
      n: v.length, p50: pct(v, 0.5), p95: pct(v, 0.95), max: v.length ? round(Math.max(...v), 2) : null
    }])),
    all: { n: all.length, p50: pct(all, 0.5), p95: pct(all, 0.95), max: round(Math.max(...all), 2) }
  }
}

// ── CLI ────────────────────────────────────────────────────────────────────
const args = parseArgs(process.argv.slice(2))
let result
if (args.path === 'demo') result = runDemo(args)
else if (args.path === 'battle') result = runBattle(args)
else if (args.path === 'perf') result = runPerf(args)
else { console.error('用法: node qxqy/measure-ai.mjs [demo|battle|perf] [--tier easy|normal|hard] [--games N] [--frames N] [--out file]'); process.exit(2) }

if (args.out) {
  mkdirSync(dirname(args.out), { recursive: true })
  writeFileSync(args.out, JSON.stringify(result, null, 2) + '\n')
  console.error(`→ ${args.out}`)
}

// 汇总表
function summarize(runs) {
  const n = runs.length || 1
  const pick = (r, k) => k.split('.').reduce((o, part) => (o == null ? undefined : o[part]), r)
  const avg = (k) => round(runs.reduce((a, r) => a + (Number(pick(r, k)) || 0), 0) / n, 3)
  const sum = (k) => runs.reduce((a, r) => a + (Number(pick(r, k)) || 0), 0)
  const pieces = sum('pieces'); const lines = sum('lines')
  return {
    games: runs.length, pieces, lines,
    pps: avg('pps'), avgPieceS: avg('avgPieceS'), rho: pieces ? round(lines / pieces, 3) : 0,
    linesPerMin: avg('linesPerMin'), garbagePerMin: avg('garbagePerMin'),
    tetrisRate: round(runs.reduce((a, r) => a + r.tetrisRate, 0) / n, 3),
    multiCleanRate: avg('multiCleanRate'),
    stackAvg: avg('stackAvg'), stackMax: Math.max(...runs.map((r) => r.stackMax || 0)),
    softDropRate: avg('softDropRate'),
    staticFrac: avg('static.staticFrac'), maxStatic: Math.max(...runs.map((r) => r.static.maxSeg)),
    maxThinkingStatic: Math.max(...runs.map((r) => r.static.maxThinking)),
    think: avg('realSeg.think'), act: avg('realSeg.act'), drop: avg('realSeg.drop'),
    endReasons: runs.reduce((m, r) => { m[r.endReason] = (m[r.endReason] || 0) + 1; return m }, {})
  }
}
if (args.path === 'perf') {
  console.log(JSON.stringify(result, null, 2))
} else {
  console.log(`\n== ${result.path} / ${result.tier} / ${result.canvas} ==`)
  const s = summarize(result.runs)
  console.log(JSON.stringify(s, null, 2))
  const rows = result.runs.map((r) => [
    r.gameIndex, r.durS, r.pieces, r.pps, r.avgPieceS, r.rho, r.linesPerMin, r.garbagePerMin,
    r.stackAvg, r.stackMax, r.tetrisRate, r.static.maxSeg, r.static.byPhase.thinking ?? 0, r.endReason
  ])
  const head = ['#', '秒', '块', 'PPS', '秒/块', 'ρ', '行/分', '垃圾/分', '堆均', '堆峰', '四消率', '最长静止', '思考静止', '死因']
  console.log('  ' + head.join('\t'))
  for (const row of rows) console.log('  ' + row.join('\t'))
}
