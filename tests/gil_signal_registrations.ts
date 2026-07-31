import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { readRegisteredSignalsFromGil } from '../src/cli/gil_signals.js'
import { registerSignalInGil } from '../src/cli/gil_signal_registrations.js'
import { parseWireMessage, printableWireText, type WireField } from '../src/cli/static_assembly/wire.js'

const [beforePath, editorAfterPath] = process.argv.slice(2)
if (!beforePath || !editorAfterPath) {
  throw new Error('Usage: tsx tests/gil_signal_registrations.ts <before.gil> <editor-after.gil>')
}

const before = new Uint8Array(readFileSync(beforePath))
const editorAfter = new Uint8Array(readFileSync(editorAfterPath))
const signal = {
  name: '信号_1_测试',
  params: [
    { name: '参数_1', type: 'int' as const },
    { name: '参数_2', type: 'entity' as const },
    { name: '参数_3', type: 'bool_list' as const }
  ],
  sendId: 1610612747,
  monitorId: 1610612748,
  serverId: 1610612749
}

const generated = registerSignalInGil({
  bytes: before,
  templateBytes: editorAfter,
  templateSignalName: signal.name,
  signal
})

function top10(bytes: Uint8Array): WireField[] {
  const payload = parseWireMessage(bytes.slice(20, -4))
  assert.ok(payload)
  const field = payload.find((entry) => entry.number === 10 && entry.wire === 2)
  assert.ok(field)
  const top = parseWireMessage(field.value as Uint8Array)
  assert.ok(top)
  return top
}

function definitionNodeId(field: WireField): number | undefined {
  if (field.number !== 2 || field.wire !== 2) return undefined
  const wrapper = parseWireMessage(field.value as Uint8Array)
  const inner = wrapper?.find((entry) => entry.number === 1 && entry.wire === 2)
  if (!inner) return undefined
  const root = parseWireMessage(inner.value as Uint8Array)
  const id = root?.find((entry) => entry.number === 4 && entry.wire === 2)
  if (!id) return undefined
  const generic = parseWireMessage(id.value as Uint8Array)?.find((entry) => entry.number === 1 && entry.wire === 2)
  const identity = generic && parseWireMessage(generic.value as Uint8Array)
  return identity?.find((entry) => entry.number === 5)?.value as number | undefined
}

function entryTexts(data: Uint8Array): string[] {
  const out: string[] = []
  const visit = (bytes: Uint8Array) => {
    for (const entry of parseWireMessage(bytes) ?? []) {
      if (entry.wire !== 2) continue
      const text = printableWireText(entry.value as Uint8Array)
      if (text !== undefined) out.push(text)
      else visit(entry.value as Uint8Array)
    }
  }
  visit(data)
  return out
}

const beforeTop = top10(before)
const generatedTop = top10(generated.bytes)
const editorTop = top10(editorAfter)

// --- layer 1: field 2 GraphUnit definitions ---
const beforeDefs = beforeTop.filter((field) => field.number === 2)
const generatedDefs = generatedTop.filter((field) => field.number === 2)
const editorDefs = editorTop.filter((field) => field.number === 2)
assert.equal(generatedDefs.length, beforeDefs.length + 3, 'three new GraphUnit definitions appended')

const beforeById = new Map(beforeDefs.map((field) => [definitionNodeId(field), field]))
const generatedById = new Map(generatedDefs.map((field) => [definitionNodeId(field), field]))
const editorById = new Map(editorDefs.map((field) => [definitionNodeId(field), field]))

// Existing definitions must stay byte-identical to the source map.
for (const [id, field] of beforeById) {
  assert.ok(generatedById.has(id), `existing definition id ${id} kept`)
  assert.deepEqual(
    Buffer.from(generatedById.get(id)!.value as Uint8Array),
    Buffer.from(field.value as Uint8Array),
    `existing definition id ${id} unchanged`
  )
}

// New definitions must be byte-identical to the editor's own new definitions.
for (const id of [signal.sendId, signal.monitorId, signal.serverId]) {
  const generatedField = generatedById.get(id)
  const editorField = editorById.get(id)
  assert.ok(generatedField, `new definition id ${id} present`)
  assert.ok(editorField, `editor new definition id ${id} present`)
  assert.deepEqual(
    Buffer.from(generatedField.value as Uint8Array),
    Buffer.from(editorField.value as Uint8Array),
    `new definition id ${id} matches editor bytes`
  )
}

// --- layer 2: field 5 signal registry index ---
function signalIndex(top: WireField[]): WireField[] {
  const field = top.find((entry) => entry.number === 5 && entry.wire === 2)
  assert.ok(field, 'signal registry field 10.5')
  const fields = parseWireMessage(field.value as Uint8Array)
  assert.ok(fields)
  return fields
}

const beforeIndex = signalIndex(beforeTop)
const generatedIndex = signalIndex(generatedTop)
const editorIndex = signalIndex(editorTop)

// Top-level identities: the three new node ids appended after the existing three.
assert.equal(generatedIndex.filter((field) => field.number === 2).length, 6)
assert.deepEqual(
  generatedIndex
    .filter((field) => field.number === 2)
    .map((field) => Buffer.from(field.value as Uint8Array)),
  editorIndex
    .filter((field) => field.number === 2)
    .map((field) => Buffer.from(field.value as Uint8Array)),
  'top-level signal identities match editor after'
)

// Entries: existing entry byte-identical to source; new entry byte-identical to editor.
const entryOf = (index: WireField[], name: string): WireField => {
  const entry = index.find(
    (field) => field.number === 3 && entryTexts(field.value as Uint8Array)[0] === name
  )
  assert.ok(entry, `registry entry ${name}`)
  return entry
}
assert.deepEqual(
  Buffer.from(entryOf(generatedIndex, 'cube_turn').value as Uint8Array),
  Buffer.from(entryOf(beforeIndex, 'cube_turn').value as Uint8Array),
  'cube_turn registry entry unchanged from source'
)
assert.deepEqual(
  Buffer.from(entryOf(generatedIndex, signal.name).value as Uint8Array),
  Buffer.from(entryOf(editorIndex, signal.name).value as Uint8Array),
  'new registry entry matches editor bytes'
)

// --- layer 3: read-back through the existing extractor ---
const tempPath = `/tmp/gsts-signal-registration-test-${process.pid}.gil`
await import('node:fs/promises').then(({ writeFile, unlink }) =>
  writeFile(tempPath, generated.bytes).then(async () => {
    try {
      const readBack = readRegisteredSignalsFromGil(tempPath).find((entry) => entry.name === signal.name)
      assert.ok(readBack, 'new signal readable back')
      assert.equal(readBack.sendId, signal.sendId)
      assert.equal(readBack.monitorId, signal.monitorId)
      assert.equal(readBack.serverId, signal.serverId)
      assert.deepEqual(
        readBack.params.map((param) => ({ name: param.name, type: param.type })),
        signal.params
      )
    } finally {
      await unlink(tempPath)
    }
  })
)

// --- layer 4: duplicate registration rejected ---
assert.throws(
  () =>
    registerSignalInGil({
      bytes: generated.bytes,
      templateBytes: editorAfter,
      templateSignalName: signal.name,
      signal
    }),
  /signal already registered/
)

console.log(
  JSON.stringify({
    status: 'PASS',
    generatedSize: generated.bytes.length,
    editorSize: editorAfter.length,
    newDefinitions: 3,
    registryEntries: 2
  })
)
