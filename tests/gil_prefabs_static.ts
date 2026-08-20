import assert from 'node:assert/strict'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

import { createCustomPrefab, createStaticPrefabInstance } from '../src/cli/gil_prefabs.js'
import {
  buildStaticPrefabRecord,
  officialPrefabName
} from '../src/cli/official_prefabs.js'
import { buildStaticAssemblyFixture } from './fixtures/static-assembly/build_fixture.js'
import {
  parseWireMessage as parse,
  wireRecords,
  type WireField
} from '../src/cli/static_assembly/wire.js'

// 静态元件 root8 实例创建（动态→静态转换形态）集成测试。
// 真实样本：after-convert-10009008-static.gil（用户 2026-08-20 在编辑器把官方动态元件
// 圆柱 10009008 转为静态资源后的地图保存，root8 实例 1077936140 = 409B 无 f7 组件槽）。

const SAMPLE_PATH = fileURLToPath(
  new URL('./fixtures/static-assembly/after-convert-10009008-static.gil', import.meta.url)
)
const SAMPLE = new Uint8Array(fs.readFileSync(SAMPLE_PATH))

function topOf(bytes: Uint8Array): WireField[] {
  const top = parse(bytes.slice(20, -4))
  assert.ok(top, 'GIL payload must parse')
  return top
}

function root8Records(bytes: Uint8Array): Uint8Array[] {
  return wireRecords(topOf(bytes), 8, 1)
}

function staticRecordAssertions(
  record: Uint8Array,
  id: number,
  resourceId: number,
  expectedLength?: number
): void {
  const fields = parse(record)!
  assert.equal(fields.find((f) => f.number === 1 && f.wire === 0)?.value, id)
  assert.equal(fields.find((f) => f.number === 8 && f.wire === 0)?.value, resourceId)
  assert.equal(
    fields.filter((f) => f.number === 7).length,
    0,
    'static record must have no f7 component slots'
  )
  if (expectedLength !== undefined) assert.equal(record.length, expectedLength)
}

function registryEntries(bytes: Uint8Array): Array<readonly [number, number]> {
  const root6 = topOf(bytes).find((f) => f.number === 6 && f.wire === 2)
  if (!root6) return []
  return (parse(root6.value as Uint8Array) ?? []).flatMap((f) => {
    if (f.number !== 1 || f.wire !== 2) return []
    return (parse(f.value as Uint8Array) ?? []).flatMap((g) => {
      if (g.number !== 3 || g.wire !== 2) return []
      return (parse(g.value as Uint8Array) ?? [])
        .filter((e) => e.number === 5 && e.wire === 2)
        .map((e) => {
          const fields = parse(e.value as Uint8Array)!
          return [fields[0].value as number, fields[1].value as number] as const
        })
    })
  })
}

// —— 1. buildStaticPrefabRecord 与真实样本静态实例逐字节一致 ——
// 骨架常量本身来自样本 1077936140；用样本同款 id/res/name + 样本原始位置
// （float32 可精确还原骨架内嵌值）生成，应逐字节还原样本记录。
const rebuilt = buildStaticPrefabRecord({
  id: 1077936140,
  resourceId: 10009008,
  name: '圆柱',
  transform: { position: [5.1272316, 0, -6.1999989], rotation: [0, 0, 0], scale: [1, 1, 1] }
})
const sampleRecords = root8Records(SAMPLE)
const sampleStatic = sampleRecords.find(
  (r) => parse(r)!.find((f) => f.number === 1 && f.wire === 0)?.value === 1077936140
)
assert.ok(sampleStatic, 'sample must contain static instance 1077936140')
assert.equal(
  Buffer.from(rebuilt).toString('hex'),
  Buffer.from(sampleStatic).toString('hex'),
  'rebuilt static record must be byte-exact vs editor sample'
)

// —— 2. createStaticPrefabInstance 集成：合成 fixture 双写 root8 + root6 ——
const fixture = buildStaticAssemblyFixture()
const created = createStaticPrefabInstance(fixture, {
  id: 1077936141,
  resourceId: 10009008,
  name: '圆柱',
  position: [5.1272316, 0, -6.1999989]
})
assert.equal(created.id, 1077936141)
assert.equal(created.name, '圆柱')
const resultTop = topOf(created.bytes)
const records = root8Records(created.bytes)
assert.equal(records.length, 2, 'root8 must keep fixture instance and add static instance')
// fixture 原实例逐字节不变
const fixtureInstance = wireRecords(topOf(fixture), 8, 1)[0]
assert.ok(
  records.some((r) => Buffer.from(r).equals(Buffer.from(fixtureInstance))),
  'existing root8 instance must stay byte-exact'
)
// 新增静态记录：无 f7、id/res 正确、长度与直接骨架生成一致（非零位置 → 409）
staticRecordAssertions(findStatic(records, 1077936141), 1077936141, 10009008, 409)
// —— position 重写生效（缺口①回归）：transform 槽位置 = 传入值 ——
const transformSlot = (() => {
  const slot = parse(findStatic(records, 1077936141))!
    .filter((f) => f.number === 6 && f.wire === 2)
    .map((f) => parse(f.value as Uint8Array)!)
    .find((s) => s.find((x) => x.number === 1 && x.wire === 0)?.value === 1)!
  return parse((slot.find((x) => x.number === 11 && x.wire === 2)!.value as Uint8Array))!
})()
const positionBytes = parse(transformSlot.find((x) => x.number === 1 && x.wire === 2)!.value as Uint8Array)!
const posHex = positionBytes
  .filter((x) => x.wire === 5)
  .map((x) => Buffer.from(x.value as Uint8Array).toString('hex'))
  .join('')
assert.equal(posHex, '4812a4406466c6c0', 'static record position must be written (5.1272,0,-6.2)')
// root6 登记 {400, 1077936141}
assert.ok(
  registryEntries(created.bytes).some(([kind, id]) => kind === 400 && id === 1077936141),
  'registry must gain {400, newStaticId}'
)
// root4 定义不变
assert.equal(wireRecords(resultTop, 4, 1).length, 1, 'root4 must be untouched')
// 名字槽替换生效
const name = (() => {
  const slots = parse(findStatic(records, 1077936141))!.filter(
    (f) => f.number === 5 && f.wire === 2
  )
  for (const slot of slots) {
    const inner = parse(slot.value as Uint8Array)!
    const f11 = inner.find((f) => f.number === 11 && f.wire === 2)
    const nf = f11
      ? parse(f11.value as Uint8Array)!.find((f) => f.number === 1 && f.wire === 2)
      : undefined
    if (nf) return Buffer.from(nf.value as Uint8Array).toString('utf8')
  }
  return undefined
})()
assert.equal(name, '圆柱', 'static record name must be replaced')

// 重复 ID 必须报错（不覆盖已有实例）
assert.throws(
  () => createStaticPrefabInstance(created.bytes, { id: 1077936141, resourceId: 10009008 }),
  /already exists/
)

// —— 3. 真实样本上创建新静态实例，原静态实例逐字节不变（生产路径）——
const sampleCreated = createStaticPrefabInstance(SAMPLE, {
  id: 1077936142,
  resourceId: 10009001,
  name: '长方体'
})
const sampleAfter = root8Records(sampleCreated.bytes)
assert.equal(sampleAfter.length, sampleRecords.length + 1, 'sample root8 must gain exactly one record')
assert.ok(
  sampleAfter.some((r) => Buffer.from(r).equals(Buffer.from(sampleStatic))),
  'sample static instance 1077936140 must stay byte-exact after create'
)
staticRecordAssertions(
  findStatic(sampleAfter, 1077936142),
  1077936142,
  10009001,
  buildStaticPrefabRecord({
    id: 1077936142,
    resourceId: 10009001,
    name: '长方体',
    transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }
  }).length
)
assert.ok(
  registryEntries(sampleCreated.bytes).some(([kind, id]) => kind === 400 && id === 1077936142),
  'sample registry must gain {400, newId}'
)
assert.ok(officialPrefabName(10009008) === '圆柱', 'official name table intact')

// —— 6. createCustomPrefab（动态定义）：root4 定义 + root6 type6 {100, defID} 登记 ——
const custom = createCustomPrefab(fixture, { id: 1077936162, resourceId: 10009002, name: '球体' })
const customTop = topOf(custom.bytes)
const customDef = wireRecords(customTop, 4, 1).find(
  (r) => parse(r)!.find((f) => f.number === 1 && f.wire === 0)?.value === 1077936162
)
assert.ok(customDef, 'custom prefab must create root4 definition')
assert.ok(
  registryEntries(custom.bytes).some(([kind, id]) => kind === 100 && id === 1077936162),
  'custom prefab must register {100, defID} in root6 type6 group'
)
// 不重复登记：再次创建同 ID 应报错
assert.throws(
  () => createCustomPrefab(custom.bytes, { id: 1077936162, resourceId: 10009002 }),
  /already exists/
)

function findStatic(records: readonly Uint8Array[], id: number): Uint8Array {
  const match = records.find(
    (r) => parse(r)!.find((f) => f.number === 1 && f.wire === 0)?.value === id
  )
  assert.ok(match, `static record ${id} must exist`)
  return match
}

console.log('gil_prefabs_static test passed')
