// @ts-nocheck
/**
 * P5-W10: signal parameter full-type matrix (root ↔ composite parity).
 *
 * One shared send/consume body is used in BOTH:
 * - root whenEntityIsCreated path
 * - composite impl path
 *
 * Signal schema covers every SignalParamType scalar + *_list family except enum
 * (root-unsupported) and unknown. Every param is:
 * - sent from root
 * - sent from composite
 * - consumed on root monitor (all OutParams stay live)
 *
 * Real GIA ParameterFlow tags asserted:
 * - entity → class=0 type1=1
 * - every *_list → class=10002 type1=type2=11
 *
 * Default gate stays false. Not a special-arg adapter contract (see p5w10 shared-adapter).
 *
 * Run:
 *   npm run build
 *   npx tsx tests/composite/test-stage3-p5w10-signal-param-matrix.ts [output.gia]
 */
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { irToGia } from '../../dist/src/compiler/ir_to_gia_transform/index.js'
import {
  buildServerGraphRegistriesIRDocuments,
  defineSignal,
  g
} from '../../dist/src/runtime/core.js'
import {
  bool,
  configId,
  faction,
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
const OUTPUT_PATH = process.argv[2] ?? '/tmp/P5W10-signal-param-matrix.gia'
const GRAPH_ID = 1073742492
const COMPOSITE_NAME = 'P5W10_SignalParam_Matrix'
const SIGNAL_NAME = 'GSTS_随机全参数信号_20260716'

/** Full supported signal param family (no enum / unknown). */
const SIGNAL_PARAM_TYPES = [
  // scalars
  'bool',
  'int',
  'float',
  'str',
  'vec3',
  'guid',
  'entity',
  'prefab_id',
  'config_id',
  'faction',
  // lists
  'bool_list',
  'int_list',
  'float_list',
  'str_list',
  'vec3_list',
  'guid_list',
  'entity_list'
] as const

const SIGNAL_PARAM_COUNT = SIGNAL_PARAM_TYPES.length
const ENTITY_PARAM_INDEX = SIGNAL_PARAM_TYPES.indexOf('entity')

const SignalFull = defineSignal(
  SIGNAL_NAME,
  SIGNAL_PARAM_TYPES.map((type, i) => [`参数_${i + 1}`, type] as const)
)
const SignalScalarSink = defineSignal('GSTS_辅助标量消费_20260716', [
  ['配置', 'config_id'],
  ['阵营', 'faction']
] as const)

setRuntimeOptions({ optimize: { precompileExpression: false, removeUnusedNodes: false } })

/**
 * Shared send body: identical IR shape for root and composite.
 * `self` is entity source (root getSelfEntity / composite input target).
 * `label` only affects string markers so root/impl can be distinguished in prints.
 */
function sendAllSignalParams(f: any, self: any, label: string, seed: bigint) {
  const boolList = f.assemblyList([true, false], 'bool')
  const intList = f.assemblyList([seed, seed + 1n], 'int')
  const floatList = f.assemblyList([1.25, 2.5], 'float')
  const strList = f.assemblyList([new str(`${label}-a`), new str(`${label}-b`)], 'str')
  const vecList = f.assemblyList([new vec3([1, 2, 3]), new vec3([4, 5, 6])], 'vec3')
  const guidList = f.assemblyList([new guid(100n + seed), new guid(200n + seed)], 'guid')
  const entityList = f.assemblyList([self], 'entity')
  f.sendSignal(
    SignalFull,
    // scalars in SIGNAL_PARAM_TYPES order
    new bool(true),
    new int(seed),
    new float(1.5),
    new str(label),
    new vec3([1, 2, 3]),
    new guid(9000n + seed),
    self,
    new prefabId(1001n),
    new configId(2002n),
    new faction(3n),
    // lists
    boolList,
    intList,
    floatList,
    strList,
    vecList,
    guidList,
    entityList
  )
}

/**
 * Shared consume body for monitor OutParams.
 * Every param is read so monitor pins stay live. Keep side effects simple and typed.
 */
function consumeAllSignalParams(evt: any, f: any) {
  const p = evt.params
  // scalars — only use DTC targets that exist in DataTypeConversionMap
  // (bool/int/float/str/vec3/guid/entity/faction; NOT config_id/prefab_id)
  f.printString(f.dataTypeConversion(p.参数_1, 'str')) // bool
  f.printString(f.dataTypeConversion(p.参数_2, 'str')) // int
  f.printString(f.dataTypeConversion(p.参数_3, 'str')) // float
  f.printString(p.参数_4) // str
  f.createPrefab(
    9n,
    p.参数_5, // vec3 pos
    p.参数_5, // vec3 rot
    p.参数_7, // entity
    false,
    0n,
    f.assemblyList([1n], 'int')
  )
  f.printString(f.dataTypeConversion(p.参数_6, 'str')) // guid
  // entity used as createPrefab target above
  f.createPrefab(
    p.参数_8, // prefab_id as prefab config slot
    new vec3([0, 0, 0]),
    new vec3([0, 0, 0]),
    p.参数_7,
    true,
    0n,
    f.assemblyList([2n], 'int')
  )
  // Dedicated sink signal keeps config_id/faction as typed connections without
  // forcing an unsupported config_id→str conversion in the consumer graph.
  f.sendSignal(SignalScalarSink, p.参数_9, p.参数_10)

  // lists — length (or typed loop) keeps every OutParam live
  f.printString(f.dataTypeConversion(f.getListLength(p.参数_11), 'str')) // bool_list
  f.printString(f.dataTypeConversion(f.getListLength(p.参数_12), 'str')) // int_list
  f.printString(f.dataTypeConversion(f.getListLength(p.参数_13), 'str')) // float_list
  f.printString(f.dataTypeConversion(f.getListLength(p.参数_14), 'str')) // str_list
  f.printString(f.dataTypeConversion(f.getListLength(p.参数_15), 'str')) // vec3_list
  f.printString(f.dataTypeConversion(f.getListLength(p.参数_16), 'str')) // guid_list
  f.printString(f.dataTypeConversion(f.getListLength(p.参数_17), 'str')) // entity_list
}

// --- Composite: same send body as root ---
const signalMatrixComposite = g.defineComposite(COMPOSITE_NAME, {
  inflows: [{ name: '执行' }],
  outflows: ['完成'],
  inputs: { target: { type: 'entity' } },
  outputs: {},
  build(inputs: any, f: any) {
    sendAllSignalParams(f, inputs.target, 'impl', 7n)
    const done = f.registerExecNode('print_string', [new str('p5w10-signal-matrix-impl-ok')])
    f.outflow('完成', done, 0)
    return {}
  }
})

// --- Root: same send body + call composite + monitor consume ---
g.server({ name: 'P5W10-SignalParam-Matrix', id: GRAPH_ID })
  .on('whenEntityIsCreated', (_event: any, f: any) => {
    const self = f.getSelfEntity()
    sendAllSignalParams(f, self, 'root', 42n)
    f.callComposite(signalMatrixComposite, { target: self })
    f.printString(new str('p5w10-signal-matrix-root-ok'))
  })
  .onSignal(SignalFull, (evt: any, f: any) => {
    consumeAllSignalParams(evt, f)
  })

const previous = process.env.GSTS_STAGE3_VENDOR_IMPL_GRAPH
process.env.GSTS_STAGE3_VENDOR_IMPL_GRAPH = '1'
let bytes: Uint8Array
try {
  const docs = buildServerGraphRegistriesIRDocuments({ defaultName: 'P5W10-SignalParam-Matrix' })
  bytes = irToGia(docs.at(-1), {
    graphId: GRAPH_ID,
    name: 'P5W10-SignalParam-Matrix',
    protoPath: PROTO_PATH,
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
assert.ok(implGraph, 'impl graph missing')

const BUILTIN_SEND = 1610612738
const BUILTIN_MONITOR = 1610612739
const SIGNAL_SEND_ID = 1610612738
const SIGNAL_MONITOR_ID = 1610612739

function signalNameOf(n: any): string | undefined {
  const pin = (n.pins ?? []).find((p: any) => p.i1?.kind === 5)
  return typeof pin?.value === 'string' ? pin.value : pin?.value?.bString?.val
}
function isSendSignalNode(n: any): boolean {
  const id = n.genericId?.nodeId ?? n.concreteId?.nodeId
  return (id === SIGNAL_SEND_ID || id === 300000) && signalNameOf(n) === SIGNAL_NAME
}
function isMonitorSignalNode(n: any): boolean {
  const id = n.genericId?.nodeId ?? n.concreteId?.nodeId
  return (id === SIGNAL_MONITOR_ID || id === 300001) && signalNameOf(n) === SIGNAL_NAME
}

function dataInParams(node: any): any[] {
  return (node.pins ?? [])
    .filter((p: any) => p.i1?.kind === 3)
    .sort((a: any, b: any) => a.i1.index - b.i1.index)
}

function assertSignalParamType(label: string, typeName: string, encoded: any) {
  assert.ok(encoded, `${label} missing type for ${typeName}`)
  if (typeName === 'entity') {
    assert.equal(encoded.class, 0, `${label} entity class must be Unknown(0)`)
    assert.equal(encoded.type1, 1, `${label} entity type1 must be Entity(1)`)
    assert.equal(encoded.type2, 1, `${label} entity type2 must be Entity(1)`)
    return
  }
  if (typeName.endsWith('_list')) {
    assert.equal(encoded.class, 10002, `${label} ${typeName} class must be ArrayBase`)
    assert.equal(encoded.type1, 11, `${label} ${typeName} type1 must be StringList(11)`)
    assert.equal(encoded.type2, 11, `${label} ${typeName} type2 must be StringList(11)`)
    return
  }
  assert.notEqual(encoded.class, undefined, `${label} ${typeName} class present`)
}

/** Physical pin VarType for list elements (not ParameterFlow container 11). */
const LIST_PHYSICAL_TYPE: Record<string, number> = {
  bool_list: 9,
  int_list: 8,
  float_list: 10,
  str_list: 11,
  vec3_list: 15,
  guid_list: 7,
  entity_list: 13
}

// --- Root send: full physical param set ---
const rootSends = (rootGraph.nodes ?? []).filter(isSendSignalNode)
assert.equal(rootSends.length, 1, `root should have exactly 1 send, got ${rootSends.length}`)
const rootSend = rootSends[0]
assert.equal(rootSend.genericId?.nodeId, BUILTIN_SEND)
assert.equal(rootSend.signalVersion, 1)
const rootNamePin = (rootSend.pins ?? []).find((p: any) => p.i1?.kind === 5)
assert.equal(
  typeof rootNamePin?.value === 'string' ? rootNamePin.value : rootNamePin?.value?.bString?.val,
  SIGNAL_NAME
)
const rootData = dataInParams(rootSend)
assert.equal(
  rootData.length,
  SIGNAL_PARAM_COUNT,
  `root send should expose ${SIGNAL_PARAM_COUNT} data pins, got ${rootData.length}`
)
for (let i = 0; i < SIGNAL_PARAM_COUNT; i++) {
  assert.equal(rootData[i].i1.index, i, `root send physical index ${i}`)
  assert.equal(rootData[i].compositePinIndex, 12 + i, `root send cpi ${12 + i}`)
}
// entity wired
assert.ok((rootData[ENTITY_PARAM_INDEX].connects ?? []).length > 0, 'root entity must be wired')
assert.equal(rootData[ENTITY_PARAM_INDEX].type, 1, 'root entity physical type Entity')
// every list pin wired + element-aware physical type
for (const [listType, expectedType] of Object.entries(LIST_PHYSICAL_TYPE)) {
  const idx = SIGNAL_PARAM_TYPES.indexOf(listType as (typeof SIGNAL_PARAM_TYPES)[number])
  assert.ok(idx >= 0, listType)
  const pin = rootData[idx]
  assert.ok((pin.connects ?? []).length > 0, `root ${listType} must be wired`)
  assert.equal(
    pin.type,
    expectedType,
    `root ${listType} physical type expected ${expectedType}, got ${pin.type}`
  )
}

// --- Impl send: same param family; entity capture-routed ---
const implSends = (implGraph.nodes ?? []).filter(isSendSignalNode)
assert.equal(implSends.length, 1, `impl should have exactly 1 send, got ${implSends.length}`)
const implSend = implSends[0]
assert.equal(implSend.genericId?.nodeId, SIGNAL_SEND_ID)
assert.equal(implSend.signalVersion, 1)
const implNamePin = (implSend.pins ?? []).find((p: any) => p.i1?.kind === 5)
assert.equal(
  typeof implNamePin?.value === 'string' ? implNamePin.value : implNamePin?.value?.bString?.val,
  SIGNAL_NAME
)
const implData = dataInParams(implSend)
assert.equal(
  implData.length,
  SIGNAL_PARAM_COUNT - 1,
  `impl send should expose ${SIGNAL_PARAM_COUNT - 1} physical data pins (entity captured), got ${implData.length}`
)
const implIndexes = new Set(implData.map((p: any) => p.i1.index))
assert.ok(
  !implIndexes.has(ENTITY_PARAM_INDEX),
  `impl send must not keep physical entity pin ${ENTITY_PARAM_INDEX}`
)
for (const pin of implData) {
  assert.equal(pin.compositePinIndex, 12 + pin.i1.index, `impl cpi for pin ${pin.i1.index}`)
}
// list pins still physical + wired in impl
for (const listType of Object.keys(LIST_PHYSICAL_TYPE)) {
  const idx = SIGNAL_PARAM_TYPES.indexOf(listType as (typeof SIGNAL_PARAM_TYPES)[number])
  const pin = implData.find((p: any) => p.i1.index === idx)
  assert.ok(pin, `impl send missing physical ${listType} pin ${idx}`)
  assert.ok((pin.connects ?? []).length > 0, `impl ${listType} must be wired`)
  assert.equal(
    pin.type,
    LIST_PHYSICAL_TYPE[listType],
    `impl ${listType} physical type expected ${LIST_PHYSICAL_TYPE[listType]}, got ${pin.type}`
  )
}

// compositePins must route composite entity input → send entity physical index
const accessories = decoded.accessories ?? []
const implAccessory = accessories.find(
  (a: any) =>
    a.which === 9 &&
    (a.graph?.inner?.graph?.nodes ?? []).some(
      (n: any) => (n.genericId?.nodeId ?? n.concreteId?.nodeId) === BUILTIN_SEND
    )
)
assert.ok(implAccessory, 'impl graph accessory missing')
const compositePins = implAccessory.graph?.inner?.graph?.compositePins ?? []
const captureEntityRoute = compositePins.find(
  (cp: any) =>
    cp.outerPin?.kind === 3 &&
    cp.innerPin?.kind === 3 &&
    cp.innerPin?.index === ENTITY_PARAM_INDEX &&
    cp.innerNodeId === implSend.nodeIndex
)
assert.ok(
  captureEntityRoute,
  `compositePins must route entity input to send pin ${ENTITY_PARAM_INDEX} on node ${implSend.nodeIndex}`
)

// --- Root monitor: all param OutParams ---
const rootMonitors = (rootGraph.nodes ?? []).filter(isMonitorSignalNode)
assert.equal(rootMonitors.length, 1, 'root should have exactly 1 monitor')
const mon = rootMonitors[0]
assert.equal(mon.genericId?.nodeId, SIGNAL_MONITOR_ID)
assert.equal(mon.signalVersion, 1)
const monName = (mon.pins ?? []).find((p: any) => p.i1?.kind === 5)
assert.equal(
  typeof monName?.value === 'string' ? monName.value : monName?.value?.bString?.val,
  SIGNAL_NAME
)
const monParamOuts = (mon.pins ?? [])
  .filter((p: any) => p.i1?.kind === 4 && (p.i1?.index ?? 0) >= 3)
  .sort((a: any, b: any) => a.i1.index - b.i1.index)
assert.equal(
  monParamOuts.length,
  SIGNAL_PARAM_COUNT,
  `monitor should expose ${SIGNAL_PARAM_COUNT} param OutParams, got ${monParamOuts.length}`
)
for (let i = 0; i < SIGNAL_PARAM_COUNT; i++) {
  assert.equal(monParamOuts[i].i1.index, 3 + i)
  assert.equal(monParamOuts[i].compositePinIndex, 15 + 3 + i)
}

// --- SignalDef ParameterFlow types ---
const sendDef = accessories.find(
  (a: any) => a.which === 14 && a.name === '发送信号' && a.id?.id === BUILTIN_SEND
)
assert.ok(sendDef, 'missing 发送信号 SignalDef')
const sendInputs = sendDef.compositeDef?.inner?.def?.inputs ?? []
assert.equal(sendInputs.length, SIGNAL_PARAM_COUNT)
for (let i = 0; i < SIGNAL_PARAM_COUNT; i++) {
  assert.equal(sendInputs[i]?.name, `参数_${i + 1}`)
  assertSignalParamType('发送信号', SIGNAL_PARAM_TYPES[i], sendInputs[i]?.type)
}

const monitorDef = accessories.find(
  (a: any) => a.which === 12 && a.name === '监听信号' && a.id?.id === BUILTIN_MONITOR
)
assert.ok(monitorDef, 'missing 监听信号 CompositeDef')
const monOutputs = monitorDef.compositeDef?.inner?.def?.outputs ?? []
assert.equal(monOutputs.length, 3 + SIGNAL_PARAM_COUNT)
assertSignalParamType('监听固定', 'entity', monOutputs[0]?.type)
assertSignalParamType('监听固定', 'entity', monOutputs[2]?.type)
for (let i = 0; i < SIGNAL_PARAM_COUNT; i++) {
  assert.equal(monOutputs[3 + i]?.name, `参数_${i + 1}`)
  assertSignalParamType('监听信号', SIGNAL_PARAM_TYPES[i], monOutputs[3 + i]?.type)
}

// Root/impl parity: same signal name, same param count in SignalDef, both send once
assert.equal(
  rootData.length,
  SIGNAL_PARAM_COUNT,
  'root physical pins = full schema'
)
assert.equal(
  implData.length + 1,
  SIGNAL_PARAM_COUNT,
  'impl physical + 1 capture entity = full schema'
)

console.log(
  [
    'P5-W10 signal param matrix OK',
    `params=${SIGNAL_PARAM_COUNT}`,
    `types=${SIGNAL_PARAM_TYPES.join(',')}`,
    `rootSendPins=${rootData.length}`,
    `implSendPins=${implData.length} (entity capture @${ENTITY_PARAM_INDEX})`,
    `monitorOuts=${monParamOuts.length}`,
    `output=${OUTPUT_PATH}`,
    `bytes=${bytes.length}`,
    'defaultVendorImplGraphGate=false'
  ].join('\n')
)
