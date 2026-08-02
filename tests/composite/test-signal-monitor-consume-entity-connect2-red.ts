// @ts-nocheck
/**
 * 监听 entity 参数经 180 族（类型转换 Entity→Str）消费的 connect2 红灯回归（工作包步骤 9）。
 *
 * 真实编辑器证据（2026-08-02 判别轮，独立 Validator ACCEPT）：
 *   entity 源 OutParam[9] 的 connect2=4，跨家族成立（18 族 2657 与 180 族 183 均=4）。
 *   before: tests/fixtures/signals/monitor-consume-donor.gil（15 节点）
 *   after : 真实地图 9184cd6d...（16 节点，唯一新增 nodeIndex 2 = 180/183）
 *   证据目录: genshin-ts-evidence/.../experiments/entity-dtc-connect2-discriminator-01/
 *
 * 本测试驱动 production lowering（irToGia）生成同一消费路径的 GIA，并断言
 * 该连接的 connect2=4（真实规则）。当前生产实现写 connect2=connect=源 index，
 * 因此本测试预期 RED——这是"旧 production 实现红灯"的聚焦证据；只有用户要求
 * 修复时才进入 production lowering 修复，修复后本测试转绿。
 *
 * Run:
 *   npm run build
 *   npx tsx tests/composite/test-signal-monitor-consume-entity-connect2-red.ts
 */

import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { irToGia } from '../../dist/src/compiler/ir_to_gia_transform/index.js'
import { createSignalRegistry } from '../../dist/src/compiler/signal_registry.js'
import { readRegisteredSignalsFromGil } from '../../src/cli/gil_signals.ts'
import { buildServerGraphRegistriesIRDocuments, defineSignal, g } from '../../dist/src/runtime/core.js'
import { setRuntimeOptions } from '../../dist/src/runtime/runtime_config.js'
import { str, vec3 } from '../../dist/src/runtime/value.js'
import { decode_gia_file } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'

const PROTO_PATH = new URL(
  '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto',
  import.meta.url
).pathname
const here = path.dirname(fileURLToPath(import.meta.url))
const FIXTURE = path.join(here, '../fixtures/signals/monitor-consume-donor.gil')
const OUTPUT_PATH = '/tmp/gsts-entity-consume-connect2.gia'
const GRAPH_ID = 1073742501

// 从夹具读取真实注册定义（与当前锁定地图 1073741849 一致）
const registered = readRegisteredSignalsFromGil(FIXTURE).find(
  (entry) => entry.name === '信号测试全参数'
)
assert.ok(registered, 'fixture must contain 信号测试全参数')

const Signal = defineSignal(
  registered.name,
  registered.params.map((p) => [p.name, p.type] as const)
)
setRuntimeOptions({ optimize: { precompileExpression: false, removeUnusedNodes: false } })

g.server({ name: 'GSTS_entity_consume_connect2', id: GRAPH_ID })
  .on('whenEntityIsCreated', (_evt: any, f: any) => {
    f.printString(new str('probe'))
  })
  .onSignal(Signal, (evt: any, f: any) => {
    // 全参数消费（生产 schema 校验要求 IR 覆盖注册定义全部参数）；
    // 断言目标：entity 参数 → 类型转换(Entity→Str, 180/183) 的连接 connect2。
    const p = evt.params
    f.printString(f.dataTypeConversion(p.伤害值, 'str'))
    f.printString(f.dataTypeConversion(p.移动速度, 'str'))
    f.printString(f.dataTypeConversion(p.目标位置, 'str'))
    f.printString(p.文本)
    f.printString(f.dataTypeConversion(p.是否暴击, 'str'))
    f.printString(f.dataTypeConversion(p.目标GUID, 'str'))
    f.printString(f.dataTypeConversion(p.目标实体, 'str'))
    f.createPrefab(
      p.预制体,
      new vec3([0, 0, 0]),
      new vec3([0, 0, 0]),
      f.getSelfEntity(),
      true,
      0n,
      f.assemblyList([2n], 'int')
    )
    f.printString(f.dataTypeConversion(f.getListLength(f.assemblyList([p.配置ID], 'config_id')), 'str'))
  })

const docs = buildServerGraphRegistriesIRDocuments(g)
const registry = createSignalRegistry([registered])
const bytes = irToGia(docs[0], {
  graphId: GRAPH_ID,
  signalRegistry: registry,
  name: 'GSTS_entity_consume_connect2',
  protoPath: PROTO_PATH,
  stage3: { vendorImplGraphBeta: true }
})
await writeFile(OUTPUT_PATH, Buffer.from(bytes))

const decoded = await decode_gia_file(OUTPUT_PATH, PROTO_PATH)
const nodes = decoded.graph?.graph?.inner?.graph?.nodes ?? []
const dtc = nodes.find(
  (n: any) =>
    Number(n.genericId?.nodeId) === 180 && Number(n.concreteId?.nodeId) === 183
)
assert.ok(dtc, 'production must emit the 180/183 Entity→Str conversion node')
const pin = dtc.pins?.find((p: any) => Number(p.i1?.kind) === 3)
assert.ok(pin, 'DTC node must have an InParam pin')
const conn = pin.connects?.[0]
assert.ok(conn, 'DTC InParam must carry the monitor consumption connection')
console.log(
  'production connection:',
  JSON.stringify({ id: Number(conn.id), connect: conn.connect, connect2: conn.connect2 })
)
assert.equal(Number(conn.connect?.kind), 4, 'connect kind must be OutParam')
assert.equal(Number(conn.connect?.index), 9, 'connect index must be OutParam[9] (目标实体)')
assert.equal(Number(conn.connect2?.kind), 4, 'connect2 kind must be OutParam')
// 真实规则：entity 源 → connect2=4（跨家族）。当前生产写 connect2=connect=9 → 本行 RED。
assert.equal(
  Number(conn.connect2?.index),
  4,
  'RED EXPECTED: production writes connect2=connect(9), real editor writes connect2=4'
)
console.log('GREEN: production connect2 now matches the real-editor rule (connect2=4)')
