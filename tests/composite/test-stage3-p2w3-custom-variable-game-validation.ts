// @ts-nocheck
/**
 * P2-W3 custom-variable game-validation candidate.
 *
 * Automated checks prove root/impl schema parity and candidate topology only. Completion still
 * requires explicit user confirmation in the game editor.
 *
 * Run:
 *   npm run build
 *   npx tsx tests/composite/test-stage3-p2w3-custom-variable-game-validation.ts [output.gia]
 */
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'

import { irToGia } from '../../dist/src/compiler/ir_to_gia_transform/index.js'
import { buildServerGraphRegistriesIRDocuments, g } from '../../dist/src/runtime/core.js'
import { bool, float, str } from '../../dist/src/runtime/value.js'
import { setRuntimeOptions } from '../../dist/src/runtime/runtime_config.js'
import { decode_gia_file } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'
import {
  compareOrdinaryNodeContracts,
  extractOrdinaryNodeContract,
  findImplGraphByCompositeName
} from './helpers/ordinary-node-contract.js'

const PROTO_PATH = new URL(
  '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto',
  import.meta.url
).pathname
const OUTPUT_PATH = process.argv[2] ?? '/tmp/P2W3自定义变量-gsts-game-validation.gia'
const GRAPH_ID = 1073742393
const COMPOSITE_NAME = 'P2W3_CustomVariable_GSTS'

setRuntimeOptions({ optimize: { precompileExpression: false, removeUnusedNodes: false } })

const customVariableComposite = g.defineComposite(COMPOSITE_NAME, {
  inputs: { target: { type: 'entity' } },
  outputs: {},
  build(inputs: any, f: any) {
    f.setCustomVariable(inputs.target, 'p2w3_literal_float', new float(1.25), false)
    const addition = f.addition(new float(2), new float(3))
    f.setCustomVariable(inputs.target, 'p2w3_connected_float', addition, false)
    const getter = f.getCustomVariable(inputs.target, 'p2w3_connected_float').asType('float')
    f.printString(f.dataTypeConversion(f.addition(getter, new float(0)), 'str'))
    return {}
  }
})

g.server({ name: 'P2W3自定义变量-GSTS', id: GRAPH_ID }).on(
  'whenEntityIsCreated',
  (_event: any, f: any) => {
    const self = f.getSelfEntity()
    f.setCustomVariable(self, 'p2w3_literal_float', new float(1.25), false)
    const connected = f.addition(new float(2), new float(3))
    f.setCustomVariable(self, 'p2w3_connected_float', connected, false)
    const getter = f.getCustomVariable(self, 'p2w3_connected_float').asType('float')
    f.printString(f.dataTypeConversion(f.addition(getter, new float(0)), 'str'))
    f.callComposite(customVariableComposite, { target: self })
  }
)

const docs = buildServerGraphRegistriesIRDocuments({ defaultName: 'P2W3自定义变量-GSTS' })
const bytes = irToGia(docs.at(-1), {
  graphId: GRAPH_ID,
  name: 'P2W3自定义变量-GSTS',
  protoPath: PROTO_PATH
})
await writeFile(OUTPUT_PATH, Buffer.from(bytes))

const decoded = await decode_gia_file(OUTPUT_PATH, PROTO_PATH)
const rootGraph = decoded.graph?.graph?.inner?.graph
const implGraph = findImplGraphByCompositeName(decoded, COMPOSITE_NAME)
assert.ok(rootGraph, 'root graph missing')
assert.ok(implGraph, 'impl graph missing')

function nodesByGenericId(graph: any, genericId: number): any[] {
  return (graph.nodes ?? []).filter((node: any) => node.genericId?.nodeId === genericId)
}

function stringPin(node: any, index: number): string | undefined {
  return (node.pins ?? []).find(
    (pin: any) => pin.i1?.kind === 3 && pin.i1?.index === index
  )?.value?.bString?.val
}

function customNode(graph: any, genericId: number, name: string): any {
  return nodesByGenericId(graph, genericId).find((node: any) => stringPin(node, 1) === name)
}

for (const name of ['p2w3_literal_float', 'p2w3_connected_float']) {
  const root = customNode(rootGraph, 22, name)
  const impl = customNode(implGraph, 22, name)
  assert.ok(root, `root setter missing: ${name}`)
  assert.ok(impl, `impl setter missing: ${name}`)
  assert.equal(root.concreteId?.nodeId, 26)
  assert.equal(impl.concreteId?.nodeId, 26)
  const rootContract = extractOrdinaryNodeContract(root)
  const implContract = extractOrdinaryNodeContract(impl)
  rootContract.pins = rootContract.pins.filter((pin) => !(pin.kind === 3 && pin.index === 0))
  assert.deepEqual(
    compareOrdinaryNodeContracts(rootContract, implContract, {
      labelExpected: `root/setter-${name}-without-captured-target`,
      labelActual: `impl/setter-${name}`
    }),
    []
  )
}

const rootGetter = customNode(rootGraph, 50, 'p2w3_connected_float')
const implGetter = customNode(implGraph, 50, 'p2w3_connected_float')
assert.ok(rootGetter, 'root custom getter missing')
assert.ok(implGetter, 'impl custom getter missing')
assert.equal(rootGetter.concreteId?.nodeId, 54)
assert.equal(implGetter.concreteId?.nodeId, 54)
const rootGetterContract = extractOrdinaryNodeContract(rootGetter)
const implGetterContract = extractOrdinaryNodeContract(implGetter)
rootGetterContract.pins = rootGetterContract.pins.filter(
  (pin) => !(pin.kind === 3 && pin.index === 0)
)
assert.deepEqual(
  compareOrdinaryNodeContracts(rootGetterContract, implGetterContract, {
    labelExpected: 'root/getter-float-without-captured-target',
    labelActual: 'impl/getter-float'
  }),
  []
)

const implSetterNames = nodesByGenericId(implGraph, 22).map((node: any) => stringPin(node, 1))
assert.deepEqual(
  implSetterNames.sort(),
  ['p2w3_connected_float', 'p2w3_literal_float'],
  'impl must contain both custom-variable setters'
)
assert.equal(nodesByGenericId(implGraph, 200).length, 2, 'impl must retain both Addition producers')
assert.equal(nodesByGenericId(implGraph, 180).length, 1, 'impl must retain float-to-string conversion')
assert.equal(nodesByGenericId(implGraph, 50).length, 1, 'impl must retain custom getter')

console.log(`PASS P2-W3 custom-variable root/impl parity and candidate topology: ${OUTPUT_PATH}`)
console.log('PENDING GAME VALIDATION: automated checks do not complete P2-W3')
