import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { clientIrToGia } from '../../src/compiler/client_ir_to_gia.js'
import { createSignalRegistry } from '../../src/compiler/signal_registry.js'
import { buildClientGraphRegistriesIRDocuments, g } from '../../src/runtime/core.js'
import { resetClientGraphRegistriesForTest } from '../../src/runtime/client.js'
import { decode_gia_file } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'

const protoPath = new URL('../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto', import.meta.url).pathname
const registry = createSignalRegistry([{
  name: '信号_全部列表参数测试',
  params: [
    { name: '配置列表', type: 'config_id_list' }, { name: 'Prefab列表', type: 'prefab_id_list' },
    { name: '实体列表', type: 'entity_list' }, { name: 'GUID列表', type: 'guid_list' },
    { name: '布尔列表', type: 'bool_list' }, { name: '向量列表', type: 'vec3_list' },
    { name: '字符串列表', type: 'str_list' }, { name: '浮点列表', type: 'float_list' },
    { name: '整数列表', type: 'int_list' }
  ],
  sendId: 1610612743, monitorId: 1610612744, serverId: 1610612746,
  clientEncoding: { parameterCompositePinIndices: [176, 177, 178, 179, 180, 181, 182, 183, 184], bindingCompositePinIndex: 174, nameCompositePinIndex: 175 }
}])

resetClientGraphRegistriesForTest()
g.client({ type: 'skill', id: 1082130464, name: 'client-query-series-v3-minimal' }).onStart((f) => {
  const self = f.getSelfEntity()
  const allPlayers = f.getAllPlayers()
  const status = f.getPresetStatus(self, 1)
  const faction = f.getEntityFaction(self)
  const tags = f.getEntityTags(self)
  const byTag = f.getEntitiesByTag(7)
  const aggroTarget = f.getAggroTarget(self)
  const aggroList = f.getAggroList(self)
  const hostile = f.isFactionHostile(faction, 2)
  const active = f.isEntityActive(self)
  const overlapping = f.getOverlappingEntities(self, 0)
  const list = (entityList: any, boolValues: any[], intValues: any[]) => [
    undefined, undefined, entityList, undefined, f.assemblyList('bool', boolValues), undefined, undefined, undefined,
    f.assemblyList('int', intValues)
  ]
  f.sendSignalToServerNodeGraphValues('信号_全部列表参数测试', list(allPlayers, [hostile, active], [status]))
  f.sendSignalToServerNodeGraphValues('信号_全部列表参数测试', list(byTag, [hostile, active], [status, 7]))
  f.sendSignalToServerNodeGraphValues('信号_全部列表参数测试', list(aggroList, [hostile, active], [status, 3000]))
  f.sendSignalToServerNodeGraphValues('信号_全部列表参数测试', list(overlapping, [hostile, active], [status, 1046]))
  void tags
  void aggroTarget
})

const [ir] = buildClientGraphRegistriesIRDocuments()
const nodeTypes = ir.nodes?.filter((node) => node.type !== 'client_graph_begins').map((node) => node.type) ?? []
assert.deepEqual(nodeTypes.slice(0, 11), [
  'get_self_entity', 'get_all_players', 'get_preset_status', 'get_entity_faction', 'get_entity_tags',
  'get_entities_by_tag', 'get_aggro_target', 'get_aggro_list', 'is_faction_hostile', 'is_entity_active',
  'get_overlapping_entities'
])
assert.equal(nodeTypes.filter((type) => type === 'assembly_list').length, 8)
assert.equal(nodeTypes.filter((type) => type === 'send_signal_to_server_node_graph').length, 4)
const out = 'Beyond_Local_Export/gsts-client-query-series-v3-minimal.gia'
writeFileSync(out, clientIrToGia(ir, registry, protoPath))
const data = decode_gia_file(out, undefined, false) as any
const nodes = data.graph.graph.inner.graph.nodes as any[]
const concrete: Record<number, number> = { 200026: 1004, 200028: 1006, 200029: 1007, 200077: 1035, 200078: 1034, 200090: 3000, 200091: 3001, 200093: 1037, 200103: 1038, 200107: 1046 }
for (const [generic, kernel] of Object.entries(concrete)) {
  const node = nodes.find((candidate) => candidate.genericId?.nodeId === Number(generic))
  assert.ok(node, `missing query node ${generic}`)
  assert.equal(node.concreteId?.nodeId, kernel)
}
assert.equal(nodes.filter((node) => node.genericId?.nodeId === 1610612746).length, 4)
assert.equal(nodes.filter((node) => node.genericId?.nodeId === 200049).length, 8)
assert.ok(nodes.some((node) => Math.abs(node.x ?? 0) > 100))
console.log(`Client query series v3 minimal list signal checks passed: ${out}`)
