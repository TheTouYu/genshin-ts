import assert from 'node:assert/strict'
import { copyFileSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  applyCustomPrefabInitialCustomVariableDeclarations,
  applyEntityCustomVariableDeclarations,
  decodeCustomVariableValue,
  readCustomPrefabInitialCustomVariables,
  readEntityCustomVariables,
  type CustomVariableDeclaration
} from '../src/cli/gil_custom_variables.js'

const sourceGilPath = process.argv[2]
const entityId = Number(process.argv[3])
const prefabId = Number(process.argv[4])

if (!sourceGilPath || !Number.isSafeInteger(entityId) || !Number.isSafeInteger(prefabId)) {
  throw new Error('Usage: tsx tests/gil_custom_variables_full.ts <map.gil> <entity-id> <prefab-id>')
}

const tempDir = mkdtempSync(join(tmpdir(), 'gsts-gil-custom-variables-full-'))
const gilPath = join(tempDir, 'map.gil')
copyFileSync(sourceGilPath, gilPath)
const source = readFileSync(gilPath)

const suffix = `gsts_full_${Date.now()}`

// 覆盖全部 21 种 UiVarType（含 dict 列表值）
const declarations: readonly CustomVariableDeclaration[] = [
  { name: `${suffix}_entity`, type: 'entity', initialValue: 123 },
  { name: `${suffix}_guid`, type: 'guid', initialValue: 456 },
  { name: `${suffix}_int`, type: 'int', initialValue: 42n },
  { name: `${suffix}_bool`, type: 'bool', initialValue: true },
  { name: `${suffix}_float`, type: 'float', initialValue: 1.5 },
  { name: `${suffix}_str`, type: 'str', initialValue: 'hello' },
  { name: `${suffix}_vec3`, type: 'vec3', initialValue: [1, 2, 3] as const },
  { name: `${suffix}_guid_list`, type: 'guid_list', initialValue: [1, 2] },
  { name: `${suffix}_int_list`, type: 'int_list', initialValue: [1n, 2n, 3n] },
  { name: `${suffix}_bool_list`, type: 'bool_list', initialValue: [true, false] },
  { name: `${suffix}_float_list`, type: 'float_list', initialValue: [1.5, 2.5] },
  { name: `${suffix}_str_list`, type: 'str_list', initialValue: ['a', 'b'] },
  { name: `${suffix}_entity_list`, type: 'entity_list', initialValue: [10, 20] },
  {
    name: `${suffix}_vec3_list`,
    type: 'vec3_list',
    initialValue: [
      [1, 2, 3],
      [4, 5, 6]
    ] as const
  },
  { name: `${suffix}_faction`, type: 'faction', initialValue: 7 },
  { name: `${suffix}_config_id`, type: 'config_id', initialValue: 8 },
  { name: `${suffix}_prefab_id`, type: 'prefab_id', initialValue: 9 },
  { name: `${suffix}_config_id_list`, type: 'config_id_list', initialValue: [1, 2] },
  { name: `${suffix}_prefab_id_list`, type: 'prefab_id_list', initialValue: [3, 4] },
  { name: `${suffix}_faction_list`, type: 'faction_list', initialValue: [5, 6] },
  {
    name: `${suffix}_dict`,
    type: 'dict',
    initialValue: [
      { key: 'k1', keyType: 'str', value: ['a', 'b'], valueType: 'str_list' },
      { key: 'k2', keyType: 'str', value: ['c', 'd'], valueType: 'str_list' }
    ]
  },
  {
    name: `${suffix}_dict_int`,
    type: 'dict',
    initialValue: [
      { key: '1', keyType: 'int', value: ['A'], valueType: 'str_list' },
      { key: '2', keyType: 'int', value: ['B'], valueType: 'str_list' }
    ]
  }
]

const expected: Record<string, unknown> = {
  [`${suffix}_entity`]: 123,
  [`${suffix}_guid`]: 456,
  [`${suffix}_int`]: 42,
  [`${suffix}_bool`]: true,
  [`${suffix}_float`]: 1.5,
  [`${suffix}_str`]: 'hello',
  [`${suffix}_vec3`]: [1, 2, 3],
  [`${suffix}_guid_list`]: [1, 2],
  [`${suffix}_int_list`]: [1, 2, 3],
  [`${suffix}_bool_list`]: [true, false],
  [`${suffix}_float_list`]: [1.5, 2.5],
  [`${suffix}_str_list`]: ['a', 'b'],
  [`${suffix}_entity_list`]: [10, 20],
  [`${suffix}_vec3_list`]: [
    [1, 2, 3],
    [4, 5, 6]
  ],
  [`${suffix}_faction`]: 7,
  [`${suffix}_config_id`]: 8,
  [`${suffix}_prefab_id`]: 9,
  [`${suffix}_config_id_list`]: [1, 2],
  [`${suffix}_prefab_id_list`]: [3, 4],
  [`${suffix}_faction_list`]: [5, 6],
  [`${suffix}_dict`]: { k1: ['a', 'b'], k2: ['c', 'd'] },
  [`${suffix}_dict_int`]: { 1: ['A'], 2: ['B'] }
}

// 1. 场景实体：声明 21 种类型 → 回读逐项校验
const entityResult = applyEntityCustomVariableDeclarations({ gilPath, entityId, declarations })
writeFileSync(gilPath, entityResult.bytes)
assert.equal(entityResult.changed.length, declarations.length)

let readBack = readEntityCustomVariables({ gilPath, entityId })
const readNames = new Set(readBack.variables.map((definition) => definition.name))
for (const declaration of declarations) {
  assert.ok(readNames.has(declaration.name), `missing entity variable ${declaration.name}`)
  const definition = readBack.variables.find((item) => item.name === declaration.name)!
  assert.equal(definition.type, declaration.type)
  assert.deepEqual(decodeCustomVariableValue(definition), expected[declaration.name])
}

// 2. 幂等：重复声明同一批 → changed=0，文件不变化
const beforeIdempotent = readFileSync(gilPath)
const idempotent = applyEntityCustomVariableDeclarations({ gilPath, entityId, declarations })
writeFileSync(gilPath, idempotent.bytes)
assert.equal(idempotent.changed.length, 0)
assert.deepEqual(readFileSync(gilPath), beforeIdempotent)

// 3. 更新：修改 int 与 dict
const updateResult = applyEntityCustomVariableDeclarations({
  gilPath,
  entityId,
  declarations: [
    { name: `${suffix}_int`, type: 'int', initialValue: 99n },
    {
      name: `${suffix}_dict`,
      type: 'dict',
      initialValue: [
        { key: 'k1', keyType: 'str', value: ['x'], valueType: 'str_list' },
        { key: 'k2', keyType: 'str', value: ['z'], valueType: 'str_list' }
      ]
    }
  ]
})
writeFileSync(gilPath, updateResult.bytes)
assert.equal(updateResult.changed.length, 2)
readBack = readEntityCustomVariables({ gilPath, entityId })
const updatedInt = readBack.variables.find((item) => item.name === `${suffix}_int`)!
const updatedDict = readBack.variables.find((item) => item.name === `${suffix}_dict`)!
assert.deepEqual(decodeCustomVariableValue(updatedInt), 99)
assert.deepEqual(decodeCustomVariableValue(updatedDict), { k1: ['x'], k2: ['z'] })

// 4. 元件（prefab root4.1.8.11）：dict + 标量 + 列表声明
const prefabDeclarations: readonly CustomVariableDeclaration[] = [
  { name: `${suffix}_p_str`, type: 'str', initialValue: 'hello' },
  { name: `${suffix}_p_int_list`, type: 'int_list', initialValue: [1n, 2n, 3n] },
  {
    name: `${suffix}_p_dict`,
    type: 'dict',
    initialValue: [
      { key: 'k1', keyType: 'str', value: ['a', 'b'], valueType: 'str_list' },
      { key: 'k2', keyType: 'str', value: ['c', 'd'], valueType: 'str_list' }
    ]
  }
]
const prefabResult = applyCustomPrefabInitialCustomVariableDeclarations({
  gilPath,
  prefabId,
  declarations: prefabDeclarations
})
writeFileSync(gilPath, prefabResult.bytes)
assert.equal(prefabResult.changed.length, prefabDeclarations.length)
const prefabReadBack = readCustomPrefabInitialCustomVariables({ gilPath, prefabId })
for (const declaration of prefabDeclarations) {
  const definition = prefabReadBack.variables.find((item) => item.name === declaration.name)
  assert.ok(definition, `missing prefab variable ${declaration.name}`)
  assert.equal(definition.type, declaration.type)
}

assert.equal(readFileSync(sourceGilPath).equals(source), true)

console.log(
  JSON.stringify(
    {
      sourceGilPath,
      entityId,
      prefabId,
      entityChanged: entityResult.changed.length,
      idempotent: true,
      updateChanged: updateResult.changed.length,
      prefabChanged: prefabResult.changed.length,
      ok: true
    },
    null,
    2
  )
)
