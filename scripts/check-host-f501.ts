import { readFileSync } from 'node:fs'
import { parseWireMessage, wireRecords, wireRecordId } from '../src/cli/static_assembly/wire.js'
// Note: this file must be run from the project root with tsx

const filePath = process.argv[2] || '/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/110170759/Beyond_Local_Save_Level/1073741853.gil'
const buf = readFileSync(filePath)

const top = parseWireMessage(buf.subarray(20, buf.length - 4))
if (!top) throw new Error('[error] malformed GIL payload')
const r5 = top.find((field) => field.number === 5 && field.wire === 2)
if (!r5) {
  console.log('No root5')
  process.exit(1)
}

const recs = wireRecords(top, 5, 1)

for (const rec of recs) {
  const id = wireRecordId(rec)
  if (id === 1077936176) {
    console.log('Host 1077936176 found')
    const fields = parseWireMessage(rec)
    if (!fields) throw new Error(`[error] malformed host record ${id}`)
    for (const f of fields) {
      if (f.wire === 2) {
        const hex = Buffer.from(f.value as Uint8Array).toString('hex')
        if (hex.includes('0828')) {
          console.log('Field', f.number, ': decoration slot')
          const slotFields = parseWireMessage(f.value as Uint8Array)
          if (!slotFields) continue
          for (const sf of slotFields) {
            if (sf.wire === 2) {
              if (sf.number === 50) {
                const f50Fields = parseWireMessage(sf.value as Uint8Array)
                if (!f50Fields) continue
                for (const f50f of f50Fields) {
                  if (f50f.number === 501 && f50f.wire === 2) {
                    console.log('  f501 found! Length:', (f50f.value as Uint8Array).length)
                  } else if (f50f.wire === 2) {
                    console.log('  f50 field', f50f.number, 'length:', (f50f.value as Uint8Array).length)
                  }
                }
              }
            }
          }
        }
      }
    }
    break
  }
}
