import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { clientIrToGia } from '../../src/compiler/client_ir_to_gia.js'
import { createSignalRegistry } from '../../src/compiler/signal_registry.js'
import { buildClientGraphRegistriesIRDocuments, g } from '../../src/runtime/core.js'
import { resetClientGraphRegistriesForTest } from '../../src/runtime/client.js'
import { decode_gia_file } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'

const protoPath = new URL('../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto', import.meta.url).pathname
const registry = createSignalRegistry([
  {
    name: '信号_1',
    params: [{ name: '整数', type: 'int' }, { name: '浮点', type: 'float' }, { name: '位置', type: 'vec3' }, { name: '实体', type: 'entity' }, { name: '实体列表', type: 'entity_list' }],
    sendId: 1, monitorId: 2, serverId: 1610612740,
    clientEncoding: { parameterCompositePinIndices: [65, 66, 70, 71, 79], bindingCompositePinIndex: 63, nameCompositePinIndex: 64 }
  },
  {
    name: '信号_全部参数测试',
    params: [{ name: '整数', type: 'int' }, { name: '浮点', type: 'float' }, { name: '旋转', type: 'vec3' }, { name: 'GUID', type: 'guid' }, { name: '战斗中', type: 'bool' }, { name: '实体', type: 'entity' }, { name: 'Prefab', type: 'prefab_id' }, { name: '配置', type: 'config_id' }, { name: '文本', type: 'str' }],
    sendId: 3, monitorId: 4, serverId: 1610612743,
    clientEncoding: { parameterCompositePinIndices: [137, 138, 139, 140, 141, 142, 143, 144, 145], bindingCompositePinIndex: 135, nameCompositePinIndex: 136 }
  }
])

resetClientGraphRegistriesForTest()
g.client({ type: 'skill', id: 1082130461, name: 'client-scalar-arithmetic-series' }).onStart((f) => {
  const and = f.booleanAnd(true, false)
  const or = f.booleanOr(true, false)
  const not = f.booleanNot(false)
  const xor = f.booleanXor(true, false)
  const input = f.sine(0.25)
  const sine = f.sine(input)
  const cosine = f.cosine(0.25)
  const tangent = f.tangent(0.25)
  const arcsine = f.arcsine(0.25)
  const arccosine = f.arccosine(0.25)
  const arctangent = f.arctangent(0.25)
  const degrees = f.radiansToDegrees(0.5)
  const radians = f.degreesToRadians(45)
  const self = f.getSelfEntity()
  const list = f.assemblyList('entity', [self])
  const sendBool = (value: any, index: number) => f.sendSignalToServerNodeGraphValues('信号_全部参数测试', [index, 0, [0, 0, 0], 0, value, self, 1, 2, 'scalar-series'])
  const sendFloat = (value: any, index: number) => f.sendSignalToServerNodeGraphValues('信号_1', [index, value, [0, 0, 0], self, list])
  sendBool(and, 1)
  sendBool(or, 2)
  sendBool(not, 3)
  sendBool(xor, 4)
  sendFloat(sine, 5)
  sendFloat(cosine, 6)
  sendFloat(tangent, 7)
  sendFloat(arcsine, 8)
  sendFloat(arccosine, 9)
  sendFloat(arctangent, 10)
  sendFloat(degrees, 11)
  sendFloat(radians, 12)
})

const [ir] = buildClientGraphRegistriesIRDocuments()
const expected = [
  'boolean_and', 'boolean_or', 'boolean_not', 'boolean_xor', 'sine', 'sine', 'cosine',
  'tangent', 'arcsine', 'arccosine', 'arctangent', 'radians_to_degrees', 'degrees_to_radians',
  'get_self_entity', 'assembly_list', ...Array.from({ length: 12 }, () => 'send_signal_to_server_node_graph')
]
assert.deepEqual(ir.nodes?.filter((node) => node.type !== 'client_graph_begins').map((node) => node.type), expected)
const out = 'Beyond_Local_Export/gsts-client-scalar-arithmetic-series.gia'
writeFileSync(out, clientIrToGia(ir, registry, protoPath))
const data = decode_gia_file(out, undefined, false) as any
const nodes = data.graph.graph.inner.graph.nodes as any[]
const concrete: Record<number, number> = {
  200001: 1, 200002: 2, 200003: 3, 200004: 4, 200094: 35, 200095: 35,
  200096: 35, 200097: 35, 200098: 35, 200099: 35, 200101: 35, 200102: 35
}
for (const [generic, kernel] of Object.entries(concrete)) {
  const node = nodes.find((candidate) => candidate.genericId?.nodeId === Number(generic))
  assert.ok(node, `missing scalar node ${generic}`)
  assert.equal(node.concreteId?.nodeId, kernel)
}
for (const id of [200094, 200095, 200096, 200097, 200098, 200099, 200101, 200102]) {
  const node = nodes.find((candidate) => candidate.genericId?.nodeId === id)
  const hidden = node.pins.find((pin: any) => pin.i1?.kind === 3 && pin.i1.index === 0)
  assert.equal(hidden?.type, 13)
  assert.ok(hidden?.value?.bEnum?.val !== undefined)
}
assert.equal(nodes.filter((node) => node.genericId?.nodeId === 1610612740 || node.genericId?.nodeId === 1610612743).length, 12)
assert.ok(nodes.some((node) => Math.abs(node.x ?? 0) > 100))
console.log(`Client scalar arithmetic series TS → IR → GIA checks passed: ${out}`)
