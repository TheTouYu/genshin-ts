#!/usr/bin/env node
// v5 画布矩阵出图（A 件）：5 画布 × 6 屏，真模拟器渲染（不是截图），每屏同时落
// PNG + 帧快照（供 qxqy/audit-ui.mjs 离线审计）+ 日志读数。
//
// 用法：
//   node qxqy/shots-v5.mjs --all --out docs/shots/v5-b1
//   node qxqy/shots-v5.mjs --canvas mobile-19.5-9 --screen game
//   node qxqy/shots-v5.mjs --all --canvas pc-16-9 --screen title,dual
// 屏：title / game / help / settle / roster / dual（6 屏）
// 产物：<out>/<canvasId>/<screen>.png + <screen>.frame.json + <screen>.log.txt
//       <out>/<canvasId>/sheet.png（6 屏拼图，人能一眼看全）
//       <out>/manifest.json（每画布每屏 reached / 读数 / 阻塞原因）
// 判据：每张 PNG >20KB；每屏 frame.json 里 textbox 的 textLayout.fits 全 true（否则 audit-ui 报 fail）。
// 出图保真补丁：见 frame-strip.mjs:paintOrdered（textbox 置顶画，与真机观感一致）。
import { join, resolve } from 'node:path'
import { writeFileSync } from 'node:fs'
import {
  CANVAS_IDS, CANVAS_PRESETS, SCREENS, PROJECT_ROOT,
  openPlay, paintOrdered, renderSnap, writeSnap, writeJson, writeText, composeGrid, isMain, checkSaveFreshness,
} from './frame-strip.mjs'

const KEY = {
  casual: 'KeyboardCraftspersonKey1',
  aiBattle: 'KeyboardCraftspersonKey2',
  pvp: 'KeyboardCraftspersonKey3',
  coop: 'KeyboardCraftspersonKey4',
  confirm: 'KeyboardCraftspersonKey36',
  jump: 'KeyboardJumpKey',
  help: 'KeyboardCraftspersonKey15',
  roster: 'KeyboardCraftspersonKey16',
  right: 'KeyboardCraftspersonKey38',
}

// ── 帧快照（裁剪字段：只留审计/差分要用的，控制在 ~100KB/屏）───────────────
const nodeField = (n) => ({
  id: n.id, parent: n.parent, z: n.z, kind: n.kind, name: n.name,
  text: n.text ?? null, fontSize: n.fontSize ?? null,
  textLayout: n.textLayout ? {
    fits: n.textLayout.fits, textWidth: n.textLayout.textWidth,
    requiredHeight: n.textLayout.requiredHeight, lines: n.textLayout.lines,
  } : null,
  fontColor: n.fontColor ?? null, bgColor: n.bgColor ?? null,
  imageColor: n.imageColor ?? null, primitive: n.primitive ?? null,
  sourceWidth: n.sourceWidth ?? null, sourceHeight: n.sourceHeight ?? null,
  matrix: n.matrix ? { a: n.matrix.a, b: n.matrix.b, c: n.matrix.c, d: n.matrix.d, tx: n.matrix.tx, ty: n.matrix.ty } : null,
  pressed: n.pressed === true,
})

// 可点区（真实命中口径，取自 playGet({inspect:true}).tree）：
// 与 studio/play/session.js:acceptsPlayPointer 同规则——button/cursor/grid/textwindow 收指针，
// 其它类型仅当 raycastTarget===true。box 是运行时算好的画布世界坐标盒。
function collectZones(tree) {
  const zones = []
  const walk = (node) => {
    const kind = node.kind
    const accepts = kind === 'button' || kind === 'cursor' || kind === 'grid' || kind === 'textwindow' ||
      (node.raycastTarget === true && kind !== 'container')
    if (accepts && node.active !== false && node.visible !== false && node.box) {
      zones.push({
        name: node.name, kind, box: node.box,
        interactable: node.interactable !== false,
        raycastTarget: node.raycastTarget === true,
      })
    }
    for (const child of node.children || []) walk(child)
  }
  for (const root of tree || []) walk(root)
  return zones
}

// 控件级真值（取自 playGet({inspect:true}).tree）：带运行时算好的世界坐标盒 box，
// 用于审计的越界/可点区重叠/对比度（scene.nodes 只有局部矩阵，不能当世界坐标用）。
function flattenTree(tree) {
  const out = []
  const walk = (node) => {
    out.push({
      name: node.name, kind: node.kind,
      box: node.box || null,
      text: node.text ?? null, fontSize: node.fontSize ?? null,
      fontColor: node.fontColor ?? null, bgColor: node.bgColor ?? null,
      imageColor: node.imageColor ?? null, primitive: node.primitive ?? null,
      raycastTarget: node.raycastTarget === true, interactable: node.interactable !== false,
      active: node.active !== false, visible: node.visible !== false,
      pressed: node.pressed === true,
      enableOutline: node.enableOutline === true, outlineColor: node.outlineColor ?? null,
      sizeDeltaX: node.sizeDeltaX ?? null, sizeDeltaY: node.sizeDeltaY ?? null,
    })
    for (const child of node.children || []) walk(child)
  }
  for (const root of tree || []) walk(root)
  return out
}

function frameOf(ctx, snap, { screen, note, reached, treeSnapshot }) {
  const nodes = (snap.scene?.nodes || []).map(nodeField)
  return {
    screen,
    reached: reached !== false,
    note: note || '',
    canvas: { id: snap.canvasId, width: snap.canvasWidth, height: snap.canvasHeight, mobile: CANVAS_PRESETS[snap.canvasId]?.mobile ?? null },
    time: snap.time, frame: snap.frame,
    nodes,
    zones: collectZones(treeSnapshot || []),
    controls: flattenTree(treeSnapshot || []),
    texts: nodes.filter((n) => n.text).map((n) => ({ name: n.name, text: n.text, fits: n.textLayout?.fits ?? null })),
  }
}

// ── 读数抽取（全部来自 main.lua 的实证打印锚）─────────────────────────────
function readings(logs) {
  const last = (re) => {
    for (let i = logs.length - 1; i >= 0; i--) {
      const m = re.exec(logs[i])
      if (m) return m
    }
    return null
  }
  const has = (sub) => logs.some((l) => l.includes(sub))
  const bg = last(/bg cover ok bs=([\d.]+) w=(\d+) h=(\d+)/)
  const gapMatch = last(/bg cover GAP[^\n]*/)
  // 两种格式都收：旧 `phone build n=8 help=ok`，v5 `phone build n=17 (pad=9 nav=4 act=3)`
  const phone = last(/phone build n=(\d+)(?: help=(\w+))?(?: \(([^)]*)\))?/)
  const pad = last(/pad note open which=(\d+)/)
  const mode = last(/mode=([a-z-]+)/)
  return {
    mode: mode ? mode[1] : null,
    bgCoverOk: Boolean(bg),
    bgCover: bg ? { bs: Number(bg[1]), w: Number(bg[2]), h: Number(bg[3]) } : null,
    bgCoverGap: gapMatch ? gapMatch[0] : null,
    phoneBuildN: phone ? Number(phone[1]) : null,
    phoneHelp: phone ? (phone[2] || null) : null,
    phoneBreakdown: phone && phone[3] ? phone[3] : null,
    padNoteWhich: pad ? Number(pad[1]) : null,
    gameOver: has('游戏结束') || has('settle build ok'),
    helpOpen: has('guide help on n='),
    rosterOpen: has('char codex open n='),   // 锚点真名在 roster.lua:573（『roster open n=』全仓 0 命中=死判据）
    skillCastOk: has('skill cast') && has('ok=true'),
    phonePlayBar: has('phone play bar=true'),
  }
}

const hasText = (snap, needle) => (snap.scene?.nodes || []).some((n) => typeof n.text === 'string' && n.text.includes(needle))

function enterMode(ctx, keyBase) {
  ctx.press(keyBase)
  ctx.step(30)                        // 模式名动画窗
  ctx.press(KEY.confirm)              // 任意键确认（跳过引导）
  ctx.step(100)                       // 3s 倒计时
}

function settlePath(ctx) {
  enterMode(ctx, KEY.casual)
  let over = false
  for (let i = 0; i < 120 && !over; i++) {
    ctx.press(KEY.jump)
    over = hasText(ctx.get(), '游戏结束') || ctx.logs().some((l) => l.includes('settle build ok'))
    if (!over) ctx.step(3)
  }
  ctx.step(60)
  return over
}

// 每屏的到达路径；返回 { reached, note }。note 写真实证据（日志锚/文本），不是"应该能到"。
function reachScreen(ctx, screen) {
  switch (screen) {
    case 'title': {
      ctx.step(50)
      const snap = ctx.get()
      const onTitle = hasText(snap, '俄罗斯方块') || hasText(snap, '开始') || hasText(snap, '模式')
      return { reached: onTitle, note: onTitle ? 'title text present' : 'no title text' }
    }
    case 'game': {
      enterMode(ctx, KEY.casual)
      // 多走几块，让 HUD/预览/落块都进画面
      ctx.press(KEY.jump); ctx.step(20)
      ctx.press(KEY.right); ctx.step(6)
      ctx.press(KEY.jump); ctx.step(40)
      const logs = ctx.logs()
      const blocked = logs.some((l) => l.includes('pad note open'))
      return { reached: !blocked, note: blocked ? 'pad note 浮层（移动端未进局）' : 'casual game running' }
    }
    case 'help': {
      ctx.press(KEY.help)
      ctx.step(20)
      const logs = ctx.logs()
      const open = logs.some((l) => l.includes('guide help on n='))
      return { reached: open, note: open ? 'guide help on' : 'help 未打开（无 guide help on 锚）' }
    }
    case 'roster': {
      ctx.press(KEY.roster)
      ctx.step(24)
      const logs = ctx.logs()
      const open = logs.some((l) => l.includes('char codex open n='))
      return { reached: open, note: open ? 'char codex open' : 'roster 未打开（无 char codex open 锚）' }
    }
    case 'settle': {
      const over = settlePath(ctx)
      return { reached: over, note: over ? 'game over → 结算层' : '120 次硬降仍未结束' }
    }
    case 'dual': {
      ctx.press(KEY.aiBattle)
      ctx.step(30)
      const logsAfterSelect = ctx.logs()
      const pad = logsAfterSelect.filter((l) => l.includes('pad note open')).slice(-1)[0]
      if (pad) return { reached: false, note: `${pad}（移动端 i>1 被拦：main.lua:3196）` }
      ctx.press(KEY.confirm)
      ctx.step(100)
      ctx.step(80)
      const mode = logsAfterSelect.filter((l) => /mode=ai-battle/.test(l)).length > 0
      return { reached: mode, note: mode ? 'mode=ai-battle 双屏' : '未见到 mode=ai-battle' }
    }
    default:
      return { reached: false, note: `未知屏 ${screen}` }
  }
}

export function captureCanvasScreen(canvasId, screen, outRoot) {
  const dir = join(outRoot, canvasId)
  const ctx = openPlay(canvasId)
  let result
  try {
    result = reachScreen(ctx, screen)
    const snap = ctx.get({ view: true, inspect: true })
    const logs = ctx.logs()
    const shot = writeSnap(join(dir, `${screen}.png`), snap)
    const frame = frameOf(ctx, snap, { screen, note: result.note, reached: result.reached, treeSnapshot: snap.tree })
    writeJson(join(dir, `${screen}.frame.json`), frame)
    writeText(join(dir, `${screen}.log.txt`), logs.join('\n'))
    const r = readings(logs)
    r.phoneZones = frame.zones.filter((z) => /^ph[a-z0-9]+$/i.test(z.name || '')).map((z) => z.name)
    const bad = frame.nodes.filter((n) => n.kind === 'textbox' && n.text && n.textLayout?.fits === false).length
    const entry = {
      canvasId, screen, reached: result.reached, note: result.note,
      png: shot.file, pngBytes: shot.buf.length, size: { width: shot.width, height: shot.height },
      nodes: frame.nodes.length, textboxes: frame.nodes.filter((n) => n.kind === 'textbox').length,
      zones: frame.zones.length, textFitsBad: bad,
      readings: r,
      texts: frame.texts.map((t) => t.text).slice(0, 60),
    }
    const mark = result.reached ? '✓' : '✗'
    const mobile = CANVAS_PRESETS[canvasId]?.mobile
    const phone = mobile
      ? (r.phoneBuildN != null
        ? `phone=${r.phoneBuildN}${r.phoneBreakdown ? `(${r.phoneBreakdown})` : ''} ph*=${r.phoneZones.length}`
        : `phone=NONE(日志无 phone build，画面里 ph* 命中区 ${r.phoneZones.length} 个)`)
      : ''
    console.log(`${mark} ${canvasId}/${screen}  ${shot.width}x${shot.height} ${(shot.buf.length / 1024).toFixed(1)}KB ` +
      `nodes=${entry.nodes} zones=${entry.zones} fitsBad=${bad} mode=${r.mode ?? '-'} ` +
      `bg=${r.bgCoverOk ? 'ok' : 'GAP'} ${phone} ${result.note}`)
    return { entry, shot, frame }
  } finally {
    ctx.stop()
  }
}

function parseArgs(argv) {
  const opts = { canvases: [], screens: [], out: null, all: false, sheet: true }
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--all') opts.all = true
    else if (a === '--no-sheet') opts.sheet = false
    else if (a === '--out') opts.out = argv[++i]
    else if (a === '--canvas') opts.canvases.push(...String(argv[++i]).split(',').filter(Boolean))
    else if (a === '--screen' || a === '--screens') opts.screens.push(...String(argv[++i]).split(',').filter(Boolean))
    else if (a === '-h' || a === '--help') opts.help = true
    else throw new Error(`未知参数 ${a}`)
  }
  return opts
}

async function main() {
  const opts = parseArgs(process.argv)
  if (opts.help) {
    console.log('node qxqy/shots-v5.mjs --all --out docs/shots/<批次>\n' +
      'node qxqy/shots-v5.mjs --canvas mobile-19.5-9 --screen game')
    return 0
  }
  const canvases = opts.canvases.length ? opts.canvases : (opts.all ? CANVAS_IDS : ['pc-16-9'])
  const screens = opts.screens.length ? opts.screens : SCREENS
  for (const c of canvases) if (!CANVAS_PRESETS[c]) throw new Error(`未知画布 ${c}（可选 ${CANVAS_IDS.join('/')}）`)
  for (const s of screens) if (!SCREENS.includes(s)) throw new Error(`未知屏 ${s}（可选 ${SCREENS.join('/')}）`)
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
  const outRoot = resolve(PROJECT_ROOT, opts.out || join('docs', 'shots', `v5-${stamp}`))
  console.log(`▶ 出图矩阵 ${canvases.length} 画布 × ${screens.length} 屏 → ${outRoot}`)
  const t0 = Date.now()
  const fresh = checkSaveFreshness()
  if (!fresh.ok) {
    console.log(`⚠ 存档 tetris.save.json 与 lua/ 不同步（${fresh.stale.length} 处）⇒ 以下出图可能来自旧代码：`)
    for (const s of fresh.stale) console.log(`   · ${s.path}: ${s.why}`)
  }
  const manifest = { format: 'qxqy-shots-v5', version: 1, generatedAt: new Date().toISOString(), out: outRoot, saveFreshness: fresh, canvases: {}, failures: [] }
  for (const canvasId of canvases) {
    const rows = []
    const entries = {}
    for (const screen of screens) {
      const { entry, shot } = captureCanvasScreen(canvasId, screen, outRoot)
      entries[screen] = entry
      rows.push({ buf: shot.buf, label: `${screen}  ${entry.reached ? '' : 'BLOCKED '}${entry.note}` })
      if (!entry.reached) manifest.failures.push({ canvasId, screen, note: entry.note })
      if (entry.pngBytes < 20 * 1024) manifest.failures.push({ canvasId, screen, note: `PNG 只有 ${(entry.pngBytes / 1024).toFixed(1)}KB (<20KB)` })
      if (entry.textFitsBad) manifest.failures.push({ canvasId, screen, note: `${entry.textFitsBad} 个 textbox fits=false` })
    }
    let sheet = null
    if (opts.sheet && rows.length > 1) {
      const grid = await composeGrid(rows, {
        cols: 3,
        scale: 0.5,
        header: `${canvasId} ${CANVAS_PRESETS[canvasId].width}x${CANVAS_PRESETS[canvasId].height} · ${rows.length} 屏 · ${entries[screens[0]]?.readings?.bgCoverOk ? 'bg cover ok' : 'bg cover GAP?'}`,
      })
      const file = join(outRoot, canvasId, 'sheet.png')
      writeFileSync(file, grid.buf)
      sheet = { file, width: grid.width, height: grid.height, bytes: grid.buf.length }
      console.log(`  ▦ ${canvasId}/sheet.png  ${grid.width}x${grid.height} ${(grid.buf.length / 1024).toFixed(1)}KB (${grid.cols}×${grid.rows})`)
    }
    manifest.canvases[canvasId] = { canvasId, preset: CANVAS_PRESETS[canvasId], screens: entries, sheet }
  }
  writeJson(join(outRoot, 'manifest.json'), manifest)
  const blocked = manifest.failures.filter((f) => /pad note|未见到|未打开|no title/.test(f.note))
  console.log(`\n▶ 完成 ${((Date.now() - t0) / 1000).toFixed(1)}s → ${outRoot}/manifest.json`)
  console.log(`  出图 ${Object.keys(manifest.canvases).length * screens.length} 张，reached=false / 阻塞 ${blocked.length} 条`)
  for (const f of blocked) console.log(`  ✗ ${f.canvasId}/${f.screen}: ${f.note}`)
  return 0
}

if (isMain(import.meta.url)) {
  main().then((code) => process.exit(code)).catch((err) => {
    console.error('shots-v5 失败:', err?.stack || err)
    process.exit(1)
  })
}
