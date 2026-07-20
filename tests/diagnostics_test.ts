import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {
  clearDiagnostics,
  configureDiagnostics,
  getDiagnostics,
  reportDiagnostic
} from '../src/diagnostics.js'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsts-diagnostics-test-'))
const outputFile = path.join(dir, 'warnings.json')
clearDiagnostics()
configureDiagnostics({ outputFile, print: false })
reportDiagnostic({
  code: 'GSTS-TEST-WARNING',
  severity: 'warning',
  source: 'user',
  message: 'example',
  suggestion: 'use f.node()/f.link()',
  graphId: 42,
  graphName: 'example graph',
  entryFile: 'example.ts',
  nodeId: 7,
  nodeType: 'double_branch'
})

assert.deepEqual(getDiagnostics()[0], JSON.parse(fs.readFileSync(outputFile, 'utf8'))[0])
assert.equal(getDiagnostics()[0]?.source, 'user')
assert.equal(getDiagnostics()[0]?.code, 'GSTS-TEST-WARNING')
console.log('PASS diagnostics model and JSON reporter')
