import { readFileSync } from 'node:fs'
import { parseMessage } from '../src/injector/binary.js'
const payload = readFileSync(process.argv[2]).slice(20, -4)
const top: any[] = []
parseMessage(payload, 0, payload.length, 0, 0, 0, 0, 0, 0, 0, top)
const r9 = top.filter(f => f.field === 9)
const bytes = payload.subarray(r9[2].dataStart, r9[2].dataEnd)
const fields: any[] = []
parseMessage(bytes, 0, bytes.length, 0, 0, 0, 0, 0, 0, 0, fields)
// 找含 8180808004 (1073741825) 或 8280808004 (1073741826) 的所有字段
const pat = Buffer.from('8180808004', 'hex'), pat2 = Buffer.from('8280808004', 'hex')
for (let i = 0; i < fields.length; i++) {
  const b = bytes.subarray(fields[i].dataStart, fields[i].dataEnd)
  if (b.includes(pat) || b.includes(pat2)) {
    const ctx = fields.slice(Math.max(0, i - 3), i + 4).map(f => `f${f.field}(${f.dataEnd - f.dataStart}B)`).join(' ')
    console.log(`idx${i} f${fields[i].field}(${b.length}B) hex=${Buffer.from(b).toString('hex').slice(0, 50)} | ctx: ${ctx}`)
  }
}
