#!/usr/bin/env npx tsx
/**
 * Debug: Dump accessory structure and composite-to-impl mapping
 */
import { decode_gia_file } from '../../dist/src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'

const file = process.argv[2]
const data = decode_gia_file(file)

// Show accessory structure
console.log(`Total accessories: ${data.accessories?.length ?? 0}`)

for (let i = 0; i < (data.accessories?.length ?? 0); i++) {
  const a = data.accessories[i]
  const id = a.id?.id
  const which = a.compositeDef?.inner?.which
  const def = a.compositeDef?.inner?.def
  const related = a.relatedIds?.map((r: any) => r.id)
  const hasGraph = !!a.graph
  const hasName = def?.name
  const nodeCount = a.graph?.nodes?.length

  if (hasName || hasGraph) {
    console.log(`acc[${i}] id=${id} which=${which} name=${hasName ?? '?'} relatedIds=[${related ?? []}] graph=${hasGraph} nodes=${nodeCount}`)
  }
}
