import { readFileSync } from 'fs'
import { readAuxTransform } from '../src/cli/static_assembly/patch.js'

const cur = readFileSync('/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/110170759/Beyond_Local_Save_Level/1073741853.gil')
const v3 = readFileSync('/home/h/genshin-ts-evidence/entities/football-vnext-solid-shell/raw/football-vNext-solid-shell-stage-b-v3-user-fixed.gil')

console.log('=== Current map ===')
for (let id = 1073742308; id <= 1073742318; id++) {
  const t = readAuxTransform(cur, id)
  console.log(`Aux ${id}: rot=${JSON.stringify(t.rotation)} pos=${JSON.stringify(t.position)}`)
}

console.log('\n=== V3 user-fixed ===')
for (let id = 1073742308; id <= 1073742318; id++) {
  const t = readAuxTransform(v3, id)
  console.log(`Aux ${id}: rot=${JSON.stringify(t.rotation)} pos=${JSON.stringify(t.position)}`)
}
