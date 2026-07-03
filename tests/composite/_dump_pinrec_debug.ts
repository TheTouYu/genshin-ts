import { NODE_PIN_RECORDS } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/node_data/node_pin_records.js'

// Check how the records are structured
console.log('NODE_PIN_RECORDS length:', NODE_PIN_RECORDS.length)
console.log()
console.log('First 3 records:')
for (let i = 0; i < 3 && i < NODE_PIN_RECORDS.length; i++) {
  const r = NODE_PIN_RECORDS[i]
  console.log(JSON.stringify(r).substring(0, 300))
}
console.log()

// Find records that mention entity/created or player/class
console.log('=== Records matching "Entity" or "Player" ===')
let found = 0
for (const r of NODE_PIN_RECORDS) {
  const name = (r.name ?? '').toLowerCase()
  if (name.includes('entity') || name.includes('player') || name.includes('created')) {
    console.log(`id=${r.id} name="${r.name}" hasPins=${!!r.pins} pinCount=${r.pins?.length ?? 0}`)
    if (r.pins && r.pins.length > 0) {
      for (const p of r.pins) {
        const kindNames: Record<number, string> = {1:'InFlow',2:'OutFlow',3:'InParam',4:'OutParam'}
        console.log(`  ${kindNames[p.kind] ?? p.kind}[${p.index}] "${p.name}"`)
      }
    }
    found++
    if (found >= 5) break
  }
}
console.log()

// Also find the node_id.ts helpers - look for function that resolves pins
console.log('=== Records with id 71 (When Entity Is Created) or 385 ===')
for (const r of NODE_PIN_RECORDS) {
  if (r.id === 71 || r.id === 385) {
    console.log(`id=${r.id} name="${r.name}" all keys=${Object.keys(r).join(', ')}`)
    for (const [k, v] of Object.entries(r)) {
      if (k !== 'pins') console.log(`  ${k}=${JSON.stringify(v).substring(0, 200)}`)
    }
    if (r.pins) {
      for (const p of r.pins) {
        const kindNames: Record<number, string> = {1:'InFlow',2:'OutFlow',3:'InParam',4:'OutParam'}
        console.log(`  Pin: ${kindNames[p.kind]}[${p.index}] name="${p.name}" type=${p.type} desc="${p.desc}"`)
      }
    }
  }
}
