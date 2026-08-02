import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import { readGilPayloadFields } from '../../../../src/cli/gil_extract_utils.js'
import { readRegisteredSignalsFromGil } from '../../../../src/cli/gil_signals.js'
import { buildFile, parseMessage } from '../../../../src/injector/binary.js'
import { createInjector } from '../../../../src/injector/index.js'
import { loadGiaProto } from '../../../../src/injector/proto.js'
import type { LenField } from '../../../../src/injector/types.js'

type GraphNode = {
  nodeIndex?: number
  genericId?: { nodeId?: number }
  concreteId?: { nodeId?: number }
  x?: number
  y?: number
  pins?: Array<{
    i1?: { kind?: string | number; index?: number }
    i2?: { kind?: string | number; index?: number }
    clientExecNode?: { kind?: string | number; index?: number }
    compositePinIndex?: number
    value?: {
      class?: string | number
      alreadySetVal?: boolean
      bString?: { val?: string }
      bConcreteValue?: {
        indexOfConcrete?: number
        value?: {
          class?: string | number
          bFloat?: unknown
          bVector?: unknown
        }
      }
    }
    type?: number
    connects?: Array<{
      id?: number
      connect?: { kind?: string | number; index?: number }
      connect2?: { kind?: string | number; index?: number }
    }>
  }>
  signalVersion?: number
}

type NodeGraph = {
  id?: { id?: number; type?: number }
  name?: string
  nodes?: GraphNode[]
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

function readGraph(gilPath: string, graphId: number): NodeGraph {
  const { payload, fields } = readGilPayloadFields(gilPath)
  const blobs: LenField[] = []
  parseMessage(payload, 0, payload.length, 0, 0, 0, 0, 0, 0, 0, fields, {
    nodeGraphBlobFields: blobs
  })
  const { nodeGraphMessage } = loadGiaProto()
  for (const field of blobs) {
    const graph = nodeGraphMessage.decode(
      payload.subarray(field.dataStart, field.dataEnd)
    ) as NodeGraph
    if (Number(graph.id?.id) === graphId) return graph
  }
  throw new Error(`NodeGraph ${graphId} not found in ${gilPath}`)
}

function findListener(graph: NodeGraph): GraphNode {
  const listeners = (graph.nodes ?? []).filter(
    (node) => Number(node.genericId?.nodeId) >= 1_000_000_000 && node.signalVersion === 1
  )
  assert.equal(listeners.length, 1, 'target graph must contain exactly one listener donor')
  const node = listeners[0]
  assert(node.genericId && node.concreteId, 'listener identity is incomplete')
  assert.equal(Number(node.genericId.nodeId), Number(node.concreteId.nodeId))
  assert.equal(node.pins?.length, 1, 'listener donor must contain only the signal-name pin')
  const pin = node.pins[0]
  assert(pin.value?.bString?.val, 'listener signal-name value is missing')
  assert.equal(Number(pin.clientExecNode?.index), 1, 'listener ClientSignal index is ambiguous')
  assert(Number.isInteger(pin.compositePinIndex), 'listener signal pin index is ambiguous')
  return node
}

function listenerSummary(node: GraphNode) {
  const pin = node.pins?.[0]
  return {
    nodeIndex: Number(node.nodeIndex),
    signalName: pin?.value?.bString?.val,
    monitorId: Number(node.genericId?.nodeId),
    signalVersion: node.signalVersion,
    signalPinIndex: Number(pin?.compositePinIndex)
  }
}

function replaceListener(
  graph: NodeGraph,
  signalName: string,
  monitorId: number,
  signalPinIndex: number
) {
  const node = findListener(graph)
  node.genericId!.nodeId = monitorId
  node.concreteId!.nodeId = monitorId
  node.pins![0].value!.bString!.val = signalName
  node.pins![0].compositePinIndex = signalPinIndex
  return node
}

function appendListener(graph: NodeGraph, signalName: string) {
  const donor = findListener(graph)
  const entries = readRegisteredSignalsFromGil(sourcePath)
  const signal = entries.find((entry) => entry.name === signalName)
  assert(signal, `registered signal not found: ${signalName}`)
  assert(Number.isInteger(signal.monitorId), 'registered monitorId is incomplete')
  assert(
    signal.params.every((param) => param.name && param.type),
    'signal parameter definition is incomplete'
  )

  const donorSummary = listenerSummary(donor)
  assert.equal(
    donorSummary.signalName,
    signal.name,
    'listener donor uses a different signal layout'
  )
  assert.equal(donorSummary.monitorId, signal.monitorId, 'listener donor monitorId is stale')

  const nodes = graph.nodes ?? []
  const nodeIndex = Math.max(0, ...nodes.map((node) => Number(node.nodeIndex) || 0)) + 1
  const candidate = structuredClone(donor)
  candidate.nodeIndex = nodeIndex
  candidate.genericId!.nodeId = signal.monitorId
  candidate.concreteId!.nodeId = signal.monitorId
  candidate.pins![0].value!.bString!.val = signal.name

  const donorPinIndex = candidate.pins![0].compositePinIndex
  assert(Number.isInteger(donorPinIndex), 'current listener signal pin layout is ambiguous')
  candidate.pins![0].compositePinIndex = donorPinIndex
  candidate.x = Math.max(...nodes.map((node) => Number(node.x) || 0), Number(donor.x) || 0) + 800
  candidate.y = Number(donor.y) || 0
  graph.nodes = [...nodes, candidate]
  return { candidate, signal, donorNodeIndex: donor.nodeIndex }
}

function usage(): never {
  console.error(
    'Usage: npx tsx replay-listener-signal.ts append-listener <source.gil> <graphId> <signalName> <out.gia> <out.gil>'
  )
  console.error(
    '   or: npx tsx replay-listener-signal.ts consume-int|consume-float|consume-vec3 <target.gil> <donor.gil> <graphId> <out.gia> <out.gil>'
  )
  console.error(
    '   or: npx tsx replay-listener-signal.ts consume-str|consume-bool|consume-guid|consume-entity|consume-prefab|consume-config <target.gil> <donor.gil> <graphId> <out.gia> <out.gil>'
  )
  console.error(
    '   or: npx tsx replay-listener-signal.ts replace-listener <donor.gil> <target.gil> <graphId> <out.gia> <out.gil> <signalName> <monitorId> <signalPinIndex>'
  )
  process.exit(1)
}

const args = process.argv.slice(2)
const mode = args.shift()
if (
  mode !== 'append-listener' &&
  !mode.startsWith('consume-') &&
  mode !== 'replace-listener'
)
  usage()

let sourcePath: string
let targetPath: string
let graphIdText: string
let giaPath: string
let outGilPath: string
let signalName: string
let replacementMonitorId: number | undefined
let replacementSignalPinIndex: number | undefined

if (mode === 'append-listener') {
  ;[sourcePath, graphIdText, signalName, giaPath, outGilPath] = args
  targetPath = sourcePath
} else if (mode.startsWith('consume-')) {
  ;[targetPath, sourcePath, graphIdText, giaPath, outGilPath] = args
  signalName = '信号测试全参数'
} else {
  ;[sourcePath, targetPath, graphIdText, giaPath, outGilPath, signalName] = args
  replacementMonitorId = Number(args[6])
  replacementSignalPinIndex = Number(args[7])
}

const graphId = Number(graphIdText)
if (
  !sourcePath ||
  !targetPath ||
  !signalName ||
  !Number.isFinite(graphId) ||
  !giaPath ||
  !outGilPath
)
  usage()
for (const output of [giaPath, outGilPath]) {
  if (fs.existsSync(output)) throw new Error(`refusing to overwrite: ${output}`)
  fs.mkdirSync(path.dirname(output), { recursive: true })
}

const sourceBytes = fs.readFileSync(sourcePath)
const targetBytes = fs.readFileSync(targetPath)
const candidateGraph = readGraph(targetPath, graphId)
let added: {
  candidate: GraphNode
  signal: {
    name: string
    monitorId: number
    params?: Array<{ name: string; type: string; parameterDefinitionPinIndex?: number }>
  }
  donorNodeIndex?: number
}

type Consume18Spec = {
  expectedType: string
  paramIndex: number
  outIndex: number
  varType: number
  concreteId: number
  connect2Index: number
}

// 获取局部变量(18族)消费监听参数输出的重放规格；connect2Index 含 str→3 / entity→4 经验例外
const CONSUME_18_SPECS: Record<string, Consume18Spec> = {
  'consume-str': {
    expectedType: 'str',
    paramIndex: 3,
    outIndex: 6,
    varType: 6,
    concreteId: 2656,
    connect2Index: 3
  },
  'consume-bool': {
    expectedType: 'bool',
    paramIndex: 4,
    outIndex: 7,
    varType: 4,
    concreteId: 18,
    connect2Index: 7
  },
  'consume-guid': {
    expectedType: 'guid',
    paramIndex: 5,
    outIndex: 8,
    varType: 2,
    concreteId: 2658,
    connect2Index: 8
  },
  'consume-entity': {
    expectedType: 'entity',
    paramIndex: 6,
    outIndex: 9,
    varType: 1,
    concreteId: 2657,
    connect2Index: 4
  },
  'consume-prefab': {
    expectedType: 'prefab_id',
    paramIndex: 7,
    outIndex: 10,
    varType: 21,
    concreteId: 2669,
    connect2Index: 10
  },
  'consume-config': {
    expectedType: 'config_id',
    paramIndex: 8,
    outIndex: 11,
    varType: 20,
    concreteId: 2668,
    connect2Index: 11
  }
}

if (mode === 'append-listener') {
  added = appendListener(candidateGraph, signalName)
} else if (mode === 'consume-int' || mode === 'consume-float' || mode === 'consume-vec3') {
  const signal = readRegisteredSignalsFromGil(targetPath).find((entry) => entry.name === signalName)
  assert(signal, `registered signal not found: ${signalName}`)
  const parameterIndex = mode === 'consume-int' ? 0 : mode === 'consume-float' ? 1 : 2
  const expectedType = mode === 'consume-int' ? 'int' : mode === 'consume-float' ? 'float' : 'vec3'
  const expectedVarType = mode === 'consume-int' ? 3 : mode === 'consume-float' ? 5 : 12
  const expectedOutputIndex = mode === 'consume-int' ? 3 : mode === 'consume-float' ? 4 : 5
  const param = signal.params[parameterIndex]
  assert.equal(
    param?.type,
    expectedType,
    `signal parameter ${parameterIndex} must be ${expectedType}`
  )
  assert(
    Number.isInteger(param.monitorPinIndex),
    `${expectedType} parameter monitor pin index is missing`
  )

  const listener = findListener(candidateGraph)
  assert.equal(Number(listener.genericId?.nodeId), signal.monitorId, 'listener monitorId is stale')
  assert.equal(listener.pins?.[0]?.value?.bString?.val, signalName, 'listener signal name differs')

  const donorGraph = readGraph(sourcePath, graphId)
  const donorNodes = (donorGraph.nodes ?? []).filter(
    (node) => Number(node.genericId?.nodeId) === 180 && node.pins?.[0]?.type === expectedVarType
  )
  assert.equal(donorNodes.length, 1, `expected exactly one ${expectedType} DTC donor node`)
  const donorNode = donorNodes[0]
  assert.equal(donorNode.pins?.length, 1, 'DTC donor pin layout is ambiguous')
  const donorPin = donorNode.pins[0]
  assert.equal(Number(donorPin.i1?.kind), 3, 'DTC donor input kind is not InParam')
  assert(!Object.hasOwn(donorPin.i1 ?? {}, 'index'), 'DTC donor i1.index presence changed')
  assert(!Object.hasOwn(donorPin.i2 ?? {}, 'index'), 'DTC donor i2.index presence changed')
  assert.equal(donorPin.type, expectedVarType, `DTC donor input type is not ${expectedType}`)
  assert.equal(donorPin.connects?.length, 1, 'DTC donor must contain one connection')
  const donorConnection = donorPin.connects[0]
  assert.equal(Number(donorConnection.id), Number(findListener(donorGraph).nodeIndex))
  assert.equal(Number(donorConnection.connect?.kind), 4, 'DTC donor source kind is not OutParam')
  assert.equal(
    donorConnection.connect?.index,
    expectedOutputIndex,
    'DTC donor source index differs'
  )
  assert.deepEqual(donorConnection.connect2, donorConnection.connect, 'DTC donor endpoints differ')
  if (mode === 'consume-float') {
    assert.equal(donorPin.value?.bConcreteValue?.indexOfConcrete, 4)
    assert(donorPin.value?.bConcreteValue?.value?.bFloat, 'float donor bFloat is missing')
  }
  if (mode === 'consume-vec3') {
    assert.equal(Number(donorNode.concreteId?.nodeId), 189)
    assert.equal(donorPin.value?.bConcreteValue?.indexOfConcrete, 5)
    assert(donorPin.value?.bConcreteValue?.value?.bVector, 'vec3 donor bVector is missing')
  }

  const nodeIndex =
    Math.max(0, ...(candidateGraph.nodes ?? []).map((node) => Number(node.nodeIndex) || 0)) + 1
  const candidate = structuredClone(donorNode)
  candidate.nodeIndex = nodeIndex
  candidate.x = Math.max(...(candidateGraph.nodes ?? []).map((node) => Number(node.x) || 0)) + 800
  candidate.y = Number(listener.y) || 0
  candidate.pins![0].connects = [
    {
      id: Number(listener.nodeIndex),
      connect: { kind: 4, index: expectedOutputIndex },
      connect2: { kind: 4, index: expectedOutputIndex }
    }
  ]
  candidateGraph.nodes = [...(candidateGraph.nodes ?? []), candidate]
  added = { candidate, signal, donorNodeIndex: donorNode.nodeIndex }
} else if (mode in CONSUME_18_SPECS) {
  const spec = CONSUME_18_SPECS[mode]
  const signal = readRegisteredSignalsFromGil(targetPath).find(
    (entry) => entry.name === signalName
  )
  assert(signal, `registered signal not found: ${signalName}`)
  const param = signal.params[spec.paramIndex]
  assert.equal(
    param?.type,
    spec.expectedType,
    `signal parameter ${spec.paramIndex} must be ${spec.expectedType}`
  )
  const listener = findListener(candidateGraph)
  assert.equal(Number(listener.genericId?.nodeId), signal.monitorId, 'listener monitorId is stale')
  assert.equal(listener.pins?.[0]?.value?.bString?.val, signalName, 'listener signal name differs')

  const donorGraph = readGraph(sourcePath, graphId)
  const donorNodes = (donorGraph.nodes ?? []).filter(
    (node) =>
      Number(node.genericId?.nodeId) === 18 &&
      Number(node.concreteId?.nodeId) === spec.concreteId &&
      node.pins?.[0]?.type === spec.varType
  )
  assert.ok(
    donorNodes.length >= 1,
    `expected at least one 18/${spec.concreteId} donor node`
  )
  const donorNode = donorNodes[0]
  const donorPin = donorNode.pins?.[0]
  assert.ok(donorPin, 'donor pin missing')
  assert.equal(Number(donorPin.i1?.kind), 3, 'donor input kind is not InParam')
  assert.equal(donorPin.connects?.length, 1, 'donor must contain one connection')
  const donorConnection = donorPin.connects[0]
  assert.equal(
    Number(donorConnection.id),
    Number(findListener(donorGraph).nodeIndex),
    'donor connects id stale'
  )
  assert.equal(Number(donorConnection.connect?.kind), 4, 'donor source kind is not OutParam')
  assert.equal(donorConnection.connect?.index, spec.outIndex, 'donor source index differs')
  assert.equal(
    donorConnection.connect2?.index,
    spec.connect2Index,
    'donor connect2 index differs from replay spec'
  )

  const nodeIndex =
    Math.max(0, ...(candidateGraph.nodes ?? []).map((node) => Number(node.nodeIndex) || 0)) + 1
  const candidate = structuredClone(donorNode)
  candidate.nodeIndex = nodeIndex
  candidate.x = Math.max(...(candidateGraph.nodes ?? []).map((node) => Number(node.x) || 0)) + 800
  candidate.y = Number(listener.y) || 0
  candidate.pins![0].connects = [
    {
      id: Number(listener.nodeIndex),
      connect: { kind: 4, index: spec.outIndex },
      connect2: { kind: 4, index: spec.connect2Index }
    }
  ]
  candidateGraph.nodes = [...(candidateGraph.nodes ?? []), candidate]
  added = { candidate, signal, donorNodeIndex: donorNode.nodeIndex }
} else {
  assert(Number.isInteger(replacementMonitorId), 'invalid monitorId')
  assert(Number.isInteger(replacementSignalPinIndex), 'invalid signalPinIndex')
  const node = replaceListener(
    candidateGraph,
    signalName,
    replacementMonitorId!,
    replacementSignalPinIndex!
  )
  added = { candidate: node, signal: { name: signalName, monitorId: replacementMonitorId! } }
}

const { rootMessage, nodeGraphMessage } = loadGiaProto()
const fileName = path.basename(giaPath, path.extname(giaPath))
const root = rootMessage.create({
  graph: {
    id: { class: 5, type: 0, id: graphId },
    name: candidateGraph.name,
    which: 9,
    graph: { inner: { graph: candidateGraph } }
  },
  filePath: `100000001-${Math.floor(Date.now() / 1000)}-${graphId + 1}-\\${fileName}`,
  gameVersion: '6.6.0'
})
const giaBytes = buildFile(rootMessage.encode(root).finish(), {
  schema: 1,
  headTag: 0x0326,
  fileType: 3,
  tailTag: 0x0679
})
const headerView = new DataView(giaBytes.buffer, giaBytes.byteOffset, giaBytes.byteLength)
assert.equal(headerView.getUint32(12, false), 3, 'GIA fileType is not 3')
const decodedRoot = rootMessage.decode(giaBytes.subarray(20, giaBytes.length - 4)) as typeof root
assert.equal(Number(decodedRoot.graph?.id?.id), graphId, 'Root graph identity differs')
assert.equal(
  Number(decodedRoot.graph?.graph?.inner?.graph?.id?.id),
  graphId,
  'inner graph identity differs'
)
assert.equal(decodedRoot.filePath, root.filePath, 'GIA filePath differs')
assert.equal(decodedRoot.gameVersion, root.gameVersion, 'GIA gameVersion differs')

const result = createInjector({ lang: 'zh-CN' }).injectBytes({
  gilBytes: targetBytes,
  giaBytes,
  targetId: graphId,
  skipNonEmptyCheck: true
})
fs.writeFileSync(giaPath, giaBytes, { flag: 'wx' })
fs.writeFileSync(outGilPath, result.bytes, { flag: 'wx' })

const replayGraph = readGraph(outGilPath, graphId)
assert.deepEqual(
  Buffer.from(nodeGraphMessage.encode(replayGraph as never).finish()),
  Buffer.from(nodeGraphMessage.encode(candidateGraph as never).finish()),
  'replayed NodeGraph differs from candidate'
)

console.log(
  JSON.stringify(
    {
      status: 'PASS',
      mode,
      graphId,
      graphName: candidateGraph.name,
      listener: listenerSummary(findListener(candidateGraph)),
      addedNode: {
        nodeIndex: added.candidate.nodeIndex,
        genericId: Number(added.candidate.genericId?.nodeId),
        concreteId: Number(added.candidate.concreteId?.nodeId),
        pinCount: added.candidate.pins?.length ?? 0
      },
      parameterSummary:
        mode === 'append-listener'
          ? added.signal.params?.map((param, index) => ({ definitionOrder: index, ...param }))
          : undefined,
      donorNodeIndex: added.donorNodeIndex,
      connection: added.candidate.pins?.[0]?.connects?.[0],
      presence: {
        concreteId: Object.hasOwn(added.candidate, 'concreteId'),
        i1Index: Object.hasOwn(added.candidate.pins?.[0]?.i1 ?? {}, 'index'),
        i2Index: Object.hasOwn(added.candidate.pins?.[0]?.i2 ?? {}, 'index'),
        connectIndex: Object.hasOwn(
          added.candidate.pins?.[0]?.connects?.[0]?.connect ?? {},
          'index'
        ),
        connect2Index: Object.hasOwn(
          added.candidate.pins?.[0]?.connects?.[0]?.connect2 ?? {},
          'index'
        )
      },
      formalGia: {
        fileType: headerView.getUint32(12, false),
        rootId: Number(decodedRoot.graph?.id?.id),
        innerGraphId: Number(decodedRoot.graph?.graph?.inner?.graph?.id?.id),
        filePath: decodedRoot.filePath,
        gameVersion: decodedRoot.gameVersion
      },
      source: { path: sourcePath, sha256: sha256(new Uint8Array(sourceBytes)) },
      target: { path: targetPath, sha256: sha256(new Uint8Array(targetBytes)) },
      gia: { path: giaPath, sha256: sha256(giaBytes) },
      output: { path: outGilPath, sha256: sha256(result.bytes) },
      validation: 'strict target NodeGraph protobuf re-encode equality'
    },
    null,
    2
  )
)
