import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import type { Diagnostic } from '../src/diagnostics.js'

const { compileTsToGs } = await import('../dist/src/compiler/ts_to_gs_pipeline.js' as string)
const { emitIrJsonForEntries } = await import(
  '../dist/src/compiler/gs_to_ir_json_transform/index.js' as string
)

const source = `
import { g } from 'genshin-ts/runtime/core'

const branchComposite = g.defineComposite('diagnostic provenance composite', {
  build(_args, f) {
    f.doubleBranch(bool(true), () => f.printString('yes'), () => f.printString('no'))
    f.printString('composite continuation')
    return {}
  }
})

g.server({ name: 'diagnostic provenance', id: 1073742420 }).on(
  'whenEntityIsCreated',
  (_event, f) => {
    if (bool(true)) f.printString('user branch')
    else if (bool(false)) f.printString('user else-if')
    f.printString('user continuation')

    const captured = 'timer capture'
    setTimeout(() => {
      if (bool(true)) f.printString(captured)
      f.printString('timer continuation')
    }, 1000)

    f.callComposite(branchComposite, {})
  }
)
`

const dir = fs.mkdtempSync(path.join(process.cwd(), '.tmp-diagnostic-provenance-'))
const entryFile = path.join(dir, 'fixture.ts')
const outDir = path.join(dir, 'out')
const warningsFile = path.join(dir, 'warnings.json')
fs.writeFileSync(entryFile, source)

try {
  const result = await compileTsToGs({
    cfgDir: process.cwd(),
    cfg: {
      compileRoot: '.',
      entries: [path.relative(process.cwd(), entryFile)],
      outDir: path.relative(process.cwd(), outDir),
      options: { optimize: { precompileExpression: false, removeUnusedNodes: false } }
    }
  })

  process.env.GSTS_WARNINGS_FILE = warningsFile
  await emitIrJsonForEntries(result.entryOutFiles, {
    maxParallel: 1,
    cwd: process.cwd(),
    runtimeOptions: { precompileExpression: false, removeUnusedNodes: false }
  })

  const diagnostics = JSON.parse(fs.readFileSync(warningsFile, 'utf8')) as Diagnostic[]
  const warnings = diagnostics.filter(
    (diagnostic) => diagnostic.code === 'GSTS-MULTI-OUTFLOW-DEFAULT-CONTINUATION'
  )
  assert.ok(warnings.length >= 3, JSON.stringify(warnings, null, 2))

  for (const diagnostic of warnings) {
    const actual = diagnostic as Diagnostic & {
      originKind?: string
      context?: { callback?: string; event?: string; timer?: string; composite?: string }
    }
    assert.equal(diagnostic.source, actual.originKind === 'user' ? 'user' : 'generated')
    assert.equal(actual.entryFile, entryFile)
    assert.equal(actual.location?.file, entryFile)
    assert.equal(typeof actual.location?.line, 'number')
    assert.equal(typeof actual.location?.column, 'number')
    assert.match(actual.originKind ?? '', /^(user|lowering|runtime-helper)$/)
  }

  const contexts = warnings.map(
    (diagnostic) =>
      (
        diagnostic as Diagnostic & {
          context?: { callback?: string; event?: string; timer?: string; composite?: string }
        }
      ).context
  )
  assert.ok(contexts.some((context) => context?.event === 'whenEntityIsCreated'))
  assert.ok(contexts.some((context) => context?.timer === 'timeout'))
  assert.ok(contexts.some((context) => context?.composite === 'diagnostic provenance composite'))
  assert.ok(
    warnings.some(
      (diagnostic) =>
        (diagnostic as Diagnostic & { originKind?: string }).originKind === 'runtime-helper'
    )
  )
} finally {
  delete process.env.GSTS_WARNINGS_FILE
  fs.rmSync(dir, { recursive: true, force: true })
}

console.log('PASS Stage 1→Stage 2 diagnostics preserve source provenance')
