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

// 1) 图节点数（G2 迁移=donor 逐张；G3 合法演进：turn +2=op11 分支（方案 B 用户裁决）、
//    solverPlan +9/EPlan +9=seq-ready 提示门、LPlan 不变（门在 llPublishSeq 复合 impl）、
//    rgState 116→118=op7 兜底清旗标、rgHint 11/rgInput 11 新图（2026-09-09 提示机制轮））
const expectedNodes = {
  1073741825: 85, 1073741826: 8, 1073741827: 30, 1073741828: 72, 1073741829: 271,
  1073741830: 44, 1073741831: 161, 1073741832: 8, 1073741833: 298, 1073741835: 118,
  1073741836: 11, 1073741837: 11
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
if (total === 1117) {
  ok('graph node total=1117')
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

// 3) 信号带参（G2 落账时=7；G3 合法新增 rubikgame_input/state → 现值 9）
const sig = run(['assets:signals', 'inspect', '--gil', GIL])
const sigCount = Number(sig.match(/^signals=(\d+)/m)?.[1] ?? 0)
if (sigCount === 9) {
  ok('signals=9')
} else {
  bad('signals', `got=${sigCount}`)
}
// 3b) tabBar 拒载门回归（2026-09-09 用户实锤 bug：选项>10 拒载；B 控制器 7 项合法保留至 G4 退役）
const asmJson = JSON.parse(execFileSync('node', [GSTS, 'assets:static-assemblies', 'export', '--gil', GIL, '--format', 'json'], { cwd: '/home/h/genshin-ts', encoding: 'utf8' }))
let overLimit = 0
let tabBarCount = 0
for (const a of asmJson.assemblies ?? []) {
  for (const c of a.components ?? []) {
    if (c.type === 'tabBar') {
      tabBarCount++
      if ((c.options ?? []).length > 10) overLimit++
    }
  }
}
if (overLimit === 0) {
  ok(`tabBar load-gate (found ${tabBarCount}, none >10 options)`)
} else {
  bad('tabBar load-gate', `over10=${overLimit}`)
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
