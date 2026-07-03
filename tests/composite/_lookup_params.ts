import { decode_gia_file } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'
import { NODE_PIN_RECORDS } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/node_data/node_pin_records.js'

// 1. Look up pin records for nid=739 (Set Character Skill CD)
console.log('=== Set Character Skill CD (nid=739) pin records ===')
for (const rec of NODE_PIN_RECORDS) {
  if (rec.id === 739) {
    console.log(JSON.stringify(rec, null, 2))
  }
}

// 2. Look up nid=12 (3D Vector Zoom)
console.log('\n=== 3D Vector Zoom (nid=12) pin records ===')
for (const rec of NODE_PIN_RECORDS) {
  if (rec.id === 12) {
    console.log(JSON.stringify(rec, null, 2))
  }
}

// 3. Search for enum IDs in node definitions
console.log('\n=== Search for enum with id 3111 ===')
for (const rec of NODE_PIN_RECORDS) {
  const str = JSON.stringify(rec)
  if (str.includes('3111')) {
    console.log(`Found in record id=${rec.id} name="${rec.name}"`)
  }
  if (str.includes('SkillSlot') || str.includes('skill_slot') || str.includes('SkillType')) {
    console.log(`Possible enum ref: id=${rec.id} name="${rec.name}"`)
  }
}
