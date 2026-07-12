// @ts-nocheck
/**
 * P2 game-validation candidate.
 *
 * Reproduces the five composites from the editor-authored P2 reference without relying on
 * auto-chained control flow. Automated checks prove structural intent only; completion still
 * requires explicit user confirmation in the game editor.
 *
 * Run:
 *   npm run build
 *   npx tsx tests/composite/test-stage3-p2-game-validation.ts [output.gia]
 */
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { irToGia } from '../../dist/src/compiler/ir_to_gia_transform/index.js'
import { buildServerGraphRegistriesIRDocuments, g } from '../../dist/src/runtime/core.js'
import { asRuntimeValue, bool, float, str, vec3 } from '../../dist/src/runtime/value.js'
import { setRuntimeOptions } from '../../dist/src/runtime/runtime_config.js'
import { decode_gia_file } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'

const PROTO_PATH = new URL(
  '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto',
  import.meta.url
).pathname
const OUTPUT_PATH = process.argv[2] ?? '/tmp/P2复合节点-gsts-game-validation.gia'

// The editor reference intentionally keeps literal arithmetic as ordinary data nodes.
setRuntimeOptions({ optimize: { precompileExpression: false, removeUnusedNodes: true } })

const floatLiteral = g.defineComposite('P2_FloatLiteral_GSTS', {
  inputs: {},
  outputs: {},
  variables: { test_float: 0.0 },
  build(_inputs: any, f: any) {
    f.set('test_float', new float(0))
    return {}
  }
})

const floatConnection = g.defineComposite('P2_FloatConnection_GSTS', {
  inputs: {},
  outputs: {},
  variables: { test_float: 0.0 },
  build(_inputs: any, f: any) {
    f.set('test_float', f.addition(new float(1.5), new float(2.5)))
    return {}
  }
})

const vec3Connection = g.defineComposite('P2_Vec3Connection_GSTS', {
  inputs: {},
  outputs: {},
  variables: { test_vec3: new vec3([0, 0, 0]) },
  build(_inputs: any, f: any) {
    f.set(
      'test_vec3',
      f._3dVectorAddition(new vec3([1, 0, 0]), new vec3([0, 1, 0]))
    )
    return {}
  }
})

const executionFlow = g.defineComposite('P2_ExecutionFlow_GSTS', {
  inputs: {},
  outputs: {},
  build(_inputs: any, f: any) {
    f.registerExecNode('double_branch', [new bool(false)])
    const first = f.branchExec(1, {
      id: 0,
      type: 'exec',
      nodeType: 'print_string',
      args: [new str('true')]
    })
    const second = f.branchExec(1, {
      id: 0,
      type: 'exec',
      nodeType: 'print_string',
      args: [new str('false')]
    })
    f.outflow('true', first, 0)
    f.outflow('false', second, 0)
    return {}
  }
})

const literalConnectionPair = g.defineComposite('P2_LiteralConnectionPair_GSTS', {
  inputs: {},
  outputs: {},
  variables: { literal_float: 0.0, connected_float: 0.0 },
  build(_inputs: any, f: any) {
    f.registerExecNode('double_branch', [new bool(false)])
    f.branchExec(1, {
      id: 0,
      type: 'exec',
      nodeType: 'set_node_graph_variable',
      args: [new str('literal_float'), new float(0), new bool(false)]
    })
    const addition = f.addition(new float(1), new float(2))
    f.branchExec(1, {
      id: 0,
      type: 'exec',
      nodeType: 'set_node_graph_variable',
      args: [new str('connected_float'), asRuntimeValue(addition), new bool(false)]
    })
    return {}
  }
})

const handles = [
  floatLiteral,
  floatConnection,
  vec3Connection,
  executionFlow,
  literalConnectionPair
]

g.server({ name: 'P2复合节点-GSTS', id: 1073742392 }).on(
  'whenEntityIsCreated',
  (_event: any, f: any) => {
    const entry = f.entry()
    for (const handle of handles) {
      const call = f.declareDetached(handle, {})
      f.link(entry, 0, call)
    }
  }
)

const docs = buildServerGraphRegistriesIRDocuments({ defaultName: 'P2复合节点-GSTS' })
const bytes = irToGia(docs.at(-1), {
  graphId: 1073742392,
  name: 'P2复合节点-GSTS',
  protoPath: PROTO_PATH
})
await writeFile(OUTPUT_PATH, Buffer.from(bytes))

const decoded = await decode_gia_file(OUTPUT_PATH, PROTO_PATH)
const mainNodes = decoded.graph?.graph?.inner?.graph?.nodes ?? []
const eventNode = mainNodes.find((node: any) => node.genericId?.nodeId === 71)
const eventTargets =
  eventNode?.pins
    ?.find((pin: any) => pin.i1?.kind === 2 && pin.i1?.index === 0)
    ?.connects?.map((connect: any) => connect.id) ?? []
assert.equal(eventTargets.length, 5, 'main event must fan out directly to all five composite calls')

const definitions = new Map(
  decoded.accessories
    ?.filter((accessory: any) => accessory.which === 12)
    .map((accessory: any) => [accessory.relatedIds?.[0]?.id, accessory.name]) ?? []
)
const impls = new Map(
  decoded.accessories
    ?.filter((accessory: any) => accessory.which === 9 && definitions.has(accessory.id?.id))
    .map((accessory: any) => [definitions.get(accessory.id?.id), accessory.graph?.inner?.graph]) ?? []
)
assert.equal(impls.size, 5)

const expectedNodeIds = new Map([
  ['P2_FloatLiteral_GSTS', [324]],
  ['P2_FloatConnection_GSTS', [324, 201]],
  ['P2_Vec3Connection_GSTS', [334, 10]],
  ['P2_ExecutionFlow_GSTS', [2, 1, 1]],
  ['P2_LiteralConnectionPair_GSTS', [2, 324, 201, 324]]
])
for (const [name, expected] of expectedNodeIds) {
  const actual = (impls.get(name)?.nodes ?? [])
    .map((node: any) => node.concreteId?.nodeId)
    .sort((a: number, b: number) => a - b)
  assert.deepEqual(actual, [...expected].sort((a, b) => a - b), `${name} concrete node set`)
}

console.log(`PASS P2 candidate structural intent: ${OUTPUT_PATH}`)
console.log('PENDING GAME VALIDATION: automated checks do not complete P2-W1')
