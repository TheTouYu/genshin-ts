import assert from 'node:assert/strict'

import { canonicalJson, hashCanonicalJson } from '../src/cli/static_assembly/json.js'
import { createStaticAssemblyPlan } from '../src/cli/static_assembly/plan.js'
import {
  buildStaticAssemblyFixture,
  FIXTURE_IDS
} from './fixtures/static-assembly/build_fixture.js'

assert.equal(canonicalJson({ z: 1, a: [2, { y: 3, x: 4 }] }), '{"a":[2,{"x":4,"y":3}],"z":1}')
assert.equal(
  hashCanonicalJson({ z: 1, a: [2, { y: 3, x: 4 }] }),
  '515ce30ce3b328c1b86ab63b4f6c53a941e02eaf64e4a8dfd30879287bcbec02'
)

const bytes = buildStaticAssemblyFixture()
const assembly = {
  name: '新拼装',
  prefabId: 300,
  templatePrefabId: FIXTURE_IDS.definition,
  templateInstanceId: FIXTURE_IDS.instance,
  templateName: '模板',
  position: [0, 0, 0] as const,
  items: [{ resourceId: 10009001, position: [0, 0, 0] as const }],
  definitionAuxiliaryIds: [301],
  instanceAuxiliaryIds: [302]
}
const input = {
  bytes,
  sourceLocator: { kind: 'gilFile' as const, displayName: 'fixture.gil' },
  assetConfig: { displayName: 'assemblies.config.ts', bytes: new TextEncoder().encode('config') },
  assemblies: [{ resolved: assembly }]
}
const first = createStaticAssemblyPlan(input)
const second = createStaticAssemblyPlan(input)
assert.equal(first.status, 'ready')
assert.deepEqual(first, second)
assert.match(first.planHash, /^[0-9a-f]{64}$/)
const changedBytes = Uint8Array.from(bytes)
changedBytes[7] ^= 1
assert.notEqual(
  createStaticAssemblyPlan({ ...input, bytes: changedBytes }).planHash,
  first.planHash
)
const blocked = createStaticAssemblyPlan({
  ...input,
  assemblies: [{ resolved: { ...assembly, prefabId: FIXTURE_IDS.definition } }]
})
assert.equal(blocked.status, 'blocked')
assert.ok(blocked.errors.some((error) => error.code === 'id-conflict'))
const overlap = createStaticAssemblyPlan({
  ...input,
  assemblies: [
    { resolved: assembly },
    {
      resolved: {
        ...assembly,
        name: 'second',
        prefabId: 400,
        definitionAuxiliaryIds: [301],
        instanceAuxiliaryIds: [402]
      }
    }
  ]
})
assert.equal(overlap.status, 'blocked')
assert.ok(overlap.errors.some((error) => error.code === 'cross-assembly-id-conflict'))
console.log('static assembly plan test passed')
