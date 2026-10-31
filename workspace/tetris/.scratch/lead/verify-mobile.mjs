// 手机端全流程渲染核验：标题→局内→开/关说明→开/关角色页
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createStudio } from '/home/h/miliastra-beyond-simulator/studio/index.js'
import { flattenScenePaint, renderPaintPng } from '/home/h/miliastra-beyond-simulator/studio/host-png.js'
import { sharedImageAssets } from '/home/h/miliastra-beyond-simulator/studio/host/image-assets.js'
const root = '/home/h/genshin-ts/workspace/tetris'
const save = JSON.parse(readFileSync(root + '/tetris.save.json', 'utf8'))
const A = sharedImageAssets()
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d }
const canvas = arg('canvas', 'mobile-4-3')
const out = arg('out', '/tmp/verify-' + canvas)
mkdirSync(out, { recursive: true })
const s = createStudio(save, { workspacePath: root })
try { s.playStart({ canvasId: canvas, device: 'Mobile' }) } catch (e) { console.log('start warn', e.message) }
const step = (n) => { for (let i = 0; i < n; i++) s.playStep(1 / 30, { observe: false }) }
const press = (k) => { s.playKey(k + 'Down', { observe: false }); step(1); s.playKey(k + 'Up', { observe: false }) }
const shot = (name) => {
  const sn = s.playGet({ view: true })
  writeFileSync(`${out}/${name}.png`, Buffer.from(renderPaintPng(flattenScenePaint(sn.scene), sn.canvasWidth, sn.canvasHeight, A).data, 'base64'))
  const texts = (sn.scene.nodes || []).filter(n => n.kind === 'textbox' && String(n.text || '').trim()).length
  console.log(`${name}  ${sn.canvasWidth}x${sn.canvasHeight}  textbox有字=${texts}`)
}
const H = 'KeyboardCraftspersonKey15', I = 'KeyboardCraftspersonKey16'
step(40); shot('1-title')
press('KeyboardCraftspersonKey1'); step(120); shot('2-game')
press(H); step(20); shot('3-help')
press(H); step(25); shot('4-help-back')
press(I); step(25); shot('5-roster')
press(I); step(25); shot('6-roster-back')
const logs = (s.playGet({}).logs || []).map(r => String(r.text ?? r))
console.log('pad logs:', logs.filter(t => /pad visible|phone layout/.test(t)).slice(-3))
s.playStop()
