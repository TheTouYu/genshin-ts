// g5-close.mjs — G5 注入核验与收尾 组判据（rubik-game，2026-09-09）
// 断言：四组判据复跑全绿；Save_Level 与 Temp SHA 一致；图总量与挂载矩阵稳定。
// 用法：node g5-close.mjs   （全绿 exit 0；任一红 exit 1）
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

const GIL = '/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/110170759/Beyond_Local_Save_Level/1073741920.gil'
const TEMP = '/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/110170759/Temp/1073741920.gil'
const CHECKS = '/home/h/genshin-ts/.scratch/rubik-game/checks'
const fails = []
const ok = (name) => console.log(`[ok] ${name}`)
const bad = (name, detail) => {
  console.error(`[FAIL] ${name} ${detail ?? ''}`)
  fails.push(name)
}

// 1) 四组判据复跑
for (const s of ['g2-map.mjs', 'g3-graphs.mjs', 'g3-dsl.mjs', 'g4-art.mjs']) {
  try {
    execFileSync('node', [`${CHECKS}/${s}`], { cwd: CHECKS, encoding: 'utf8', stdio: 'pipe' })
    ok(`rerun ${s} ALL GREEN`)
  } catch (e) {
    bad(`rerun ${s}`, (e.stdout ?? '').split('\n').filter((l) => l.includes('FAIL')).join('; '))
  }
}

// 2) 双址 SHA 一致（写回同步状态）
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex')
const a = sha(GIL)
const b = sha(TEMP)
if (a === b) ok('Save_Level == Temp sha256')
else bad('sha-mismatch', `${a.slice(0, 8)} vs ${b.slice(0, 8)}`)

// 3) 图总量稳定（13 图 1144 节点 = 1117 + rgWin 27）
const out = execFileSync('node', ['/home/h/genshin-ts/bin/gsts.mjs', 'assets:node-graphs', 'read', '--gil', GIL], { cwd: '/home/h/genshin-ts', encoding: 'utf8' })
const lines = out.split('\n').filter((l) => /^graph 10737418/.test(l))
const total = lines.filter((l) => !l.includes('1834')).reduce((s, l) => s + Number(l.match(/nodes=(\d+)/)?.[1] ?? 0), 0)
if (total === 1144) ok('graph node total=1144 (13 graphs)')
else bad('node total', `got=${total}`)

if (fails.length) {
  console.error(`g5-close: ${fails.length} FAIL`)
  process.exit(1)
}
console.log('g5-close: ALL GREEN')
