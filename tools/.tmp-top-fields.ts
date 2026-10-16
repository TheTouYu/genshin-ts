import { readFileSync } from 'node:fs'
import { readVarint, parseMessage } from '../src/injector/binary.js'
const gilPath = process.argv[2]
const payload = readFileSync(gilPath).slice(20, -4)
const fields: any[] = []
parseMessage(payload, 0, payload.length, 0, 0, 0, 0, 0, 0, 0, fields)
const byField = new Map()
for (const f of fields) {
  const cur = byField.get(f.field) ?? { n: 0, bytes: 0 }
  cur.n++; cur.bytes += f.dataEnd - f.dataStart
  byField.set(f.field, cur)
}
const rows = [...byField.entries()].sort((a,b)=>a[0]-b[0])
for (const [num, v] of rows) console.log(`root ${num}: ${v.n} entries, ${v.bytes}B`)
