// 临时工具：复合节点内部信号发送 + 主图监听消费 端到端业务 GIA
// 从 1850.gil 读取 test_mixed 注册数据，用生产 irToGia 生成正式 GIA
// 输出到 Beyond_Local_Export/ 根目录（编辑器扫描导入目录）
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

import { readRegisteredSignalsFromGil } from '../../../../src/cli/gil_signals.js'
import { irToGia } from '../../../../src/compiler/ir_to_gia_transform/index.js'
import { createSignalRegistry } from '../../../../src/compiler/signal_registry.js'
import { g, buildServerGraphRegistriesIRDocuments, defineSignal } from '../../../../src/runtime/core.js'
import { setRuntimeOptions } from '../../../../src/runtime/runtime_config.js'
import { int, float, vec3, str } from '../../../../src/runtime/value.js'
import { decode_gia_file } from '../../../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'

const GIL_PATH =
  '/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/110170759/Beyond_Local_Save_Level/1073741850.gil'
const OUTPUT_PATHS = [
  path.resolve('Beyond_Local_Export/gsts-signal-composite-demo.gia'),
  '/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/gsts-signal-composite-demo.gia'
]
const PROTO_PATH = path.resolve(
  'src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto'
)
const GRAPH_ID = 1073741826
const GRAPH_NAME = 'GSTS_SignalCompositeDemo'

setRuntimeOptions({ optimize: { precompileExpression: false, removeUnusedNodes: false } })

// Deterministic output: vendor node_body() adds Math.random()*10 coordinate jitter
// (see docs/game-engine-knowledge/gia-generation-chain.md). Seed it so regeneration
// is byte-identical and the exists-guard stays meaningful.
let seed = 0x5eed
const origRandom = Math.random
Math.random = () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff
  return seed / 0x7fffffff
}
try {
  main()
} finally {
  Math.random = origRandom
}

async function main() {

const registered = readRegisteredSignalsFromGil(GIL_PATH)
const signal = registered.find((entry) => entry.name === 'test_mixed')
if (!signal) throw new Error('test_mixed is not registered in the target GIL')
assert.deepEqual(
  signal.params.map((p) => p.type),
  ['int', 'float', 'vec3', 'entity', 'entity_list']
)

const Mixed = defineSignal(
  signal.name,
  signal.params.map((p) => [p.name, p.type] as const)
)

// --- 复合节点：build() 内部 f.sendSignal（entity 参数走复合输入 capture）---
const signalComposite = g.defineComposite('GSTS_SignalCompositeDemo', {
  inflows: [{ name: '执行' }],
  outflows: ['完成'],
  inputs: { target: { type: 'entity' } },
  outputs: {},
  build(inputs: any, f: any) {
    f.sendSignal(
      Mixed as any,
      new int(777n),
      new float(2.5),
      new vec3([4, 5, 6]),
      inputs.target
    )
    const done = f.registerExecNode('print_string', [new str('gsts-signal-composite-impl-ok')])
    f.outflow('完成', done, 0)
    return {}
  }
})

// --- 主图：root 直接发送（对照）+ 调用复合 + 监听消费 ---
g.server({ name: GRAPH_NAME, id: GRAPH_ID })
  .on('whenEntityIsCreated', (_evt: any, f: any) => {
    const self = f.getSelfEntity()
    // root 普通图发送（对照）：5 参数全量
    f.sendSignal(
      Mixed as any,
      new int(123n),
      new float(1.5),
      new vec3([1, 2, 3]),
      self,
      f.assemblyList([self], 'entity')
    )
    // 复合节点内部发送（entity capture 路由）
    f.callComposite(signalComposite, { target: self })
    f.printString(new str('gsts-signal-composite-root-ok'))
  })
  .onSignal(Mixed as any, (evt: any, f: any) => {
    const p = evt.params
    f.printString(f.dataTypeConversion(p.参数_1, 'str'))
    f.printString(f.dataTypeConversion(p.参数_2, 'str'))
    f.createPrefab(
      9n,
      p.参数_3,
      p.参数_3,
      p.参数_4,
      false,
      0n,
      f.assemblyList([1n], 'int')
    )
    f.printString(f.dataTypeConversion(f.getListLength(p.参数_5), 'str'))
  })

const docs = buildServerGraphRegistriesIRDocuments({ defaultName: GRAPH_NAME })
const bytes = irToGia(docs.at(-1)!, {
  graphId: GRAPH_ID,
  name: GRAPH_NAME,
  protoPath: PROTO_PATH,
  signalRegistry: createSignalRegistry([signal])
})

// --- decode 回读断言（结构，非逐字节）---
const tmp = '/tmp/gsts-signal-composite-demo.gia'
fs.writeFileSync(tmp, bytes)
const decoded = await decode_gia_file(tmp, PROTO_PATH)
const rootGraph = decoded.graph?.graph?.inner?.graph
assert.ok(rootGraph, 'root graph missing')
assert.equal(Number((decoded.graph?.graph?.inner?.graph?.id?.id ?? 0).toString?.() ?? 0), GRAPH_ID)
assert.equal(Number((rootGraph.nodes ?? []).length) > 0, true, 'root nodes exist')

for (const output of OUTPUT_PATHS) {
  if (fs.existsSync(output)) {
    // Vendor jitter (coordinates) + filePath timestamp make byte-level identity
    // unreachable (gia-generation-chain.md). Compare core structure instead.
    const existing = new Uint8Array(fs.readFileSync(output))
    const existingDecoded = await decode_gia_file(output, PROTO_PATH)
    const exRoot = existingDecoded.graph?.graph?.inner?.graph
    const exSends = (exRoot?.nodes ?? []).filter(
      (n: any) => (n.genericId?.nodeId ?? n.concreteId?.nodeId) === signal.sendId
    ).length
    const exMonitors = (exRoot?.nodes ?? []).filter(
      (n: any) => (n.genericId?.nodeId ?? n.concreteId?.nodeId) === signal.monitorId
    ).length
    const exNodes = exRoot?.nodes?.length ?? 0
    const matches =
      exNodes === (decoded.graph?.graph?.inner?.graph?.nodes?.length ?? 0) &&
      exSends === 1 &&
      exMonitors === 1
    if (!matches) {
      throw new Error(`existing output structure differs; refusing to overwrite: ${output}`)
    }
    console.log(`exists-struct-identical=${output} bytes=${existing.length}`)
  } else {
    fs.writeFileSync(output, bytes)
    console.log(`written=${output} bytes=${bytes.length}`)
  }
}



function signalNameOf(n: any): string | undefined {
  const pin = (n.pins ?? []).find((p: any) => p.i1?.kind === 5)
  const v = pin?.value
  return typeof v === 'string' ? v : v?.bString?.val
}

const rootSends = (rootGraph.nodes ?? []).filter(
  (n: any) => (n.genericId?.nodeId ?? n.concreteId?.nodeId) === signal.sendId
)
const rootMonitors = (rootGraph.nodes ?? []).filter(
  (n: any) => (n.genericId?.nodeId ?? n.concreteId?.nodeId) === signal.monitorId
)
assert.equal(rootSends.length, 1, 'root should have exactly 1 send')
assert.equal(rootMonitors.length, 1, 'root should have exactly 1 monitor')
assert.equal(rootSends[0].signalVersion, signal.encoding?.signalVersion ?? 2, 'root signalVersion')
assert.equal(signalNameOf(rootSends[0]), signal.name, 'root send name')

// 复合 impl 图
const accessories = decoded.accessories ?? []
const implAccessory = accessories.find(
  (a: any) =>
    a.which === 9 &&
    (a.graph?.inner?.graph?.nodes ?? []).some(
      (n: any) => (n.genericId?.nodeId ?? n.concreteId?.nodeId) === signal.sendId
    )
)
assert.ok(implAccessory, 'impl graph accessory missing')
const implGraph = implAccessory.graph?.inner?.graph
const implSend = (implGraph?.nodes ?? []).find(
  (n: any) => (n.genericId?.nodeId ?? n.concreteId?.nodeId) === signal.sendId
)
assert.ok(implSend, 'impl send node missing')
assert.equal(implSend.genericId?.kind, 22001, 'impl send must be SysGraph')
assert.equal(implSend.signalVersion, signal.encoding?.signalVersion ?? 2, 'impl signalVersion')
assert.equal(signalNameOf(implSend), signal.name, 'impl send name')
const implData = (implSend.pins ?? [])
  .filter((p: any) => p.i1?.kind === 3)
  .sort((a: any, b: any) => a.i1.index - b.i1.index)
assert.equal(implData.length, 4, `impl send should expose 4 physical data pins, got ${implData.length}`)
const entityPin = implData.find((p: any) => p.i1.index === 3)
assert.ok(entityPin, 'impl entity capture physical pin missing')
assert.equal(entityPin.type, 1, 'impl entity physical type Entity')

// compositePins 路由：复合 entity 输入 → impl send entity 物理 pin
const compositePins = implGraph?.compositePins ?? []
const captureRoute = compositePins.find(
  (cp: any) =>
    cp.outerPin?.kind === 3 &&
    cp.innerPin?.kind === 3 &&
    cp.innerPin?.index === 3 &&
    cp.innerNodeId === implSend.nodeIndex
)
assert.ok(captureRoute, 'compositePins must route entity input to impl send pin 3')

// 主图监听：不落盘 OutParam；消费连接引用 OutParam[3..6]
const mon = rootMonitors[0]
const monOuts = (mon.pins ?? []).filter((p: any) => p.i1?.kind === 4)
assert.equal(monOuts.length, 0, 'monitor must not persist param OutParams (real editor rule)')
const consumedIndexes = new Set<number>()
let entityConnect2: number | undefined
for (const n of rootGraph.nodes ?? []) {
  for (const p of n.pins ?? []) {
    for (const c of p.connects ?? []) {
      if (c.id === mon.nodeIndex && c.connect?.kind === 4) {
        consumedIndexes.add(c.connect.index)
        if (c.connect.index === 6) entityConnect2 = c.connect2?.index
      }
    }
  }
}
assert.deepEqual(
  [...consumedIndexes].sort((a, b) => a - b),
  [3, 4, 5, 6, 7],
  `consumers must reference OutParam[3..7], got ${[...consumedIndexes].sort()}`
)
// connect2 empirical rule keys on source OutParam index: 6->3, 9->4 (signals.md).
// test_mixed entity sits at OutParam[6], so connect2 must be 3.
assert.equal(entityConnect2, 3, 'entity OutParam[6] consumer connect2 must be 3 (index-6 rule)')

console.log(
  [
    'signal-composite-demo generated',
    `signal=${signal.name} sendId=${signal.sendId} monitorId=${signal.monitorId}`,
    `rootSendPins=${(rootSends[0].pins ?? []).filter((p: any) => p.i1?.kind === 3).length}`,
    `implSendPins=${implData.length} (entity capture physical pin @3 kept)`,
    `monitorOuts=0 consumers=${[...consumedIndexes].sort().join(',')} entityConnect2=${entityConnect2}`,
    `bytes=${bytes.length}`
  ].join('\n')
)
}
