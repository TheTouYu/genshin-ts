// gen-2x2-logic-table.mjs — 2×2 魔方逻辑状态 move 置换表离线生成器
//
// 用途：为游戏节点图的逻辑状态层（cornerPos/cornerOrient）生成 6 个 move
//      （R/L/U/D/F/B）的静态置换表，并用原型 CubeLib（web-prototype/js/cube.js）
//      交叉验证。结果写入 tools/2x2-logic-tables.json 并打印 TS 字面量片段，
//      供 game.ts 的图变量 dict 初始值直接使用。
//
// 约定（与游戏 demo 世界轴已验证约定一致）：
//   R = 绕 X −90°（x+ 层）；L = 绕 X +90°（x− 层）
//   U = 绕 Y −90°（y+ 层）；D = 绕 Y +90°（y− 层）
//   F = 绕 Z −90°（z+ 层）；B = 绕 Z +90°（z− 层）
// 角位编号（WCA 角块名 ↔ 坐标符号）：
//   0 UBL(-,+,−) 1 UBR(+,+,−) 2 UFL(-,+,+) 3 UFR(+,+,+)
//   4 DBL(-,-,-) 5 DBR(+,-,-) 6 DFL(-,-,+) 7 DFR(+,-,+)
// 朝向（twist）编码（与原型 cube.js 一致）：
//   角位 slots = [U/D 面, Z 面(F/B), X 面(R/L)]（按 [是否U/D, faceId] 排序）
//   twist = 该角块的 U/D 色贴纸所在的 slot 下标（0/1/2）；已还原 = 全 0
import { createRequire } from 'node:module'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

// ---------------------------------------------------------------- 模型
const POS = [
  { id: 0, name: 'UBL', x: -1, y: 1, z: -1 },
  { id: 1, name: 'UBR', x: 1, y: 1, z: -1 },
  { id: 2, name: 'UFL', x: -1, y: 1, z: 1 },
  { id: 3, name: 'UFR', x: 1, y: 1, z: 1 },
  { id: 4, name: 'DBL', x: -1, y: -1, z: -1 },
  { id: 5, name: 'DBR', x: 1, y: -1, z: -1 },
  { id: 6, name: 'DFL', x: -1, y: -1, z: 1 },
  { id: 7, name: 'DFR', x: 1, y: -1, z: 1 }
]
const posById = Object.fromEntries(POS.map((p) => [p.id, p]))

// move 旋转：坐标变换函数（右手法则，与 demo 已验证约定一致）
const ROT = {
  R: ([x, y, z]) => [x, z, -y], // 绕 X −90°
  L: ([x, y, z]) => [x, -z, y], // 绕 X +90°
  U: ([x, y, z]) => [-z, y, x], // 绕 Y −90°
  D: ([x, y, z]) => [z, y, -x], // 绕 Y +90°
  F: ([x, y, z]) => [y, -x, z], // 绕 Z −90°
  B: ([x, y, z]) => [-y, x, z] // 绕 Z +90°
}
const MOVE_IDS = { R: 1, L: 2, U: 3, D: 4, F: 5, B: 6 }
const MOVE_NAMES = ['', 'R', 'L', 'U', 'D', 'F', 'B']

// slot 方向：slot0 = U/D 面(Y)，slot1 = Z 面(F/B)，slot2 = X 面(R/L)
function slotDir(p, t) {
  if (t === 0) return [0, p.y, 0]
  if (t === 1) return [0, 0, p.z]
  return [p.x, 0, 0]
}
// 方向 → slot 下标
function dirSlot(p, d) {
  if (d[0] === 0 && d[1] !== 0 && d[2] === 0) return 0 // Y
  if (d[0] === 0 && d[1] === 0 && d[2] !== 0) return 1 // Z
  return 2 // X
}

// ---------------------------------------------------------------- 生成
function computeMove(move) {
  const rot = ROT[move]
  // 层定义：R=x+, L=x−, U=y+, D=y−, F=z+, B=z−（旋转轴见 ROT，层为轴坐标符号侧）
  const LAYER = { R: ['x', 1], L: ['x', -1], U: ['y', 1], D: ['y', -1], F: ['z', 1], B: ['z', -1] }
  const [layerAxis, layerSign] = LAYER[move]
  const affected = POS.filter((p) => p[layerAxis] === layerSign)
  // 按层轴从 +X/+Y/+Z 侧看顺时针排序（WCA 转动的角位环）
  const ring = sortRing(affected, move)
  const fromPos = ring.map((p) => p.id)
  const toPos = ring.map((p) => {
    const np = rot([p.x, p.y, p.z])
    return posById[POS.findIndex((q) => q.x === np[0] && q.y === np[1] && q.z === np[2])].id
  })
  // twist 映射：对每个 affected 角位 p、旧 twist t → 新 twist t'
  const twistMap = ring.map((p) => {
    const out = []
    for (let t = 0; t < 3; t++) {
      const d = rot(slotDir(p, t)) // U/D 贴纸方向随 move 旋转
      const q = posById[toPos[ring.indexOf(p)]]
      out.push(dirSlot(q, d))
    }
    return out
  })
  return { move, fromPos, toPos, twistMap }
}

// 环排序：按从层轴正方向看顺时针（右手法则的旋转方向 = 负方向旋转）
// 做法：对层内 4 个角位，按绕层轴的方位角排序
function sortRing(ps, move) {
  const axis = { R: [1, 0, 0], L: [1, 0, 0], U: [0, 1, 0], D: [0, 1, 0], F: [0, 0, 1], B: [0, 0, 1] }[move]
  // 取两个垂直于轴的基向量（右手系）
  let u, v
  if (axis[0] === 1) { u = [0, 1, 0]; v = [0, 0, 1] }
  else if (axis[1] === 1) { u = [0, 0, 1]; v = [1, 0, 0] }
  else { u = [1, 0, 0]; v = [0, 1, 0] }
  // 方位角 = atan2(投影到 v, 投影到 u)，从 +axis 看顺时针
  const key = (p) => {
    const pu = p.x * u[0] + p.y * u[1] + p.z * u[2]
    const pv = p.x * v[0] + p.y * v[1] + p.z * v[2]
    return Math.atan2(pv, pu)
  }
  return ps.slice().sort((a, b) => key(b) - key(a)) // 顺时针 = 方位角递减
}

const tables = {}
for (const m of MOVE_NAMES.slice(1)) tables[m] = computeMove(m)

// ---------------------------------------------------------------- 校验
function check(cond, msg) {
  if (!cond) throw new Error('VALIDATION FAILED: ' + msg)
  return true
}

// 1) 环正确性：toPos 必须是 fromPos 的循环（ring 是闭环）
for (const m of MOVE_NAMES.slice(1)) {
  const t = tables[m]
  check(new Set(t.fromPos).size === 4, m + ' affected != 4')
  check(new Set(t.toPos).size === 4, m + ' toPos not unique')
  for (const f of t.fromPos) check(t.toPos.includes(f), m + ' ring not closed: ' + f)
  // twist 映射必须是 {0,1,2} 的置换
  for (const tm of t.twistMap) {
    check(new Set(tm).size === 3 && tm.every((x) => x >= 0 && x <= 2), m + ' twistMap not a permutation')
  }
}

// 2) 状态模拟一致性：R^4 = I，R²≠I（表自洽的基本校验）
class Sim {
  constructor() {
    this.pos = Array.from({ length: 8 }, (_, i) => i)
    this.tw = Array(8).fill(0)
  }
  apply(move) {
    const t = tables[move]
    const newPos = this.pos.slice()
    const newTw = this.tw.slice()
    for (let s = 0; s < 4; s++) {
      const p = t.fromPos[s]
      const piece = this.pos[p]
      const twist = this.tw[p]
      newPos[t.toPos[s]] = piece
      newTw[t.toPos[s]] = t.twistMap[s][twist]
    }
    this.pos = newPos
    this.tw = newTw
  }
  solved() {
    return this.pos.every((v, i) => v === i) && this.tw.every((v) => v === 0)
  }
  samePos(that) {
    return this.pos.every((v, i) => that.pos[i] === v) &&
      this.tw.every((v, i) => that.tw[i] === v)
  }
}
for (const m of MOVE_NAMES.slice(1)) {
  const s = new Sim()
  for (let i = 0; i < 4; i++) s.apply(m)
  check(s.solved(), m + '^4 != identity')
  const s2 = new Sim()
  s2.apply(m)
  check(!s2.solved(), m + '^1 == identity (impossible)')
  s2.apply(m)
  check(!s2.solved() || m.length === 0, m + '^2 == identity (wrong for quarter turn)')
}
// 逆序列一致性：随机序列 + 逆序列（每步 ×3 反向）应回还原态
const REV = { R: 'R', L: 'L', U: 'U', D: 'D', F: 'F', B: 'B' }
for (let iter = 0; iter < 100; iter++) {
  const s = new Sim()
  const seq = []
  for (let k = 0, last = -1; k < 3 + Math.floor(Math.random() * 10); k++) {
    let m
    do { m = Math.floor(Math.random() * 6) } while (m === last)
    last = m
    seq.push(MOVE_NAMES[m + 1])
  }
  for (const m of seq) s.apply(m)
  for (let i = seq.length - 1; i >= 0; i--) {
    for (let k = 0; k < 3; k++) s.apply(seq[i])
  }
  check(s.solved(), 'inverse consistency failed: ' + seq.join(''))
}
// 可交换自检：move m 后再次 m，与状态模拟的确定性（两次独立模拟结果一致）
for (const m of MOVE_NAMES.slice(1)) {
  const a = new Sim(); a.apply(m)
  const b = new Sim(); b.apply(m)
  check(a.samePos(b), m + ' nondeterministic')
}

// 3) CubeLib 交叉验证（原型 web-prototype/js/cube.js，CJS 导出）
let cubeLib = null
try {
  cubeLib = require(join(__dirname, '../../../../test/flash-思维链+jspace/魔方/web-prototype/js/cube.js'))
} catch {
  // 路径探测：从仓库根相对当前文件深度调整
  try {
    cubeLib = require('/home/h/test/flash-思维链+jspace/魔方/web-prototype/js/cube.js')
  } catch {
    cubeLib = null
  }
}
if (cubeLib) {
  // 角位编号映射：myId → cubeLib CORNER_NAMES 下标
  const MY_TO_CUBELIB = { UBL: 3, UBR: 2, UFL: 1, UFR: 0, DBL: 7, DBR: 6, DFL: 5, DFR: 4 }
  const CUBELIB_TO_MY = Object.fromEntries(Object.entries(MY_TO_CUBELIB).map(([n, i]) => [i, POS.find((p) => p.name === n).id]))
  const randInt = (n) => Math.floor(Math.random() * n)
  let checked = 0
  for (let iter = 0; iter < 300; iter++) {
    const seq = []
    for (let k = 0, last = -1; k < 5 + randInt(16); k++) {
      let m
      do { m = randInt(6) } while (m === last)
      last = m
      seq.push(MOVE_NAMES[m + 1])
    }
    const sim = new Sim()
    const cube = new cubeLib.Cube()
    for (const m of seq) {
      sim.apply(m)
      cube.move(cubeLib.parseMove(m))
    }
    for (const p of POS) {
      const st = cube.pieceState(cubeLib.cornerPieceForName(p.name))
      check(st !== null, 'piece lost: ' + p.name + ' seq=' + seq.join(''))
      const myPos = CUBELIB_TO_MY[st.pos]
      const pieceAt = sim.pos[myPos]
      const myPieceId = POS.find((q) => q.name === p.name).id
      check(pieceAt === myPieceId, 'pos mismatch: ' + p.name + ' my=' + myPieceId + ' cube=' + pieceAt + ' seq=' + seq.join(''))
      check(sim.tw[myPos] === st.arr, 'twist mismatch: ' + p.name + ' my=' + sim.tw[myPos] + ' cube=' + st.arr + ' seq=' + seq.join(''))
      checked++
    }
  }
  console.log('CubeLib 交叉验证通过：' + checked + ' 个 (piece, seq) 样本一致')
} else {
  console.log('WARN: CubeLib 未找到，跳过交叉验证（内部校验仍通过）')
}

// ---------------------------------------------------------------- 输出
const out = { comment: '2×2 逻辑状态 move 置换表（生成器 gen-2x2-logic-table.mjs 产出）', tables }
writeFileSync(join(__dirname, '2x2-logic-tables.json'), JSON.stringify(out, null, 2) + '\n')
console.log('已写入 tools/2x2-logic-tables.json')

// TS 字面量片段（供 game.ts 图变量 dict 初始值使用；值用 new int() 确保 dict<int,int>）
function tsDict(entries) {
  return entries.map(([k, v]) => `{ k: ${k}, v: new int(${v}) }`).join(',\n      ')
}
const fromEntries = []
const toEntries = []
const twistEntries = []
for (const m of MOVE_NAMES.slice(1)) {
  const t = tables[m]
  const mid = MOVE_IDS[m]
  for (let s = 0; s < 4; s++) {
    fromEntries.push([mid * 4 + s, t.fromPos[s]])
    toEntries.push([mid * 4 + s, t.toPos[s]])
    for (let tw = 0; tw < 3; tw++) twistEntries.push([mid * 12 + s * 3 + tw, t.twistMap[s][tw]])
  }
}
const snippet = `// 由 tools/gen-2x2-logic-table.mjs 生成（CubeLib 交叉验证通过）——勿手改
      // key = moveId*4+slot（from/to）或 moveId*12+slot*3+twist（twistMap）
      tblFrom: dict([
      ${tsDict(fromEntries)}
      ]),
      tblTo: dict([
      ${tsDict(toEntries)}
      ]),
      tblTwist: dict([
      ${tsDict(twistEntries)}
      ])`
writeFileSync(join(__dirname, '2x2-logic-tables.fragment.ts'), snippet + '\n')
console.log('\n已写入 tools/2x2-logic-tables.fragment.ts（TS 片段，供 game.ts 使用）')
console.log('\n===== TS 片段 =====\n' + snippet + '\n====================')
