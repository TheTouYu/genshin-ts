import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { clientIrToGia } from '../../src/compiler/client_ir_to_gia.js'
import { createSignalRegistry } from '../../src/compiler/signal_registry.js'
import { decode_gia_file } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'
import { NodePin_Index_Kind } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto.js'

const protoPath = new URL('../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto', import.meta.url).pathname
const realReference = 'Beyond_Local_Export/user_edit/客户端/信号-参数-完整-列表.gia'
const realReferenceData = decode_gia_file(realReference, undefined, false) as any
const realNodes = realReferenceData.graph.graph.inner.graph.nodes as any[]
assert.equal(readFileSync(realReference).length, 11308)
assert.equal(realNodes.filter((node) => node.genericId?.nodeId === 200049).length, 6)
const realListSignal = realNodes.find((node) => node.genericId?.nodeId === 1610612746)
assert.ok(realListSignal)
assert.deepEqual(
  realListSignal.pins.filter((pin: any) => pin.i1?.kind === NodePin_Index_Kind.InParam).map((pin: any) => pin.type),
  [20, 21, 2, 15, 6, 12, 10, 8, 4]
)
assert.deepEqual(
  realListSignal.pins.filter((pin: any) => pin.i1?.kind === NodePin_Index_Kind.InParam).map((pin: any) => pin.connects?.length ?? 0),
  [0, 0, 1, 1, 1, 1, 1, 0, 1]
)
const registry = createSignalRegistry([{
  name: '列表编码测试',
  params: [
    { name: 'direct', type: 'int_list' },
    { name: 'assembled', type: 'str_list' }
  ],
  sendId: 1610612743,
  monitorId: 1610612742,
  serverId: 1610612743,
  clientEncoding: {
    parameterCompositePinIndices: [137, 138],
    bindingCompositePinIndex: 135,
    nameCompositePinIndex: 136
  }
}])

const ir = {
  ir_version: 1,
  ir_type: 'node_graph',
  graph: { type: 'client', client_type: 'skill', id: 1082130700, name: 'list-encoding' },
  nodes: [
    { id: 1, type: 'client_graph_begins' },
    {
      id: 2,
      type: 'send_signal_to_server_node_graph',
      signalRef: { name: '列表编码测试' },
      clientValues: [
        {
          kind: 'list',
          encoding: 'direct-list',
          elementType: 'int',
          elements: [
            { kind: 'literal', type: 'int', value: 7 },
            { kind: 'literal', type: 'int', value: 8 }
          ]
        },
        {
          kind: 'list',
          encoding: 'assembly-list',
          elementType: 'str',
          node_id: 3,
          index: 0,
          elements: [{ kind: 'literal', type: 'str', value: 'assembled' }]
        }
      ]
    },
    {
      id: 3,
      type: 'assembly_list',
      elementType: 'str',
      elementCount: 1,
      elementValues: [{ kind: 'literal', type: 'str', value: 'assembled' }]
    }
  ]
} as any

const output = '/tmp/gsts-client-list-encoding.gia'
const bytes = clientIrToGia(ir, registry, protoPath)
await import('node:fs/promises').then(({ writeFile }) => writeFile(output, bytes))
const data = decode_gia_file(output, undefined, false) as any
const nodes = data.graph.graph.inner.graph.nodes as any[]
assert.equal(nodes.filter((node) => node.genericId?.nodeId === 200049).length, 1)
const signal = nodes.find((node) => node.genericId?.nodeId === 1610612743)
assert.ok(signal)
const directPin = signal.pins.find((pin: any) => pin.i1?.kind === NodePin_Index_Kind.InParam && pin.i1.index === 0)
assert.equal(directPin.type, 4)
assert.equal(directPin.value.class, 10002)
assert.equal(directPin.value.alreadySetVal, true)
assert.deepEqual(directPin.value.bArray.entries.map((entry: any) => entry.bInt.val), [7, 8])
assert.deepEqual(directPin.connects, [])
const assemblyPin = signal.pins.find((pin: any) => pin.i1?.kind === NodePin_Index_Kind.InParam && pin.i1.index === 1)
const assembly = nodes.find((node) => node.genericId?.nodeId === 200049)
assert.ok(assembly)
assert.deepEqual(assemblyPin.connects, [{
  id: assembly.nodeIndex,
  connect: { kind: NodePin_Index_Kind.OutParam, index: 0 },
  connect2: { kind: NodePin_Index_Kind.OutParam, index: 0 }
}])
assert.deepEqual(assembly.pins[assembly.pins.length - 1].connects, [])
console.log(`Client direct-list / assembly-list checks passed: ${output}`)
