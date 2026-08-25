// gen-center-tables.mjs — 生成整体旋转中心归一化表（只用正方向 x/y/z，moveId 10/11/12）
// 目标：输入 centerPos（槽0=U 槽2=F）对应的 key=u*6+f(0..35)，
//       输出最短的"正方向整体转动作序列"使 centerPos 回到恒等 [0,1,2,3,4,5]，同时整体旋转回正。
import { createRequire } from 'node:module'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const require = createRequire(import.meta.url)
const T = require('./3x3-logic-tables.json')
const ID = [0, 1, 2, 3, 4, 5]

function copy(a) { return a.slice() }
// 应用一次整体转（moveId 10/11/12）
function wholeCenterOnce(cp, moveId) {
  const base = (moveId - 10) * 6
  const from = [0,1,2,3,4,5].map(i => T.wholeCenterFrom[base + i])
  const to = [0,1,2,3,4,5].map(i => T.wholeCenterTo[base + i])
  const pieces = from.map(slot => cp[slot])
  for (let i = 0; i < 6; i++) cp[to[i]] = pieces[i]
  return cp
}
function applySeq(cp, moves) { for (const m of moves) wholeCenterOnce(cp, m); return cp }

// 1) 用单转正方向生成元 BFS 出 24 个整体朝向状态，key=u*6+f
const keyOf = (cp) => cp[0] * 6 + cp[2]
const states = new Map()
states.set(keyOf(ID), copy(ID))
const q = [copy(ID)]
while (q.length) {
  const cur = q.shift()
  for (const m of [10, 11, 12]) {
    const nx = copy(cur)
    wholeCenterOnce(nx, m)
    const k = keyOf(nx)
    if (!states.has(k)) { states.set(k, nx); q.push(nx) }
  }
}
console.log('whole orientation states', states.size)

// 2) 枚举正方向 moveId 序列（长度 0..6），对每个已知整体朝向状态找最短回恒等序
const seqByLen = [[[]]]
for (let len = 1; len <= 6; len++) {
  const list = []
  for (const prev of seqByLen[len - 1]) {
    for (const m of [10, 11, 12]) list.push(prev.concat([m]))
  }
  seqByLen.push(list)
}
const solve = new Map()
for (const [k, state] of states.entries()) {
  for (let len = 0; len <= 6; len++) {
    let found = null
    for (const seq of seqByLen[len]) {
      if (applySeq(copy(state), seq).join(',') === ID.join(',')) { found = seq; break }
    }
    if (found) { solve.set(k, found); break }
  }
  if (!solve.has(k)) throw new Error('未覆盖 key ' + k)
}
console.log('covered keys', solve.size)

// 3) 紧凑化宏池：把 36 key→动作收成 宏 id，动作最多6列
const macroSet = []
const macroIndex = new Map()
const lookup = new Array(36).fill(-1)
for (let key = 0; key < 36; key++) {
  const seq = solve.get(key)
  if (!seq) continue
  const str = seq.join(',')
  let id = macroIndex.get(str)
  if (id === undefined) {
    id = macroSet.length
    macroIndex.set(str, id)
    macroSet.push(seq)
  }
  lookup[key] = id
}

const cols = 4
const parts = []
parts.push('// 自动生成：node examples/rubik-3x3/tools/gen-center-tables.mjs —— 勿手改')
parts.push('// 整体旋转归一化表（只用正方向 x/y/z，moveId 10/11/12；执行器逐条 append）')
parts.push('export const CF_CENTER_LOOKUP: bigint[] = [' + lookup.map(x => x + 'n').join(', ') + ']')
for (let c = 0; c < cols; c++) {
  parts.push('export const CF_CENTER_MACRO_C' + c + ': bigint[] = [' + macroSet.map(s => (c < s.length ? s[c] : 0) + 'n').join(', ') + ']')
}
parts.push('export const CF_CENTER_MACRO_LEN: bigint[] = [' + macroSet.map(s => s.length + 'n').join(', ') + ']')
parts.push('// 尺寸：{ lookup: 36, macros: ' + macroSet.length + ' } // macros=' + JSON.stringify(macroSet))
const dest = join(dirname(fileURLToPath(import.meta.url)), '../src/centerTables.ts')
writeFileSync(dest, parts.join('\n') + '\n')
console.log('wrote', dest, 'macros', macroSet.length, JSON.stringify(macroSet))
