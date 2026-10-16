import { readFileSync } from 'node:fs'
import { parseMessage, readVarint } from '../src/injector/binary.js'
const payload = readFileSync(process.argv[2]).slice(20, -4)
const top: any[] = []
parseMessage(payload, 0, payload.length, 0, 0, 0, 0, 0, 0, 0, top)
const r9 = top.filter(f => f.field === 9)
const bytes = payload.subarray(r9[2].dataStart, r9[2].dataEnd)
const fields: any[] = []
parseMessage(bytes, 0, bytes.length, 0, 0, 0, 0, 0, 0, 0, fields)
// 找 f74 及其前后 5 个字段上下文
for (let i = 0; i < fields.length; i++) {
  if (fields[i].field === 74) {
    const b = bytes.subarray(fields[i].dataStart, fields[i].dataEnd)
    const inner: any[] = []
    if (b.length) parseMessage(b, 0, b.length, 0, 0, 0, 0, 0, 0, 0, inner)
    console.log(`--- f74 @idx${i} (${b.length}B) hex=${Buffer.from(b).toString('hex')}`)
    for (const t of inner) {
      const c = b.subarray(t.dataStart, t.dataEnd)
      let val = ''
      if (c.length <= 8) { try { val = `varint=${readVarint(c)}` } catch { val = Buffer.from(c).toString('hex') } }
      else val = `${c.length}B ${Buffer.from(c).toString('hex').slice(0, 40)}`
      console.log(`    f${t.field} ${val}`)
    }
    // 上下文：前 3 后 3
    const ctx = fields.slice(Math.max(0, i - 3), i + 4).map(f => `f${f.field}(${f.dataEnd - f.dataStart}B)`).join(' ')
    console.log(`    ctx: ${ctx}`)
  }
}
