// @ts-nocheck
/**
 * Runtime contract: definition capture must not depend on optional call-site bindings.
 *
 * The same composite consumes both declared inputs while direct main-graph calls independently
 * bind first-only, second-only, both, and neither input.
 */
import assert from 'node:assert/strict'

import { buildServerGraphRegistriesIRDocuments, g } from '../../dist/src/runtime/core.js'
import { float } from '../../dist/src/runtime/value.js'

const child = g.defineComposite('optional-call-inputs-runtime-contract', {
  inputs: {
    first: { type: 'float' },
    second: { type: 'float' }
  },
  outputs: { result: { type: 'float' } },
  build(inputs: any, f: any) {
    return { result: f.addition(inputs.first, inputs.second) }
  }
})

g.server({ name: 'optional-call-inputs-runtime-contract', id: 1073742403 }).on(
  'whenEntityIsCreated',
  (_event: any, f: any) => {
    f.declareDetached(child, { first: new float(1) })
    f.declareDetached(child, { second: new float(2) })
    f.declareDetached(child, { first: new float(3), second: new float(4) })
    f.declareDetached(child, {})
  }
)

const doc = buildServerGraphRegistriesIRDocuments({ defaultName: 'optional-call-inputs-runtime-contract' }).at(-1)
const childDef = doc?.compositeDefs?.find((definition: any) => definition.name === child.name)
assert.ok(childDef, 'child definition missing')
assert.equal(
  childDef.compositePins.filter((pin: any) => pin.outerPinKind === 3).length,
  2,
  'child impl must retain both definition input routes'
)

const calls = doc?.nodes?.filter((node: any) => node.type === '__composite_call__') ?? []
assert.equal(calls.length, 4, 'main graph must contain all optional-input calls')
assert.deepEqual(calls.map((node: any) => node.args.length), [2, 2, 3, 1])
assert.deepEqual(
  calls.map((node: any) => node.args.slice(1).map((arg: any) => arg.compositeInputIndex)),
  [[0], [1], [0, 1], []],
  'each direct call must retain its own declared input bindings'
)

console.log('PASS optional composite call inputs preserve definition capture and call-site bindings')
