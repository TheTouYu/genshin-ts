// gen-pll-tables.mjs — 顶层 PLL 紧凑索引表生成器（stage 4 用，CubeLib 约定）
// 输出：examples/rubik-3x3/src/pllTables.ts
// 紧凑索引：角排列索引（0..23，阶乘进制）×24 + 棱排列索引（0..23）
//   角排列：U 层 4 角（UFR,UFL,UBR,UBL）在 4 个 U 层位置的排列
//   棱排列：U 层 4 棱（UF,UR,UB,UL）在 4 个 U 层位置的排列
//   ACT[角idx*24+棱idx] = action（pre*22+alg+1)*4+post；非法排列 -1。
import { createRequire } from 'node:module'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const require = createRequire('/home/h/test/flash-思维链+jspace/魔方/web-prototype/js/')
const PROTO = '/home/h/test/flash-思维链+jspace/魔方/web-prototype/js/'
require(PROTO + 'cube.js')
require(PROTO + 'll-table.js')
const L = globalThis.CubeLib
const LL = globalThis.LLTableData

const MOVE_NAMES = ["U","U2","U'","D","D2","D'","F","F2","F'","B","B2","B'","R","R2","R'","L","L2","L'"]
function decodeCodes(packed, len) { const codes=[]; for(let i=0;i<packed.length;i++){codes.push(Math.floor(packed[i]/18)); if(i*2+1<len) codes.push(packed[i]%18)} return codes }
const PLL_FORMULAS = LL.pll.map(e => decodeCodes(e.codes, e.len))

// 阶乘进制：4 位置排列 → 0..23
function permIndex(pos) {
  // pos = [p0,p1,p2,p3] 是 0..3 的排列
  const p0 = pos[0]
  const p1 = pos[1] - (pos[1] > p0 ? 1 : 0)
  const p2 = pos[2] - (pos[2] > p0 ? 1 : 0) - (pos[2] > pos[1] ? 1 : 0)
  return p0*6 + p1*2 + p2
}
function cornerPositions(cube) {
  const out = []
  for (let c = 0; c < 4; c++) out.push(cube.pieceState(L.cornerPieceForName(L.CORNER_NAMES[c])).pos)
  return out
}
function edgePositions(cube) {
  const out = []
  for (let e = 0; e < 4; e++) out.push(cube.pieceState(L.edgePieceForName(L.POS_NAMES[e])).pos)
  return out
}
function isSolved(cube) { return cube.isSolved() }

// BFS：生成 288 个 PLL 态，每个求 action，存紧凑表
const ACT = new Array(24*24).fill(-1)
let filled = 0
const q = [{ cube: new L.Cube() }]
const seen = new Set()
seen.add(JSON.stringify([cornerPositions(new L.Cube()), edgePositions(new L.Cube())]))
let head = 0
const AUF = [[], [0], [1], [2]]
while (head < q.length) {
  const cube = q[head++].cube
  const cp = cornerPositions(cube), ep = edgePositions(cube)
  const ci = permIndex(cp), ei = permIndex(ep)
  const compact = ci*24 + ei
  if (ACT[compact] === -1) {
    // 求 action（pre, alg, post）
    let found = false
    for (let pre = 0; pre < 4 && !found; pre++) {
      for (let a = -1; a < 21 && !found; a++) {
        for (let post = 0; post < 4 && !found; post++) {
          const nc = cube.clone()
          for (let k = 0; k < pre; k++) nc.move(L.parseMove('U'))
          if (a >= 0) for (const code of PLL_FORMULAS[a]) nc.move(L.parseMove(MOVE_NAMES[code]))
          for (let k = 0; k < post; k++) nc.move(L.parseMove('U'))
          if (nc.isSolved()) {
            ACT[compact] = (pre*22 + (a+1))*4 + post
            filled++
            found = true
          }
        }
      }
    }
    if (!found) { console.error('PLL unsolved', cp, ep); process.exit(1) }
  }
  // 扩展：U 三态 + 21 公式
  for (const u of AUF) {
    const nc = cube.clone()
    for (const code of u) nc.move(L.parseMove(MOVE_NAMES[code]))
    const key = JSON.stringify([cornerPositions(nc), edgePositions(nc)])
    if (!seen.has(key)) { seen.add(key); q.push({ cube: nc }) }
  }
  for (let a = 0; a < 21; a++) {
    const nc = cube.clone()
    for (const code of PLL_FORMULAS[a]) nc.move(L.parseMove(MOVE_NAMES[code]))
    const key = JSON.stringify([cornerPositions(nc), edgePositions(nc)])
    if (!seen.has(key)) { seen.add(key); q.push({ cube: nc }) }
  }
}
console.log('PLL compact filled:', filled, '/ 288')

function chunk(arr, max) { const out = []; for (let i = 0; i < arr.length; i += max) out.push(arr.slice(i, i + max)); return out }
function emit(name, arr, max) {
  const parts = []
  chunk(arr, max).forEach((c, i) => {
    parts.push('export const ' + name + '_c' + i + ': bigint[] = [' + c.map(x => x + 'n').join(', ') + ']')
  })
  return parts
}
const out = []
out.push('// 自动生成：node examples/rubik-3x3/tools/gen-pll-tables.mjs —— 勿手改')
out.push('// 顶层 PLL 紧凑表：角排列索引(0..23)×24+棱排列索引(0..23)；action=(pre*22+alg+1)*4+post')
out.push(...emit('CF_PLLC_ACT', ACT, 100))
out.push('// 尺寸：' + JSON.stringify({ act: ACT.length, filled }))
const dest = join(dirname(fileURLToPath(import.meta.url)), '../src/pllTables.ts')
writeFileSync(dest, out.join('\n') + '\n')
console.log('wrote', dest)
