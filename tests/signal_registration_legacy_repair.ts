import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { parseArgs } from '../src/cli/assets_signals.js'
import { repairSignalInGil } from '../src/cli/gil_signal_registrations.js'
import { readRegisteredSignalsFromGil } from '../src/cli/gil_signals.js'
import {
  emitWireMessage,
  parseWireMessage,
  printableWireText,
  type WireField
} from '../src/cli/static_assembly/wire.js'
import { buildFile } from '../src/injector/binary.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const fixture = (name: string) =>
  new Uint8Array(fs.readFileSync(path.join(here, 'fixtures/signals', name)))
const malformed = fixture('cube-turn-malformed-legacy.gil')
const donor = fixture('cube-turn-donor.gil')
const parse = (bytes: Uint8Array) =>
  parseWireMessage(bytes) ??
  (() => {
    throw new Error('invalid wire')
  })()
const text = (fields: WireField[], number: number) => {
  const field = fields.find((entry) => entry.number === number && entry.wire === 2)
  return field && printableWireText(field.value as Uint8Array)
}
const contains = (bytes: Uint8Array, expected: string, depth = 0): boolean => {
  if (depth > 10) return false
  const nested = parseWireMessage(bytes)
  return !!nested?.some(
    (field) =>
      field.wire === 2 &&
      (printableWireText(field.value as Uint8Array) === expected ||
        contains(field.value as Uint8Array, expected, depth + 1))
  )
}
const top = (bytes: Uint8Array) => {
  const root = parse(bytes.slice(20, -4))
  return parse(root.find((field) => field.number === 10 && field.wire === 2)!.value as Uint8Array)
}
const definitionId = (wrapper: WireField): number | undefined => {
  if (wrapper.number !== 2 || wrapper.wire !== 2) return undefined
  const wrapperFields = parseWireMessage(wrapper.value as Uint8Array)
  const inner = wrapperFields?.find((field) => field.number === 1 && field.wire === 2)
  if (!inner) return undefined
  const root = parse(inner.value as Uint8Array)
  const id = root.find((field) => field.number === 4 && field.wire === 2)
  if (!id) return undefined
  const ids = parse(id.value as Uint8Array)
  const genericField = ids.find((field) => field.number === 1 && field.wire === 2)
  if (!genericField) return undefined
  const generic = parse(genericField.value as Uint8Array)
  return generic.find((field) => field.number === 5 && field.wire === 0)?.value as
    | number
    | undefined
}
const entry = (bytes: Uint8Array, name: string) => {
  const index = parse(
    top(bytes).find((field) => field.number === 5 && field.wire === 2)!.value as Uint8Array
  )
  return index.find(
    (field) =>
      field.number === 3 && field.wire === 2 && text(parse(field.value as Uint8Array), 3) === name
  )!
}
const definitions = (bytes: Uint8Array) =>
  new Map(
    top(bytes)
      .filter((field) => field.number === 2 && field.wire === 2)
      .map((field) => [definitionId(field), field])
  )
const fieldBytes = (field: WireField) => emitWireMessage([field])
const unrelated = (bytes: Uint8Array) =>
  top(bytes)
    .filter(
      (field) =>
        field.number !== 5 &&
        !(field.number === 2 && [1610612741, 1610612742, 1610612743].includes(definitionId(field)!))
    )
    .map(fieldBytes)

const cli = parseArgs([
  'repair',
  '--gil',
  'target.gil',
  '--target-signal',
  'cube_turn',
  '--template-gil',
  'donor.gil',
  '--template-signal',
  'cube_turn',
  '--param',
  'face:str',
  '--param',
  'direction:str',
  '--output',
  'candidate.gil'
])
assert.equal(cli.command, 'repair')
assert.equal(cli.name, undefined)
assert.throws(
  () =>
    parseArgs([
      'repair',
      '--gil',
      'target.gil',
      '--target-signal',
      'cube_turn',
      '--template-gil',
      'donor.gil',
      '--template-signal',
      'cube_turn',
      '--name',
      'renamed'
    ]),
  /repair preserves signal name and IDs/
)

const malformedPath = `/tmp/gsts-malformed-${process.pid}.gil`
fs.writeFileSync(malformedPath, malformed)
try {
  assert.throws(
    () => readRegisteredSignalsFromGil(malformedPath),
    /signal name pin layout is missing: cube_turn/
  )
} finally {
  fs.rmSync(malformedPath, { force: true })
}

const result = repairSignalInGil({
  bytes: malformed,
  targetSignalName: 'cube_turn',
  templateBytes: donor,
  templateSignalName: 'cube_turn'
})
assert.equal(result.status, 'repaired')
assert.deepEqual(
  fieldBytes(entry(result.bytes, 'cube_turn')),
  fieldBytes(entry(malformed, 'cube_turn'))
)
assert.deepEqual(unrelated(result.bytes), unrelated(malformed))
const repairedDefs = definitions(result.bytes)
const donorDefs = definitions(donor)
for (const id of [1610612741, 1610612742, 1610612743]) {
  assert.deepEqual(fieldBytes(repairedDefs.get(id)!), fieldBytes(donorDefs.get(id)!))
  assert.equal(contains(repairedDefs.get(id)!.value as Uint8Array, 'cube_turn'), true)
}

const output = `/tmp/gsts-repaired-${process.pid}.gil`
fs.writeFileSync(output, result.bytes)
try {
  const signal = readRegisteredSignalsFromGil(output).find((item) => item.name === 'cube_turn')
  assert.ok(signal)
  assert.deepEqual(
    {
      ids: [signal.sendId, signal.monitorId, signal.serverId],
      params: signal.params.map(({ name, type }) => ({ name, type }))
    },
    {
      ids: [1610612741, 1610612742, 1610612743],
      params: [
        { name: 'face', type: 'str' },
        { name: 'direction', type: 'str' }
      ]
    }
  )
} finally {
  fs.rmSync(output, { force: true })
}

const withTop = (bytes: Uint8Array, nextTop: WireField[]) => {
  const root = parse(bytes.slice(20, -4))
  const field10 = root.find((field) => field.number === 10 && field.wire === 2)!
  return buildFile(
    emitWireMessage(
      root.map((field) =>
        field === field10 ? { ...field, value: emitWireMessage(nextTop) } : field
      )
    ),
    { schema: 1, headTag: 0x0326, fileType: 2, tailTag: 0x0679 }
  )
}

const second = repairSignalInGil({
  bytes: result.bytes,
  targetSignalName: 'cube_turn',
  templateBytes: donor,
  templateSignalName: 'cube_turn'
})
assert.equal(second.status, 'already-repaired')
assert.deepEqual(second.bytes, result.bytes)

assert.throws(
  () =>
    repairSignalInGil({
      bytes: malformed,
      targetSignalName: 'cube_turn',
      templateBytes: donor,
      templateSignalName: '信号_1'
    }),
  /template signal name must match target signal/
)
assert.throws(
  () =>
    repairSignalInGil({
      bytes: malformed,
      targetSignalName: 'cube_turn',
      templateBytes: donor,
      templateSignalName: 'cube_turn',
      expectedParams: [
        { name: 'face', type: 'int' },
        { name: 'direction', type: 'str' }
      ]
    }),
  /target signal schema mismatch/
)

const donorTop = top(donor)
const donorIndex = donorTop.find((field) => field.number === 5 && field.wire === 2)!
const donorIndexFields = parse(donorIndex.value as Uint8Array)
const donorEntry = donorIndexFields.find(
  (field) =>
    field.number === 3 &&
    field.wire === 2 &&
    text(parse(field.value as Uint8Array), 3) === 'cube_turn'
)!
const donorEntryFields = parse(donorEntry.value as Uint8Array)
const donorParam = donorEntryFields.find((field) => field.number === 4 && field.wire === 2)!
const donorParamFields = parse(donorParam.value as Uint8Array)
const mismatchedParam = {
  ...donorParam,
  value: emitWireMessage(
    donorParamFields.map((field) =>
      field.number === 2 && field.wire === 0 ? { ...field, value: 3 } : field
    )
  )
}
const mismatchedEntry = {
  ...donorEntry,
  value: emitWireMessage(
    donorEntryFields.map((field) => (field === donorParam ? mismatchedParam : field))
  )
}
const mismatchedDonor = withTop(
  donor,
  donorTop.map((field) =>
    field === donorIndex
      ? {
          ...field,
          value: emitWireMessage(
            donorIndexFields.map((item) => (item === donorEntry ? mismatchedEntry : item))
          )
        }
      : field
  )
)
assert.throws(
  () =>
    repairSignalInGil({
      bytes: malformed,
      targetSignalName: 'cube_turn',
      templateBytes: mismatchedDonor,
      templateSignalName: 'cube_turn'
    }),
  /template signal schema mismatch/
)
const donorWithoutNamePins = withTop(
  donor,
  top(donor).map((field) => {
    if (!definitions(donor).has(definitionId(field))) return field
    const wrapper = parse(field.value as Uint8Array)
    const inner = wrapper.find((item) => item.number === 1 && item.wire === 2)!
    const definition = parse(inner.value as Uint8Array)
    return {
      ...field,
      value: emitWireMessage(
        wrapper.map((item) =>
          item === inner
            ? {
                ...item,
                value: emitWireMessage(definition.filter((sub) => sub.number !== 106))
              }
            : item
        )
      )
    }
  })
)
assert.throws(
  () =>
    repairSignalInGil({
      bytes: malformed,
      targetSignalName: 'cube_turn',
      templateBytes: donorWithoutNamePins,
      templateSignalName: 'cube_turn'
    }),
  /template signal name pin layout is missing/
)

const missingDefinitionTop = top(malformed).filter((field) => definitionId(field) !== 1610612743)
const rebuilt = withTop(malformed, missingDefinitionTop)
assert.throws(
  () =>
    repairSignalInGil({
      bytes: rebuilt,
      targetSignalName: 'cube_turn',
      templateBytes: donor,
      templateSignalName: 'cube_turn'
    }),
  /target signal definition cannot be uniquely located: 1610612743/
)
const duplicateDefinition = withTop(malformed, [
  ...top(malformed),
  definitions(malformed).get(1610612741)!
])
assert.throws(
  () =>
    repairSignalInGil({
      bytes: duplicateDefinition,
      targetSignalName: 'cube_turn',
      templateBytes: donor,
      templateSignalName: 'cube_turn'
    }),
  /target signal definition cannot be uniquely located: 1610612741/
)

console.log('signal legacy donor repair: PASS')
