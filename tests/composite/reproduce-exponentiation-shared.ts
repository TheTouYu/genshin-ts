// @ts-nocheck
import { mkdirSync, writeFileSync } from 'node:fs'

import { decode_gia_file } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'
import { irToGia } from '../../dist/src/compiler/ir_to_gia_transform/index.js'
import { buildServerGraphRegistriesIRDocuments, g } from '../../dist/src/runtime/core.js'
import { int } from '../../dist/src/runtime/value.js'

const PROTO_PATH = new URL(
  '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto',
  import.meta.url
).pathname
const OUT_DIR = 'tests/composite/output'
const OUT_PATH = `${OUT_DIR}/exponentiation-共享路径-额外输入脚.gia`

const exponentiation = g.defineComposite('exponentiation-共享路径-额外输入脚', {
  inputs: {
    底数: { type: 'int' },
    指数: { type: 'int' }
  },
  outputs: {
    结果: { type: 'int' }
  },
  build({ 底数, 指数 }, f) {
    return { 结果: f.exponentiation(底数, 指数) }
  }
})

g.server({ name: 'exponentiation-共享路径-额外输入脚', id: 1073742013 }).on(
  'whenEntityIsCreated',
  (_event, f) => {
    f.callComposite(exponentiation, { 底数: new int(2), 指数: new int(3) })
  }
)

const doc = buildServerGraphRegistriesIRDocuments({
  defaultName: 'exponentiation-共享路径-额外输入脚'
}).at(-1)
const bytes = irToGia(doc, {
  graphId: 1073742013,
  name: 'exponentiation-共享路径-额外输入脚',
  protoPath: PROTO_PATH
})
mkdirSync(OUT_DIR, { recursive: true })
writeFileSync(OUT_PATH, Buffer.from(bytes))

const decoded = decode_gia_file(OUT_PATH, PROTO_PATH)
const impl = decoded.accessories?.find((item) => item.which === 9)?.graph?.inner?.graph
const node = impl?.nodes?.find((item) => item.genericId?.kind === 22000)
console.log(`输出: ${OUT_PATH}`)
console.log(`大小: ${bytes.length} 字节`)
console.log(`节点: generic=${node?.genericId?.nodeId}, concrete=${node?.concreteId?.nodeId}`)
console.log('物理输入:', JSON.stringify(
  node?.pins?.filter((pin) => pin.i1?.kind === 3).map((pin) => [pin.i1.index, pin.type])
))
console.log('物理输出:', JSON.stringify(
  node?.pins?.filter((pin) => pin.i1?.kind === 4).map((pin) => [pin.i1.index, pin.type])
))
