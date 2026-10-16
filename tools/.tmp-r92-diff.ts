import { readFileSync } from 'node:fs'
import { parseMessage } from '../src/injector/binary.js'
function r92(file: string) {
  const payload = readFileSync(file).slice(20, -4)
  const top: any[] = []
  parseMessage(payload, 0, payload.length, 0, 0, 0, 0, 0, 0, 0, top)
  const r9 = top.filter(f => f.field === 9)
  const bytes = payload.subarray(r9[2].dataStart, r9[2].dataEnd)
  const fields: any[] = []
  parseMessage(bytes, 0, bytes.length, 0, 0, 0, 0, 0, 0, 0, fields)
  return fields.map(f => ({ f: f.field, s: f.dataStart, e: f.dataEnd, hex: Buffer.from(bytes.subarray(f.dataStart, f.dataEnd)).toString('hex').slice(0, 60) }))
}
const A = r92(process.argv[2]), B = r92(process.argv[3])
// 对齐：找第一处差异，然后显示上下文
let i = 0
while (i < Math.min(A.length, B.length) && A[i].f === B[i].f && A[i].hex === B[i].hex) i++
console.log(`first diff at field idx ${i} (A has ${A.length}, B has ${B.length})`)
for (let j = Math.max(0, i - 4); j < Math.min(B.length, i + 6); j++) {
  const a = A[j] ? `f${A[j].f}(${A[j].e - A[j].s}B) ${A[j].hex.slice(0, 30)}` : '(absent)'
  console.log(`A[${j}] ${a}`)
  console.log(`B[${j}] f${B[j].f}(${B[j].e - B[j].s}B) ${B[j].hex.slice(0, 30)}`)
}
