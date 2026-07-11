// @ts-nocheck
/**
 * P0-W4/P1-W2: Root/impl ordinary-node parity fixture for set_node_graph_variable.
 *
 * Root and impl identity are now resolved through the shared contract. Pin lowering
 * remains legacy in impl, so this fixture continues to expose the remaining schema
 * drift while asserting shared generic/concrete identity.
 *
 * Run: npx tsx tests/composite/test-stage3-root-impl-parity.ts
 */

import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { irToGia } from '../../dist/src/compiler/ir_to_gia_transform/index.js'
import { buildServerGraphRegistriesIRDocuments, g } from '../../dist/src/runtime/core.js'
import { vec3 } from '../../dist/src/runtime/value.js'
import { decode_gia_file } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'

import {
  compareOrdinaryNodeContracts,
  extractOrdinaryNodeContract,
  findImplGraphByCompositeName,
  findSetterByVariableName,
  formatMismatches
} from './helpers/ordinary-node-contract.js'

const PROTO_PATH = new URL(
  '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto',
  import.meta.url
).pathname

const COMPOSITE_NAME = 'stage3-parity-impl'
const GRAPH_ID = 1073742103

const ParityComposite = g.defineComposite(COMPOSITE_NAME, {
  inputs: {},
  outputs: {},
  variables: {
    额外压力: 0.0,
    向量: new vec3([0, 0, 0]),
    a: 1.5,
    b: 2.5
  },
  build(_inputs, f) {
    // float literal setter
    f.set('额外压力', 0)
    // float connection setter: addition producer → setter value pin
    f.set('额外压力', f.addition(f.get('a'), f.get('b')))
    // vec connection setter
    f.set('向量', f._3dVectorAddition(f.get('向量'), new vec3([0, 1, 0])))
    return {}
  }
})

g.server({
  name: 'stage3-root-impl-parity',
  id: GRAPH_ID,
  variables: {
    额外压力: 0.0,
    向量: new vec3([0, 0, 0]),
    a: 1.5,
    b: 2.5
  }
}).on('whenEntityIsCreated', (_event, f) => {
  f.set('额外压力', 0)
  f.set('额外压力', f.addition(f.get('a'), f.get('b')))
  f.set('向量', f._3dVectorAddition(f.get('向量'), new vec3([0, 1, 0])))
  f.callComposite(ParityComposite, {})
})

const docs = buildServerGraphRegistriesIRDocuments({ defaultName: 'stage3-root-impl-parity' })
const doc = docs.at(-1)
assert.ok(doc)

const bytes = irToGia(doc, {
  graphId: GRAPH_ID,
  name: 'stage3-root-impl-parity',
  protoPath: PROTO_PATH
})
const outputPath = join(tmpdir(), 'gsts-stage3-root-impl-parity.gia')
writeFileSync(outputPath, Buffer.from(bytes))

const decoded = decode_gia_file(outputPath, PROTO_PATH)
const rootGraph = decoded.graph?.graph?.inner?.graph
const implGraph = findImplGraphByCompositeName(decoded, COMPOSITE_NAME)
assert.ok(rootGraph, 'root graph missing')
assert.ok(implGraph, 'impl graph missing')

function collectSetters(graph: any, varName: string): any[] {
  const out: any[] = []
  for (const node of graph?.nodes ?? []) {
    if (node?.genericId?.nodeId !== 323) continue
    const namePin = (node.pins ?? []).find((p: any) => p?.i1?.kind === 3 && p?.i1?.index === 0)
    const name = namePin?.value?.bString?.val
    if (name === varName) out.push(node)
  }
  return out
}

function valuePin(node: any) {
  return (node.pins ?? []).find((p: any) => p?.i1?.kind === 3 && p?.i1?.index === 1)
}

// ── Root baseline (must hold today) ──────────────────────────────
const rootFloatSetters = collectSetters(rootGraph, '额外压力')
const rootVecSetters = collectSetters(rootGraph, '向量')
assert.ok(rootFloatSetters.length >= 2, `root float setters expected >=2, got ${rootFloatSetters.length}`)
assert.ok(rootVecSetters.length >= 1, 'root vec setter missing')

const rootFloatLiteral = rootFloatSetters.find((n) => (valuePin(n)?.connects?.length ?? 0) === 0)
const rootFloatConn = rootFloatSetters.find((n) => (valuePin(n)?.connects?.length ?? 0) > 0)
const rootVecConn = rootVecSetters.find((n) => (valuePin(n)?.connects?.length ?? 0) > 0)

assert.ok(rootFloatLiteral, 'root float literal setter missing')
assert.ok(rootFloatConn, 'root float connection setter missing')
assert.ok(rootVecConn, 'root vec connection setter missing')

const rootFloatLitC = extractOrdinaryNodeContract(rootFloatLiteral)
const rootFloatConnC = extractOrdinaryNodeContract(rootFloatConn)
const rootVecConnC = extractOrdinaryNodeContract(rootVecConn)

assert.equal(rootFloatLitC.genericId, 323)
assert.equal(rootFloatLitC.concreteId, 324)
const rootFloatLitValue = rootFloatLitC.pins.find((p) => p.kind === 3 && p.index === 1)
assert.ok(rootFloatLitValue)
assert.equal(rootFloatLitValue.hasConcreteWrapper, true)
assert.equal(rootFloatLitValue.indexOfConcrete, 1)
assert.equal(rootFloatLitValue.type, 5)
assert.equal(rootFloatLitValue.hasConnection, false)
assert.equal(rootFloatLitValue.payloadKind, 'float')
assert.equal(rootFloatLitValue.literalSummary, '0')

assert.equal(rootFloatConnC.genericId, 323)
assert.equal(rootFloatConnC.concreteId, 324)
const rootFloatConnValue = rootFloatConnC.pins.find((p) => p.kind === 3 && p.index === 1)
assert.ok(rootFloatConnValue)
assert.equal(rootFloatConnValue.hasConcreteWrapper, true)
assert.equal(rootFloatConnValue.indexOfConcrete, 1)
assert.equal(rootFloatConnValue.hasConnection, true)
assert.equal(rootFloatConnValue.connectionSourcePinKind, 4)
assert.equal(rootFloatConnValue.connectionSourcePinIndex, 0)

assert.equal(rootVecConnC.genericId, 323)
assert.equal(rootVecConnC.concreteId, 334)
const rootVecConnValue = rootVecConnC.pins.find((p) => p.kind === 3 && p.index === 1)
assert.ok(rootVecConnValue)
assert.equal(rootVecConnValue.hasConcreteWrapper, true)
assert.equal(rootVecConnValue.indexOfConcrete, 11)
assert.equal(rootVecConnValue.type, 12)
assert.equal(rootVecConnValue.hasConnection, true)
assert.equal(rootVecConnValue.connectionSourcePinKind, 4)
assert.equal(rootVecConnValue.connectionSourcePinIndex, 0)

console.log('PASS root ordinary setter baseline (float literal / float conn / vec conn)')

// ── Impl shared identity observations ────────────────────────────
const implFloatSetters = collectSetters(implGraph, '额外压力')
const implVecSetters = collectSetters(implGraph, '向量')
assert.ok(implFloatSetters.length >= 2, `impl float setters expected >=2, got ${implFloatSetters.length}`)
assert.ok(implVecSetters.length >= 1, 'impl vec setter missing')

const implFloatLiteral = implFloatSetters.find((n) => (valuePin(n)?.connects?.length ?? 0) === 0)
const implFloatConn = implFloatSetters.find((n) => (valuePin(n)?.connects?.length ?? 0) > 0)
const implVecConn = implVecSetters.find((n) => (valuePin(n)?.connects?.length ?? 0) > 0)

assert.ok(implFloatLiteral, 'impl float literal setter missing')
assert.ok(implFloatConn, 'impl float connection setter missing')
assert.ok(implVecConn, 'impl vec connection setter missing')

const implFloatLitC = extractOrdinaryNodeContract(implFloatLiteral)
const implFloatConnC = extractOrdinaryNodeContract(implFloatConn)
const implVecConnC = extractOrdinaryNodeContract(implVecConn)

assert.equal(implFloatLitC.genericId, 323)
assert.equal(implFloatLitC.concreteId, 324)
const implFloatLitValue = implFloatLitC.pins.find((p) => p.kind === 3 && p.index === 1)
assert.ok(implFloatLitValue)
assert.equal(implFloatLitValue.hasConcreteWrapper, false)
assert.equal(implFloatLitValue.payloadKind, 'float')
assert.equal(implFloatLitValue.literalSummary, '0')

assert.equal(implFloatConnC.concreteId, 324)
const implFloatConnValue = implFloatConnC.pins.find((p) => p.kind === 3 && p.index === 1)
assert.ok(implFloatConnValue)
assert.equal(implFloatConnValue.hasConcreteWrapper, false)
assert.equal(implFloatConnValue.hasConnection, true)
assert.equal(implFloatConnValue.connectionSourcePinKind, 4)
assert.equal(implFloatConnValue.connectionSourcePinIndex, 0)

assert.equal(implVecConnC.concreteId, 334)
const implVecConnValue = implVecConnC.pins.find((p) => p.kind === 3 && p.index === 1)
assert.ok(implVecConnValue)
assert.equal(implVecConnValue.hasConcreteWrapper, false)
assert.equal(implVecConnValue.hasConnection, true)
assert.equal(implVecConnValue.connectionSourcePinKind, 4)
assert.equal(implVecConnValue.connectionSourcePinIndex, 0)

console.log('PASS shared root/impl ordinary identity (float literal / float conn / vec conn)')

// ── Root/impl parity MUST currently fail ─────────────────────────
const cases = [
  { name: 'float-literal', expected: rootFloatLitC, actual: implFloatLitC },
  { name: 'float-connection', expected: rootFloatConnC, actual: implFloatConnC },
  { name: 'vec-connection', expected: rootVecConnC, actual: implVecConnC }
]

const allMismatches: Array<{ name: string; mismatches: ReturnType<typeof compareOrdinaryNodeContracts> }> =
  []
for (const c of cases) {
  const mismatches = compareOrdinaryNodeContracts(c.expected, c.actual, {
    labelExpected: `root/${c.name}`,
    labelActual: `impl/${c.name}`
  })
  allMismatches.push({ name: c.name, mismatches })
}

const total = allMismatches.reduce((n, c) => n + c.mismatches.length, 0)
assert.ok(total > 0, 'expected legacy impl pin schema mismatch to remain in P1-W2')

// Required mismatch categories for this work package
function hasMismatch(pathIncludes: string): boolean {
  return allMismatches.some((c) => c.mismatches.some((m) => m.path.includes(pathIncludes)))
}

assert.ok(!hasMismatch('concreteId'), 'shared identity must eliminate concreteId mismatch')
assert.ok(
  hasMismatch('hasConcreteWrapper'),
  'parity must report hasConcreteWrapper mismatch'
)
assert.ok(hasMismatch('indexOfConcrete'), 'parity must report indexOfConcrete mismatch')

console.log('PASS root/impl parity helper fails on current ordinary schema drift:')
for (const c of allMismatches) {
  console.log(`  [${c.name}] ${c.mismatches.length} mismatch(es)`)
  console.log(formatMismatches(c.mismatches))
}

// Also expose a pure helper unit check (no production encode)
{
  const syntheticRoot = {
    genericId: { nodeId: 323 },
    concreteId: { nodeId: 324 },
    pins: [
      {
        i1: { kind: 3, index: 1 },
        type: 5,
        value: {
          class: 10000,
          alreadySetVal: true,
          bConcreteValue: { indexOfConcrete: 1, value: { class: 4, bFloat: { val: 0 } } }
        },
        connects: []
      }
    ]
  }
  const syntheticImpl = {
    genericId: { nodeId: 323 },
    concreteId: { nodeId: 323 },
    pins: [
      {
        i1: { kind: 3, index: 1 },
        type: 5,
        value: { class: 4, alreadySetVal: true, bFloat: { val: 0 } },
        connects: []
      }
    ]
  }
  const unit = compareOrdinaryNodeContracts(
    extractOrdinaryNodeContract(syntheticRoot),
    extractOrdinaryNodeContract(syntheticImpl)
  )
  assert.ok(unit.some((m) => m.path === 'concreteId'))
  assert.ok(unit.some((m) => m.path === 'pins[0].hasConcreteWrapper'))
  assert.ok(unit.some((m) => m.path === 'pins[0].indexOfConcrete'))
  // nodeIndex/position intentionally absent from contract
  assert.equal(
    Object.keys(extractOrdinaryNodeContract(syntheticRoot)).includes('nodeIndex'),
    false
  )
  console.log('PASS pure helper unit: detects concrete wrapper drift; ignores nodeIndex')
}

// keep findSetter helper exercised
assert.ok(findSetterByVariableName(rootGraph, '额外压力'))
assert.ok(findSetterByVariableName(implGraph, '额外压力'))

console.log('\nP1-W2 RESULT: shared identity green; legacy impl pin schema drift remains')
console.log('output:', outputPath)
console.log('composite id:', ParityComposite.id)
