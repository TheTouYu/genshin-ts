// verify-e-layer-macros.mjs —— 离线核验：第一层完成后，CF_E_POLICY 中二层(E层棱)宏是否
//   1) 保持第一层（十字+角块 mask 不减，恒 15）
//   2) E 层 mask 单调不减（不破坏已拼好的 E 棱）
//   3) 收敛（最终 E mask==15）
// 运行：node examples/rubik-3x3-client/tools/verify-e-layer-macros.mjs [样本数]
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const require = createRequire(import.meta.url)
const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..') // examples/rubik-3x3

// 1) 逻辑表（与 DSL 复合一致，游戏真实转动语义）
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
// 宏 code → 面转序列（与 solverAppendCode 同语义：dir<0 折叠 = 3 次逻辑）
function applyCode(s, code, FACE, DIR, STEPS) {
  const face = Number(FACE[code]), dir = Number(DIR[code]), steps = Number(STEPS[code])
  for (let k = 0; k < steps; k++) {
    if (dir < 0) { for (let i = 0; i < 3; i++) applyMove(s, face) }
    else applyMove(s, face)
  }
}

// 2) 解析 TS bigint 数组
function parseBigIntArray(file, name) {
  const text = readFileSync(join(ROOT, "src/" + file), "utf8")
  const marker = "export const " + name + ": bigint[] = ["
  const start = text.indexOf(marker)
  if (start < 0) throw new Error("not found " + name + " in " + file)
  const end = text.indexOf("]", start + marker.length)
  return text.slice(start + marker.length, end).split(",").map((x) => x.trim().replace("n", "")).map(Number)
}
const ET = (name) => parseBigIntArray("eLayerTables.ts", name)
const CT = (name) => parseBigIntArray("cornerTables.ts", name)
const XT = (name) => parseBigIntArray("cfopTables.ts", name)
const FACE = XT("CF_MOVE_CODE_FACE"), DIR = XT("CF_MOVE_CODE_DIR"), STEPS = XT("CF_MOVE_CODE_STEPS")
const POLICY = [ET("CF_E_POLICY_c0"), ET("CF_E_POLICY_c1"), ET("CF_E_POLICY_c2"), ET("CF_E_POLICY_c3")]
const MLEN = ET("CF_E_MACRO_LEN_c0")
const MACROS = []
{ let k = 0; while (true) { try { MACROS.push(ET("CF_E_MACRO_C" + k + "_c0")); k++ } catch (e) { break } } }

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
function eMask(s) {
  let m = 0
  for (const [idx, home] of [[0,8],[1,9],[2,10],[3,11]]) if (edgeState(s, home) === home * 2) m |= (1 << idx)
  return m
}
function firstUnsolved(mask) {
  for (let i = 0; i < 4; i++) if (!(mask & (1 << i))) return i
  return -1
}
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
function macroName(codes) {
  return codes.map((c) => FACE[c] + (STEPS[c] > 1 ? "2" : (DIR[c] < 0 ? "p" : ""))).join(" ")
}

// 4) 生成"第一层已完成 + E/U 棱随机"状态（十字+角块强制归位；E 棱自然分布在 U/E 槽）
function randStateWithFirstLayer() {
  const s = makeState()
  const seq = []
  for (let k = 0; k < 25; k++) { let m; do { m = 1 + Math.floor(Math.random() * 12) } while (m === seq[seq.length - 1]); seq.push(m) }
  for (const m of seq) applyMove(s, m)
  // 强制十字
  for (const home of [4,5,6,7]) {
    const cur = s.ep.indexOf(home)
    if (cur !== home) {
      s.ep[cur] = s.ep[home]
      s.eo[cur] = s.eo[home]
      s.ep[home] = home
      s.eo[home] = 0
    } else s.eo[home] = 0
  }
  // 强制 D 角
  for (const home of [4,5,6,7]) {
    const cur = s.cp.indexOf(home)
    if (cur !== home) {
      s.cp[cur] = s.cp[home]
      s.co[cur] = s.co[home]
      s.cp[home] = home
      s.co[home] = 0
    } else s.co[home] = 0
  }
  return s
}

// 5) 主验证：模拟 stage3 求解
let total = 0, bad = 0, maskDec = 0, layerBreak = 0, noConverge = 0, policyMiss = 0
const badSamples = []
const N = Number(process.argv[2] || 3000)
for (let iter = 0; iter < N; iter++) {
  const s = randStateWithFirstLayer()
  if (crossMask(s) !== 15 || cornerMask(s) !== 15) { bad++; badSamples.push("iter " + iter + ": 初始第一层未满 cross=" + crossMask(s) + " corner=" + cornerMask(s)); continue }
  let steps = 0
  const applied = []
  let ok = true
  while (eMask(s) !== 15 && steps < 40) {
    const mask = eMask(s)
    const t = firstUnsolved(mask)
    const home = 8 + t
    const st = edgeState(s, home)
    const p = policyAt(mask, st)
    if (p < 0 || p >= MLEN.length) { bad++; policyMiss++; ok = false; badSamples.push("iter " + iter + ": E policy -1 mask=" + mask + " st=" + st + " home=" + home + " applied=" + applied.join(" | ")); break }
    const codes = macroOf(p)
    applied.push(codes.join("."))
    for (const c of codes) applyCode(s, c, FACE, DIR, STEPS)
    const eAfter = eMask(s)
    if (eAfter < mask) {
      bad++; maskDec++; ok = false
      if (badSamples.length < 8) badSamples.push("iter " + iter + ": E 宏破坏已拼 E 棱! maskBefore=" + mask + " after=" + eAfter + " p=" + p + " codes=" + macroName(codes) + " applied=" + applied.join(" | "))
      break
    }
    if (crossMask(s) !== 15 || cornerMask(s) !== 15) {
      bad++; layerBreak++; ok = false
      if (badSamples.length < 8) badSamples.push("iter " + iter + ": E 宏破坏第一层! cross=" + crossMask(s) + " corner=" + cornerMask(s) + " mask=" + mask + " st=" + st + " p=" + p + " codes=" + macroName(codes) + " applied=" + applied.join(" | "))
      break
    }
    steps++
  }
  if (ok && eMask(s) !== 15) {
    bad++; noConverge++
    if (badSamples.length < 8) badSamples.push("iter " + iter + ": E 层不收敛 steps=" + steps + " eMask=" + eMask(s) + " applied=" + applied.join(" | "))
  }
  total++
}
console.log("=== 中二层宏 CF_E_POLICY 保持性/收敛验证 ===")
console.log("样本:", N, " 通过:", total - bad, " 异常:", bad)
console.log("  其中: 破坏E棱(mask减)=" + maskDec, " 破坏第一层=" + layerBreak, " policy-1=" + policyMiss, " 不收敛=" + noConverge)
console.log("宏索引 p=0.." + (MLEN.length - 1) + "，policy 项: 384（4 块×96）")
console.log("失败样本（前 8）:")
for (const s of badSamples.slice(0, 8)) console.log("  -", s)

// 6) 全流程集成：打乱 → 十字 → 第一层角块 → 中二层(E层棱)，逐段核验收敛与第一层保持
{
  const XPOLICY = [XT("CF_X_POLICY_c0"), XT("CF_X_POLICY_c1"), XT("CF_X_POLICY_c2"), XT("CF_X_POLICY_c3")]
  const XMLEN = XT("CF_X_MACRO_LEN_c0")
  const XMACROS = []
  for (let i = 0; i <= 2; i++) XMACROS.push(XT("CF_X_MACRO_C" + i + "_c0"))
  const CPOLICY = [CT("CF_CORNER_POLICY_c0"), CT("CF_CORNER_POLICY_c1"), CT("CF_CORNER_POLICY_c2"), CT("CF_CORNER_POLICY_c3")]
  const CMLEN = CT("CF_CORNER_MACRO_LEN_c0")
  const CMACROS = []
  for (let i = 0; i <= 15; i++) CMACROS.push(CT("CF_CORNER_MACRO_C" + i + "_c0"))
  function policyOf(POL, mask, st) { const idx = mask * 24 + st; const chunk = Math.floor(idx / 96), rem = idx % 96; return POL[chunk][rem] }
  function macroOfLen(MLEN, MACROS, p) { const len = MLEN[p]; const codes = []; for (let k = 0; k < len; k++) codes.push(MACROS[k][p]); return codes }

  let fTotal = 0, fBad = 0
  const fBadSamples = []
  const FN = Number(process.argv[3] || 1000)
  for (let iter = 0; iter < FN; iter++) {
    const s = makeState()
    const seq = []
    for (let k = 0; k < 25; k++) { let m; do { m = 1 + Math.floor(Math.random() * 12) } while (m === seq[seq.length - 1]); seq.push(m) }
    for (const m of seq) applyMove(s, m)
    const stages = []
    let broken = false
    // stage1: cross
    let steps = 0
    while (crossMask(s) !== 15 && steps < 60) {
      const mask = crossMask(s), t = firstUnsolved(mask), home = t + 4, st = edgeState(s, home)
      const p = policyOf(XPOLICY, mask, st)
      if (p < 0) { broken = true; break }
      const codes = macroOfLen(XMLEN, XMACROS, p)
      for (const c of codes) applyCode(s, c, FACE, DIR, STEPS)
      if (crossMask(s) < mask) { broken = true; break }
      steps++
    }
    if (broken || crossMask(s) !== 15) { fBad++; fBadSamples.push("iter " + iter + ": 十字不收敛"); fTotal++; continue }
    // stage2: corners
    steps = 0
    while (cornerMask(s) !== 15 && steps < 60) {
      const mask = cornerMask(s), t = firstUnsolved(mask), home = t + 4, st = cornerState(s, home)
      const p = policyOf(CPOLICY, mask, st)
      if (p < 0 || crossMask(s) !== 15) { broken = true; break }
      const codes = macroOfLen(CMLEN, CMACROS, p)
      for (const c of codes) applyCode(s, c, FACE, DIR, STEPS)
      const cm = cornerMask(s)
      if (cm < mask || crossMask(s) !== 15) { broken = true; break }
      steps++
    }
    if (broken || cornerMask(s) !== 15) { fBad++; fBadSamples.push("iter " + iter + ": 角块不收敛/破坏十字"); fTotal++; continue }
    // stage3: E-layer
    steps = 0
    while (eMask(s) !== 15 && steps < 40) {
      const mask = eMask(s), t = firstUnsolved(mask), home = 8 + t, st = edgeState(s, home)
      const p = policyAt(mask, st)
      if (p < 0) { broken = true; break }
      const codes = macroOf(p)
      for (const c of codes) applyCode(s, c, FACE, DIR, STEPS)
      const em = eMask(s)
      if (em < mask || crossMask(s) !== 15 || cornerMask(s) !== 15) { broken = true; break }
      steps++
    }
    if (broken || eMask(s) !== 15) { fBad++; fBadSamples.push("iter " + iter + ": E 层不收敛/破坏第一层 eMask=" + eMask(s)) }
    fTotal++
  }
  console.log("=== 全流程集成（十字→角块→中二层）验证 ===")
  console.log("样本:", fTotal, " 通过:", fTotal - fBad, " 异常:", fBad)
  for (const s of fBadSamples.slice(0, 8)) console.log("  -", s)
  if (fBad > 0) { console.error("RESULT: FAIL"); process.exit(1) }
}
if (bad === 0) console.log("RESULT: ALL GREEN")
else { console.error("RESULT: FAIL"); process.exit(1) }

// 7) 二层测试验证：U/E 打乱（保持第一层完整）→ 自动求解 E 层
{
  const moveSet = [3, 8] // U=3, E=8 (中层 slice)
  let uTotal = 0, uBad = 0
  for (let iter = 0; iter < 200; iter++) {
    const s = makeState()
    const len = 14 + Math.floor(Math.random() * 8)
    for (let k = 0; k < len; k++) { const m = moveSet[Math.floor(Math.random() * 2)]; applyMove(s, m) }
    if (crossMask(s) !== 15 || cornerMask(s) !== 15) { uBad++; console.log("U/E broke layer1 iter", iter); continue }
    if (eMask(s) === 15) continue
    let steps = 0, broken = false
    while (eMask(s) !== 15 && steps < 30) {
      const mask = eMask(s), t = firstUnsolved(mask), home = 8 + t, st = edgeState(s, home)
      const p = policyAt(mask, st)
      if (p < 0) { broken = true; break }
      const codes = macroOf(p)
      for (const c of codes) applyCode(s, c, FACE, DIR, STEPS)
      if (eMask(s) < mask) { broken = true; break }
      steps++
    }
    if (broken || eMask(s) !== 15) { uBad++; console.log("U/E test E not converged iter", iter, "eMask=" + eMask(s)) }
    uTotal++
  }
  console.log("=== 二层测试（U/E 打乱 → E 层求解）验证 ===")
  console.log("样本:", uTotal, " 通过:", uTotal - uBad, " 异常:", uBad, "U/E 打乱保持第一层:", uTotal - uBad - (uBad > 0 ? 1 : 0))
  if (uBad > 0) { console.error("U/E LAYER2 TEST: FAIL"); process.exit(1) }
  else console.log("U/E LAYER2 TEST: PASS")
}


