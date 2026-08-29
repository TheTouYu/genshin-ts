// gen-3x3-logic-table.mjs — 3×3 魔方逻辑状态 move 置换表离线生成器
//
// 用途：为 3×3 节点图的逻辑状态层生成：
//   - 角块：cornerPos[8] + cornerOrient[8]（扭转 0..2）
//   - 棱块：edgePos[12] + edgeOrient[12]（翻转 0..1）
//   - 中心块：centerPos[6]（纯色，无朝向）
// 覆盖 12 个操作：R L U D F B + M E S + x y z。
// 并用外部 CubeLib（web-prototype/js/cube.js）交叉验证角/棱状态。
//
// 运行：node examples/rubik-3x3-client/tools/gen-3x3-logic-table.mjs
// 输出：tools/3x3-logic-tables.json + 打印 TS 字面量片段

import { createRequire } from 'node:module'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

// ---------------------------------------------------------------- 模型
// 角块编号（WCA 名 ↔ 坐标符号），沿用 2×2
const CORNERS = [
  { id: 0, name: 'UBL', x: -1, y: 1, z: -1 },
  { id: 1, name: 'UBR', x: 1, y: 1, z: -1 },
  { id: 2, name: 'UFL', x: -1, y: 1, z: 1 },
  { id: 3, name: 'UFR', x: 1, y: 1, z: 1 },
  { id: 4, name: 'DBL', x: -1, y: -1, z: -1 },
  { id: 5, name: 'DBR', x: 1, y: -1, z: -1 },
  { id: 6, name: 'DFL', x: -1, y: -1, z: 1 },
  { id: 7, name: 'DFR', x: 1, y: -1, z: 1 }
]
// 棱块编号（与 CubeLib POS_NAMES 一致）
const EDGES = [
  { id: 0, name: 'UF', x: 0, y: 1, z: 1 },
  { id: 1, name: 'UR', x: 1, y: 1, z: 0 },
  { id: 2, name: 'UB', x: 0, y: 1, z: -1 },
  { id: 3, name: 'UL', x: -1, y: 1, z: 0 },
  { id: 4, name: 'DF', x: 0, y: -1, z: 1 },
  { id: 5, name: 'DR', x: 1, y: -1, z: 0 },
  { id: 6, name: 'DB', x: 0, y: -1, z: -1 },
  { id: 7, name: 'DL', x: -1, y: -1, z: 0 },
  { id: 8, name: 'FR', x: 1, y: 0, z: 1 },
  { id: 9, name: 'FL', x: -1, y: 0, z: 1 },
  { id: 10, name: 'BR', x: 1, y: 0, z: -1 },
  { id: 11, name: 'BL', x: -1, y: 0, z: -1 }
]
// 中心块编号：U D F B R L
const CENTERS = [
  { id: 0, name: 'U', x: 0, y: 1, z: 0 },
  { id: 1, name: 'D', x: 0, y: -1, z: 0 },
  { id: 2, name: 'F', x: 0, y: 0, z: 1 },
  { id: 3, name: 'B', x: 0, y: 0, z: -1 },
  { id: 4, name: 'R', x: 1, y: 0, z: 0 },
  { id: 5, name: 'L', x: -1, y: 0, z: 0 }
]

const posByCoord = (list) => new Map(list.map((p) => [`${p.x},${p.y},${p.z}`, p]))
const CORNER_POS = posByCoord(CORNERS)
const EDGE_POS = posByCoord(EDGES)
const CENTER_POS = posByCoord(CENTERS)

// ---------------------------------------------------------------- 旋转
// 右手系坐标变换，与 2×2/外部 CubeLib 约定一致
const ROT = {
  R: ([x, y, z]) => [x, z, -y], // 绕 X −90°
  L: ([x, y, z]) => [x, -z, y], // 绕 X +90°
  U: ([x, y, z]) => [-z, y, x], // 绕 Y −90°
  D: ([x, y, z]) => [z, y, -x], // 绕 Y +90°
  F: ([x, y, z]) => [y, -x, z], // 绕 Z −90°
  B: ([x, y, z]) => [-y, x, z] // 绕 Z +90°
}
// 12 个操作定义：moveId -> { name, rot, layerFilter }
const MOVES = [
  { id: 1, name: 'R', rot: ROT.R, layer: (p) => p.x === 1 },
  { id: 2, name: 'L', rot: ROT.L, layer: (p) => p.x === -1 },
  { id: 3, name: 'U', rot: ROT.U, layer: (p) => p.y === 1 },
  { id: 4, name: 'D', rot: ROT.D, layer: (p) => p.y === -1 },
  { id: 5, name: 'F', rot: ROT.F, layer: (p) => p.z === 1 },
  { id: 6, name: 'B', rot: ROT.B, layer: (p) => p.z === -1 },
  { id: 7, name: 'M', rot: ROT.L, layer: (p) => p.x === 0 }, // M follows L
  { id: 8, name: 'E', rot: ROT.D, layer: (p) => p.y === 0 }, // E follows D
  { id: 9, name: 'S', rot: ROT.F, layer: (p) => p.z === 0 }, // S follows F
  { id: 10, name: 'x', rot: ROT.R, layer: () => true }, // whole follows R
  { id: 11, name: 'y', rot: ROT.U, layer: () => true }, // whole follows U
  { id: 12, name: 'z', rot: ROT.F, layer: () => true } // whole follows F
]
const MOVE_BY_NAME = Object.fromEntries(MOVES.map((m) => [m.name, m]))

// ---------------------------------------------------------------- 朝向
// 角位 slot 方向：0=U/D(Y), 1=Z(F/B), 2=X(R/L)
function cornerSlotDir(p, twist) {
  if (twist === 0) return [0, p.y, 0]
  if (twist === 1) return [0, 0, p.z]
  return [p.x, 0, 0]
}
function dirToCornerSlot(p, d) {
  if (d[0] === 0 && d[1] !== 0 && d[2] === 0) return 0
  if (d[0] === 0 && d[1] === 0 && d[2] !== 0) return 1
  return 2
}

// 棱位主/次方向
function edgePrimaryDir(p) {
  // U/D 层棱：主方向 U/D；赤道棱：主方向 F/B
  if (p.y !== 0) return [0, p.y, 0]
  return [0, 0, p.z]
}
function edgeSecondaryDir(p) {
  if (p.y !== 0) {
    // 另一非零轴（X 或 Z）
    if (p.x !== 0) return [p.x, 0, 0]
    return [0, 0, p.z]
  }
  return [p.x, 0, 0]
}
function edgeFlipDir(p, flip) {
  return flip === 0 ? edgePrimaryDir(p) : edgeSecondaryDir(p)
}
function dirToEdgeFlip(p, d) {
  const prim = edgePrimaryDir(p)
  return (d[0] === prim[0] && d[1] === prim[1] && d[2] === prim[2]) ? 0 : 1
}

// ---------------------------------------------------------------- 单操作生成
// 对一种 piece 列表生成 from/to/twistMap；affected 为按 id 升序的 piece 列表
function computePieceMove(pieces, posMap, move, affected, orientKind) {
  const fromPos = affected.map((p) => p.id)
  const toPos = affected.map((p) => {
    const np = move.rot([p.x, p.y, p.z])
    const q = posMap.get(`${np[0]},${np[1]},${np[2]}`)
    if (!q) throw new Error(`piece target not found for ${p.name} under ${move.name}`)
    return q.id
  })
  let orientMap = null
  if (orientKind === 'corner') {
    orientMap = affected.map((p, idx) => {
      const q = posMap.get(`${move.rot([p.x, p.y, p.z]).join(',')}`)
      return [0, 1, 2].map((twist) => {
        const d = move.rot(cornerSlotDir(p, twist))
        return dirToCornerSlot(q, d)
      })
    })
  } else if (orientKind === 'edge') {
    orientMap = affected.map((p, idx) => {
      const q = posMap.get(`${move.rot([p.x, p.y, p.z]).join(',')}`)
      return [0, 1].map((flip) => {
        const d = move.rot(edgeFlipDir(p, flip))
        return dirToEdgeFlip(q, d)
      })
    })
  }
  return { fromPos, toPos, orientMap }
}

// ---------------------------------------------------------------- 表构建
const tables = {
  faceCornerFrom: [], faceCornerTo: [], faceCornerTwist: [],
  faceEdgeFrom: [], faceEdgeTo: [], faceEdgeFlip: [],
  middleEdgeFrom: [], middleEdgeTo: [], middleEdgeFlip: [],
  middleCenterFrom: [], middleCenterTo: [],
  wholeCornerFrom: [], wholeCornerTo: [], wholeCornerTwist: [],
  wholeEdgeFrom: [], wholeEdgeTo: [], wholeEdgeFlip: [],
  wholeCenterFrom: [], wholeCenterTo: []
}

function append(arr, values) { for (const v of values) arr.push(v) }

for (const move of MOVES) {
  const isFace = move.id <= 6
  const isMiddle = move.id >= 7 && move.id <= 9
  const isWhole = move.id >= 10

  if (isFace || isWhole) {
    const affectedCorners = CORNERS.filter(move.layer)
    const cm = computePieceMove(CORNERS, CORNER_POS, move, affectedCorners, 'corner')
    if (isFace) {
      append(tables.faceCornerFrom, cm.fromPos)
      append(tables.faceCornerTo, cm.toPos)
      for (const row of cm.orientMap) append(tables.faceCornerTwist, row)
    }
    if (isWhole) {
      append(tables.wholeCornerFrom, cm.fromPos)
      append(tables.wholeCornerTo, cm.toPos)
      for (const row of cm.orientMap) append(tables.wholeCornerTwist, row)
    }
  }
  if (isFace || isMiddle || isWhole) {
    const affectedEdges = EDGES.filter(move.layer)
    const em = computePieceMove(EDGES, EDGE_POS, move, affectedEdges, 'edge')
    if (isFace) {
      append(tables.faceEdgeFrom, em.fromPos)
      append(tables.faceEdgeTo, em.toPos)
      for (const row of em.orientMap) append(tables.faceEdgeFlip, row)
    }
    if (isMiddle) {
      append(tables.middleEdgeFrom, em.fromPos)
      append(tables.middleEdgeTo, em.toPos)
      for (const row of em.orientMap) append(tables.middleEdgeFlip, row)
    }
    if (isWhole) {
      append(tables.wholeEdgeFrom, em.fromPos)
      append(tables.wholeEdgeTo, em.toPos)
      for (const row of em.orientMap) append(tables.wholeEdgeFlip, row)
    }
  }
  if (isMiddle || isWhole) {
    const affectedCenters = CENTERS.filter(move.layer)
    const ctm = computePieceMove(CENTERS, CENTER_POS, move, affectedCenters, null)
    if (isMiddle) {
      append(tables.middleCenterFrom, ctm.fromPos)
      append(tables.middleCenterTo, ctm.toPos)
    }
    if (isWhole) {
      append(tables.wholeCenterFrom, ctm.fromPos)
      append(tables.wholeCenterTo, ctm.toPos)
    }
  }
}

// ---------------------------------------------------------------- 自检
function check(cond, msg) { if (!cond) throw new Error('VALIDATION FAILED: ' + msg) }

// 长度
check(tables.faceCornerFrom.length === 6 * 4, 'faceCornerFrom len')
check(tables.faceCornerTo.length === 6 * 4, 'faceCornerTo len')
check(tables.faceCornerTwist.length === 6 * 4 * 3, 'faceCornerTwist len')
check(tables.faceEdgeFrom.length === 6 * 4, 'faceEdgeFrom len')
check(tables.faceEdgeTo.length === 6 * 4, 'faceEdgeTo len')
check(tables.faceEdgeFlip.length === 6 * 4 * 2, 'faceEdgeFlip len')
check(tables.middleEdgeFrom.length === 3 * 4, 'middleEdgeFrom len')
check(tables.middleEdgeTo.length === 3 * 4, 'middleEdgeTo len')
check(tables.middleEdgeFlip.length === 3 * 4 * 2, 'middleEdgeFlip len')
check(tables.middleCenterFrom.length === 3 * 4, 'middleCenterFrom len')
check(tables.middleCenterTo.length === 3 * 4, 'middleCenterTo len')
check(tables.wholeCornerFrom.length === 3 * 8, 'wholeCornerFrom len')
check(tables.wholeCornerTo.length === 3 * 8, 'wholeCornerTo len')
check(tables.wholeCornerTwist.length === 3 * 8 * 3, 'wholeCornerTwist len')
check(tables.wholeEdgeFrom.length === 3 * 12, 'wholeEdgeFrom len')
check(tables.wholeEdgeTo.length === 3 * 12, 'wholeEdgeTo len')
check(tables.wholeEdgeFlip.length === 3 * 12 * 2, 'wholeEdgeFlip len')
check(tables.wholeCenterFrom.length === 3 * 6, 'wholeCenterFrom len')
check(tables.wholeCenterTo.length === 3 * 6, 'wholeCenterTo len')

// 每 move 的 from/to 必须是双射
function assertPermutation(from, to, label) {
  check(new Set(from).size === from.length, label + ' from not unique')
  check(new Set(to).size === to.length, label + ' to not unique')
  for (const f of from) check(to.includes(f), label + ` ring not closed: ${f}`)
}
for (let m = 0; m < 6; m++) {
  const off = m * 4
  assertPermutation(tables.faceCornerFrom.slice(off, off + 4), tables.faceCornerTo.slice(off, off + 4), `face corner ${m + 1}`)
  assertPermutation(tables.faceEdgeFrom.slice(off, off + 4), tables.faceEdgeTo.slice(off, off + 4), `face edge ${m + 1}`)
}
for (let m = 0; m < 3; m++) {
  const off = m * 4
  assertPermutation(tables.middleEdgeFrom.slice(off, off + 4), tables.middleEdgeTo.slice(off, off + 4), `middle edge ${m + 1}`)
  assertPermutation(tables.middleCenterFrom.slice(off, off + 4), tables.middleCenterTo.slice(off, off + 4), `middle center ${m + 1}`)
}
for (let m = 0; m < 3; m++) {
  const off = m * 8
  assertPermutation(tables.wholeCornerFrom.slice(off, off + 8), tables.wholeCornerTo.slice(off, off + 8), `whole corner ${m + 1}`)
  const eoff = m * 12
  assertPermutation(tables.wholeEdgeFrom.slice(eoff, eoff + 12), tables.wholeEdgeTo.slice(eoff, eoff + 12), `whole edge ${m + 1}`)
  const coff = m * 6
  assertPermutation(tables.wholeCenterFrom.slice(coff, coff + 6), tables.wholeCenterTo.slice(coff, coff + 6), `whole center ${m + 1}`)
}

// 状态模拟自检：每个 move 4 次回恒等；中层/整体/面都适用
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
function applyMoveToState(s, moveId) {
  const move = MOVES[moveId - 1]
  const isFace = moveId <= 6, isMiddle = moveId >= 7 && moveId <= 9, isWhole = moveId >= 10
  // 角
  if (isFace || isWhole) {
    const count = isFace ? 4 : 8
    const fromOff = (isFace ? 0 : 0) // face/whole separate arrays
    const base = isFace ? 0 : 0
    const fromArr = isFace ? tables.faceCornerFrom : tables.wholeCornerFrom
    const toArr = isFace ? tables.faceCornerTo : tables.wholeCornerTo
    const twArr = isFace ? tables.faceCornerTwist : tables.wholeCornerTwist
    const localMove = isFace ? moveId - 1 : moveId - 10
    const rowOff = (isFace ? localMove * 4 : localMove * 8)
    const oldCp = s.cp.slice(), oldCo = s.co.slice()
    const tmpP = [], tmpT = []
    for (let i = 0; i < count; i++) {
      const f = fromArr[rowOff + i]
      tmpP[i] = oldCp[f]; tmpT[i] = oldCo[f]
    }
    for (let i = 0; i < count; i++) {
      const t = toArr[rowOff + i]
      const tw = twArr[(isFace ? localMove * 4 : localMove * 8) * 3 + i * 3 + tmpT[i]]
      s.cp[t] = tmpP[i]; s.co[t] = tw
    }
  }
  // 棱
  if (isFace || isMiddle || isWhole) {
    const count = isFace ? 4 : isMiddle ? 4 : 12
    let fromArr, toArr, flArr, rowOff, rowTwOff
    if (isFace) { fromArr = tables.faceEdgeFrom; toArr = tables.faceEdgeTo; flArr = tables.faceEdgeFlip; rowOff = (moveId - 1) * 4; rowTwOff = (moveId - 1) * 4 }
    else if (isMiddle) { fromArr = tables.middleEdgeFrom; toArr = tables.middleEdgeTo; flArr = tables.middleEdgeFlip; rowOff = (moveId - 7) * 4; rowTwOff = (moveId - 7) * 4 }
    else { fromArr = tables.wholeEdgeFrom; toArr = tables.wholeEdgeTo; flArr = tables.wholeEdgeFlip; rowOff = (moveId - 10) * 12; rowTwOff = (moveId - 10) * 12 }
    const oldEp = s.ep.slice(), oldEo = s.eo.slice()
    const tmpP = [], tmpT = []
    for (let i = 0; i < count; i++) {
      const f = fromArr[rowOff + i]
      tmpP[i] = oldEp[f]; tmpT[i] = oldEo[f]
    }
    for (let i = 0; i < count; i++) {
      const t = toArr[rowOff + i]
      const fl = flArr[rowTwOff * 2 + i * 2 + tmpT[i]]
      s.ep[t] = tmpP[i]; s.eo[t] = fl
    }
  }
  // 心
  if (isMiddle || isWhole) {
    const count = isMiddle ? 4 : 6
    let fromArr, toArr, rowOff
    if (isMiddle) { fromArr = tables.middleCenterFrom; toArr = tables.middleCenterTo; rowOff = (moveId - 7) * 4 }
    else { fromArr = tables.wholeCenterFrom; toArr = tables.wholeCenterTo; rowOff = (moveId - 10) * 6 }
    const old = s.cenp.slice()
    const tmp = []
    for (let i = 0; i < count; i++) tmp.push(old[fromArr[rowOff + i]])
    for (let i = 0; i < count; i++) s.cenp[toArr[rowOff + i]] = tmp[i]
  }
}
for (const move of MOVES) {
  const s = makeState()
  for (let i = 0; i < 4; i++) applyMoveToState(s, move.id)
  check(solvedState(s), `${move.name}^4 != identity`)
  const s2 = makeState(); applyMoveToState(s2, move.id)
  check(!solvedState(s2), `${move.name}^1 == identity`)
}

// 逆序列一致性（模拟层）
for (let iter = 0; iter < 100; iter++) {
  const s = makeState()
  const seq = []
  for (let k = 0; k < 20; k++) seq.push(1 + Math.floor(Math.random() * 12))
  for (const m of seq) applyMoveToState(s, m)
  for (let i = seq.length - 1; i >= 0; i--) {
    const m = seq[i]
    for (let k = 0; k < 3; k++) applyMoveToState(s, m)
  }
  check(solvedState(s), `inverse consistency failed: ${seq.join(',')}`)
}

// 整体旋转组合闭合：x/y/z 四次各自回原，且任意两个轴的组合覆盖 24 个整体朝向
{
  const seen = new Set()
  for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) for (let c = 0; c < 4; c++) {
    const s = makeState()
    for (let i = 0; i < c; i++) applyMoveToState(s, 12) // z
    for (let i = 0; i < b; i++) applyMoveToState(s, 11) // y
    for (let i = 0; i < a; i++) applyMoveToState(s, 10) // x
    seen.add(s.cenp.join(','))
  }
  check(seen.size === 24, `whole orientation coverage = ${seen.size}, expected 24`)
}

// ---------------------------------------------------------------- CubeLib 交叉验证
const cubeLib = require('/home/h/test/flash-思维链+jspace/魔方/web-prototype/js/cube.js')
const OUR_CORNER_TO_CUBELIB = {
  UBL: 3, UBR: 2, UFL: 1, UFR: 0, DBL: 7, DBR: 6, DFL: 5, DFR: 4
}
const CUBELIB_TO_OUR_CORNER = Object.fromEntries(Object.entries(OUR_CORNER_TO_CUBELIB).map(([name, pos]) => [pos, CORNERS.find((c) => c.name === name).id]))
const CORNER_NAMES = CORNERS.map((c) => c.name)
const EDGE_NAMES = EDGES.map((e) => e.name)

function cubeApply(cube, moveId) {
  const move = MOVES[moveId - 1]
  if (moveId <= 9) {
    cube.move(cubeLib.parseMove(move.name))
  } else {
    const axis = move.name === 'x' ? 0 : move.name === 'y' ? 1 : 2
    cube.facelets = cubeLib.applyWholeRot(cube.facelets, axis, -90)
  }
}
function compareStateWithCube(s, cube, label) {
  for (const c of CORNERS) {
    const piece = cubeLib.cornerPieceForName(c.name)
    const st = cube.pieceState(piece)
    const ourSlot = CUBELIB_TO_OUR_CORNER[st.pos]
    const ourPiece = c.id
    if (s.cp[ourSlot] !== ourPiece || s.co[ourSlot] !== st.arr) {
      console.error('CORNER MISMATCH', label, c.name, 'cube=', st, 'ours=', { slot: ourSlot, piece: s.cp[ourSlot], orient: s.co[ourSlot] })
      process.exit(1)
    }
  }
  for (const e of EDGES) {
    const piece = cubeLib.edgePieceForName(e.name)
    const st = cube.pieceState(piece)
    if (s.ep[st.pos] !== e.id || s.eo[st.pos] !== st.arr) {
      console.error('EDGE MISMATCH', label, e.name, 'cube=', st, 'ours=', { slot: st.pos, piece: s.ep[st.pos], orient: s.eo[st.pos] })
      process.exit(1)
    }
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
  for (const m of seq) { applyMoveToState(s, m); cubeApply(cube, m) }
  compareStateWithCube(s, cube, `seq=${seq.map((x) => MOVES[x - 1].name).join('')}`)
  checked += 8 + 12
}
console.log(`PASS: 表自检（长度/双射/4次闭合/逆序/24朝向）+ CubeLib ${checked} 样本（角${checked / 20 * 8}棱${checked / 20 * 12}）`)

// ---------------------------------------------------------------- 输出
const outPath = join(__dirname, '3x3-logic-tables.json')
writeFileSync(outPath, JSON.stringify(tables, null, 2) + '\n')
console.log('written', outPath)

// TS 片段
const ts = `// 3×3 逻辑表（tools/gen-3x3-logic-table.mjs 生成，CubeLib 验证）——勿手改
export const LOGIC_TABLES_3X3 = ${JSON.stringify(tables, null, 2)}
`
const tsPath = join(__dirname, '3x3-logic-tables.fragment.ts')
writeFileSync(tsPath, ts)
console.log('written', tsPath)
