import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

import { readRegisteredSignalsFromGil } from '../src/cli/gil_signals.js'
import { irToGia } from '../src/compiler/ir_to_gia_transform/index.js'
import { createSignalRegistry } from '../src/compiler/signal_registry.js'
import { g, buildServerGraphRegistriesIRDocuments } from '../src/runtime/core.js'
import { str } from '../src/runtime/value.js'
import { decode_gia_file } from '../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'

const GIL_PATH = '/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/110170759/Beyond_Local_Save_Level/1073741849.gil'
const OUTPUT_PATH = '/home/h/genshin-ts/Beyond_Local_Export/gsts-signal-min-send-monitor-v2.gia'
const PROTO_PATH = path.resolve(
  'src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto'
)
const GRAPH_ID = 1073741990

const registered = readRegisteredSignalsFromGil(GIL_PATH)
const signal = registered.find((entry) => entry.name === 'cube_turn')
if (!signal) throw new Error('cube_turn is not registered in the target GIL')
assert.deepEqual(signal.params.map((param) => param.type), ['str', 'str'])

const CubeTurn = {
  __gstsSignal: true,
  name: signal.name,
  params: signal.params.map((param) => [param.name, param.type] as const)
} as const

function onCubeTurn(evt: any, f: any): void {
  f.printString(evt.params.face)
  f.printString(evt.params.direction)
}

g.server({ name: 'GSTS_signal_min_send_monitor', id: GRAPH_ID })
  .on('whenEntityIsCreated', (_evt: any, f: any) => {
    f.sendSignal(CubeTurn as any, new str('U'), new str('cw'))
  })
  .onSignal(CubeTurn as any, onCubeTurn)

const docs = buildServerGraphRegistriesIRDocuments({
  defaultName: 'GSTS_signal_min_send_monitor'
})
assert.equal(docs.length, 1)
const bytes = irToGia(docs[0], {
  graphId: GRAPH_ID,
  name: 'GSTS_signal_min_send_monitor',
  protoPath: PROTO_PATH,
  signalRegistry: createSignalRegistry([signal])
})

if (fs.existsSync(OUTPUT_PATH)) {
  assert.deepEqual(
    new Uint8Array(fs.readFileSync(OUTPUT_PATH)),
    bytes,
    'existing output differs; refusing to overwrite it'
  )
} else {
  fs.writeFileSync(OUTPUT_PATH, bytes)
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
assert.match(decoded.filePath, /gsts_signal_min_send_monitor$/)
assert.equal(decoded.gameVersion, '6.6.0')

console.log(JSON.stringify({
  output: OUTPUT_PATH,
  bytes: bytes.length,
  signal: signal.name,
  params: signal.params,
  sendId: signal.sendId,
  monitorId: signal.monitorId,
  serverId: signal.serverId,
  graphId: GRAPH_ID,
  sendNode: { genericId: send.genericId?.nodeId, concreteId: send.concreteId?.nodeId },
  monitorNode: { genericId: monitor.genericId?.nodeId, concreteId: monitor.concreteId?.nodeId },
  formalGiaHeader: 'PASS',
  strictGiaReadback: 'PASS'
}, null, 2))
