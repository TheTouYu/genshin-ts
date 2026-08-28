// gen-oll-tables.mjs — 顶层 OLL 表生成器（stage 4 用，CubeLib 约定）
// 输出：examples/rubik-3x3/src/ollTables.ts
// OLL 表存「sig→solved 的正序求解 token 序列」（最多 2 token）：
//   token 0/1/2 = U/U2/U'（move code 0/1/2），3+j = 逆公式 j（codes 在 CF_OLL_ALG_INV）
//   action 编码 = a1 + (a2+1)*64，a2=-1 表示单 token。
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
const ollAlgCodes = LL.oll.map(e => decodeCodes(e.codes, e.len))
const ollAlgInv = ollAlgCodes.map(codes => invertCodes(codes))

// 正向 BFS：solved →(正 token)→ sig；正 token 定义：0/1/2=U/U2/U'，3+i=公式 i
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

// 求解 token 序列 = 反转 path，每个正 token 取逆
// 逆 token 编码（运行时）：0/1/2 = U/U2/U'（move code 0/1/2），3+j = 逆公式 j
function invToken(t) {
  if (t <= 2) {
    // U(0)→U'(2), U2(1)→U2(1), U'(2)→U(0)
    return t === 1 ? 1 : (t === 0 ? 2 : 0)
  }
  return t // 公式 token 保持 id（3+i 引用逆公式 i）
}
const ACT = new Array(81 * 16).fill(-1)
for (const [sig, path] of bestPath.entries()) {
  const rev = path.slice().reverse().map(invToken)
  const a1 = rev[0], a2 = rev.length > 1 ? rev[1] : -1
  ACT[sig] = a1 + (a2 + 1) * 64
}
const legal = ACT.filter(x => x >= 0).length
console.log('ACT legal:', legal, '（sig=0 已朝向，不计入）')

const ALGLEN = ollAlgInv.map(c => c.length)
const ALG = ollAlgInv.flat()

function chunk(arr, max) { const out = []; for (let i = 0; i < arr.length; i += max) out.push(arr.slice(i, i + max)); return out }
function emit(name, arr, max) {
  const parts = []
  chunk(arr, max).forEach((c, i) => {
    parts.push('export const ' + name + '_c' + i + ': bigint[] = [' + c.map(x => x + 'n').join(', ') + ']')
  })
  return parts
}
const out = []
out.push('// 自动生成：node examples/rubik-3x3/tools/gen-oll-tables.mjs —— 勿手改')
out.push('// 顶层 OLL 表（CubeLib 约定）：sig=cc*16+ee 索引 action=a1+(a2+1)*64；token 0/1/2=U/U2/U\'，3+j=逆公式j')
out.push(...emit('CF_OLL_ACT', ACT, 100))
out.push(...emit('CF_OLL_ALGLEN', ALGLEN, 100))
out.push(...emit('CF_OLL_ALG', ALG, 100))
out.push('// 尺寸：' + JSON.stringify({ act: ACT.length, legal, algLen: ALGLEN.length, alg: ALG.length }))
const dest = join(dirname(fileURLToPath(import.meta.url)), '../src/ollTables.ts')
writeFileSync(dest, out.join('\n') + '\n')
console.log('wrote', dest)
