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
  for (const l of logs) {
    if (/lua-error|invalid object|attempt to (index|call|perform)/.test(l)) bad.push([f, l])
    // 🔴 v6.24 配置漂移信号：`tpl X scan ok` 表示**候选表没命中**、靠兜底扫描救回来。
    // 真机日志 2026-11-16 那次就是这条路径掩盖了 config 键名写错（stext≠settleText）。
    // 构建期 config 与存档 guid 本应完全一致 ⇒ 出现 scan ok 即配置/构建漂移，必须红。
    else if (/tpl [A-Za-z0-9_]+ scan ok/.test(l)) bad.push([f, 'CONFIG-DRIFT ' + l])
    // 候选表为空 = 键名不匹配（比 scan ok 更早的失败点）
    else if (/tpl [A-Za-z0-9_]+ cands=0/.test(l)) bad.push([f, 'TPL-KEY-MISS ' + l])
  }
}
console.log('扫描用例', files.length, '条；异常行', bad.length)
for (const b of bad.slice(0, 15)) console.log('  ', b[0], '::', b[1])
