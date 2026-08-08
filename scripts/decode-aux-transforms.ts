import { readFileSync } from 'fs'
import { readAuxTransform } from '../src/cli/static_assembly/patch.js'

const buf = readFileSync('/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/110170759/Beyond_Local_Save_Level/1073741853.gil')

// Decode all aux transforms
for (let id = 1073742306; id <= 1073742318; id++) {
  try {
    const t = readAuxTransform(buf, id)
    console.log(`Aux ${id}: pos=${JSON.stringify(t.position)} rot=${JSON.stringify(t.rotation)} scale=${JSON.stringify(t.scale)}`)
  } catch (e) {
    console.log(`Aux ${id}: ERROR ${(e as Error).message}`)
  }
}
