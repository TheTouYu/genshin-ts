import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { clientIrToGia } from '../../src/compiler/client_ir_to_gia.js'
import { createSignalRegistry } from '../../src/compiler/signal_registry.js'
import { buildClientGraphRegistriesIRDocuments, g } from '../../src/runtime/core.js'
import { resetClientGraphRegistriesForTest } from '../../src/runtime/client.js'
import { decode_gia_file } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'

const protoPath = new URL('../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto', import.meta.url).pathname
const registry = createSignalRegistry([
  { name: '信号_1', params: [{ name: '整数', type: 'int' }, { name: '浮点', type: 'float' }, { name: '位置', type: 'vec3' }, { name: '实体', type: 'entity' }, { name: '实体列表', type: 'entity_list' }], sendId: 1, monitorId: 2, serverId: 1610612740, clientEncoding: { parameterCompositePinIndices: [65, 66, 70, 71, 79], bindingCompositePinIndex: 63, nameCompositePinIndex: 64 } },
  { name: '信号_全部参数测试', params: [{ name: '整数', type: 'int' }, { name: '浮点', type: 'float' }, { name: '旋转', type: 'vec3' }, { name: 'GUID', type: 'guid' }, { name: '战斗中', type: 'bool' }, { name: '实体', type: 'entity' }, { name: 'Prefab', type: 'prefab_id' }, { name: '配置', type: 'config_id' }, { name: '文本', type: 'str' }], sendId: 3, monitorId: 4, serverId: 1610612743, clientEncoding: { parameterCompositePinIndices: [137, 138, 139, 140, 141, 142, 143, 144, 145], bindingCompositePinIndex: 135, nameCompositePinIndex: 136 } }
])

resetClientGraphRegistriesForTest()
g.client({ type: 'skill', id: 1082130451, name: 'client-query-series-v2' }).onStart((f) => {
  const self = f.getSelfEntity()
  const guid = f.queryGuidByEntity(self)
  const byGuid = f.findEntityByGuid(guid)
  const current = f.getCurrentCharacter()
  const owner = f.getOwnerPlayer(current)
  const character = f.getCharacterEntity(owner)
  const target = f.getTargetEntity()
  const attackTarget = f.getAttackTarget(self)
  const position = f.getEntityPosition(self)
  const rotation = f.getEntityRotation(self)
  const socketPosition = f.getTargetAttachmentPointLocation(self, 'Root')
  const socketRotation = f.getTargetAttachmentPointRotation(self, 'Root')
  const selfCombat = f.queryIfSelfIsInCombat()
  const targetCombat = f.queryIfEntityIsInCombat(self)
  const onField = f.queryIfEntityIsOnField(self)
  f.sendSignalToServerNodeGraphValues('信号_1', [1, 1.1, socketPosition, byGuid, f.assemblyList('entity', [attackTarget])])
  f.sendSignalToServerNodeGraphValues('信号_全部参数测试', [2, 2.2, socketRotation, guid, selfCombat, character, 1, 2, `${targetCombat}:${onField}:${target.nodeId}`])
})
const [ir] = buildClientGraphRegistriesIRDocuments()
const expected = ['get_self_entity', 'query_guid_by_entity', 'find_entity_by_guid', 'get_current_character', 'get_owner_player', 'get_character_entity', 'get_target_entity', 'get_attack_target', 'get_entity_position', 'get_entity_rotation', 'get_attachment_location', 'get_attachment_rotation', 'query_self_in_combat', 'query_entity_in_combat', 'query_entity_on_field', 'assembly_list', 'send_signal_to_server_node_graph', 'send_signal_to_server_node_graph']
assert.deepEqual(ir.nodes?.filter((node) => node.type !== 'client_graph_begins').map((node) => node.type), expected)
const out = '/tmp/gsts-client-query-series-v2.gia'
writeFileSync(out, clientIrToGia(ir, registry, protoPath))
const data = decode_gia_file(out, undefined, false) as any
const nodes = data.graph.graph.inner.graph.nodes as any[]
const ids = [200023, 200024, 200025, 200027, 200030, 200031, 200034, 200035, 200037, 200047, 200048, 200076, 200092, 200103]
for (const id of ids) assert.ok(nodes.some((node) => node.genericId?.nodeId === id), `missing node ${id}`)
const concrete: Record<number, number> = { 200023: 1001, 200024: 1002, 200025: 1003, 200027: 1005, 200030: 1008, 200031: 1009, 200034: 1014, 200035: 1015, 200037: 1017, 200047: 1022, 200048: 1023, 200076: 1032, 200092: 3003, 200103: 1038 }
for (const [generic, kernel] of Object.entries(concrete)) assert.equal(nodes.find((node) => node.genericId?.nodeId === Number(generic))?.concreteId?.nodeId, kernel)
assert.ok(nodes.some((node) => Math.abs(node.x ?? 0) > 100))
console.log(`Client query series v2 TS → IR → GIA checks passed: ${out}`)
