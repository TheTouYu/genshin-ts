import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

import protobuf from 'protobufjs'

import { unwrap_gia, wrap_gia } from '../../dist/src/compiler/gia_vendor.js'

const expectedSamples = new Map([
  [
    '0470fa9acc2d5ca4b16d6bc6ff735266abbece97a73032ee9fda1d6e641cc0cb',
    { size: 585, graphId: 1082130433 }
  ],
  [
    'd52127d7c6501bdf0f893bf7831206be461787394392ddee0c9ab9966188525a',
    { size: 1544, graphId: 1082130434 }
  ]
])

function sha256(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex')
}

const inputPaths = process.argv.slice(2)
assert.equal(inputPaths.length, 2, 'pass the two WP0 client skill GIA sample paths')

const protoPath = new URL(
  '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto',
  import.meta.url
).pathname
const root = new protobuf.Root().loadSync(protoPath, { keepCase: true })
const rootMessage = root.lookupType('Root')

for (const inputPath of inputPaths) {
  const originalContainer = readFileSync(inputPath)
  const originalHash = sha256(originalContainer)
  const expected = expectedSamples.get(originalHash)
  assert.ok(expected, `unexpected WP0 sample hash for ${inputPath}: ${originalHash}`)
  assert.equal(originalContainer.length, expected.size)

  const payload = unwrap_gia(inputPath, true)
  const decoded = rootMessage.decode(payload) as any
  const encodedPayload = rootMessage.encode(decoded).finish()
  const encodedContainer = new Uint8Array(wrap_gia(rootMessage, decoded))

  assert.deepEqual(Buffer.from(encodedPayload), Buffer.from(payload))
  assert.deepEqual(Buffer.from(encodedContainer), originalContainer)
  assert.equal(decoded.graph.id.id, expected.graphId)
  assert.equal(decoded.graph.id.type, 3)
  assert.equal(decoded.graph.which, 11)
  assert.equal(decoded.graph.graph.inner.graph.id.type, 20002)
  assert.equal(decoded.gameVersion, '6.7.0')
}

console.log('PASS two real WP0 client skill GIA samples round-trip byte-for-byte')
