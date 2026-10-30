#!/usr/bin/env node
// v5 核验仪器·共用层：会话开关 / 出图保真补丁 / PNG 栅格化 / 帧差 / 拼图。
// 被 qxqy/shots-v5.mjs、qxqy/probe-skill.mjs、qxqy/audit-ui.mjs 复用；本文件也接受直接调用做自检：
//   node qxqy/frame-strip.mjs            # 自检：渲染一张标题图 + 打印帧差/拼图能力读数
// 只读依赖：模拟器 studio（不改）、tetris.save.json（工程存档）。
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createStudio } from '/home/h/miliastra-beyond-simulator/studio/index.js'
import { flattenScenePaint, renderPaintPng } from '/home/h/miliastra-beyond-simulator/studio/host-png.js'
import { sharedImageAssets } from '/home/h/miliastra-beyond-simulator/studio/host/image-assets.js'

// @napi-rs/canvas 只装在模拟器仓库里（studio/node_modules）⇒ 从模拟器模块解析，不依赖本工程依赖树。
const require = createRequire('/home/h/miliastra-beyond-simulator/studio/host-png.js')
const here = dirname(fileURLToPath(import.meta.url))

export const PROJECT_ROOT = resolve(here, '..')
export const SAVE_PATH = join(PROJECT_ROOT, 'tetris.save.json')

// 画布预设真值来自 /home/h/miliastra-beyond-simulator/studio/constants.js 的 CANVAS_PRESETS。
export const CANVAS_PRESETS = {
  'pc-16-9': { width: 1600, height: 900, mobile: false },
  'pc-21-9': { width: 2100, height: 900, mobile: false },
  'mobile-16-9': { width: 1280, height: 720, mobile: true },
  'mobile-19.5-9': { width: 1560, height: 720, mobile: true },
  'mobile-4-3': { width: 1280, height: 960, mobile: true },
}
export const CANVAS_IDS = Object.keys(CANVAS_PRESETS)
export const SCREENS = ['title', 'game', 'help', 'settle', 'roster', 'dual']

// 出图时置顶的 HUD 控件名（shot-style.mjs 的做法：HUD 是后来建的实例，会压住服务端布局层文字）。
const HUD_NAMES = new Set(['hud', 'hudNext', 'best', 'hint', 'keyA', 'keyB', 'keyC'])
const IMAGE_ASSETS = sharedImageAssets()
const CANVAS_LIB = require('@napi-rs/canvas')

export function loadSave() {
  return JSON.parse(readFileSync(SAVE_PATH, 'utf8'))
}

function mkdirp(dir) {
  mkdirSync(dir, { recursive: true })
  return dir
}

/** 打开一个试玩会话，给出与 shot-style.mjs 同口径的动词。 */
export function openPlay(canvasId, { root = PROJECT_ROOT, save = null } = {}) {
  const s = createStudio(save || loadSave(), { workspacePath: root })
  s.playStart({ canvasId })
  const step = (n = 1, dt = 1 / 30) => {
    for (let i = 0; i < n; i++) s.playStep(dt, { observe: false })
  }
  const key = (typeName) => s.playKey(typeName, { observe: false })
  const press = (base, holdFrames = 1) => {
    key(base + 'Down')
    if (holdFrames > 0) step(holdFrames)
    key(base + 'Up')
  }
  const get = (opts = { view: true }) => s.playGet(opts)
  const logs = (opts = { view: true }) => (s.playGet(opts).logs || []).map((row) => String(row.text ?? row))
  const stop = () => s.playStop()
  return { s, step, key, press, get, logs, stop, canvasId }
}

/**
 * 出图保真补丁（从 qxqy/shot-style.mjs 抽出，语义不变）：
 * host-png 按 z 升序绘制，而 z 是控件创建序 —— 运行时后建的实例（HUD/召唤物）会压住服务端布局层
 * 的 textbox，出图看起来「字没了」；真机观感是文字可见。故出图时把 textbox 放到最后画。
 * hud=true 时再把 HUD 名集抬到 textbox 之后（shot-style 的可选行为）。
 */
export function paintOrdered(scene, { hud = false } = {}) {
  const paint = flattenScenePaint(scene)
  const isHud = (item) => hud && HUD_NAMES.has(item.name)
  const layers = [
    paint.filter((item) => !isHud(item) && item.kind !== 'textbox'),
    paint.filter((item) => !isHud(item) && item.kind === 'textbox'),
    paint.filter(isHud),
  ]
  return layers.flat()
}

/** 渲染一帧快照 → PNG Buffer（scale=1 时像素等于画布逻辑尺寸）。 */
export function renderSnap(snap, { hud = false, scale = 1 } = {}) {
  const paint = paintOrdered(snap.scene, { hud })
  const img = renderPaintPng(paint, snap.canvasWidth, snap.canvasHeight, { ...IMAGE_ASSETS, scale })
  return {
    buf: Buffer.from(img.data, 'base64'),
    width: img.width,
    height: img.height,
    pixelWidth: img.pixelWidth,
    pixelHeight: img.pixelHeight,
  }
}

export function writeSnap(file, snap, opts = {}) {
  const img = renderSnap(snap, opts)
  mkdirp(dirname(file))
  writeFileSync(file, img.buf)
  return { ...img, file }
}

export function writeJson(file, value) {
  mkdirp(dirname(file))
  writeFileSync(file, JSON.stringify(value, null, 1))
  return file
}

export function writeText(file, text) {
  mkdirp(dirname(file))
  writeFileSync(file, text)
  return file
}

/** PNG Buffer → RGBA 像素（用于帧差与拼图；依赖 @napi-rs/canvas 的解码能力）。 */
export async function decodePng(buf) {
  const img = await CANVAS_LIB.loadImage(Buffer.isBuffer(buf) ? buf : Buffer.from(buf))
  const canvas = CANVAS_LIB.createCanvas(img.width, img.height)
  const ctx = canvas.getContext('2d')
  ctx.drawImage(img, 0, 0)
  const { data } = ctx.getImageData(0, 0, img.width, img.height)
  return { data, width: img.width, height: img.height }
}

/**
 * 帧间像素差。threshold = 单通道最大差（0..255），超过即算该像素变了。
 * 返回变化像素数、占比、变化外包框（画布坐标，左下原点）。
 */
export function diffRgba(prev, cur, { threshold = 8 } = {}) {
  if (!prev || !cur) return { ok: false, changed: 0, ratio: 0, total: 0, bbox: null }
  if (prev.width !== cur.width || prev.height !== cur.height) {
    return { ok: false, changed: 0, ratio: 0, total: 0, bbox: null, reason: 'size-mismatch' }
  }
  const a = prev.data
  const b = cur.data
  const { width, height } = cur
  let changed = 0
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < height; y++) {
    const row = y * width * 4
    for (let x = 0; x < width; x++) {
      const i = row + x * 4
      const d = Math.max(
        Math.abs(a[i] - b[i]),
        Math.abs(a[i + 1] - b[i + 1]),
        Math.abs(a[i + 2] - b[i + 2]),
        Math.abs(a[i + 3] - b[i + 3]),
      )
      if (d > threshold) {
        changed++
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  const total = width * height
  return {
    ok: true,
    changed,
    total,
    ratio: total ? changed / total : 0,
    bbox: maxX < 0 ? null : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 },
    size: { width, height },
  }
}

/**
 * 拼图：frames = [{ buf, label, sub }]；按 cols 排成网格，每格上方画帧号/时间标签。
 * 返回 { buf, width, height, cols, rows, tileWidth, tileHeight }。
 */
export async function composeGrid(frames, {
  cols = 4,
  gap = 6,
  labelH = 24,
  headerH = 34,
  header = '',
  scale = 1,
  background = '#0b1220',
  labelColor = '#d6e2f2',
  borderColor = '#2a3a52',
} = {}) {
  if (!frames.length) throw new Error('composeGrid: 空帧集')
  const decoded = []
  for (const f of frames) decoded.push({ ...f, img: await CANVAS_LIB.loadImage(Buffer.isBuffer(f.buf) ? f.buf : Buffer.from(f.buf)) })
  const tileWidth = Math.round(Math.max(...decoded.map((d) => d.img.width)) * scale)
  const tileHeight = Math.round(Math.max(...decoded.map((d) => d.img.height)) * scale)
  const n = decoded.length
  const c = Math.max(1, Math.min(cols, n))
  const rows = Math.ceil(n / c)
  const width = c * tileWidth + (c + 1) * gap
  const height = headerH + rows * (tileHeight + labelH) + (rows + 1) * gap
  const canvas = CANVAS_LIB.createCanvas(width, height)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = background
  ctx.fillRect(0, 0, width, height)
  ctx.fillStyle = labelColor
  ctx.font = '16px "Noto Sans CJK SC","WenQuanYi Micro Hei",sans-serif'
  ctx.textBaseline = 'middle'
  if (header) ctx.fillText(header, gap, headerH / 2 + 2)
  for (let i = 0; i < n; i++) {
    const r = Math.floor(i / c)
    const col = i % c
    const x = gap + col * (tileWidth + gap)
    const y = headerH + gap + r * (tileHeight + labelH + gap)
    ctx.fillStyle = labelColor
    ctx.font = '14px "Noto Sans CJK SC","WenQuanYi Micro Hei",sans-serif'
    ctx.fillText(decoded[i].label || `#${i}`, x + 1, y + labelH / 2 + 1)
    if (decoded[i].sub) {
      ctx.fillStyle = '#8fa6c4'
      ctx.font = '12px "Noto Sans CJK SC","WenQuanYi Micro Hei",sans-serif'
      const sub = decoded[i].sub
      const w = ctx.measureText(sub).width
      ctx.fillText(sub, x + tileWidth - w - 1, y + labelH / 2 + 1)
    }
    ctx.drawImage(decoded[i].img, x, y + labelH, tileWidth, tileHeight)
    ctx.strokeStyle = borderColor
    ctx.lineWidth = 1
    ctx.strokeRect(x + 0.5, y + labelH + 0.5, tileWidth - 1, tileHeight - 1)
  }
  return { buf: canvas.toBuffer('image/png'), width, height, cols: c, rows, tileWidth, tileHeight }
}

/** 在图上画审计框（红=fail 橙=warn），返回新 PNG。boxes: [{x,y,w,h,color,label}] 逻辑坐标（左下原点）。 */
export async function drawBoxes(buf, boxes, { scale = 1 } = {}) {
  const img = await CANVAS_LIB.loadImage(buf)
  const canvas = CANVAS_LIB.createCanvas(img.width, img.height)
  const ctx = canvas.getContext('2d')
  ctx.drawImage(img, 0, 0)
  ctx.textBaseline = 'top'
  for (const b of boxes) {
    const px = b.x * scale
    const py = (img.height / scale - b.y - b.h) * scale
    ctx.strokeStyle = b.color || '#ff4d4f'
    ctx.lineWidth = 2
    ctx.strokeRect(px, py, b.w * scale, b.h * scale)
    if (b.label) {
      ctx.font = '13px "Noto Sans CJK SC","WenQuanYi Micro Hei",sans-serif'
      const tw = ctx.measureText(b.label).width + 6
      ctx.fillStyle = 'rgba(10,16,26,0.82)'
      ctx.fillRect(px, Math.max(0, py - 17), tw, 17)
      ctx.fillStyle = b.color || '#ff4d4f'
      ctx.fillText(b.label, px + 3, Math.max(0, py - 17) + 1)
    }
  }
  return canvas.toBuffer('image/png')
}


/**
 * 存档新鲜度检查（v5 仪器必查项）：tetris.save.json 里内联的 lua 源码必须与 lua/ 目录当前文件一致。
 * 不同步 = 你测的是旧代码（本仪器实测踩过：copy/fx 未进存档 ⇒ skill fx=off copy=off 的假结论）。
 * 返回 { ok, stale:[{path, why}], checked }。
 */
export function checkSaveFreshness(save = null, root = PROJECT_ROOT) {
  const data = save || loadSave()
  const entries = []
  const walk = (value) => {
    if (Array.isArray(value)) return value.forEach(walk)
    if (!value || typeof value !== 'object') return
    if (typeof value.path === 'string' && value.path.startsWith('lua/') && typeof value.source === 'string') {
      entries.push(value)
      return
    }
    for (const key of Object.keys(value)) walk(value[key])
  }
  walk(data)

  // build 会把 `__GUID_CELL__` / `__GUID_HIT__` / `__GUID_SETTLE__` / `__GUID_STEXT__` 之类占位符
  // 替换成运行期数字（对 main.lua 与所有模块都做）⇒ 逐字节比必然假阳性。
  // 判据：逐行比；**只有磁盘行里出现占位符时**才把两侧数字抹平成 '#' 再比（行数不因替换变化）。
  const stripDigits = (line) => line.replace(/\d+/g, '#')
  const PLACEHOLDER = /__GUID_[A-Z0-9_]+__/
  const sameSource = (disk, source, { ignoreGuidLines = false } = {}) => {
    if (!ignoreGuidLines && disk === source) return true
    const a = disk.split('\n')
    const b = source.split('\n')
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) {
      if (a[i] === b[i]) continue
      if (PLACEHOLDER.test(a[i]) || PLACEHOLDER.test(b[i])) {
        if (stripDigits(a[i]) === stripDigits(b[i])) continue
      }
      return false
    }
    return true
  }

  const stale = []
  let checked = 0
  for (const entry of entries) {
    let disk = ''
    try { disk = readFileSync(join(root, entry.path), 'utf8') } catch { stale.push({ path: entry.path, why: '磁盘缺失' }); continue }
    checked++
    if (sameSource(disk, entry.source, { ignoreGuidLines: false })) continue
    // 二次机会：容忍"行数相同、差异全部落在占位符行"的情况（跨行占位符替换的极端形态）
    const diffLines = []
    const a = disk.split('\n')
    const b = entry.source.split('\n')
    const n = Math.max(a.length, b.length)
    for (let i = 0; i < n; i++) {
      if ((a[i] ?? '') === (b[i] ?? '')) continue
      if (PLACEHOLDER.test(a[i] ?? '') || PLACEHOLDER.test(b[i] ?? '')) continue
      diffLines.push(i + 1)
      if (diffLines.length >= 3) break
    }
    if (diffLines.length === 0) continue
    stale.push({
      path: entry.path,
      why: `内容不一致（存档 ${entry.source.length}B / 磁盘 ${disk.length}B，首个差异行 ${diffLines.join(',')}）`,
    })
  }
  return { ok: stale.length === 0, stale, checked }
}

export function isMain(metaUrl, argv = process.argv) {
  const entry = argv[1]
  if (!entry) return false
  try {
    return metaUrl === pathToFileURL(resolve(entry)).href
  } catch {
    return false
  }
}

// ── 直接运行 = 自检（证明这套共用层在本机可用）──────────────────────────────
if (isMain(import.meta.url)) {
  const ctx = openPlay('pc-16-9')
  ctx.step(50)
  const snap = ctx.get()
  const a = renderSnap(snap)
  ctx.step(1)
  const b = renderSnap(ctx.get())
  const da = await decodePng(a.buf)
  const db = await decodePng(b.buf)
  const diff = diffRgba(da, db)
  const grid = await composeGrid([
    { buf: a.buf, label: 'f000 t=0.000s' },
    { buf: b.buf, label: 'f001 t=0.033s' },
  ], { cols: 2, header: 'frame-strip 自检 · pc-16-9 title' })
  ctx.stop()
  writeSnap(join(PROJECT_ROOT, 'docs', 'shots', '_selfcheck', 'frame-strip.png'), snap)
  writeFileSync(join(PROJECT_ROOT, 'docs', 'shots', '_selfcheck', 'frame-strip.grid.png'), grid.buf)
  console.log(`自检 ok: 渲染 ${a.width}x${a.height} ${(a.buf.length / 1024).toFixed(1)}KB · 一帧帧差 changed=${diff.changed} ratio=${(diff.ratio * 100).toFixed(2)}% · 拼图 ${grid.width}x${grid.height}`)
}
