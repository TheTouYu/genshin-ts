import { NODE_PIN_RECORDS } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/node_data/node_pin_records.js'
import { NODE_ID } from '../../dist/src/compiler/gia_vendor.js'

// Search for records for target node IDs
const targets = [71, 385, 73, 3, 739, 337, 323, 12, 1, 2, 14, 22, 50, 75, 79, 83, 94, 95, 169, 200, 202, 211, 233, 310]
console.log('=== Pin records for target node IDs ===')
console.log()
for (const rec of NODE_PIN_RECORDS) {
  if (targets.includes(rec.id)) {
    const id = rec.id ?? rec.nodeId ?? 0
    console.log(`nid=${id}  name="${rec.name}"`)
    if (rec.pins) {
      for (const p of rec.pins) {
        const kindNames: Record<number, string> = {1:'InFlow',2:'OutFlow',3:'InParam',4:'OutParam'}
        const kn = kindNames[p.kind] ?? `k=${p.kind}`
        console.log(`  ${kn}[${p.index}] name="${p.name ?? ''}"  type=${p.type ?? ''}  desc="${p.desc ?? ''}"`)
      }
    }
    console.log()
  }
}

// Check type detail for 监听信号 outputs
console.log()
console.log('=== Type detail for 监听信号 outputs (from pin records) ===')
for (const rec of NODE_PIN_RECORDS) {
  if (rec.id === 1610612902) {
    console.log(`nid=1610612902 name="${rec.name}"`)
    if (rec.pins) {
      for (const p of rec.pins) {
        if (p.kind === 4) { // OutParam
          const typeNames: Record<number, string> = {1:'Int',2:'Float',3:'Bool',4:'String',5:'Entity',6:'Vector'}
          const tn = typeNames[p.type] ?? `type=${p.type}`
          console.log(`  [${p.index}] "${p.name}"  ${tn}  "${p.desc ?? ''}"`)
        }
      }
    }
  }
}
