// g4-art.mjs — G4 美术与反馈 组判据（rubik-game，2026-09-09）
// 断言：UI 31 控件在位（两悬浮页+HUD）；美术三元件闭包+三实例+组件；rgWin 注入挂载；图预算。
// 用法：node g4-art.mjs   （全绿 exit 0；任一红 exit 1）
import { execFileSync } from 'node:child_process'

const GIL = '/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/110170759/Beyond_Local_Save_Level/1073741920.gil'
const GSTS = '/home/h/genshin-ts/bin/gsts.mjs'
const fails = []
const ok = (name) => console.log(`[ok] ${name}`)
const bad = (name, detail) => {
  console.error(`[FAIL] ${name} ${detail ?? ''}`)
  fails.push(name)
}
const run = (args) => execFileSync('node', [GSTS, ...args], { cwd: '/home/h/genshin-ts', encoding: 'utf8' })

// 1) UI 控件（2026-09-09 零差分集）
const ui = run(['assets:ui', 'list', '--gil', GIL])
const cnt = (re) => (ui.match(re) ?? []).length
const uiWant = [
  ['fpage', /\[floating-page\] /g, 2],
  ['tab', /\[tab\] /g, 1],
  ['tab-page', /tab-page/g, 3],
  ['textbox', /\[textbox\] /g, 4],
  ['custom-button', /custom-button/g, 25]
]
for (const [name, re, want] of uiWant) {
  if (cnt(re) === want) ok(`ui ${name}=${want}`)
  else bad('ui', `${name} got=${cnt(re)} want=${want}`)
}
for (const nm of ['残局挑战', '结算', '开始挑战', '关卡名', '步数', '再来一局', '下一关', '返回选关', '提示', '重开', '菜单']) {
  if (ui.includes(nm)) ok(`ui ${nm}`)
  else bad('ui-name', nm)
}

// 2) 美术三元件+三实例+组件
const asm = JSON.parse(run(['assets:static-assemblies', 'inspect', '--gil', GIL, '--format', 'json']))
const asmIds = new Set([...(asm.definitions ?? []), ...(asm.instances ?? [])].map((a) => a.prefabId ?? a.id))
for (const id of [1077936350, 1077936351, 1077936352]) {
  if (asmIds.has(id)) ok(`prefab ${id}`)
  else bad('prefab', String(id))
}
const ents = JSON.parse(run(['assets:entities', '--gil', GIL, '--format', 'json']))
for (const id of [1077936353, 1077936354, 1077936355]) {
  const e = ents.entities.find((x) => x.id === id)
  if (e) ok(`instance ${id} pos=${e.position.map((v) => Math.round(v * 10) / 10).join(',')}`)
  else bad('instance', String(id))
}
const nmEnt = ents.entities.find((x) => x.id === 1077936355)
if (nmEnt && Array.isArray(nmEnt.components) && nmEnt.components.some((c) => (c.type ?? '').includes('nameplate'))) ok('nameplate component')
else bad('nameplate', JSON.stringify(nmEnt?.components))

// 3) rgWin 图+挂载
const graphLines = run(['assets:node-graphs', 'read', '--gil', GIL]).split('\n')
const winLine = graphLines.find((l) => l.includes(' 1073741838 '))
if (winLine && /nodes=27/.test(winLine)) ok('rgWin 1838 nodes=27')
else bad('rgWin', winLine ?? 'missing')
const mounts = run(['assets:mounts', 'list', '--gil', GIL])
if (mounts.includes('1077936260 kind=entity graphs=1073741835,1073741836,1073741838')) ok('6260 triple graphs')
else bad('mounts-6260', '')

// 4) 预算红线
for (const l of graphLines) {
  const m = l.match(/graph (1073741\d+) .*nodes=(\d+)/)
  if (m && Number(m[2]) > 2000) bad('budget', `graph ${m[1]} nodes=${m[2]}`)
}
ok('budget all <=2000')

if (fails.length) {
  console.error(`g4-art: ${fails.length} FAIL`)
  process.exit(1)
}
console.log('g4-art: ALL GREEN')
