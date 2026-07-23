// @ts-nocheck

import assert from 'node:assert/strict'

import { clearDiagnostics, getDiagnostics } from '../../dist/src/diagnostics.js'
import { buildServerGraphRegistriesIRDocuments, g } from '../../dist/src/runtime/core.js'
import { bool, str } from '../../dist/src/runtime/value.js'

clearDiagnostics()

g.server({ name: 'explicit nested branch joins', id: 1073742416 }).on(
  'whenEntityIsCreated',
  (_event, f) => {
    f.doubleBranch(
      new bool(true),
      () => {
        f.doubleBranch(
          new bool(true),
          () => {
            f.printString(new str('inner yes'))
            f.return()
          },
          () => {
            f.printString(new str('inner no'))
            f.return()
          }
        )
      },
      () => {
        f.printString(new str('outer no'))
        f.return()
      }
    )
  }
)

const docs = buildServerGraphRegistriesIRDocuments({ defaultName: 'explicit nested branch joins' })
const doc = docs.find((candidate) =>
  candidate.graph?.name?.includes('explicit nested branch joins')
)
assert.ok(doc)

const outer = doc.nodes?.find((node) => node.type === 'double_branch')
assert.ok(outer)
assert.ok(
  outer.next?.some((connection) => connection.source_index === 0) &&
    outer.next?.some((connection) => connection.source_index === 1),
  JSON.stringify(outer.next)
)
assert.equal(
  getDiagnostics().filter(
    (diagnostic) => diagnostic.code === 'GSTS-MULTI-OUTFLOW-DEFAULT-CONTINUATION'
  ).length,
  0,
  JSON.stringify(getDiagnostics(), null, 2)
)

console.log('PASS explicit multi-outflow joins do not warn')
