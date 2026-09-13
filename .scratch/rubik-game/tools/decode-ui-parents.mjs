// 只读解码：布局 1825 f503 成员清单 + 关键记录 f504 父指向 + t42 容器引用 + 子女反查
// 用法: node decode-ui-parents.mjs <map.gil> [关注ID,逗号分隔]
import { readFileSync } from 'node:fs'
import { parseWireMessage } from '../../../dist/src/cli/static_assembly/wire.js'

const path = process.argv[2]
const watch = (process.argv[3] ?? '1825,2215,2216,2217,2218,2256,2281,2319,1840').split(',').map(Number)
const bytes = readFileSync(path)
const top = parseWireMessage(bytes.subarray(20, bytes.length - 4))
const root9 = top.find((f) => f.number === 9 && f.wire === 2)
const section = parseWireMessage(root9.value)
const records = section.filter((f) => f.number === 502 && f.wire === 2)

function decodePacked(data) {
  const out = []
  let i = 0
  while (i < data.length) {
    let v = 0n, shift = 0n, b
    do {
      b = data[i++]
      v |= BigInt(b & 0x7f) << shift
      shift += 7n
    } while (b & 0x80)
    out.push(Number(v))
  }
  return out
}

const recs = []
for (const f of records) {
  const fields = parseWireMessage(f.value)
  const id = fields.find((x) => x.number === 501 && x.wire === 0)?.value
  const parent = fields.find((x) => x.number === 504 && x.wire === 0)?.value
  const nameF = fields.find((x) => x.number === 11 && x.wire === 2)
  const name = nameF ? new TextDecoder().decode(nameF.value) : ''
  const members = []
  for (const m of fields.filter((x) => x.number === 503)) {
    if (m.wire === 2) members.push(...decodePacked(m.value))
    else if (m.wire === 0) members.push(m.value)
  }
  // t42 组件 → f505{f502=42} → f503 → f36 → f501 packed = 悬浮页容器引用
  const t42refs = []
  for (const cf of fields.filter((x) => x.number === 505 && x.wire === 2)) {
    const comp = parseWireMessage(cf.value)
    if (!comp.some((x) => x.number === 502 && x.wire === 0 && x.value === 42)) continue
    const f503 = comp.find((x) => x.number === 503 && x.wire === 2)
    const f503m = f503 ? parseWireMessage(f503.value) : undefined
    const f36 = f503m?.find((x) => x.number === 36 && x.wire === 2)
    const f36m = f36 ? parseWireMessage(f36.value) : undefined
    const f501 = f36m?.find((x) => x.number === 501 && x.wire === 2)
    if (f501) t42refs.push(...decodePacked(f501.value))
  }
  recs.push({ id, parent, name, members, t42refs })
}

const byId = new Map(recs.map((r) => [r.id, r]))
const childrenOf = (g) => recs.filter((r) => r.parent === g).map((r) => r.id)

console.log(`total records: ${recs.length}`)
console.log('parentless records (no f504):', recs.filter((r) => r.parent === undefined).map((r) => r.id).join(','))

for (const id of watch) {
  const r = byId.get(id)
  if (!r) { console.log(`\n### ${id}: NOT FOUND`); continue }
  console.log(`\n### ${id} name="${r.name}" parent=${r.parent}`)
  console.log(`  f503 members (${r.members.length}): [${r.members.join(',')}]`)
  if (r.t42refs.length) console.log(`  t42 container refs: [${r.t42refs.join(',')}]`)
  const kids = childrenOf(id)
  if (kids.length) console.log(`  children (f504→this): [${kids.join(',')}]`)
}
