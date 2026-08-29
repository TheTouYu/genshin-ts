// verify-exec-vs-publish.mjs —— 用日志执行序列模拟逻辑状态，对比发布轨迹（2931）
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
const require = createRequire(import.meta.url)
const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const ir = require(join(ROOT, 'dist/src/game.json'))
const doc = Array.isArray(ir) ? ir[0] : ir.documents?.[0] ?? ir
const varMap = {}
for (const v of doc.variables ?? []) varMap[v.name] = v.value
const asArray = (value) => Array.isArray(value) ? value : value?.value ?? []
function applyMove(s, moveId) {
  const isFace = moveId <= 6, isMiddle = moveId >= 7 && moveId <= 9, isWhole = moveId >= 10
  if (isFace || isWhole) {
    const count = isFace ? 4 : 8
    const fromArr = isFace ? asArray(varMap.faceCornerFrom) : asArray(varMap.wholeCornerFrom)
    const toArr = isFace ? asArray(varMap.faceCornerTo) : asArray(varMap.wholeCornerTo)
    const twArr = isFace ? asArray(varMap.faceCornerTwist) : asArray(varMap.wholeCornerTwist)
    const row = (isFace ? moveId - 1 : moveId - 10) * count
    const oldCp = s.cp.slice(), oldCo = s.co.slice()
    const tmpP = [], tmpT = []
    for (let i = 0; i < count; i++) { const f = fromArr[row + i]; tmpP[i] = oldCp[f]; tmpT[i] = oldCo[f] }
    for (let i = 0; i < count; i++) { const t = toArr[row + i]; s.cp[t] = tmpP[i]; s.co[t] = twArr[row * 3 + i * 3 + tmpT[i]] }
  }
  if (isFace || isMiddle || isWhole) {
    const count = isFace ? 4 : isMiddle ? 4 : 12
    let fromArr, toArr, flArr, row
    if (isFace) { fromArr = asArray(varMap.faceEdgeFrom); toArr = asArray(varMap.faceEdgeTo); flArr = asArray(varMap.faceEdgeFlip); row = (moveId - 1) * 4 }
    else if (isMiddle) { fromArr = asArray(varMap.middleEdgeFrom); toArr = asArray(varMap.middleEdgeTo); flArr = asArray(varMap.middleEdgeFlip); row = (moveId - 7) * 4 }
    else { fromArr = asArray(varMap.wholeEdgeFrom); toArr = asArray(varMap.wholeEdgeTo); flArr = asArray(varMap.wholeEdgeFlip); row = (moveId - 10) * 12 }
    const oldEp = s.ep.slice(), oldEo = s.eo.slice()
    const tmpP = [], tmpT = []
    for (let i = 0; i < count; i++) { const f = fromArr[row + i]; tmpP[i] = oldEp[f]; tmpT[i] = oldEo[f] }
    for (let i = 0; i < count; i++) { const t = toArr[row + i]; s.ep[t] = tmpP[i]; s.eo[t] = flArr[row * 2 + i * 2 + tmpT[i]] }
  }
  if (isMiddle || isWhole) {
    const count = isMiddle ? 4 : 6
    let fromArr, toArr, row
    if (isMiddle) { fromArr = asArray(varMap.middleCenterFrom); toArr = asArray(varMap.middleCenterTo); row = (moveId - 7) * 4 }
    else { fromArr = asArray(varMap.wholeCenterFrom); toArr = asArray(varMap.wholeCenterTo); row = (moveId - 10) * 6 }
    const old = s.cenp.slice(); const tmp = []
    for (let i = 0; i < count; i++) tmp.push(old[fromArr[row + i]])
    for (let i = 0; i < count; i++) s.cenp[toArr[row + i]] = tmp[i]
  }
}
function cornerMask(s) {
  let m = 0
  for (const [idx, home] of [[0,4],[1,5],[2,6],[3,7]]) {
    let sum = 0
    for (let p = 0; p < 8; p++) if (s.cp[p] === home) sum = p * 3 + s.co[p]
    if (sum === home * 3) m |= (1 << idx)
  }
  return m
}
function crossMask(s) {
  let m = 0
  for (const [idx, home] of [[0,4],[1,5],[2,6],[3,7]]) {
    let sum = 0
    for (let p = 0; p < 12; p++) if (s.ep[p] === home) sum = p * 2 + s.eo[p]
    if (sum === home * 2) m |= (1 << idx)
  }
  return m
}

// 从日志提取的执行序列（0403 curMove，uint64 负值转 signed）
// 正值=逻辑应用；负值=视觉（跳过）
const rawMoves = process.argv[2]
const moves = rawMoves.split(",").map((x) => {
  const v = Number(x)
  if (v > 2147483647) return v - 18446744073709551616 // uint64 → signed
  return v
})

// 初始状态（日志第一次发布：solver_cp / solver_ep / solver_eo）
const s = {
  cp: [4, 6, 5, 1, 7, 2, 3, 0],
  co: [0, 0, 0, 0, 0, 0, 0, 0],
  ep: [3, 1, 10, 8, 4, 5, 6, 7, 0, 9, 2, 11],
  eo: [1, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1],
  cenp: [0, 1, 2, 3, 4, 5]
}

// 发布轨迹（日志 solver_cp set 序列，去掉重复读）
const published = process.argv[3] ? process.argv[3].split(";").map((x) => x.split(",").map(Number)) : null

let pubIdx = 1 // 已应用第 0 次发布（初始）
let applied = 0
let visualCount = 0
console.log("初始: cmask=" + cornerMask(s) + " xmask=" + crossMask(s) + " cp=" + JSON.stringify(s.cp))
for (let i = 0; i < moves.length; i++) {
  const mv = moves[i]
  if (mv < 0) {
    // 视觉记录：发布应已发生，对比
    visualCount++
    if (published && pubIdx < published.length) {
      const expect = published[pubIdx]
      const ok = JSON.stringify(s.cp) === JSON.stringify(expect)
      if (!ok) {
        console.log("!! 不一致 @ step " + applied + " (visual#" + visualCount + "): 模拟 cp=" + JSON.stringify(s.cp) + " 发布 cp=" + JSON.stringify(expect) + " cmask=" + cornerMask(s))
      } else {
        console.log("  一致 @ step " + applied + " cmask=" + cornerMask(s) + " cp=" + JSON.stringify(s.cp))
      }
      pubIdx++
    }
  } else {
    // 逻辑应用：正 moveId 或负 moveId 的逻辑步
    applyMove(s, mv)
    applied++
  }
}
console.log("最终: cmask=" + cornerMask(s) + " xmask=" + crossMask(s) + " cp=" + JSON.stringify(s.cp) + " 逻辑步=" + applied)
