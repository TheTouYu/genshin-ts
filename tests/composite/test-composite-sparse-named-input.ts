// @ts-nocheck

import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { irToGia } from '../../dist/src/compiler/ir_to_gia_transform/index.js'
import { buildServerGraphRegistriesIRDocuments, g } from '../../dist/src/runtime/core.js'
import { decode_gia_file } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'

const PROTO_PATH = new URL(
  '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto',
  import.meta.url
).pathname

const child = g.defineComposite('稀疏命名输入-子复合', {
  inputs: {
    first: { type: 'vec3', pinIndex: 314 },
    second: { type: 'vec3', pinIndex: 315 }
  },
  outputs: {
    result: { type: 'vec3', pinIndex: 316 }
  },
  build(args) {
    return { result: args.second }
  }
})

const parent = g.defineComposite('稀疏命名输入-父复合', {
  inputs: {},
  outputs: {
    result: { type: 'vec3', pinIndex: 429 }
  },
  build(_args, f) {
    const second = f.getNodeGraphVariable('v').asType('vec3')
    const result = f.callComposite(child, { second })
    return { result: result.result }
  }
})

g.server({ name: 'sparse-named-composite-input-test', id: 1073741991 }).on(
  'whenEntityIsCreated',
  (_event, f) => {
    f.callComposite(parent, {})
  }
)

const docs = buildServerGraphRegistriesIRDocuments({ defaultName: 'sparse-named-composite-input-test' })
const doc = docs.at(-1)
const parentDef = doc?.compositeDefs?.find((def) => def.name === '稀疏命名输入-父复合')
const nestedCall = parentDef?.implNodes?.find((node) => node.type === '__composite_call__')
assert.ok(parentDef)
assert.ok(nestedCall)
assert.equal(nestedCall.args?.[1]?.compositeInputIndex, 1)

const outputPath = join(tmpdir(), 'gsts-sparse-named-composite-input.gia')
const bytes = irToGia(doc, {
  graphId: 1073741991,
  name: 'sparse-named-composite-input-test',
  protoPath: PROTO_PATH
})
writeFileSync(outputPath, Buffer.from(bytes))

const decoded = decode_gia_file(outputPath, PROTO_PATH)
const parentGraphId = decoded.accessories?.find(
  (accessory) => accessory.name === '稀疏命名输入-父复合'
)?.compositeDef?.inner?.def?.id?.graphId?.id
const parentImpl = decoded.accessories?.find(
  (accessory) => accessory.which === 9 && accessory.id?.id === parentGraphId
)?.graph?.inner?.graph
const nestedGiaNode = parentImpl?.nodes?.find(
  (node) => node.genericId?.kind === 22001 && node.genericId?.nodeId === child.id
)
assert.ok(nestedGiaNode)
assert.equal(
  nestedGiaNode.pins.some((pin) => pin.i1?.kind === 3 && pin.i1?.index === 0),
  false,
  'omitted first input must not emit InParam[0]'
)
const secondPin = nestedGiaNode.pins.find((pin) => pin.i1?.kind === 3 && pin.i1?.index === 1)
assert.ok(secondPin, 'supplied second input must emit InParam[1]')
assert.equal(secondPin.compositePinIndex, 315)
assert.equal(secondPin.connects?.length, 1)

console.log('PASS sparse named composite input keeps declared input index')
