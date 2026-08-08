import { readFileSync } from 'fs'
import { readAuxTransform, patchAuxTransform } from '../src/cli/static_assembly/patch.js'

const backup = readFileSync('/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/110170759/Beyond_Local_Save_Level/.gsts/backups/1073741853.gil.2026-08-07T09-15-44-329Z.bak')

console.log('Backup size:', backup.length)
console.log('f501 count:', countF501(backup))

// Patch ONE aux
const t = readAuxTransform(backup, 1073742308)
console.log('Aux 1073742308 before:', JSON.stringify(t.rotation))
const patched = patchAuxTransform(backup, 1073742308, { ...t, rotation: [0, 180, 0] })
console.log('Patched size:', patched.length)
console.log('f501 count after patch:', countF501(patched))

function countF501(buf: Uint8Array): number {
  let count = 0
  for (let i = 0; i < buf.length - 1; i++) {
    if (buf[i] === 0xfa && buf[i + 1] === 0x3f) count++
  }
  return count
}
