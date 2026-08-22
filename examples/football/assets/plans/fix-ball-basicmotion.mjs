// 一次性修复：给球实体 1077936135 补 basicMotion（type 4）组件
// 根因：本轮重建预制体 1077936138（去底座）时，球实体重新 import 丢失了 basicMotion 组件
// 证据：之前版本（21:18 备份）球实体 components=[basicMotion]，现在 components=[]
// 复用 setStaticAssemblyComponents(record, [basicMotion], 7) —— 实体组件槽 = field 7
// 用法：node examples/football/assets/plans/fix-ball-basicmotion.mjs <map.gil>
import fs from 'node:fs'
import { buildFile, readUint32BE } from '/home/h/genshin-ts/dist/src/injector/binary.js'
import { setStaticAssemblyComponents } from '/home/h/genshin-ts/dist/src/cli/gil_static_assemblies.js'
import {
  emitWireMessage as emit,
  parseWireMessage as parse,
  wireMessage as message,
  wireRecordId as recordId
} from '/home/h/genshin-ts/dist/src/cli/static_assembly/wire.js'

const gilPath = process.argv[2]
if (!gilPath) {
  console.error('usage: node fix-ball-basicmotion.mjs <map.gil>')
  process.exit(1)
}

const BALL_ENTITY_ID = 1077936135
const bytes = new Uint8Array(fs.readFileSync(gilPath))
const top = parse(bytes.slice(20, -4))
if (!top) throw new Error('malformed GIL payload')

const top5 = top.find((f) => f.number === 5 && f.wire === 2)
if (!top5) throw new Error('entity section not found')
const section = message(top5)
const field = section.find(
  (item) => item.number === 1 && item.wire === 2 && recordId(item.value) === BALL_ENTITY_ID
)
if (!field) throw new Error(`entity not found: ${BALL_ENTITY_ID}`)

const record = field.value
const updated = setStaticAssemblyComponents(record, [{ type: 'basicMotion', preset: 'default' }], 7)
field.value = updated
top5.value = emit(section)

const rebuilt = emit(top)
const out = buildFile(rebuilt, {
  schema: readUint32BE(bytes, 4),
  headTag: readUint32BE(bytes, 8),
  fileType: readUint32BE(bytes, 12),
  tailTag: readUint32BE(bytes, bytes.length - 4)
})

fs.writeFileSync(gilPath, out)
console.log(`[ok] basicMotion added to entity ${BALL_ENTITY_ID}`)
console.log(`size: ${bytes.length} -> ${out.length}`)
