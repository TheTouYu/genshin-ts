import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { applyStaticAssembly } from '../src/cli/gil_static_assemblies.js'
import {
  emitWireMessage,
  nthWireField,
  parseWireMessage,
  wireMessage,
  wireRecordId,
  wireRecords
} from '../src/cli/static_assembly/wire.js'
import { buildFile } from '../src/injector/binary.js'
import {
  buildStaticAssemblyFixture,
  FIXTURE_IDS
} from './fixtures/static-assembly/build_fixture.js'

const source = buildStaticAssemblyFixture()
const directory = mkdtempSync(path.join(tmpdir(), 'gsts-static-assembly-components-'))
const gilPath = path.join(directory, 'fixture.gil')
writeFileSync(gilPath, source)

function createdRecord(bytes: Uint8Array, section: number, id: number): Uint8Array {
  const top = parseWireMessage(bytes.slice(20, -4))
  assert.ok(top)
  const record = wireRecords(top, section, 1).find((value) => wireRecordId(value) === id)
  assert.ok(record)
  return record
}

function componentRecords(record: Uint8Array, fieldNumber: number): Uint8Array[] {
  const fields = parseWireMessage(record)
  assert.ok(fields)
  return fields
    .filter((field) => field.number === fieldNumber && field.wire === 2)
    .map((field) => field.value as Uint8Array)
}

function seedFollowMotionComponent(bytes: Uint8Array): Uint8Array {
  const top = parseWireMessage(bytes.slice(20, -4))!
  for (const [sectionNumber, componentFieldNumber] of [
    [4, 8],
    [8, 7]
  ] as const) {
    const section = wireMessage(nthWireField(top, sectionNumber))
    const expectedOwnerId = sectionNumber === 4 ? FIXTURE_IDS.definition : FIXTURE_IDS.instance
    const record = section.find(
      (field) =>
        field.number === 1 &&
        field.wire === 2 &&
        wireRecordId(field.value as Uint8Array) === expectedOwnerId
    )!
    const recordFields = parseWireMessage(record.value as Uint8Array)!
    recordFields.push({
      number: componentFieldNumber,
      wire: 2,
      value: emitWireMessage([
        { number: 1, wire: 0, value: 9 },
        { number: 2, wire: 0, value: 999 }
      ])
    })
    record.value = emitWireMessage(recordFields)
    nthWireField(top, sectionNumber).value = emitWireMessage(section)
  }
  return buildFile(emitWireMessage(top), { schema: 1, headTag: 2, fileType: 3, tailTag: 4 })
}

function assembly(prefabId: number) {
  return {
    name: `组件回归_${prefabId}`,
    prefabId,
    templatePrefabId: FIXTURE_IDS.definition,
    templateInstanceId: FIXTURE_IDS.instance,
    templateName: '模板',
    position: [0, 0, 0] as const,
    items: [{ resourceId: 10009001, position: [0, 0, 0] as const }],
    definitionAuxiliaryIds: [prefabId + 1],
    instanceAuxiliaryIds: [prefabId + 2]
  }
}

const omitted = applyStaticAssembly({ gilPath, assembly: assembly(300) })
assert.equal(componentRecords(createdRecord(omitted.bytes, 4, 300), 8).length, 0)
assert.equal(componentRecords(createdRecord(omitted.bytes, 8, 300), 7).length, 0)

const configured = applyStaticAssembly({
  gilPath,
  assembly: {
    ...assembly(400),
    components: [{ type: 'followMotion', preset: 'fullFollow' }]
  }
})
const definitionComponents = componentRecords(createdRecord(configured.bytes, 4, 400), 8)
const instanceComponents = componentRecords(createdRecord(configured.bytes, 8, 400), 7)
assert.equal(definitionComponents.length, 1)
assert.equal(instanceComponents.length, 1)
assert.equal(Buffer.from(definitionComponents[0]).equals(Buffer.from(instanceComponents[0])), true)
const expectedFullFollowHex =
  '080910019a0134120b47495f526f6f744e6f64651a0a0d0000803f1d0000803f220028b00930cc083a025a00b21f0ce5ae8ce585a8e8b79fe99a8f'
assert.equal(Buffer.from(definitionComponents[0]).toString('hex'), expectedFullFollowHex)

writeFileSync(gilPath, seedFollowMotionComponent(source))
const replaced = applyStaticAssembly({
  gilPath,
  assembly: {
    ...assembly(450),
    components: [{ type: 'followMotion', preset: 'fullFollow' }]
  }
})
const replacedDefinition = componentRecords(createdRecord(replaced.bytes, 4, 450), 8)
const replacedInstance = componentRecords(createdRecord(replaced.bytes, 8, 450), 7)
assert.equal(replacedDefinition.length, 1)
assert.equal(replacedInstance.length, 1)
assert.equal(Buffer.from(replacedDefinition[0]).toString('hex'), expectedFullFollowHex)
assert.equal(Buffer.from(replacedInstance[0]).toString('hex'), expectedFullFollowHex)

writeFileSync(gilPath, source)
assert.throws(
  () =>
    applyStaticAssembly({
      gilPath,
      assembly: {
        ...assembly(500),
        components: [
          { type: 'followMotion', preset: 'fullFollow' },
          { type: 'followMotion', preset: 'fullFollow' }
        ]
      }
    }),
  /components.*duplicate/i
)

console.log('static assembly component tests passed')
