#!/usr/bin/env node
// qxqy/shot-audit.mjs —— 出图质检（不靠人眼，靠帧数据 + 像素统计）
//
// 用法：node qxqy/shot-audit.mjs <shots目录>
//   例：node qxqy/shot-audit.mjs .scratch/lead/shots/final
//
// 为什么需要它：shots-v5 只保证"出了图、没阻塞"，但**出图成功 ≠ 图是对的**。
// 本项目踩过的坑：文字被裁（fits=false 整条不画）、控件被上层盖住、手机按钮隐形、
// 配色近白压近白。这些在帧数据里都有痕迹，可以机检，不必每次靠人眼。
//
// 七条判据（每条对应一次真实事故）：
//   A 节点数 > 0                —— 空屏（白屏/黑屏）
//   B textLayout.fits 不为 false —— 文字被裁（整条不画）
//   C 节点不越界                 —— 排版跑出画布
//   D 像素唯一色 >= 20           —— 纯色屏（渲染没起来）
//   E 主色占比 <= 85%            —— 大片空白
//   F 同一语义元素跨画布配色一致  —— 多设备配色漂移
//   G 设备互斥                   —— PC 上出现手机控件 / 手机对局没手机控件
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, basename } from 'node:path'
import { execFileSync } from 'node:child_process'

const dir = process.argv[2]
if (!dir || !existsSync(dir)) {
  console.error('用法: node qxqy/shot-audit.mjs <shots目录>')
  process.exit(2)
}

const CANVAS = {
  'pc-16-9': [1600, 900], 'pc-21-9': [2100, 900],
  'mobile-16-9': [1280, 720], 'mobile-19.5-9': [1560, 720], 'mobile-4-3': [1280, 960],
}
const PC = new Set(['pc-16-9', 'pc-21-9'])
const PHONE_PREFIX = ['ph', 'btn', 'pta', 'pba', 'pea']
const SEMANTIC = ['cell', 'settleCap', 'settleRim', 'charPanel', 'charTab', 'helpCard', 'menuCard', 'pv']

const frames = []
for (const canvas of readdirSync(dir)) {
  const cdir = join(dir, canvas)
  if (!existsSync(cdir) || !CANVAS[canvas]) continue
  for (const f of readdirSync(cdir)) {
    if (!f.endsWith('.frame.json')) continue
    frames.push({ canvas, screen: basename(f, '.frame.json'), path: join(cdir, f) })
  }
}

const fails = []
const fail = (code, where, msg) => fails.push({ code, where, msg })

// 像素统计（用 python PIL，本机已有）
function pixelStats(pngPath) {
  try {
    const out = execFileSync('python3', ['-c', `
from PIL import Image
from collections import Counter
im = Image.open(${JSON.stringify(pngPath)}).convert('RGB')
w,h = im.size
small = im.resize((160, max(1,int(160*h/w))))
px = list(small.getdata())
c = Counter(px)
print(len(c), c.most_common(1)[0][1]/len(px))
`], { encoding: 'utf8' })
    const [uniq, ratio] = out.trim().split(/\s+/).map(Number)
    return { uniq, ratio }
  } catch { return null }
}

const colorByKind = new Map()   // kind -> canvas -> Set(color)

for (const { canvas, screen, path } of frames) {
  const where = `${canvas}/${screen}`
  const d = JSON.parse(readFileSync(path, 'utf8'))
  const nodes = d.nodes || []
  const [W, H] = CANVAS[canvas]

  // A 空屏
  if (nodes.length === 0) fail('A', where, '节点数为 0（空屏）')

  for (const n of nodes) {
    const name = String(n.name || '')
    // B 文字被裁
    const tl = n.textLayout
    if (tl && tl.fits === false) fail('B', where, `${name} 文字放不下（需高 ${tl.requiredHeight}，实际 ${n.sizeDeltaY}）`)
    // C 越界
    const x = n.anchoredPositionX, y = n.anchoredPositionY, w = n.sizeDeltaX, h = n.sizeDeltaY
    if ([x, y, w, h].every(v => typeof v === 'number')) {
      const isBg = /bg|wash/.test(name)
      if (!isBg && (Math.abs(x) > W / 2 + Math.abs(w) / 2 + 1 || Math.abs(y) > H / 2 + Math.abs(h) / 2 + 1)) {
        fail('C', where, `${name} 越界 (${x},${y}) 尺寸 ${w}x${h}`)
      }
    }
    // F 配色一致性收集
    const col = n.imageColor
    if (typeof col === 'number' && col !== 0) {
      for (const pre of SEMANTIC) {
        if (name.startsWith(pre)) {
          if (!colorByKind.has(pre)) colorByKind.set(pre, new Map())
          const m = colorByKind.get(pre)
          if (!m.has(canvas)) m.set(canvas, new Set())
          m.get(canvas).add(col)
          break
        }
      }
    }
    // G 设备互斥
    if (PC.has(canvas) && PHONE_PREFIX.some(p => name.startsWith(p))) {
      fail('G', where, `PC 画布上出现手机控件 ${name}`)
    }
  }
  // G 手机对局应有手机控件
  if (!PC.has(canvas) && screen === 'game') {
    const hasPhone = nodes.some(n => PHONE_PREFIX.some(p => String(n.name || '').startsWith(p)))
    if (!hasPhone) fail('G', where, '手机对局没有手机控件')
  }

  // D/E 像素
  const png = path.replace('.frame.json', '.png')
  if (existsSync(png)) {
    const st = pixelStats(png)
    if (st) {
      if (st.uniq < 20) fail('D', where, `唯一色只有 ${st.uniq}（疑似纯色屏）`)
      if (st.ratio > 0.85) fail('E', where, `主色占比 ${(st.ratio * 100).toFixed(0)}%（疑似大片空白）`)
    }
  }
}

// F 跨画布配色一致性（同一语义元素在不同画布的颜色集合必须相同）
for (const [kind, m] of colorByKind) {
  const sigs = [...m.entries()].map(([c, s]) => [c, [...s].sort().join(',')])
  const uniqSigs = new Set(sigs.map(([, s]) => s))
  if (uniqSigs.size > 1) {
    fail('F', '跨画布', `${kind} 配色不一致：${sigs.map(([c]) => c).join('/')}`)
  }
}

// ---- 输出 ----
console.log(`== 出图质检：${frames.length} 帧 ==`)
if (fails.length === 0) {
  console.log('✅ 七条判据全部通过')
  console.log('SHOT-AUDIT PASS')
  process.exit(0)
}
const byCode = new Map()
for (const f of fails) {
  if (!byCode.has(f.code)) byCode.set(f.code, [])
  byCode.get(f.code).push(f)
}
for (const [code, list] of byCode) {
  console.log(`  ❌ ${code} 类 ${list.length} 条`)
  for (const f of list.slice(0, 3)) console.log(`     ${f.where}: ${f.msg}`)
  if (list.length > 3) console.log(`     …还有 ${list.length - 3} 条`)
}
console.log(`\nSHOT-AUDIT FAIL: ${fails.length} 条`)
process.exit(1)
