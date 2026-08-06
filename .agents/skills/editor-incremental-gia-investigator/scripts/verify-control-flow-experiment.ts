#!/usr/bin/env tsx
/**
 * Parameterized control-flow connection experiment verifier + isomorphic replay.
 *
 * One command replaces the per-round handwritten validator + replay pair for
 * ordinary NodeGraph SysCall FlowOut->FlowIn experiments:
 *
 *   npx tsx verify-control-flow-experiment.ts <experiment-dir> \
 *     --graph-id 1073741836 --source 11 --target 27 \
 *     --outflow-index 2 --expected-pin-raw <hex> \
 *     --before-hash <sha256> --after-hash <sha256> \
 *     [--target-index N]  expected InFlow index on target refs (default 0 = omitted) \
 *     [--allow-added N]    target node newly placed (not in before); node set = before + N \
 *     [--sync-extra-pin 1]  allow exactly ONE pre-existing source pin value to change\
 *                           (editor-side list sync, e.g. cases); candidate takes after value \
 *     [--source-generic 3 --source-concrete 4 --target-generic 70]
 *
 * Checks (raw before/after under <experiment-dir>/raw/):
 *   1. hashes match the locked snapshots (when provided)
 *   2. node set unchanged, only --source changed
 *   3. --source gains one OutFlow pin carrying explicit index=--outflow-index,
 *      connects[0].id = --target, connect/connect2 kind=InFlow without index
 *   4. new pin raw bytes equal --expected-pin-raw (when provided)
 *   5. --target GraphNode raw bytes byte-identical (no InFlow pin instantiated)
 *   6. root-level diff is reported (not asserted; root 46 equal-length INSUFFICIENT is known)
 *   7. donor verify: the UNMODIFIED before graph is verified first; candidate may only
 *      fail with exactly the same donor error (bounded shim, e.g. node 32
 *      contextDeclaration.kind=7). Production injector is never modified.
 *   8. manual isomorphic replay: candidate constructed from before (new OutFlow pin
 *      inserted after the last existing OutFlow, before data pins) must encode to
 *      byte-identical NodeGraph as real after; a formal GIA is built and injected into
 *      a temporary GIL copy; readback must equal candidate and after. No real-map write.
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
const OUTFLOW_INDEX = Number(args['outflow-index'] ?? 1)
const TARGET_INDEX = Number(args['target-index'] ?? 0) // expected InFlow index on target refs; 0 = omitted
const EXPECTED_RAW = (args['expected-pin-raw'] ?? '').replace(/\s+/g, '')
const BEFORE_HASH = args['before-hash'] ?? ''
const AFTER_HASH = args['after-hash'] ?? ''
const SOURCE_GENERIC = args['source-generic'] ? Number(args['source-generic']) : 0
const SOURCE_CONCRETE = args['source-concrete'] ? Number(args['source-concrete']) : 0
const TARGET_GENERIC = args['target-generic'] ? Number(args['target-generic']) : 0
const ALLOW_ADDED = args['allow-added'] ? Number(args['allow-added']) : 0 // newly placed target node (not in before)
const SYNC_EXTRA_PIN = args['sync-extra-pin'] === '1' // allow exactly one pre-existing source pin value change
const beforePath = path.join(experiment, 'raw/before.gil')
const afterPath = path.join(experiment, 'raw/after.gil')
const verifyDir = path.join(experiment, 'verify')
const giaPath = path.join(verifyDir, 'manual-flow-v1.gia')
const gilPath = path.join(verifyDir, 'manual-flow-v1.gil')
const resultPath = path.join(verifyDir, 'result.json')
const validatorPath = path.join(verifyDir, 'validation.json')

if (!GRAPH_ID || !SOURCE || !TARGET) {
  console.error('usage: verify-control-flow-experiment.ts <dir> --graph-id N --source N --target N [--outflow-index N] [--target-index N] [--allow-added N] [--sync-extra-pin 1] [--expected-pin-raw hex] [--before-hash h] [--after-hash h] [--source-generic N] [--source-concrete N] [--target-generic N]')
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

  // 2. node set stable (plus declared added node), only source changed
  const expectedSet = [...beforeNodes.keys()]
  if (ALLOW_ADDED) expectedSet.push(ALLOW_ADDED)
  assert.deepEqual(
    [...afterNodes.keys()].sort((a, b) => a - b),
    expectedSet.sort((a, b) => a - b),
    'node set must not change (besides declared added node)'
  )
  if (ALLOW_ADDED) {
    const added = afterNodes.get(ALLOW_ADDED)
    assert(added, `declared added node ${ALLOW_ADDED} missing in after`)
    assert.equal(Number(added.genericId?.nodeId), TARGET_GENERIC,
      'added node genericId must match --target-generic')
  }
  const changed = [...beforeNodes.keys()].filter(
    (i) => JSON.stringify(beforeNodes.get(i)) !== JSON.stringify(afterNodes.get(i))
  )
  assert.deepEqual(changed, [SOURCE], `only source node ${SOURCE} may change`)
  ok(`node set stable${ALLOW_ADDED ? `; added node ${ALLOW_ADDED}` : ''}; only source changed`)

  const sourceBefore = beforeNodes.get(SOURCE)
  const sourceAfter = afterNodes.get(SOURCE)
  if (SOURCE_GENERIC) assert.equal(Number(sourceBefore.genericId?.nodeId), SOURCE_GENERIC)
  if (SOURCE_CONCRETE) assert.equal(Number(sourceBefore.concreteId?.nodeId), SOURCE_CONCRETE)
  if (TARGET_GENERIC) {
    const targetId = ALLOW_ADDED && TARGET === ALLOW_ADDED
      ? afterNodes.get(TARGET)?.genericId?.nodeId
      : beforeNodes.get(TARGET)?.genericId?.nodeId
    assert.equal(Number(targetId), TARGET_GENERIC)
  }
  const beforePins = sourceBefore.pins.length
  assert.equal(sourceAfter.pins.length, beforePins + 1, 'source must gain exactly one pin')

  // 3. new OutFlow pin semantics
  const flowPins = sourceAfter.pins.filter(
    (pin: any) => pin.i1?.kind === 2 && (pin.i1?.index ?? 0) === OUTFLOW_INDEX
  )
  assert.equal(flowPins.length, 1, `exactly one OutFlow pin with index=${OUTFLOW_INDEX}`)
  const newPin = flowPins[0]
  assert.equal(newPin.i2?.kind, 2)
  assert.equal((newPin.i2?.index ?? 0), OUTFLOW_INDEX, 'i2 mirrors explicit index')
  assert.equal(newPin.connects.length, 1)
  assert.equal(newPin.connects[0].id, TARGET)
  assert.equal(newPin.connects[0].connect.kind, 1, 'connect = InFlow')
  assert.equal(newPin.connects[0].connect2.kind, 1, 'connect2 = InFlow')
  assert.equal(newPin.connects[0].connect.index ?? 0, TARGET_INDEX,
    `target InFlow index must be ${TARGET_INDEX === 0 ? 'absent' : TARGET_INDEX}`)
  assert.equal(newPin.connects[0].connect2.index ?? 0, TARGET_INDEX,
    `target InFlow index must be ${TARGET_INDEX === 0 ? 'absent' : TARGET_INDEX} (i2)`)
  ok(`source OutFlow[${OUTFLOW_INDEX}] -> target ${TARGET}, InFlow refs without index`)

  // 4. new pin raw bytes
  const sourceRaw = extractNodeRaw(afterPath, SOURCE)
  const sourcePins = topFields(sourceRaw).filter((field) => field.field === 4 && field.wire === 2)
  assert.equal(sourcePins.length, sourceAfter.pins.length)
  if (EXPECTED_RAW) {
    const actual = Buffer.from(sourcePins[sourceAfter.pins.indexOf(newPin)].data).toString('hex')
    assert.equal(actual, EXPECTED_RAW, 'new pin raw mismatch')
    ok('new pin raw bytes match expected encoding')
  } else {
    console.log(
      'INFO raw of new pin:',
      Buffer.from(sourcePins[sourceAfter.pins.indexOf(newPin)].data).toString('hex')
    )
  }

  // 5. target: byte-identical when pre-existing; no InFlow pin instantiated in either case
  if (ALLOW_ADDED && TARGET === ALLOW_ADDED) {
    const addedRaw = extractNodeRaw(afterPath, TARGET)
    assert.ok(addedRaw.length > 0, 'added target node raw must exist')
    const addedPins = topFields(addedRaw).filter((f) => f.field === 4 && f.wire === 2)
    assert.equal(addedPins.length, 0, 'added target node must not instantiate InFlow pins')
  } else {
    assert.ok(
      Buffer.from(extractNodeRaw(beforePath, TARGET)).equals(Buffer.from(extractNodeRaw(afterPath, TARGET))),
      'target node must be byte-identical'
    )
  }
  ok('target node byte-identical / no InFlow pin instantiated')

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
  const source = candidateGraph.nodes.find((node: any) => Number(node.nodeIndex) === SOURCE)
  assert(source, `source node ${SOURCE} missing`)
  if (ALLOW_ADDED) {
    // newly placed target node is a clean pinless node (asserted above); copy it from after
    // so the replay covers only the connection increment, not editor node placement
    candidateGraph.nodes.push(
      afterGraph.nodes.find((node: any) => Number(node.nodeIndex) === ALLOW_ADDED)
    )
    const order = afterGraph.nodes.map((node: any) => Number(node.nodeIndex))
    candidateGraph.nodes.sort(
      (a: any, b: any) => order.indexOf(Number(a.nodeIndex)) - order.indexOf(Number(b.nodeIndex))
    )
  }
  if (SYNC_EXTRA_PIN) {
    // editor may sync one pre-existing source pin (e.g. cases list grows with new branch);
    // candidate must take the after value so bytes stay identical, still bounded to exactly one
    const afterPins = afterNodes.get(SOURCE).pins.filter(
      (pin: any) => !(pin.i1?.kind === 2 && (pin.i1?.index ?? 0) === OUTFLOW_INDEX)
    )
    assert.equal(afterPins.length, source.pins.length,
      'sync-extra-pin: after must hold before pins + new OutFlow only')
    const diffs = source.pins
      .map((pin: any, i: number) =>
        JSON.stringify(pin) !== JSON.stringify(structuredClone(afterPins[i])) ? i : -1)
      .filter((i: number) => i >= 0)
    assert.equal(diffs.length, 1,
      `sync-extra-pin: exactly one pre-existing pin may change, got ${diffs.length}`)
    source.pins[diffs[0]] = structuredClone(afterPins[diffs[0]])
    ok(`synced changed pre-existing source pin (position ${diffs[0]}) from after`)
  }
  // insert new OutFlow after the last existing OutFlow, before data pins
  const lastOutFlow = source.pins.findLastIndex((pin: any) => pin.i1?.kind === 2)
  source.pins.splice(lastOutFlow + 1, 0, {
    i1: { kind: 2, index: OUTFLOW_INDEX || undefined },
    i2: { kind: 2, index: OUTFLOW_INDEX || undefined },
    connects: [{
      id: TARGET,
      connect: { kind: 1, index: TARGET_INDEX || undefined },
      connect2: { kind: 1, index: TARGET_INDEX || undefined }
    }]
  })
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
    outflowIndex: OUTFLOW_INDEX,
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
