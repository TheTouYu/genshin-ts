// @ts-nocheck
/**
 * P5-W10: two extracted signals, complete 9+9 parameter parity.
 *
 * This is intentionally separate from the shared special-arg adapter test. It uses
 * the two signal schemas extracted from the current map and exercises every parameter
 * in both the root graph and the Composite implementation:
 *
 * - root sends both signals;
 * - Composite impl sends both signals through the same send helper;
 * - root monitors both signals;
 * - both monitor handlers consume all nine parameters through the same consume helpers.
 *
 * This test checks generated structure only. Editor/game verification remains separate.
 *
 * Run:
 *   npm run build
 *   npx tsx tests/composite/test-stage3-p5w10-two-signal-param-matrix.ts [output.gia]
 */
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { irToGia } from '../../dist/src/compiler/ir_to_gia_transform/index.js'
import { createSignalRegistry } from '../../dist/src/compiler/signal_registry.js'
import { readRegisteredSignalsFromGil } from '../../src/cli/gil_signals.ts'
import { buildServerGraphRegistriesIRDocuments, defineSignal, g } from '../../dist/src/runtime/core.js'
import {
  bool,
  configId,
  float,
  guid,
  int,
  prefabId,
  str,
  vec3
} from '../../dist/src/runtime/value.js'
import { setRuntimeOptions } from '../../dist/src/runtime/runtime_config.js'
import { decode_gia_file } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'
import { findImplGraphByCompositeName } from './helpers/ordinary-node-contract.js'

const PROTO_PATH = new URL(
  '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto',
  import.meta.url
).pathname
const OUTPUT_PATH = process.argv[2] ?? '/tmp/P5W10-two-signal-param-matrix.gia'
const GIL_PATH = process.argv[3] ?? '/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/110170759/Beyond_Local_Save_Level/1073741848.gil'
const GRAPH_ID = 1073742493
const COMPOSITE_NAME = 'P5W10_TwoSignal_Param_Matrix'

const OrdinaryTypes = [
  'int', 'float', 'vec3', 'guid', 'bool', 'entity', 'prefab_id', 'config_id', 'str'
] as const
const ListTypes = [
  'config_id_list', 'prefab_id_list', 'entity_list', 'guid_list', 'bool_list',
  'vec3_list', 'str_list', 'float_list', 'int_list'
] as const

const OrdinarySignalName = '信号_全部参数测试'
const ListSignalName = '信号_全部列表参数测试'
const OrdinarySignal = defineSignal(OrdinarySignalName, OrdinaryTypes.map((type, i) => [`参数_${i + 1}`, type] as const))
const ListSignal = defineSignal(ListSignalName, ListTypes.map((type, i) => [`参数_${i + 1}`, type] as const))
const SIGNAL_CASES = [
  { name: OrdinarySignalName, types: OrdinaryTypes, signal: OrdinarySignal },
  { name: ListSignalName, types: ListTypes, signal: ListSignal }
] as const

setRuntimeOptions({ optimize: { precompileExpression: false, removeUnusedNodes: false } })

function sendOrdinarySignal(f: any, self: any, seed: bigint, label: string) {
  f.sendSignal(
    OrdinarySignal,
    new int(seed),
    new float(1.5),
    new vec3([1, 2, 3]),
    new guid(9000n + seed),
    new bool(true),
    self,
    new prefabId(1001n),
    new configId(2002n),
    new str(label)
  )
}

function sendListSignal(f: any, self: any, seed: bigint, label: string) {
  const configList = f.assemblyList([new configId(2001n), new configId(2002n)], 'config_id')
  const prefabList = f.assemblyList([new prefabId(1001n), new prefabId(1002n)], 'prefab_id')
  const entityList = f.assemblyList([self], 'entity')
  const guidList = f.assemblyList([new guid(3001n), new guid(3002n)], 'guid')
  const boolList = f.assemblyList([new bool(true), new bool(false)], 'bool')
  const vecList = f.assemblyList([new vec3([1, 2, 3]), new vec3([4, 5, 6])], 'vec3')
  const strList = f.assemblyList([new str(`${label}-a`), new str(`${label}-b`)], 'str')
  const floatList = f.assemblyList([new float(1.25), new float(2.5)], 'float')
  const intList = f.assemblyList([new int(seed), new int(seed + 1n)], 'int')
  f.sendSignal(
    ListSignal,
    configList, prefabList, entityList, guidList, boolList,
    vecList, strList, floatList, intList
  )
}

/** Shared root/impl send body: both signals and all 18 arguments are live. */
function sendBothSignals(f: any, self: any, seed: bigint, label: string) {
  sendOrdinarySignal(f, self, seed, label)
  sendListSignal(f, self, seed, label)
}

/** Consume every ordinary-signal parameter through a typed downstream operation. */
function consumeOrdinarySignal(evt: any, f: any) {
  const p = evt.params
  f.printString(f.dataTypeConversion(p.参数_1, 'str'))
  f.printString(f.dataTypeConversion(p.参数_2, 'str'))
  f.createPrefab(9n, p.参数_3, p.参数_3, p.参数_6, false, 0n, f.assemblyList([1n], 'int'))
  f.printString(f.dataTypeConversion(p.参数_4, 'str'))
  f.printString(f.dataTypeConversion(p.参数_5, 'str'))
  f.createPrefab(p.参数_7, new vec3([0, 0, 0]), new vec3([0, 0, 0]), p.参数_6, true, 0n, f.assemblyList([2n], 'int'))
  f.printString(f.dataTypeConversion(f.getListLength(f.assemblyList([p.参数_8], 'config_id')), 'str'))
  f.printString(p.参数_9)
}

/** Consume every list-signal parameter; each list enters a typed length/iteration path. */
function consumeListSignal(evt: any, f: any) {
  const p = evt.params
  f.printString(f.dataTypeConversion(f.getListLength(p.参数_1), 'str'))
  f.printString(f.dataTypeConversion(f.getListLength(p.参数_2), 'str'))
  f.listIterationLoop(p.参数_3, (item: any) => f.createPrefab(11n, new vec3([0, 0, 0]), new vec3([0, 0, 0]), item, false, 0n, f.assemblyList([3n], 'int')))
  f.printString(f.dataTypeConversion(f.getListLength(p.参数_4), 'str'))
  f.printString(f.dataTypeConversion(f.getListLength(p.参数_5), 'str'))
  f.printString(f.dataTypeConversion(f.getListLength(p.参数_6), 'str'))
  f.listIterationLoop(p.参数_7, (item: any) => f.printString(item))
  f.printString(f.dataTypeConversion(f.getListLength(p.参数_8), 'str'))
  f.printString(f.dataTypeConversion(f.getListLength(p.参数_9), 'str'))
}

const twoSignalComposite = g.defineComposite(COMPOSITE_NAME, {
  inflows: [{ name: '执行' }],
  outflows: ['完成'],
  inputs: { target: { type: 'entity' } },
  outputs: {},
  build(inputs: any, f: any) {
    sendBothSignals(f, inputs.target, 7n, 'impl')
    const done = f.registerExecNode('print_string', [new str('two-signal-impl-complete')])
    f.outflow('完成', done, 0)
    return {}
  }
})

g.server({ name: 'P5W10-TwoSignal-Param-Matrix', id: GRAPH_ID })
  .on('whenEntityIsCreated', (_event: any, f: any) => {
    const self = f.getSelfEntity()
    sendBothSignals(f, self, 42n, 'root')
    f.callComposite(twoSignalComposite, { target: self })
    f.printString(new str('two-signal-root-complete'))
  })
  .onSignal(OrdinarySignal, consumeOrdinarySignal)
  .onSignal(ListSignal, consumeListSignal)

const previous = process.env.GSTS_STAGE3_VENDOR_IMPL_GRAPH
process.env.GSTS_STAGE3_VENDOR_IMPL_GRAPH = '1'
let bytes: Uint8Array
try {
  const docs = buildServerGraphRegistriesIRDocuments({ defaultName: 'P5W10-TwoSignal-Param-Matrix' })
  const signalRegistry = createSignalRegistry(readRegisteredSignalsFromGil(GIL_PATH))
  bytes = irToGia(docs.at(-1), {
    graphId: GRAPH_ID,
    name: 'P5W10-TwoSignal-Param-Matrix',
    protoPath: PROTO_PATH,
    signalRegistry,
    stage3: { vendorImplGraphBeta: true }
  })
} finally {
  if (previous === undefined) delete process.env.GSTS_STAGE3_VENDOR_IMPL_GRAPH
  else process.env.GSTS_STAGE3_VENDOR_IMPL_GRAPH = previous
}

await writeFile(OUTPUT_PATH, Buffer.from(bytes))
const decoded = await decode_gia_file(OUTPUT_PATH, PROTO_PATH)
const rootGraph = decoded.graph?.graph?.inner?.graph
const implGraph = findImplGraphByCompositeName(decoded, COMPOSITE_NAME)
assert.ok(rootGraph, 'root graph missing')
assert.ok(implGraph, 'composite impl graph missing')

function signalNameOf(node: any): string | undefined {
  const pin = (node.pins ?? []).find((p: any) => p.i1?.kind === 5)
  const value = pin?.value
  const name = typeof value === 'string' ? value : value?.bString?.val
  return typeof name === 'string' ? name.trim() : undefined
}
function signalNodes(graph: any, id: number, name: string) {
  return (graph.nodes ?? []).filter((n: any) =>
    (n.genericId?.nodeId ?? n.concreteId?.nodeId) === id && signalNameOf(n) === name
  )
}
function dataPins(node: any) {
  return (node.pins ?? []).filter((p: any) => p.i1?.kind === 3).sort((a: any, b: any) => a.i1.index - b.i1.index)
}
function assertUsed(pin: any, label: string) {
  assert.ok((pin.connects ?? []).length > 0 || pin.value?.alreadySetVal === true, `${label} is unused`)
}
function assertParamType(label: string, typeName: string, encoded: any) {
  assert.ok(encoded, `${label} missing type`)
  if (typeName === 'entity') {
    assert.equal(encoded.class, 0)
    assert.equal(encoded.type1, 1)
    assert.equal(encoded.type2, 1)
  } else if (typeName.endsWith('_list')) {
    assert.equal(encoded.class, 10002)
    assert.equal(encoded.type1, 11)
    assert.equal(encoded.type2, 11)
  } else {
    assert.notEqual(encoded.class, undefined)
  }
}

const accessories = decoded.accessories ?? []
const identityByName = new Map<string, { send: number; monitor: number; server: number }>()
const sendDefs = accessories.filter((a: any) => a.which === 14 && a.name === '发送信号')
const monitorDefs = accessories.filter((a: any) => a.which === 12 && a.name === '监听信号')
const serverDefs = accessories.filter((a: any) => a.which === 14 && a.name === '向服务器节点图发送信号')
assert.equal(sendDefs.length, 2, 'expected two independent send definitions')
assert.equal(monitorDefs.length, 2, 'expected two independent monitor definitions')
assert.equal(serverDefs.length, 2, 'expected two independent server definitions')
for (const [index, testCase] of SIGNAL_CASES.entries()) {
  const sendDef = sendDefs[index]
  const monitorDef = monitorDefs[index]
  const serverDef = serverDefs[index]
  const sendId = sendDef.id.id
  const monitorId = monitorDef.id.id
  identityByName.set(testCase.name, { send: sendId, monitor: monitorId, server: serverDef.id.id })
  assert.deepEqual(
    sendDef.relatedIds?.map((x: any) => x.id).sort((a: number, b: number) => a - b),
    [monitorId, serverDef.id.id].sort((a, b) => a - b),
    `${testCase.name} send relatedIds`
  )
  assert.deepEqual(
    monitorDef.relatedIds?.map((x: any) => x.id).sort((a: number, b: number) => a - b),
    [sendId, serverDef.id.id].sort((a, b) => a - b),
    `${testCase.name} monitor relatedIds`
  )

  const inputs = sendDef.compositeDef.inner.def.inputs
  assert.equal(inputs.length, 9)
  testCase.types.forEach((type, i) => {
    assert.equal(inputs[i].name, `参数_${i + 1}`)
    assertParamType(`${testCase.name} send 参数_${i + 1}`, type, inputs[i].type)
  })
  const monitorOutputs = monitorDef.compositeDef.inner.def.outputs
  assert.equal(monitorOutputs.length, 12)
  testCase.types.forEach((type, i) => {
    assert.equal(monitorOutputs[i + 3].name, `参数_${i + 1}`)
    assertParamType(`${testCase.name} monitor 参数_${i + 1}`, type, monitorOutputs[i + 3].type)
  })
}

for (const testCase of SIGNAL_CASES) {
  const identity = identityByName.get(testCase.name)!
  const rootSends = signalNodes(rootGraph, identity.send, testCase.name)
  const implSends = signalNodes(implGraph, identity.send, testCase.name)
  assert.equal(rootSends.length, 1, `${testCase.name} root send count`)
  assert.equal(implSends.length, 1, `${testCase.name} impl send count`)
  for (const [where, node] of [['root', rootSends[0]], ['impl', implSends[0]]]) {
    assert.equal(node.signalVersion, 1, `${testCase.name} ${where} signalVersion`)
    const pins = dataPins(node)
    assert.equal(pins.length, where === 'root' || testCase.name === ListSignalName ? 9 : 8,
      `${testCase.name} ${where} physical data count`)
    for (const pin of pins) {
      assert.equal(pin.compositePinIndex, 12 + pin.i1.index)
      assertUsed(pin, `${testCase.name} ${where} 参数_${pin.i1.index + 1}`)
    }
  }
  const monitors = signalNodes(rootGraph, identity.monitor, testCase.name)
  assert.equal(monitors.length, 1, `${testCase.name} monitor count`)
  const monitorParams = (monitors[0].pins ?? [])
    .filter((p: any) => p.i1?.kind === 4 && p.i1.index >= 3)
    .sort((a: any, b: any) => a.i1.index - b.i1.index)
  assert.equal(monitorParams.length, 9, `${testCase.name} monitor parameter count`)
  monitorParams.forEach((pin: any, i: number) => {
    assert.equal(pin.i1.index, 3 + i)
    assert.equal(pin.compositePinIndex, 18 + i)
  })
}

const implAccessories = accessories.filter((a: any) => a.which === 9)
const implAccessory = implAccessories.find((a: any) =>
  (a.graph?.inner?.graph?.nodes ?? []).some((n: any) => signalNameOf(n) === OrdinarySignalName)
)
assert.ok(implAccessory, 'impl accessory with both signal sends missing')
const implNodes = implAccessory.graph.inner.graph.nodes ?? []
for (const testCase of SIGNAL_CASES) {
  assert.ok(implNodes.some((n: any) => signalNameOf(n) === testCase.name), `${testCase.name} impl node missing`)
}

console.log([
  'P5-W10 two-signal parameter matrix generated',
  'automatic structural checks: passed',
  'signals=2',
  'parameters=9+9',
  `output=${OUTPUT_PATH}`,
  `bytes=${bytes.length}`,
  'editor/game verification: pending'
].join('\n'))
