import assert from 'node:assert/strict'
import { copyFileSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  createLevelVariableTyped,
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
      { key: 'k2', keyType: 'str', value: 3, valueType: 'int' }
    ],
    updated: [
      { key: 'k1', keyType: 'str', value: ['x', 'y'], valueType: 'str_list' },
      { key: 'k2', keyType: 'str', value: 7, valueType: 'int' }
    ],
    expected: { k1: ['x', 'y'], k2: 7 }
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

assert.equal(readFileSync(sourceGilPath).equals(source), true)

console.log(
  JSON.stringify(
    {
      sourceGilPath,
      entityId,
      count: cases.length,
      dictEntityIdsPreserved: dictBaseBefore,
      rename: true,
      ok: true
    },
    null,
    2
  )
)
