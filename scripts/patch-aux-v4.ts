/**
 * 阶段 B v4：给所有校准 aux 的 rotation Y 加 180°，让三角形顶点朝内（闭合六角/五角）
 *
 * 已知规则：
 * - 三棱柱顶点在局部 +X
 * - worldDir(theta) = [cos(theta), 0, -sin(theta)] = 朝外
 * - 需要 +180° 让顶点旋转后朝内
 */
import { readFileSync, writeFileSync, chmodSync } from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { patchAuxTransform, readAuxTransform } from '../src/cli/static_assembly/patch.js'

const MAP = '/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/110170759/Beyond_Local_Save_Level/1073741853.gil'
const OUTPUT = process.argv[2] || path.resolve('/home/h/genshin-ts-evidence/entities/football-vnext-solid-shell/raw/football-vNext-solid-shell-stage-b-calibration-candidate-v4.gil')

const source = new Uint8Array(readFileSync(MAP))
console.log('Source hash:', sha256(source))
console.log('Source size:', source.length)

// Patch each aux: rotation Y += 180
let bytes: Uint8Array = source
for (let id = 1073742308; id <= 1073742318; id++) {
  const t = readAuxTransform(bytes, id)
  const newRot: [number, number, number] = [t.rotation[0], t.rotation[1] + 180, t.rotation[2]]
  console.log(`Aux ${id}: rot ${JSON.stringify(t.rotation)} -> ${JSON.stringify(newRot)}`)
  bytes = patchAuxTransform(bytes, id, { ...t, rotation: newRot })
}

const candidateHash = sha256(bytes)
console.log('\nCandidate hash:', candidateHash)
console.log('Candidate size:', bytes.length)

writeFileSync(OUTPUT, bytes, { flag: 'wx' })
chmodSync(OUTPUT, 0o444)
writeFileSync(`${OUTPUT}.sha256`, `${candidateHash}  ${path.basename(OUTPUT)}\n`, { flag: 'wx' })
chmodSync(`${OUTPUT}.sha256`, 0o444)
console.log('Written:', OUTPUT)

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}
