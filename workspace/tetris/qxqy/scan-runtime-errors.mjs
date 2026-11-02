#!/usr/bin/env node
// 扫描全部用例的 Lua 运行时错误（lua-error / invalid object / attempt to ...）
// 用法：node qxqy/scan-runtime-errors.mjs
import { readFileSync, readdirSync } from 'node:fs'
import { createStudio } from '/home/h/miliastra-beyond-simulator/studio/index.js'
const root = '/home/h/genshin-ts/workspace/tetris'
const save = JSON.parse(readFileSync(root + '/tetris.save.json', 'utf8'))
const dir = root + '/tests'
const files = readdirSync(dir).filter((f) => f.endsWith('.json')).sort()
const bad = []
for (const f of files) {
  const tc = JSON.parse(readFileSync(dir + '/' + f, 'utf8'))
  const s = createStudio(save, { workspacePath: root })
  let logs = []
  try {
    const rep = s.playRunCase(tc, { canvasId: tc.canvasId || 'mobile-16-9' })
    logs = (rep.snapshot?.logs || []).map((r) => String(r.text ?? r))
  } catch (e) { bad.push([f, 'THROW ' + e.message]) }
  try { s.playStop() } catch {}
  for (const l of logs) if (/lua-error|invalid object|attempt to (index|call|perform)/.test(l)) bad.push([f, l])
}
console.log('扫描用例', files.length, '条；异常行', bad.length)
for (const b of bad.slice(0, 15)) console.log('  ', b[0], '::', b[1])
