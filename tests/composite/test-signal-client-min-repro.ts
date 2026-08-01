// @ts-nocheck
/**
 * 客户端 sendSignalToServerNodeGraph GIA 编码最小同构复现。
 *
 * 对照真实编辑器样本（Beyond_Local_Export/user_edit/客户端/信号.gia，6.7.0）：
 * - 节点 genericId {class=10001, type=20002, kind=22001, nodeId=注册serverId}
 * - concreteId {class=10001, type=20002, kind=22000, nodeId=2000}
 * - signalVersion=1（客户端为 1；服务器 send/monitor 为 2）
 * - pins：InParam 参数在前，ClientExec 信号名最后；信号名 pin clientExecNode.kind=6
 * - accessory 含完整三元组（发送信号/监听信号/向服务器节点图发送信号）
 * - 图级 relatedIds 只含 serverId（[1610612743]）
 *
 * Run:
 *   npm run build
 *   npx tsx tests/composite/test-signal-client-min-repro.ts [outputDir]
 */

import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { irToGia } from '../../dist/src/compiler/ir_to_gia_transform/index.js'
import { createSignalRegistry } from '../../dist/src/compiler/signal_registry.js'
import {
  buildClientGraphRegistriesIRDocuments,
  defineSignal,
  g
} from '../../dist/src/runtime/core.js'
import { setRuntimeOptions } from '../../dist/src/runtime/runtime_config.js'
import { str } from '../../dist/src/runtime/value.js'
import { decode_gia_file } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'

const PROTO_PATH = fileURLToPath(
  new URL(
    '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto',
    import.meta.url
  )
)

const OUTPUT_DIR = process.argv[2] ?? '/home/h/genshin-ts/Beyond_Local_Export'
const CLIENT_GRAPH_ID = 1082130450

// 与 star-cube-nexus 游戏地图已注册的 cube_turn 定义一致
const CubeTurnSignal = defineSignal('cube_turn', [
  ['face', 'str'],
  ['direction', 'str']
])
const CUBE_TURN_REG = {
  name: 'cube_turn',
  params: [
    { name: 'face', type: 'str' },
    { name: 'direction', type: 'str' }
  ],
  sendId: 1610612741,
  monitorId: 1610612742,
  serverId: 1610612743
}

setRuntimeOptions({ optimize: { precompileExpression: false, removeUnusedNodes: false } })

// ---- 客户端图：start → 向服务器节点图发送信号 ----
g.creationSkill({ id: CLIENT_GRAPH_ID, name: 'GSTS_signal_min_client', mode: 'beyond' }).on(
  'start',
  (_evt: any, _f: any) => {
    ;(globalThis as any).gsts.fCreationSkill.sendSignalToServerNodeGraph(
      CubeTurnSignal,
      new str('R'),
      new str('ccw')
    )
  }
)

const registry = createSignalRegistry([CUBE_TURN_REG])

async function main(): Promise<void> {
  const docs = buildClientGraphRegistriesIRDocuments()
  const doc = docs.find((d: any) => d.graph.id === CLIENT_GRAPH_ID)
  assert.ok(doc, 'client graph IR document missing')

  const bytes = irToGia(doc, {
    graphId: CLIENT_GRAPH_ID,
    signalRegistry: registry,
    name: 'GSTS_signal_min_client',
    protoPath: PROTO_PATH
  })
  const path = join(OUTPUT_DIR, '信号min-客户端-send-server.gia')
  await writeFile(path, Buffer.from(bytes))
  console.log('client:', path)

  const decoded: any = await decode_gia_file(path, PROTO_PATH)
  const nodes = decoded.graph?.graph?.inner?.graph?.nodes ?? []
  const send = nodes.find((n: any) => n.genericId?.nodeId === CUBE_TURN_REG.serverId)
  assert.ok(send, 'send_signal_to_server_node_graph node missing')

  // 1) 节点身份：注册 serverId + SysGraph kind
  assert.equal(send.genericId.class, 10001, 'genericId.class')
  assert.equal(send.genericId.type, 20002, 'genericId.type')
  assert.equal(send.genericId.kind, 22001, 'genericId.kind (SysGraph)')
  assert.equal(
    send.genericId.nodeId,
    CUBE_TURN_REG.serverId,
    'genericId.nodeId = registered serverId'
  )
  assert.equal(send.concreteId.class, 10001, 'concreteId.class')
  assert.equal(send.concreteId.type, 20002, 'concreteId.type')
  assert.equal(send.concreteId.kind, 22000, 'concreteId.kind (SysCall)')
  assert.equal(send.concreteId.nodeId, 2000, 'concreteId.nodeId = 2000')

  // 2) signalVersion=1（客户端样本；服务器 send/monitor 为 2）
  assert.equal(send.signalVersion, 1, 'client signalVersion=1')

  // 3) pins：InParam 在前，ClientExec 信号名最后
  const dataPins = send.pins.filter((p: any) => p.i1?.kind === 3)
  assert.equal(dataPins.length, 2, `2 data pins, got ${dataPins.length}`)
  const execPins = send.pins.filter((p: any) => p.i1?.kind === 5)
  assert.ok(execPins.length >= 1, 'client exec pins present')
  const lastKind = send.pins[send.pins.length - 1].i1?.kind
  assert.equal(lastKind, 5, 'ClientExec signal-name pin last')
  const namePin = send.pins[send.pins.length - 1]
  assert.equal(namePin.value?.bString?.val, 'cube_turn', 'signal name on last ClientExec pin')
  assert.equal(namePin.clientExecNode?.kind, 6, 'signal-name pin clientExecNode.kind=6')
  // 首个 exec pin（int 流）保留 metadata clientExecNode（kind=5 + nodeId 200124）
  const firstExec = execPins.find((p: any) => p.type === 3)
  assert.ok(firstExec, 'exec int pin present')
  assert.equal(firstExec.clientExecNode?.kind, 5, 'exec int pin clientExecNode.kind=5')
  assert.equal(firstExec.clientExecNode?.nodeId?.id, 200124, 'exec int pin nodeId=200124')

  // 4) accessory：完整三元组（发送/监听/向服务器节点图发送信号）
  const accessories = decoded.accessories ?? []
  const byId = new Map(accessories.map((a: any) => [a.id?.id, a]))
  assert.ok(byId.has(1610612741), '发送信号 accessory')
  assert.ok(byId.has(1610612742), '监听信号 accessory')
  assert.ok(byId.has(1610612743), '向服务器节点图发送信号 accessory')
  assert.equal(byId.get(1610612741)?.which, 14, '发送信号 which=14')
  assert.equal(byId.get(1610612742)?.which, 12, '监听信号 which=12')
  assert.equal(byId.get(1610612743)?.which, 14, '向服务器 which=14')
  assert.equal(
    byId.get(1610612743)?.compositeDef?.inner?.def?.id?.genericId?.type,
    20002,
    'server accessory genericId.type=20002'
  )

  // 5) 图级 relatedIds 只含 serverId
  const related = (decoded.graph?.relatedIds ?? []).map((r: any) => r.id)
  assert.ok(related.includes(1610612743), 'graph relatedIds includes serverId')
  assert.ok(!related.includes(1610612741), 'graph relatedIds excludes sendId')
  assert.ok(!related.includes(1610612742), 'graph relatedIds excludes monitorId')

  console.log(
    'client OK: node',
    send.genericId.nodeId,
    'signalVersion',
    send.signalVersion,
    'pins',
    send.pins.map((p: any) => `k${p.i1?.kind}@${p.i1?.index}`).join(',')
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
