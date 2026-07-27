import { readFileSync } from 'node:fs'
import { readFieldBytes, readVarint, parseMessage } from 'genshin-ts/injector/binary.js'
import type { LenField } from 'genshin-ts/injector/types.js'

const gilPath = process.argv[2]
const gilBytes = readFileSync(gilPath)
const payload = gilBytes.slice(20, -4)
const fields: LenField[] = []
parseMessage(payload, 0, payload.length, 0, 0, 0, 0, 0, 0, 0, fields)

// Look at a field 1 entry that's big enough to contain graph units
const f1 = fields.filter(f => f.field === 1 && f.dataEnd - f.dataStart > 100)

// Decode first few big field 1 entries to see their structure
for (let i = 0; i < Math.min(f1.length, 10); i++) {
  const f = f1[i]
  const bytes = payload.subarray(f.dataStart, f.dataEnd)

  const sub: LenField[] = []
  parseMessage(bytes, 0, bytes.length, 0, 0, 0, 0, 0, 0, 0, sub)

  // Get field 5 (which) if it exists
  const whichSub = sub.find(s => s.field === 5)
  let whichVal = -1
  if (whichSub) {
    const wb = bytes.subarray(whichSub.dataStart, whichSub.dataEnd)
    if (wb.length > 0) whichVal = wb[0]
  }

  // Get field 1 (id) sub-fields
  const idSub = sub.find(s => s.field === 1)
  let idVal = -1
  if (idSub) {
    const idBytes = bytes.subarray(idSub.dataStart, idSub.dataEnd)
    const idFields: LenField[] = []
    parseMessage(idBytes, 0, idBytes.length, 0, 0, 0, 0, 0, 0, 0, idFields)
    const idField = idFields.find(sf => sf.field === 4)  // id field
    if (idField) {
      const idValBytes = idBytes.subarray(idField.dataStart, idField.dataEnd)
      idVal = idValBytes.length > 0 ? idValBytes[0] : -1
    }
  }

  // Get field 3 (name) if it exists
  const nameSub = sub.find(s => s.field === 3)
  let name = ''
  if (nameSub) {
    try {
      name = new TextDecoder().decode(bytes.subarray(nameSub.dataStart, nameSub.dataEnd))
    } catch {}
  }

  const has14 = !!sub.find(s => s.field === 14)

  console.log(`[${i}] size=${bytes.length} name="${name}" which=${whichVal} id=${idVal} hasField14(compositeDef)=${has14}`)

  // Show all sub-field numbers
  const fieldNums = [...new Set(sub.map(s => s.field))].sort((a, b) => a - b)
  console.log(`    sub-fields: [${fieldNums.join(',')}]`)
}
