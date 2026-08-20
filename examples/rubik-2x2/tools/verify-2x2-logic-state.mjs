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
const { tblFrom, tblTo, tblTwist, wholeFrom, wholeTo, wholeTwist, cornerPos, cornerOrient, targetPos, targetOrient } = varMap
const MOVE_NAMES = ['', 'R', 'L', 'U', 'D', 'F', 'B']
const asArray = (value) => Array.isArray(value) ? value : value?.value ?? []
const from = asArray(tblFrom)
const to = asArray(tblTo)
const twist = asArray(tblTwist)
const wholeFromList = asArray(wholeFrom)
const wholeToList = asArray(wholeTo)
const wholeTwistList = asArray(wholeTwist)
const initialPos = asArray(cornerPos)
const initialTwist = asArray(cornerOrient)
const goalPos = asArray(targetPos)
const goalTwist = asArray(targetOrient)

// 与复合一致的 apply_move（先读后写）
function applyMove(state, moveId) {
  const tempP = {}, tempT = {}
  for (let s = 0; s < 4; s++) {
    const p = from[moveId * 4 + s]
    tempP[s] = state.pos[p]
    tempT[s] = state.tw[p]
  }
  for (let s = 0; s < 4; s++) {
    const q = to[moveId * 4 + s]
    const t = twist[moveId * 12 + s * 3 + tempT[s]]
    state.pos[q] = tempP[s]
    state.tw[q] = t
  }
}
function applyWhole(state, transformId) {
  const oldPos = state.pos.slice()
  const oldTwist = state.tw.slice()
  for (let s = 0; s < 8; s++) {
    const fromSlot = wholeFromList[transformId * 8 + s]
    const toSlot = wholeToList[transformId * 8 + s]
    state.pos[toSlot] = oldPos[fromSlot]
    state.tw[toSlot] = wholeTwistList[transformId * 24 + s * 3 + oldTwist[fromSlot]]
  }
}
function solved(state) {
  return state.pos.every((v, i) => v === goalPos[i]) && state.tw.every((v, i) => v === goalTwist[i])
}

// CubeLib 对照
const cubeLib = require('/home/h/test/flash-思维链+jspace/魔方/web-prototype/js/cube.js')
const MY_TO_CUBELIB = { UBL: 3, UBR: 2, UFL: 1, UFR: 0, DBL: 7, DBR: 6, DFL: 5, DFR: 4 }
const CUBELIB_TO_MY = Object.fromEntries(Object.entries(MY_TO_CUBELIB).map(([n, i]) => [i, { UBL: 0, UBR: 1, UFL: 2, UFR: 3, DBL: 4, DBR: 5, DFL: 6, DFR: 7 }[n]]))
const NAMES = ['UBL', 'UBR', 'UFL', 'UFR', 'DBL', 'DBR', 'DFL', 'DFR']

// 表自检：面转 6×4 槽、整体转 2×8 槽、整体 twist 2×8×3 项。
if (from.length !== 28 || to.length !== 28 || twist.length !== 84) {
  throw new Error(`面转表长度异常: from=${from.length}, to=${to.length}, twist=${twist.length}`)
}
if (wholeFromList.length !== 16 || wholeToList.length !== 16 || wholeTwistList.length !== 48) {
  throw new Error(`整体转表长度异常: from=${wholeFromList.length}, to=${wholeToList.length}, twist=${wholeTwistList.length}`)
}
console.log('面转表:', from.length, to.length, twist.length, '整体转表:', wholeFromList.length, wholeToList.length, wholeTwistList.length)
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
  const state = { pos: initialPos.slice(), tw: initialTwist.slice() }
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
  const st = { pos: initialPos.slice(), tw: initialTwist.slice() }
  for (const m of seq) applyMove(st, m)
  for (let i = seq.length - 1; i >= 0; i--) for (let k = 0; k < 3; k++) applyMove(st, seq[i])
  if (!solved(st)) { console.error('INVERSE FAIL', seq.join(',')); process.exit(1) }
}
// 整体旋转：每个轴 4 次必须回到模板目标，验证 8 槽置换和 twist 表同步闭合。
for (const transformId of [0, 1]) {
  const st = { pos: initialPos.slice(), tw: initialTwist.slice() }
  for (let i = 0; i < 4; i++) applyWhole(st, transformId)
  if (!solved(st)) {
    console.error('WHOLE QUARTER-TURN CLOSURE FAIL', transformId)
    process.exit(1)
  }
}
// 混合面转/整体转：先应用随机操作，再以三次同操作组成各自逆操作回放。
for (let iter = 0; iter < 100; iter++) {
  const operations = []
  for (let k = 0; k < 15; k++) {
    operations.push(Math.random() < 0.5
      ? { kind: 'face', id: 1 + Math.floor(Math.random() * 6) }
      : { kind: 'whole', id: Math.floor(Math.random() * 2) })
  }
  const st = { pos: initialPos.slice(), tw: initialTwist.slice() }
  for (const op of operations) {
    if (op.kind === 'face') applyMove(st, op.id)
    else applyWhole(st, op.id)
  }
  for (let i = operations.length - 1; i >= 0; i--) {
    const op = operations[i]
    for (let k = 0; k < 3; k++) {
      if (op.kind === 'face') applyMove(st, op.id)
      else applyWhole(st, op.id)
    }
  }
  if (!solved(st)) {
    console.error('MIXED INVERSE FAIL', JSON.stringify(operations))
    process.exit(1)
  }
}
console.log(`PASS: game.json int_list 表 + apply_move 算法，CubeLib ${checked} 样本；面转逆序 50 组；整体四次闭合；混合逆序 100 组`)
