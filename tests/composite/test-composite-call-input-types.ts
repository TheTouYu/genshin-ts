import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import ts from 'typescript'

const root = path.resolve(import.meta.dirname, '../..')
const fixturePath = path.join(root, 'tests/composite/.tmp-composite-call-input-types.ts')
const source = `
import { g } from '../../dist/src/runtime/core.js'
import type { ServerExecutionFlowFunctions } from '../../dist/src/definitions/nodes.js'
import { float, int, vec3 } from '../../dist/src/runtime/value.js'
import type { FloatValue, Vec3Value } from '../../dist/src/runtime/value.js'

const typedComposite = g.defineComposite('composite call input types', {
  inputs: {
    amount: { type: 'float' },
    offset: { type: 'vec3' }
  },
  outputs: {
    amount: { type: 'float' },
    offset: { type: 'vec3' }
  },
  build(args) {
    return { amount: args.amount, offset: args.offset }
  }
})

declare const f: ServerExecutionFlowFunctions

const complete = f.callComposite(typedComposite, {
  amount: new float(1),
  offset: new vec3([1, 2, 3])
})
const amount: FloatValue = complete.amount
const offset: Vec3Value = complete.offset

f.callComposite(typedComposite, { amount: new float(2) })
f.callComposite(typedComposite, {})
f.declareDetached(typedComposite, { offset: new vec3([4, 5, 6]) })
f.declareDetached(typedComposite, {})

// @ts-expect-error amount requires a float runtime value
f.callComposite(typedComposite, { amount: new int(1) })
// @ts-expect-error direct object literals must not contain undeclared inputs
f.callComposite(typedComposite, { unknown: new float(1) })
// @ts-expect-error detached calls use the same input schema as regular calls
f.declareDetached(typedComposite, { offset: new int(2) })
// @ts-expect-error detached calls also reject undeclared direct-literal inputs
f.declareDetached(typedComposite, { extra: new float(3) })

void amount
void offset
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
    tsBuildInfoFile: path.join(os.tmpdir(), 'gsts-composite-call-input-types.tsbuildinfo')
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

console.log('PASS Composite calls retain optional schema-checked input and output types')
