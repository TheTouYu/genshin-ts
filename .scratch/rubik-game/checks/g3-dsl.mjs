// g3-dsl.mjs — G3 玩法逻辑闭环 DSL 结构判据（rubik-game，2026-09-09）
// 断言：源码级关键结构——状态机变量族/星级门/输入图双事件/提示链/三 plan 图门/turn op11/零轮询。
// 用法：node g3-dsl.mjs   （全绿 exit 0；任一红 exit 1 并打印失败项）
import { readFileSync } from 'node:fs'

const SRC = '/home/h/genshin-ts/examples/rubik-game/src'
const fails = []
const ok = (name) => console.log(`[ok] ${name}`)
const bad = (name, detail) => {
  console.error(`[FAIL] ${name} ${detail ?? ''}`)
  fails.push(name)
}
const rd = (f) => readFileSync(`${SRC}/${f}`, 'utf8')
const has = (f, needle, name) => {
  if (rd(f).includes(needle)) ok(name)
  else bad(name, `${f} 缺 "${needle}"`)
}

// 1) rgState 状态机：变量族 + 五态 + op7 星级（3★ 无提示门）+ rg_* 同步
const rs = rd('rgState.ts')
for (const v of ['stage:', 'level:', 'par:', 'moves:', 'hintUsed:', 'stars:']) {
  if (rs.includes(v)) ok(`rgState var ${v.replace(':', '')}`)
  else bad('rgState var', v)
}
for (const needle of ["'rg_stage'", "'rg_hint_used'", 'evt.params.op, 7n', 'hintUsed']) {
  if (rs.includes(needle)) ok(`rgState ${needle}`)
  else bad('rgState', needle)
}

// 2) rgInput：双 UI 事件入口 + 信号转发
for (const n of ['whenUiControlGroupIsTriggered', 'whenFloatingInteractionPageIsTriggered']) {
  has('rgInput.ts', n, `rgInput ${n}`)
}
const ri = rd('rgInput.ts')
const sends = (ri.match(/rubikgame_input/g) ?? []).length
if (sends >= 4) ok('rgInput signal sends >=4')
else bad('rgInput sends', `got=${sends}`)

// 3) rgHint：btnId=20 门 + 双置位 + op12 起算
for (const n of ['btn, 20n', "'rg_hint_used'", "'rg_hint_mode'", 'rubik3x3_solve, 12n']) {
  has('rgHint.ts', n, `rgHint ${n.replace(/'/g, '')}`)
}

// 4) 三 plan 图 seq-ready 提示门（rg_hint_mode 门+截断+熄火）
for (const f of ['solverPlan.ts', 'solverEPlan.ts', 'solverLPlan.ts']) {
  const s = rd(f)
  const gated = s.includes("'rg_hint_mode'") && s.includes("solve_len'), new int(1)")
  if (gated) ok(`${f} hint gate`)
  else bad(`${f} hint gate`, 'rg_hint_mode 门或缺截断')
}

// 5) turn op11 打乱入口（方案 B 用户裁决）
has('turn.ts', '11:', 'turn op11 branch')

// 6) 零高频轮询：新图禁 setInterval
for (const f of ['rgState.ts', 'rgHint.ts', 'rgInput.ts']) {
  if (rd(f).includes('setInterval')) bad('zero-polling', `${f} 含 setInterval`)
}
ok('zero-polling rg graphs (no setInterval)')

if (fails.length) {
  console.error(`g3-dsl: ${fails.length} FAIL`)
  process.exit(1)
}
console.log('g3-dsl: ALL GREEN')
