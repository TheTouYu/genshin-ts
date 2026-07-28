import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import type { StaticAssemblyPlanV1 } from '../src/compiler/gsts_config.js'
import {
  buildStaticAssemblyFixture,
  FIXTURE_IDS
} from './fixtures/static-assembly/build_fixture.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const directory = mkdtempSync(path.join(tmpdir(), 'gsts-plan-cli-'))
const gilPath = path.join(directory, 'fixture.gil')
const configPath = path.join(directory, 'assemblies.config.mjs')
const outputPath = path.join(directory, 'plan.json')
writeFileSync(gilPath, buildStaticAssemblyFixture())
writeFileSync(
  configPath,
  `export default { assets: { staticAssemblies: [{
  name: 'new', prefabId: 300, templatePrefabId: ${FIXTURE_IDS.definition},
  templateInstanceId: ${FIXTURE_IDS.instance}, templateName: '模板', position: [0,0,0],
  items: [{ resourceId: 10009001, position: [0,0,0] }],
  definitionAuxiliaryIds: [301], instanceAuxiliaryIds: [302]
}] } }\n`
)
const before = statSync(gilPath)
const args = [
  path.join(root, 'bin/gsts.mjs'),
  'assets:static-assemblies',
  'plan',
  '--asset-config',
  configPath,
  '--gil',
  gilPath,
  '--format',
  'json',
  '--output',
  outputPath
]
const first = spawnSync(process.execPath, args, { cwd: directory, encoding: 'utf8' })
assert.equal(first.status, 0, first.stderr)
const plan = JSON.parse(first.stdout) as StaticAssemblyPlanV1
assert.equal(plan.status, 'ready')
assert.ok(existsSync(outputPath))
assert.ok(!first.stdout.includes(directory))
const second = spawnSync(process.execPath, args, { cwd: directory, encoding: 'utf8' })
assert.notEqual(second.status, 0)
assert.match(second.stderr, /output already exists/)
const after = statSync(gilPath)
assert.equal(after.mtimeMs, before.mtimeMs)
assert.equal(after.size, before.size)
console.log('CLI static assembly plan test passed')
