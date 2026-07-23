import assert from 'node:assert/strict'
import { copyFileSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  applyCustomPrefabInitialCustomVariableDeclarations,
  readCharacterInitialCustomVariables,
  syncCharacterCustomVariableDeclarations
} from '../src/cli/gil_custom_variables.js'

const sourceGilPath = process.argv[2]
const characterPrefabId = Number(process.argv[3])

if (!sourceGilPath || !Number.isSafeInteger(characterPrefabId)) {
  throw new Error('Usage: tsx tests/gil_character_custom_variables.ts <map.gil> <character-prefab-id>')
}

const tempDir = mkdtempSync(join(tmpdir(), 'gsts-gil-character-variables-'))
const gilPath = join(tempDir, 'character.gil')
copyFileSync(sourceGilPath, gilPath)
const source = readFileSync(gilPath)

const testSuffix = `gsts_character_test_${Date.now()}`
const declarations = [
  { name: `${testSuffix}_label`, type: 'str' as const, initialValue: '角色变量注入-测试' },
  {
    name: `${testSuffix}_tags`,
    type: 'str_list' as const,
    initialValue: ['角色', '变量注入', '测试']
  }
]

const declarationResult = applyCustomPrefabInitialCustomVariableDeclarations({
  gilPath,
  prefabId: characterPrefabId,
  declarations
})
writeFileSync(gilPath, declarationResult.bytes)

const syncResult = syncCharacterCustomVariableDeclarations({
  gilPath,
  characterPrefabId,
  declarations
})
writeFileSync(gilPath, syncResult.bytes)

const readBack = readCharacterInitialCustomVariables({ gilPath, characterPrefabId })
for (const declaration of declarations) {
  const variable = readBack.variables.find((entry) => entry.name === declaration.name)
  assert.equal(variable?.type, declaration.type)
  assert.ok(variable?.initialValueWire.length)
}
assert.equal(syncResult.synchronizedInstanceCount, 1)

const secondDeclaration = applyCustomPrefabInitialCustomVariableDeclarations({
  gilPath,
  prefabId: characterPrefabId,
  declarations
})
writeFileSync(gilPath, secondDeclaration.bytes)
const secondSync = syncCharacterCustomVariableDeclarations({
  gilPath,
  characterPrefabId,
  declarations
})

assert.deepEqual(secondDeclaration.changed, [])
assert.deepEqual(secondSync.changed, [])
assert.equal(secondSync.synchronizedInstanceCount, 0)
assert.equal(readFileSync(sourceGilPath).equals(source), true)

console.log(
  JSON.stringify(
    {
      sourceGilPath,
      characterPrefabId,
      declarations: declarationResult.changed,
      synchronizedInstanceCount: syncResult.synchronizedInstanceCount,
      idempotent: true
    },
    null,
    2
  )
)
