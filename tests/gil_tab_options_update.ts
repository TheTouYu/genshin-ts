import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import {
  applyStaticPrefabUpdate,
  applyTabOptionsUpdate
} from '../src/cli/gil_static_prefab_updates.js'
import { parseWireMessage, wireRecordId, wireRecords } from '../src/cli/static_assembly/wire.js'
import {
  buildStaticAssemblyFixture,
  FIXTURE_IDS
} from './fixtures/static-assembly/build_fixture.js'

const directory = mkdtempSync(path.join(tmpdir(), 'gsts-tab-options-'))
const gilPath = path.join(directory, 'fixture.gil')

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

function tabOptions(slot: Uint8Array): string[] {
  const fields = parseWireMessage(slot)
  assert.ok(fields)
  const config = fields.find((field) => field.number === 27 && field.wire === 2)
  assert.ok(config)
  const configFields = parseWireMessage(config.value as Uint8Array)
  assert.ok(configFields)
  const options: string[] = []
  for (const option of configFields) {
    if (option.number !== 2 || option.wire !== 2) continue
    const shortName = parseWireMessage(option.value as Uint8Array)?.find(
      (field) => field.number === 2 && field.wire === 2
    )
    if (shortName) options.push(new TextDecoder().decode(shortName.value as Uint8Array))
  }
  return options
}

function tabRegion(slot: Uint8Array): { regionName: string; radius: number; center: number[] } {
  const fields = parseWireMessage(slot)
  assert.ok(fields)
  const config = fields.find((field) => field.number === 27 && field.wire === 2)
  assert.ok(config)
  const configFields = parseWireMessage(config.value as Uint8Array)
  assert.ok(configFields)
  const region = configFields.find((field) => field.number === 1 && field.wire === 2)
  assert.ok(region)
  const regionFields = parseWireMessage(region.value as Uint8Array)
  assert.ok(regionFields)
  const nameField = regionFields.find((field) => field.number === 502 && field.wire === 2)
  const name = nameField ? new TextDecoder().decode(nameField.value as Uint8Array) : ''
  const sphere = regionFields.find((field) => field.number === 12 && field.wire === 2)
  assert.ok(sphere, 'sphere region expected')
  const sphereFields = parseWireMessage(sphere.value as Uint8Array)
  assert.ok(sphereFields)
  const radiusField = sphereFields.find((field) => field.number === 2 && field.wire === 5)
  assert.ok(radiusField)
  const radius = Buffer.from(radiusField.value as Uint8Array).readFloatLE()
  const centerField = sphereFields.find((field) => field.number === 1 && field.wire === 2)
  const center = centerField
    ? Array.from({ length: 3 }, (_, i) =>
        Buffer.from(
          parseWireMessage(centerField.value as Uint8Array)!.find(
            (field) => field.number === i + 1 && field.wire === 5
          )!.value as Uint8Array
        ).readFloatLE()
      )
    : [0, 0, 0]
  return { regionName: name, radius, center }
}

// 准备：带 tabBar（球体 r=1.5 中心偏移 [0,1,0]）+ basicMotion 的既有实例
const sourceBytes = buildStaticAssemblyFixture()
writeFileSync(gilPath, sourceBytes)
const seeded = applyStaticPrefabUpdate({
  gilPath,
  update: {
    prefabId: FIXTURE_IDS.definition,
    instanceId: FIXTURE_IDS.instance,
    expectedName: '模板',
    components: [
      {
        type: 'tabBar',
        regionName: '灯阵',
        options: ['开始游戏'],
        regionType: 'sphere',
        regionRadius: 1.5,
        regionCenter: [0, 1, 0]
      },
      { type: 'basicMotion', preset: 'default' }
    ]
  }
})
writeFileSync(gilPath, seeded.bytes)

// 核心：只换选项，保留区域配置
const updated = applyTabOptionsUpdate({
  gilPath,
  instanceId: FIXTURE_IDS.instance,
  expectedName: '模板',
  options: ['开始游戏', '立即胜利']
})
assert.deepEqual(updated.region, {
  regionName: '灯阵',
  regionType: 'sphere',
  regionSize: [1, 1, 1],
  regionRadius: 1.5,
  regionCenter: [0, 1, 0]
})
assert.deepEqual(updated.removedComponents, [])

const definitionTab = components(record(updated.bytes, 4, FIXTURE_IDS.definition), 8, 17)
const instanceTab = components(record(updated.bytes, 8, FIXTURE_IDS.instance), 7, 17)
assert.equal(definitionTab.length, 1)
assert.equal(instanceTab.length, 1)
assert.equal(Buffer.from(definitionTab[0]).equals(Buffer.from(instanceTab[0])), true)
assert.deepEqual(tabOptions(instanceTab[0]), ['开始游戏', '立即胜利'])
assert.deepEqual(tabRegion(instanceTab[0]), {
  regionName: '灯阵',
  radius: 1.5,
  center: [0, 1, 0]
})
// 其他组件必须保留
assert.equal(components(record(updated.bytes, 4, FIXTURE_IDS.definition), 8, 4).length, 1)
assert.equal(components(record(updated.bytes, 8, FIXTURE_IDS.instance), 7, 4).length, 1)

// 区域覆盖：改名 + 改半径
writeFileSync(gilPath, updated.bytes)
const overridden = applyTabOptionsUpdate({
  gilPath,
  instanceId: FIXTURE_IDS.instance,
  expectedName: '模板',
  options: ['立即胜利'],
  regionName: '灯阵2',
  regionRadius: 2.5
})
const overrideInstanceTab = components(record(overridden.bytes, 8, FIXTURE_IDS.instance), 7, 17)
assert.deepEqual(tabOptions(overrideInstanceTab[0]), ['立即胜利'])
assert.deepEqual(tabRegion(overrideInstanceTab[0]), {
  regionName: '灯阵2',
  radius: 2.5,
  center: [0, 1, 0]
})

// 盒体区域保留（默认盒体路径）
writeFileSync(gilPath, sourceBytes)
const boxSeeded = applyStaticPrefabUpdate({
  gilPath,
  update: {
    prefabId: FIXTURE_IDS.definition,
    instanceId: FIXTURE_IDS.instance,
    expectedName: '模板',
    components: [
      {
        type: 'tabBar',
        regionName: '区域1',
        options: ['开'],
        regionType: 'box',
        regionSize: [2, 3, 4]
      }
    ]
  }
})
writeFileSync(gilPath, boxSeeded.bytes)
const boxUpdated = applyTabOptionsUpdate({
  gilPath,
  instanceId: FIXTURE_IDS.instance,
  expectedName: '模板',
  options: ['开', '关']
})
const boxInstanceTab = components(record(boxUpdated.bytes, 8, FIXTURE_IDS.instance), 7, 17)
assert.deepEqual(tabOptions(boxInstanceTab[0]), ['开', '关'])
assert.deepEqual(boxUpdated.region, {
  regionName: '区域1',
  regionType: 'box',
  regionSize: [2, 3, 4],
  regionRadius: 1,
  regionCenter: [0, 0, 0]
})

// 错误路径
assert.throws(
  () =>
    applyTabOptionsUpdate({
      gilPath,
      instanceId: FIXTURE_IDS.instance,
      expectedName: '错误名称',
      options: ['开']
    }),
  /expectedName.*does not match/i
)

assert.throws(
  () =>
    applyTabOptionsUpdate({
      gilPath,
      instanceId: 999999,
      expectedName: '模板',
      options: ['开']
    }),
  /expected one record for ID 999999/i
)

writeFileSync(gilPath, sourceBytes)
assert.throws(
  () =>
    applyTabOptionsUpdate({
      gilPath,
      instanceId: FIXTURE_IDS.instance,
      expectedName: '模板',
      options: ['开']
    }),
  /no decodable tabBar component/i
)

console.log('tab options update test passed')
