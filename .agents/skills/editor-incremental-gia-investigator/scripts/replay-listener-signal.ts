import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import { readGilPayloadFields } from '../../../../src/cli/gil_extract_utils.js'
import { buildFile, parseMessage } from '../../../../src/injector/binary.js'
import { createInjector } from '../../../../src/injector/index.js'
import { loadGiaProto } from '../../../../src/injector/proto.js'
import type { LenField } from '../../../../src/injector/types.js'

type GraphNode = {
  genericId?: { nodeId?: number }
  concreteId?: { nodeId?: number }
  pins?: Array<{
    clientExecNode?: { kind?: string | number; index?: number }
    compositePinIndex?: number
    value?: { bString?: { val?: string } }
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

function listenerSummary(graph: NodeGraph) {
  assert.equal(graph.nodes?.length, 1, 'donor graph must contain exactly one listener node')
  const node = graph.nodes[0]
  const monitorId = Number(node.genericId?.nodeId)
  assert(Number.isFinite(monitorId), 'listener genericId is missing')
  assert.equal(Number(node.concreteId?.nodeId), monitorId, 'genericId/concreteId mismatch')
  assert.equal(node.signalVersion, 1, 'unexpected signalVersion')
  assert.equal(node.pins?.length, 1, 'listener must have only the signal-name pin')
  const pin = node.pins[0]
  const signalName = pin.value?.bString?.val
  assert(signalName, 'signal name is missing')
  assert.equal(Number(pin.clientExecNode?.index), 1, 'unexpected ClientSignal index')
  return {
    signalName,
    monitorId,
    signalVersion: node.signalVersion,
    signalPinIndex: Number(pin.compositePinIndex)
  }
}

function usage(): never {
  console.error(
    'Usage: npx tsx replay-listener-signal.ts <donor.gil> <target.gil> <graphId> <out.gia> <out.gil> [signalName monitorId signalPinIndex]'
  )
  process.exit(1)
}

const [
  donorPath,
  targetPath,
  graphIdText,
  giaPath,
  outGilPath,
  signalName,
  monitorIdText,
  signalPinIndexText
] = process.argv.slice(2)
const graphId = Number(graphIdText)
if (!donorPath || !targetPath || !Number.isFinite(graphId) || !giaPath || !outGilPath) usage()
const overrides = [signalName, monitorIdText, signalPinIndexText]
if (overrides.some(Boolean) && !overrides.every(Boolean)) usage()
for (const output of [giaPath, outGilPath]) {
  if (fs.existsSync(output)) throw new Error(`refusing to overwrite: ${output}`)
  fs.mkdirSync(path.dirname(output), { recursive: true })
}

const donorBytes = fs.readFileSync(donorPath)
const targetBytes = fs.readFileSync(targetPath)
const donorGraph = readGraph(donorPath, graphId)
const candidateGraph = structuredClone(donorGraph)
if (signalName) {
  const monitorId = Number(monitorIdText)
  const signalPinIndex = Number(signalPinIndexText)
  assert(Number.isFinite(monitorId), 'invalid monitorId override')
  assert(Number.isFinite(signalPinIndex), 'invalid signalPinIndex override')
  const node = candidateGraph.nodes?.[0]
  assert(node?.genericId && node.concreteId && node.pins?.[0], 'invalid donor listener')
  node.genericId.nodeId = monitorId
  node.concreteId.nodeId = monitorId
  node.pins[0].value!.bString!.val = signalName
  node.pins[0].compositePinIndex = signalPinIndex
}
const listener = listenerSummary(candidateGraph)
const { rootMessage, nodeGraphMessage } = loadGiaProto()
const fileName = path.basename(giaPath, path.extname(giaPath))
const root = rootMessage.create({
  graph: {
    id: { class: 5, type: 0, id: graphId },
    name: donorGraph.name,
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
const result = createInjector({ lang: 'zh-CN' }).injectBytes({
  gilBytes: targetBytes,
  giaBytes,
  targetId: graphId,
  skipNonEmptyCheck: true
})
fs.writeFileSync(giaPath, giaBytes, { flag: 'wx' })
fs.writeFileSync(outGilPath, result.bytes, { flag: 'wx' })

const replayGraph = readGraph(outGilPath, graphId)
assert.deepEqual(listenerSummary(replayGraph), listener)
assert.deepEqual(
  Buffer.from(nodeGraphMessage.encode(replayGraph as never).finish()),
  Buffer.from(nodeGraphMessage.encode(candidateGraph as never).finish()),
  'replayed NodeGraph differs from candidate'
)

console.log(
  JSON.stringify(
    {
      status: 'PASS',
      graphId,
      graphName: donorGraph.name,
      listener,
      donor: { path: donorPath, sha256: sha256(donorBytes) },
      target: { path: targetPath, sha256: sha256(targetBytes) },
      gia: { path: giaPath, sha256: sha256(giaBytes) },
      output: { path: outGilPath, sha256: sha256(result.bytes) },
      validation: 'strict NodeGraph protobuf re-encode equality'
    },
    null,
    2
  )
)
