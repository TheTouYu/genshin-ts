import assert from 'node:assert'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { irToGia } from '../../src/compiler/ir_to_gia_transform/index.js'
import { compileTsToGs } from '../../src/compiler/ts_to_gs_pipeline.js'

const root = process.cwd()
const tempRoot = path.join(root, 'tests', '.client-ts-transform-tmp')
const outDir = path.join(tempRoot, 'out')
const fixture = 'scripts/client-nodegraph/fixtures/client_ts_transform.ts'
const helperFixture = 'scripts/client-nodegraph/fixtures/client_ts_transform_helpers.ts'

function relative(file: string) {
  return path.relative(root, file).replace(/\\/g, '/')
}

async function compile(entries: string[]) {
  return compileTsToGs({
    cfgDir: root,
    cfg: {
      compileRoot: '.',
      entries,
      outDir: relative(outDir),
      options: { optimize: { precompileExpression: false, removeUnusedNodes: false } }
    }
  })
}

async function expectCompileError(name: string, source: string, pattern: RegExp) {
  const file = path.join(tempRoot, `${name}.ts`)
  fs.writeFileSync(file, source, 'utf8')
  let error: unknown
  try {
    await compile([relative(file)])
  } catch (caught) {
    error = caught
  }
  assert.ok(error, `${name}: expected compilation to fail`)
  assert.match(String(error), pattern, `${name}: unexpected compilation error`)
}

fs.rmSync(tempRoot, { recursive: true, force: true })
fs.mkdirSync(tempRoot, { recursive: true })

try {
  const result = await compile([fixture, helperFixture])
  assert.strictEqual(result.entryOutFiles.length, 1, 'pure client file must be an entry')
  const output = fs.readFileSync(result.entryOutFiles[0], 'utf8')
  assert.match(output, /^\/\/ @gsts:entry\n/)
  assert.match(output, /\.doubleBranch\(/)
  assert.match(output, /\.__gstsInitLocalVariable\(/)
  assert.match(output, /\.finiteLoop\(/)
  assert.match(output, /\.multipleBranches\(/)
  assert.doesNotMatch(output, /gsts\.f\.(?:doubleBranch|finiteLoop|addition)/)

  await import(`${pathToFileURL(result.entryOutFiles[0]).href}?test=${Date.now()}`)
  const { buildClientGraphRegistriesIRDocuments } = await import('genshin-ts/runtime/core')
  const documents = buildClientGraphRegistriesIRDocuments()
  assert.strictEqual(documents.length, 7, 'fixture must build all seven client graph families')
  const subTypes = documents.map((document) => {
    assert.strictEqual(document.graph.type, 'client')
    if (document.graph.type !== 'client') throw new Error('expected client graph document')
    return document.graph.sub_type
  })
  assert.deepStrictEqual(
    new Set(subTypes),
    new Set([
      'character_skill',
      'character_control_skill',
      'creation_skill',
      'creation_status',
      'creation_status_decision',
      'bool_filter',
      'int_filter'
    ])
  )

  const ir = JSON.stringify(documents)
  for (const nodeType of [
    'double_branch',
    'finite_loop',
    'multiple_branches',
    'get_local_variable',
    'set_local_variable',
    'sine_function'
  ]) {
    assert.ok(ir.includes(`"type":"${nodeType}"`), `missing transformed node ${nodeType}`)
  }

  const protoPath = path.join(
    root,
    'src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto'
  )
  documents.forEach((document, index) => {
    const bytes = irToGia(document, { protoPath })
    assert.ok(bytes.length > 0, `${subTypes[index]}: empty GIA output`)
  })

  const importG = `import { g } from 'genshin-ts/runtime/core'`
  await expectCompileError(
    'mutable-outer-capture',
    `${importG}
let counter = 0n
g.characterSkill().on('start', () => { counter = counter + 1n })`,
    /cannot capture mutable outer variable "counter"/
  )
  fs.writeFileSync(
    path.join(tempRoot, 'mutable-outer-state.ts'),
    'export let sharedCounter = 0n\n',
    'utf8'
  )
  await expectCompileError(
    'imported-mutable-outer-capture',
    `${importG}
import { sharedCounter } from './mutable-outer-state.js'
g.characterSkill().on('start', (_evt, f) => { f.addition(sharedCounter, 1n) })`,
    /cannot capture mutable outer variable "sharedCounter"/
  )
  await expectCompileError(
    'cross-family-call',
    `${importG}
function gstsCharacterSkillShared(value: bigint) { return value + 1n }
g.creationSkill().on('start', () => { gstsCharacterSkillShared(0n) })`,
    /can only be called from the same client graph family/
  )
  await expectCompileError(
    'mismatched-f-namespace',
    `${importG}
g.characterSkill().on('start', () => { gsts.fCreationSkill.addition(1n, 2n) })`,
    /gsts\.fCreationSkill is only available in matching creation_skill/
  )
  await expectCompileError(
    'unsupported-math',
    `${importG}
g.characterSkill().on('start', () => { Math.sqrt(4) })`,
    /Math\.sqrt is not supported in client graph character_skill; available methods: Math\.abs/
  )
  await expectCompileError(
    'unavailable-local-variable',
    `${importG}
g.creationStatus().on('start', () => { let value = 0n; value += 1n })`,
    /client method "initLocalVariable" is not available in creation_status beyond mode/
  )
  await expectCompileError(
    'client-recursion',
    `${importG}
function gstsCharacterSkillA(value: bigint): bigint { return gstsCharacterSkillB(value) }
function gstsCharacterSkillB(value: bigint): bigint { return gstsCharacterSkillA(value) }
g.characterSkill().on('start', () => { gstsCharacterSkillA(0n) })`,
    /client gsts function recursion is not supported/
  )

  console.log('[ok] client TS transform entry, lowering, aliases, GIA, and errors verified')
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true })
}
