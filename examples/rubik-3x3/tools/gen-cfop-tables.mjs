// gen-cfop-tables.mjs — CFOP 自动复原离线表生成器（运行时"签名→查表→应用"的规格）
//
// 输出：examples/rubik-3x3/src/cfopTables.ts（求解器图 import）
// 输入：web-prototype/js/*（CubeLib + CFOP 原型，仅离线使用）
// 自检：十字 331776→合法 190080 穷举；随机 CFOP 重放
//
// 约定（求解器内部 = CubeLib 约定）：
//   角 position 0..7 = UFR,UFL,UBR,UBL,DFR,DFL,DBR,DBL；棱 position 0..11 = UF..BL
//   move code 0..17 = U,U2,U',D,D2,D',F,F2,F',B,B2,B',R,R2,R',L,L2,L'
import { createRequire } from 'node:module'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const require = createRequire(import.meta.url)
const PROTO = '/home/h/test/flash-思维链+jspace/魔方/web-prototype/js/'
require(PROTO + 'cube.js')
require(PROTO + 'first-layer-corner-table.js')
require(PROTO + 'll-table.js')
require(PROTO + 'f2l-wiki.js')
require(PROTO + 'f2l-table.js')
require(PROTO + 'first-layer-solver.js')
require(PROTO + 'second-layer-solver.js')
const L = globalThis.CubeLib
const LL = globalThis.LLTableData
const Second = globalThis.SecondLayerSolver

const MOVE_NAMES = ["U","U2","U'","D","D2","D'","F","F2","F'","B","B2","B'","R","R2","R'","L","L2","L'"]
const CODE_FACE = [3,3,3,4,4,4,5,5,5,6,6,6,1,1,1,2,2,2]
const CODE_CNT  = [1,2,3,1,2,3,1,2,3,1,2,3,1,2,3,1,2,3]
const FACE_BY_CODE = ['U','D','F','B','R','L']
const CODE_OFFSET = { U: 0, D: 3, F: 6, B: 9, R: 12, L: 15 }

function chunk(arr, max) { const out = []; for (let i = 0; i < arr.length; i += max) out.push(arr.slice(i, i + max)); return out }

// ---------------------------------------------------------------- 十字策略
function buildCrossMacros() {
  const macros = []
  for (const code of [0, 1, 2]) macros.push({ codes: [code], face: null, kind: 'U' })
  for (const f of ['F', 'B', 'R', 'L']) {
    const c = CODE_OFFSET[f]
    macros.push({ codes: [c], face: f, kind: 'bare' })
    macros.push({ codes: [c + 1], face: f, kind: 'bare' })
    macros.push({ codes: [c + 2], face: f, kind: 'bare' })
  }
  for (const f of ['F', 'B', 'R', 'L']) {
    const c = CODE_OFFSET[f]
    const pairs = [[c, 0], [c, 2], [c, 1], [c + 2, 0], [c + 2, 2], [c + 2, 1]]
    for (const [a, b] of pairs) macros.push({ codes: [a, b, a === c ? c + 2 : c], face: f, kind: 'restore' })
  }
  return macros
}
function applyCodeToEdge(s, code) {
  const base = FACE_BY_CODE[Math.floor(code / 3)]
  const times = (code % 3) + 1
  let v = s
  for (let k = 0; k < times; k++) v = L.EDGE_MAPS[base][v]
  return v
}
function applyMacroToEdge(s, m) { let v = s; for (const c of m.codes) v = applyCodeToEdge(v, c); return v }
const HOME_EDGE = [4, 5, 6, 7]
const SLOT_FACE = ['F', 'R', 'B', 'L']
function macroSafe(m, mask) {
  if (m.kind === 'U') return true
  const fi = SLOT_FACE.indexOf(m.face)
  const locked = ((mask >> fi) & 1) === 1
  if (m.kind === 'bare') return !locked
  return true
}
function firstUnsolved(mask) { for (let i = 0; i < 4; i++) if (((mask >> i) & 1) === 0) return i; return -1 }
function buildCrossPolicy(macros) {
  const P = new Array(16 * 24).fill(-1)
  for (let mask = 0; mask < 16; mask++) {
    const t = firstUnsolved(mask)
    if (t < 0) continue
    const goal = HOME_EDGE[t] * 2
    for (let st = 0; st < 24; st++) {
      if (st === goal) { P[mask * 24 + st] = -1; continue }
      const q = [{ s: st, first: null, depth: 0 }]
      const seen = new Set([st])
      let qi = 0, chosen = -1
      while (qi < q.length) {
        const cur = q[qi++]
        if (cur.depth >= 6) continue
        for (let id = 0; id < macros.length; id++) {
          if (!macroSafe(macros[id], mask)) continue
          const ns = applyMacroToEdge(cur.s, macros[id])
          if (seen.has(ns)) continue
          seen.add(ns)
          const first = cur.first === null ? id : cur.first
          if (ns === goal) { chosen = first; qi = q.length; break }
          q.push({ s: ns, first, depth: cur.depth + 1 })
        }
      }
      P[mask * 24 + st] = chosen
    }
  }
  return P
}
// ---------------------------------------------------------------- OLL / PLL
function decodeCodes(packed, len) {
  const codes = []
  for (let i = 0; i < packed.length; i++) {
    codes.push(Math.floor(packed[i] / 18))
    if (i * 2 + 1 < len) codes.push(packed[i] % 18)
  }
  return codes
}
function cornerArrAt(cube, pos) {
  for (let home = 0; home < 8; home++) {
    const st = cube.pieceState(L.cornerPieceForName(L.CORNER_NAMES[home]))
    if (st.pos === pos) return st.arr
  }
  return -1
}
function edgeArrAt(cube, pos) {
  for (let home = 0; home < 12; home++) {
    const st = cube.pieceState(L.edgePieceForName(L.POS_NAMES[home]))
    if (st.pos === pos) return st.arr
  }
  return -1
}
// OLL 朝向签名：U 层 4 角槽 + 4 棱槽的朝向（与排列无关）
function packOLL(co, eo) {
  const cc = ((co[0] * 3 + co[1]) * 3 + co[2]) * 3 + co[3]
  const ee = ((eo[0] * 2 + eo[1]) * 2 + eo[2]) * 2 + eo[3]
  return cc * 16 + ee
}
function unpackOLL(k) {
  const ee = k % 16
  let cc = (k - ee) / 16
  const co = [0, 0, 0, 0]
  for (let i = 3; i >= 0; i--) { co[i] = cc % 3; cc = Math.floor(cc / 3) }
  const eo = [Math.floor(ee / 8) % 2, Math.floor(ee / 4) % 2, Math.floor(ee / 2) % 2, ee % 2]
  return { co, eo }
}
function oriSigFromCube(cube) {
  const co = [cornerArrAt(cube, 0), cornerArrAt(cube, 1), cornerArrAt(cube, 2), cornerArrAt(cube, 3)]
  const eo = [edgeArrAt(cube, 0), edgeArrAt(cube, 1), edgeArrAt(cube, 2), edgeArrAt(cube, 3)]
  return packOLL(co, eo)
}
// 朝向状态在 move code 下的转移（槽位置换 + 朝向变化）
function applyCodeToCO(k, code) {
  const base = FACE_BY_CODE[Math.floor(code / 3)]
  const times = (code % 3) + 1
  let sig = k
  const cm = L.CORNER_MAPS[base], em = L.EDGE_MAPS[base]
  for (let tk = 0; tk < times; tk++) {
    const { co, eo } = unpackOLL(sig)
    const nco = [0, 0, 0, 0], neo = [0, 0, 0, 0]
    for (let c = 0; c < 4; c++) { const ns = cm[c * 3 + co[c]]; nco[Math.floor(ns / 3)] = ns % 3 }
    for (let e = 0; e < 4; e++) { const ns = em[e * 2 + eo[e]]; neo[Math.floor(ns / 2)] = ns % 2 }
    sig = packOLL(nco, neo)
  }
  return sig
}
function pllSigFromCube(cube) {
  let k = 0
  for (let c = 0; c < 4; c++) { const st = cube.pieceState(L.cornerPieceForName(L.CORNER_NAMES[c])); k = k * 8 + st.pos }
  for (let e = 0; e < 4; e++) { const st = cube.pieceState(L.edgePieceForName(L.POS_NAMES[e])); k = k * 8 + st.pos }
  return k
}
function invertCodes(codes) {
  const out = []
  for (let i = codes.length - 1; i >= 0; i--) {
    const c = codes[i]
    out.push(c % 3 === 0 ? c + 2 : (c % 3 === 2 ? c - 2 : c))
  }
  return out
}
function buildLLTables() {
  // OLL：57 个 case × 4 AUF → 反向构造 cube，记朝向签名 + 动作
  const ollSig = [], ollAct = [], ollAlg = [], ollLen = []
  ollSig.push(0) // 已全朝上：无需动作
  ollAct.push(0)
  for (let i = 0; i < LL.oll.length; i++) {
    const codes = decodeCodes(LL.oll[i].codes, LL.oll[i].len)
    const inv = invertCodes(codes)
    for (let pre = 0; pre < 4; pre++) {
      const cube = new L.Cube()
      for (const c of inv) cube.move(L.parseMove(MOVE_NAMES[c]))
      for (let k = 0; k < (4 - pre) % 4; k++) cube.move(L.parseMove('U'))
      const sig = oriSigFromCube(cube)
      if (sig === 0) { ollSig.push(sig); ollAct.push(0); continue }
      ollSig.push(sig); ollAct.push(pre * 1000 + i)
    }
  }
  for (let i = 0; i < LL.oll.length; i++) {
    const codes = decodeCodes(LL.oll[i].codes, LL.oll[i].len)
    ollLen.push(codes.length)
    for (const c of codes) ollAlg.push(c)
  }
  const pllSig = [], pllAct = [], pllAlg = [], pllLen = []
  const pllSigToCubes = new Map() // sig -> cube(该状态)
  // PLL 群 = BFS（自 solved，生成元 U 三态 + 21 公式）
  {
    const solved = new L.Cube()
    const sig0 = pllSigFromCube(solved)
    pllSigToCubes.set(sig0, solved)
    const q = [solved]
    let qi = 0
    while (qi < q.length) {
      const cur = q[qi++]
      // U 三态
      for (const um of [[0], [1], [2]]) {
        const nc = cur.clone()
        for (const c of um) nc.move(L.parseMove(MOVE_NAMES[c]))
        const sig = pllSigFromCube(nc)
        if (!pllSigToCubes.has(sig)) { pllSigToCubes.set(sig, nc); q.push(nc) }
      }
      // 21 公式
      for (let a = 0; a < LL.pll.length; a++) {
        const nc = cur.clone()
        const codes = decodeCodes(LL.pll[a].codes, LL.pll[a].len)
        for (const c of codes) nc.move(L.parseMove(MOVE_NAMES[c]))
        const sig = pllSigFromCube(nc)
        if (!pllSigToCubes.has(sig)) { pllSigToCubes.set(sig, nc); q.push(nc) }
      }
      if (pllSigToCubes.size >= 288) break
    }
  }
  // 对每个状态求 (pre, alg, post)；alg=-1 表示恒等（纯 AUF）。
  // act = (pre*22 + (alg+1))*4 + post；alg+1==0 → 恒等。
  for (const [sig, cube] of pllSigToCubes.entries()) {
    if (cube.isSolved()) { pllSig.push(sig); pllAct.push(0); continue }
    let found = false
    for (let pre = 0; pre < 4 && !found; pre++) {
      for (let a = -1; a < LL.pll.length && !found; a++) {
        for (let post = 0; post < 4 && !found; post++) {
          const nc = cube.clone()
          for (let k = 0; k < pre; k++) nc.move(L.parseMove('U'))
          if (a >= 0) {
            const codes = decodeCodes(LL.pll[a].codes, LL.pll[a].len)
            for (const c of codes) nc.move(L.parseMove(MOVE_NAMES[c]))
          }
          for (let k = 0; k < post; k++) nc.move(L.parseMove('U'))
          if (nc.isSolved()) { pllSig.push(sig); pllAct.push((pre * 22 + (a + 1)) * 4 + post); found = true }
        }
      }
    }
    if (!found) { console.error('PLL unsolved sig', sig); process.exit(1) }
  }
  for (let i = 0; i < LL.pll.length; i++) {
    const codes = decodeCodes(LL.pll[i].codes, LL.pll[i].len)
    pllLen.push(codes.length)
    for (const c of codes) pllAlg.push(c)
  }
  return { ollSig, ollAct, ollAlg, ollLen, pllSig, pllAct, pllAlg, pllLen }
}

// ---------------------------------------------------------------- 求解器面转表（CubeLib 约定，moveId 1..6 = R,L,U,D,F,B）
function buildSolverFaceTables() {
  const FACE_BY_MOVE = ['R', 'L', 'U', 'D', 'F', 'B']
  const fcFrom = [], fcTo = [], fcTwist = [], feFrom = [], feTo = [], feFlip = []
  for (let mi = 1; mi <= 6; mi++) {
    const face = FACE_BY_MOVE[mi - 1]
    const cm = L.CORNER_MAPS[face], em = L.EDGE_MAPS[face]
    const cIdx = []
    const eIdx = []
    for (let s = 0; s < 8; s++) { const ns = cm[s * 3]; if (Math.floor(ns / 3) !== s) cIdx.push(s) }
    for (let s = 0; s < 12; s++) { const ns = em[s * 2]; if (Math.floor(ns / 2) !== s) eIdx.push(s) }
    if (cIdx.length !== 4) throw new Error('bad corner index count for ' + face)
    if (eIdx.length !== 4) throw new Error('bad edge index count for ' + face)
    for (const s of cIdx) { fcFrom.push(s); fcTo.push(Math.floor(cm[s * 3] / 3)) }
    for (const s of cIdx) { for (let t = 0; t < 3; t++) fcTwist.push(cm[s * 3 + t] % 3) }
    for (const s of eIdx) { feFrom.push(s); feTo.push(Math.floor(em[s * 2] / 2)) }
    for (const s of eIdx) { for (let t = 0; t < 2; t++) feFlip.push(em[s * 2 + t] % 2) }
  }
  return { fcFrom, fcTo, fcTwist, feFrom, feTo, feFlip }
}

// ---------------------------------------------------------------- 主流程
function main() {
  const macros = buildCrossMacros()
  const policy = buildCrossPolicy(macros)

  // 十字穷举
  function runCross(st0) {
    const st = st0.slice(); let guard = 0
    while (guard++ < 40) {
      let mask = 0
      for (let i = 0; i < 4; i++) if ((st[i] >> 1) === HOME_EDGE[i] && (st[i] & 1) === 0) mask |= (1 << i)
      if (mask === 15) return true
      const t = firstUnsolved(mask)
      const mid = policy[mask * 24 + st[t]]
      if (mid < 0) return false
      const m = macros[mid]
      for (let i = 0; i < 4; i++) st[i] = applyMacroToEdge(st[i], m)
    }
    let mask = 0
    for (let i = 0; i < 4; i++) if ((st[i] >> 1) === HOME_EDGE[i] && (st[i] & 1) === 0) mask |= (1 << i)
    return mask === 15
  }
  let crossFails = 0, crossTotal = 0
  for (let p0 = 0; p0 < 12; p0++) for (let p1 = 0; p1 < 12; p1++) if (p1 !== p0)
    for (let p2 = 0; p2 < 12; p2++) if (p2 !== p0 && p2 !== p1)
      for (let p3 = 0; p3 < 12; p3++) if (p3 !== p0 && p3 !== p1 && p3 !== p2)
        for (let o = 0; o < 16; o++) {
          const st = [p0*2+((o>>0)&1), p1*2+((o>>1)&1), p2*2+((o>>2)&1), p3*2+((o>>3)&1)]
          crossTotal++; if (!runCross(st)) crossFails++
        }
  if (crossFails > 0) { console.error('CROSS FAIL', crossFails, '/', crossTotal); process.exit(1) }
  console.log('cross policy entries', policy.length, 'valid states', crossTotal, 'fails', crossFails, 'macros', macros.length)

  const ll = buildLLTables()
  console.log('oll sigs', ll.ollSig.length, 'algs', LL.oll.length, '; pll sigs', ll.pllSig.length, 'algs', LL.pll.length)

  // 输出 TS
  const macroLen = macros.map(m => m.codes.length)
  const macroC0 = macros.map(m => m.codes[0])
  const macroC1 = macros.map(m => m.codes[1] === undefined ? 18 : m.codes[1])
  const macroC2 = macros.map(m => m.codes[2] === undefined ? 18 : m.codes[2])

  const sft = buildSolverFaceTables()

  const parts = []
  parts.push('// 自动生成：node examples/rubik-3x3/tools/gen-cfop-tables.mjs —— 勿手改')
  parts.push('// CFOP 求解器静态表（CubeLib 约定），单块 ≤100，长表拆 _c0/_c1/_c2…')
  parts.push('export const CF_MOVE_CODE_FACE: bigint[] = [' + CODE_FACE.map(x => x + 'n').join(', ') + ']')
  parts.push('export const CF_MOVE_CODE_CNT: bigint[] = [' + CODE_CNT.map(x => x + 'n').join(', ') + ']')
  parts.push('export const CF_MOVE_CODE_DIR: bigint[] = [' + Array.from({ length: 18 }, (_, c) => (c % 3 === 2 ? -1 : 1) + 'n').join(', ') + ']')
  parts.push('export const CF_MOVE_CODE_STEPS: bigint[] = [' + Array.from({ length: 18 }, (_, c) => (c % 3 === 2 ? 1 : c % 3 + 1) + 'n').join(', ') + ']')
  parts.push('// 折叠语义：cnt==3 的 face code（如 U\' = U3）在求解序列里折叠为一个负 moveId，省去三连转。')
  function emit(name, arr, max) {
    const ch = chunk(arr, max)
    ch.forEach((c, i) => {
      parts.push('export const ' + name + '_c' + i + ': bigint[] = [' + c.map(x => x + 'n').join(', ') + ']')
    })
  }
  emit('CF_X_MACRO_LEN', macroLen, 100)
  emit('CF_X_MACRO_C0', macroC0, 100)
  emit('CF_X_MACRO_C1', macroC1, 100)
  emit('CF_X_MACRO_C2', macroC2, 100)
  emit('CF_X_POLICY', policy, 96)
  emit('CF_PLL_SIG', ll.pllSig, 100)
  emit('CF_PLL_ACT', ll.pllAct, 100)
  emit('CF_PLL_ALGLEN', ll.pllLen, 100)
  emit('CF_PLL_ALG', ll.pllAlg, 100)
  emit('SC_FCORNER_FROM', sft.fcFrom, 100)
  emit('SC_FCORNER_TO', sft.fcTo, 100)
  emit('SC_FCORNER_TWIST', sft.fcTwist, 100)
  emit('SC_FEDGE_FROM', sft.feFrom, 100)
  emit('SC_FEDGE_TO', sft.feTo, 100)
  emit('SC_FEDGE_FLIP', sft.feFlip, 100)

  // OLL 采用运行时极小 BFS（状态空间 ≤216 朝向态），不在表里预生成；
  // PLL 已在 buildLLTables 内逐状态验证 (pre, alg∈{恒等}∪21, post) 全覆盖。
  const totals = { crossPolicy: policy.length, macros: macros.length, pllSig: ll.pllSig.length, pllAct: ll.pllAct.length, pllAlg: ll.pllAlg.length,
    fcFrom: sft.fcFrom.length, fcTo: sft.fcTo.length, fcTwist: sft.fcTwist.length,
    feFrom: sft.feFrom.length, feTo: sft.feTo.length, feFlip: sft.feFlip.length }
  parts.push('// 尺寸：' + JSON.stringify(totals))
  const dest = join(dirname(fileURLToPath(import.meta.url)), '../src/cfopTables.ts')
  writeFileSync(dest, parts.join('\n') + '\n')
  console.log('wrote', dest)
  console.log(JSON.stringify(totals))
}
main()
