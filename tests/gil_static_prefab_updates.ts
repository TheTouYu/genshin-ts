import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { applyStaticPrefabUpdate } from '../src/cli/gil_static_prefab_updates.js'
import { parseWireMessage, wireRecordId, wireRecords } from '../src/cli/static_assembly/wire.js'
import {
  buildStaticAssemblyFixture,
  FIXTURE_IDS
} from './fixtures/static-assembly/build_fixture.js'

const directory = mkdtempSync(path.join(tmpdir(), 'gsts-static-prefab-updates-'))
const gilPath = path.join(directory, 'fixture.gil')
writeFileSync(gilPath, buildStaticAssemblyFixture())

function record(bytes: Uint8Array, section: number, id: number): Uint8Array {
  const top = parseWireMessage(bytes.slice(20, -4))
  assert.ok(top)
  const matches = wireRecords(top, section, 1).filter((value) => wireRecordId(value) === id)
  assert.equal(matches.length, 1)
  return matches[0]
}

function fullFollowComponents(owner: Uint8Array, fieldNumber: number): Uint8Array[] {
  const fields = parseWireMessage(owner)
  assert.ok(fields)
  return fields
    .filter((field) => field.number === fieldNumber && field.wire === 2)
    .map((field) => field.value as Uint8Array)
    .filter((component) =>
      parseWireMessage(component)?.some(
        (field) => field.number === 1 && field.wire === 0 && field.value === 9
      )
    )
}

const sourceBytes = buildStaticAssemblyFixture()
const result = applyStaticPrefabUpdate({
  gilPath,
  update: {
    prefabId: FIXTURE_IDS.definition,
    instanceId: FIXTURE_IDS.instance,
    expectedName: '模板',
    components: [{ type: 'followMotion', preset: 'fullFollow' }]
  }
})

const definitionComponents = fullFollowComponents(
  record(result.bytes, 4, FIXTURE_IDS.definition),
  8
)
const instanceComponents = fullFollowComponents(record(result.bytes, 8, FIXTURE_IDS.instance), 7)
assert.equal(definitionComponents.length, 1)
assert.equal(instanceComponents.length, 1)
assert.equal(Buffer.from(definitionComponents[0]).equals(Buffer.from(instanceComponents[0])), true)
assert.equal(
  Buffer.from(definitionComponents[0]).toString('hex'),
  '080910019a0134120b47495f526f6f744e6f64651a0a0d0000803f1d0000803f220028b00930cc083a025a00b21f0ce5ae8ce585a8e8b79fe99a8f'
)

writeFileSync(gilPath, sourceBytes)
const scaleOnly = applyStaticPrefabUpdate({
  gilPath,
  update: {
    prefabId: FIXTURE_IDS.definition,
    instanceId: FIXTURE_IDS.instance,
    expectedName: '模板',
    scale: [0.01, 0.01, 0.01]
  }
})
assert.equal(
  Buffer.from(record(scaleOnly.bytes, 4, FIXTURE_IDS.definition)).equals(
    Buffer.from(record(sourceBytes, 4, FIXTURE_IDS.definition))
  ),
  true,
  'scale-only update must not modify the prefab definition'
)
const scaledInstance = parseWireMessage(record(scaleOnly.bytes, 8, FIXTURE_IDS.instance))!
const transformOwner = parseWireMessage(
  scaledInstance.find((field) => field.number === 6 && field.wire === 2)!.value as Uint8Array
)!
const transform = parseWireMessage(
  transformOwner.find((field) => field.number === 11 && field.wire === 2)!.value as Uint8Array
)!
const scale = parseWireMessage(
  transform.find((field) => field.number === 3 && field.wire === 2)!.value as Uint8Array
)!
assert.deepEqual(
  scale.map((field) => Buffer.from(field.value as Uint8Array).readFloatLE()),
  [Math.fround(0.01), Math.fround(0.01), Math.fround(0.01)]
)

assert.throws(
  () =>
    applyStaticPrefabUpdate({
      gilPath,
      update: {
        prefabId: FIXTURE_IDS.definition,
        instanceId: FIXTURE_IDS.instance,
        expectedName: '错误名称',
        components: [{ type: 'followMotion', preset: 'fullFollow' }]
      }
    }),
  /expectedName.*does not match/i
)

console.log('static prefab update component test passed')
