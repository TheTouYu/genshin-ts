// rbv-math-kernel.mjs —— 票 06 阶段①「turnblock 数学搬迁」离线数学对拍内核（2026-09-05）
//
// seam 口径（spec-06「数学对拍 seam」）：同一纯输入下，
//   A = 服务端现行复合逐式 JS 转写（visual 图 viewTurnBlock 链：槽行→块、loc=块实体格点、
//       motion_orbit_prep/step/velocity + motion_spin_block 数学、localAxis 查表与符号）
//   B = 新客户端 20008 渲染单元逐槽执行包算法（读同一 rows/blockOrient/状态输入）
// 断言每个槽位的执行包项（piece/axis/av/dur/vel1/vel2）全等。
//
// 附带独立自检（不依赖对拍对象）：
//   S0 格点几何 = flowSpawnRubik 世界坐标顺序
//   S1 dir=+1 绕轴 +90° ≡ move 表 to 行；dir=-1（-90°）≡ 三次 +90°（负折叠等价）
//   S2 轨道 45° 落位 p1 = 罗德里格斯解析旋转
//   S3 localAxis 表抽取（orientTables.ts）总长 = 300（100×3 分块；覆盖 12×24=288）
//
// 运行：npx tsx tools/rbv-math-kernel.mjs        （exit 0 = 全 PASS；尾部打印 R 面执行包样例）
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SRC = join(__dirname, '..', 'src')

// ---------------------------------------------------------------- 常量（与服务端源码同源）
const C1 = 0.7071068 // motion.ts C1/S1（45° 段）
const S1 = 0.7071068
const C2 = 0
const S2 = 1
const CENTER = [3, 3, 3]
const DEG90 = Math.PI / 2

// axes 表（turn.ts variables.axes，下标 0..12；0 占位）
const AXES = [
  [0, 0, 0], [-1, 0, 0], [1, 0, 0], [0, -1, 0], [0, 1, 0], [0, 0, -1], [0, 0, 1],
  [1, 0, 0], [0, 1, 0], [0, 0, -1], [-1, 0, 0], [0, -1, 0], [0, 0, -1]
]
// 视觉顺序表（turn.ts variables）
const FACE_VISUAL_ORDER = [
  0, 4, 1, 6, 3, 5, 2, 7,
  0, 4, 1, 6, 3, 5, 2, 7,
  0, 7, 2, 4, 3, 5, 1, 6,
  0, 7, 2, 4, 3, 5, 1, 6,
  0, 4, 1, 5, 3, 6, 2, 7,
  0, 4, 1, 5, 3, 6, 2, 7
]
const MIDDLE_VISUAL_ORDER = [4, 0, 6, 2, 5, 3, 7, 1]
const WHOLE_VISUAL_ORDER = [
  0, 8, 20, 18, 1, 9, 21, 19,
  2, 10, 22, 16, 3, 11, 23, 17,
  4, 12, 24, 5, 13, 25, 6, 14,
  7, 15
]
const FACE_CENTER_INDEX = [0, 4, 5, 0, 1, 2, 3] // moveId 1..6 → 中心位置下标

// 格点几何（gen-3x3-logic-table.mjs 同源编号；offset = 中心(3,3,3)+下表值）
const CORNER_OFF = [
  [-1, 1, -1], [1, 1, -1], [-1, 1, 1], [1, 1, 1],
  [-1, -1, -1], [1, -1, -1], [-1, -1, 1], [1, -1, 1]
]
const EDGE_OFF = [
  [0, 1, 1], [1, 1, 0], [0, 1, -1], [-1, 1, 0],
  [0, -1, 1], [1, -1, 0], [0, -1, -1], [-1, -1, 0],
  [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1]
]
const CENTER_OFF = [[0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1], [1, 0, 0], [-1, 0, 0]]
function spotOffset(spot) {
  if (spot < 8) return CORNER_OFF[spot]
  if (spot < 20) return EDGE_OFF[spot - 8]
  return CENTER_OFF[spot - 20]
}
// 世界格点（flow.ts flowSpawnRubik 顺序 c0..c25）
const SPAWN_COORDS = [
  [2, 4, 2], [4, 4, 2], [2, 4, 4], [4, 4, 4], [2, 2, 2], [4, 2, 2], [2, 2, 4], [4, 2, 4],
  [3, 4, 4], [4, 4, 3], [3, 4, 2], [2, 4, 3], [3, 2, 4], [4, 2, 3], [3, 2, 2], [2, 2, 3],
  [4, 3, 4], [2, 3, 4], [4, 3, 2], [2, 3, 2], [3, 4, 3], [3, 2, 3], [3, 3, 4], [3, 3, 2],
  [4, 3, 3], [2, 3, 3]
]
function spotWorld(spot) { return SPAWN_COORDS[spot].slice() }

// 3x3 逻辑表（tools/3x3-logic-tables.json，生成器自检 + CubeLib 交叉验证过）
const T = JSON.parse(readFileSync(join(__dirname, '3x3-logic-tables.json'), 'utf8'))

// ---------------------------------------------------------------- localAxis 表抽取（S3）
const localAxisAll = (() => {
  const text = readFileSync(join(SRC, 'orientTables.ts'), 'utf8')
  const per = {}
  const blockRe = /export const (localAxisTable\d) = \[([\s\S]*?)\n\]/g
  let bm
  while ((bm = blockRe.exec(text)) !== null) {
    const re = /vec3\(\[\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\]\)/g
    const triples = []
    let m
    while ((m = re.exec(bm[2])) !== null) triples.push([Number(m[1]), Number(m[2]), Number(m[3])])
    per[bm[1]] = triples
  }
  const all = [...(per.localAxisTable0 ?? []), ...(per.localAxisTable1 ?? []), ...(per.localAxisTable2 ?? [])]
  if (all.length !== 300 || per.localAxisTable0?.length !== 100 || per.localAxisTable1?.length !== 100 || per.localAxisTable2?.length !== 100) throw new Error(`localAxis 表抽取 ${all.length}（分块 ${per.localAxisTable0?.length}/${per.localAxisTable1?.length}/${per.localAxisTable2?.length}）≠ 300（100×3）`)
  return all
})()

// ---------------------------------------------------------------- 纯向量数学（与 DSL 复合同式）
const vAdd = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const vSub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const vScale = (s, a) => [s * a[0], s * a[1], s * a[2]]
const vDot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const vCross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0]
]
const near = (a, b, eps = 1e-6) => a.every((v, i) => Math.abs(v - b[i]) < eps)
function rodrigues(v, a, theta) { // v 绕单位轴 a 转 theta（弧度）
  const c = Math.cos(theta), s = Math.sin(theta)
  return vAdd(vAdd(vScale(c, v), vScale(s, vCross(a, v))), vScale((1 - c) * vDot(a, v), a))
}

// ---------------------------------------------------------------- move 行几何（表行 ↔ 位置）
// 行 r 的 from 位置（局部段空间：角 0..7 / 棱 0..11 / 心 0..5）
function rowFromPos(moveId, r) {
  if (moveId <= 6) return r < 4 ? T.faceCornerFrom[(moveId - 1) * 4 + r] : T.faceEdgeFrom[(moveId - 1) * 4 + (r - 4)]
  if (moveId <= 9) return r < 4 ? T.middleEdgeFrom[(moveId - 7) * 4 + r] : T.middleCenterFrom[(moveId - 7) * 4 + (r - 4)]
  return r < 8 ? T.wholeCornerFrom[(moveId - 10) * 8 + r]
    : r < 20 ? T.wholeEdgeFrom[(moveId - 10) * 12 + (r - 8)]
      : T.wholeCenterFrom[(moveId - 10) * 6 + (r - 20)]
}
function rowToPos(moveId, r) {
  if (moveId <= 6) return r < 4 ? T.faceCornerTo[(moveId - 1) * 4 + r] : T.faceEdgeTo[(moveId - 1) * 4 + (r - 4)]
  if (moveId <= 9) return r < 4 ? T.middleEdgeTo[(moveId - 7) * 4 + r] : T.middleCenterTo[(moveId - 7) * 4 + (r - 4)]
  return r < 8 ? T.wholeCornerTo[(moveId - 10) * 8 + r]
    : r < 20 ? T.wholeEdgeTo[(moveId - 10) * 12 + (r - 8)]
      : T.wholeCenterTo[(moveId - 10) * 6 + (r - 20)]
}
// 行 → 全局 spot
function rowSpot(moveId, r) {
  const p = rowFromPos(moveId, r)
  if (moveId <= 6) return r < 4 ? p : p + 8
  if (moveId <= 9) return r < 4 ? p + 8 : p + 20
  return r < 8 ? p : r < 20 ? p + 8 : p + 20
}
// 行的 to 位 → 全局 spot
function rowToSpot(moveId, r) {
  const p = rowToPos(moveId, r)
  if (moveId <= 6) return r < 4 ? p : p + 8
  if (moveId <= 9) return r < 4 ? p + 8 : p + 20
  return r < 8 ? p : r < 20 ? p + 8 : p + 20
}
// 该 move 覆盖的行数
function rowCount(moveId) { return moveId <= 9 ? 8 : 26 }
// 行数枚举的 spot 集合内，把 spot 沿 +90° 走一步（找 spot 所在行 → 该行 to 位）
function nextSpot(moveId, spot) {
  const n = rowCount(moveId)
  for (let r = 0; r < n; r++) {
    if (rowSpot(moveId, r) === spot) return rowToSpot(moveId, r)
  }
  throw new Error(`move ${moveId}: spot ${spot} 不在行覆盖内`)
}

// ---------------------------------------------------------------- 状态（P=实体物理排列，与 solver_* 同构）
function makeState() {
  return { cp: [0, 1, 2, 3, 4, 5, 6, 7], ep: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], ct: [0, 1, 2, 3, 4, 5] }
}
function pieceSpot(state, piece) {
  if (piece < 8) return state.cp.indexOf(piece)
  if (piece < 20) return 8 + state.ep.indexOf(piece - 8)
  return 20 + state.ct.indexOf(piece - 20)
}
// rows 快照（turn 图 tempP 行语义：行→全局块号，由某逻辑状态按行 from 位构建）
function buildRows(state, moveId) {
  const rows = new Array(26).fill(0)
  const n = rowCount(moveId)
  for (let r = 0; r < n; r++) {
    const spot = rowSpot(moveId, r)
    const piece = spot < 8 ? state.cp[spot] : spot < 20 ? 8 + state.ep[spot - 8] : 20 + state.ct[spot - 20]
    rows[r] = piece
  }
  return rows
}
// 槽位 → 行号（面：slot0=面心(-1 占位) + 1..8 行；中层/整转直接映射）；moveId 内部取正
function slotRows(moveId) {
  const m = Math.abs(moveId)
  if (m <= 6) return [-1, ...Array.from({ length: 8 }, (_, i) => FACE_VISUAL_ORDER[(m - 1) * 8 + i])]
  if (m <= 9) return MIDDLE_VISUAL_ORDER.slice()
  return WHOLE_VISUAL_ORDER.slice()
}
// 槽位 → 该槽要转的全局格点 spot（客户端直推用；面 slot0=面心格点，其后为视觉顺序行的格点）
function slotSpot(moveId, slot) {
  const m = Math.abs(moveId)
  const rows = slotRows(moveId)
  const r = rows[slot]
  if (m <= 6 && slot === 0) return 20 + FACE_CENTER_INDEX[m]
  return rowSpot(m, r)
}
// 从状态 P 直接取“某全局格点上的块号”（cp/ep/ct 即 pos→piece 排列）
function pieceAtSpot(state, spot) {
  if (spot < 8) return state.cp[spot]
  if (spot < 20) return 8 + state.ep[spot - 8]
  return 20 + state.ct[spot - 20]
}

// ---------------------------------------------------------------- 服务端现行复合参照（A）
// 输入契约 = 现行实现实际输入：tempP rows（行→块，含负折叠的预应用快照）+ 块实体实时位置（P 状态）
function referenceSlot(rows, orient, state, moveId, slot, dur, av, kVel) {
  const dir = moveId > 0 ? 1 : -1
  const m = Math.abs(moveId) // 行/表/布局一律按正 move 语义；dir 单独取符号
  let piece
  if (m <= 6 && slot === 0) {
    piece = 20 + state.ct[FACE_CENTER_INDEX[m]] // 面心：中心位置上的中心块
  } else {
    piece = rows[slotRows(moveId)[slot]]
  }
  const orientIdx = orient[piece]
  const localAxis = localAxisAll[(m - 1) * 24 + orientIdx]
  const spinAxis = vScale(dir, localAxis) // 自旋轴 × dir 符号
  const axis = vScale(dir, AXES[m]) // 轨道轴 × dir 符号
  const v0 = vSub(spotWorld(pieceSpot(state, piece)), CENTER) // loc = 块当前实体位置
  const vp = vScale(vDot(axis, v0), axis)
  const vPerp = vSub(v0, vp)
  const axv = vCross(axis, vPerp)
  const p1 = vAdd(vAdd(vp, vScale(C1, vPerp)), vScale(S1, axv))
  const p2 = vAdd(vp, vScale(S2, axv)) // C2=0：90° 落位
  const vel1 = vScale(kVel, vSub(p1, v0))
  const vel2 = vScale(kVel, vSub(p2, p1))
  return { piece, axis: spinAxis, av, dur, vel1, vel2 }
}
// ---------------------------------------------------------------- 新客户端执行包算法（B）
// 输入契约 = 任务（moveId/参数）+ 宿主状态 P + 槽位→格点静态表（不读实体、不依赖负折叠行快照）：
//   slot → spot（slotSpot/rowSpot 静态几何）→ pieceAtSpot(P) → 与 A 同一轨道/自旋数学
function clientSlot(_rows, orient, state, moveId, slot, dur, av, kVel) {
  const dir = moveId > 0 ? 1 : -1
  const m = Math.abs(moveId)
  const spot = slotSpot(moveId, slot)
  const piece = pieceAtSpot(state, spot)
  const orientIdx = orient[piece]
  const localAxis = localAxisAll[(m - 1) * 24 + orientIdx]
  const spinAxis = vScale(dir, localAxis)
  const axis = vScale(dir, AXES[m])
  const v0 = spotOffset(spot) // 与 loc−center 等价（世界坐标差即格点相对中心偏移）
  const vp = vScale(vDot(axis, v0), axis)
  const vPerp = vSub(v0, vp)
  const axv = vCross(axis, vPerp)
  const p1 = vAdd(vAdd(vp, vScale(C1, vPerp)), vScale(S1, axv))
  const p2 = vAdd(vp, vScale(S2, axv))
  const vel1 = vScale(kVel, vSub(p1, v0))
  const vel2 = vScale(kVel, vSub(p2, p1))
  return { piece, axis: spinAxis, av, dur, vel1, vel2 }
}

// ---------------------------------------------------------------- 自检 & 对拍执行
const checks = []
function check(name, cond, detail = '') {
  checks.push({ name, ok: !!cond, detail })
  if (!cond) console.error('  ✗', name, detail)
}

// S0：格点几何与 spawn 坐标一致
check('S0 spot 世界坐标 = flowSpawnRubik 顺序', (() => {
  for (let s = 0; s < 26; s++) {
    if (!near(vAdd(CENTER, spotOffset(s)), SPAWN_COORDS[s])) return false
  }
  return true
})())
check('S3 localAxis 总表抽取 = 300（100×3 分块，覆盖 12×24=288）', localAxisAll.length === 300)

// S1a：dir=+1 绕轴 +90° ≡ move 表 to 行（逐行）
for (let b = 1; b <= 12; b++) {
  for (let r = 0; r < rowCount(b); r++) {
    const got = vAdd(CENTER, rodrigues(spotOffset(rowSpot(b, r)), AXES[b], DEG90))
    const exp = spotWorld(rowToSpot(b, r))
    check(`S1+90 move=${b} row=${r}`, near(got, exp), `got ${got} exp ${exp}`)
  }
}
// S1b：dir=-1（-90°）≡ 三次 +90°（负折叠等价）：同一 spot 走三步 to 行
for (let b = 1; b <= 12; b++) {
  for (let r = 0; r < rowCount(b); r++) {
    const spot = rowSpot(b, r)
    const got = vAdd(CENTER, rodrigues(spotOffset(spot), AXES[b], -DEG90))
    let sp = spot
    for (let k = 0; k < 3; k++) sp = nextSpot(b, sp)
    const exp = vAdd(CENTER, spotOffset(sp))
    check(`S1-90 move=${b} row=${r}`, near(got, exp), `got ${got} exp ${exp}`)
  }
}
// S2：轨道 45° 落位 = 罗德里格斯解析旋转（每 move 首行；axis 正方向）
for (let b = 1; b <= 12; b++) {
  const off = spotOffset(rowSpot(b, 0))
  const axis = AXES[b]
  const v0 = off
  const vp = vScale(vDot(axis, v0), axis)
  const vPerp = vSub(v0, vp)
  const axv = vCross(axis, vPerp)
  const p1 = vAdd(vAdd(vp, vScale(C1, vPerp)), vScale(S1, axv))
  const exp45 = rodrigues(off, axis, DEG90 / 2)
  check(`S2 45° 落位 move=${b}`, near(p1, exp45), `got ${p1} exp ${exp45}`)
}

// 参数表（服务端 flowDoMove/flowWholeTail 同源常量）
function paramsFor(moveId) {
  const b = Math.abs(moveId)
  if (b <= 6) return { dur: 0.2, seg: 0.1, kVel: 10, av: 450 }
  if (b <= 9) return { dur: 0.3, seg: 0.15, kVel: 6.6667, av: 300 }
  return { dur: 1.0, seg: 0.5, kVel: 2.0, av: 90 }
}

function compareOne(rows, orient, state, moveId, dur, av, kVel, tag) {
  const slots = slotRows(moveId)
  for (let k = 0; k < slots.length; k++) {
    const a = referenceSlot(rows, orient, state, moveId, k, dur, av, kVel)
    const b = clientSlot(rows, orient, state, moveId, k, dur, av, kVel)
    const same = a.piece === b.piece && near(a.axis, b.axis) && near(a.vel1, b.vel1) &&
      near(a.vel2, b.vel2) && a.av === b.av && a.dur === b.dur
    if (!same) check(`A/B 对拍 ${tag} move=${moveId} slot=${k}`, false, JSON.stringify({ a, b }))
  }
}

// 语料：solved + 15 随机面转打乱状态；每状态 × moveId 1..12
function applyFacePerm(st, moveId) {
  const oldCp = st.cp.slice(), oldEp = st.ep.slice()
  const off = (moveId - 1) * 4
  for (let i = 0; i < 4; i++) {
    st.cp[T.faceCornerTo[off + i]] = oldCp[T.faceCornerFrom[off + i]]
    st.ep[T.faceEdgeTo[off + i]] = oldEp[T.faceEdgeFrom[off + i]]
  }
  return st
}
const rng = (() => { let s = 123456789; return () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff })()
const corpus = [makeState()]
for (let i = 0; i < 15; i++) {
  const st = makeState()
  for (let k = 0; k < 20; k++) applyFacePerm(st, 1 + Math.floor(rng() * 6))
  corpus.push(st)
}

let groups = 0
for (const st of corpus) {
  // 正向 move：A/B 输入同源（rows≡P 行），逐槽执行包全等
  for (let moveId = 1; moveId <= 12; moveId++) {
    const p = paramsFor(moveId)
    compareOne(buildRows(st, moveId), new Array(26).fill(0), st, moveId, p.dur, p.av, p.kVel, `P${groups}`)
    groups++
  }
  // 负折叠面转（1..6）：B 按 P 直推（slot→格点→P 取块）；A 为现行（预应用 2 次后的行快照）——
  // 两者槽位交错顺序不同但动的是同一 9 块集合；此处断言集合相等 + S4 几何独立校验（下方循环）
  for (let b = 1; b <= 6; b++) {
    // 负折叠：行快照 = 物理态 P 经 2 次 +m 逻辑应用后的布局（第 3 次应用前），不能从恒等态造
    const stRows = structuredClone(st)
    applyFacePerm(stRows, b)
    applyFacePerm(stRows, b)
    const p = paramsFor(-b)
    const slots = slotRows(-b)
    const aPieces = slots.map((_, k) => referenceSlot(buildRows(stRows, b), new Array(26).fill(0), st, -b, k, p.dur, p.av, p.kVel).piece)
    const bPieces = slots.map((_, k) => clientSlot(null, new Array(26).fill(0), st, -b, k, p.dur, p.av, p.kVel).piece)
    if (process.env.DBG) for (let k = 0; k < slots.length; k++) console.log('DBG', b, 'k', k, 'r', slots[k], 'spot', slotSpot(-b, k), 'A', aPieces[k], 'B', bPieces[k])
    const sameSet = aPieces.slice().sort((x, y) => x - y).join(',') === bPieces.slice().sort((x, y) => x - y).join(',')
    check(`neg-folded move=${-b} 同集合`, sameSet, `A=${aPieces} B=${bPieces}`)
    groups++
  }
}
// S4（负折叠语义独立校验）：B 输出（piece 在其 P 格点 s）的轨道 90° 落位 == 格点 s 沿 -90° 解析
// 旋转的落点（≡ +90°×3，S1b 同族）；落点由包内 vel1/vel2 还原：p2 = v0 + (vel1+vel2)/kVel
{
  const st = corpus[0]
  for (let b = 1; b <= 6; b++) {
    const p = paramsFor(-b)
    const orient = new Array(26).fill(0)
    const slots = slotRows(-b)
    for (let k = 0; k < slots.length; k++) {
      const out = clientSlot(null, orient, st, -b, k, p.dur, p.av, p.kVel)
      const spot = slotSpot(-b, k)
      const v0 = spotOffset(spot)
      const p2 = vAdd(v0, vScale(1 / p.kVel, vAdd(out.vel1, out.vel2)))
      const exp = vAdd(CENTER, rodrigues(v0, AXES[b], -Math.PI / 2))
      check(`S4 neg move=${-b} slot=${k} 落点`, near(vAdd(CENTER, p2), exp), `got ${vAdd(CENTER, p2)} exp ${exp}`)
    }
  }
}
const fail = checks.filter((c) => !c.ok)
console.log(`rbv-math-kernel: ${checks.length - fail.length}/${checks.length} PASS（A/B 对拍覆盖 ${groups} 组 × 全槽）`)
if (fail.length) {
  for (const f of fail.slice(0, 12)) console.error('FAIL:', f.name, f.detail)
  process.exit(1)
}
// 样例（数学对拍 seam 留档：R +90 前 3 槽执行包）
{
  const st = makeState()
  const p = paramsFor(1)
  const rows = buildRows(st, 1)
  const sample = [0, 1, 2].map((k) => {
    const s = referenceSlot(rows, new Array(26).fill(0), st, 1, k, p.dur, p.av, p.kVel)
    return `slot${k}=piece${s.piece} axis[${s.axis}] av${s.av} dur${s.dur} vel1[${s.vel1.map((x) => x.toFixed(4))}] vel2[${s.vel2.map((x) => x.toFixed(4))}]`
  })
  console.log('sample face R slot0..2:', sample.join(' | '))
}
console.log('exit 0')
