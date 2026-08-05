#!/usr/bin/env tsx
/**
 * Parameterized DATA-flow connection experiment verifier + isomorphic replay.
 *
 * Clone of verify-control-flow-experiment.ts with the wire side flipped:
 * control flow hangs on the SOURCE OutFlow, data flow hangs on the TARGET InParam
 * (source OutParam is NOT instantiated for Fixed nodes, observed dataflow-case1).
 *
 *   npx tsx verify-data-flow-experiment.ts <experiment-dir> \
 *     --graph-id 1073741836 --source 12 --target 24 \
 *     --target-index 1 --target-type 3 --expected-pin-raw <hex> \
 *     --before-hash <sha256> --after-hash <sha256> \
 *     [--source-generic 8 --target-generic 66]
 *
 * Checks (raw before/after under <experiment-dir>/raw/):
 *   1. hashes match the locked snapshots (when provided)
 *   2. node set unchanged, only --target changed
 *   3. --target gains one InParam pin: i1/i2 kind=InParam with index=--target-index
 *      (0 = omitted), type=--target-type, connects[0].id = --source, connect/connect2
 *      kind=OutParam without index
 *   4. new pin raw bytes equal --expected-pin-raw (when provided)
 *   5. --source GraphNode raw bytes byte-identical (source OutParam NOT instantiated)
 *   6. root-level diff is reported (not asserted; root 46 equal-length INSUFFICIENT is known)
 *   7. donor verify: the UNMODIFIED before graph is verified first; candidate may only
 *      fail with exactly the same donor error (bounded shim, e.g. node 32
 *      contextDeclaration.kind=7). Production injector is never modified.
 *   8. manual isomorphic replay: candidate constructed from before (new InParam pin
 *      appended to the target node) must encode to byte-identical NodeGraph as real
 *      after; a formal GIA is built and injected into a temporary GIL copy; readback
 *      must equal candidate and after. No real-map write.
 *
 * Outputs: <experiment-dir>/verify/validation.json,
 *          <experiment-dir>/verify/manual-flow-v1.{gia,gil}, verify/result.json
 *
 * readVarint returns { value, next } where next is an ABSOLUTE cursor; never `+=` it.
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { readGilPayloadFields } from '/home/h/genshin-ts/src/cli/gil_extract_utils.js'
import { buildFile, parseMessage, readVarint } from '/home/h/genshin-ts/src/injector/binary.js'
import { createInjector } from '/home/h/genshin-ts/src/injector/index.js'
import { loadGiaProto } from '/home/h/genshin-ts/src/injector/proto.js'

type Field = { field: number; wire: number; data: Uint8Array; value?: number }

function topFields(buffer: Uint8Array): Field[] {
  const fields: Field[] = []
  let position = 0
  while (position < buffer.length) {
    const key = readVarint(buffer, position)
    if (!key) throw new Error('invalid field key')
    position = key.next // ABSOLUTE cursor, not +=
    const field = key.value >> 3
    const wire = key.value & 7
    if (wire === 0) {
      const value = readVarint(buffer, position)
      if (!value) throw new Error(`invalid varint field ${field}`)
      position = value.next
      fields.push({ field, wire, data: new Uint8Array(), value: value.value })
    } else if (wire === 2) {
      const length = readVarint(buffer, position)
      if (!length) throw new Error(`invalid length field ${field}`)
      position = length.next
      const end = position + Number(length.value)
      if (end > buffer.length) throw new Error(`field ${field} overruns message`)
      fields.push({ field, wire, data: buffer.subarray(position, end), value: undefined })
      position = end
    } else if (wire === 1 || wire === 5) {
      const width = wire === 1 ? 8 : 4
      const end = position + width
      if (end > buffer.length) throw new Error(`field ${field} overruns message`)
      fields.push({ field, wire, data: buffer.subarray(position, end), value: undefined })
      position = end
    } else {
      throw new Error(`unsupported wire type ${wire} at ${position}`)
    }
  }
  return fields
}

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {}
  let positional: string[] = []
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i]
    if (!flag.startsWith('--')) {
      positional.push(flag)
      continue
    }
    const value = argv[i + 1]
    if (value === undefined || value.startsWith('--')) throw new Error(`missing value for ${flag}`)
    out[flag.slice(2)] = value
    i++
  }
  if (positional.length > 0) out.dir = positional[0]
  return out
}

const here = path.dirname(fileURLToPath(import.meta.url))
const args = parseArgs(process.argv.slice(2))
const experiment = path.resolve(args.dir ?? '.')
const GRAPH_ID = Number(args['graph-id'] ?? 0)
const SOURCE = Number(args.source ?? 0)
const TARGET = Number(args.target ?? 0)
const TARGET_INDEX = Number(args['target-index'] ?? 0) // expected InParam index on target pin; 0 = omitted
const TARGET_TYPE = Number(args['target-type'] ?? 0) // expected InParam type (proto type id, e.g. Int=3, Flt=5)
type Wire = { source: number; target: number; index: number; type: number; sourceOutIndex: number }
// --wires "13:16:1:5:1,12:24:2:3" (source:target:targetIndex:targetType[:sourceOutIndex],
// comma separated; sourceOutIndex = source OutParam ShellIndex, default 0 = omitted in refs)
// for a single save carrying multiple independent data wires; falls back to --source/--target pairs
const WIRES: Wire[] = args.wires
  ? args.wires.split(',').map((w) => {
      const [s, t, i, ty, srcIdx] = w.split(':')
      return { source: Number(s), target: Number(t), index: Number(i), type: Number(ty), sourceOutIndex: srcIdx ? Number(srcIdx) : 0 }
    })
  : [{ source: SOURCE, target: TARGET, index: TARGET_INDEX, type: TARGET_TYPE, sourceOutIndex: 0 }]
const EXPECTED_RAW = (args['expected-pin-raw'] ?? '').replace(/\s+/g, '')
const BEFORE_HASH = args['before-hash'] ?? ''
const AFTER_HASH = args['after-hash'] ?? ''
const SOURCE_GENERIC = args['source-generic'] ? Number(args['source-generic']) : 0
const TARGET_GENERIC = args['target-generic'] ? Number(args['target-generic']) : 0
const beforePath = path.join(experiment, 'raw/before.gil')
const afterPath = path.join(experiment, 'raw/after.gil')
const verifyDir = path.join(experiment, 'verify')
const giaPath = path.join(verifyDir, 'manual-flow-v1.gia')
const gilPath = path.join(verifyDir, 'manual-flow-v1.gil')
const resultPath = path.join(verifyDir, 'result.json')
const validatorPath = path.join(verifyDir, 'validation.json')

if (!GRAPH_ID || WIRES.length === 0 || WIRES.some((w) => !w.source || !w.target || !w.type)) {
  console.error('usage: verify-data-flow-experiment.ts <dir> --graph-id N (--source N --target N --target-index N --target-type N | --wires "s:t:i:ty,...") [--expected-pin-raw hex (single wire)] [--before-hash h] [--after-hash h] [--source-generic N] [--target-generic N]')
  process.exit(2)
}

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')

function readGraph(file: string): any {
  const { payload, fields } = readGilPayloadFields(file)
  const blobs: any[] = []
  parseMessage(payload, 0, payload.length, 0, 0, 0, 0, 0, 0, 0, fields, {
    nodeGraphBlobFields: blobs
  })
  const { nodeGraphMessage } = loadGiaProto()
  for (const blob of blobs) {
    const graph = nodeGraphMessage.decode(payload.subarray(blob.dataStart, blob.dataEnd)) as any
    if (Number(graph.id?.id) === GRAPH_ID) return graph
  }
  throw new Error(`NodeGraph ${GRAPH_ID} not found`)
}

function extractNodeRaw(file: string, nodeIndex: number): Uint8Array {
  const { payload, fields } = readGilPayloadFields(file)
  const blobs: any[] = []
  parseMessage(payload, 0, payload.length, 0, 0, 0, 0, 0, 0, 0, fields, {
    nodeGraphBlobFields: blobs
  })
  for (const blob of blobs) {
    const graphFields = topFields(payload.subarray(blob.dataStart, blob.dataEnd))
    const id = graphFields.find((field) => field.field === 1 && field.wire === 2)
    const graphId = id && topFields(id.data).find((field) => field.field === 5)
    if (Number(graphId?.value) !== GRAPH_ID) continue
    for (const node of graphFields.filter((field) => field.field === 3 && field.wire === 2)) {
      const index = topFields(node.data).find((field) => field.field === 1 && field.wire === 0)
      if (Number(index?.value) === nodeIndex) return node.data
    }
  }
  throw new Error(`node ${nodeIndex} not found`)
}

function writeIdenticalOrNew(file: string, bytes: Uint8Array): void {
  if (fs.existsSync(file) && Buffer.from(fs.readFileSync(file)).equals(Buffer.from(bytes))) return
  fs.writeFileSync(file, bytes)
}

const checks: string[] = []
const ok = (name: string) => {
  checks.push(`PASS ${name}`)
  console.log(`PASS ${name}`)
}

function main(): number {
  const { rootMessage, nodeGraphMessage } = loadGiaProto()

  // 1. hashes
  if (BEFORE_HASH) {
    assert.equal(sha256(new Uint8Array(fs.readFileSync(beforePath))), BEFORE_HASH, 'before hash mismatch')
  }
  if (AFTER_HASH) {
    assert.equal(sha256(new Uint8Array(fs.readFileSync(afterPath))), AFTER_HASH, 'after hash mismatch')
  }
  ok('locked snapshot hashes')

  const beforeGraph = readGraph(beforePath)
  const afterGraph = readGraph(afterPath)
  const byIndex = (graph: any) => new Map(graph.nodes.map((node: any) => [node.nodeIndex, node]))
  const beforeNodes = byIndex(beforeGraph)
  const afterNodes = byIndex(afterGraph)

  // 2. node set stable, only the wire target nodes changed
  const expectedSet = [...beforeNodes.keys()]
  assert.deepEqual(
    [...afterNodes.keys()].sort((a, b) => a - b),
    expectedSet.sort((a, b) => a - b),
    'node set must not change'
  )
  const targets = [...new Set(WIRES.map((w) => w.target))]
  const changed = [...beforeNodes.keys()].filter(
    (i) => JSON.stringify(beforeNodes.get(i)) !== JSON.stringify(afterNodes.get(i))
  )
  assert.deepEqual(changed, targets, `only wire target nodes ${targets.join(',')} may change`)
  ok(`node set stable; only target${targets.length > 1 ? 's' : ''} ${targets.join(',')} changed`)

  const sourceBefore = beforeNodes.get(WIRES[0].source)
  if (SOURCE_GENERIC) assert.equal(Number(sourceBefore.genericId?.nodeId), SOURCE_GENERIC)

  // 3-5. per-wire: target gains one InParam pin; source byte-identical
  for (const wire of WIRES) {
    const targetBefore = beforeNodes.get(wire.target)
    const targetAfter = afterNodes.get(wire.target)
    if (TARGET_GENERIC) assert.equal(Number(targetBefore.genericId?.nodeId), TARGET_GENERIC)
    const beforePins = targetBefore.pins.length
    assert.equal(targetAfter.pins.length, beforePins + 1,
      `wire ${wire.source}->${wire.target}: target must gain exactly one pin`)
    const dataPins = targetAfter.pins.filter(
      (pin: any) =>
        pin.i1?.kind === 3 &&
        (pin.i1?.index == null ? 0 : Number(pin.i1?.index)) === wire.index
    )
    assert.equal(dataPins.length, 1, `exactly one InParam pin with index=${wire.index}`)
    const newPin = dataPins[0]
    assert.equal(newPin.i2?.kind, 3)
    assert.equal((newPin.i2?.index == null ? 0 : Number(newPin.i2?.index)), wire.index, 'i2 mirrors index')
    assert.equal(Number(newPin.type), wire.type, 'InParam type must match wire type')
    assert.equal(newPin.connects.length, 1)
    assert.equal(newPin.connects[0].id, wire.source)
    assert.equal(newPin.connects[0].connect.kind, 4, 'connect = OutParam')
    assert.equal(newPin.connects[0].connect2.kind, 4, 'connect2 = OutParam')
    const srcIdx = wire.sourceOutIndex ?? 0
    assert.equal(newPin.connects[0].connect.index ?? 0, srcIdx,
      `source OutParam ref index must be ${srcIdx === 0 ? 'absent' : srcIdx}`)
    assert.equal(newPin.connects[0].connect2.index ?? 0, srcIdx,
      `source OutParam ref index must be ${srcIdx === 0 ? 'absent' : srcIdx} (i2)`)
    ok(`target InParam[${wire.index}] type=${wire.type} <- source ${wire.source}, OutParam ref index=${srcIdx}`)

    // 4. new pin raw bytes (single-wire mode only)
    if (WIRES.length === 1 && EXPECTED_RAW) {
      const targetRaw = extractNodeRaw(afterPath, wire.target)
      const targetPins = topFields(targetRaw).filter((field) => field.field === 4 && field.wire === 2)
      assert.equal(targetPins.length, targetAfter.pins.length)
      const actual = Buffer.from(targetPins[targetAfter.pins.indexOf(newPin)].data).toString('hex')
      assert.equal(actual, EXPECTED_RAW, 'new pin raw mismatch')
      ok('new pin raw bytes match expected encoding')
    }

    // 5. source byte-identical (data wire hangs on target; source OutParam NOT instantiated)
    assert.ok(
      Buffer.from(extractNodeRaw(beforePath, wire.source)).equals(
        Buffer.from(extractNodeRaw(afterPath, wire.source))),
      `source node ${wire.source} must be byte-identical`
    )
    ok(`source node ${wire.source} byte-identical (no OutParam pin instantiated)`)
  }

  // 6. root-level diff report (informational)
  const beforePayload = readGilPayloadFields(beforePath).payload
  const afterPayload = readGilPayloadFields(afterPath).payload
  const rootDiff = topFields(beforePayload)
    .map((field, i) => [field, topFields(afterPayload)[i]] as const)
    .filter(([l, r]) => l.field !== r.field || l.wire !== r.wire || !Buffer.from(l.data).equals(Buffer.from(r.data)))
  console.log(
    'INFO root deltas:',
    rootDiff.map(([l, r]) => `#${l.field} ${l.data.length}B->${r.data.length}B`).join(', ')
  )

  // 7. donor verify (unmodified before) + bounded candidate shim
  const originalVerify = nodeGraphMessage.verify
  const donorError = originalVerify.call(nodeGraphMessage, beforeGraph)
  console.log('INFO donor verify error:', donorError ?? 'none')
  const candidateGraph = structuredClone(beforeGraph)
  for (const wire of WIRES) {
    const target = candidateGraph.nodes.find((node: any) => Number(node.nodeIndex) === wire.target)
    assert(target, `target node ${wire.target} missing`)
    // data wire hangs on target side: append new InParam pin with connects -> source
    // ponytail: append at tail; multi-pin target insertion position unverified yet
    target.pins.push({
      i1: { kind: 3, index: wire.index || undefined },
      i2: { kind: 3, index: wire.index || undefined },
      type: wire.type,
      connects: [{
        id: wire.source,
        connect: { kind: 4, index: wire.sourceOutIndex || undefined },
        connect2: { kind: 4, index: wire.sourceOutIndex || undefined }
      }]
    })
  }
  const candidateError = originalVerify.call(nodeGraphMessage, candidateGraph)
  if (donorError === null) {
    assert.equal(candidateError, null, `candidate must verify when donor verifies, got: ${candidateError}`)
  } else {
    assert.equal(candidateError, donorError,
      `candidate must fail with exactly the donor gap ('${donorError}'), got: ${candidateError}`)
  }
  if (donorError !== null) {
    // bounded shim: tolerate only the exact donor gap, restored afterwards
    ;(nodeGraphMessage as any).verify = (message: any) => {
      const error = originalVerify.call(nodeGraphMessage, message)
      if (error === donorError) return null
      return error
    }
  }
  ok(`donor verify ${donorError === null ? 'clean' : `gap: ${donorError}`}; candidate only carries same gap`)

  // 8. candidate must encode byte-identical to real after
  const { nodeGraphMessage: ngm } = loadGiaProto()
  const candidateBytes = ngm.encode(candidateGraph).finish()
  const afterBytes = ngm.encode(afterGraph).finish()
  assert.ok(Buffer.from(candidateBytes).equals(Buffer.from(afterBytes)), 'candidate != real after')
  ok('manual candidate NodeGraph bytes == real after')

  // 9. formal GIA + temporary injection + readback
  const beforeBytes = new Uint8Array(fs.readFileSync(beforePath))
  const fileName = path.basename(giaPath, '.gia')
  const timestamp = Math.floor(fs.statSync(afterPath).mtimeMs / 1000)
  const root = rootMessage.create({
    graph: {
      id: { class: 5, type: 0, id: GRAPH_ID },
      name: candidateGraph.name,
      which: 9,
      graph: { inner: { graph: candidateGraph } }
    },
    filePath: `100000001-${timestamp}-${GRAPH_ID + 1}-\\${fileName}`,
    gameVersion: '6.7.0'
  })
  const giaBytes = buildFile(rootMessage.encode(root).finish(), {
    schema: 1,
    headTag: 0x0326,
    fileType: 3,
    tailTag: 0x0679
  })
  const header = new DataView(giaBytes.buffer, giaBytes.byteOffset, giaBytes.byteLength)
  assert.equal(header.getUint32(12, false), 3)
  const decodedRoot = rootMessage.decode(giaBytes.subarray(20, giaBytes.length - 4)) as any
  assert.equal(Number(decodedRoot.graph?.id?.id), GRAPH_ID)
  assert.equal(Number(decodedRoot.graph?.graph?.inner?.graph?.id?.id), GRAPH_ID)
  assert.equal(decodedRoot.filePath, root.filePath)
  assert.equal(decodedRoot.gameVersion, '6.7.0')
  let injected: ReturnType<ReturnType<typeof createInjector>['injectBytes']>
  try {
    injected = createInjector({ lang: 'zh-CN' }).injectBytes({
      gilBytes: beforeBytes,
      giaBytes,
      targetId: GRAPH_ID,
      skipNonEmptyCheck: true
    })
  } finally {
    ;(nodeGraphMessage as any).verify = originalVerify
  }
  fs.mkdirSync(verifyDir, { recursive: true })
  writeIdenticalOrNew(giaPath, giaBytes)
  writeIdenticalOrNew(gilPath, injected.bytes)

  const replayGraph = readGraph(gilPath)
  const replayBytes = ngm.encode(replayGraph).finish()
  assert.ok(Buffer.from(replayBytes).equals(Buffer.from(candidateBytes)))
  assert.ok(Buffer.from(replayBytes).equals(Buffer.from(afterBytes)))
  ok('temporary replay readback == candidate == real after')

  const result = {
    status: 'PASS',
    checks,
    graphId: GRAPH_ID,
    sourceNode: SOURCE,
    targetNode: TARGET,
    targetPinIndex: TARGET_INDEX,
    targetPinType: TARGET_TYPE,
    donorVerify: donorError,
    rootDeltas: rootDiff.map(([l, r]) => ({ field: l.field, beforeBytes: l.data.length, afterBytes: r.data.length })),
    formalGia: {
      path: giaPath,
      sha256: sha256(giaBytes),
      fileType: header.getUint32(12, false),
      rootId: Number(decodedRoot.graph?.id?.id),
      innerGraphId: Number(decodedRoot.graph?.graph?.inner?.graph?.id?.id),
      filePath: decodedRoot.filePath,
      gameVersion: decodedRoot.gameVersion
    },
    temporaryGil: { path: gilPath, sha256: sha256(injected.bytes) },
    validation: 'candidate, temporary replay, and real-after NodeGraph protobuf bytes are identical',
    evidenceBoundary: 'no real-map write, editor import, or game validation'
  }
  fs.mkdirSync(path.dirname(validatorPath), { recursive: true })
  fs.writeFileSync(validatorPath, JSON.stringify(result, null, 2))
  writeIdenticalOrNew(resultPath, Buffer.from(`${JSON.stringify(result, null, 2)}\n`))
  console.log('VALIDATOR ACCEPT', checks.length, '/', checks.length)
  return 0
}

try {
  process.exit(main())
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`VALIDATOR REJECT: ${message}`)
  console.error((error as Error).stack ?? '')
  process.exit(1)
}
