import { NODE_PIN_RECORDS } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/node_data/node_pin_records.js'

// Check pin records for composite IDs used in this file
const compositeIds = [1610612902, 1610612905, 1610612956, 1073742225, 1610612834,
  1610612909, 1073742219, 1073742220, 1610612907, 1073741831, 1610612800,
 1073741912, 1610612908, 1610612936]

console.log('=== Pin records for composite IDs ===')
for (const cid of compositeIds) {
  for (const r of NODE_PIN_RECORDS) {
    if (r.id === cid) {
      console.log(`id=${cid} name="${r.name}"`)
      console.log(`  inputs=[${(r.inputs ?? []).join(', ')}]`)
      console.log(`  outputs=[${(r.outputs ?? []).join(', ')}]`)
      if (r.pins) {
        for (const p of r.pins) {
          const kindNames: Record<number, string> = {1:'InFlow',2:'OutFlow',3:'InParam',4:'OutParam'}
          console.log(`  Pin: ${kindNames[p.kind] ?? p.kind}[${p.index}] "${p.name}" type=${p.type}`)
        }
      }
      console.log()
    }
  }
}
console.log()
console.log('(Some composite IDs may not have entries in NODE_PIN_RECORDS)')
