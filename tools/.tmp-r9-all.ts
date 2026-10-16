import { readFileSync } from 'node:fs'
import { parseMessage, readVarint } from '../src/injector/binary.js'
function dump(file: string) {
  const payload = readFileSync(file).slice(20, -4)
  const top: any[] = []
  parseMessage(payload, 0, payload.length, 0, 0, 0, 0, 0, 0, 0, top)
  const r9 = top.filter(f => f.field === 9)
  for (const [i, r] of r9.entries()) {
    const bytes = payload.subarray(r.dataStart, r.dataEnd)
    console.log(`r9[${i}] ${bytes.length}B ${Buffer.from(bytes).toString('hex').slice(0, 120)}`)
    if (bytes.length < 60) {
      const sub: any[] = []
      parseMessage(bytes, 0, bytes.length, 0, 0, 0, 0, 0, 0, 0, sub)
      for (const s of sub) {
        const b = bytes.subarray(s.dataStart, s.dataEnd)
        let val = b.length <= 10 ? (() => { try { return String(readVarint(b)) } catch { return Buffer.from(b).toString('hex') } })() : `${b.length}B ${Buffer.from(b).toString('hex').slice(0, 40)}`
        console.log(`   f${s.field} = ${val}`)
      }
    }
  }
}
console.log('=== 15:00 ==='); dump(process.argv[2])
console.log('=== 15:07 ==='); dump(process.argv[3])
