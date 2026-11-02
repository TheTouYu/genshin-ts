#!/usr/bin/env node
// 生产验收出图：桌面 4 模式 + 手机 casual/ai-battle + 手机「请回 PC」浮层 ×2 = 6 张。
// 手机 pvp/coop 不是缺陷：v5.0 设计就是拦下来给引导浮层（menuSelectMode i>=3 and IS_MOBILE）。
// 用法：node qxqy/shots-production.mjs [outDir]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createStudio } from '/home/h/miliastra-beyond-simulator/studio/index.js'
import { renderScenePng } from '/home/h/miliastra-beyond-simulator/studio/host-png.js'
import { sharedImageAssets } from '/home/h/miliastra-beyond-simulator/studio/host/image-assets.js'

const root = '/home/h/genshin-ts/workspace/tetris'
const outDir = process.argv[2] || root + '/.scratch/lead/prod'
mkdirSync(outDir, { recursive: true })
const save = JSON.parse(readFileSync(root + '/tetris.save.json', 'utf8'))
const assets = sharedImageAssets()

const flat = (ns, out = []) => { for (const n of ns || []) { out.push(n); flat(n.children, out) } return out }

function run(canvasId, fn) {
  const s = createStudio(save, { workspacePath: root })
  s.playStart({ canvasId })
  const step = (n) => { for (let i = 0; i < n; i++) s.playStep(1 / 30, { observe: false }) }
  const tree = () => flat(s.playGet({ inspect: true }).tree || [])
  const byName = (nm) => tree().find((n) => n.name === nm)
  const shot = (name) => {
    const snap = s.playGet({ view: true })
    writeFileSync(`${outDir}/${name}.png`,
      Buffer.from(renderScenePng(snap.scene, snap.canvasWidth, snap.canvasHeight, assets).data, 'base64'))
    const rows = tree().filter((n) => n.kind === 'textbox' && n.visible && n.activeInHierarchy && n.box
      && n.box.left > -1000 && n.box.bottom > -1000)
    return rows.map((n) => n.name + '=' + JSON.stringify(n.text)).join(' | ')
  }
  const click = (nm) => {
    const n = byName(nm); if (!n) return false
    const x = n.box.left + n.box.width / 2, y = n.box.bottom + n.box.height / 2
    s.playPointer('move', x, y, { observe: false }); step(1)
    s.playPointer('down', x, y, { observe: false }); step(2)
    s.playPointer('up', x, y, { observe: false }); step(6)
    return true
  }
  const out = fn({ s, step, shot, click, byName, logs: () => (s.playGet({}).logs || []).map((r) => String(r.text ?? r)) })
  const logs = (s.playGet({}).logs || []).map((r) => String(r.text ?? r))
  const errs = logs.filter((l) => /lua-error|invalid object|attempt to /.test(l))
  s.playStop()
  return { out, errs, mode: logs.filter((l) => /^mode=/.test(l)).pop() }
}

const results = []
// 桌面 4 模式
for (const [i, tag] of [[1, 'casual'], [2, 'ai-battle'], [3, 'pvp'], [4, 'coop']]) {
  results.push(['pc-16-9/' + tag, run('pc-16-9', ({ step, shot, click }) => {
    step(75); click('menuZone' + i); step(60)
    return shot('pc-' + tag)
  })])
}
// 手机：casual + ai-battle
results.push(['mobile-16-9/casual', run('mobile-16-9', ({ step, shot, click }) => {
  step(75); click('menuZone1'); step(60); return shot('mobile-casual')
})])
results.push(['mobile-16-9/ai-battle', run('mobile-16-9', ({ step, shot, click }) => {
  step(75); click('menuZone2'); step(60); return shot('mobile-ai-battle')
})])
// 手机：请回 PC 浮层（pvp / coop 各一次 = 设计行为，不是缺陷）
for (const [i, tag] of [[3, 'pvp'], [4, 'coop']]) {
  results.push(['mobile-16-9/note-' + tag, run('mobile-16-9', ({ step, shot, click }) => {
    step(75); click('menuZone' + i); step(30); return shot('mobile-note-' + tag)
  })])
}

let bad = 0
for (const [tag, r] of results) {
  const flag = r.errs.length ? '  ❌ ' + r.errs[0] : ''
  if (r.errs.length) bad += 1
  console.log(tag.padEnd(26), (r.mode || '').padEnd(22), flag)
  console.log('   ' + (r.out || '').slice(0, 300))
}
console.log('\n出图 ' + results.length + ' 张；带 Lua 运行时错误的 ' + bad + ' 张 → ' + outDir)
process.exit(bad ? 1 : 0)
