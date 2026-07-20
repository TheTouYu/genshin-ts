import assert from 'node:assert/strict'

import { asRuntimeValue, float, generic } from '../../src/runtime/value.js'

const runtimeValue = new float(1.5)
assert.equal(asRuntimeValue(runtimeValue), runtimeValue)

const genericValue = new generic()
const typedFloat = genericValue.asType('float')
assert.ok(asRuntimeValue(typedFloat) instanceof float)

assert.throws(
  () => asRuntimeValue(1.5),
  /GSTS-RAW-ARG-NOT-RUNTIME-VALUE/
)

console.log('PASS runtime value adapter')
