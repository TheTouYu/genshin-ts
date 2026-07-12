// @ts-nocheck
/**
 * P2-W4 editor-authored-reference candidate: float local variables.
 *
 * This deliberately uses explicit execution links so the root event and composite entry fan out
 * into literal and connected-value branches. It is a candidate for editor review, not evidence
 * that the current local-variable lowering is correct.
 *
 * Run:
 *   npm run build
 *   npx tsx tests/composite/test-stage3-p2w4-local-variable-reference-candidate.ts [output.gia]
 */
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'

import { irToGia } from '../../dist/src/compiler/ir_to_gia_transform/index.js'
import { buildServerGraphRegistriesIRDocuments, g } from '../../dist/src/runtime/core.js'
import { asRuntimeValue, float, str } from '../../dist/src/runtime/value.js'
import { setRuntimeOptions } from '../../dist/src/runtime/runtime_config.js'
import { decode_gia_file } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'

const PROTO_PATH = new URL(
  '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto',
  import.meta.url
).pathname
const OUTPUT_PATH = process.argv[2] ?? '/tmp/P2W4局部变量-float-reference-candidate.gia'
const GRAPH_ID = 1073742394
const COMPOSITE_NAME = 'P2W4_LocalVariable_Float_GSTS'

// Keep arithmetic visible as ordinary nodes for editor review.
setRuntimeOptions({ optimize: { precompileExpression: false, removeUnusedNodes: false } })

function addFloatLocalVariableBranches(f: any) {
  const literalLocal = f.getLocalVariable(new float(10))
  const literalSetter = f.node('set_local_variable', [
    literalLocal.localVariable,
    new float(1.25)
  ])
  const literalRead = f.addition(literalLocal.value, new float(0))
  const literalPrint = f.node('print_string', [f.dataTypeConversion(literalRead, 'str')])

  const connectedLocal = f.getLocalVariable(new float(20))
  const connectedProducer = f.addition(new float(2), new float(3))
  const connectedSetter = f.node('set_local_variable', [
    connectedLocal.localVariable,
    asRuntimeValue(connectedProducer)
  ])
  const connectedRead = f.addition(connectedLocal.value, new float(0))
  const connectedPrint = f.node('print_string', [f.dataTypeConversion(connectedRead, 'str')])

  return { literalSetter, literalPrint, connectedSetter, connectedPrint }
}

const localVariableComposite = g.defineComposite(COMPOSITE_NAME, {
  inputs: {},
  outputs: {},
  build(_inputs: any, f: any) {
    const branches = addFloatLocalVariableBranches(f)
    const entry = f.entry()
    f.link(entry, 0, branches.literalSetter)
    f.link(entry, 0, branches.connectedSetter)
    f.link(branches.literalSetter, 0, branches.literalPrint)
    f.link(branches.connectedSetter, 0, branches.connectedPrint)
    return {}
  }
})

g.server({ name: 'P2W4局部变量-float-参考候选', id: GRAPH_ID }).on(
  'whenEntityIsCreated',
  (_event: any, f: any) => {
    const branches = addFloatLocalVariableBranches(f)
    const compositeCall = f.declareDetached(localVariableComposite, {})
    const entry = f.entry()
    f.link(entry, 0, branches.literalSetter)
    f.link(entry, 0, branches.connectedSetter)
    f.link(entry, 0, compositeCall)
    f.link(branches.literalSetter, 0, branches.literalPrint)
    f.link(branches.connectedSetter, 0, branches.connectedPrint)
  }
)

const docs = buildServerGraphRegistriesIRDocuments({ defaultName: 'P2W4局部变量-float-参考候选' })
const doc = docs.at(-1)
const bytes = irToGia(doc, {
  graphId: GRAPH_ID,
  name: 'P2W4局部变量-float-参考候选',
  protoPath: PROTO_PATH
})
await writeFile(OUTPUT_PATH, Buffer.from(bytes))

const decoded = await decode_gia_file(OUTPUT_PATH, PROTO_PATH)
const rootGraph = decoded.graph?.graph?.inner?.graph
assert.ok(rootGraph, 'root graph missing')

const eventNode = rootGraph.nodes?.find((node: any) => node.genericId?.nodeId === 71)
const eventTargets = eventNode?.pins
  ?.find((pin: any) => pin.i1?.kind === 2 && pin.i1?.index === 0)
  ?.connects?.map((connect: any) => connect.id) ?? []
assert.equal(eventTargets.length, 3, 'event must directly fan out to two local setters and composite call')

const definitions = new Map(
  decoded.accessories
    ?.filter((accessory: any) => accessory.which === 12)
    .map((accessory: any) => [accessory.relatedIds?.[0]?.id, accessory.name]) ?? []
)
const implGraph = decoded.accessories
  ?.find(
    (accessory: any) =>
      accessory.which === 9 && definitions.get(accessory.id?.id) === COMPOSITE_NAME
  )
  ?.graph?.inner?.graph
assert.ok(implGraph, `composite impl missing: ${COMPOSITE_NAME}`)

for (const [scope, graph] of [
  ['root', rootGraph],
  ['impl', implGraph]
]) {
  const nodes = graph.nodes ?? []
  const getters = nodes.filter((node: any) => node.genericId?.nodeId === 18)
  const setters = nodes.filter((node: any) => node.genericId?.nodeId === 19)
  assert.equal(getters.length, 2, `${scope} getters`)
  assert.equal(setters.length, 2, `${scope} setters`)
  for (const getter of getters) {
    assert.equal(getter.concreteId?.nodeId, 2659, `${scope} float getter concrete ID`)
    const input = getter.pins?.find((pin: any) => pin.i1?.kind === 3 && pin.i1?.index === 0)
    const value = getter.pins?.find((pin: any) => pin.i1?.kind === 4 && pin.i1?.index === 1)
    assert.equal(input?.value?.bConcreteValue?.indexOfConcrete, 5, `${scope} getter input wrapper`)
    assert.equal(value?.value?.bConcreteValue?.indexOfConcrete, 5, `${scope} getter value output wrapper`)
  }
  for (const setter of setters) {
    assert.equal(setter.concreteId?.nodeId, 2677, `${scope} float setter concrete ID`)
  }
  assert.equal(nodes.filter((node: any) => node.genericId?.nodeId === 200).length, 3, `${scope} additions`)
  assert.equal(nodes.filter((node: any) => node.genericId?.nodeId === 180).length, 2, `${scope} float-to-string`)
  assert.equal(nodes.filter((node: any) => node.genericId?.nodeId === 1).length, 2, `${scope} prints`)
}

console.log(`PASS P2-W4 candidate topology: ${OUTPUT_PATH}`)
console.log('PENDING EDITOR REVIEW: export the editor-corrected file as the real-GIA reference')
