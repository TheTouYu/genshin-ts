// @ts-nocheck

import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { irToGia } from '../../dist/src/compiler/ir_to_gia_transform/index.js'
import { buildServerGraphRegistriesIRDocuments, g } from '../../dist/src/runtime/core.js'
import { bool } from '../../dist/src/runtime/value.js'
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
    const branch = f.node('double_branch', [new bool(true)])
    f.link(f.entry(), 0, branch)
    f.outflow('一', branch, 0)
    f.outflow('二', branch, 0)
    f.outflow('三', branch, 0)
    f.outflow('四', branch, 0)
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
    f.link(sequence, 0, internalTarget)
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

const outputPath = join(tmpdir(), 'gsts-nested-composite-outflow.gia')
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
const nestedGiaOutflow = nestedGiaNode?.pins?.find(
  (pin) => pin.i1?.kind === 2 && pin.i1?.index === 0
)
if (!nestedGiaOutflow || nestedGiaOutflow.compositePinIndex !== innerDef?.outflows?.[0]?.pinIndex) {
  throw new Error('missing nested composite physical OutFlow[0] pin')
}
if (nestedGiaOutflow.connects?.length !== 1) {
  throw new Error(
    `expected one nested composite downstream, got ${nestedGiaOutflow.connects?.length ?? 0}`
  )
}

console.log('PASS nested composite outflow marker')
