// gen-oll-tables.mjs — 顶层 OLL 表生成器（stage 4 用，CubeLib 约定）
// 输出：examples/rubik-3x3-client/src/ollTables.ts
// 紧凑索引：sig_compact = (co0*9+co1*3+co2)*8 + (eo0*4+eo1*2+eo2)
//   其中 co0..co2 = U层 4 角前 3 个 twist（第 4 个由 sum%3==0 约束），
//         eo0..eo2 = U层 4 棱前 3 个 flip（第 4 个由 sum%2==0 约束）。
//   共 27×8 = 216 个合法朝向态。
// action 编码 = a1 + (a2+1)*64；token 0/1/2 = U/U2/U'（move code），3+j = 逆公式 j。
import { createRequire } from 'node:module'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const require = createRequire(import.meta.url)
const PROTO = '/home/h/test/flash-思维链+jspace/魔方/web-prototype/js/'
require(PROTO + 'cube.js')
require(PROTO + 'll-table.js')
const L = globalThis.CubeLib
const LL = globalThis.LLTableData

const MOVE_NAMES = ["U","U2","U'","D","D2","D'","F","F2","F'","B","B2","B'","R","R2","R'","L","L2","L'"]

function decodeCodes(packed, len) {
  const codes = []
  for (let i = 0; i < packed.length; i++) {
    codes.push(Math.floor(packed[i] / 18))
    if (i * 2 + 1 < len) codes.push(packed[i] % 18)
  }
  return codes
}
function invertCodes(codes) {
  const out = []
  for (let i = codes.length - 1; i >= 0; i--) {
    const c = codes[i]
    out.push(c % 3 === 0 ? c + 2 : (c % 3 === 2 ? c - 2 : c))
  }
  return out
}
function cornerArrAt(cube, pos) {
  for (let h = 0; h < 8; h++) {
    const st = cube.pieceState(L.cornerPieceForName(L.CORNER_NAMES[h]))
    if (st.pos === pos) return st.arr
  }
  return -1
}
function edgeArrAt(cube, pos) {
  for (let h = 0; h < 12; h++) {
    const st = cube.pieceState(L.edgePieceForName(L.POS_NAMES[h]))
    if (st.pos === pos) return st.arr
  }
  return -1
}
function oriSig(cube) {
  const co = [cornerArrAt(cube,0), cornerArrAt(cube,1), cornerArrAt(cube,2), cornerArrAt(cube,3)]
  const eo = [edgeArrAt(cube,0), edgeArrAt(cube,1), edgeArrAt(cube,2), edgeArrAt(cube,3)]
  const cc = ((co[0]*3+co[1])*3+co[2])*3+co[3]
  const ee = ((eo[0]*2+eo[1])*2+eo[2])*2+eo[3]
  return cc*16+ee
}
// 紧凑索引（运行时）：前 3 个 co + 前 3 个 eo
function compactIdx(co, eo) {
  return (co[0]*9 + co[1]*3 + co[2])*8 + (eo[0]*4 + eo[1]*2 + eo[2])
}
const ollAlgCodes = LL.oll.map(e => decodeCodes(e.codes, e.len))
const ollAlgInv = ollAlgCodes.map(codes => invertCodes(codes))

// 正向 BFS：solved →(正 token)→ sig；正 token：0/1/2=U/U2/U'，3+i=公式 i
const gens = [
  { codes: [0], token: 0 }, { codes: [1], token: 1 }, { codes: [2], token: 2 },
  ...ollAlgCodes.map((codes, i) => ({ codes, token: 3 + i }))
]
const q = [{ cube: new L.Cube(), path: [] }]
const bestPath = new Map([[0, []]])
let head = 0
while (head < q.length) {
  const { cube, path } = q[head++]
  for (const g of gens) {
    const nc = cube.clone()
    for (const code of g.codes) nc.move(L.parseMove(MOVE_NAMES[code]))
    const ns = oriSig(nc)
    const np = path.concat([g.token])
    if (!bestPath.has(ns)) {
      bestPath.set(ns, np)
      if (np.length < 2) q.push({ cube: nc, path: np })
    }
  }
}
console.log('OLL covered sigs:', bestPath.size, '/ 216')

function invToken(t) {
  if (t <= 2) return t === 1 ? 1 : (t === 0 ? 2 : 0)
  return t
}
// 216 项紧凑表
const ACT = new Array(216).fill(-1)
let filled = 0
for (const [sig, path] of bestPath.entries()) {
  const co = [Math.floor(sig/16/27)%3, Math.floor(sig/16/9)%3, Math.floor(sig/16/3)%3, Math.floor(sig/16)%3]
  const eo = [Math.floor((sig%16)/8)%2, Math.floor((sig%16)/4)%2, Math.floor((sig%16)/2)%2, sig%2]
  const idx = compactIdx(co, eo)
  if (idx === 0) continue // sig=0 已朝向，运行时跳过
  const rev = path.slice().reverse().map(invToken)
  const a1 = rev[0], a2 = rev.length > 1 ? rev[1] : -1
  ACT[idx] = a1 + (a2 + 1) * 64
  filled++
}
console.log('ACT compact filled:', filled, '（应=215，sig0 跳过）')

const ALGLEN = ollAlgInv.map(c => c.length)
const ALGOFF = []
let _acc = 0
for (const len of ALGLEN) { ALGOFF.push(_acc); _acc += len }
const ALG = ollAlgInv.flat()

function chunk(arr, max) { const out = []; for (let i = 0; i < arr.length; i += max) out.push(arr.slice(i, i + max)); return out }
function emit(name, arr, max) {
  const parts = []
  const ch = chunk(arr, max)
  ch.forEach((c, i) => {
    // 补齐最后一块到 max（用 18 填充无效值），避免乘法选择器越界读
    if (c.length < max) {
      const pad = new Array(max - c.length).fill(18)
      c = c.concat(pad)
    }
    parts.push('export const ' + name + '_c' + i + ': bigint[] = [' + c.map(x => x + 'n').join(', ') + ']')
  })
  return parts
}
const out = []
out.push('// 自动生成：node examples/rubik-3x3-client/tools/gen-oll-tables.mjs —— 勿手改')
out.push('// 顶层 OLL 表（CubeLib 约定）：紧凑索引 sig=(co0*9+co1*3+co2)*8+(eo0*4+eo1*2+eo2)')
out.push('// action=a1+(a2+1)*64；token 0/1/2=U/U2/U\'，3+j=逆公式j')
out.push(...emit('CF_OLL_ACT', ACT, 100))
out.push(...emit('CF_OLL_ALGLEN', ALGLEN, 100))
out.push(...emit('CF_OLL_ALGOFF', ALGOFF, 100))
out.push(...emit('CF_OLL_ALG', ALG, 100))
out.push('// 尺寸：' + JSON.stringify({ act: ACT.length, filled, algLen: ALGLEN.length, algOff: ALGOFF.length, alg: ALG.length }))
const dest = join(dirname(fileURLToPath(import.meta.url)), '../src/ollTables.ts')
writeFileSync(dest, out.join('\n') + '\n')
console.log('wrote', dest)
