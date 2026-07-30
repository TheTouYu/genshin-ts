import assert from 'node:assert/strict'

import { clearDiagnostics, configureDiagnostics, reportDiagnostic } from '../src/diagnostics.js'

const output: string[] = []
const originalWarn = console.warn
console.warn = (...args: unknown[]) => output.push(args.join(' '))
try {
  clearDiagnostics()
  configureDiagnostics({ print: true, outputFile: undefined, outputDir: undefined })
  reportDiagnostic({
    code: 'GSTS-DIAGNOSTIC-CONTEXT-TEST',
    severity: 'warning',
    source: 'generated',
    message: 'example warning',
    suggestion: 'inspect the generated callback',
    graphId: 42,
    graphName: 'example graph',
    entryFile: 'src/example.gs.ts',
    nodeId: 7,
    nodeType: 'double_branch',
    location: { file: 'src/example.ts', line: 12, column: 8 }
  })
} finally {
  console.warn = originalWarn
  configureDiagnostics({ print: true, outputFile: undefined, outputDir: undefined })
}

const rendered = output.join('\n')
for (const expected of [
  'source: generated',
  'graph: example graph (42)',
  'entry: src/example.gs.ts',
  'node: double_branch (IR 7)',
  'location: src/example.ts:12:8'
]) {
  assert.ok(rendered.includes(expected), `missing ${expected} in:\n${rendered}`)
}

console.log('PASS diagnostic console renders structured context')
