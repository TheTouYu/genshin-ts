// gen-e-layer-tables.mjs — 中二层（E 层棱块）离线宏表生成器
//
// 输出：examples/rubik-3x3/src/eLayerTables.ts（求解器图 import）
//        examples/rubik-3x3/tools/e-layer-policy.json（宏/策略留档）
// 输入：web-prototype/js/*（CubeLib + second-layer-solver，仅离线使用）
//
// 约定（与 CF_X / CF_CORNER 表一致）：
//   棱 position 0..11 = UF,UR,UB,UL,DF,DR,DB,DL,FR,FL,BR,BL
//   E 层 4 棱 = position 8..11（FR/FL/BR/BL）
//   边 state = pos*2 + eo；solved state = home*2（pos==home 且 eo==0）
//   policy 索引 = mask*24 + state（同 CF_X/CF_CORNER，384 项 ≤ 4 块×96）
//   move code 0..17 = U,U2,U',D,D2,D',F,F2,F',B,B2,B',R,R2,R',L,L2,L'（18=NOP 占位）
//
// 宏集（来自 second-layer-solver.js 的 F2L 插入/提取公式，全部保持第一层）：
//   - U/U2/U' 三单转（只动 U 层）
//   - 每个 E 槽 1 条提取公式（槽内棱 → U 层）
//   - 每个 E 槽 2 条插入公式 × 4 个 U 预转（U 层棱 → 槽内）
// 共 3 + 4 + 32 = 39 条；BFS 找每个 (mask, state) 到目标的最短首步宏。
import { createRequire } from 'node:module'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const require = createRequire(import.meta.url)
const PROTO = '/home/h/test/flash-思维链+jspace/魔方/web-prototype/js/'
require(PROTO + 'cube.js')
const L = globalThis.CubeLib

const FACE_BY_CODE = ['U', 'D', 'F', 'B', 'R', 'L']

function moveNameToCode(name) {
  const m = /^([UDLRFB])(2?)([']?)$/.exec(String(name).trim())
  if (!m) throw new Error('bad move: ' + name)
  const face = m[1]
  let cnt = m[2] === '2' ? 2 : (m[3] === "'" ? 3 : 1)
  return FACE_BY_CODE.indexOf(face) * 3 + (cnt - 1)
}
function algToCodes(alg) {
  return String(alg).split(/\s+/).filter(Boolean).map(moveNameToCode)
}
function applyCodeToEdge(s, code) {
  const base = FACE_BY_CODE[Math.floor(code / 3)]
  const times = (code % 3) + 1
  let v = s
  for (let k = 0; k < times; k++) v = L.EDGE_MAPS[base][v]
  return v
}
function applyMacroToEdge(s, codes) {
  let v = s
  for (const c of codes) v = applyCodeToEdge(v, c)
  return v
}

// ---------------------------------------------------------------- 宏集
const EDGE_INSERT = {
  8:  ["U R U' R' U' F' U F", "U' F' U F U R U' R'"],
  9:  ["U' L' U L U F U' F'", "U F U' F' U' L' U L"],
  10: ["U' R' U R U B U' B'", "U B U' B' U' R' U R"],
  11: ["U L U' L' U' B' U B", "U' B' U B U L U' L'"],
}
const EDGE_EXTRACT = {
  8:  "F' U' F U R U R' U'",
  9:  "F U F' U' L' U' L U",
  10: "B U B' U' R' U' R U",
  11: "B' U' B U L U L' U'",
}
const PRE = ['', 'U', 'U2', "U'"]

const macros = []
for (const c of [0, 1, 2]) macros.push({ codes: [c], slot: null, kind: 'U' })
for (const s of [8, 9, 10, 11]) macros.push({ codes: algToCodes(EDGE_EXTRACT[s]), slot: s, kind: 'extract' })
for (const s of [8, 9, 10, 11]) {
  for (const alg of EDGE_INSERT[s]) {
    for (const pre of PRE) {
      const full = pre ? pre + ' ' + alg : alg
      macros.push({ codes: algToCodes(full), slot: s, kind: 'insert' })
    }
  }
}
const maxLen = Math.max(...macros.map(m => m.codes.length))

// ---------------------------------------------------------------- 策略 BFS
function macroSafe(m, mask) {
  if (m.slot === null) return true
  const bit = m.slot - 8
  return ((mask >> bit) & 1) === 0
}
function firstUnsolved(mask) { for (let i = 0; i < 4; i++) if (((mask >> i) & 1) === 0) return i; return -1 }

function buildEPolicy() {
  const P = new Array(16 * 24).fill(-1)
  let unfilled = 0
  for (let mask = 0; mask < 16; mask++) {
    const t = firstUnsolved(mask)
    if (t < 0) continue
    const home = 8 + t
    const goal = home * 2
    for (let st = 0; st < 24; st++) {
      if (st === goal) continue
      const pos = st >> 1
      // 目标棱不可能位于已解决槽 → 跳过已解决槽（D 层位置 4..7 在第二层阶段不可达）
      if (pos >= 8 && ((mask >> (pos - 8)) & 1) === 1) continue
      const q = [{ s: st, first: null, depth: 0 }]
      const seen = new Set([st])
      let qi = 0, chosen = -1
      while (qi < q.length) {
        const cur = q[qi++]
        if (cur.depth >= 6) continue
        for (let id = 0; id < macros.length; id++) {
          if (!macroSafe(macros[id], mask)) continue
          const ns = applyMacroToEdge(cur.s, macros[id].codes)
          if (seen.has(ns)) continue
          seen.add(ns)
          const first = cur.first === null ? id : cur.first
          if (ns === goal) { chosen = first; qi = q.length; break }
          q.push({ s: ns, first, depth: cur.depth + 1 })
        }
      }
      P[mask * 24 + st] = chosen
      if (chosen < 0) unfilled++
    }
  }
  return { P, unfilled }
}

const { P: policy, unfilled } = buildEPolicy()
console.log('macros:', macros.length, 'maxLen:', maxLen, 'policy unfilled:', unfilled, '/', 16 * 24)
if (unfilled > 0) {
  console.log('WARN: 有不可达/未填充 policy 项，需核对')
  for (let mask = 0; mask < 16; mask++) for (let st = 0; st < 24; st++) {
    const idx = mask * 24 + st
    if (policy[idx] < 0 && (st >> 1) < 4) console.log('  unexpected unfilled mask=' + mask + ' st=' + st)
  }
}

// ---------------------------------------------------------------- 输出 TS
function chunk(arr, max) { const out = []; for (let i = 0; i < arr.length; i += max) out.push(arr.slice(i, i + max)); return out }
const macroLen = macros.map(m => m.codes.length)
const macroC = []
for (let k = 0; k < maxLen; k++) macroC.push(macros.map(m => m.codes[k] === undefined ? 18 : m.codes[k]))

const parts = []
parts.push('// 自动生成：node examples/rubik-3x3/tools/gen-e-layer-tables.mjs —— 勿手改')
parts.push('// 中二层(E层)棱块策略：E 棱 = ep 索引 8..11（FR/FL/BR/BL）；state=pos*2+eo；宏: move code 0..17；未填 policy=-1')
function emit(name, arr, max) {
  const ch = chunk(arr, max)
  ch.forEach((c, i) => {
    parts.push('export const ' + name + '_c' + i + ': bigint[] = [' + c.map(x => x + 'n').join(', ') + ']')
  })
}
emit('CF_E_MACRO_LEN', macroLen, 100)
for (let k = 0; k < maxLen; k++) emit('CF_E_MACRO_C' + k, macroC[k], 100)
emit('CF_E_POLICY', policy, 96)

const totals = { ePolicy: policy.length, eMacros: macros.length, eMaxLen: maxLen, unfilled }
parts.push('// 尺寸：' + JSON.stringify(totals))
const dest = join(dirname(fileURLToPath(import.meta.url)), '../src/eLayerTables.ts')
writeFileSync(dest, parts.join('\n') + '\n')
console.log('wrote', dest)
console.log(JSON.stringify(totals))

// 留档 JSON
const jsonDest = join(dirname(fileURLToPath(import.meta.url)), 'e-layer-policy.json')
writeFileSync(jsonDest, JSON.stringify({ macros: macros.map(m => m.codes), policy, maxLen, totals }, null, 1))
console.log('wrote', jsonDest)
