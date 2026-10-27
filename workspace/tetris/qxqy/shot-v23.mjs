#!/usr/bin/env node
// v2.3+ 视觉验收出图：标题页 / 双人对战 / 结算页（真实模拟器渲染）。
// 用法：node qxqy/shot-v23.mjs [title|pvp|settle|all]
// 判据：每张 >20KB 且非全黑；每个 textbox 的 textLayout.fits 必须为 true（框高硬判据 h>=1.45*size+4）。
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createStudio } from '/home/h/miliastra-beyond-simulator/studio/index.js'
import { renderScenePng } from '/home/h/miliastra-beyond-simulator/studio/host-png.js'
import { sharedImageAssets } from '/home/h/miliastra-beyond-simulator/studio/host/image-assets.js'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const save = JSON.parse(readFileSync(join(root, 'tetris.save.json'), 'utf8'))
const assets = sharedImageAssets()
const only = process.argv[2] || 'all'
const want = (name) => only === 'all' || only === name

function open(canvasId) {
  const s = createStudio(save, { workspacePath: root })
  s.playStart({ canvasId })
  const step = (n) => { for (let i = 0; i < n; i++) s.playStep(1 / 30, { observe: false }) }
  const key = (typeName) => s.playKey(typeName, { observe: false })
  const press = (base) => { key(base + 'Down'); step(1); key(base + 'Up') }
  const get = () => s.playGet({ view: true })
  const shot = (name) => {
    const snap = get()
    const img = renderScenePng(snap.scene, snap.canvasWidth, snap.canvasHeight, assets)
    const buf = Buffer.from(img.data, 'base64')
    writeFileSync(join(root, 'docs', name), buf)
    const logs = (snap.logs || []).map((l) => l.text)
    console.log(`\n▶ docs/${name}  ${img.width}x${img.height}  ${(buf.length / 1024).toFixed(1)}KB  末条日志=${logs[logs.length - 1] || '-'}`)
    audit(snap.scene)
    return snap
  }
  return { s, step, key, press, get, shot }
}

// 可读性审计：textLayout.fits=false ⇒ 渲染器整行不画/裁切（视觉事故的机器判据）
function audit(scene) {
  const rows = []
  for (const n of scene.nodes || []) {
    if (n.kind !== 'textbox' || !n.text) continue
    const tl = n.textLayout || {}
    const text = String(n.text)
    const need = (n.fontSize || 0) * 1.45 + 4
    const bad = tl.fits === false || (n.sourceHeight != null && n.sourceHeight < need)
    const clipped = tl.textWidth != null && n.sourceWidth != null && tl.textWidth > n.sourceWidth - 4
    if (bad || clipped) {
      rows.push(`  ✗ ${n.name} size=${n.fontSize} 框=${n.sourceWidth}x${n.sourceHeight} 需高=${need.toFixed(1)} ` +
        `fits=${tl.fits} 文本宽=${tl.textWidth}/${n.sourceWidth} 「${text}」`)
    }
  }
  console.log(rows.length ? rows.join('\n') : '  ✓ 全部 textbox 通过框高/宽度判据')
}

// ── ① 标题页 ────────────────────────────────────────────────────────────────
if (want('title')) {
  const { step, press, shot, s } = open('mobile-16-9')
  step(60)                                    // 2s：标题 26→40 渐大已收尾，AI 自演堆了几块
  shot('v23-title.png')
  step(40)
  shot('v23-title-b.png')                     // 1.33s 后：看底栏动效是否在推进（两帧应不同）
  // 模式名动画窗（0.5s）：展台标题实例变成模式名大字 26→64
  // 注意：手机画布（mobile-16-9）上 Digit2-4 被裁决⑨关掉，只能用 Key1（休闲）
  press('KeyboardCraftspersonKey1')
  step(9)
  shot('v23-title-pending.png')
  s.playStop()
}

// ── ② 双人对战（双屏）────────────────────────────────────────────────────────
if (want('pvp')) {
  const { step, press, shot, get, s } = open('pc-16-9')   // 手机画布 Digit2-4 被裁决⑨关掉，双屏只能在 PC 画布取证
  press('KeyboardCraftspersonKey3')
  step(24)                                    // 模式名动画窗 0.5s
  shot('v23-pvp-guide.png')                   // 键位说明态（引导第一屏）
  press('KeyboardCraftspersonKey36')          // 任意键确认 → 3-2-1
  step(100)                                   // 3s 倒计时
  const logs = (get().logs || []).map((l) => l.text)
  console.log('  guide 日志：', logs.filter((t) => t.startsWith('guide')).slice(-4).join(' | '))
  step(30)                                    // 开局 1s：两盘各落几块
  shot('v23-pvp.png')
  s.playStop()
}

// ── ③ 结算页 ────────────────────────────────────────────────────────────────
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
  step(12)                                    // 0.4s：遮罩淡入 + 标题下滑中
  shot('v23-settle-anim.png')
  step(24)                                    // 再 0.8s：四段动画收尾（0.9s）
  shot('v23-settle.png')
  s.playStop()
}
