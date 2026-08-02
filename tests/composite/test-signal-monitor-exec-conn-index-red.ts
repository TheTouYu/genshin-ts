// @ts-nocheck
/**
 * 监听参数消费 exec 连接的 InFlow index 红灯回归（生产 lowering 比对，2026-08-02）。
 *
 * 真实编辑器证据（连续轮次，独立 Validator 均 ACCEPT）：
 *   - 控制流连接挂在源 OutFlow pin：connects=[{id=目标, connect:{kind:InFlow},
 *     connect2:{kind:InFlow}}]，connect/connect2 的 index 字段在 wire 上**缺失**
 *     （raw 搜索 `08 07 12 02 08 01 1a 02 08 01` 命中、显式 index=0 模式零匹配；
 *     protobufjs 解码显示 0 仅为默认值）。实验：print-string-control-flow-01 /
 *     print-string-fork-01 / print-string-fork-order-swap-01 / print-string-chain-01。
 *   - OutFlow pin 的 i1/i2 同样无 index（SysCall 1 打印字符串与监听 SysGraph 均如此）。
 *
 * 本测试驱动 production lowering（irToGia）生成监听→打印字符串 exec 链，并断言
 * 生成的 exec 连接在 raw wire 上**不含** index 字段（真实规则：`12 02 08 01` 形态）。
 * 当前生产实现写 connect/connect2 = {kind:InFlow, index:0}（composite.ts
 * materializeLegacyImplGraphNode / vendor fork overlay），protobufjs encode 会写出
 * 显式 `10 00` → 本测试预期 RED。只有用户要求修复时才进入 production lowering
 * 修复，修复后本测试转绿。
 *
 * Run:
 *   npm run build
 *   npx tsx tests/composite/test-signal-monitor-exec-conn-index-red.ts
 */

import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
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
const OUTPUT_PATH = '/tmp/gsts-exec-conn-index.gia'
const GRAPH_ID = 1073742502

const registered = readRegisteredSignalsFromGil(FIXTURE).find(
  (entry) => entry.name === '信号测试全参数'
)
assert.ok(registered, 'fixture must contain 信号测试全参数')

const Signal = defineSignal(
  registered.name,
  registered.params.map((p) => [p.name, p.type] as const)
)
setRuntimeOptions({ optimize: { precompileExpression: false, removeUnusedNodes: false } })

g.server({ name: 'GSTS_exec_conn_index', id: GRAPH_ID })
  .on('whenEntityIsCreated', (_evt: any, f: any) => {
    f.printString(new str('probe'))
  })
  .onSignal(Signal, (evt: any, f: any) => {
    // 生产 schema 校验要求 IR 覆盖注册定义全部参数；
    // 断言目标：监听→打印字符串 exec 链的 connect/connect2 不得带 InFlow index。
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
  name: 'GSTS_exec_conn_index',
  protoPath: PROTO_PATH,
  stage3: { vendorImplGraphBeta: true }
})
await writeFile(OUTPUT_PATH, Buffer.from(bytes))

// 1) 解码确认 exec 连接确实生成（connect.kind === InFlow）
const decoded = await decode_gia_file(OUTPUT_PATH, PROTO_PATH)
const nodes = decoded.graph?.graph?.inner?.graph?.nodes ?? []
const listener = nodes.find(
  (n: any) => Number(n.genericId?.nodeId) === Number(registered.monitorId)
)
assert.ok(listener, 'production must emit the monitor listener node')
const outFlow = (listener.pins ?? []).find((p: any) => Number(p.i1?.kind) === 2)
assert.ok(outFlow, 'listener must carry an OutFlow pin (exec chain)')
const execConn = (outFlow.connects ?? []).find((c: any) => Number(c.connect?.kind) === 1)
assert.ok(execConn, 'OutFlow must carry an InFlow connection')
console.log(
  'production exec connection:',
  JSON.stringify({ id: Number(execConn.id), connect: execConn.connect, connect2: execConn.connect2 })
)

// 2) raw wire 断言：真实规则 = Index{InFlow} 无 index（2B 形态 `08 01`）。
//    NodeConnection.connect=field2 → tag 12；connect2=field3 → tag 1a。
//    无 index 形态: 12 02 08 01 / 1a 02 08 01
//    带 index=0 形态: 12 04 08 01 10 00 / 1a 04 08 01 10 00
const raw = Buffer.from(await readFile(OUTPUT_PATH))
const noIndex = Buffer.from([0x12, 0x02, 0x08, 0x01])
const withIndex0 = Buffer.from([0x12, 0x04, 0x08, 0x01, 0x10, 0x00])
const withIndex02 = Buffer.from([0x1a, 0x04, 0x08, 0x01, 0x10, 0x00])
// OutFlow pin 的 i1（NodePin field 1 tag 0a）：真实=2B 无 index，生产写显式 index=0
const i1OutNoIndex = Buffer.from([0x0a, 0x02, 0x08, 0x02])
const i1OutIndex0 = Buffer.from([0x0a, 0x04, 0x08, 0x02, 0x10, 0x00])
console.log('wire diagnostics:', {
  'no-index form (12 02 08 01)': raw.includes(noIndex),
  'connect index=0 form (12 04 ...)': raw.includes(withIndex0),
  'connect2 index=0 form (1a 04 ...)': raw.includes(withIndex02),
  'OutFlow i1 no-index (0a 02 08 02)': raw.includes(i1OutNoIndex),
  'OutFlow i1 index=0 (0a 04 08 02 10 00)': raw.includes(i1OutIndex0)
})
// 真实规则：exec 连接必须是 2B 无 index 形态且不得出现显式 index=0
assert.ok(
  raw.includes(noIndex),
  'RED EXPECTED: production emits no no-index InFlow exec connection (real editor uses 12 02 08 01)'
)
assert.ok(
  !raw.includes(withIndex0) && !raw.includes(withIndex02),
  'RED EXPECTED: production writes explicit InFlow index=0 (real editor omits index)'
)
// 真实规则：OutFlow pin i1 无 index（2B 形态），不得带显式 index=0
assert.ok(
  raw.includes(i1OutNoIndex),
  'RED EXPECTED: production emits no no-index OutFlow pin i1 (real editor uses 0a 02 08 02)'
)
assert.ok(
  !raw.includes(i1OutIndex0),
  'RED EXPECTED: production writes explicit OutFlow i1 index=0 (real editor omits index)'
)
console.log('GREEN: production exec connections now omit the InFlow index (matches real editor)')
