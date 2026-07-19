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
g.client({ type: 'skill', id: 1082130450, name: 'client-query-series' }).onStart((f) => {
  const self = f.getSelfEntity()
  const guid = f.queryGuidByEntity(self)
  const position = f.getEntityPosition(self)
  const rotation = f.getEntityRotation(self)
  const currentCharacter = f.getCurrentCharacter()
  const inCombat = f.queryIfSelfIsInCombat()
  const ownerPlayer = f.getOwnerPlayer(currentCharacter)

  f.sendSignalToServerNodeGraphValues('信号_1', [
    5,
    1.5,
    position,
    self,
    f.assemblyList('entity', [currentCharacter])
  ])
  f.sendSignalToServerNodeGraphValues('信号_全部参数测试', [
    6,
    2.5,
    rotation,
    guid,
    inCombat,
    ownerPlayer,
    2345,
    3453544,
    'client-query-series'
  ])
})

const [ir] = buildClientGraphRegistriesIRDocuments()
assert.deepEqual(ir.nodes?.filter((node) => node.type !== 'client_graph_begins').map((node) => node.type), [
  'get_self_entity',
  'query_guid_by_entity',
  'get_entity_position',
  'get_entity_rotation',
  'get_current_character',
  'query_self_in_combat',
  'get_owner_player',
  'assembly_list',
  'send_signal_to_server_node_graph',
  'send_signal_to_server_node_graph'
])

const out = '/tmp/gsts-client-query-series.gia'
writeFileSync(out, clientIrToGia(ir, registry, protoPath))
const data = decode_gia_file(out, undefined, false) as any
const nodes = data.graph.graph.inner.graph.nodes as any[]
const byGeneric = (id: number) => nodes.find((node) => node.genericId?.nodeId === id)
const position = byGeneric(200030)
const rotation = byGeneric(200031)
const currentCharacter = byGeneric(200076)
const inCombat = byGeneric(200037)
const ownerPlayer = byGeneric(200025)
assert.equal(position?.concreteId?.nodeId, 1008)
assert.equal(rotation?.concreteId?.nodeId, 1009)
assert.equal(currentCharacter?.concreteId?.nodeId, 1032)
assert.equal(inCombat?.concreteId?.nodeId, 1017)
assert.equal(ownerPlayer?.concreteId?.nodeId, 1003)
assert.deepEqual(position?.pins.find((pin: any) => pin.i1?.kind === 3)?.connects?.[0]?.id, byGeneric(200033)?.nodeIndex)
assert.deepEqual(rotation?.pins.find((pin: any) => pin.i1?.kind === 3)?.connects?.[0]?.id, byGeneric(200033)?.nodeIndex)
assert.deepEqual(ownerPlayer?.pins.find((pin: any) => pin.i1?.kind === 3)?.connects?.[0]?.id, currentCharacter?.nodeIndex)
assert.ok(nodes.some((node) => Math.abs(node.x ?? 0) > 100))
console.log(`Client query series TS → IR → GIA checks passed: ${out}`)
