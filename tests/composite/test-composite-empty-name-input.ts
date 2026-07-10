// @ts-nocheck

import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { irToGia } from '../../dist/src/compiler/ir_to_gia_transform/index.js'
import { buildServerGraphRegistriesIRDocuments, g } from '../../dist/src/runtime/core.js'
import { float as floatValue } from '../../dist/src/runtime/value.js'
import { decode_gia_file } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'

const PROTO_PATH = new URL(
  '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto',
  import.meta.url
).pathname

const child = g.defineComposite('空名输入捕获-向量缩放除法形态', {
  inputs: {
    三维向量: { type: 'vec3', pinIndex: 501 },
    '': { type: 'float', pinIndex: 502 }
  },
  outputs: {
    结果: { type: 'vec3', pinIndex: 503 }
  },
  build(args, f) {
    return {
      结果: f._3dVectorZoom(args.三维向量, f.division(new floatValue(1), args['']))
    }
  }
})

g.server({ name: 'empty-name-composite-input-test', id: 1073741992 }).on(
  'whenEntityIsCreated',
  (_event, f) => {
    const vector = f.getNodeGraphVariable('v').asType('vec3')
    const scale = f.getNodeGraphVariable('R').asType('float')
    f.callComposite(child, { 三维向量: vector, '': scale })
  }
)

const docs = buildServerGraphRegistriesIRDocuments({ defaultName: 'empty-name-composite-input-test' })
const doc = docs.at(-1)
const childDef = doc?.compositeDefs?.find((def) => def.name === '空名输入捕获-向量缩放除法形态')
assert.ok(childDef)

const divisionNode = childDef.implNodes?.find((node) => node.type === 'division')
assert.ok(divisionNode, 'child impl must contain Division')
assert.equal(divisionNode.args?.[1]?.capture, true, 'empty-name capture input must be marked')

assert.ok(
  childDef.compositePins?.some(
    (pin) =>
      pin.outerPinKind === 3 &&
      pin.outerPinIndex === 1 &&
      pin.innerNodeId === divisionNode.id &&
      pin.innerPinKind === 3 &&
      pin.innerPinIndex === 1
  ),
  'empty-name second input must route to Division.InParam[1] through compositePins'
)

const outputPath = join(tmpdir(), 'gsts-empty-name-composite-input.gia')
const bytes = irToGia(doc, {
  graphId: 1073741992,
  name: 'empty-name-composite-input-test',
  protoPath: PROTO_PATH
})
writeFileSync(outputPath, Buffer.from(bytes))

const decoded = decode_gia_file(outputPath, PROTO_PATH)
const childGraphId = decoded.accessories?.find(
  (accessory) => accessory.name === '空名输入捕获-向量缩放除法形态'
)?.compositeDef?.inner?.def?.id?.graphId?.id
const childImpl = decoded.accessories?.find(
  (accessory) => accessory.which === 9 && accessory.id?.id === childGraphId
)?.graph?.inner?.graph
const giaDivisionNode = childImpl?.nodes?.find(
  (node) => node.genericId?.kind === 22000 && node.genericId?.nodeId === 206
)
assert.ok(giaDivisionNode, 'decoded child impl must contain Division')

const divisionRoute = childImpl?.compositePins?.find(
  (pin) =>
    pin.outerPin?.kind === 3 &&
    pin.outerPin?.index === 1 &&
    pin.innerNodeId === giaDivisionNode.nodeIndex &&
    pin.innerPin?.kind === 3 &&
    pin.innerPin?.index === 1
)
assert.ok(divisionRoute, 'decoded impl must route empty-name InParam[1] to Division.InParam[1]')

console.log('PASS empty-name composite input keeps capture route')
