import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import type { StaticAssemblyMapInspectionV1 } from '../src/compiler/gsts_config.js'
import { buildStaticAssemblyFixture } from './fixtures/static-assembly/build_fixture.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const directory = mkdtempSync(path.join(tmpdir(), 'gsts-inspect-'))
const gilPath = path.join(directory, 'fixture.gil')
writeFileSync(gilPath, buildStaticAssemblyFixture())
const before = statSync(gilPath)
const stdout = execFileSync(
  process.execPath,
  [
    path.join(root, 'bin/gsts.mjs'),
    'assets:static-assemblies',
    'inspect',
    '--gil',
    gilPath,
    '--format',
    'json'
  ],
  { cwd: directory, encoding: 'utf8' }
)
const result = JSON.parse(stdout) as StaticAssemblyMapInspectionV1
assert.equal(result.kind, 'gsts.static-assembly.inspection')
assert.deepEqual(result.source.locator, { kind: 'gilFile', displayName: 'fixture.gil' })
assert.equal(result.templateCandidates[0].closureStatus, 'complete')
assert.equal(result.templateCandidates[0].compatibility, 'unknown')
assert.ok(!stdout.includes(directory))
const after = statSync(gilPath)
assert.equal(after.mtimeMs, before.mtimeMs)
assert.equal(after.size, before.size)
console.log('CLI static assembly inspect test passed')
