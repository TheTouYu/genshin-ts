import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { loadGstsConfig } from '../src/compiler/config_loader.js'
import {
  buildStaticAssemblyFixture,
  FIXTURE_IDS
} from './fixtures/static-assembly/build_fixture.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const directory = mkdtempSync(path.join(tmpdir(), 'gsts-config-routing-'))
const gilPath = path.join(directory, 'fixture.gil')
writeFileSync(gilPath, buildStaticAssemblyFixture())
const body = `export default { compileRoot: '.', entries: [], outDir: './dist', assets: {
  staticAssemblies: [{ name: 'new', prefabId: 300, templatePrefabId: ${FIXTURE_IDS.definition},
    templateInstanceId: ${FIXTURE_IDS.instance}, templateName: '模板', position: [0,0,0],
    items: [{ resourceId: 10009001, position: [0,0,0] }],
    definitionAuxiliaryIds: [301], instanceAuxiliaryIds: [302] }]
} }\n`
const mjs = path.join(directory, 'asset.mjs')
const ts = path.join(directory, 'asset.ts')
writeFileSync(mjs, body)
writeFileSync(ts, body)
for (const configPath of [mjs, ts]) {
  const result = spawnSync(
    process.execPath,
    [
      path.join(root, 'bin/gsts.mjs'),
      'assets:static-assemblies',
      'plan',
      '--asset-config',
      configPath,
      '--gil',
      gilPath,
      '--format',
      'json'
    ],
    { cwd: directory, encoding: 'utf8' }
  )
  assert.equal(result.status, 0, result.stderr)
  assert.equal(JSON.parse(result.stdout).status, 'ready')
}
const rootConfig = path.join(directory, 'project.mjs')
writeFileSync(rootConfig, `export default { inject: {} }\n`)
const rootBeforeCommand = spawnSync(
  process.execPath,
  [
    path.join(root, 'bin/gsts.mjs'),
    '-c',
    rootConfig,
    'assets:static-assemblies',
    'plan',
    '--asset-config',
    mjs,
    '--gil',
    gilPath,
    '--format',
    'json'
  ],
  { cwd: directory, encoding: 'utf8' }
)
assert.equal(rootBeforeCommand.status, 0, rootBeforeCommand.stderr)
assert.equal(JSON.parse(rootBeforeCommand.stdout).status, 'ready')
await assert.rejects(() => loadGstsConfig(mjs), /profile=compile.*entries/s)
const project = await loadGstsConfig(mjs, { profile: 'project' })
assert.ok(project.assets)
const conflict = spawnSync(
  process.execPath,
  [
    path.join(root, 'bin/gsts.mjs'),
    'assets:static-assemblies',
    'plan',
    '--asset-config',
    mjs,
    '--config',
    ts,
    '--gil',
    gilPath
  ],
  { cwd: directory, encoding: 'utf8' }
)
assert.notEqual(conflict.status, 0)
assert.match(conflict.stderr, /specify different files/)
console.log('CLI static assembly config routing test passed')
