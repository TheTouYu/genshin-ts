import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

import { decode_gia_file } from '../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'

const outDir = path.resolve('dist-custom-variable-change-local-variable-optimization/tests')
const irPath = path.join(outDir, 'custom_variable_change_local_variable_optimization_test.json')
const giaPath = path.join(outDir, 'custom_variable_change_local_variable_optimization_test.gia')

const irDocuments = JSON.parse(fs.readFileSync(irPath, 'utf8')) as Array<{
  nodes?: Array<{ type: string; args?: Array<{ type: string; value?: unknown }> }>
}>
assert.equal(irDocuments.length, 1, 'expected one server IR document')

const localGetters = irDocuments[0].nodes?.filter((node) => node.type === 'get_local_variable') ?? []
assert.equal(localGetters.length, 1, 'repeated event parameter reads must be optimized into one getter')
assert.deepEqual(localGetters[0].args, [{ type: 'str', value: 'variableName' }])

const decoded = decode_gia_file(giaPath, undefined, true)
const nodes = decoded.graph.graph?.inner.graph?.nodes ?? []
const getter = nodes.find((node: any) => Number(node.genericId?.nodeId) === 18)
assert.ok(getter, 'optimized get_local_variable node missing from GIA')

const namePin = (getter.pins ?? []).find(
  (pin: any) => Number(pin.i1?.kind) === 3 && Number(pin.i1?.index) === 0
)
assert.ok(namePin, 'optimized get_local_variable name input missing')
assert.equal(Number(namePin.type), 9, 'optimized getter name pin must be string')
assert.equal(namePin.value?.bString?.val, 'variableName', 'optimized getter name must be preserved')
assert.equal(namePin.value?.alreadySetVal, true, 'optimized getter name must be a literal')

console.log('custom variable change local-variable optimization: name preserved')
