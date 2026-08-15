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

function components(owner: Uint8Array, fieldNumber: number, type: number): Uint8Array[] {
  const fields = parseWireMessage(owner)
  assert.ok(fields)
  return fields
    .filter((field) => field.number === fieldNumber && field.wire === 2)
    .map((field) => field.value as Uint8Array)
    .filter((component) =>
      parseWireMessage(component)?.some(
        (field) => field.number === 1 && field.wire === 0 && field.value === type
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

const definitionComponents = components(record(result.bytes, 4, FIXTURE_IDS.definition), 8, 9)
const instanceComponents = components(record(result.bytes, 8, FIXTURE_IDS.instance), 7, 9)
assert.equal(definitionComponents.length, 1)
assert.equal(instanceComponents.length, 1)
assert.equal(Buffer.from(definitionComponents[0]).equals(Buffer.from(instanceComponents[0])), true)
assert.equal(
  Buffer.from(definitionComponents[0]).toString('hex'),
  '080910019a0134120b47495f526f6f744e6f64651a0a0d0000803f1d0000803f220028b00930cc083a025a00b21f0ce5ae8ce585a8e8b79fe99a8f'
)

writeFileSync(gilPath, sourceBytes)
const basicMotion = applyStaticPrefabUpdate({
  gilPath,
  update: {
    prefabId: FIXTURE_IDS.definition,
    instanceId: FIXTURE_IDS.instance,
    expectedName: '模板',
    components: [{ type: 'basicMotion', preset: 'default' }]
  }
})
const basicDefinition = components(record(basicMotion.bytes, 4, FIXTURE_IDS.definition), 8, 4)
const basicInstance = components(record(basicMotion.bytes, 8, FIXTURE_IDS.instance), 7, 4)
assert.equal(basicDefinition.length, 1)
assert.equal(basicInstance.length, 1)
assert.equal(Buffer.from(basicDefinition[0]).equals(Buffer.from(basicInstance[0])), true)
assert.equal(
  // 2026-08-13 修正：基础运动器真实类型码 4（9B 默认快照），旧 18 为模板自带组件误判
  Buffer.from(basicDefinition[0]).toString('hex'),
  '080410017203c81f01'
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

writeFileSync(gilPath, sourceBytes)
const positionOnly = applyStaticPrefabUpdate({
  gilPath,
  update: {
    prefabId: FIXTURE_IDS.definition,
    instanceId: FIXTURE_IDS.instance,
    expectedName: '模板',
    position: [12, 2, 0]
  }
})
assert.equal(
  Buffer.from(record(positionOnly.bytes, 4, FIXTURE_IDS.definition)).equals(
    Buffer.from(record(sourceBytes, 4, FIXTURE_IDS.definition))
  ),
  true,
  'position-only update must not modify the prefab definition'
)
const sourceInstance = parseWireMessage(record(sourceBytes, 8, FIXTURE_IDS.instance))!
const sourceTransformOwner = parseWireMessage(
  sourceInstance.find((field) => field.number === 6 && field.wire === 2)!.value as Uint8Array
)!
const sourceTransform = parseWireMessage(
  sourceTransformOwner.find((field) => field.number === 11 && field.wire === 2)!.value as Uint8Array
)!
const positionedInstance = parseWireMessage(record(positionOnly.bytes, 8, FIXTURE_IDS.instance))!
const positionedTransformOwner = parseWireMessage(
  positionedInstance.find((field) => field.number === 6 && field.wire === 2)!.value as Uint8Array
)!
const positionedTransform = parseWireMessage(
  positionedTransformOwner.find((field) => field.number === 11 && field.wire === 2)!
    .value as Uint8Array
)!
const position = parseWireMessage(
  positionedTransform.find((field) => field.number === 1 && field.wire === 2)!.value as Uint8Array
)!
assert.deepEqual(
  position.map((field) => [field.number, Buffer.from(field.value as Uint8Array).readFloatLE()]),
  [
    [1, 12],
    [2, 2]
  ]
)
for (const fieldNumber of [2, 3]) {
  assert.equal(
    Buffer.from(
      positionedTransform.find((field) => field.number === fieldNumber && field.wire === 2)!
        .value as Uint8Array
    ).equals(
      Buffer.from(
        sourceTransform.find((field) => field.number === fieldNumber && field.wire === 2)!
          .value as Uint8Array
      )
    ),
    true,
    `position-only update must preserve transform field ${fieldNumber} bytes`
  )
}

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

// --- P4-3: removeComponents（组件移除能力）---
writeFileSync(gilPath, sourceBytes)
const addForRemoval = applyStaticPrefabUpdate({
  gilPath,
  update: {
    prefabId: FIXTURE_IDS.definition,
    instanceId: FIXTURE_IDS.instance,
    expectedName: '模板',
    components: [{ type: 'basicMotion', preset: 'default' }]
  }
})
assert.equal(components(record(addForRemoval.bytes, 4, FIXTURE_IDS.definition), 8, 4).length, 1)
assert.equal(components(record(addForRemoval.bytes, 8, FIXTURE_IDS.instance), 7, 4).length, 1)

writeFileSync(gilPath, addForRemoval.bytes)
const removeResult = applyStaticPrefabUpdate({
  gilPath,
  update: {
    prefabId: FIXTURE_IDS.definition,
    instanceId: FIXTURE_IDS.instance,
    expectedName: '模板',
    removeComponents: [4]
  }
})
assert.deepEqual(removeResult.removedComponents, [4])
assert.equal(components(record(removeResult.bytes, 4, FIXTURE_IDS.definition), 8, 4).length, 0)
assert.equal(components(record(removeResult.bytes, 8, FIXTURE_IDS.instance), 7, 4).length, 0)
assert.equal(
  Buffer.from(record(removeResult.bytes, 4, FIXTURE_IDS.definition)).equals(
    Buffer.from(record(sourceBytes, 4, FIXTURE_IDS.definition))
  ),
  true,
  'removing the only added component must restore the original definition'
)
assert.equal(
  Buffer.from(record(removeResult.bytes, 8, FIXTURE_IDS.instance)).equals(
    Buffer.from(record(sourceBytes, 8, FIXTURE_IDS.instance))
  ),
  true,
  'removing the only added component must restore the original instance'
)

writeFileSync(gilPath, sourceBytes)
const absentRemoval = applyStaticPrefabUpdate({
  gilPath,
  update: {
    prefabId: FIXTURE_IDS.definition,
    instanceId: FIXTURE_IDS.instance,
    expectedName: '模板',
    removeComponents: [12, 13]
  }
})
assert.deepEqual(absentRemoval.removedComponents, [])
assert.equal(
  Buffer.from(absentRemoval.bytes).equals(Buffer.from(sourceBytes)),
  true,
  'removing absent component codes must be a byte-identical no-op'
)

assert.throws(
  () =>
    applyStaticPrefabUpdate({
      gilPath,
      update: {
        prefabId: FIXTURE_IDS.definition,
        instanceId: FIXTURE_IDS.instance,
        expectedName: '模板',
        removeComponents: [4, 4]
      }
    }),
  /duplicate type codes/i
)

assert.throws(
  () =>
    applyStaticPrefabUpdate({
      gilPath,
      update: {
        prefabId: FIXTURE_IDS.definition,
        instanceId: FIXTURE_IDS.instance,
        expectedName: '模板',
        components: [{ type: 'basicMotion', preset: 'default' }],
        removeComponents: [4]
      }
    }),
  /must not add and remove the same component type 4/i
)

assert.throws(
  () =>
    applyStaticPrefabUpdate({
      gilPath,
      update: {
        prefabId: FIXTURE_IDS.definition,
        instanceId: FIXTURE_IDS.instance,
        expectedName: '模板',
        removeComponents: [-1]
      }
    }),
  /non-negative safe integer/i
)

console.log('static prefab update component test passed')
