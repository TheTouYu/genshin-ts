import { readFileSync } from 'node:fs'
import { parseMessage, readVarint } from '../src/injector/binary.js'
const payload = readFileSync(process.argv[2]).slice(20, -4)
const top: any[] = []
parseMessage(payload, 0, payload.length, 0, 0, 0, 0, 0, 0, 0, top)
const r74 = top.filter(f => f.field === 74)
for (const [i, r] of r74.entries()) {
  const bytes = payload.subarray(r.dataStart, r.dataEnd)
  console.log(`root74[${i}] ${bytes.length}B hex=${Buffer.from(bytes).toString('hex')}`)
  const sub: any[] = []
  parseMessage(bytes, 0, bytes.length, 0, 0, 0, 0, 0, 0, 0, sub)
  for (const s of sub) {
    const b = bytes.subarray(s.dataStart, s.dataEnd)
    if (b.length <= 8) { let v; try { v = readVarint(b) } catch { v = Buffer.from(b).toString('hex') } console.log(`  f${s.field} = ${v}`) }
    else {
      console.log(`  f${s.field} = ${b.length}B ${Buffer.from(b).toString('hex')}`)
      const s2: any[] = []
      parseMessage(b, 0, b.length, 0, 0, 0, 0, 0, 0, 0, s2)
      for (const t of s2) {
        const c = b.subarray(t.dataStart, t.dataEnd)
        if (c.length <= 8) { let v; try { v = readVarint(c) } catch { v = Buffer.from(c).toString('hex') } console.log(`    f${t.field} = ${v}`) }
        else console.log(`    f${t.field} = ${c.length}B ${Buffer.from(c).toString('hex').slice(0, 48)}`)
      }
    }
  }
}
