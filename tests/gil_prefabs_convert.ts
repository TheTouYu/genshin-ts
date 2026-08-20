import assert from 'node:assert/strict'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

import { convertPrefabStatic, createCustomPrefab } from '../src/cli/gil_prefabs.js'
import {
  parseWireMessage as parse,
  wireRecords
} from '../src/cli/static_assembly/wire.js'
import { buildStaticAssemblyFixture } from './fixtures/static-assembly/build_fixture.js'

// 动态↔静态切换集成测试（2026-08-20 真实样本对）：
// - after-place-sphere-entity.gil：球体动态（定义 f8×6 + 实例 f7×6）+ 球体实体（f7×6）
// - after-reconvert-sphere-static.gil：球体切静态（定义无 f8 + 实例无 f7）+ 实体联动（无 f7）
// convert 输出应与真实样本的 root4/5/8 逐字节一致（root46 语义未闭合，CLI 不写）。

const DYNAMIC_SAMPLE = fileURLToPath(
  new URL('./fixtures/static-assembly/after-place-sphere-entity.gil', import.meta.url)
)
const STATIC_SAMPLE = fileURLToPath(
  new URL('./fixtures/static-assembly/after-reconvert-sphere-static.gil', import.meta.url)
)

function recordsOf(bytes: Uint8Array, rootNo: number): Uint8Array[] {
  const top = parse(bytes.slice(20, -4))
  assert.ok(top, 'GIL payload must parse')
  return wireRecords(top, rootNo, 1)
}

function recordById(records: readonly Uint8Array[], id: number): Uint8Array {
  const match = records.find(
    (r) => parse(r)!.find((f) => f.number === 1 && f.wire === 0)?.value === id
  )
  assert.ok(match, `record ${id} must exist`)
  return match
}

function assertRecordsEqual(
  label: string,
  actual: readonly Uint8Array[],
  expected: readonly Uint8Array[],
  ids: readonly number[]
): void {
  for (const id of ids) {
    const match = actual.find(
      (r) => parse(r)!.find((f) => f.number === 1 && f.wire === 0)?.value === id
    )
    const target = expected.find(
      (r) => parse(r)!.find((f) => f.number === 1 && f.wire === 0)?.value === id
    )
    assert.ok(match && target, `${label}: record ${id} must exist in both`)
    assert.equal(
      Buffer.from(match).toString('hex'),
      Buffer.from(target).toString('hex'),
      `${label}: record ${id} must be byte-exact vs editor sample`
    )
  }
}

const dynamic = new Uint8Array(fs.readFileSync(DYNAMIC_SAMPLE))
const staticSample = new Uint8Array(fs.readFileSync(STATIC_SAMPLE))
// 球体目标记录：定义（root4）/ 实体（root5）/ 实例（root8）
const TARGET_BY_ROOT: Record<number, readonly number[]> = {
  4: [1077936132],
  5: [1077936146],
  8: [1077936144]
}

// —— 1. 动态 → 静态：按定义 ID 转换，目标记录与真实静态样本逐字节一致 ——
const converted = convertPrefabStatic(dynamic, { id: 1077936132, toStatic: true })
assert.equal(converted.definitionId, 1077936132)
assert.equal(converted.entitiesUpdated, 1, 'sphere entity must be linked and updated')
for (const rootNo of [4, 5, 8] as const) {
  assertRecordsEqual(
    `toStatic root${rootNo}`,
    recordsOf(converted.bytes, rootNo),
    recordsOf(staticSample, rootNo),
    TARGET_BY_ROOT[rootNo]
  )
  // 无关记录必须保持不变（等于输入）
  assertRecordsEqual(
    `toStatic untouched root${rootNo}`,
    recordsOf(converted.bytes, rootNo),
    recordsOf(dynamic, rootNo),
    recordsOf(dynamic, rootNo)
      .map((r) => parse(r)!.find((f) => f.number === 1 && f.wire === 0)?.value as number)
      .filter((id) => !TARGET_BY_ROOT[rootNo].includes(id))
  )
}
const sphereInst = recordById(recordsOf(converted.bytes, 8), 1077936144)
assert.equal(parse(sphereInst)!.filter((f) => f.number === 7).length, 0, 'sphere instance must lose f7 slots')
const sphereEntity = recordById(recordsOf(converted.bytes, 5), 1077936146)
assert.equal(parse(sphereEntity)!.filter((f) => f.number === 7).length, 0, 'sphere entity must lose f7 slots')

// —— 2. 静态 → 动态：目标记录与真实动态样本逐字节一致 ——
const back = convertPrefabStatic(staticSample, { id: 1077936132, toStatic: false })
assert.equal(back.entitiesUpdated, 1)
for (const rootNo of [4, 5, 8] as const) {
  assertRecordsEqual(
    `toDynamic root${rootNo}`,
    recordsOf(back.bytes, rootNo),
    recordsOf(dynamic, rootNo),
    TARGET_BY_ROOT[rootNo]
  )
  assertRecordsEqual(
    `toDynamic untouched root${rootNo}`,
    recordsOf(back.bytes, rootNo),
    recordsOf(staticSample, rootNo),
    recordsOf(staticSample, rootNo)
      .map((r) => parse(r)!.find((f) => f.number === 1 && f.wire === 0)?.value as number)
      .filter((id) => !TARGET_BY_ROOT[rootNo].includes(id))
  )
}
const sphereInstDyn = recordById(recordsOf(back.bytes, 8), 1077936144)
assert.equal(parse(sphereInstDyn)!.filter((f) => f.number === 7).length, 6, 'sphere instance must regain 6 official slots')

// —— 3. 按实例 ID 转换（与按定义 ID 等价）——
const byInstance = convertPrefabStatic(dynamic, { id: 1077936144, toStatic: true })
assert.equal(byInstance.definitionId, 1077936132)
assert.equal(byInstance.entitiesUpdated, 1)
for (const rootNo of [4, 5, 8] as const) {
  assertRecordsEqual(`by-instance-id root${rootNo}`, recordsOf(byInstance.bytes, rootNo), recordsOf(staticSample, rootNo), TARGET_BY_ROOT[rootNo])
}

// —— 4. 官方引用式（圆柱 1077936140，无本地定义）：只转换实例，不联动实体 ——
const cylDyn = convertPrefabStatic(staticSample, { id: 1077936140, toStatic: false })
assert.equal(cylDyn.definitionId, undefined, 'official-reference cylinder has no definition')
assert.equal(cylDyn.entitiesUpdated, 0)
const cylInst = recordById(recordsOf(cylDyn.bytes, 8), 1077936140)
assert.equal(parse(cylInst)!.filter((f) => f.number === 7).length, 6, 'cylinder to dynamic gains 6 slots')
const cylBack = convertPrefabStatic(cylDyn.bytes, { id: 1077936140, toStatic: true })
const cylInst2 = recordById(recordsOf(cylBack.bytes, 8), 1077936140)
assert.equal(parse(cylInst2)!.filter((f) => f.number === 7).length, 0, 'cylinder to static drops slots')
assert.equal(
  Buffer.from(cylInst2).toString('hex'),
  Buffer.from(recordById(recordsOf(staticSample, 8), 1077936140)).toString('hex'),
  'cylinder round-trip must be byte-exact'
)

// —— 5. 错误处理 ——
assert.throws(
  () => convertPrefabStatic(dynamic, { id: 999999, toStatic: true }),
  /not found/
)
assert.throws(
  () => convertPrefabStatic(dynamic, { id: 10009002, toStatic: true }),
  /not found/
)
// 定义 ID 也可转换：三棱锥定义 1077936130 在动态样本中是静态形态，切回动态恢复组件槽
const pyramid = convertPrefabStatic(dynamic, { id: 1077936130, toStatic: false })
assert.equal(pyramid.definitionId, 1077936130)
const pyramidInst = recordById(recordsOf(pyramid.bytes, 8), 1077936142)
assert.equal(parse(pyramidInst)!.filter((f) => f.number === 7).length, 6, 'pyramid to dynamic gains 6 slots')

// —— 6. 定义-only 元件（CLI create 动态：root4 定义无页面模型）—— convert 只转定义 ——
const defOnly = createCustomPrefab(buildStaticAssemblyFixture(), {
  id: 1077936190,
  resourceId: 10009002,
  name: '球体'
})
const defOnlyConverted = convertPrefabStatic(defOnly.bytes, { id: 1077936190, toStatic: true })
assert.equal(defOnlyConverted.definitionId, 1077936190)
assert.equal(defOnlyConverted.entitiesUpdated, 0, 'fixture has no referencing entity')
const defOnlyRec = recordById(recordsOf(defOnlyConverted.bytes, 4), 1077936190)
assert.equal(parse(defOnlyRec)!.filter((f) => f.number === 8).length, 0, 'definition-only convert must drop f8 slots')
// 反向：切回动态恢复 6 个官方默认组件槽
const defOnlyBack = convertPrefabStatic(defOnlyConverted.bytes, { id: 1077936190, toStatic: false })
const defOnlyBackRec = recordById(recordsOf(defOnlyBack.bytes, 4), 1077936190)
assert.equal(parse(defOnlyBackRec)!.filter((f) => f.number === 8).length, 6, 'definition-only convert back must regain 6 f8 slots')

console.log('gil_prefabs_convert test passed')
