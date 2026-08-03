import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import {
  loadStaticAssemblyStructure,
  resolveStaticAssemblyStructure
} from '../src/cli/static_assembly_structure.js'
import type { GstsStaticAssembly } from '../src/compiler/gsts_config.js'

const directory = mkdtempSync(path.join(tmpdir(), 'gsts-static-assembly-structure-'))
const structurePath = path.join(directory, 'model.json')
const valid = {
  schemaVersion: 1,
  color: { enabled: true, rgb: 0xff0000, opacity: 50, overlay: 'multiply' },
  components: [
    { type: 'followMotion', preset: 'fullFollow' },
    { type: 'basicMotion', preset: 'default' },
    { type: 'tabBar', regionName: '区域1', options: ['U', 'R', 'F'] }
  ],
  items: [
    {
      resourceId: 10009001,
      position: [1, 2, 3],
      rotation: [0, 0, 45],
      scale: [1, 2, 1],
      color: { enabled: false }
    }
  ]
}
writeFileSync(structurePath, JSON.stringify(valid))
const source = readFileSync(structurePath)

const loaded = loadStaticAssemblyStructure('./model.json', directory)
assert.deepEqual(loaded, valid)
assert.equal(
  readFileSync(structurePath).equals(source),
  true,
  'loading must not modify the structure'
)

const target = {
  name: '文件结构',
  prefabId: 1,
  templatePrefabId: 2,
  templateInstanceId: 3,
  templateName: '模板',
  position: [0, 0, 0],
  structureFile: './model.json',
  definitionAuxiliaryIds: [4],
  instanceAuxiliaryIds: [5]
} satisfies GstsStaticAssembly
const normalized = resolveStaticAssemblyStructure(target, path.join(directory, 'gsts.config.ts'))
assert.deepEqual(normalized.items, valid.items)
assert.deepEqual(normalized.color, valid.color)
assert.deepEqual(normalized.components, valid.components)
assert.equal('structureFile' in normalized, false)
assert.throws(
  () =>
    resolveStaticAssemblyStructure(
      { ...target, items: valid.items } as unknown as GstsStaticAssembly,
      path.join(directory, 'gsts.config.ts')
    ),
  /structureFile.*items.*mutually exclusive/i
)
assert.throws(
  () =>
    resolveStaticAssemblyStructure(
      { ...target, color: valid.color } as unknown as GstsStaticAssembly,
      path.join(directory, 'gsts.config.ts')
    ),
  /structureFile.*color.*mutually exclusive/i
)
assert.throws(
  () =>
    resolveStaticAssemblyStructure(
      { ...target, components: valid.components } as unknown as GstsStaticAssembly,
      path.join(directory, 'gsts.config.ts')
    ),
  /structureFile.*components.*mutually exclusive/i
)

function rejects(name: string, value: unknown, pattern: RegExp): void {
  writeFileSync(structurePath, typeof value === 'string' ? value : JSON.stringify(value))
  assert.throws(() => loadStaticAssemblyStructure('./model.json', directory), pattern, name)
}

rejects('malformed JSON', '{', /model\.json.*invalid JSON/i)
rejects('unknown schema version', { ...valid, schemaVersion: 2 }, /schemaVersion.*1/i)
rejects('empty items', { ...valid, items: [] }, /items.*at least one/i)
rejects(
  'non-finite transform',
  { ...valid, items: [{ resourceId: 1, position: [0, 'Infinity', 0] }] },
  /items\[0\]\.position\[1\].*finite number/i
)
rejects(
  'invalid color',
  { ...valid, color: { enabled: true, rgb: 0x1000000, opacity: 50, overlay: 'overwrite' } },
  /color\.rgb.*0x000000.*0xFFFFFF/i
)
rejects(
  'unknown overlay',
  { ...valid, color: { enabled: true, rgb: 0, opacity: 50, overlay: 'screen' } },
  /color\.overlay.*overwrite.*multiply/i
)
rejects(
  'unknown component preset',
  { ...valid, components: [{ type: 'followMotion', preset: 'positionOnly' }] },
  /components\[0\]\.preset.*fullFollow/i
)
rejects(
  'tabBar missing options',
  { ...valid, components: [{ type: 'tabBar', regionName: '区域1' }] },
  /components\[0\]\.options.*non-empty/i
)
rejects(
  'tabBar empty option',
  { ...valid, components: [{ type: 'tabBar', regionName: '区域1', options: ['U', ''] }] },
  /components\[0\]\.options.*non-empty/i
)
rejects(
  'tabBar unknown field',
  { ...valid, components: [{ type: 'tabBar', regionName: '区域1', options: ['U'], preset: 'x' }] },
  /components\[0\]\.preset.*omitted/i
)
rejects(
  'duplicate components',
  { ...valid, components: [...valid.components, ...valid.components] },
  /components.*duplicate/i
)
rejects('unknown field', { ...valid, mapId: 1 }, /mapId.*unknown field/i)

console.log('static assembly structure tests passed')
