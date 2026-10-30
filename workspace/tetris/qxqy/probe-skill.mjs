#!/usr/bin/env node
// v5 技能/动画逐帧证据（B 件）：进局→按技能键→每 1/30s 采一帧（默认 48 帧 = 1.6s）→
// 出拼图 PNG + frames.json（控件级 diff）+ 动画判定；另跑一条**同步骤不按键的对照run**，
// 用来区分「技能带来了额外变化」与「画面本来就在动」。
//
// 用法：
//   node qxqy/probe-skill.mjs --role nahida --canvas pc-16-9 --out docs/shots/skill-nahida
//   node qxqy/probe-skill.mjs --role nahida --mode ai-battle --canvas pc-16-9 --out docs/shots/skill-nahida-aib
//   node qxqy/probe-skill.mjs --role nahida --slot 2            # U = 技能2
//   node qxqy/probe-skill.mjs --role nahida --audio             # 额外抓 playGet().audio.recent
// 产物（--out 目录）：
//   strip.png          每帧一格，标注 fNNN / t=…s / 与对照差异
//   frames.json        每帧：像素差、控件新增/消失/移动/改色/改字、技能日志
//   summary.json       判定：帧间像素差>0 帧数、首变时刻、是否持续、对照差异、音效清单
//   run.log.txt        全程客户端日志（可 grep 锚点）
// 判据（本文件自动给出，不是人眼感觉）：
//   animation=on  ⇔ 帧间像素差>0 的帧 ≥3 且最长连续变化段 ≥3 且 至少 1 个控件发生变化；
//   skill-diff>0  ⇔ 至少 1 帧「本帧 vs 对照run 同帧」像素差 > 0.05%（否则只能证明画面在动，
//                    不能证明是技能带来的动）。
import { join, resolve } from 'node:path'
import { writeFileSync, mkdirSync } from 'node:fs'
import {
  CANVAS_PRESETS, PROJECT_ROOT, openPlay, renderSnap, decodePng, diffRgba, composeGrid, writeJson, writeText, isMain,
  checkSaveFreshness,
} from './frame-strip.mjs'

const KEY = {
  casual: 'KeyboardCraftspersonKey1',
  aiBattle: 'KeyboardCraftspersonKey2',
  confirm: 'KeyboardCraftspersonKey36',
  skill1: 'KeyboardCraftspersonKey12',     // Z
  skill2: 'KeyboardCraftspersonKey11',     // U
  switchRole: 'KeyboardCraftspersonKey13', // Y（换前台角色）
  jump: 'KeyboardJumpKey',
}

const ROLE_ALIAS = { nahida: 'nahida', keqing: 'keqing', ganyu: 'ganyu', columbina: 'columbina', 少女: 'columbina' }

// 控件级 diff：按 id 对齐（运行时控件 id 稳定），输出新增/消失/移动/改色/改字。
function controlMap(snap) {
  const map = new Map()
  for (const n of snap.scene?.nodes || []) {
    map.set(n.id, {
      name: n.name, kind: n.kind,
      x: n.matrix?.tx ?? null, y: n.matrix?.ty ?? null,
      imageColor: n.imageColor ?? null, fontColor: n.fontColor ?? null,
      text: n.text ?? null,
    })
  }
  return map
}

function diffControls(prev, cur) {
  const added = []
  const removed = []
  const moved = []
  const recolored = []
  const textChanged = []
  for (const [id, c] of cur) {
    const p = prev.get(id)
    if (!p) { added.push({ id, name: c.name, kind: c.kind }); continue }
    if (p.x != null && c.x != null) {
      const dx = +(c.x - p.x).toFixed(2)
      const dy = +(c.y - p.y).toFixed(2)
      if (Math.abs(dx) >= 0.5 || Math.abs(dy) >= 0.5) moved.push({ id, name: c.name, dx, dy })
    }
    if (p.imageColor !== c.imageColor) {
      recolored.push({ id, name: c.name, field: 'imageColor', from: p.imageColor, to: c.imageColor })
    }
    if (p.fontColor !== c.fontColor) {
      recolored.push({ id, name: c.name, field: 'fontColor', from: p.fontColor, to: c.fontColor })
    }
    if (p.text !== c.text) textChanged.push({ id, name: c.name, from: p.text, to: c.text })
  }
  for (const [id, p] of prev) if (!cur.has(id)) removed.push({ id, name: p.name, kind: p.kind })
  return { added, removed, moved, recolored, textChanged, changed: added.length + removed.length + moved.length + recolored.length + textChanged.length }
}

// 等真正进对局：ai-battle 需要一次 anyKeyStart（P1 准备）→ 3s 倒计时 → `guide stage=1`。
// 只按 Key36（↑=旋转）不会触发 anyKeyStart（它在 mapped 表里），这是「按 Z 没反应」的一个时序坑。
function waitForPlayStage(ctx, timeoutFrames = 600) {
  for (let i = 0; i < timeoutFrames; i += 10) {
    if (ctx.logs().some((l) => l.includes('guide stage=1'))) return true
    if (i === 30) ctx.press('KeyboardCraftspersonKey5')   // 未映射键 ⇒ anyKeyStart
    ctx.step(10)
  }
  return ctx.logs().some((l) => l.includes('guide stage=1'))
}

function enterMode(ctx, mode) {
  const key = mode === 'ai-battle' ? KEY.aiBattle : KEY.casual
  ctx.press(key)
  ctx.step(30)
  ctx.press(KEY.confirm)
  ctx.step(60)
  const ok = waitForPlayStage(ctx)
  return { ok, evidence: ok ? 'guide stage=1' : '未到达 guide stage=1' }
}

function switchToRole(ctx, role) {
  const want = ROLE_ALIAS[role] || role
  const current = () => {
    const rows = ctx.logs().filter((l) => /skill switch ok=true active=\d+ role=\S+/.test(l))
    if (!rows.length) return ''
    return rows[rows.length - 1].match(/role=(\S+)/)?.[1] || ''
  }
  if (current() === want) return { ok: true, evidence: `已在位（${want}）` }
  for (let i = 0; i < 6; i++) {
    ctx.press(KEY.switchRole)
    ctx.step(4)
    if (current() === want) {
      const line = ctx.logs().filter((l) => l.includes(`role=${want}`)).slice(-1)[0] || ''
      return { ok: true, evidence: line }
    }
  }
  const last = ctx.logs().filter((l) => /skill switch/.test(l)).slice(-1)[0] || '没有 skill switch 行'
  return { ok: false, evidence: `切换到 ${want} 失败：${last}` }
}

function unlockAllRoles(ctx) {
  ctx.press('KeyboardCraftspersonKey30')
  ctx.step(4)
  const line = ctx.logs().filter((l) => l.includes('skill debug unlock all')).slice(-1)[0]
  return { ok: Boolean(line), evidence: line || '没有 skill debug unlock all 行' }
}

async function captureRun({ canvasId, mode, role, slot, frames, cast, unlockAll = false }) {
  const ctx = openPlay(canvasId)
  const out = { frames: [], prev: null, prevControls: null, logsBefore: 0 }
  try {
    if (mode === 'title') {
      ctx.step(50)                       // 标题页自演已在跑
    } else {
      const entered = enterMode(ctx, mode)
      if (!entered.ok) console.log(`  ⚠ 进局未确认：${entered.evidence}`)
    }
    let roleEvidence = null
    let unlockEvidence = null
    if (unlockAll && mode !== 'title') {
      unlockEvidence = unlockAllRoles(ctx)
    }
    if (role && mode !== 'title') {
      const r = switchToRole(ctx, role)
      roleEvidence = r
    }
    // 进局后先走几步，确保棋盘/预告/技能条都稳定下来
    if (mode !== 'title') {
      ctx.step(20)
      ctx.press(KEY.jump)
      ctx.step(20)
    }
    const audioBefore = (ctx.get({ view: true }).audio?.recent || []).length

    const base = ctx.get({ view: true })
    const baseShot = renderSnap(base)
    const before = { snap: base, shot: baseShot, controls: controlMap(base) }

    if (cast && mode !== 'title') {
      ctx.key(KEY[slot === 2 ? 'skill2' : 'skill1'] + 'Down')
      ctx.step(1)
      ctx.key(KEY[slot === 2 ? 'skill2' : 'skill1'] + 'Up')
    }

    let prev = baseShot
    let prevControls = before.controls
    for (let i = 0; i < frames; i++) {
      ctx.step(1)
      const snap = ctx.get({ view: true })
      const shot = renderSnap(snap)
      const controls = controlMap(snap)
      const px = await decodePng(shot.buf)
      const pxPrev = await decodePng(prev.buf)
      const d = diffRgba(pxPrev, px)
      const cd = diffControls(prevControls, controls)
      out.frames.push({
        i, t: +((i + 1) / 30).toFixed(3),
        pixel: { changed: d.changed, ratio: +d.ratio.toFixed(5), bbox: d.bbox },
        controls: cd,
        shot,
        logsTail: (snap.logs || []).slice(-6).map((r) => r.text),
      })
      prev = shot
      prevControls = controls
    }
    const audioAfter = (ctx.get({ view: true }).audio?.recent || [])
    const logs = ctx.logs()
    return {
      audioBefore,
      audioNew: audioAfter.slice(audioBefore),
      audioAll: audioAfter,
      logs,
      roleEvidence,
      unlockEvidence,
      before,
      frames: out.frames,
    }
  } finally {
    ctx.stop()
  }
}

async function summarize(run, control, mode) {
  const frames = run.frames
  const changedFrames = frames.filter((f) => f.pixel.changed > 0).map((f) => f.i)
  let run0 = 0
  let best = 0
  let bestStart = -1
  let curStart = -1
  for (const f of frames) {
    if (f.pixel.changed > 0) {
      if (curStart < 0) curStart = f.i
      run0++
      if (run0 > best) { best = run0; bestStart = curStart }
    } else { run0 = 0; curStart = -1 }
  }
  // 最长「完全无像素变化」连续段（=静止时长），用于「没有 >0.4s 完全静止」判据。
  let idle = 0
  let maxIdle = 0
  let maxIdleStart = -1
  for (const f of frames) {
    if (f.pixel.changed === 0) { idle++; if (idle > maxIdle) { maxIdle = idle; maxIdleStart = f.i - idle + 1 } }
    else idle = 0
  }
  const controlDiff = []
  if (control) {
    for (let i = 0; i < frames.length; i++) {
      const a = await decodePng(frames[i].shot.buf)
      const b = await decodePng(control.frames[i].shot.buf)
      const d = diffRgba(a, b)
      controlDiff.push({ i, changed: d.changed, ratio: +d.ratio.toFixed(5) })
    }
  }
  const touched = new Map()
  let firstControlChange = null
  for (const f of frames) {
    if (f.controls.changed > 0 && firstControlChange == null) firstControlChange = f.i
    for (const key of ['added', 'removed', 'moved', 'recolored', 'textChanged']) {
      for (const item of f.controls[key]) touched.set(item.name || item.id, (touched.get(item.name || item.id) || 0) + 1)
    }
  }
  // 技能日志锚既可能落在帧内，也可能在采帧之前（cast 与第 1 帧同刻）⇒ 以**整段会话日志**为准
  const SKILL_RE = /skill (cast|ai |fx |fail)|takeover (hint|ai|back)/
  const skillLines = (run.logs || []).filter((l) => SKILL_RE.test(l))
  const skillFrames = frames.filter((f) => (f.logsTail || []).some((l) => SKILL_RE.test(l)))
  const audioIds = [...new Set(run.audioNew.map((a) => a.audioId))]
  const pixelFrames = changedFrames.length
  // 动画判定口径（离散 UI 变化，不是视频帧率）：
  //   ≥3 帧有像素变化 且 首变到末变的跨度 ≥15 帧(0.5s)（=不是一帧闪）且 至少 1 个控件发生变化。
  //   longestRun 只作参考：方块每次只挪一格，连续变化段天然是 1 帧。
  const changeSpan = pixelFrames ? (changedFrames[changedFrames.length - 1] - changedFrames[0]) : 0
  const animation = pixelFrames >= 3 && changeSpan >= 15 && touched.size >= 1
  const controlFrames = controlDiff.filter((d) => d.ratio > 0.0005).length
  return {
    mode,
    frames: frames.length,
    pixelChangedFrames: pixelFrames,
    firstPixelChangeFrame: pixelFrames ? changedFrames[0] : null,
    firstPixelChangeAt: pixelFrames ? frames[changedFrames[0]].t : null,
    longestRun: best,
    longestRunStartFrame: bestStart,
    changeSpanFrames: changeSpan,
    maxIdleFrames: maxIdle,
    maxIdleSeconds: +(maxIdle / 30).toFixed(2),
    maxIdleStartFrame: maxIdleStart,
    persistent: best >= Math.max(3, Math.floor(frames.length * 0.3)),
    controlsTouched: [...touched.entries()].map(([name, n]) => ({ name, changes: n })),
    firstControlChangeFrame: firstControlChange,
    skillLogFrames: skillFrames.map((f) => ({ i: f.i, t: f.t, first: (f.logsTail || []).find((l) => SKILL_RE.test(l)) })),
    skillLogLines: skillLines.slice(0, 12),
    castOk: skillLines.some((l) => /skill cast .*ok=true/.test(l)),
    aiStart: skillLines.find((l) => l.includes('skill ai start')) || null,
    aiEnd: skillLines.find((l) => l.includes('skill ai end')) || null,
    animation: animation ? 'on' : 'off',
    controlRun: control ? {
      comparedFrames: controlDiff.length,
      framesDifferingFromControl: controlFrames,
      firstDifferingFrame: controlDiff.find((d) => d.ratio > 0.0005)?.i ?? null,
      maxRatio: controlDiff.length ? Math.max(...controlDiff.map((d) => d.ratio)) : 0,
    } : null,
    skillEffect: controlFrames > 0 ? 'on' : 'unknown（与对照无差异）',
    audio: { newCount: run.audioNew.length, ids: audioIds, sample: run.audioNew.slice(0, 6) },
    audioVerdict: run.audioNew.length > 0 ? 'on' : 'off',
  }
}

function parseArgs(argv) {
  const opts = { canvas: 'pc-16-9', mode: 'casual', slot: 1, frames: 48, out: null, role: null, control: true, audio: false, cols: 4, scale: 0.4, allRoles: false }
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--role') opts.role = argv[++i]
    else if (a === '--canvas') opts.canvas = argv[++i]
    else if (a === '--mode') opts.mode = argv[++i]
    else if (a === '--slot') opts.slot = Number(argv[++i])
    else if (a === '--frames') opts.frames = Number(argv[++i])
    else if (a === '--out') opts.out = argv[++i]
    else if (a === '--cols') opts.cols = Number(argv[++i])
    else if (a === '--scale') opts.scale = Number(argv[++i])
    else if (a === '--audio') opts.audio = true
    else if (a === '--all-roles') opts.allRoles = true
    else if (a === '--no-control') opts.control = false
    else if (a === '-h' || a === '--help') opts.help = true
    else throw new Error(`未知参数 ${a}`)
  }
  return opts
}

function reply(summary) {
  return summary.skillLogFrames.length ? `t=${summary.skillLogFrames[0].t}s` : 'none'
}

async function main() {
  const opts = parseArgs(process.argv)
  if (opts.help) {
    console.log('node qxqy/probe-skill.mjs --role nahida --canvas pc-16-9 --out docs/shots/skill-nahida [--mode ai-battle] [--slot 2] [--frames 48] [--audio]')
    return 0
  }
  if (!CANVAS_PRESETS[opts.canvas]) throw new Error(`未知画布 ${opts.canvas}`)
  if (opts.allRoles) {
    // 4 角色 × 本画布，各自一套 strip/summary。技能 1 用「台前」角色 ⇒ 每次先 Key30 解锁全角色再 Y 切到位。
    const roles = ['nahida', 'keqing', 'ganyu', 'columbina']
    const base = opts.out || join('docs', 'shots', `skills-${opts.canvas}`)
    const report = { canvas: opts.canvas, mode: opts.mode, roles: {} }
    let bad = 0
    for (const role of roles) {
      const outDir = resolve(PROJECT_ROOT, base, role)
      console.log(`\n▶ 角色 ${role} → ${outDir}`)
      const run = await captureRun({ canvasId: opts.canvas, mode: opts.mode, role, slot: opts.slot, frames: opts.frames, cast: true, unlockAll: true })
      const control = opts.control
        ? await captureRun({ canvasId: opts.canvas, mode: opts.mode, role, slot: opts.slot, frames: opts.frames, cast: false, unlockAll: true })
        : null
      const summary = await summarize(run, control, opts.mode)
      summary.role = role
      summary.slot = opts.slot
      summary.canvas = { id: opts.canvas, ...CANVAS_PRESETS[opts.canvas] }
      summary.roleSwitch = run.roleEvidence
      summary.unlock = run.unlockEvidence
      mkdirSync(outDir, { recursive: true })
      const tiles = run.frames.map((f) => ({
        buf: f.shot.buf,
        label: `f${String(f.i + 1).padStart(3, '0')} t=${f.t.toFixed(2)}s px=${f.pixel.changed}`,
        sub: `ctl=${f.controls.changed}`,
      }))
      const grid = await composeGrid(tiles, {
        cols: opts.cols, scale: opts.scale,
        header: `${role} · ${opts.mode} · ${opts.canvas} · slot ${opts.slot} · animation=${summary.animation} ` +
          `pxFrames=${summary.pixelChangedFrames}/${summary.frames} audio=${summary.audioVerdict} skilldiff=${summary.skillEffect}`,
      })
      writeFileSync(join(outDir, 'strip.png'), grid.buf)
      writeJson(join(outDir, 'summary.json'), summary)
      writeJson(join(outDir, 'frames.json'), {
        meta: { role, mode: opts.mode, canvas: opts.canvas, slot: opts.slot, dt: 1 / 30, summary },
        frames: run.frames.map((f) => ({ i: f.i, t: f.t, pixel: f.pixel, controls: f.controls, logsTail: f.logsTail })),
      })
      writeText(join(outDir, 'run.log.txt'), run.logs.join('\n'))
      const want = summary.animation === 'on' && summary.skillEffect === 'on'
      if (!want) bad += 1
      report.roles[role] = {
        animation: summary.animation, skillEffect: summary.skillEffect, audio: summary.audioVerdict,
        pixelFrames: summary.pixelChangedFrames, maxIdleSeconds: summary.maxIdleSeconds,
        roleSwitch: run.roleEvidence?.ok, castOk: Boolean(summary.castOk),
        aiStart: summary.aiStart, maxIdleFrames: summary.maxIdleFrames,
        audioIds: summary.audio.ids,
      }
      console.log(`  ${want ? '✓' : '✗'} ${role}: animation=${summary.animation} skillEffect=${summary.skillEffect} ` +
        `audio=${summary.audioVerdict}[${summary.audio.ids.join(',')}] pxFrames=${summary.pixelChangedFrames}/${summary.frames} ` +
        `switch=${run.roleEvidence?.ok ? 'ok' : 'FAIL'} cast=${reply(summary)}`)
    }
    writeJson(resolve(PROJECT_ROOT, base, 'roles.json'), report)
    console.log(`\n▶ 4 角色 ${bad ? `✗ ${bad} 个未达标` : '✓ 全部达标'} → ${resolve(PROJECT_ROOT, base, 'roles.json')}`)
    return bad ? 1 : 0
  }
  const outDir = resolve(PROJECT_ROOT, opts.out || join('docs', 'shots', `skill-${opts.role || 'none'}-${opts.mode}`))
  const fresh = checkSaveFreshness()
  if (!fresh.ok) {
    console.log(`⚠ 存档与 lua/ 不同步（${fresh.stale.length} 处）⇒ 测的是旧代码，先 flock 跑 build：`)
    for (const st of fresh.stale) console.log(`   · ${st.path}: ${st.why}`)
  }
  const t0 = Date.now()
  console.log(`▶ 技能探针 role=${opts.role || '-'} mode=${opts.mode} canvas=${opts.canvas} slot=${opts.slot} frames=${opts.frames} → ${outDir}`)

  const cast = opts.mode !== 'title'
  const run = await captureRun({
    canvasId: opts.canvas, mode: opts.mode, role: opts.role, slot: opts.slot, frames: opts.frames, cast,
  })
  let control = null
  if (opts.control) {
    console.log('  · 跑对照 run（同步骤、不按技能键）')
    control = await captureRun({
      canvasId: opts.canvas, mode: opts.mode, role: opts.role, slot: opts.slot, frames: opts.frames, cast: false,
    })
  }
  const summary = await summarize(run, control, opts.mode)
  summary.role = opts.role
  summary.slot = opts.slot
  summary.canvas = { id: opts.canvas, ...CANVAS_PRESETS[opts.canvas] }
  summary.roleSwitch = run.roleEvidence
  summary.elapsedMs = Date.now() - t0
  summary.saveFreshness = fresh

  // 拼图：每帧一格，标签带帧号/时间/像素差/对照差
  const tiles = run.frames.map((f) => {
    const cdiff = summary.controlRun ? null : null
    return {
      buf: f.shot.buf,
      label: `f${String(f.i + 1).padStart(3, '0')} t=${f.t.toFixed(2)}s px=${f.pixel.changed}`,
      sub: `ctl=${f.controls.changed}`,
    }
  })
  const grid = await composeGrid(tiles, {
    cols: opts.cols, scale: opts.scale,
    header: `skill ${opts.role || '-'} · ${opts.mode} · ${opts.canvas} · slot ${opts.slot} · ` +
      `animation=${summary.animation} pxFrames=${summary.pixelChangedFrames}/${summary.frames} ` +
      `firstChange=${summary.firstPixelChangeAt ?? '-'}s run=${summary.longestRun} audio=${summary.audioVerdict}`,
  })
  mkdirSync(outDir, { recursive: true })
  writeFileSync(join(outDir, 'strip.png'), grid.buf)
  const keyIdx = [...new Set([0, 11, 23, run.frames.length - 1])].filter((i) => i >= 0 && i < run.frames.length)
  for (const i of keyIdx) {
    writeFileSync(join(outDir, `frame-f${String(i + 1).padStart(3, '0')}.png`), run.frames[i].shot.buf)
  }
  summary.keyFrames = keyIdx.map((i) => `frame-f${String(i + 1).padStart(3, '0')}.png`)
  if (control) {
    const ctiles = control.frames.map((f, i) => ({
      buf: f.shot.buf,
      label: `c${String(i + 1).padStart(3, '0')} t=${f.t.toFixed(2)}s px=${f.pixel.changed}`,
      sub: `ctl=${f.controls.changed}`,
    }))
    const cgrid = await composeGrid(ctiles, {
      cols: opts.cols, scale: opts.scale,
      header: `对照 run（不按技能键） · ${opts.mode} · ${opts.canvas}`,
    })
    writeFileSync(join(outDir, 'control-strip.png'), cgrid.buf)
    summary.controlStrip = 'control-strip.png'
  }
  const framesJson = {
    meta: {
      role: opts.role, mode: opts.mode, canvas: opts.canvas, slot: opts.slot,
      dt: 1 / 30, frames: opts.frames, summary,
    },
    frames: run.frames.map((f) => ({
      i: f.i, t: f.t, pixel: f.pixel, controls: f.controls, logsTail: f.logsTail,
      // 只留关键控件（改名/改字/移动过的）避免 JSON 爆掉
    })),
    controlFrames: control ? control.frames.map((f) => ({ i: f.i, t: f.t, pixel: f.pixel, controls: f.controls })) : null,
  }
  writeJson(join(outDir, 'frames.json'), framesJson)
  writeJson(join(outDir, 'summary.json'), summary)
  writeText(join(outDir, 'run.log.txt'), run.logs.join('\n'))
  if (control) writeText(join(outDir, 'control.log.txt'), control.logs.join('\n'))

  console.log(`  动画判定 animation=${summary.animation}`)
  console.log(`    帧间像素差>0：${summary.pixelChangedFrames}/${summary.frames} 帧 · 首变 t=${summary.firstPixelChangeAt ?? '-'}s · ` +
    `最长连续变化 ${summary.longestRun} 帧（起点 f${summary.longestRunStartFrame}）· 持续=${summary.persistent}`)
  console.log(`    最长完全静止：${summary.maxIdleFrames} 帧 = ${summary.maxIdleSeconds}s（起点 f${summary.maxIdleStartFrame}）`)
  console.log(`    控件变化：${summary.controlsTouched.length} 个控件 · 首个控件变化 f${summary.firstControlChangeFrame}`)
  if (summary.controlRun) {
    console.log(`    对照 run：${summary.controlRun.framesDifferingFromControl}/${summary.controlRun.comparedFrames} 帧与对照不同 ` +
      `· 首差 f${summary.controlRun.firstDifferingFrame} · maxRatio=${(summary.controlRun.maxRatio * 100).toFixed(2)}% ⇒ 技能效果 ${summary.skillEffect}`)
  }
  console.log(`    技能日志帧：${summary.skillLogFrames.length} 帧${summary.skillLogFrames[0] ? `（f${summary.skillLogFrames[0].i}: ${summary.skillLogFrames[0].first}）` : ''}`)
  console.log(`    音效：${summary.audioVerdict} · new=${summary.audio.newCount} ids=[${summary.audio.ids.join(',')}]`)
  console.log(`  ▦ ${join(outDir, 'strip.png')}`)
  console.log(`  ▦ ${join(outDir, 'frames.json')} / summary.json / run.log.txt`)
  console.log(`    技能日志锚：${summary.skillLogLines.length} 行${summary.aiStart ? ` · aiStart: ${summary.aiStart}` : ''}`)
  const bad = []
  if (opts.mode === 'title') {
    // 标题页模式只判「静止时长」：没有任何 >0.4s（12 帧）的完全静止段才算动得够
    if (summary.maxIdleFrames > 12) bad.push(`最长静止 ${summary.maxIdleSeconds}s > 0.4s`)
    console.log(`  · 标题页 demo：${summary.pixelChangedFrames}/${summary.frames} 帧在变 · 最长静止 ${summary.maxIdleSeconds}s`)
  } else {
    if (summary.animation !== 'on') bad.push('animation=off')
    if (summary.audioVerdict !== 'on') bad.push('audio=off')
    if (summary.skillEffect !== 'on') bad.push('skillEffect≠on')
    if (!summary.castOk) bad.push('castOk=false（日志里没有 skill cast ok=true）')
    if (summary.maxIdleFrames > 12) bad.push(`最长静止 ${summary.maxIdleSeconds}s > 0.4s`)
  }
  if (bad.length) console.log(`  ✗ 未达标：${bad.join(' / ')}`)
  return 0
}

if (isMain(import.meta.url)) {
  main().then((c) => process.exit(c)).catch((err) => {
    console.error('probe-skill 失败:', err?.stack || err)
    process.exit(1)
  })
}
