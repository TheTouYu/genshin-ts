#!/usr/bin/env node
// 浮层期间游戏是否真的暂停（角色页/说明页各 3 秒内数游戏 tick）
// 用法：node qxqy/probe-freeze.mjs
import { readFileSync } from 'node:fs'
import { createStudio } from '/home/h/miliastra-beyond-simulator/studio/index.js'
const root = '/home/h/genshin-ts/workspace/tetris'
const save = JSON.parse(readFileSync(root + '/tetris.save.json', 'utf8'))
const s = createStudio(save, { workspacePath: root })
s.playStart({ canvasId: 'mobile-16-9' })
const step = (n) => { for (let i = 0; i < n; i++) s.playStep(1 / 30, { observe: false }) }
const flat = (ns, out = []) => { for (const n of ns || []) { out.push(n); flat(n.children, out) } return out }
const byName = (nm) => flat(s.playGet({ inspect: true }).tree || []).find((n) => n.name === nm)
const click = (nm) => { const n = byName(nm); if (!n) return false
  const x = n.box.left + n.box.width / 2, y = n.box.bottom + n.box.height / 2
  s.playPointer('move', x, y, { observe: false }); step(1)
  s.playPointer('down', x, y, { observe: false }); step(2)
  s.playPointer('up', x, y, { observe: false }); step(4); return true }
const marks = () => (s.playGet({}).logs || []).map((r) => String(r.text ?? r))
const moveCount = () => marks().filter((l) => /^(fall y=|move x=|demo act|lock )/.test(l)).length
step(75); click('menuZone1'); step(10)
s.playKey('KeyboardJumpKeyDown', { observe: false }); step(1); s.playKey('KeyboardJumpKeyUp', { observe: false }); step(30)
const before = moveCount()
click('phnroster'); step(90)     // 角色页开 3 秒
const afterRoster = moveCount()
click('phnclose'); step(10)
click('phnhelp'); step(90)
const afterHelp = moveCount()
click('phnhelp'); step(10)
console.log(JSON.stringify({ before, afterRoster, afterHelp, gameTicksDuringRoster: afterRoster - before, gameTicksDuringHelp: afterHelp - afterRoster }))
const logs = (s.playGet({}).logs || []).map((r) => String(r.text ?? r))
console.log('pause marks:', logs.filter((l) => /pause|screen=roster|screen=help/.test(l)).slice(-4))
s.playStop()
