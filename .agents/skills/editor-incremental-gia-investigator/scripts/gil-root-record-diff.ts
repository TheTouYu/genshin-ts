// GIL 根级/记录级差分（票 25-B：用户编辑器命中区配置对照我写入态）
// 用法：npx tsx diff-gil-roots.ts <A.gil> <B.gil>
import { readFileSync } from 'node:fs'
import { readVarint } from '../../src/injector/binary.js'
import { parseWireMessage } from '../../src/cli/static_assembly/wire.js'

function payloadOf(p: string): Uint8Array { return new Uint8Array(readFileSync(p).slice(20, -4)) }
type Rec = { id: number; bytes: number }
function recordsUnder(root: Uint8Array, fieldNo: number): Rec[] {
  const c = parseWireMessage(root)?.find((f) => f.number === fieldNo && f.wire === 2)
  if (!c) return []
  const body = c.value as Uint8Array
  const fields = parseWireMessage(body) ?? []
  const out: Rec[] = []
  for (const f of fields) {
    if (f.number !== 1 || f.wire !== 2) continue
    const rec = f.value as Uint8Array
    const first = parseWireMessage(rec)?.[0]
    const id = first && first.number === 1 && first.wire === 0 ? (first.value as number) : -1
    out.push({ id, bytes: rec.length })
  }
  return out
}
function topSummary(p: Uint8Array) {
  const map = new Map<number, { n: number; bytes: number }>()
  for (const f of parseWireMessage(p) ?? []) {
    const b = f.wire === 2 && f.value instanceof Uint8Array ? (f.value as Uint8Array).length : 0
    const cur = map.get(f.number) ?? { n: 0, bytes: 0 }
    map.set(f.number, { n: cur.n + 1, bytes: cur.bytes + b })
  }
  return map
}
const [A, B] = process.argv.slice(2)
const [pa, pb] = [payloadOf(A), payloadOf(B)]
const sa = topSummary(pa), sb = topSummary(pb)
const keys = [...new Set([...sa.keys(), ...sb.keys()])].sort((x, y) => x - y)
console.log(`顶层字段对比（A=${A.split('/').pop()}  B=${B.split('/').pop()}）`)
for (const k of keys) {
  const a = sa.get(k) ?? { n: 0, bytes: 0 }, b = sb.get(k) ?? { n: 0, bytes: 0 }
  const mark = a.n !== b.n || a.bytes !== b.bytes ? '  <== 变化' : ''
  console.log(`  f${k}: A=${a.n}条/${a.bytes}B  B=${b.n}条/${b.bytes}B${mark}`)
}
for (const k of [4, 5, 8, 27]) {
  const ra = new Map(recordsUnder(pa, k).map((r) => [r.id, r.bytes]))
  const rb = new Map(recordsUnder(pb, k).map((r) => [r.id, r.bytes]))
  const ids = [...new Set([...ra.keys(), ...rb.keys()])].sort((x, y) => x - y)
  const diff = ids.filter((id) => ra.get(id) !== rb.get(id))
  if (diff.length) {
    console.log(`\nf${k} 记录级差异（${diff.length} 条）：`)
    for (const id of diff) console.log(`  id=${id}: A=${ra.get(id) ?? '缺'}B  B=${rb.get(id) ?? '缺'}B`)
  }
}
