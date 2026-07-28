import assert from 'node:assert/strict'

import { analyzeStaticAssemblyClosure } from '../src/cli/static_assembly/closure.js'
import { createStaticAssemblyMapIndex } from '../src/cli/static_assembly/map_index.js'
import {
  buildStaticAssemblyFixture,
  FIXTURE_IDS
} from './fixtures/static-assembly/build_fixture.js'

const bytes = buildStaticAssemblyFixture()
const index = createStaticAssemblyMapIndex(bytes)
assert.deepEqual(index.occupiedIds.prefabs, [FIXTURE_IDS.definition])
assert.deepEqual(index.occupiedIds.instances, [FIXTURE_IDS.instance])
assert.deepEqual(index.occupiedIds.definitionAuxiliaries, [FIXTURE_IDS.definitionAuxiliary])
assert.deepEqual(index.occupiedIds.instanceAuxiliaries, [FIXTURE_IDS.instanceAuxiliary])
assert.equal(index.definitions[0].name, '模板')
assert.equal(index.instances[0].definitionId, FIXTURE_IDS.definition)
assert.deepEqual(index.instances[0].transform?.position, [1, 2, 3])
assert.ok(index.ownerRegistryIds.includes(FIXTURE_IDS.definition))
const closure = analyzeStaticAssemblyClosure(index, {
  definitionId: FIXTURE_IDS.definition,
  instanceId: FIXTURE_IDS.instance,
  name: '模板'
})
assert.equal(closure.status, 'complete')
assert.equal(closure.definitionAuxiliaries.length, 1)
assert.equal(closure.instanceAuxiliaries.length, 1)
console.log('static assembly map index test passed')
