import assert from 'node:assert/strict'
import { copyFileSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  createLevelVariableTyped,
  dictMapMarker,
  listLevelVariables,
  nextEntityBaseId,
  uiVarTypeFromCode,
  updateLevelVariable,
  type UiDictPair,
  type UiVarType
} from '../src/cli/gil_level_variables.js'

const sourceGilPath = process.argv[2]
const entityId = Number(process.argv[3])

if (!sourceGilPath || !Number.isSafeInteger(entityId)) {
  throw new Error('Usage: tsx tests/gil_level_variables_full.ts <map.gil> <entity-id>')
}

const tempDir = mkdtempSync(join(tmpdir(), 'gsts-gil-level-variables-full-'))
const gilPath = join(tempDir, 'map.gil')
copyFileSync(sourceGilPath, gilPath)
const source = readFileSync(gilPath)

const suffix = `gstslv_${Date.now()}`

type Case = { type: UiVarType; initial: unknown; updated: unknown; expected: unknown }
const cases: Case[] = [
  { type: 'entity', initial: 111, updated: 999, expected: 999 },
  { type: 'guid', initial: 222, updated: 888, expected: 888 },
  { type: 'int', initial: 10, updated: 77, expected: 77 },
  { type: 'bool', initial: true, updated: false, expected: false },
  { type: 'float', initial: 1.25, updated: 3.5, expected: 3.5 },
  { type: 'str', initial: 'hello', updated: 'world', expected: 'world' },
  { type: 'vec3', initial: [1, 2, 3], updated: [7, 8, 9], expected: [7, 8, 9] },
  { type: 'guid_list', initial: [1, 2], updated: [3, 4], expected: [3, 4] },
  { type: 'int_list', initial: [5, 6, 7], updated: [8, 9], expected: [8, 9] },
  { type: 'bool_list', initial: [true, false], updated: [false, true], expected: [false, true] },
  { type: 'float_list', initial: [1.5, 2.5], updated: [0.5, 1.5], expected: [0.5, 1.5] },
  { type: 'str_list', initial: ['a', 'b'], updated: ['x', 'y'], expected: ['x', 'y'] },
  { type: 'entity_list', initial: [10, 20], updated: [30, 40], expected: [30, 40] },
  {
    type: 'vec3_list',
    initial: [[1, 2, 3], [4, 5, 6]],
    updated: [[9, 8, 7], [6, 5, 4]],
    expected: [[9, 8, 7], [6, 5, 4]]
  },
  { type: 'faction', initial: 7, updated: 70, expected: 70 },
  { type: 'config_id', initial: 8, updated: 80, expected: 80 },
  { type: 'prefab_id', initial: 9, updated: 90, expected: 90 },
  { type: 'config_id_list', initial: [1, 2], updated: [10, 20], expected: [10, 20] },
  { type: 'prefab_id_list', initial: [3, 4], updated: [30, 40], expected: [30, 40] },
  { type: 'faction_list', initial: [5, 6], updated: [50, 60], expected: [50, 60] },
  {
    type: 'dict',
    initial: [
      { key: 'k1', keyType: 'str', value: ['a', 'b'], valueType: 'str_list' },
      { key: 'k2', keyType: 'str', value: ['c', 'd'], valueType: 'str_list' }
    ],
    updated: [
      { key: 'k1', keyType: 'str', value: ['x', 'y'], valueType: 'str_list' },
      { key: 'k2', keyType: 'str', value: ['z'], valueType: 'str_list' }
    ],
    expected: { k1: ['x', 'y'], k2: ['z'] }
  }
]

// 1. create 全部 21 种类型
let bytes: Uint8Array = new Uint8Array(readFileSync(gilPath))
for (const c of cases) {
  bytes = createLevelVariableTyped(bytes, `${suffix}_${c.type}`, c.type, c.initial, entityId).bytes
}
writeFileSync(gilPath, bytes)
bytes = new Uint8Array(readFileSync(gilPath))

let list = listLevelVariables(bytes, entityId)
for (const c of cases) {
  const name = `${suffix}_${c.type}`
  const v = list.find((x) => x.name === name)
  assert.ok(v, `missing created ${c.type}`)
  assert.equal(uiVarTypeFromCode(v.typeCode), c.type, `typeCode mismatch for ${c.type}`)
}

// 2. 全类型值更新；dict 更新不得泄漏新的 Map25 场景实体
const dictBaseBefore = nextEntityBaseId(bytes)
for (const c of cases) {
  bytes = updateLevelVariable(bytes, `${suffix}_${c.type}`, { value: c.updated }, entityId).bytes
}
assert.equal(
  nextEntityBaseId(bytes),
  dictBaseBefore,
  'dict update leaked new Map25 scene entities (entity IDs not preserved)'
)
writeFileSync(gilPath, bytes)

// 3. 回读校验
list = listLevelVariables(new Uint8Array(readFileSync(gilPath)), entityId)
for (const c of cases) {
  const name = `${suffix}_${c.type}`
  const v = list.find((x) => x.name === name)
  assert.ok(v, `missing updated ${c.type}`)
  assert.deepEqual(v.value, c.expected, `read-back mismatch for ${c.type}`)
}

// 4. 改名保留
bytes = updateLevelVariable(
  bytes,
  `${suffix}_str`,
  { newName: `${suffix}_str_renamed` },
  entityId
).bytes
writeFileSync(gilPath, bytes)
list = listLevelVariables(new Uint8Array(readFileSync(gilPath)), entityId)
assert.ok(list.some((x) => x.name === `${suffix}_str_renamed`), 'rename target missing')
assert.ok(!list.some((x) => x.name === `${suffix}_str`), 'old name still present')

// 5. int-key dict：创建/更新/回读（marker 56 int→str_list、43 int→int，编辑器样本锁定）
const intKeyDictName = `${suffix}_dict_int`
bytes = createLevelVariableTyped(
  bytes,
  intKeyDictName,
  'dict',
  [
    { key: 1, keyType: 'int', value: ['A', 'B'], valueType: 'str_list' },
    { key: 2, keyType: 'int', value: ['C'], valueType: 'str_list' }
  ],
  entityId
).bytes
bytes = updateLevelVariable(
  bytes,
  intKeyDictName,
  {
    value: [
      { key: 1, keyType: 'int', value: ['X'], valueType: 'str_list' },
      { key: 2, keyType: 'int', value: ['Y', 'Z'], valueType: 'str_list' }
    ]
  },
  entityId
).bytes
writeFileSync(gilPath, bytes)
list = listLevelVariables(new Uint8Array(readFileSync(gilPath)), entityId)
assert.deepEqual(list.find((x) => x.name === intKeyDictName)?.value, { 1: ['X'], 2: ['Y', 'Z'] })

const intIntDictName = `${suffix}_dict_intint`
bytes = createLevelVariableTyped(
  bytes,
  intIntDictName,
  'dict',
  [
    { key: 1, keyType: 'int', value: 3, valueType: 'int' },
    { key: 2, keyType: 'int', value: 4, valueType: 'int' }
  ],
  entityId
).bytes
bytes = updateLevelVariable(
  bytes,
  intIntDictName,
  {
    value: [
      { key: 1, keyType: 'int', value: 7, valueType: 'int' },
      { key: 2, keyType: 'int', value: 9, valueType: 'int' }
    ]
  },
  entityId
).bytes
writeFileSync(gilPath, bytes)
list = listLevelVariables(new Uint8Array(readFileSync(gilPath)), entityId)
assert.deepEqual(list.find((x) => x.name === intIntDictName)?.value, { 1: 7, 2: 9 })

// 6. dict marker 表锁定（编辑器真实样本 after-dict-*.gil，2026-08-18）
assert.equal(dictMapMarker(3, 3), 43, 'int→int marker（after-dict-keytypes 新增变量5）')
assert.equal(dictMapMarker(3, 11), 56, 'int→str_list marker（after-dict-keytypes 新增变量11）')
assert.equal(dictMapMarker(6, 3), 63, 'str→int marker（after-dict-int-values 新增变量1）')
assert.equal(dictMapMarker(6, 11), 76, 'str→str_list marker（after-int-key-dict 新增变量1）')

// 7. 混合键/混合值 fail closed（官方：一个字典 = 一种键类型 + 一种值类型）
assert.throws(
  () =>
    createLevelVariableTyped(
      bytes,
      `${suffix}_dict_mixed_keys`,
      'dict',
      [
        { key: 1, keyType: 'int', value: ['a'], valueType: 'str_list' },
        { key: 'k2', keyType: 'str', value: ['b'], valueType: 'str_list' }
      ],
      entityId
    ),
  /mixed dict key types/
)
assert.throws(
  () =>
    createLevelVariableTyped(
      bytes,
      `${suffix}_dict_mixed_values`,
      'dict',
      [
        { key: 'k1', keyType: 'str', value: ['a'], valueType: 'str_list' },
        { key: 'k2', keyType: 'str', value: 3, valueType: 'int' }
      ],
      entityId
    ),
  /mixed dict value types/
)

assert.equal(readFileSync(sourceGilPath).equals(source), true)

console.log(
  JSON.stringify(
    {
      sourceGilPath,
      entityId,
      count: cases.length,
      dictEntityIdsPreserved: dictBaseBefore,
      rename: true,
      intKeyDict: true,
      intIntDict: true,
      dictMarkerLocked: true,
      mixedPairsRejected: true,
      ok: true
    },
    null,
    2
  )
)
