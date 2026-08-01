// @ts-nocheck
/**
 * Real GIL v14 proves signal pins use ConfigurationList=22, PrefabList=23 and
 * VectorList=15. Keep Composite call and impl signal lowering aligned in both backends.
 *
 * Run after `npm run build`:
 *   npx tsx tests/composite/test-stage3-signal-supported-list-var-types.ts
 */

import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'

import { irToGia } from '../../dist/src/compiler/ir_to_gia_transform/index.js'
import { createSignalRegistry } from '../../dist/src/compiler/signal_registry.js'
import {
  buildServerGraphRegistriesIRDocuments,
  defineSignal,
  g
} from '../../dist/src/runtime/core.js'
import { configId, prefabId, vec3 } from '../../dist/src/runtime/value.js'
import { decode_gia_file } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'
import { findImplGraphByCompositeName } from './helpers/ordinary-node-contract.js'

const PROTO_PATH = new URL(
  '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto',
  import.meta.url
).pathname
const GRAPH_ID = 1073742498
const COMPOSITE_NAME = 'SignalSupportedListVarTypes'
const SIGNAL_NAME = 'GSTS_signal_supported_list_var_types'
const EXPECTED_TYPES = [22, 23, 15]

const Signal = defineSignal(SIGNAL_NAME, [
  ['configurations', 'config_id_list'],
  ['prefabs', 'prefab_id_list'],
  ['vectors', 'vec3_list']
] as const)

const sendLists = g.defineComposite(COMPOSITE_NAME, {
  inputs: {
    configurations: { type: 'config_id_list' },
    prefabs: { type: 'prefab_id_list' },
    vectors: { type: 'vec3_list' }
  },
  outputs: {},
  build(inputs: any, f: any) {
    f.sendSignal(Signal, inputs.configurations, inputs.prefabs, inputs.vectors)
    return {}
  }
})

g.server({ name: COMPOSITE_NAME, id: GRAPH_ID }).on(
  'whenEntityIsCreated',
  (_event: any, f: any) => {
    f.callComposite(sendLists, {
      configurations: f.assemblyList([new configId(1n)], 'config_id'),
      prefabs: f.assemblyList([new prefabId(2n)], 'prefab_id'),
      vectors: f.assemblyList([new vec3([1, 2, 3])], 'vec3')
    })
  }
)

const docs = buildServerGraphRegistriesIRDocuments({ defaultName: COMPOSITE_NAME })
const signalRegistry = createSignalRegistry([
  {
    name: SIGNAL_NAME,
    params: Signal.params.map(([name, type]) => ({ name, type })),
    sendId: 1610612771,
    monitorId: 1610612772,
    serverId: 1610612773
  }
])

function dataPins(node: any): any[] {
  return (node.pins ?? [])
    .filter((pin: any) => pin.i1?.kind === 3)
    .sort((a: any, b: any) => (a.i1.index ?? 0) - (b.i1.index ?? 0))
}

for (const [backend, vendorImplGraphBeta] of [
  ['shared', true],
  ['legacy', false]
] as const) {
  const output = `/tmp/stage3-signal-supported-list-var-types-${backend}.gia`
  const bytes = irToGia(docs.at(-1), {
    graphId: GRAPH_ID,
    name: COMPOSITE_NAME,
    protoPath: PROTO_PATH,
    signalRegistry,
    stage3: { vendorImplGraphBeta }
  })
  await writeFile(output, Buffer.from(bytes))
  const decoded = await decode_gia_file(output, PROTO_PATH)
  const root = decoded.graph?.graph?.inner?.graph
  const impl = findImplGraphByCompositeName(decoded, COMPOSITE_NAME)
  assert.ok(root, `${backend}: root graph missing`)
  assert.ok(impl, `${backend}: impl graph missing`)

  const call = (root.nodes ?? []).find((node: any) => node.genericId?.nodeId === sendLists.id)
  const send = (impl.nodes ?? []).find((node: any) =>
    (node.pins ?? []).some((pin: any) => pin.value?.bString?.val === SIGNAL_NAME)
  )
  assert.ok(call, `${backend}: Composite call missing`)
  assert.ok(send, `${backend}: signal send missing`)
  assert.deepEqual(
    dataPins(call).map((pin: any) => pin.type),
    EXPECTED_TYPES,
    `${backend}: Composite call list VarTypes`
  )
  assert.deepEqual(
    dataPins(send).map((pin: any) => pin.type),
    EXPECTED_TYPES,
    `${backend}: impl signal list VarTypes`
  )
}

console.log('PASS supported signal list VarTypes match real GIL in shared and legacy backends')
