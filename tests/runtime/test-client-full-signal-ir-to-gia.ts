import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { clientIrToGia } from '../../src/compiler/client_ir_to_gia.js'
import { createSignalRegistry } from '../../src/compiler/signal_registry.js'
import { buildClientGraphRegistriesIRDocuments, g } from '../../src/runtime/core.js'
import { resetClientGraphRegistriesForTest } from '../../src/runtime/client.js'
import { decode_gia_file } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'

const protoPath = new URL('../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto', import.meta.url).pathname
const cpis: Record<string, number[]> = {
  信号_1: [65, 66, 70, 71, 79],
  信号_全部列表参数测试: [176, 177, 178, 179, 180, 181, 182, 183, 184],
  信号_全部参数测试: [137, 138, 139, 140, 141, 142, 143, 144, 145]
}
const defs = [
  ['信号_1', 1610612740, ['int', 'float', 'vec3', 'entity', 'entity_list']],
  ['信号_全部列表参数测试', 1610612746, ['config_id_list', 'prefab_id_list', 'entity_list', 'guid_list', 'bool_list', 'vec3_list', 'str_list', 'float_list', 'int_list']],
  ['信号_全部参数测试', 1610612743, ['int', 'float', 'vec3', 'guid', 'bool', 'entity', 'prefab_id', 'config_id', 'str']]
] as const
const registry = createSignalRegistry(defs.map(([name, serverId, types]) => ({
  name,
  params: types.map((type, i) => ({ name: `参数_${i + 1}`, type })),
  sendId: serverId - 3,
  monitorId: serverId - 2,
  serverId,
  clientEncoding: {
    parameterCompositePinIndices: cpis[name],
    bindingCompositePinIndex: name === '信号_全部列表参数测试' ? 174 : name === '信号_全部参数测试' ? 135 : 63,
    nameCompositePinIndex: name === '信号_全部列表参数测试' ? 175 : name === '信号_全部参数测试' ? 136 : 64
  }
})))
resetClientGraphRegistriesForTest()
g.client({ type: 'skill', id: 1082130433, name: 'full-client-signal' }).onStart((f) => {
  const self = f.getSelfEntity()
  const guid = f.queryGuidByEntity(self)
  f.sendSignalToServerNodeGraphValues('信号_1', [1, 2.2, [1, 2, 3.4], self, f.assemblyList('entity', [self])])
  f.sendSignalToServerNodeGraphValues('信号_全部列表参数测试', [
    f.assemblyList('config_id', [3453544]), f.assemblyList('prefab_id', [2345]), f.assemblyList('entity', [self]),
    f.assemblyList('guid', [guid]), f.assemblyList('bool', [false, true, false]),
    f.assemblyList('vec3', [[1, 2, 3.4], [4, 5, 6.7]]),
    f.assemblyList('str', ['字符串']), f.assemblyList('float', [2.2]), f.assemblyList('int', [1])
  ])
  f.sendSignalToServerNodeGraphValues('信号_全部参数测试', [1, 2.2, [1, 2, 3.4], guid, true, self, 2345, 3453544, '字符串'])
})
const [ir] = buildClientGraphRegistriesIRDocuments()
const out = 'Beyond_Local_Export/gsts-client-full-signal-ts-complete-3signals.gia'
writeFileSync(out, clientIrToGia(ir, registry, protoPath))
const data = decode_gia_file(out, undefined, false) as any
const nodes = data.graph.graph.inner.graph.nodes as any[]
assert.deepEqual(data.graph.relatedIds, [1610612740, 1610612746, 1610612743].map((id) => ({ class: 23, type: 0, id })))
const signalNodes = [1610612740, 1610612746, 1610612743].map((id) => nodes.find((node) => node.genericId?.nodeId === id))
assert.deepEqual(signalNodes.map((node) => node?.pins.filter((pin: any) => pin.i1?.kind === 3).length), [5, 9, 9])
assert.equal(nodes.filter((node) => node.genericId?.nodeId === 200049).length, 10)
// Client GraphNode is already the protobuf-level representation. Shared layout
// coordinates must not be divided by the server encoder's 300/200 conversion.
assert.ok(signalNodes.some((node) => Math.abs(node?.x ?? 0) > 100))
assert.ok(nodes.filter((node) => node.genericId?.nodeId === 200049).some((node) => Math.abs(node.x ?? 0) > 100))
assert.deepEqual(signalNodes.slice(0, 2).map((node, index) => node?.pins.find((pin: any) => pin.i1?.kind === 2)?.connects?.[0]?.id), signalNodes.slice(1).map((node) => node?.nodeIndex))
assert.equal(nodes.find((n) => n.genericId.nodeId === 200033)?.concreteId.nodeId, 1013)
assert.equal(nodes.find((n) => n.genericId.nodeId === 200027)?.concreteId.nodeId, 1005)
assert.deepEqual(nodes.filter((n) => n.genericId.nodeId === 200049).map((n) => n.concreteId.nodeId), [1025, 568, 569, 1025, 1043, 1027, 1030, 1029, 173, 1026])
const self = nodes.find((n) => n.genericId.nodeId === 200033)
const query = nodes.find((n) => n.genericId.nodeId === 200027)
const completeSignal = nodes.find((n) => n.genericId.nodeId === 1610612743)
assert.ok(self && query && completeSignal)
assert.deepEqual(self.pins.find((p: any) => p.i1?.kind === 4)?.connects, [])
assert.deepEqual(query.pins.find((p: any) => p.i1?.kind === 3)?.connects, [
  { id: self.nodeIndex, connect: { kind: 4, index: 0 }, connect2: { kind: 4, index: 0 } }
])
assert.deepEqual(query.pins.find((p: any) => p.i1?.kind === 4)?.connects, [])
const firstSignal = nodes.find((n) => n.genericId.nodeId === 1610612740)
assert.ok(firstSignal)
assert.deepEqual(firstSignal.pins.find((p: any) => p.i1?.kind === 3 && p.i1.index === 3)?.connects, [
  { id: self.nodeIndex, connect: { kind: 4, index: 0 }, connect2: { kind: 4, index: 0 } }
])
assert.deepEqual(completeSignal.pins.find((p: any) => p.i1?.kind === 3 && p.i1.index === 5)?.connects, [
  { id: self.nodeIndex, connect: { kind: 4, index: 0 }, connect2: { kind: 4, index: 0 } }
])
assert.deepEqual(completeSignal.pins.find((p: any) => p.i1?.kind === 3 && p.i1.index === 3)?.connects, [
  { id: query.nodeIndex, connect: { kind: 4, index: 0 }, connect2: { kind: 4, index: 0 } }
])
const listAssemblies = nodes.filter((n) => n.genericId.nodeId === 200049)
const boolAssembly = listAssemblies.find((n) => n.concreteId.nodeId === 1027)
const vec3Assembly = listAssemblies.find((n) => n.concreteId.nodeId === 1030)
assert.ok(boolAssembly && vec3Assembly)
assert.equal(boolAssembly.pins[0].value.bInt.val, 3)
assert.deepEqual(boolAssembly.pins.slice(1, 4).map((pin: any) => pin.value.bConcreteValue.value.bEnum.val), [0, 1, 0])
assert.equal(vec3Assembly.pins[0].value.bInt.val, 2)
assert.deepEqual(vec3Assembly.pins.slice(1, 3).map((pin: any) => {
  const value = pin.value.bConcreteValue.value.bVector.val
  return [value.x, value.y, Number(value.z.toFixed(1))]
}), [[1, 2, 3.4], [4, 5, 6.7]])
for (const id of [1610612740, 1610612746, 1610612743]) {
  const n = nodes.find((node) => node.genericId.nodeId === id)
  assert.ok(n)
  assert.equal(n.concreteId.nodeId, 2000)
}
console.log(`Client full TS → IR → GIA checks passed: ${out}`)
