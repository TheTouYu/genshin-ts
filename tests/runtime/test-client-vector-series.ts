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
    params: [
      { name: '整数', type: 'int' },
      { name: '浮点', type: 'float' },
      { name: '位置', type: 'vec3' },
      { name: '实体', type: 'entity' },
      { name: '实体列表', type: 'entity_list' }
    ],
    sendId: 1610612737,
    monitorId: 1610612738,
    serverId: 1610612740,
    clientEncoding: { parameterCompositePinIndices: [65, 66, 70, 71, 79], bindingCompositePinIndex: 63, nameCompositePinIndex: 64 }
  },
  {
    name: '信号_全部参数测试',
    params: [
      { name: '整数', type: 'int' },
      { name: '浮点', type: 'float' },
      { name: '旋转', type: 'vec3' },
      { name: 'GUID', type: 'guid' },
      { name: '战斗中', type: 'bool' },
      { name: '实体', type: 'entity' },
      { name: 'Prefab', type: 'prefab_id' },
      { name: '配置', type: 'config_id' },
      { name: '文本', type: 'str' }
    ],
    sendId: 1610612740,
    monitorId: 1610612741,
    serverId: 1610612743,
    clientEncoding: { parameterCompositePinIndices: [137, 138, 139, 140, 141, 142, 143, 144, 145], bindingCompositePinIndex: 135, nameCompositePinIndex: 136 }
  }
])

resetClientGraphRegistriesForTest()
g.client({ type: 'skill', id: 1082130460, name: 'client-vector-series' }).onStart((f) => {
  const a: [number, number, number] = [1, 2, 3]
  const b: [number, number, number] = [4, 5, 6]
  const dot = f.dotVector3(a, b)
  const cross = f.crossVector3(a, b)
  const split = f.splitVector3(a)
  const scaled = f.scaleVector3(2, b)
  const angle = f.angleBetweenVector3(a, b)
  const rotated = f.rotateVector3(a, [0, 90, 0])
  const length = f.vector3Length(b)
  const created = f.createVector3(7, 8, 9)
  const normalized = f.normalizeVector3(b)
  const directionRotation = f.directionVectorToRotation([0, 0, 1], [0, 1, 0])
  const self = f.getSelfEntity()
  const list = f.assemblyList('entity', [self])
  const sendFloat = (value: any, index: number) => f.sendSignalToServerNodeGraphValues('信号_全部参数测试', [index, value, [0, 0, 0], 0, false, self, 1, 2, 'vector-series'])
  const sendVector = (value: any, index: number) => f.sendSignalToServerNodeGraphValues('信号_1', [index, 0, value, self, list])
  sendFloat(dot, 1)
  sendVector(cross, 2)
  sendFloat(split.x, 3)
  sendVector(scaled, 4)
  sendFloat(angle, 5)
  sendVector(rotated, 6)
  sendFloat(length, 7)
  sendVector(created, 8)
  sendVector(normalized, 9)
  sendVector(directionRotation, 10)
  void split.y
  void split.z
})

const [ir] = buildClientGraphRegistriesIRDocuments()
const expected = [
  'dot_vector3', 'cross_vector3', 'split_vector3', 'scale_vector3', 'angle_vector3',
  'rotate_vector3', 'length_vector3', 'create_vector3', 'normalize_vector3', 'direction_to_rotation',
  'get_self_entity', 'assembly_list',
  ...Array.from({ length: 10 }, () => 'send_signal_to_server_node_graph')
]
assert.deepEqual(ir.nodes?.filter((node) => node.type !== 'client_graph_begins').map((node) => node.type), expected)
const out = 'Beyond_Local_Export/gsts-client-vector-series.gia'
writeFileSync(out, clientIrToGia(ir, registry, protoPath))
const data = decode_gia_file(out, undefined, false) as any
const nodes = data.graph.graph.inner.graph.nodes as any[]
const expectedIdentity: Record<number, number> = {
  200063: 131, 200064: 132, 200065: 133, 200066: 134, 200067: 135,
  200068: 136, 200069: 137, 200070: 1024, 200100: 138, 200073: 139
}
for (const [generic, kernel] of Object.entries(expectedIdentity)) {
  const node = nodes.find((candidate) => candidate.genericId?.nodeId === Number(generic))
  assert.ok(node, `missing client vector node ${generic}`)
  assert.equal(node.concreteId?.nodeId, kernel)
}
const signalNodes = nodes.filter((node) => node.genericId?.nodeId === 1610612740 || node.genericId?.nodeId === 1610612743)
assert.equal(signalNodes.length, 10)
assert.ok(signalNodes.some((node) => node.pins.some((pin: any) => pin.connects?.length)))
assert.ok(nodes.some((node) => Math.abs(node.x ?? 0) > 100))
console.log(`Client vector series TS → IR → GIA checks passed: ${out}`)
