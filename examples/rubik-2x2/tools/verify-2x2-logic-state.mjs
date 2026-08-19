// verify-2x2-logic-state.mjs — 用 game.json 内嵌的真实表数据模拟 gsts_logic_apply_move
// 逻辑与 game.ts 复合完全一致：读 4 槽（tempP/tempT）→ 按 tblTo/tblTwist 写回
// 对照 CubeLib 随机序列，验证「表数据 + 更新算法」整体正确（防止表对代码错）
// 运行（仓库根）：node examples/rubik-2x2/tools/verify-2x2-logic-state.mjs
// 前置：已用 --noinject 编译出 dist/src/game.json
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const require = createRequire(import.meta.url)
const __dirname = dirname(fileURLToPath(import.meta.url))

const ir = require(join(__dirname, '../dist/src/game.json'))
const doc = Array.isArray(ir) ? ir[0] : ir.documents?.[0] ?? ir
const varMap = {}
for (const v of doc.variables ?? []) {
  if (v.type === 'dict') varMap[v.name] = new Map((v.value ?? []).map((p) => [p.k, p.v]))
  else varMap[v.name] = v.value
}
const { tblFrom, tblTo, tblTwist, cornerPos, cornerOrient } = varMap
const MOVE_NAMES = ['', 'R', 'L', 'U', 'D', 'F', 'B']

// 与复合一致的 apply_move（先读后写）
function applyMove(state, moveId) {
  const tempP = {}, tempT = {}
  for (let s = 0; s < 4; s++) {
    const p = tblFrom.get(moveId * 4 + s)
    tempP[s] = state.pos[p]
    tempT[s] = state.tw[p]
  }
  for (let s = 0; s < 4; s++) {
    const q = tblTo.get(moveId * 4 + s)
    const t = tblTwist.get(moveId * 12 + s * 3 + tempT[s])
    state.pos[q] = tempP[s]
    state.tw[q] = t
  }
}
function solved(state) {
  return state.pos.every((v, i) => v === i) && state.tw.every((v) => v === 0)
}

// CubeLib 对照
const cubeLib = require('/home/h/test/flash-思维链+jspace/魔方/web-prototype/js/cube.js')
const MY_TO_CUBELIB = { UBL: 3, UBR: 2, UFL: 1, UFR: 0, DBL: 7, DBR: 6, DFL: 5, DFR: 4 }
const CUBELIB_TO_MY = Object.fromEntries(Object.entries(MY_TO_CUBELIB).map(([n, i]) => [i, { UBL: 0, UBR: 1, UFL: 2, UFR: 3, DBL: 4, DBR: 5, DFL: 6, DFR: 7 }[n]]))
const NAMES = ['UBL', 'UBR', 'UFL', 'UFR', 'DBL', 'DBR', 'DFL', 'DFR']

// 表自检
console.log('tblFrom 条目:', tblFrom.size, 'tblTo:', tblTo.size, 'tblTwist:', tblTwist.size)
let checked = 0
for (let iter = 0; iter < 400; iter++) {
  const seq = []
  for (let k = 0, last = -1; k < 3 + Math.floor(Math.random() * 20); k++) {
    let m
    do { m = 1 + Math.floor(Math.random() * 6) } while (m === last)
    last = m
    seq.push(m)
  }
  // 模拟
  const state = { pos: Array.from({length:8}, (_,i) => cornerPos.get(i)), tw: Array.from({length:8}, (_,i) => cornerOrient.get(i)) }
  for (const m of seq) applyMove(state, m)
  // CubeLib
  const cube = new cubeLib.Cube()
  for (const m of seq) cube.move(cubeLib.parseMove(MOVE_NAMES[m]))
  for (const p of NAMES) {
    const st = cube.pieceState(cubeLib.cornerPieceForName(p))
    const myPos = CUBELIB_TO_MY[st.pos]
    const myPiece = NAMES.indexOf(p)
    if (state.pos[myPos] !== myPiece || state.tw[myPos] !== st.arr) {
      console.error('MISMATCH', p, 'seq=', seq.map((x) => MOVE_NAMES[x]).join(''))
      process.exit(1)
    }
    checked++
  }
}
// 逆序列一致性（模拟层）
for (let iter = 0; iter < 50; iter++) {
  const seq = []
  for (let k = 0; k < 10; k++) seq.push(1 + Math.floor(Math.random() * 6))
  const st = { pos: Array.from({length:8}, (_,i) => cornerPos.get(i)), tw: Array.from({length:8}, (_,i) => cornerOrient.get(i)) }
  for (const m of seq) applyMove(st, m)
  for (let i = seq.length - 1; i >= 0; i--) for (let k = 0; k < 3; k++) applyMove(st, seq[i])
  if (!solved(st)) { console.error('INVERSE FAIL', seq.join(',')); process.exit(1) }
}
console.log(`PASS: game.json 内嵌表数据 + apply_move 算法模拟，CubeLib 对照 ${checked} 样本一致；逆序列 50 组一致`)
