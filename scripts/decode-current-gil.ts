import { readFileSync } from 'node:fs'
import { parseWireMessage, wireRecords, wireRecordId } from '../src/cli/static_assembly/wire.js'

const buf = readFileSync('/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/110170759/Beyond_Local_Save_Level/1073741853.gil')

const top = parseWireMessage(buf.subarray(20, buf.length - 4))
if (!top) throw new Error('[error] malformed GIL payload')
console.log('Top fields:', top.map((field) => `${field.number}(w${field.wire})`))

const r5 = top.find((field) => field.number === 5 && field.wire === 2)
if (!r5) throw new Error('[error] root 5 not found')
const recs = wireRecords(top, 5, 1)
console.log('Entity count:', recs.length)

// Find host
for (const rec of recs) {
  const id = wireRecordId(rec)
  if (id === 1077936176) {
    console.log('\nHost 1077936176 raw:')
    const fields = parseWireMessage(rec)
    if (!fields) throw new Error(`[error] malformed host record ${id}`)
    for (const f of fields) {
      if (f.wire === 2) {
        const hex = Buffer.from(f.value as Uint8Array).toString('hex')
        console.log(`  f${f.number}: (${hex.length/2}B) ${hex.substring(0, 120)}${hex.length > 120 ? '...' : ''}`)
      } else {
        console.log(`  f${f.number}: ${f.value}`)
      }
    }
    break
  }
}

// Root27
const r27 = top.find(f => f.number === 27 && f.wire === 2)
if (r27) {
  const root27 = parseWireMessage(r27.value as Uint8Array)
  if (!root27) throw new Error('[error] malformed root 27')
  console.log('\nRoot27 fields:', root27.map((field) => `${field.number}(w${field.wire})`))
  const auxRecs = wireRecords(top, 27, 1)
  console.log('Root27 aux count:', auxRecs.length)
  for (let i = 0; i < Math.min(15, auxRecs.length); i++) {
    console.log(`  aux[${i}] id: ${wireRecordId(auxRecs[i])}`)
  }
} else {
  console.log('No root27')
}
