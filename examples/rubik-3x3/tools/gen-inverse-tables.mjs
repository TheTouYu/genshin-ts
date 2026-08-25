// gen-inverse-tables.mjs —— 为 12 个 move 生成"反向一步"逻辑表（先落盘为资产，供逆逻辑图使用）
// 方向约定：反向 move 的 from/to/orientMap 与正表同构；反向 = 正 table 连做 3 次的逆映射。
import { createRequire } from 'node:module'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
const require = createRequire(import.meta.url)
const T = require('./3x3-logic-tables.json')

// ---------------- 单块正向一步转移 ----------------
function cornerStep(slot, orient, moveId) {
  const affected = (base, cols) => {
    const from = []
    for (let i = 0; i < cols; i++) from.push(T.faceCornerFrom[base + i])
    return from
  }
  if (moveId >= 10) {
    const b = (moveId - 10) * 8, twb = (moveId - 10) * 24
    for (let i = 0; i < 8; i++) {
      if (T.wholeCornerFrom[b + i] === slot) {
        return { slot: T.wholeCornerTo[b + i], orient: T.wholeCornerTwist[twb + i * 3 + orient] }
      }
    }
    return { slot, orient }
  }
  if (moveId <= 6) {
    const b = (moveId - 1) * 4, twb = (moveId - 1) * 12
    for (let i = 0; i < 4; i++) {
      if (T.faceCornerFrom[b + i] === slot) {
        return { slot: T.faceCornerTo[b + i], orient: T.faceCornerTwist[twb + i * 3 + orient] }
      }
    }
    return { slot, orient }
  }
  return { slot, orient }
}
function edgeStep(slot, flip, moveId) {
  if (moveId >= 10) {
    const b = (moveId - 10) * 12, fb = (moveId - 10) * 24
    for (let i = 0; i < 12; i++) {
      if (T.wholeEdgeFrom[b + i] === slot) return { slot: T.wholeEdgeTo[b + i], flip: T.wholeEdgeFlip[fb + i * 2 + flip] }
    }
    return { slot, flip }
  }
  if (moveId <= 6) {
    const b = (moveId - 1) * 4, fb = (moveId - 1) * 8
    for (let i = 0; i < 4; i++) {
      if (T.faceEdgeFrom[b + i] === slot) return { slot: T.faceEdgeTo[b + i], flip: T.faceEdgeFlip[fb + i * 2 + flip] }
    }
    return { slot, flip }
  }
  // 7..9 middle
  const b = (moveId - 7) * 4, fb = (moveId - 7) * 8
  for (let i = 0; i < 4; i++) {
    if (T.middleEdgeFrom[b + i] === slot) return { slot: T.middleEdgeTo[b + i], flip: T.middleEdgeFlip[fb + i * 2 + flip] }
  }
  return { slot, flip }
}
function centerStep(slot, moveId) {
  if (moveId >= 10) {
    const b = (moveId - 10) * 6
    for (let i = 0; i < 6; i++) if (T.wholeCenterFrom[b + i] === slot) return T.wholeCenterTo[b + i]
    return slot
  }
  if (moveId >= 7) {
    const b = (moveId - 7) * 4
    for (let i = 0; i < 4; i++) if (T.middleCenterFrom[b + i] === slot) return T.middleCenterTo[b + i]
    return slot
  }
  return slot
}
function trips(fn) { return (...args) => { let v = args; for (let k = 0; k < 3; k++) v = fn(...v); return v } }

// ---------------- 输出容器（与正表同构尺寸） ----------------
const out = {
  invFaceCornerFrom: [], invFaceCornerTo: [], invFaceCornerTwist: [],
  invFaceEdgeFrom: [], invFaceEdgeTo: [], invFaceEdgeFlip: [],
  invMiddleEdgeFrom: [], invMiddleEdgeTo: [], invMiddleEdgeFlip: [],
  invMiddleCenterFrom: [], invMiddleCenterTo: [],
  invWholeCornerFrom: [], invWholeCornerTo: [], invWholeCornerTwist: [],
  invWholeEdgeFrom: [], invWholeEdgeTo: [], invWholeEdgeFlip: [],
  invWholeCenterFrom: [], invWholeCenterTo: []
}
function push(arr, vals) { for (const v of vals) arr.push(v) }

for (let m = 1; m <= 12; m++) {
  if (m <= 6) {
    const cb = (m - 1) * 4
    const cfrom = [0,1,2,3].map(i => T.faceCornerFrom[cb + i])
    const cto = cfrom.map((slot) => { let s = { slot, orient: 0 }; for (let k=0;k<3;k++) s = cornerStep(s.slot, s.orient, m); return s.slot })
    const ctw = []
    for (let i = 0; i < 4; i++) for (let o = 0; o < 3; o++) { let s = { slot: cfrom[i], orient: o }; for (let k=0;k<3;k++) s = cornerStep(s.slot, s.orient, m); ctw.push(s.orient) }
    push(out.invFaceCornerFrom, cfrom); push(out.invFaceCornerTo, cto); push(out.invFaceCornerTwist, ctw)
    const efrom = [0,1,2,3].map(i => T.faceEdgeFrom[cb + i])
    const eto = efrom.map((slot) => { let s = { slot, flip: 0 }; for (let k=0;k<3;k++) s = edgeStep(s.slot, s.flip, m); return s.slot })
    const efl = []
    for (let i = 0; i < 4; i++) for (let o = 0; o < 2; o++) { let s = { slot: efrom[i], flip: o }; for (let k=0;k<3;k++) s = edgeStep(s.slot, s.flip, m); efl.push(s.flip) }
    push(out.invFaceEdgeFrom, efrom); push(out.invFaceEdgeTo, eto); push(out.invFaceEdgeFlip, efl)
  } else if (m <= 9) {
    const eb = (m - 7) * 4
    const efrom = [0,1,2,3].map(i => T.middleEdgeFrom[eb + i])
    const eto = efrom.map((slot) => { let s = { slot, flip: 0 }; for (let k=0;k<3;k++) s = edgeStep(s.slot, s.flip, m); return s.slot })
    const efl = []
    for (let i = 0; i < 4; i++) for (let o = 0; o < 2; o++) { let s={slot:efrom[i],flip:o}; for(let k=0;k<3;k++)s=edgeStep(s.slot,s.flip,m); efl.push(s.flip) }
    push(out.invMiddleEdgeFrom, efrom); push(out.invMiddleEdgeTo, eto); push(out.invMiddleEdgeFlip, efl)
    const mb = (m - 7) * 4
    const mfrom = [0,1,2,3].map(i => T.middleCenterFrom[mb + i])
    const mto = mfrom.map((slot) => { let s = slot; for (let k=0;k<3;k++) s = centerStep(s, m); return s })
    push(out.invMiddleCenterFrom, mfrom); push(out.invMiddleCenterTo, mto)
  } else {
    const cb = (m - 10) * 8
    const cfrom = [0,1,2,3,4,5,6,7].map(i => T.wholeCornerFrom[cb + i])
    const cto = cfrom.map((slot) => { let s={slot,orient:0}; for(let k=0;k<3;k++)s=cornerStep(s.slot,s.orient,m); return s.slot })
    const ctw = []
    for (let i = 0; i < 8; i++) for (let o = 0; o < 3; o++) { let s={slot:cfrom[i],orient:o}; for(let k=0;k<3;k++)s=cornerStep(s.slot,s.orient,m); ctw.push(s.orient) }
    push(out.invWholeCornerFrom, cfrom); push(out.invWholeCornerTo, cto); push(out.invWholeCornerTwist, ctw)
    const eb = (m - 10) * 12
    const efrom = [0,1,2,3,4,5,6,7,8,9,10,11].map(i => T.wholeEdgeFrom[eb + i])
    const eto = efrom.map((slot) => { let s={slot,flip:0}; for(let k=0;k<3;k++)s=edgeStep(s.slot,s.flip,m); return s.slot })
    const efl = []
    for (let i = 0; i < 12; i++) for (let o = 0; o < 2; o++) { let s={slot:efrom[i],flip:o}; for(let k=0;k<3;k++)s=edgeStep(s.slot,s.flip,m); efl.push(s.flip) }
    push(out.invWholeEdgeFrom, efrom); push(out.invWholeEdgeTo, eto); push(out.invWholeEdgeFlip, efl)
    const mb = (m - 10) * 6
    const mfrom = [0,1,2,3,4,5].map(i => T.wholeCenterFrom[mb + i])
    const mto = mfrom.map((slot) => { let s=slot; for(let k=0;k<3;k++)s=centerStep(s,m); return s })
    push(out.invWholeCenterFrom, mfrom); push(out.invWholeCenterTo, mto)
  }
}

const emit = (name, arr) => 'export const ' + name + ': bigint[] = [' + arr.map(v => v + 'n').join(', ') + ']'
const parts = [
  '// 自动生成：node examples/rubik-3x3/tools/gen-inverse-tables.mjs —— 勿手改',
  '// 12 个 move 的反向一步逻辑表（from/to/orientMap 与正表同构）',
  '// 方向约定：反向 move = 正 move 连做 3 次的逆映射；供反向旋转接口使用。'
]
for (const [name, arr] of Object.entries(out)) parts.push(emit(name, arr))
const dest = join(dirname(fileURLToPath(import.meta.url)), '../src/inverseTables.ts')
writeFileSync(dest, parts.join('\n') + '\n')
console.log('wrote', dest)
console.log('lens', JSON.stringify(Object.fromEntries(Object.entries(out).map(([k,v])=>[k,v.length]))))
