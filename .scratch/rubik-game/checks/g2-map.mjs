// g2-map.mjs — G2 新地图与资产迁移 组判据（rubik-game）
// 断言：1920 图内 9 张内容图节点数=donor 逐张值；挂载矩阵=donor；信号 7 条带参；实体 6；元件 28。
// 用法：node g2-map.mjs   （全绿 exit 0；任一红 exit 1 并打印失败项）
import { execFileSync } from 'node:child_process'

const GIL = '/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/110170759/Beyond_Local_Save_Level/1073741920.gil'
const GSTS = '/home/h/genshin-ts/bin/gsts.mjs'
const fails = []
const ok = (name) => console.log(`[ok] ${name}`)
const bad = (name, detail) => {
  console.error(`[FAIL] ${name} ${detail ?? ''}`)
  fails.push(name)
}

function run(args) {
  return execFileSync('node', [GSTS, ...args], { cwd: '/home/h/genshin-ts', encoding: 'utf8' })
}

// 1) 九图节点数（donor 逐张）
const expectedNodes = {
  1073741825: 85, 1073741826: 8, 1073741827: 30, 1073741828: 72, 1073741829: 262,
  1073741830: 42, 1073741831: 152, 1073741832: 8, 1073741833: 298
}
const graphLines = run(['assets:node-graphs', 'read', '--gil', GIL])
  .split('\n').filter((l) => /^graph 10737418/.test(l))
for (const [id, n] of Object.entries(expectedNodes)) {
  const line = graphLines.find((l) => l.includes(` ${id} `))
  const m = line?.match(/nodes=(\d+)/)
  if (m && Number(m[1]) === n) ok(`graph ${id} nodes=${n}`)
  else bad(`graph ${id} nodes`, `got=${m?.[1] ?? 'missing'} want=${n}`)
}
const total = graphLines
  .filter((l) => !l.includes('1834'))
  .reduce((s, l) => s + Number(l.match(/nodes=(\d+)/)?.[1] ?? 0), 0)
if (total === 957) {
  ok('nine-graph node total=957')
} else {
  bad('node total', `got=${total}`)
}

// 2) 挂载矩阵（9 条）
const mounts = run(['assets:mounts', 'list', '--gil', GIL])
const wantMounts = [
  '1077936201 kind=entity graphs=1073741825,1073741830',
  '1077936203 kind=entity graphs=1073741826,1073741827',
  '1077936230 kind=entity graphs=1073741828,1073741829,1073741831,1073741833',
  '1077936231 kind=entity graphs=1073741832'
]
for (const w of wantMounts) {
  if (mounts.includes(w)) ok(`mount ${w.split(' ')[0]}`)
  else bad('mount', w)
}

// 3) 信号 7 条带参
const sig = run(['assets:signals', 'inspect', '--gil', GIL])
const sigCount = Number(sig.match(/^signals=(\d+)/m)?.[1] ?? 0)
if (sigCount === 7) {
  ok('signals=7')
} else {
  bad('signals', `got=${sigCount}`)
}
for (const [name, p] of [
  ['rubik3x3_solve', 'params=[op:int val:int]'],
  ['rubik3x3_solve_done', 'params=[ok:int]'],
  ['rubik3x3_solve_move', 'params=[moveId:int]'],
  ['rubik3x3_tab', 'params=[tabId:int]']
]) {
  const line = sig.split('\n').find((l) => l.trim().startsWith(name + ' '))
  if (line && line.includes(p)) {
    ok(`signal ${name} ${p}`)
  } else {
    bad('signal param', `${name} ${p}`)
  }
}

// 4) 实体 6（62xx 段）
const ents = JSON.parse(run(['assets:entities', '--gil', GIL, '--format', 'json']))
const custom = ents.entities.filter((e) => e.id >= 1077936129 && e.id < 1077936300)
if (custom.length === 6) {
  ok('custom entities=6')
} else {
  bad('entities', `got=${custom.length}`)
}

// 5) 自定义元件 28（期望定义 id 全在位；resources 输出混实体 id，只做包含断言）
const res = run(['assets:resources', 'list', '--gil', GIL])
const present = new Set(res.match(/1077936\d{3}/g) ?? [])
const wantDefs = [1077936200, 1077936202, ...Array.from({ length: 26 }, (_, i) => 1077936204 + i)]
const missing = wantDefs.filter((x) => !present.has(String(x)))
if (missing.length === 0) {
  ok('custom prefab defs=28')
} else {
  bad('prefabs', `missing=${missing.join(',')}`)
}

if (fails.length) {
  console.error(`g2-map: ${fails.length} FAIL`)
  process.exit(1)
}
console.log('g2-map: ALL GREEN')
