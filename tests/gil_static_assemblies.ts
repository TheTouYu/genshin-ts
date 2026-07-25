import assert from 'node:assert/strict'
import { copyFileSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { applyStaticAssembly } from '../src/cli/gil_static_assemblies.js'

const sourceGilPath = process.argv[2]
const templatePrefabId = Number(process.argv[3])
const prefabId = Number(process.argv[4])
const definitionStart = Number(process.argv[5])
const instanceStart = Number(process.argv[6])

if (
  !sourceGilPath ||
  ![templatePrefabId, prefabId, definitionStart, instanceStart].every(Number.isSafeInteger)
) {
  throw new Error(
    'Usage: tsx tests/gil_static_assemblies.ts <map.gil> <templatePrefabId> <prefabId> <definitionStart> <instanceStart>'
  )
}

const tempDir = mkdtempSync(join(tmpdir(), 'gsts-static-assemblies-'))
const gilPath = join(tempDir, 'assembly.gil')
copyFileSync(sourceGilPath, gilPath)
const source = readFileSync(gilPath)

const assemblyName = `自动测试拼装_${Date.now()}`
const result = applyStaticAssembly({
  gilPath,
  assembly: {
    name: assemblyName,
    prefabId,
    templatePrefabId,
    templateName: '静态拼装H1',
    position: [72, 0, 0],
    items: [
      { resourceId: 10009001, position: [-1.5, 0, 0], scale: [0.25, 2, 0.25] },
      { resourceId: 10009001, position: [1.5, 0, 0], scale: [0.25, 2, 0.25] },
      { resourceId: 10009001, position: [0, 0, 0], scale: [1.5, 0.15, 0.25] },
      { resourceId: 10009001, position: [0, 1.4, 0], scale: [1.5, 0.15, 0.25] }
    ],
    definitionAuxiliaryIds: [
      definitionStart,
      definitionStart + 1,
      definitionStart + 2,
      definitionStart + 3
    ],
    instanceAuxiliaryIds: [instanceStart, instanceStart + 1, instanceStart + 2, instanceStart + 3]
  }
})

assert.equal(result.prefabId, prefabId)
assert.deepEqual(result.definitionAuxiliaryIds, [
  definitionStart,
  definitionStart + 1,
  definitionStart + 2,
  definitionStart + 3
])
assert.deepEqual(result.instanceAuxiliaryIds, [
  instanceStart,
  instanceStart + 1,
  instanceStart + 2,
  instanceStart + 3
])
assert.equal(readFileSync(gilPath).equals(source), true)
assert.notEqual(Buffer.from(result.bytes).compare(source), 0)
const nameBytes = Buffer.from(assemblyName)
let nameOccurrences = 0
for (let offset = Buffer.from(result.bytes).indexOf(nameBytes); offset >= 0; ) {
  nameOccurrences++
  offset = Buffer.from(result.bytes).indexOf(nameBytes, offset + nameBytes.length)
}
assert.equal(nameOccurrences, 2, 'new assembly name must exist in definition and instance')
writeFileSync(gilPath, result.bytes)

assert.throws(
  () =>
    applyStaticAssembly({
      gilPath,
      assembly: {
        name: '冲突 ID',
        prefabId,
        templatePrefabId,
        templateName: '静态拼装H1',
        position: [0, 0, 0],
        items: [{ resourceId: 10009001, position: [0, 0, 0] }],
        definitionAuxiliaryIds: [definitionStart],
        instanceAuxiliaryIds: [instanceStart]
      }
    }),
  /assembly IDs conflict/
)

console.log(
  JSON.stringify(
    {
      sourceGilPath,
      prefabId: result.prefabId,
      definitionAuxiliaryIds: result.definitionAuxiliaryIds,
      instanceAuxiliaryIds: result.instanceAuxiliaryIds,
      sourceUnchanged: true,
      duplicateIdsRejected: true
    },
    null,
    2
  )
)
