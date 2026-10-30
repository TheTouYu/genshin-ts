import fs from 'node:fs'
import { parseWireMessage } from '/home/h/genshin-ts/src/cli/static_assembly/wire.js'
import { readTransform, setTransform } from '/home/h/genshin-ts/src/cli/gil_entities.js'

const args = process.argv.slice(2)
const write = args.includes('--write')
const [gil, ...pairs] = args.filter((a) => a !== '--write')
const buf = Buffer.from(fs.readFileSync(gil))
const payload = new Uint8Array(buf.subarray(20, buf.length - 4))
const top = parseWireMessage(payload)!
const root5 = top.find((f) => f.number === 5 && f.wire === 2)
if (!root5) throw new Error('root5 missing')
const records = parseWireMessage(root5.value as Uint8Array)!
for (const pair of pairs) {
  const [idText, yText] = pair.split(':')
  const id = Number(idText)
  const y = Number(yText)
  const recField = records.find((f) => {
    if (f.number !== 1 || f.wire !== 2) return false
    const f1 = parseWireMessage(f.value as Uint8Array)?.find((x) => x.number === 1 && x.wire === 0)
    return f1?.value === id
  })
  if (!recField) throw new Error(`entity ${id} not found in root5`)
  const rec = recField.value as Uint8Array
  const tf = readTransform(rec, 6)
  const patched = setTransform(rec, { position: tf.position, rotation: tf.rotation, scale: [tf.scale[0], y, tf.scale[2]] }, 6)
  if (patched.length !== rec.length) throw new Error(`length changed ${rec.length} → ${patched.length}`)
  const at = buf.indexOf(Buffer.from(rec))
  if (at < 0) throw new Error(`record not found in file (entity ${id})`)
  Buffer.from(patched).copy(buf, at)
  console.log(`entity ${id}: scale.y ${tf.scale[1]} → ${y}`)
}
if (write) { fs.writeFileSync(gil, buf); console.log('written') }
else { const out = gil.replace(/\.gil$/, '.yscale.gil'); fs.writeFileSync(out, buf); console.log('candidate', out) }
