import { readFileSync } from 'node:fs'
import { parseMessage, readVarint } from '../src/injector/binary.js'
const payload = readFileSync(process.argv[2]).slice(20, -4)
const top: any[] = []
parseMessage(payload, 0, payload.length, 0, 0, 0, 0, 0, 0, 0, top)
const r50 = top.filter(f => f.field === 50)
for (const [i, r] of r50.entries()) {
  const bytes = payload.subarray(r.dataStart, r.dataEnd)
  console.log(`r50[${i}] ${bytes.length}B hex: ${Buffer.from(bytes).toString('hex')}`)
  const sub: any[] = []
  parseMessage(bytes, 0, bytes.length, 0, 0, 0, 0, 0, 0, 0, sub)
  for (const s of sub) {
    const b = bytes.subarray(s.dataStart, s.dataEnd)
    console.log(`  f${s.field} ${b.length}B ${b.length<64 ? Buffer.from(b).toString('hex') : Buffer.from(b.subarray(0,64)).toString('hex')+'...'} ${b.length>8 && /^[\x20-\x7e]+$/.test(Buffer.from(b).toString('latin1')) ? '"'+Buffer.from(b).toString('latin1')+'"' : ''}`)
    if (b.length > 4 && b.length < 200) {
      const s2: any[] = []
      parseMessage(b, 0, b.length, 0, 0, 0, 0, 0, 0, 0, s2)
      for (const t of s2) {
        const c = b.subarray(t.dataStart, t.dataEnd)
        const txt = Buffer.from(c).toString('utf8')
        console.log(`    f${t.field} ${c.length}B ${c.length<80 ? (/^[\x20-\x7e]+$/.test(txt) ? '"'+txt+'"' : Buffer.from(c).toString('hex')) : '...'}`)
      }
    }
  }
}
