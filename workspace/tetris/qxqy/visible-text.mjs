#!/usr/bin/env node
// 双盘可见文字清单（对比两端"该有的信息在不在"）
// 用法：node qxqy/visible-text.mjs
import { readFileSync } from 'node:fs'
import { createStudio } from '/home/h/miliastra-beyond-simulator/studio/index.js'
const root = '/home/h/genshin-ts/workspace/tetris'
const save = JSON.parse(readFileSync(root + '/tetris.save.json', 'utf8'))
for (const canvasId of ['pc-16-9', 'mobile-16-9']) {
  const s = createStudio(save, { workspacePath: root })
  s.playStart({ canvasId })
  const step = (n) => { for (let i = 0; i < n; i++) s.playStep(1 / 30, { observe: false }) }
  const flat = (ns, out = []) => { for (const n of ns || []) { out.push(n); flat(n.children, out) } return out }
  const byName = (nm) => flat(s.playGet({ inspect: true }).tree || []).find((n) => n.name === nm)
  step(75)
  const z = byName('menuZone2')   // AI 对抗 = 双盘
  const x = z.box.left + z.box.width / 2, y = z.box.bottom + z.box.height / 2
  s.playPointer('move', x, y, { observe: false }); step(1)
  s.playPointer('down', x, y, { observe: false }); step(2)
  s.playPointer('up', x, y, { observe: false }); step(30)
  const W = s.playGet({}).canvasWidth, H = s.playGet({}).canvasHeight
  const rows = flat(s.playGet({ inspect: true }).tree || [])
    .filter((n) => n.kind === 'textbox' && n.visible && n.activeInHierarchy)
    .map((n) => ({ name: n.name, text: n.text, x: n.box && n.box.left, y: n.box && n.box.bottom }))
    .filter((r) => r.x > -1000 && r.y > -1000)   // 画布内的（parked 的在 -4000）
  console.log('=== ' + canvasId + ' 双盘可见文字 ' + rows.length + ' 条 ===')
  for (const r of rows) console.log('  ' + String(r.name).padEnd(12) + ' [' + r.x + ',' + r.y + '] ' + JSON.stringify(r.text))
  s.playStop()
}
