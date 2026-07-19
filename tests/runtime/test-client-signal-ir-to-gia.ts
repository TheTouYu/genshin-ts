import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'

import { clientIrToGia } from '../../src/compiler/client_ir_to_gia.js'
import { createSignalRegistry } from '../../src/compiler/signal_registry.js'
import { buildClientGraphRegistriesIRDocuments, g } from '../../src/runtime/core.js'
import { resetClientGraphRegistriesForTest } from '../../src/runtime/client.js'
import { decode_gia_file } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'

const protoPath = new URL(
  '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto',
  import.meta.url
).pathname
const outPath = '/tmp/gsts-client-signal-from-ts.gia'

resetClientGraphRegistriesForTest()
g.client({ type: 'skill', id: 1082130433, name: 'gsts-client-signal-from-ts' }).onStart((f) => {
  f.sendSignalToServerNodeGraph('信号_全部参数测试', 1, 2.2, [1, 2, 3.4], 3, true, 0, 2345, 3453544, '字符串')
})
const [ir] = buildClientGraphRegistriesIRDocuments()
const registry = createSignalRegistry([{
  name: '信号_全部参数测试',
  params: [
    { name: '参数_1', type: 'int' },
    { name: '参数_2', type: 'float' },
    { name: '参数_3', type: 'vec3' },
    { name: '参数_4', type: 'guid' },
    { name: '参数_5', type: 'bool' },
    { name: '参数_6', type: 'entity' },
    { name: '参数_7', type: 'prefab_id' },
    { name: '参数_8', type: 'config_id' },
    { name: '参数_9', type: 'str' }
  ],
  sendId: 1610612743,
  monitorId: 1610612742,
  serverId: 1610612743,
  clientEncoding: {
    parameterCompositePinIndices: [137, 138, 139, 140, 141, 142, 143, 144, 145],
    bindingCompositePinIndex: 135,
    nameCompositePinIndex: 136
  }
}])
const bytes = clientIrToGia(ir, registry, protoPath)
writeFileSync(outPath, bytes)
const generated = decode_gia_file(outPath, undefined, false) as any
const nodes = generated.graph.graph.inner.graph.nodes as any[]
assert.equal(generated.graph.which, 11)
assert.deepEqual(generated.accessories, [])
assert.equal(nodes.length, 2)
assert.equal(nodes[1].genericId.nodeId, 1610612743)
assert.equal(nodes[1].concreteId.nodeId, 2000)
assert.deepEqual(nodes[1].pins.filter((p: any) => p.i1?.kind === 3).map((p: any) => p.compositePinIndex), [137, 138, 139, 140, 141, 142, 143, 144, 145])
assert.equal(nodes[1].pins.find((p: any) => p.clientExecNode?.kind === 6)?.value.bString.val, '信号_全部参数测试')
console.log(`Client TS → IR → GIA scalar signal checks passed: ${outPath}`)
