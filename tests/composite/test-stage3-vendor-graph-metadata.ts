// @ts-nocheck
/**
 * P2-W1: vendor Graph materialization metadata observation.
 *
 * This is an observation/guard test only. It does not switch the composite impl
 * backend. It records the metadata emitted by a standalone vendor Graph so the
 * later impl embedding work can compare it with the CompositeDef NodeGraph.
 *
 * Run: npx tsx tests/composite/test-stage3-vendor-graph-metadata.ts
 */

import assert from 'node:assert/strict'

import { Graph } from '../../src/compiler/gia_vendor.js'
import { irToGia } from '../../dist/src/compiler/ir_to_gia_transform/index.js'
import { buildServerGraphRegistriesIRDocuments, g } from '../../dist/src/runtime/core.js'
import { bool, str } from '../../dist/src/runtime/value.js'
import { decode_gia_file } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'

const PROTO_PATH = new URL(
  '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto',
  import.meta.url
).pathname

const graph = new Graph('server', 7001, 'p2w1-vendor-metadata', 7002)
const setter = graph.add_node(324)
setter.setPos(0, 0)
setter.setVal(0, '额外压力')
setter.setVal(1, 0)
setter.setVal(2, false)

const encoded = graph.encode() as any
const encodedGraph = encoded.graph?.graph?.inner?.graph
const node = encodedGraph?.nodes?.[0]

assert.ok(encodedGraph, 'vendor Graph must encode an inner graph')
assert.equal(encodedGraph.id?.class, 10000)
assert.equal(encodedGraph.id?.type, 20000)
assert.equal(encodedGraph.id?.kind, 21001)
assert.equal(encodedGraph.id?.id, 7002)
assert.equal(encodedGraph.name, 'p2w1-vendor-metadata')
assert.equal(encoded.graph?.name, 'p2w1-vendor-metadata')
assert.equal(encoded.graph?.graph?.inner?.graph?.name, encodedGraph.name)
console.log('vendor graph keys:', Object.keys(encodedGraph).sort().join(','))
assert.deepEqual(encodedGraph.graphValues, [])
assert.deepEqual(encodedGraph.compositePins, [])
assert.deepEqual(encodedGraph.affiliations, [])

assert.ok(node, 'vendor Graph must encode the setter node')
assert.equal(node.nodeIndex, 1)
assert.equal(node.genericId?.nodeId, 323)
assert.equal(node.concreteId?.nodeId, 324)
assert.equal(typeof node.x, 'number')
assert.equal(typeof node.y, 'number')
assert.ok(node.x >= 0 && node.x < 10, `vendor x shaking out of range: ${node.x}`)
assert.ok(node.y >= 0 && node.y < 10, `vendor y shaking out of range: ${node.y}`)

const valuePin = node.pins.find((pin: any) => pin.i1?.kind === 3 && pin.i1?.index === 1)
assert.ok(valuePin, 'vendor setter must contain InParam[1]')
assert.equal(valuePin.type, 5)
assert.equal(valuePin.value?.class, 10000)
assert.equal(valuePin.value?.bConcreteValue?.indexOfConcrete, 1)
assert.equal(valuePin.value?.bConcreteValue?.value?.bFloat?.val, 0)

// Branch-flow baseline: Graph.flow emits flow pins on the source node and preserves
// source/target flow indices in the encoded wire structure.
const flowGraph = new Graph('server', 7003, 'p2w1-vendor-flow', 7004)
const flowSource = flowGraph.add_node(324)
const flowTargetA = flowGraph.add_node(324)
const flowTargetB = flowGraph.add_node(324)
flowGraph.flow(flowSource, flowTargetA, 0, 0)
flowGraph.flow(flowSource, flowTargetB, 1, 0)
const encodedFlowGraph = (flowGraph.encode() as any).graph?.graph?.inner?.graph
const flowNode = encodedFlowGraph?.nodes?.find((candidate: any) => candidate.nodeIndex === flowSource.NodeIndex)
const flowPins = flowNode?.pins?.filter((pin: any) => pin.i1?.kind === 2)
assert.equal(encodedFlowGraph.name, 'p2w1-vendor-flow')
assert.equal(flowPins?.length, 2)
assert.deepEqual(flowPins.map((pin: any) => pin.i1.index), [0, 1])
assert.deepEqual(flowPins[0].connects[0].connect, { kind: 1, index: 0 })
assert.deepEqual(flowPins[1].connects[0].connect, { kind: 1, index: 0 })
assert.equal(flowPins[0].connects[0].id, flowTargetA.NodeIndex)
assert.equal(flowPins[1].connects[0].id, flowTargetB.NodeIndex)

console.log('PASS P2-W1 vendor Graph metadata observation')
console.log(JSON.stringify({
  graph: {
    graph_id: encodedGraph.graphId,
    file_id: encodedGraph.fileId,
    graph_name: encodedGraph.graphName,
    graphValues: encodedGraph.graphValues?.length ?? 0,
    compositePins: encodedGraph.compositePins?.length ?? 0,
    affiliations: encodedGraph.affiliations?.length ?? 0
  },
  node: {
    nodeIndex: node.nodeIndex,
    genericId: node.genericId?.nodeId,
    concreteId: node.concreteId?.nodeId,
    x: node.x,
    y: node.y
  }
}, null, 2))
console.log('UNPROVEN: standalone vendor Graph metadata is not yet proven compatible with impl NodeGraph embedding')

// Compare the same ordinary setter with the current composite impl wrapper.
const MetadataComposite = g.defineComposite('p2w1-metadata-composite', {
  inputs: {},
  outputs: {},
  variables: { 额外压力: 0.0, a: 1.5, b: 2.5 },
  build(_inputs: any, f: any) {
    f.set('额外压力', 0)
    f.set('额外压力', f.addition(f.get('a'), f.get('b')))
    f.registerExecNode('double_branch', [new bool(true)])
    const leaf = f.branchExec(0, {
      id: 0,
      type: 'exec',
      nodeType: 'print_string',
      args: [new str('p2w1-flow-leaf')]
    })
    f.outflow('完成', leaf, 0)
    return {}
  }
})
g.server({ name: 'p2w1-metadata-root', id: 1073742111 })
  .on('whenEntityIsCreated', (_event: any, f: any) => {
    f.callComposite(MetadataComposite, {})
  })
const docs = buildServerGraphRegistriesIRDocuments({ defaultName: 'p2w1-metadata-root' })
const bytes = irToGia(docs.at(-1), {
  graphId: 1073742111,
  name: 'p2w1-metadata-root',
  protoPath: PROTO_PATH
})
const outputPath = '/tmp/p2w1-vendor-metadata-composite.gia'
await import('node:fs/promises').then(({ writeFile }) => writeFile(outputPath, Buffer.from(bytes)))
const decoded = decode_gia_file(outputPath, PROTO_PATH)
const implGraph = decoded.accessories
  ?.find((accessory: any) => accessory.name === 'p2w1-metadata-composite')
  ?.relatedIds?.[0]?.id
  ? decoded.accessories.find((accessory: any) => accessory.id?.id === implGraphId(decoded, 'p2w1-metadata-composite'))
  : undefined
const implInner = implGraph?.graph?.inner?.graph
assert.ok(implInner, 'current composite impl graph must be present')
assert.equal(implInner.id?.kind, 21002)
assert.equal(typeof implInner.name, 'string')
console.log('observed impl graph wrapper:', JSON.stringify({
  class: implInner.id?.class,
  type: implInner.id?.type,
  kind: implInner.id?.kind,
  id: implInner.id?.id,
  name: implInner.name
}))
assert.deepEqual(implInner.graphValues, encodedGraph.graphValues)
assert.ok(Array.isArray(implInner.compositePins))
assert.ok(implInner.compositePins.length >= 1)
console.log(`observed impl composite pins: ${implInner.compositePins.length}`)
assert.deepEqual(implInner.affiliations, encodedGraph.affiliations)
assert.ok(implInner.nodes.length >= 3, 'fixture must contain multiple ordinary nodes')
assert.ok(implInner.nodes.every((implNode: any) => implNode.genericId?.nodeId != null))
assert.ok(implInner.nodes.every((implNode: any) => implNode.nodeIndex >= 2))
const implSetters = implInner.nodes.filter((implNode: any) => implNode.genericId?.nodeId === 323)
assert.equal(implSetters.length, 2)
assert.ok(implSetters.every((implNode: any) => implNode.concreteId?.nodeId === 324))
const connectedSetter = implSetters.find((implNode: any) =>
  implNode.pins.some((pin: any) => pin.i1?.kind === 3 && pin.i1?.index === 1 && pin.connects?.length)
)
assert.ok(connectedSetter, 'impl data edge must target a setter value pin')
const connectedValuePin = connectedSetter.pins.find((pin: any) => pin.i1?.kind === 3 && pin.i1?.index === 1)
assert.equal(connectedValuePin.connects[0].connect.kind, 4)
assert.equal(connectedValuePin.connects[0].connect.index, 0)
const implConnectedPins = implInner.nodes.flatMap((implNode: any) =>
  implNode.pins.filter((pin: any) => pin.connects?.length)
)
const implFlowPins = implConnectedPins.filter((pin: any) => pin.i1?.kind === 2)
console.log('observed impl connected pins:', JSON.stringify(implConnectedPins.map((pin: any) => ({
  kind: pin.i1?.kind,
  index: pin.i1?.index,
  connects: pin.connects
}))))
assert.ok(implFlowPins.length > 0, 'fixture must contain encoded impl execution-flow edges')
assert.ok(implFlowPins.every((pin: any) => pin.connects.every((connect: any) => connect.connect?.kind === 1)))
console.log(`observed current impl flow pins: ${implFlowPins.length}`)
console.log('PASS current impl wrapper preserves metadata and remaps multi-node data/flow structure')
console.log('UNPROVEN: current impl node pin encoding is still handwritten and not vendor Graph materialization')

function implGraphId(decodedGia: any, compositeName: string): number | undefined {
  return decodedGia.accessories
    ?.find((accessory: any) => accessory.name === compositeName)
    ?.relatedIds?.[0]?.id
}
