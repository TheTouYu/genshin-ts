// @ts-nocheck
/**
 * 信号链路最小同构复现（star-cube-nexus cube_turn 失败场景，2026-07-31 反馈）。
 *
 * 两个 GIA：
 * - 主图版：whenEntityIsCreated → sendSignal(cube_turn, 'U', 'cw')；onSignal(cube_turn) 消费
 * - 复合版：whenEntityIsCreated → callComposite(impl 内 sendSignal)；onSignal(cube_turn) 消费
 *
 * 信号 cube_turn 使用游戏地图（1073741849）中已注册的 ID：
 *   sendId=1610612741, monitorId=1610612742, serverId=1610612743
 * （与 star-cube-nexus 注入成功的 tab-input.gia / param-turn.gia 一致）
 *
 * Run:
 *   npm run build
 *   npx tsx tests/composite/test-signal-min-repro.ts [outputDir]
 */

import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { irToGia } from '../../dist/src/compiler/ir_to_gia_transform/index.js'
import { createSignalRegistry } from '../../dist/src/compiler/signal_registry.js'
import {
  buildServerGraphRegistriesIRDocuments,
  defineSignal,
  g
} from '../../dist/src/runtime/core.js'
import { setRuntimeOptions } from '../../dist/src/runtime/runtime_config.js'
import { str } from '../../dist/src/runtime/value.js'
import { decode_gia_file } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'
import { findImplGraphByCompositeName } from './helpers/ordinary-node-contract.js'

const PROTO_PATH = fileURLToPath(
  new URL(
    '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto',
    import.meta.url
  )
)

const OUTPUT_DIR = process.argv[2] ?? '/home/h/genshin-ts/Beyond_Local_Export'

const MAIN_GRAPH_ID = 1073741850
const COMPOSITE_GRAPH_ID = 1073741851
const COMPOSITE_NAME = 'GSTS_SignalMin_Send'

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

// ---- 与主图/复合节点共享的消费逻辑（onSignal 只能图级注册） ----
function consumeCubeTurn(evt: any, f: any): void {
  const face = evt.params.face
  const direction = evt.params.direction
  f.printString(face)
  f.printString(direction)
  f.printString(f.dataTypeConversion(f.getSelfEntity(), 'str'))
}

// ---- 复合版：发送逻辑放进复合节点（与主图发送代码同构） ----
const SendSignalComposite = g.defineComposite(COMPOSITE_NAME, {
  inflows: [{ name: '执行' }],
  outflows: ['完成'],
  inputs: {
    face: { type: 'str' },
    direction: { type: 'str' }
  },
  outputs: {},
  build(inputs: any, f: any) {
    f.sendSignal(CubeTurnSignal, inputs.face, inputs.direction)
    const done = f.registerExecNode('print_string', [new str('signal-min-impl-ok')])
    f.outflow('完成', done, 0)
    return {}
  }
})

// ---- 主图版 ----
g.server({ name: 'GSTS_signal_min_main', id: MAIN_GRAPH_ID })
  .on('whenEntityIsCreated', (_evt: any, f: any) => {
    f.sendSignal(CubeTurnSignal, new str('U'), new str('cw'))
  })
  .onSignal(CubeTurnSignal, consumeCubeTurn)

// ---- 复合版 ----
g.server({ name: 'GSTS_signal_min_composite', id: COMPOSITE_GRAPH_ID })
  .on('whenEntityIsCreated', (_evt: any, f: any) => {
    f.callComposite(SendSignalComposite, {
      face: new str('R'),
      direction: new str('ccw')
    })
  })
  .onSignal(CubeTurnSignal, consumeCubeTurn)

// ---- 生成 ----
const previous = process.env.GSTS_STAGE3_VENDOR_IMPL_GRAPH
process.env.GSTS_STAGE3_VENDOR_IMPL_GRAPH = '1'

const docs = buildServerGraphRegistriesIRDocuments(
  {
    GSTS_signal_min_main: {
      id: MAIN_GRAPH_ID,
      type: 'server'
    },
    GSTS_signal_min_composite: {
      id: COMPOSITE_GRAPH_ID,
      type: 'server'
    }
  },
  [CUBE_TURN_REG]
)

const registry = createSignalRegistry([CUBE_TURN_REG])

async function encodeGraph(doc: any, graphId: number, name: string): Promise<string> {
  const bytes = irToGia(doc, {
    graphId,
    signalRegistry: registry,
    name,
    protoPath: PROTO_PATH,
    stage3: { vendorImplGraphBeta: true }
  })
  const path = join(
    OUTPUT_DIR,
    name === 'GSTS_signal_min_main'
      ? '信号min-主图-send-monitor.gia'
      : '信号min-复合-send-monitor.gia'
  )
  await writeFile(path, Buffer.from(bytes))
  return path
}

try {
  const mainPath = await encodeGraph(docs[0], MAIN_GRAPH_ID, 'GSTS_signal_min_main')
  const compPath = await encodeGraph(docs[1], COMPOSITE_GRAPH_ID, 'GSTS_signal_min_composite')
  console.log('main:', mainPath)
  console.log('composite:', compPath)

  // ---- 解码自检 ----
  const SEND_ID = 1610612741
  const MONITOR_ID = 1610612742

  function signalNameOf(n: any): string | undefined {
    const pin = (n.pins ?? []).find((p: any) => p.i1?.kind === 5)
    return typeof pin?.value === 'string' ? pin.value : pin?.value?.bString?.val
  }

  function findSignalNodes(decoded: any): { sends: any[]; monitors: any[] } {
    const nodes = decoded.graph?.graph?.inner?.graph?.nodes ?? []
    const sends = nodes.filter(
      (n: any) => n.genericId?.nodeId === SEND_ID && signalNameOf(n) === 'cube_turn'
    )
    const monitors = nodes.filter(
      (n: any) => n.genericId?.nodeId === MONITOR_ID && signalNameOf(n) === 'cube_turn'
    )
    return { sends, monitors }
  }

  const main = await decode_gia_file(mainPath, PROTO_PATH)
  const mainSig = findSignalNodes(main)
  assert.equal(mainSig.sends.length, 1, `main: 1 send_signal node, got ${mainSig.sends.length}`)
  assert.equal(mainSig.monitors.length, 1, `main: 1 monitor node, got ${mainSig.monitors.length}`)
  const mainSend = mainSig.sends[0]
  // 真实编辑器样本（001.gia 06-20、修复后 min_main 07-31）signalVersion=2；
  // 多信号2.gia(07-16) 为 1（未验证可用）。修复后样本为权威对照。
  assert.equal(mainSend.signalVersion, 2)
  const mainData = mainSend.pins.filter((p: any) => p.i1?.kind === 3)
  assert.equal(mainData.length, 2, `main send data pins: 2, got ${mainData.length}`)
  // 参数 pinIndex 为编辑器全局动态计数（多信号2.gia 参数 149..157 连续 +1；
  // 001.gia 单参数=12；修复后样本 12/16 因 13/14/15 被监听 pin 占用）。
  // gsts 用 firstParam=12 + i（12,13）与真实样本规则兼容。
  assert.deepEqual(mainData.map((p: any) => p.compositePinIndex).sort(), [12, 13])
  // 真实样本 ClientExec 始终是 pin 数组最后一个；监听节点不编码 OutParam pin
  const lastKind = mainSend.pins[mainSend.pins.length - 1].i1?.kind
  assert.equal(lastKind, 5, `main send ClientExec pin last, got kind ${lastKind}`)
  const mainMonitor = mainSig.monitors[0]
  assert.ok(
    mainMonitor.pins.every((p: any) => p.i1?.kind !== 4),
    'main monitor must not encode OutParam pins'
  )
  assert.equal(
    mainMonitor.pins[mainMonitor.pins.length - 1].i1?.kind,
    5,
    'monitor ClientExec pin last'
  )
  assert.equal(mainMonitor.signalVersion, 2)
  console.log(
    'main OK: send node',
    mainSend.genericId?.nodeId,
    'pins',
    mainData.map((p: any) => `in${p.i1.index}@cpi${p.compositePinIndex}`)
  )

  const comp = await decode_gia_file(compPath, PROTO_PATH)
  const compSig = findSignalNodes(comp)
  assert.equal(
    compSig.monitors.length,
    1,
    `composite: 1 monitor node, got ${compSig.monitors.length}`
  )
  const impl = findImplGraphByCompositeName(comp, COMPOSITE_NAME)
  assert.ok(impl, 'composite impl graph missing')
  const implNodes = impl?.nodes ?? []
  const implSends = implNodes.filter(
    (n: any) => n.genericId?.nodeId === SEND_ID && signalNameOf(n) === 'cube_turn'
  )
  assert.equal(implSends.length, 1, `impl: 1 send_signal node, got ${implSends.length}`)
  const implData = implSends[0].pins.filter((p: any) => p.i1?.kind === 3)
  assert.equal(implData.length, 2, `impl send data pins: 2, got ${implData.length}`)
  console.log(
    'composite OK: impl send node',
    implSends[0].genericId?.nodeId,
    'pins',
    implData.map((p: any) => `in${p.i1.index}@cpi${p.compositePinIndex}`)
  )
} finally {
  if (previous === undefined) delete process.env.GSTS_STAGE3_VENDOR_IMPL_GRAPH
  else process.env.GSTS_STAGE3_VENDOR_IMPL_GRAPH = previous
}
