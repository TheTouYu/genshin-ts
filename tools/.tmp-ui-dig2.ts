import { readFileSync } from 'node:fs'
import { parseMessage, readVarint } from '../src/injector/binary.js'
const gil = process.argv[2]; const wantIds = process.argv.slice(3).map(Number)
const payload = readFileSync(gil).slice(20, -4)
const top: any[] = []
parseMessage(payload, 0, payload.length, 0, 0, 0, 0, 0, 0, 0, top)
const r9 = top.filter(f => f.field === 9)
console.log(`root9 entries: ${r9.length}, sizes: ${r9.map(r => r.dataEnd - r.dataStart).join(',')}`)
for (const [i, r] of r9.entries()) {
  const bytes = payload.subarray(r.dataStart, r.dataEnd)
  const sub: any[] = []
  parseMessage(bytes, 0, bytes.length, 0, 0, 0, 0, 0, 0, 0, sub)
  console.log(`r9[${i}] ${bytes.length}B subfields: ${sub.map(s => `f${s.field}(${s.dataEnd-s.dataStart}B)`).join(' ')}`)
  // 二层：找 f502
  for (const s of sub) {
    const sbytes = bytes.subarray(s.dataStart, s.dataEnd)
    const sub2: any[] = []
    parseMessage(sbytes, 0, sbytes.length, 0, 0, 0, 0, 0, 0, 0, sub2)
    for (const t of sub2) {
      const tbytes = sbytes.subarray(t.dataStart, t.dataEnd)
      // 记录可能直接带 f1=id
      const sub3: any[] = []
      parseMessage(tbytes, 0, tbytes.length, 0, 0, 0, 0, 0, 0, 0, sub3)
      const f1 = sub3.find((x: any) => x.field === 1)
      if (f1) {
        const id = Number(readVarint(tbytes.subarray(f1.dataStart, f1.dataEnd)))
        if (wantIds.includes(id)) {
          console.log(`\n=== HIT r9[${i}].f${s.field} id=${id} (${tbytes.length}B) ===`)
          for (const u of sub3) {
            const ub = tbytes.subarray(u.dataStart, u.dataEnd)
            const prev = ub.length <= 24 ? Array.from(ub).join(',') : `${ub.length}B`
            console.log(`  f${u.field} = ${prev}`)
            const su: any[] = []
            parseMessage(ub, 0, ub.length, 0, 0, 0, 0, 0, 0, 0, su)
            for (const v of su) {
              const vb = ub.subarray(v.dataStart, v.dataEnd)
              const pv = vb.length <= 24 ? Array.from(vb).join(',') : `${vb.length}B`
              console.log(`    f${v.field} = ${pv}`)
              const sv: any[] = []
              parseMessage(vb, 0, vb.length, 0, 0, 0, 0, 0, 0, 0, sv)
              for (const w of sv) {
                const wb = vb.subarray(w.dataStart, w.dataEnd)
                const pw = wb.length <= 24 ? Array.from(wb).join(',') : `${wb.length}B`
                console.log(`      f${w.field} = ${pw}`)
              }
            }
          }
        }
      }
    }
  }
}
