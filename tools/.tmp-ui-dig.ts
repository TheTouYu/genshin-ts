import { readFileSync } from 'node:fs'
import { parseMessage, readVarint } from '../src/injector/binary.js'
import type { LenField } from '../src/injector/types.js'

const gil = process.argv[2]; const wantIds = process.argv.slice(3).map(Number)
const payload = readFileSync(gil).slice(20, -4)
const top: any[] = []
parseMessage(payload, 0, payload.length, 0, 0, 0, 0, 0, 0, 0, top)
const r9 = top.filter(f => f.field === 9)
// root9 记录内 f502 记录，每条 f1=id
function recId(bytes: Uint8Array): number | null {
  const sub: any[] = []
  parseMessage(bytes, 0, bytes.length, 0, 0, 0, 0, 0, 0, 0, sub)
  const f1 = sub.find(s => s.field === 1)
  if (!f1) return null
  return Number(readVarint(bytes.subarray(f1.dataStart, f1.dataEnd)))
}
function dump(bytes: Uint8Array, depth: number, maxDepth = 4) {
  if (depth > maxDepth) return
  const sub: any[] = []
  parseMessage(bytes, 0, bytes.length, 0, 0, 0, 0, 0, 0, 0, sub)
  for (const s of sub) {
    const data = bytes.subarray(s.dataStart, s.dataEnd)
    const preview = data.length <= 16 ? Array.from(data).join(',') : `${data.length}B`
    console.log(`${'  '.repeat(depth)}f${s.field} ${preview}`)
    if (data.length > 0 && data.length < 4000) dump(data, depth + 1, maxDepth)
  }
}
for (const r of r9) {
  const recs: any[] = []
  parseMessage(payload.subarray(r.dataStart, r.dataEnd), 0, r.dataEnd - r.dataStart, 0, 0, 0, 0, 0, 0, 0, recs)
  for (const rec of recs) {
    const bytes = payload.subarray(rec.dataStart, rec.dataEnd)
    const id = recId(bytes)
    if (id !== null && wantIds.includes(id)) {
      console.log(`\n=== root9 f${rec.field} id=${id} (${bytes.length}B) ===`)
      dump(bytes, 0)
    }
  }
}
