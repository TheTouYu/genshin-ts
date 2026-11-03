#!/usr/bin/env node
// 运行时实例 vs HUD 文字的**几何重叠**审计（左栏暂存列 / 预览列 与 hud/best/hint/hudNext）。
// 为什么需要它：`ui.lua` 的 auditPlan 只看 plan 里的 rect，而暂存/下一个方块是**运行时实例**
// （view_preview 描述出来的），从来没进过任何审计 ⇒ 2026-11-03 用户图一②「方块和文字重叠」
// 实测 PC 2204px²、手机 2×986px²，全套用例（75/75）当时全绿，因为没人量这两层的关系。
// 用法：node qxqy/audit-overlap.mjs [canvasId...]     退出码 0=无重叠
import { readFileSync } from 'node:fs'
import { createStudio } from '/home/h/miliastra-beyond-simulator/studio/index.js'

const root = '/home/h/genshin-ts/workspace/tetris'
const save = JSON.parse(readFileSync(root + '/tetris.save.json', 'utf8'))
const flat = (ns, out = []) => { for (const n of ns || []) { out.push(n); flat(n.children, out) } return out }

const TEXTS = ['ihud', 'ibest', 'ihint', 'ihudNext', 'ibotBanner', 'ikeyA', 'ikeyB']
const canvases = process.argv.slice(2).length ? process.argv.slice(2) : ['pc-16-9', 'mobile-16-9', 'mobile-19.5-9']

let worst = 0
for (const canvasId of canvases) {
  for (const [zone, label] of [['menuZone1', '单盘'], ['menuZone2', '双盘']]) {
    const s = createStudio(save, { workspacePath: root })
    s.playStart({ canvasId })
    const step = (n) => { for (let i = 0; i < n; i++) s.playStep(1 / 30, { observe: false }) }
    const tree = () => flat(s.playGet({ inspect: true }).tree || [])
    step(75)
    const z = tree().find((n) => n.name === zone)
    if (!z) { s.playStop(); continue }
    const x = z.box.left + z.box.width / 2, y = z.box.bottom + z.box.height / 2
    s.playPointer('move', x, y, { observe: false }); step(1)
    s.playPointer('down', x, y, { observe: false }); step(2)
    s.playPointer('up', x, y, { observe: false }); step(45)
    // 按一次暂存，让 HOLD 槽里真的有一颗方块（空槽会停到画布外，量不到重叠）
    s.playKey('KeyboardCraftspersonKey14Down'); step(2)
    s.playKey('KeyboardCraftspersonKey14Up'); step(20)
    const H = s.playGet({}).canvasHeight
    const box = (nm) => {
      const n = tree().find((t) => t.name === nm)
      if (!n || !n.box || n.box.left <= -1000) return null
      return { name: nm, x0: n.box.left, x1: n.box.left + n.box.width,
        y0: H - (n.box.bottom + n.box.height), y1: H - n.box.bottom }
    }
    const blocks = []
    for (const pre of ['hold', 'next']) {
      for (let k = 1; k <= 8; k++) { const b = box(pre + k); if (b) blocks.push(b) }
    }
    // 倒计时大字（buildCountBig：560×250 @ 画布中心）也是会盖住文字的实例，一并量
    const cnt = box('countBig')
    if (cnt) blocks.push(cnt)
    const texts = TEXTS.map(box).filter(Boolean)
    const hits = []
    for (const b of blocks) {
      for (const t of texts) {
        const ox = Math.min(b.x1, t.x1) - Math.max(b.x0, t.x0)
        const oy = Math.min(b.y1, t.y1) - Math.max(b.y0, t.y0)
        if (ox > 0 && oy > 0) hits.push({ b: b.name, t: t.name, area: Math.round(ox * oy) })
      }
    }
    const area = hits.reduce((a, h) => a + h.area, 0)
    if (area > worst) worst = area
    const tag = area > 0 ? '!! FAIL' : 'ok'
    console.log(`${tag}  ${canvasId} ${label}  重叠 ${hits.length} 对 / ${area}px²` +
      (hits.length ? '  ' + hits.map((h) => `${h.b}:${h.t}=${h.area}`).join(' ') : ''))
    s.playStop()
  }
}
console.log(worst === 0 ? 'OVERLAP-PASS 最大重叠 0px²' : `OVERLAP-FAIL 最大重叠 ${worst}px²`)
process.exit(worst === 0 ? 0 : 1)
