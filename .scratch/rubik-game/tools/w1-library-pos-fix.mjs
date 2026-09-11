#!/usr/bin/env node
// W1 修复链：①控件组库 1840 归位（删 f504=1825 + 回填顶层索引）
//            ②18 处控件坐标补回（模板侧 9 + 实例侧 9）
// 用法：node .scratch/rubik-game/tools/w1-library-pos-fix.mjs <live.gil> <out.gil>
// fail-closed：id↔名字断言不匹配即中止，不写任何东西
import { readFileSync, writeFileSync } from 'node:fs'
import { parseRoot9, packedVarints } from '../../../dist/ui/src/record.js'
import { withSection, insertIntoIndex } from '../../../dist/ui/src/section-ops.js'
import { updateUiControl } from '../../../dist/src/cli/gil_ui.js'

const LIVE = process.argv[2]
const OUT = process.argv[3]
if (!LIVE || !OUT) { console.error('usage: w1-library-pos-fix.mjs <live.gil> <out.gil>'); process.exit(2) }

const LIB = 1073741840, LAYOUT = 1073741825
const B = 1073741824
const off = (n) => n - B

// ---------- 名字断言表（fail-closed）----------
const fixes = [
  // 模板侧 残局挑战 2218 树
  { id: 1073742221, name: '3步·新手', pos: [800, 660] },
  { id: 1073742222, name: '5步·进阶', pos: [800, 545] },
  { id: 1073742223, name: '8步·挑战', pos: [800, 430] },
  { id: 1073742224, name: '12步·大师', pos: [800, 315] },
  { id: 1073742225, name: '自由模式', pos: [800, 200] },
  // 模板侧 结算 2256 树
  { id: 1073742259, name: '重试', pos: [800, 520] },
  { id: 1073742260, name: '下一关', pos: [800, 400] },
  { id: 1073742261, name: '菜单', pos: [800, 280] },
  { id: 1073742262, name: '星级步数', pos: [800, 700] },
  // 实例侧 残局挑战 2161 树
  { id: 1073742070, name: '3步·新手', pos: [800, 660] },
  { id: 1073742069, name: '5步·进阶', pos: [800, 545] },
  { id: 1073742068, name: '8步·挑战', pos: [800, 430] },
  { id: 1073742067, name: '12步·大师', pos: [800, 315] },
  { id: 1073742066, name: '自由模式', pos: [800, 200] },
  // 实例侧 结算 2164 树
  { id: 1073742065, name: '重试', pos: [800, 520] },
  { id: 1073742064, name: '下一关', pos: [800, 400] },
  { id: 1073742063, name: '菜单', pos: [800, 280] },
  { id: 1073742062, name: '星级步数', pos: [800, 700] }
]

// ---------- 前置断言：live 里 id↔name 对照 ----------
const parsed0 = parseRoot9(readFileSync(LIVE))
const nameOf = (id) => {
  const r = parsed0.records.find((x) => x.id === id)
  return r ? r.name : undefined
}
let bad = 0
for (const f of fixes) {
  const n = nameOf(f.id)
  if (n !== f.name) { console.error(`[assert-fail] ${off(f.id)} 期望「${f.name}」实际「${n}」`); bad++ }
}
if (bad) { console.error(`中止：${bad} 处名字断言失败`); process.exit(1) }
console.log(`名字断言 18/18 通过`)

// 库 1840 前置断言：当前 f504=1825 且不在索引
const lib0 = parsed0.records.find((x) => x.id === LIB)
const f504s = lib0.fields.filter((f) => f.number === 504).map((f) => f.value)
if (f504s.length !== 1 || f504s[0] !== LAYOUT) {
  console.error(`[assert-fail] 库 1840 f504=${JSON.stringify(f504s)}（期望 [${LAYOUT}]）`); process.exit(1)
}

// ---------- ① 库归位 ----------
let bytes = readFileSync(LIVE)
bytes = withSection(bytes, (section, parsed) => {
  const idxField = section.find((f) => f.number === 501 && f.wire === 2)
  const indexSet = new Set(packedVarints(idxField.value))
  const ownId = (field) => {
    const ff = parseFields(field.value)
    return ff?.find((x) => x.number === 501 && x.wire === 0)?.value
  }
  const recs = section.filter((f) => f.number === 502 && f.wire === 2)
  const phys = recs.map(ownId)
  const target = recs[phys.indexOf(LIB)]
  // f504 字节切除（只动顶层字段，嵌套区按长度跳过）
  target.value = spliceOutF504(target.value, LAYOUT)
  // 索引回填：物理序==索引序 → 找物理上在 1840 之前、且已在索引的最近记录
  const p = phys.indexOf(LIB)
  let afterId
  for (let i = p - 1; i >= 0; i--) if (indexSet.has(phys[i])) { afterId = phys[i]; break }
  insertIntoIndex(section, LIB, afterId)
  console.log(`库归位：f504 切除 + 索引回填（after ${off(afterId)}）`)
})

// ---------- ② 坐标补回 ----------
for (const f of fixes) {
  const r = updateUiControl(bytes, f.id, { position: [f.pos[0], f.pos[1]] })
  if (!r.changed.includes('transform')) { console.error(`[fail] ${off(f.id)} transform 未变更`); process.exit(1) }
  bytes = r.bytes
}
console.log('坐标补回 18/18')

// ---------- 终检 ----------
const fin = parseRoot9(bytes)
const libF = fin.records.find((x) => x.id === LIB)
const parentless = libF.fields.every((f) => f.number !== 504)
const inIndex = fin.indexIds.has(LIB)
console.log(`终检：库 parentless=${parentless} 索引含=${inIndex}`)
if (!parentless || !inIndex) { console.error('[fail] 库未归位'); process.exit(1) }
writeFileSync(OUT, bytes)
console.log(`写出 ${OUT}（${bytes.length} 字节）`)

// ---------- 工具 ----------
function readVarint(b, i) {
  let v = 0, s = 0
  while (i < b.length) { const x = b[i++]; v |= (x & 0x7f) << s; if (!(x & 0x80)) break; s += 7 }
  return { value: v, next: i }
}
function spliceOutF504(buf, expectValue) {
  let i = 0
  while (i < buf.length) {
    const start = i
    const tag = readVarint(buf, i); i = tag.next
    const field = tag.value >> 3, wire = tag.value & 7
    if (wire === 0) {
      const v = readVarint(buf, i); i = v.next
      if (field === 504 && v.value === expectValue) {
        return Buffer.concat([buf.subarray(0, start), buf.subarray(i)])
      }
    } else if (wire === 2) { const l = readVarint(buf, i); i = l.next + l.value }
    else if (wire === 5) i += 4
    else if (wire === 1) i += 8
    else throw new Error(`wire ${wire}`)
  }
  throw new Error('f504 not found in record')
}
function parseFields(u8) {
  let i = 0; const out = []
  while (i < u8.length) {
    const tag = readVarint(u8, i); i = tag.next
    const field = tag.value >> 3, wire = tag.value & 7
    if (wire === 0) { const v = readVarint(u8, i); i = v.next; out.push({ number: field, wire, value: v.value }) }
    else if (wire === 2) { const l = readVarint(u8, i); i = l.next; out.push({ number: field, wire, value: u8.subarray(i, i + l.value) }); i += l.value }
    else if (wire === 5) { out.push({ number: field, wire, value: u8.subarray(i, i + 4) }); i += 4 }
    else if (wire === 1) { out.push({ number: field, wire, value: u8.subarray(i, i + 8) }); i += 8 }
    else return undefined
  }
  return out
}
