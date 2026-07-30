import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import ts from 'typescript'

const root = path.resolve(import.meta.dirname, '../..')
const fixturePath = path.join(root, 'tests/composite/.tmp-composite-build-input-types.ts')
const source = `
import { g } from '../../dist/src/runtime/core.js'
import type { EntityValue, IntValue, Vec3Value } from '../../dist/src/runtime/value.js'

type IsAny<T> = 0 extends 1 & T ? true : false
type AssertFalse<T extends false> = T

const typedComposite = g.defineComposite('composite build input types', {
  inputs: {
    pivot: { type: 'entity' },
    offset: { type: 'vec3' },
    count: { type: 'int' }
  },
  outputs: {
    pivot: { type: 'entity' },
    offset: { type: 'vec3' },
    count: { type: 'int' }
  },
  build(args, f) {
    f.getEntityLocationAndRotation(args.pivot)
    type PivotIsNotAny = AssertFalse<IsAny<typeof args.pivot>>
    type OffsetIsNotAny = AssertFalse<IsAny<typeof args.offset>>
    type CountIsNotAny = AssertFalse<IsAny<typeof args.count>>
    const pivot: EntityValue = args.pivot
    const offset: Vec3Value = args.offset
    const count: IntValue = args.count
    void (null as unknown as PivotIsNotAny)
    void (null as unknown as OffsetIsNotAny)
    void (null as unknown as CountIsNotAny)
    return { pivot, offset, count }
  }
})
void typedComposite
`

fs.writeFileSync(fixturePath, source)
try {
  const configPath = path.join(root, 'tsconfig.json')
  const config = ts.readConfigFile(configPath, ts.sys.readFile)
  assert.equal(config.error, undefined)
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root, {
    noEmit: true,
    composite: false,
    incremental: false,
    types: ['node'],
    typeRoots: [path.join(root, 'node_modules/@types')],
    tsBuildInfoFile: path.join(os.tmpdir(), 'gsts-composite-build-input-types.tsbuildinfo')
  })
  const program = ts.createProgram({ rootNames: [fixturePath], options: parsed.options })
  const diagnostics = ts.getPreEmitDiagnostics(program)
  assert.deepEqual(
    diagnostics.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')),
    []
  )
} finally {
  fs.rmSync(fixturePath, { force: true })
}

console.log('PASS Composite build inputs retain schema value types')
