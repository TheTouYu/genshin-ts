// @ts-nocheck

import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { irToGia } from '../../dist/src/compiler/ir_to_gia_transform/index.js'
import { buildServerGraphRegistriesIRDocuments, g } from '../../dist/src/runtime/core.js'
import { str } from '../../dist/src/runtime/value.js'
import { decode_gia_file } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'

const PROTO_PATH = new URL(
  '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto',
  import.meta.url
).pathname

const innerSequence = g.defineComposite('嵌套出口测试-顺序执行', {
  inputs: {},
  outputs: {},
  outflows: ['一', '二', '三', '四'],
  build(_args, f) {
    f.fork(
      () => {
        const first = f.registerExecNode('print_string', [new str('一')])
        f.outflow('一', first, 0)
      },
      () => {
        const second = f.registerExecNode('print_string', [new str('二')])
        f.outflow('二', second, 0)
      },
      () => {
        const third = f.registerExecNode('print_string', [new str('三')])
        f.outflow('三', third, 0)
      },
      () => {
        const fourth = f.registerExecNode('print_string', [new str('四')])
        f.outflow('四', fourth, 0)
      }
    )
    return {}
  }
})

const outer = g.defineComposite('嵌套出口测试-外层', {
  inputs: {},
  outputs: {},
  outflows: ['完成'],
  build(_args, f) {
    const sequence = f.declareDetached(innerSequence, {})
    const internalTarget = f.node('print_string', [])
    f.link(f.entry(), 0, sequence)
    f.link(sequence, 3, internalTarget)
    f.outflow('完成', sequence, 3)
    return {}
  }
})

g.server({ name: 'nested-outflow-marker-test', id: 1073741988 }).on(
  'whenEntityIsCreated',
  (_event, f) => {
    f.callComposite(outer, {})
  }
)

const docs = buildServerGraphRegistriesIRDocuments({ defaultName: 'nested-outflow-marker-test' })
const doc = docs.at(-1)
const outerDef = doc?.compositeDefs?.find((def) => def.name === '嵌套出口测试-外层')
const nestedCall = outerDef?.implNodes?.find((node) => node.type === '__composite_call__')
const outflowPin = outerDef?.compositePins?.find((pin) => pin.outerPinKind === 2)

if (!outerDef || !nestedCall || !outflowPin) {
  throw new Error('missing outer composite, nested call, or outflow composite pin')
}
if (outflowPin.innerNodeId !== nestedCall.id || outflowPin.innerPinIndex !== 3) {
  throw new Error(
    `expected outer outflow -> nested call ${nestedCall.id}.OutFlow[3], got ${outflowPin.innerNodeId}.OutFlow[${outflowPin.innerPinIndex}]`
  )
}

const outputPath = process.env.GSTS_COMPOSITE_OUTPUT ?? join(tmpdir(), 'gsts-nested-composite-outflow.gia')
const bytes = irToGia(doc, {
  graphId: 1073741988,
  name: 'nested-outflow-marker-test',
  protoPath: PROTO_PATH
})
writeFileSync(outputPath, Buffer.from(bytes))
const decoded = decode_gia_file(outputPath, PROTO_PATH)
const outerGraphId = decoded.accessories?.find(
  (accessory) => accessory.name === '嵌套出口测试-外层'
)?.compositeDef?.inner?.def?.id?.graphId?.id
const outerImpl = decoded.accessories?.find(
  (accessory) => accessory.which === 9 && accessory.id?.id === outerGraphId
)?.graph?.inner?.graph
const nestedGiaNode = outerImpl?.nodes?.find(
  (node) => node.genericId?.kind === 22001 && node.genericId?.nodeId === innerSequence.id
)
const innerDef = decoded.accessories?.find(
  (accessory) => accessory.name === '嵌套出口测试-顺序执行'
)?.compositeDef?.inner?.def
const innerGraphId = innerDef?.id?.graphId?.id
const innerImpl = decoded.accessories?.find(
  (accessory) => accessory.which === 9 && accessory.id?.id === innerGraphId
)?.graph?.inner?.graph
const innerOutflowPins = innerImpl?.compositePins?.filter((pin) => pin.outerPin?.kind === 2) ?? []
if (
  innerOutflowPins.length !== 4 ||
  new Set(innerOutflowPins.map((pin) => pin.innerNodeId)).size !== 4
) {
  throw new Error('inner sequence must map 一/二/三/四 to four distinct branch nodes')
}
const nestedGiaOutflow = nestedGiaNode?.pins?.find(
  (pin) => pin.i1?.kind === 2 && pin.i1?.index === 3
)
if (!nestedGiaOutflow || nestedGiaOutflow.compositePinIndex !== innerDef?.outflows?.[3]?.pinIndex) {
  throw new Error('missing nested composite physical OutFlow[3] pin')
}
if (nestedGiaOutflow.connects?.length !== 1) {
  throw new Error(
    `expected one nested composite downstream, got ${nestedGiaOutflow.connects?.length ?? 0}`
  )
}

console.log('PASS nested composite outflow marker')
