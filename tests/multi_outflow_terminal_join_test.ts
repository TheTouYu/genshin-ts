// @ts-nocheck

import assert from 'node:assert/strict'

import { clearDiagnostics, getDiagnostics } from '../dist/src/diagnostics.js'
import { buildServerGraphRegistriesIRDocuments, g } from '../dist/src/runtime/core.js'
import { bool, str } from '../dist/src/runtime/value.js'

clearDiagnostics()

g.server({ name: 'terminal branch', id: 1073742421 }).on(
  'whenEntityIsCreated',
  (_event, f) => {
    f.doubleBranch(
      new bool(true),
      () => f.printString(new str('terminal yes')),
      () => {}
    )
  }
)

g.server({ name: 'joined branch', id: 1073742422 }).on('whenEntityIsCreated', (_event, f) => {
  f.doubleBranch(
    new bool(true),
    () => f.printString(new str('joined yes')),
    () => {}
  )
  f.printString(new str('after join'))
})

const docs = buildServerGraphRegistriesIRDocuments({ defaultName: 'multi-outflow join' })
const terminalDoc = docs.find((doc) => doc.graph?.name?.includes('terminal branch'))
const joinedDoc = docs.find((doc) => doc.graph?.name?.includes('joined branch'))
assert.ok(terminalDoc)
assert.ok(joinedDoc)

const joinedBranch = joinedDoc.nodes?.find((node) => node.type === 'double_branch')
const joinedYes = joinedDoc.nodes?.find(
  (node) => node.type === 'print_string' && node.args?.[0]?.value === 'joined yes'
)
const afterJoin = joinedDoc.nodes?.find(
  (node) => node.type === 'print_string' && node.args?.[0]?.value === 'after join'
)
assert.ok(joinedBranch)
assert.ok(joinedYes)
assert.ok(afterJoin)
assert.ok(
  joinedBranch.next?.some(
    (next) =>
      typeof next !== 'number' && next.node_id === afterJoin.id && next.source_index === 1
  ),
  JSON.stringify(joinedBranch.next)
)
assert.deepEqual(joinedYes.next, [afterJoin.id])

const warnings = getDiagnostics().filter(
  (diagnostic) => diagnostic.code === 'GSTS-MULTI-OUTFLOW-DEFAULT-CONTINUATION'
)
assert.equal(warnings.length, 0, JSON.stringify(warnings, null, 2))

console.log('PASS terminal branches need no continuation and live branches join explicitly')
