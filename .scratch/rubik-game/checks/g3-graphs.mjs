// g3-graphs.mjs — G3 玩法逻辑闭环 组判据（rubik-game，2026-09-09）
// 断言：12 图在位+节点数（G3 演进后）；挂载矩阵（含玩家模板 10 条+6260 双图）；rg_hint_mode 旗标注册；单图预算 ≤2000。
// 用法：node g3-graphs.mjs   （全绿 exit 0；任一红 exit 1 并打印失败项）
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

// 1) 图节点数（G3 终态：12 图；1834 切换镜头空图待 G4）
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

// 2) 单图预算红线：全部 ≤2000（生产红线，AGENTS.md）
for (const l of graphLines) {
  const m = l.match(/graph (1073741\d+) .*nodes=(\d+)/)
  if (m && Number(m[2]) > 2000) bad('budget', `graph ${m[1]} nodes=${m[2]} >2000`)
}
ok('budget all graphs <=2000')

// 3) 挂载矩阵：donor 9 条 + 6260 双图 + 玩家模板 def+9 副本
const mounts = run(['assets:mounts', 'list', '--gil', GIL])
const wantMounts = [
  '1077936201 kind=entity graphs=1073741825,1073741830',
  '1077936203 kind=entity graphs=1073741826,1073741827',
  '1077936230 kind=entity graphs=1073741828,1073741829,1073741831,1073741833',
  '1077936231 kind=entity graphs=1073741832',
  '1077936260 kind=entity graphs=1073741835,1073741836',
  '1086324737 kind=def graphs=1073741837'
]
for (const w of wantMounts) {
  if (mounts.includes(w)) ok(`mount ${w.split(' ')[0]}`)
  else bad('mount', w)
}
const playerCopies = mounts.split('\n').filter((l) => /^target=10863247\d+ kind=entity graphs=1073741837$/.test(l.trim()))
if (playerCopies.length === 9) ok('player template 9 copies -> 1837')
else bad('player copies', `got=${playerCopies.length}`)

// 4) 提示旗标注册（6230 rg_hint_mode:int=0）
const vars = run(['assets:custom-variables', '--entity', '1077936230', '--list', '--gil', GIL, '--format', 'json'])
if (vars.includes('"rg_hint_mode"')) ok('rg_hint_mode registered on 6230')
else bad('rg_hint_mode', 'missing on 6230')

if (fails.length) {
  console.error(`g3-graphs: ${fails.length} FAIL`)
  process.exit(1)
}
console.log('g3-graphs: ALL GREEN')
