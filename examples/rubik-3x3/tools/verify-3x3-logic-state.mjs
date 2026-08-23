// verify-3x3-logic-state.mjs — 用 game.json 内嵌的真实表数据模拟逻辑状态层
// 与 DSL 复合完全一致（角/棱/心，面转/中层/整体），并对照 CubeLib 随机序列。
// 运行（仓库根）：node examples/rubik-3x3/tools/verify-3x3-logic-state.mjs
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
const asArray = (value) => Array.isArray(value) ? value : value?.value ?? []
const V = {}
for (const name of [
  'cornerPos', 'cornerOrient', 'edgePos', 'edgeOrient', 'centerPos',
  'faceCornerFrom', 'faceCornerTo', 'faceCornerTwist',
  'faceEdgeFrom', 'faceEdgeTo', 'faceEdgeFlip',
  'middleEdgeFrom', 'middleEdgeTo', 'middleEdgeFlip',
  'middleCenterFrom', 'middleCenterTo',
  'wholeCornerFrom', 'wholeCornerTo', 'wholeCornerTwist',
  'wholeEdgeFrom', 'wholeEdgeTo', 'wholeEdgeFlip',
  'wholeCenterFrom', 'wholeCenterTo'
]) {
  V[name] = asArray(varMap[name])
}

const MOVES = [
  'R', 'L', 'U', 'D', 'F', 'B', 'M', 'E', 'S', 'x', 'y', 'z'
]
const CORNER_NAMES = ['UBL', 'UBR', 'UFL', 'UFR', 'DBL', 'DBR', 'DFL', 'DFR']
const EDGE_NAMES = ['UF', 'UR', 'UB', 'UL', 'DF', 'DR', 'DB', 'DL', 'FR', 'FL', 'BR', 'BL']

function makeState() {
  return {
    cp: Array.from({ length: 8 }, (_, i) => i),
    co: Array(8).fill(0),
    ep: Array.from({ length: 12 }, (_, i) => i),
    eo: Array(12).fill(0),
    cenp: Array.from({ length: 6 }, (_, i) => i)
  }
}
function solvedState(s) {
  return s.cp.every((v, i) => v === i) && s.co.every((v) => v === 0) &&
    s.ep.every((v, i) => v === i) && s.eo.every((v) => v === 0) &&
    s.cenp.every((v, i) => v === i)
}

// 与 DSL 复合一致的 apply（moveId 1..12）
function applyMove(s, moveId) {
  const isFace = moveId <= 6
  const isMiddle = moveId >= 7 && moveId <= 9
  const isWhole = moveId >= 10
  // 角
  if (isFace || isWhole) {
    const count = isFace ? 4 : 8
    const fromArr = isFace ? V.faceCornerFrom : V.wholeCornerFrom
    const toArr = isFace ? V.faceCornerTo : V.wholeCornerTo
    const twArr = isFace ? V.faceCornerTwist : V.wholeCornerTwist
    const row = (isFace ? moveId - 1 : moveId - 10) * count
    const oldCp = s.cp.slice(), oldCo = s.co.slice()
    const tmpP = [], tmpT = []
    for (let i = 0; i < count; i++) {
      const f = fromArr[row + i]
      tmpP[i] = oldCp[f]; tmpT[i] = oldCo[f]
    }
    for (let i = 0; i < count; i++) {
      const t = toArr[row + i]
      const tw = twArr[row * 3 + i * 3 + tmpT[i]]
      s.cp[t] = tmpP[i]; s.co[t] = tw
    }
  }
  // 棱
  if (isFace || isMiddle || isWhole) {
    const count = isFace ? 4 : isMiddle ? 4 : 12
    let fromArr, toArr, flArr, row
    if (isFace) { fromArr = V.faceEdgeFrom; toArr = V.faceEdgeTo; flArr = V.faceEdgeFlip; row = (moveId - 1) * 4 }
    else if (isMiddle) { fromArr = V.middleEdgeFrom; toArr = V.middleEdgeTo; flArr = V.middleEdgeFlip; row = (moveId - 7) * 4 }
    else { fromArr = V.wholeEdgeFrom; toArr = V.wholeEdgeTo; flArr = V.wholeEdgeFlip; row = (moveId - 10) * 12 }
    const oldEp = s.ep.slice(), oldEo = s.eo.slice()
    const tmpP = [], tmpT = []
    for (let i = 0; i < count; i++) {
      const f = fromArr[row + i]
      tmpP[i] = oldEp[f]; tmpT[i] = oldEo[f]
    }
    for (let i = 0; i < count; i++) {
      const t = toArr[row + i]
      const fl = flArr[row * 2 + i * 2 + tmpT[i]]
      s.ep[t] = tmpP[i]; s.eo[t] = fl
    }
  }
  // 心
  if (isMiddle || isWhole) {
    const count = isMiddle ? 4 : 6
    let fromArr, toArr, row
    if (isMiddle) { fromArr = V.middleCenterFrom; toArr = V.middleCenterTo; row = (moveId - 7) * 4 }
    else { fromArr = V.wholeCenterFrom; toArr = V.wholeCenterTo; row = (moveId - 10) * 6 }
    const old = s.cenp.slice()
    const tmp = []
    for (let i = 0; i < count; i++) tmp.push(old[fromArr[row + i]])
    for (let i = 0; i < count; i++) s.cenp[toArr[row + i]] = tmp[i]
  }
}

// 自检：每个 move 4 次回恒等
for (let m = 1; m <= 12; m++) {
  const s = makeState()
  for (let i = 0; i < 4; i++) applyMove(s, m)
  if (!solvedState(s)) { console.error(`FAIL: ${MOVES[m - 1]}^4 != identity`); process.exit(1) }
  const s2 = makeState(); applyMove(s2, m)
  if (solvedState(s2)) { console.error(`FAIL: ${MOVES[m - 1]}^1 == identity`); process.exit(1) }
}
// 逆序一致性
for (let iter = 0; iter < 100; iter++) {
  const s = makeState()
  const seq = []
  for (let k = 0; k < 20; k++) seq.push(1 + Math.floor(Math.random() * 12))
  for (const m of seq) applyMove(s, m)
  for (let i = seq.length - 1; i >= 0; i--) for (let k = 0; k < 3; k++) applyMove(s, seq[i])
  if (!solvedState(s)) { console.error('FAIL inverse', seq.join(',')); process.exit(1) }
}
// 整体 24 朝向
{
  const seen = new Set()
  for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) for (let c = 0; c < 4; c++) {
    const s = makeState()
    for (let i = 0; i < c; i++) applyMove(s, 12)
    for (let i = 0; i < b; i++) applyMove(s, 11)
    for (let i = 0; i < a; i++) applyMove(s, 10)
    seen.add(s.cenp.join(','))
  }
  if (seen.size !== 24) { console.error('FAIL whole coverage', seen.size); process.exit(1) }
}

// CubeLib 对照
const cubeLib = require('/home/h/test/flash-思维链+jspace/魔方/web-prototype/js/cube.js')
const OUR_CORNER_TO_CUBELIB = { UBL: 3, UBR: 2, UFL: 1, UFR: 0, DBL: 7, DBR: 6, DFL: 5, DFR: 4 }
const CUBELIB_TO_OUR_CORNER = Object.fromEntries(Object.entries(OUR_CORNER_TO_CUBELIB).map(([name, pos]) => [pos, CORNER_NAMES.indexOf(name)]))
function cubeApply(cube, moveId) {
  const name = MOVES[moveId - 1]
  if (moveId <= 9) cube.move(cubeLib.parseMove(name))
  else {
    const axis = name === 'x' ? 0 : name === 'y' ? 1 : 2
    cube.facelets = cubeLib.applyWholeRot(cube.facelets, axis, -90)
  }
}
let checked = 0
for (let iter = 0; iter < 500; iter++) {
  const s = makeState()
  const cube = new cubeLib.Cube()
  const seq = []
  for (let k = 0; k < 3 + Math.floor(Math.random() * 20); k++) {
    let m
    do { m = 1 + Math.floor(Math.random() * 12) } while (m === seq[seq.length - 1])
    seq.push(m)
  }
  for (const m of seq) { applyMove(s, m); cubeApply(cube, m) }
  for (const cName of CORNER_NAMES) {
    const piece = cubeLib.cornerPieceForName(cName)
    const st = cube.pieceState(piece)
    const ourSlot = CUBELIB_TO_OUR_CORNER[st.pos]
    const ourPiece = CORNER_NAMES.indexOf(cName)
    if (s.cp[ourSlot] !== ourPiece || s.co[ourSlot] !== st.arr) {
      console.error('CORNER MISMATCH', cName, seq.map((x) => MOVES[x - 1]).join(''), st, { slot: ourSlot, piece: s.cp[ourSlot], orient: s.co[ourSlot] })
      process.exit(1)
    }
    checked++
  }
  for (const eName of EDGE_NAMES) {
    const piece = cubeLib.edgePieceForName(eName)
    const st = cube.pieceState(piece)
    const ourPiece = EDGE_NAMES.indexOf(eName)
    if (s.ep[st.pos] !== ourPiece || s.eo[st.pos] !== st.arr) {
      console.error('EDGE MISMATCH', eName, seq.map((x) => MOVES[x - 1]).join(''), st, { slot: st.pos, piece: s.ep[st.pos], orient: s.eo[st.pos] })
      process.exit(1)
    }
    checked++
  }
}
console.log(`PASS: game.json 3×3 表 + apply 算法，CubeLib ${checked} 样本；自检 12 move 四次闭合/逆序 100/24 朝向`)
