import { decode_gia_file } from '../../dist/src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'

const file = process.argv[2]
const data = decode_gia_file(file)

console.log('=== All accessories ===')
for (let i = 0; i < (data.accessories?.length ?? 0); i++) {
  const a = data.accessories[i]
  const id = a.id?.id
  const which = a.which ?? a.compositeDef ? 'hasDef' : 'graphOnly'
  const g = a.graph?.inner?.graph
  const def = a.compositeDef?.inner?.def
  const relId = a.relatedIds?.[0]?.id
  const name = def?.name ?? a.name ?? '?'
  
  console.log(`acc[${i}]: id=${id}  which=${which}  name="${name}"  relatedId=${relId}`)
  console.log(`  graph nodes: ${g?.nodes?.length ?? 0}`)
  if (def) {
    console.log(`  definition: inflows=${def.inflows?.length ?? 0} outflows=${def.outflows?.length ?? 0} inputs=${def.inputs?.length ?? 0} outputs=${def.outputs?.length ?? 0}`)
  }
  console.log()
}
