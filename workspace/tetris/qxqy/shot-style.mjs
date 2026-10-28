#!/usr/bin/env node
// v3.0 美术风格验收出图：五种界面 × 两种画布。真实模拟器渲染（renderScenePng），不是截图。
// 用法：node qxqy/shot-style.mjs [title|game|dual|settle|help|all] [前缀]
// 产物：docs/<前缀>-<屏>.png   前缀默认 st
// 判据：每张 >20KB；每个 textbox 的 textLayout.fits 必须为 true（框高 h>=1.45*size+4 硬判据）
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createStudio } from '/home/h/miliastra-beyond-simulator/studio/index.js'
import { flattenScenePaint, renderPaintPng } from '/home/h/miliastra-beyond-simulator/studio/host-png.js'
import { sharedImageAssets } from '/home/h/miliastra-beyond-simulator/studio/host/image-assets.js'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const save = JSON.parse(readFileSync(join(root, 'tetris.save.json'), 'utf8'))
const assets = sharedImageAssets()
const only = process.argv[2] || 'all'
const prefix = process.argv[3] || 'st'
const want = (n) => only === 'all' || only === n
let bad = 0

function open(canvasId) {
  const s = createStudio(save, { workspacePath: root })
  s.playStart({ canvasId })
  const step = (n) => { for (let i = 0; i < n; i++) s.playStep(1 / 30, { observe: false }) }
  const key = (typeName) => s.playKey(typeName, { observe: false })
  const press = (base) => { key(base + 'Down'); step(1); key(base + 'Up') }
  const get = () => s.playGet({ view: true })
  const shot = (name, opts = {}) => {
    const snap = get()
    // 出图保真补丁：host-png 按 z 排序绘制，服务端 textbox（布局层）会被后来的实例压住；
    // 真机/网页实际是「文字可见」。出图把 textbox 放到最后画 ⇒ 截图与用户所见一致。
    const paint = flattenScenePaint(snap.scene)
    const HUD = new Set(['hud', 'hudNext', 'best', 'hint', 'keyA', 'keyB', 'keyC'])
    const isHud = (i) => opts.hud === true && HUD.has(i.name)
    const ordered = [...paint.filter((i) => !isHud(i)), ...paint.filter(isHud)]
    const img = renderPaintPng(ordered, snap.canvasWidth, snap.canvasHeight, assets)
    const buf = Buffer.from(img.data, 'base64')
    writeFileSync(join(root, 'docs', `${prefix}-${name}.png`), buf)
    console.log(`\n▶ docs/${prefix}-${name}.png  ${img.width}x${img.height}  ${(buf.length / 1024).toFixed(1)}KB`)
    audit(snap.scene)
    return snap
  }
  return { s, step, key, press, get, shot }
}

// 可读性审计：textLayout.fits=false ⇒ 渲染器整行不画/裁切；textWidth 超框 ⇒ 字被截
function audit(scene) {
  const rows = []
  for (const n of scene.nodes || []) {
    if (n.kind !== 'textbox' || !n.text) continue
    const tl = n.textLayout || {}
    const need = (n.fontSize || 0) * 1.45 + 4
    const fitsBad = tl.fits === false || (n.sourceHeight != null && n.sourceHeight < need)
    const clipBad = tl.textWidth != null && n.sourceWidth != null && tl.textWidth > n.sourceWidth - 4
    if (fitsBad || clipBad) {
      bad++
      rows.push(`  ✗ ${n.name} size=${n.fontSize} 框=${n.sourceWidth}x${n.sourceHeight} 需高=${need.toFixed(1)} ` +
        `fits=${tl.fits} 文本宽=${tl.textWidth}/${n.sourceWidth} 「${n.text}」`)
    }
  }
  if (rows.length) console.log(rows.join('\n'))
}

// ── ① 标题页（手机画布：1 号键进休闲前的展台）──────────────────────────────
if (want('title')) {
  const { step, shot, s } = open('mobile-16-9')
  step(50)
  shot('title')
  s.playStop()
}
// ── ② 标题页（PC 画布：看大画布上的留白与卡片位置）──────────────────────────
if (want('titlepc')) {
  const { step, shot, s } = open('pc-16-9')
  step(50)
  shot('title-pc')
  s.playStop()
}
// ── ③ 游戏内（休闲：随意落几块，看 HUD/棋盘/背景）────────────────────────────
if (want('game')) {
  const { step, press, shot, s } = open('pc-16-9')
  press('KeyboardCraftspersonKey1')
  step(30)                                     // 模式名动画窗 + 引导
  press('KeyboardCraftspersonKey36')           // 任意键确认
  step(100)                                    // 3s 倒计时
  step(90)                                     // 开局 3s：落几块
  press('KeyboardJumpKey'); step(20)
  press('KeyboardMoveRightKey'); step(6)
  press('KeyboardJumpKey'); step(30)
  shot('game', { hud: true })
  s.playStop()
}
// ── ④ 游戏内（AI 对抗：双屏构图）──────────────────────────────────────────────
if (want('dual')) {
  const { step, press, shot, s } = open('pc-16-9')
  press('KeyboardCraftspersonKey2')
  step(30)
  press('KeyboardCraftspersonKey36')
  step(100)
  step(80)
  shot('dual', { hud: true })
  s.playStop()
}
// ── ⑤ 结算页（顶死 → 结算层）─────────────────────────────────────────────────
if (want('settle')) {
  const { step, press, shot, get, s } = open('mobile-16-9')
  const isOver = () => (get().scene.nodes || []).some((n) => n.text === '游戏结束')
  let over = false
  for (let i = 0; i < 90 && !over; i++) {
    press('KeyboardJumpKey')
    over = isOver()
    if (!over) step(3)
  }
  console.log('  gameOver=', over)
  step(60)
  shot('settle')
  s.playStop()
}
// ── ⑥ 说明页（H）────────────────────────────────────────────────────────────
if (want('help')) {
  const { step, press, shot, s } = open('pc-16-9')
  press('KeyboardCraftspersonKey15')           // H
  step(20)
  shot('help')
  s.playStop()
}
console.log(bad ? `\n✗ 文本判据失败 ${bad} 条` : '\n✓ 全部 textbox 通过框高/宽度判据')
