import assert from 'node:assert/strict'
import { mkdtempSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { listMaps } from '../src/cli/maps.js'

const directory = mkdtempSync(path.join(tmpdir(), 'gsts-maps-'))
const now = Date.parse('2026-07-29T00:30:00.000Z')
for (const [name, content, mtime] of [
  ['12.gil', 'twelve', now - 60_000],
  ['10.gil', 'ten', now - 60_000],
  ['11.gil', 'eleven', now - 30 * 60_000],
  ['bad.gil', 'bad', now]
] as const) {
  const file = path.join(directory, name)
  writeFileSync(file, content)
  utimesSync(file, mtime / 1000, mtime / 1000)
}
const warnings: string[] = []
let reads = 0
const withoutHash = listMaps(
  directory,
  {},
  {
    now: () => now,
    warn: (message) => warnings.push(message),
    readFile: ((..._args: unknown[]) => {
      reads++
      throw new Error('must not read')
    }) as never
  }
)
assert.deepEqual(
  withoutHash.maps.map((map) => map.mapId),
  [10, 12, 11]
)
assert.equal(withoutHash.maps[2].recent, true)
assert.equal(reads, 0)
assert.equal(warnings.length, 1)
assert.ok(!JSON.stringify(withoutHash).includes(directory))
const withHash = listMaps(directory, { includeHash: true }, { now: () => now })
assert.match(withHash.maps[0].sha256!, /^[0-9a-f]{64}$/)
console.log('CLI maps JSON test passed')
