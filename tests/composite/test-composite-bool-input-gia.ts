// @ts-nocheck

import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import protobuf from 'protobufjs'

import { irToGia } from '../../dist/src/compiler/ir_to_gia_transform/index.js'
import { buildServerGraphRegistriesIRDocuments, g } from '../../dist/src/runtime/core.js'
import { bool, int, str } from '../../dist/src/runtime/value.js'
import { decode_gia_file } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'

const PROTO_PATH = new URL(
  '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto',
  import.meta.url
).pathname

const boolComposite = g.defineComposite('bool输入真实编码回归', {
  inputs: {
    条件: { type: 'bool', pinIndex: 61 },
    计数: { type: 'int', pinIndex: 62 }
  },
  outputs: {
    结果: { type: 'bool', pinIndex: 63 },
    总数: { type: 'int', pinIndex: 64 }
  },
  build({ 条件, 计数 }, f) {
    const branch = f.registerExecNode('double_branch', [条件])
    const print = f.registerExecNode('print_string', [new str('是')])
    f.connect(branch, 0, print)
    return { 结果: 条件, 总数: 计数 }
  }
})

g.server({ name: 'bool-composite-input-gia-test', id: 1073741993 }).on(
  'whenEntityIsCreated',
  (_event, f) => {
    f.callComposite(boolComposite, { 条件: new bool(true), 计数: new int(3) })
  }
)

const docs = buildServerGraphRegistriesIRDocuments({ defaultName: 'bool-composite-input-gia-test' })
const doc = docs.at(-1)
assert.ok(doc)

const outputPath = join(tmpdir(), 'gsts-bool-composite-input.gia')
const bytes = irToGia(doc, {
  graphId: 1073741993,
  name: 'bool-composite-input-gia-test',
  protoPath: PROTO_PATH
})
writeFileSync(outputPath, Buffer.from(bytes))

const decoded = decode_gia_file(outputPath, PROTO_PATH)
const def = decoded.accessories?.find(
  (accessory) => accessory.name === 'bool输入真实编码回归'
)?.compositeDef?.inner?.def
assert.ok(def)

const input = def.inputs?.[0]
assert.equal(input?.name, '条件')
assert.deepEqual(input?.index, { kind: 3, index: 0 })
assert.deepEqual(input?.type, {
  class: 6,
  type1: 4,
  type2: 4,
  enumId: { val: 1 },
  valueId: null
})
assert.equal(input?.pinIndex, 61)

const intInput = def.inputs?.[1]
assert.equal(intInput?.name, '计数')
assert.deepEqual(intInput?.type, { class: 2, type1: 3, type2: 3, valueId: null })
assert.equal(intInput?.type?.enumId, undefined)

const boolOutput = def.outputs?.[0]
assert.equal(boolOutput?.name, '结果')
assert.deepEqual(boolOutput?.type, {
  class: 6,
  type1: 4,
  type2: 4,
  enumId: { val: 1 },
  valueId: null
})

const intOutput = def.outputs?.[1]
assert.equal(intOutput?.name, '总数')
assert.deepEqual(intOutput?.type, { class: 2, type1: 3, type2: 3, valueId: null })
assert.equal(intOutput?.type?.enumId, undefined)

const mainGraph = decoded.graph?.graph?.inner?.graph
const callNode = mainGraph?.nodes?.find(
  (node) => node.genericId?.kind === 22001 && node.genericId?.nodeId === boolComposite.id
)
assert.ok(callNode)
assert.equal(callNode.pins?.filter((pin) => pin.i1?.kind === 3).length, 2)

const boolPin = callNode.pins?.find((pin) => pin.i1?.kind === 3 && pin.i1?.index === 0)
assert.deepEqual(boolPin?.i1, { kind: 3, index: 0 })
assert.deepEqual(boolPin?.i2, { kind: 3, index: 0 })
assert.equal(boolPin?.type, 4)
assert.equal(boolPin?.compositePinIndex, 61)
assert.deepEqual(boolPin?.connects, [])
assert.equal(boolPin?.value?.class, 6)
assert.equal(boolPin?.value?.alreadySetVal, true)
assert.deepEqual(boolPin?.value?.itemType, {
  classBase: 1,
  type_server: { type: 4, kind: 0 }
})
assert.deepEqual(boolPin?.value?.bEnum, { val: 1 })

const protoRoot = new protobuf.Root().loadSync(PROTO_PATH, { keepCase: true })
const rootMessage = protoRoot.lookupType('Root')
const rawDecoded = rootMessage.decode(new Uint8Array(bytes).slice(20, -4)) as any
const rawDef = rawDecoded.accessories.find((accessory) => accessory.compositeDef)?.compositeDef
  ?.inner?.def
assert.equal(Number(rawDef?.inputs?.[0]?.type?.enumId?.val), 1)
assert.equal(Number(rawDef?.outputs?.[0]?.type?.enumId?.val), 1)
assert.equal(Object.hasOwn(rawDef?.inputs?.[1]?.type ?? {}, 'enumId'), false)
assert.equal(Object.hasOwn(rawDef?.outputs?.[1]?.type ?? {}, 'enumId'), false)

console.log('PASS composite bool parameter GIA encoding matches real enum metadata')
