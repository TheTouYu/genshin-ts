// verify-corner-macros.mjs —— 离线核验：十字完成后，CF_CORNER_POLICY 角块宏是否保持十字（用户 2026-08-27 反馈"回退已拼好的十字"）
// 运行：node examples/rubik-3x3/tools/verify-corner-macros.mjs [样本数]
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const require = createRequire(import.meta.url)
const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..') // examples/rubik-3x3

// 1) 逻辑表（与 DSL 复合一致）
const ir = require(join(ROOT, 'dist/src/game.json'))
const doc = Array.isArray(ir) ? ir[0] : ir.documents?.[0] ?? ir
const varMap = {}
for (const v of doc.variables ?? []) varMap[v.name] = v.value
const asArray = (value) => Array.isArray(value) ? value : value?.value ?? []
const V = {}
for (const name of ['faceCornerFrom','faceCornerTo','faceCornerTwist','faceEdgeFrom','faceEdgeTo','faceEdgeFlip','middleEdgeFrom','middleEdgeTo','middleEdgeFlip','middleCenterFrom','middleCenterTo','wholeCornerFrom','wholeCornerTo','wholeCornerTwist','wholeEdgeFrom','wholeEdgeTo','wholeEdgeFlip','wholeCenterFrom','wholeCenterTo']) {
  V[name] = asArray(varMap[name])
}
const makeState = () => ({ cp: Array.from({length:8},(_,i)=>i), co: Array(8).fill(0), ep: Array.from({length:12},(_,i)=>i), eo: Array(12).fill(0), cenp: Array.from({length:6},(_,i)=>i) })
function applyMove(s, moveId) {
  const isFace = moveId <= 6, isMiddle = moveId >= 7 && moveId <= 9, isWhole = moveId >= 10
  if (isFace || isWhole) {
    const count = isFace ? 4 : 8
    const fromArr = isFace ? V.faceCornerFrom : V.wholeCornerFrom
    const toArr = isFace ? V.faceCornerTo : V.wholeCornerTo
    const twArr = isFace ? V.faceCornerTwist : V.wholeCornerTwist
    const row = (isFace ? moveId - 1 : moveId - 10) * count
    const oldCp = s.cp.slice(), oldCo = s.co.slice()
    const tmpP = [], tmpT = []
    for (let i = 0; i < count; i++) { const f = fromArr[row + i]; tmpP[i] = oldCp[f]; tmpT[i] = oldCo[f] }
    for (let i = 0; i < count; i++) { const t = toArr[row + i]; s.cp[t] = tmpP[i]; s.co[t] = twArr[row * 3 + i * 3 + tmpT[i]] }
  }
  if (isFace || isMiddle || isWhole) {
    const count = isFace ? 4 : isMiddle ? 4 : 12
    let fromArr, toArr, flArr, row
    if (isFace) { fromArr = V.faceEdgeFrom; toArr = V.faceEdgeTo; flArr = V.faceEdgeFlip; row = (moveId - 1) * 4 }
    else if (isMiddle) { fromArr = V.middleEdgeFrom; toArr = V.middleEdgeTo; flArr = V.middleEdgeFlip; row = (moveId - 7) * 4 }
    else { fromArr = V.wholeEdgeFrom; toArr = V.wholeEdgeTo; flArr = V.wholeEdgeFlip; row = (moveId - 10) * 12 }
    const oldEp = s.ep.slice(), oldEo = s.eo.slice()
    const tmpP = [], tmpT = []
    for (let i = 0; i < count; i++) { const f = fromArr[row + i]; tmpP[i] = oldEp[f]; tmpT[i] = oldEo[f] }
    for (let i = 0; i < count; i++) { const t = toArr[row + i]; s.ep[t] = tmpP[i]; s.eo[t] = flArr[row * 2 + i * 2 + tmpT[i]] }
  }
  if (isMiddle || isWhole) {
    const count = isMiddle ? 4 : 6
    let fromArr, toArr, row
    if (isMiddle) { fromArr = V.middleCenterFrom; toArr = V.middleCenterTo; row = (moveId - 7) * 4 }
    else { fromArr = V.wholeCenterFrom; toArr = V.wholeCenterTo; row = (moveId - 10) * 6 }
    const old = s.cenp.slice(); const tmp = []
    for (let i = 0; i < count; i++) tmp.push(old[fromArr[row + i]])
    for (let i = 0; i < count; i++) s.cenp[toArr[row + i]] = tmp[i]
  }
}
// 宏 code → 面转序列
function applyCode(s, code, FACE, DIR, STEPS) {
  const face = Number(FACE[code]), dir = Number(DIR[code]), steps = Number(STEPS[code])
  for (let k = 0; k < steps; k++) {
    if (dir < 0) { for (let i = 0; i < 3; i++) applyMove(s, face) } // -face 折叠 = 3 次逻辑
    else applyMove(s, face)
  }
  return { face, dir, steps }
}

// 2) 解析 TS bigint 数组（indexOf，避免正则转义）
function parseBigIntArray(file, name) {
  const text = readFileSync(join(ROOT, "src/" + file), "utf8")
  const marker = "export const " + name + ": bigint[] = ["
  const start = text.indexOf(marker)
  if (start < 0) throw new Error("not found " + name + " in " + file)
  const end = text.indexOf("]", start + marker.length)
  return text.slice(start + marker.length, end).split(",").map((x) => x.trim().replace("n", "")).map(Number)
}
const CT = (name) => parseBigIntArray("cornerTables.ts", name)
const XT = (name) => parseBigIntArray("cfopTables.ts", name)
const FACE = XT("CF_MOVE_CODE_FACE"), DIR = XT("CF_MOVE_CODE_DIR"), STEPS = XT("CF_MOVE_CODE_STEPS")
const POLICY = [CT("CF_CORNER_POLICY_c0"), CT("CF_CORNER_POLICY_c1"), CT("CF_CORNER_POLICY_c2"), CT("CF_CORNER_POLICY_c3")]
const MLEN = CT("CF_CORNER_MACRO_LEN_c0")
const MACROS = []
for (let i = 0; i <= 15; i++) MACROS.push(CT("CF_CORNER_MACRO_C" + i + "_c0"))

// 3) 状态判定（与 solverCore 一致）
function edgeState(s, home) {
  let sum = 0
  for (let p = 0; p < 12; p++) if (s.ep[p] === home) sum = p * 2 + s.eo[p]
  return sum
}
function cornerState(s, home) {
  let sum = 0
  for (let p = 0; p < 8; p++) if (s.cp[p] === home) sum = p * 3 + s.co[p]
  return sum
}
function crossMask(s) {
  let m = 0
  for (const [idx, home] of [[0,4],[1,5],[2,6],[3,7]]) if (edgeState(s, home) === home * 2) m |= (1 << idx)
  return m
}
function cornerMask(s) {
  let m = 0
  for (const [idx, home] of [[0,4],[1,5],[2,6],[3,7]]) if (cornerState(s, home) === home * 3) m |= (1 << idx)
  return m
}
function cornerFirstUnsolved(mask) {
  for (let i = 0; i < 4; i++) if (!(mask & (1 << i))) return i
  return -1
}
// longListGetInt4 等价：idx = mask*24 + st；表按 96 分块
function policyAt(mask, st) {
  const idx = mask * 24 + st
  const chunk = Math.floor(idx / 96), rem = idx % 96
  return POLICY[chunk][rem]
}
function macroOf(p) {
  const len = MLEN[p]
  const codes = []
  for (let k = 0; k < len; k++) codes.push(MACROS[k][p])
  return codes
}

// 4) 生成"十字已完成 + D 角随机"状态
function randStateWithCross() {
  const s = makeState()
  const seq = []
  for (let k = 0; k < 20; k++) { let m; do { m = 1 + Math.floor(Math.random() * 12) } while (m === seq[seq.length - 1]); seq.push(m) }
  for (const m of seq) applyMove(s, m)
  // 强制十字：D 面 4 棱放回 home 且 eo=0（eo 随块交换；原位也强制清零）
  for (const home of [4,5,6,7]) {
    const cur = s.ep.indexOf(home)
    if (cur !== home) {
      s.ep[cur] = s.ep[home]
      s.eo[cur] = s.eo[home]
      s.ep[home] = home
      s.eo[home] = 0
    } else {
      s.eo[home] = 0
    }
  }
  return s
}

// 5) 主验证：模拟 stage2 求解
let total = 0, bad = 0
const badSamples = []
const N = Number(process.argv[2] || 2000)
for (let iter = 0; iter < N; iter++) {
  const s = randStateWithCross()
  if (crossMask(s) !== 15) { bad++; badSamples.push("iter " + iter + ": 初始十字未满 mask=" + crossMask(s)); continue }
  let steps = 0
  const applied = []
  while (cornerMask(s) !== 15 && steps < 60) {
    const mask = cornerMask(s)
    const t = cornerFirstUnsolved(mask)
    const home = t + 4
    const st = cornerState(s, home)
    const p = policyAt(mask, st)
    if (p < 0 || p >= MLEN.length) { bad++; badSamples.push("iter " + iter + ": policy -1 at mask=" + mask + " st=" + st + " home=" + home); break }
    const codes = macroOf(p)
    applied.push(codes.join("."))
    for (const c of codes) applyCode(s, c, FACE, DIR, STEPS)
    const cmAfter = cornerMask(s)
    if (cmAfter < mask) {
      bad++
      if (badSamples.length < 8) badSamples.push("iter " + iter + ": 角块宏破坏已拼角块! maskBefore=" + mask + " after=" + cmAfter + " p=" + p + " codes=" + codes.map((c)=>FACE[c] + (STEPS[c] > 1 ? "2" : (DIR[c] < 0 ? "p" : ""))).join(" ") + " applied=" + applied.join(" | ") + " crossAfter=" + crossMask(s))
      break
    }
    if (crossMask(s) !== 15) {
      bad++
      badSamples.push("iter " + iter + ": 宏破坏了十字! mask=" + mask + " st=" + st + " p=" + p + " codes=" + codes.map((c)=>FACE[c] + (STEPS[c] > 1 ? "2" : (DIR[c] < 0 ? "p" : ""))).join(" ") + " applied=" + applied.join(" | ") + " crossAfter=" + crossMask(s))
      break
    }
    steps++
  }
  if (crossMask(s) !== 15 || cornerMask(s) !== 15) {
    if (badSamples.length <= 8) badSamples.push("iter " + iter + ": 未完成 step=" + steps + " cross=" + crossMask(s) + " corner=" + cornerMask(s) + " applied=" + applied.join(" | "))
  }
  total++
}
console.log("=== 角块宏保持十字验证 ===")
console.log("样本:", N, " 通过:", total - bad, " 异常:", bad)
console.log("宏索引 p=0.." + (MLEN.length - 1) + "，policy 项: 384")
console.log("失败样本（前 8）:")
for (const s of badSamples.slice(0, 8)) console.log("  -", s)

// 6) stage1 十字宏收敛验证：拼新棱不得破坏已拼好的棱（mask 单调不减）
const XPOLICY = [XT("CF_X_POLICY_c0"), XT("CF_X_POLICY_c1"), XT("CF_X_POLICY_c2"), XT("CF_X_POLICY_c3")]
const XMLEN = XT("CF_X_MACRO_LEN_c0")
const XMACROS = []
for (let i = 0; i <= 2; i++) XMACROS.push(XT("CF_X_MACRO_C" + i + "_c0"))
function xPolicyAt(mask, st) {
  const idx = mask * 24 + st
  const chunk = Math.floor(idx / 96), rem = idx % 96
  return XPOLICY[chunk][rem]
}
function xMacroOf(p) {
  const len = XMLEN[p]
  const codes = []
  for (let k = 0; k < len; k++) codes.push(XMACROS[k][p])
  return codes
}
let xBad = 0, xLoop = 0
const xBadSamples = []
const XN = Number(process.argv[3] || 5000)
for (let iter = 0; iter < XN; iter++) {
  const s = makeState()
  const seq = []
  for (let k = 0; k < 20; k++) { let m; do { m = 1 + Math.floor(Math.random() * 12) } while (m === seq[seq.length - 1]); seq.push(m) }
  for (const m of seq) applyMove(s, m)
  let prev = crossMask(s)
  let steps = 0
  let broke = false, looped = false
  const applied = []
  while (crossMask(s) !== 15 && steps < 60) {
    const mask = crossMask(s)
    const t = cornerFirstUnsolved(mask)
    const home = t + 4
    const st = edgeState(s, home)
    const p = xPolicyAt(mask, st)
    if (p < 0 || p >= XMLEN.length) { xBad++; xBadSamples.push("iter " + iter + ": cross policy -1 mask=" + mask + " st=" + st + " home=" + home); broke = true; break }
    const codes = xMacroOf(p)
    applied.push(codes.join("."))
    for (const c of codes) applyCode(s, c, FACE, DIR, STEPS)
    const after = crossMask(s)
    if (after < mask) {
      xBad++
      if (xBadSamples.length < 8) xBadSamples.push("iter " + iter + ": 十字宏破坏已拼棱! maskBefore=" + mask + " after=" + after + " p=" + p + " codes=" + codes.map((c)=>FACE[c] + (STEPS[c] > 1 ? "2" : (DIR[c] < 0 ? "p" : ""))).join(" ") + " applied=" + applied.join(" | "))
      broke = true
      break
    }
    if (after === mask) { looped = true }
    steps++
  }
  if (crossMask(s) !== 15) {
    if (!broke) { xLoop++; if (xBadSamples.length < 8) xBadSamples.push("iter " + iter + ": 十字不收敛 steps=" + steps + " mask=" + crossMask(s) + " applied=" + applied.join(" | ")) }
  }
}
console.log("=== 十字宏 CF_X_POLICY 收敛验证 ===")
console.log("样本:", XN, " 破坏已拼棱:", xBad - (xBadSamples.length - xBadSamples.filter(s=>s.includes('破坏')).length) > 0 ? "(计入)" : "", " 不收敛(非破坏):", xLoop)
console.log("问题样本（前 8）:")
for (const s of xBadSamples.slice(0, 8)) console.log("  -", s)

