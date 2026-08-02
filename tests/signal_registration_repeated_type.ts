import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { registerSignalInGil } from '../src/cli/gil_signal_registrations.js'
import { readRegisteredSignalsFromGil } from '../src/cli/gil_signals.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const target = new Uint8Array(
  fs.readFileSync(path.join(here, 'fixtures/signals/register-target.gil'))
)
const donor = new Uint8Array(
  fs.readFileSync(path.join(here, 'fixtures/signals/cube-turn-donor.gil'))
)
const result = registerSignalInGil({
  bytes: target,
  templateBytes: donor,
  templateSignalName: 'cube_turn',
  signal: {
    name: 'cube_turn',
    params: [
      { name: 'face', type: 'str' },
      { name: 'direction', type: 'str' }
    ]
  }
})
const output = `/tmp/gsts-signal-repeated-type-${process.pid}.gil`
fs.writeFileSync(output, result.bytes)
try {
  const all = readRegisteredSignalsFromGil(output)
  const signal = all.find((entry) => entry.name === 'cube_turn')
  assert.ok(signal)
  assert.deepEqual(
    signal.params.map((param) => ({
      name: param.name,
      type: param.type,
      pins: [param.sendPinIndex, param.monitorPinIndex, param.serverPinIndex]
    })),
    [
      { name: 'face', type: 'str', pins: [12, 34, 40] },
      { name: 'direction', type: 'str', pins: [16, 35, 41] }
    ]
  )
  assert.equal(new Set(signal.params.map((param) => param.sendPinIndex)).size, 2)
  assert.equal(all.length, 4)
} finally {
  fs.rmSync(output, { force: true })
}

assert.throws(
  () =>
    registerSignalInGil({
      bytes: target,
      templateBytes: donor,
      templateSignalName: 'cube_turn',
      signal: {
        name: 'too_many_strings',
        params: [
          { name: 'one', type: 'str' },
          { name: 'two', type: 'str' },
          { name: 'three', type: 'str' }
        ]
      }
    }),
  /needs 3 distinct layouts.*provides 2/
)

console.log('signal repeated-type donor layouts: PASS')
