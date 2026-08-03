// 临时工具：从 1850.gil 提取 test_cube_turn 注册数据，用生产 irToGia 生成正式 GIA（发送+监听+打印）
// 输出到 Beyond_Local_Export/ 根目录（编辑器扫描导入目录）
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

import { readRegisteredSignalsFromGil } from '../../../../src/cli/gil_signals.js'
import { irToGia } from '../../../../src/compiler/ir_to_gia_transform/index.js'
import { createSignalRegistry } from '../../../../src/compiler/signal_registry.js'
import { g, buildServerGraphRegistriesIRDocuments } from '../../../../src/runtime/core.js'
import { str } from '../../../../src/runtime/value.js'
import { decode_gia_file } from '../../../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'

const GIL_PATH =
  '/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/110170759/Beyond_Local_Save_Level/1073741850.gil'
const OUTPUT_PATH =
  '/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/gsts-signal-demo-test.gia'
const PROTO_PATH = path.resolve(
  'src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto'
)
const GRAPH_ID = 1073741826
const GRAPH_NAME = 'GSTS_signal_demo_gia'

const registered = readRegisteredSignalsFromGil(GIL_PATH)
const signal = registered.find((entry) => entry.name === 'test_cube_turn')
if (!signal) throw new Error('test_cube_turn is not registered in the target GIL')
assert.deepEqual(signal.params.map((param) => param.type), ['str', 'str'])

const CubeTurn = {
  __gstsSignal: true,
  name: signal.name,
  params: signal.params.map((param) => [param.name, param.type] as const)
} as const

g.server({ name: GRAPH_NAME, id: GRAPH_ID })
  .on('whenEntityIsCreated', (_evt: any, f: any) => {
    f.sendSignal(CubeTurn as any, new str('上'), new str('前'))
  })
  .onSignal(CubeTurn as any, (evt: any, f: any) => {
    f.printString(evt.params.face)
    f.printString(evt.params.direction)
  })

const docs = buildServerGraphRegistriesIRDocuments({
  defaultName: GRAPH_NAME
})
assert.equal(docs.length, 1)
const bytes = irToGia(docs[0], {
  graphId: GRAPH_ID,
  name: GRAPH_NAME,
  protoPath: PROTO_PATH,
  signalRegistry: createSignalRegistry([signal])
})

if (fs.existsSync(OUTPUT_PATH)) {
  const existing = new Uint8Array(fs.readFileSync(OUTPUT_PATH))
  assert.deepEqual(existing, bytes, 'existing output differs; refusing to overwrite it')
  console.log(`exists-identical=${OUTPUT_PATH}`)
} else {
  fs.writeFileSync(OUTPUT_PATH, bytes)
  console.log(`written=${OUTPUT_PATH}`)
}

const decoded: any = await decode_gia_file(OUTPUT_PATH, PROTO_PATH)
const rootGraph = decoded.graph?.graph?.inner?.graph
const nodes = rootGraph?.nodes ?? []
const named = (node: any) =>
  node.pins?.find((pin: any) => pin.i1?.kind === 5)?.value?.bString?.val
const send = nodes.find((node: any) => named(node) === signal.name && node.genericId?.nodeId === signal.sendId)
const monitor = nodes.find(
  (node: any) => named(node) === signal.name && node.genericId?.nodeId === signal.monitorId
)

assert.ok(send, 'send signal node was not generated')
assert.ok(monitor, 'monitor signal node was not generated')
assert.equal(decoded.graph?.id?.id, GRAPH_ID)
assert.match(decoded.filePath, /gsts_signal_demo_gia$/)
assert.equal(decoded.gameVersion, '6.7.0')

console.log(
  JSON.stringify({
    output: OUTPUT_PATH,
    bytes: bytes.length,
    signal: signal.name,
    params: signal.params.map((p) => `${p.name}:${p.type}`),
    sendId: signal.sendId,
    monitorId: signal.monitorId,
    serverId: signal.serverId,
    graphId: GRAPH_ID,
    nodes: nodes.length,
    filePath: decoded.filePath,
    gameVersion: decoded.gameVersion
  })
)
