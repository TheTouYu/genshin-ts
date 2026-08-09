import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { applyEntities, exportEntities } from '../src/cli/gil_entities.js'
import { applyStaticAssembly } from '../src/cli/gil_static_assemblies.js'
import {
  buildAuxiliaryRecord,
  buildCustomDefinitionRecord,
  buildOfficialPrefabRecord,
  isOfficialResourceId,
  officialPrefabName,
  resolveItemResourceId
} from '../src/cli/official_prefabs.js'
import {
  emitWireMessage as emit,
  packedWireIds,
  parseWireMessage as parse,
  wireRecords
} from '../src/cli/static_assembly/wire.js'
import { buildFile } from '../src/injector/binary.js'
import { buildStaticAssemblyFixture } from './fixtures/static-assembly/build_fixture.js'

// —— 官方 resID 判定与名字表 ——
assert.equal(isOfficialResourceId(10009001), true)
assert.equal(isOfficialResourceId(10005018), true)
assert.equal(isOfficialResourceId(1077936130), false)
assert.equal(isOfficialResourceId(9_999_999), false)
assert.equal(officialPrefabName(10009001), '长方体')
assert.equal(officialPrefabName(10009003), '平面')
assert.equal(officialPrefabName(10005018), '空模型')
assert.equal(officialPrefabName(123456), undefined)

// —— 官方骨架生成：root 8 官方引用实例 / root 5 官方直引实体共用 ——
const official = buildOfficialPrefabRecord({
  id: 500,
  resourceId: 10009003,
  name: '平面',
  transform: {
    position: [1, 2, 3],
    rotation: [0, 0, 0],
    scale: [1, 1, 1]
  }
})
const officialFields = parse(official)!
const slotCount = (n: number) => officialFields.filter((f) => f.number === n && f.wire === 2).length
assert.equal(slotCount(5), 10, 'official prefab must have 10 ability slots')
assert.equal(slotCount(6), 15, 'official prefab must have 15 node-tree slots')
assert.equal(slotCount(7), 6, 'official prefab must have 6 component slots')
const f2 = parse(officialFields.find((f) => f.number === 2)!.value as Uint8Array)!
assert.deepEqual(
  f2.map((f) => [f.number, f.value]),
  [
    [1, 10009003],
    [2, 1]
  ],
  'official relation must be {1:resID, 2:1}'
)
assert.equal(officialFields.find((f) => f.number === 8)!.value, 10009003)

const empty = buildOfficialPrefabRecord({
  id: 501,
  resourceId: 10005018,
  name: '空模型',
  transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }
})
const emptySlots = parse(empty)!.filter((f) => f.number === 5 && f.wire === 2)
assert.equal(emptySlots.length, 11, 'empty model must have 11 ability slots')
assert.ok(
  emptySlots.some((slot) =>
    parse(slot.value as Uint8Array)?.some((f) => f.number === 1 && f.value === 20)
  ),
  'empty model must carry slot 20'
)
assert.equal(parse(empty)!.find((f) => f.number === 8)!.value, 10005018)

// —— root 4 自定义定义骨架 ——
const definition = buildCustomDefinitionRecord({
  id: 600,
  resourceId: 10009002,
  name: '官方球',
  transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }
})
const definitionFields = parse(definition)!
assert.equal(definitionFields.find((f) => f.number === 1)!.value, 600)
assert.equal(definitionFields.find((f) => f.number === 2)!.value, 10009002)
assert.equal(definitionFields.find((f) => f.number === 10)!.value, 1)

// —— 装饰物引用元件：自定义元件 defID → 其定义 f2 ——
const itemDefinition = buildCustomDefinitionRecord({
  id: 700,
  resourceId: 10009002,
  name: '球',
  transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }
})
assert.equal(resolveItemResourceId([itemDefinition], 700), 10009002)
assert.equal(resolveItemResourceId([itemDefinition], 10009001), 10009001)
assert.equal(resolveItemResourceId([], 700), 700)
const aux = buildAuxiliaryRecord({
  id: 701,
  resourceId: 10009002,
  ownerId: 600,
  name: '装饰物_1',
  transform: { position: [1, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }
})
const auxFields = parse(aux)!
assert.equal(auxFields.find((f) => f.number === 1)!.value, 701)
assert.equal(auxFields.find((f) => f.number === 2)!.value, 10009002)
assert.equal(auxFields.find((f) => f.number === 3)!.value, 1, 'definition-side aux keeps f3=1')

// —— applyEntities 官方直引：无本地定义时不报错，生成官方骨架实体 ——
const mini = buildFile(
  emit([
    { number: 4, wire: 2, value: emit([]) },
    { number: 5, wire: 2, value: emit([]) },
    {
      number: 6,
      wire: 2,
      value: emit([
        {
          number: 1,
          wire: 2,
          value: emit([
            { number: 1, wire: 0, value: 3 },
            { number: 2, wire: 2, value: new Uint8Array(8) },
            {
              number: 3,
              wire: 2,
              value: emit([
                { number: 1, wire: 2, value: new TextEncoder().encode('未分类页签') },
                { number: 3, wire: 0, value: 2 }
              ])
            }
          ])
        }
      ])
    }
  ]),
  { schema: 1, headTag: 2, fileType: 3, tailTag: 4 }
)
const applied = applyEntities({
  bytes: mini,
  definitions: [],
  entities: [
    {
      name: '平面',
      id: 800,
      definitionId: 10009003,
      position: [10, 20, 30],
      scale: [2, 2, 2]
    }
  ]
})
const exported = exportEntities(applied)
assert.equal(exported.length, 1)
assert.equal(exported[0].id, 800)
assert.equal(exported[0].name, '平面')
assert.equal(exported[0].definitionId, 10009003)
assert.equal(exported[0].resourceId, 10009003)
assert.deepEqual(exported[0].position, [10, 20, 30])
assert.deepEqual(exported[0].scale, [2, 2, 2])
const appliedTop = parse(applied.slice(20, -4))!
const appliedEntity = wireRecords(appliedTop, 5, 1).find((r) => {
  const first = parse(r)![0]
  return first.number === 1 && first.value === 800
})
assert.ok(appliedEntity, 'official entity record must exist')
const appliedEntityFields = parse(appliedEntity)!
const relation = parse(appliedEntityFields.find((f) => f.number === 2)!.value as Uint8Array)!
assert.deepEqual(
  relation.map((f) => [f.number, f.value]),
  [
    [1, 10009003],
    [2, 1]
  ],
  'official direct entity relation must be {1:resID, 2:1}'
)
assert.equal(
  appliedEntityFields.filter((f) => f.number === 5 && f.wire === 2).length,
  10,
  'official direct entity must keep 10 ability slots (no 19/52 defaults appended)'
)
assert.equal(
  appliedEntityFields.filter((f) => f.number === 6 && f.wire === 2).length,
  15,
  'official direct entity must keep 15 node-tree slots'
)

// —— applyStaticAssembly 官方模板源：程序化生成 root 4 定义 + root 8 实例 + 页签 + 装饰物 ——
const fixture = buildStaticAssemblyFixture()
const result = applyStaticAssembly({
  gilPath: fixturePath(fixture),
  assembly: {
    name: '官方箱',
    prefabId: 300,
    templatePrefabId: 10009001,
    templateInstanceId: 999,
    templateName: 'ignore',
    position: [0, 0, 0],
    items: [
      {
        resourceId: 10009002,
        position: [1, 2, 3],
        color: { enabled: true, rgb: 0x123456, opacity: 100, overlay: 'overwrite' }
      }
    ],
    definitionAuxiliaryIds: [301],
    instanceAuxiliaryIds: [302]
  }
})
const resultTop = parse(result.bytes.slice(20, -4))!
const newDefinition = wireRecords(resultTop, 4, 1).find((r) => {
  const first = parse(r)![0]
  return first.number === 1 && first.value === 300
})
assert.ok(newDefinition, 'official template must create root 4 definition')
const newDefinitionFields = parse(newDefinition)!
assert.equal(newDefinitionFields.find((f) => f.number === 2)!.value, 10009001)
assert.equal(
  newDefinitionFields.filter((f) => f.number === 6 && f.wire === 2).length,
  8,
  'custom definition must keep 8 ability slots'
)
assert.deepEqual(
  packedWireIds(newDefinition),
  [301],
  'custom definition must register definition-side auxiliary IDs'
)
const newInstance = wireRecords(resultTop, 8, 1).find((r) => {
  const first = parse(r)![0]
  return first.number === 1 && first.value === 300
})
assert.ok(newInstance, 'official template must create root 8 instance')
const newInstanceFields = parse(newInstance)!
const instanceRelation = parse(newInstanceFields.find((f) => f.number === 2)!.value as Uint8Array)!
assert.deepEqual(
  instanceRelation.map((f) => [f.number, f.value]),
  [[1, 300]],
  'custom instance must reference the generated root 4 definition'
)
assert.equal(newInstanceFields.find((f) => f.number === 8)!.value, 10009001)
assert.deepEqual(
  packedWireIds(newInstance),
  [302],
  'custom instance must register instance-side auxiliary IDs'
)
const auxiliaryOwnerId = (record: Uint8Array) => {
  const slot = parse(record)!
    .filter((field) => field.number === 4 && field.wire === 2)
    .map((field) => parse(field.value as Uint8Array)!)
    .find((fields) => fields.some((field) => field.number === 1 && field.value === 40))!
  const config = parse(slot.find((field) => field.number === 50)!.value as Uint8Array)!
  return config.find((field) => field.number === 502)!.value
}
const auxiliaryColorVarints = (record: Uint8Array) => {
  const material = parse(record)!
    .filter((field) => field.number === 5 && field.wire === 2)
    .map((field) => parse(field.value as Uint8Array)!)
    .find((fields) => fields.some((field) => field.number === 1 && field.value === 22))!
  const color = parse(material.find((field) => field.number === 32)!.value as Uint8Array)!
  return color.filter((field) => field.wire === 0).map((field) => [field.number, field.value])
}
const expectedAuxiliaryColor = [
  [1, 1],
  [3, 0xff123456 | 0],
  [5, 0x123456],
  [6, 6700]
]
const newAuxDefinition = wireRecords(resultTop, 27, 1).find((r) => {
  const first = parse(r)![0]
  return first.number === 1 && first.value === 301
})
assert.ok(newAuxDefinition, 'official template must create definition-side auxiliary')
assert.equal(parse(newAuxDefinition)!.find((f) => f.number === 2)!.value, 10009002)
assert.equal(auxiliaryOwnerId(newAuxDefinition), 300, 'definition aux must belong to the new definition')
assert.deepEqual(
  auxiliaryColorVarints(newAuxDefinition),
  expectedAuxiliaryColor,
  'definition aux must apply item color'
)
const newAuxInstance = wireRecords(resultTop, 27, 2).find((r) => {
  const first = parse(r)![0]
  return first.number === 1 && first.value === 302
})
assert.ok(newAuxInstance, 'official template must create instance-side auxiliary')
const auxInstanceFields = parse(newAuxInstance)!
assert.equal(auxiliaryOwnerId(newAuxInstance), 300, 'instance aux must belong to the new reference')
assert.deepEqual(
  auxiliaryColorVarints(newAuxInstance),
  expectedAuxiliaryColor,
  'instance aux must apply item color'
)
const backlink = parse(auxInstanceFields.find((f) => f.number === 12)!.value as Uint8Array)!
assert.equal(backlink.find((f) => f.number === 1)!.value, 301, 'instance aux must backlink definition aux')
const root6 = (resultTop.find((f) => f.number === 6 && f.wire === 2)!.value as Uint8Array)
const registryEntries = parse(root6)!.flatMap((f) => {
  if (f.number !== 1 || f.wire !== 2) return []
  return parse(f.value as Uint8Array)!.flatMap((g) => {
    if (g.number !== 3 || g.wire !== 2) return []
    return parse(g.value as Uint8Array)!
      .filter((e) => e.number === 5 && e.wire === 2)
      .map((e) => {
        const fields = parse(e.value as Uint8Array)!
        return [fields[0].value, fields[1].value] as const
      })
  })
})
assert.ok(
  registryEntries.some(([kind, id]) => kind === 100 && id === 300),
  'registry must gain {100, prefabId}'
)
assert.ok(
  registryEntries.some(([kind, id]) => kind === 400 && id === 300),
  'registry must gain {400, prefabId}'
)

function fixturePath(bytes: Uint8Array): string {
  // applyStaticAssembly 按 gilPath 读文件；写临时文件
  const file = join(tmpdir(), `gsts-official-prefab-${process.pid}.gil`)
  writeFileSync(file, bytes)
  return file
}

console.log('official prefab direct-reference test passed')
