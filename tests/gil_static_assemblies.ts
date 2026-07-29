import assert from 'node:assert/strict'
import { copyFileSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { applyStaticAssembly } from '../src/cli/gil_static_assemblies.js'
import { readVarint } from '../src/injector/binary.js'

type WireField = {
  number: number
  wire: number
  value: number | Uint8Array
}

type ExpectedColor = {
  enabled: boolean
  argb: number
  opacity: number
  rgb: number
  overlay: number
  field9?: number
}

const sourceGilPath = process.argv[2]
const prefabId = Number(process.argv[3])
const definitionStart = Number(process.argv[4])
const instanceStart = Number(process.argv[5])

if (!sourceGilPath || ![prefabId, definitionStart, instanceStart].every(Number.isSafeInteger)) {
  throw new Error(
    'Usage: tsx tests/gil_static_assemblies.ts <map.gil> <prefabId> <definitionStart> <instanceStart>'
  )
}

function parse(data: Uint8Array): WireField[] | undefined {
  const fields: WireField[] = []
  let offset = 0
  while (offset < data.length) {
    const key = readVarint(data, offset)
    if (!key || key.value >> 3 === 0) return undefined
    offset = key.next
    const number = key.value >> 3
    const wire = key.value & 7
    if (wire === 0) {
      const value = readVarint(data, offset)
      if (!value) return undefined
      fields.push({ number, wire, value: value.value >>> 0 })
      offset = value.next
    } else if (wire === 1 || wire === 5) {
      const width = wire === 1 ? 8 : 4
      if (offset + width > data.length) return undefined
      fields.push({ number, wire, value: data.slice(offset, offset + width) })
      offset += width
    } else if (wire === 2) {
      const length = readVarint(data, offset)
      if (!length || length.next + length.value > data.length) return undefined
      fields.push({ number, wire, value: data.slice(length.next, length.next + length.value) })
      offset = length.next + length.value
    } else return undefined
  }
  return fields
}

function message(field: WireField): WireField[] {
  assert.equal(field.wire, 2)
  const result = parse(field.value as Uint8Array)
  assert.ok(result)
  return result
}

function nth(fields: readonly WireField[], number: number): WireField {
  const field = fields.find((entry) => entry.number === number)
  assert.ok(field, `missing field ${number}`)
  return field
}

function recordId(record: Uint8Array): number | undefined {
  const first = parse(record)?.[0]
  return first?.number === 1 && first.wire === 0 ? (first.value as number) : undefined
}

function records(top: readonly WireField[], section: number, recordType: number): Uint8Array[] {
  return message(nth(top, section))
    .filter((field) => field.number === recordType && field.wire === 2)
    .map((field) => field.value as Uint8Array)
}

function findRecord(records_: readonly Uint8Array[], id: number): Uint8Array {
  const matches = records_.filter((record) => recordId(record) === id)
  assert.equal(matches.length, 1, `expected one record for ID ${id}`)
  return matches[0]
}

function componentRecords(record: Uint8Array, fieldNumber: number): Uint8Array[] {
  const fields = parse(record)
  assert.ok(fields)
  return fields
    .filter((field) => field.number === fieldNumber && field.wire === 2)
    .map((field) => field.value as Uint8Array)
}

function instanceDefinitionId(record: Uint8Array): number {
  const fields = parse(record)
  assert.ok(fields)
  const reference = message(nth(fields, 2))
  return nth(reference, 1).value as number
}

function findColor(data: Uint8Array, depth = 0): WireField[] | undefined {
  if (depth > 8) return undefined
  const fields = parse(data)
  if (!fields) return undefined
  for (const field of fields) {
    if (field.number === 32 && field.wire === 2) {
      const color = parse(field.value as Uint8Array)
      if (color?.some((child) => child.number === 3)) return color
    }
    if (field.wire === 2) {
      const nested = findColor(field.value as Uint8Array, depth + 1)
      if (nested) return nested
    }
  }
  return undefined
}

function fixed32(field: WireField): number {
  assert.equal(field.wire, 5)
  return Buffer.from(field.value as Uint8Array).readFloatLE()
}

function assertColor(record: Uint8Array, expected: ExpectedColor): void {
  const color = findColor(record)
  assert.ok(color, 'color message not found')
  const enabled = color.find((field) => field.number === 1)
  if (expected.enabled) assert.equal(enabled?.value, 1)
  else assert.equal(enabled, undefined, 'disabled color must omit field 1')
  assert.equal(nth(color, 3).value, expected.argb)
  assert.equal(fixed32(nth(color, 4)), expected.opacity)
  assert.equal(nth(color, 5).value, expected.rgb)
  assert.equal(nth(color, 6).value, expected.overlay)
  assert.equal(color.find((field) => field.number === 9)?.value, expected.field9)
}

function quantizedOpacity(percent: number): number {
  const alpha = Math.round((percent / 100) * 255)
  return Math.fround((alpha / 255) * 100)
}

const tempDir = mkdtempSync(join(tmpdir(), 'gsts-static-assemblies-'))
const gilPath = join(tempDir, 'assembly.gil')
copyFileSync(sourceGilPath, gilPath)
const source = readFileSync(gilPath)

const assemblyName = `自动测试彩色拼装_${Date.now()}`
const result = applyStaticAssembly({
  gilPath,
  assembly: {
    name: assemblyName,
    prefabId,
    templatePrefabId: 1077936131,
    templateInstanceId: 1077936129,
    templateName: '长方体',
    position: [12.5, 1.83551025390625, -6.2],
    color: { enabled: true, rgb: 0xff0000, opacity: 100, overlay: 'overwrite' },
    components: [{ type: 'followMotion', preset: 'fullFollow' }],
    items: [
      {
        resourceId: 10009002,
        position: [-2.5, 0.5, -2],
        color: { enabled: true, rgb: 0xff00ff, opacity: 100, overlay: 'overwrite' }
      },
      {
        resourceId: 10009009,
        position: [-1.5, 0.5, -2],
        color: { enabled: true, rgb: 0x00ffff, opacity: 66, overlay: 'multiply' }
      },
      {
        resourceId: 10009008,
        position: [-0.5, 0.5, -2],
        color: { enabled: true, rgb: 0xff8000, opacity: 33, overlay: 'overwrite' }
      },
      {
        resourceId: 10009010,
        position: [0.5, 0.5, -2],
        color: { enabled: true, rgb: 0xffff00, opacity: 100, overlay: 'multiply' }
      },
      {
        resourceId: 10009011,
        position: [1.5, 0.5, -2],
        color: { enabled: true, rgb: 0x0066ff, opacity: 50, overlay: 'overwrite' }
      },
      {
        resourceId: 10009002,
        position: [2.5, 0.5, -2],
        color: { enabled: false }
      }
    ],
    definitionAuxiliaryIds: Array.from({ length: 6 }, (_, index) => definitionStart + index),
    instanceAuxiliaryIds: Array.from({ length: 6 }, (_, index) => instanceStart + index)
  }
})

assert.equal(result.prefabId, prefabId)
assert.deepEqual(
  result.definitionAuxiliaryIds,
  Array.from({ length: 6 }, (_, index) => definitionStart + index)
)
assert.deepEqual(
  result.instanceAuxiliaryIds,
  Array.from({ length: 6 }, (_, index) => instanceStart + index)
)
assert.equal(readFileSync(gilPath).equals(source), true)
assert.notEqual(Buffer.from(result.bytes).compare(source), 0)
const nameBytes = Buffer.from(assemblyName)
let nameOccurrences = 0
for (let offset = Buffer.from(result.bytes).indexOf(nameBytes); offset >= 0; ) {
  nameOccurrences++
  offset = Buffer.from(result.bytes).indexOf(nameBytes, offset + nameBytes.length)
}
assert.equal(nameOccurrences, 2, 'new assembly name must exist in definition and instance')

const top = parse(result.bytes.slice(20, -4))
assert.ok(top)
const definitions = records(top, 4, 1)
const instances = records(top, 8, 1)
const auxiliaryDefinitions = records(top, 27, 1)
const auxiliaryInstances = records(top, 27, 2)
const createdDefinition = findRecord(definitions, prefabId)
assertColor(createdDefinition, {
  enabled: true,
  argb: 0xffff0000,
  opacity: 100,
  rgb: 0xff0000,
  overlay: 6700,
  field9: 6710
})
const createdInstance = findRecord(instances, prefabId)
assert.equal(instanceDefinitionId(createdInstance), prefabId)
assertColor(createdInstance, {
  enabled: true,
  argb: 0xffff0000,
  opacity: 100,
  rgb: 0xff0000,
  overlay: 6700,
  field9: 6710
})
const expectedFullFollowHex =
  '080910019a0134120b47495f526f6f744e6f64651a0a0d0000803f1d0000803f220028b00930cc083a025a00b21f0ce5ae8ce585a8e8b79fe99a8f'
const definitionComponents = componentRecords(createdDefinition, 8)
const instanceComponents = componentRecords(createdInstance, 7)
assert.equal(Buffer.from(definitionComponents.at(-1)!).toString('hex'), expectedFullFollowHex)
assert.equal(Buffer.from(instanceComponents.at(-1)!).toString('hex'), expectedFullFollowHex)
assert.equal(
  Buffer.from(definitionComponents.at(-1)!).equals(Buffer.from(instanceComponents.at(-1)!)),
  true,
  'component snapshots must match on definition and instance records'
)

const expectedItems: ExpectedColor[] = [
  { enabled: true, argb: 0xffff00ff, opacity: 100, rgb: 0xff00ff, overlay: 6700 },
  {
    enabled: true,
    argb: 0xa800ffff,
    opacity: quantizedOpacity(66),
    rgb: 0x00ffff,
    overlay: 6701
  },
  {
    enabled: true,
    argb: 0x54ff8000,
    opacity: quantizedOpacity(33),
    rgb: 0xff8000,
    overlay: 6700
  },
  { enabled: true, argb: 0xffffff00, opacity: 100, rgb: 0xffff00, overlay: 6701 },
  {
    enabled: true,
    argb: 0x800066ff,
    opacity: quantizedOpacity(50),
    rgb: 0x0066ff,
    overlay: 6700
  },
  { enabled: false, argb: 0xffffffff, opacity: 100, rgb: 0xffffff, overlay: 6700 }
]
for (const [index, expected] of expectedItems.entries()) {
  assertColor(findRecord(auxiliaryDefinitions, definitionStart + index), expected)
  assertColor(findRecord(auxiliaryInstances, instanceStart + index), expected)
}

writeFileSync(gilPath, result.bytes)
assert.throws(
  () =>
    applyStaticAssembly({
      gilPath,
      assembly: {
        name: '冲突 ID',
        prefabId,
        templatePrefabId: 1077936131,
        templateInstanceId: 1077936129,
        templateName: '长方体',
        position: [0, 0, 0],
        items: [{ resourceId: 10009001, position: [0, 0, 0] }],
        definitionAuxiliaryIds: [definitionStart],
        instanceAuxiliaryIds: [instanceStart]
      }
    }),
  /assembly IDs conflict/
)

console.log(
  JSON.stringify(
    {
      sourceGilPath,
      prefabId: result.prefabId,
      definitionAuxiliaryIds: result.definitionAuxiliaryIds,
      instanceAuxiliaryIds: result.instanceAuxiliaryIds,
      sourceUnchanged: true,
      colorWireValidated: true,
      fullFollowComponentWireValidated: true,
      duplicateIdsRejected: true
    },
    null,
    2
  )
)
