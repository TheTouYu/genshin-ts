import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import os from 'node:os'
import path from 'node:path'

import { EmbeddingClient } from '../src/docs_search/embedding.js'

const directory = mkdtempSync(path.join(os.tmpdir(), 'gsts-docs-search-'))
const cachePath = path.join(directory, 'embedding-cache.json')
const inputs = Array.from({ length: 32 }, (_, index) => `camera-${index}`)
writeFileSync(cachePath, '{"schemaVersion":1,"entries":{}}trailing-corruption')

let activeRequests = 0
let maxActiveRequests = 0
const server = createServer((request, response) => {
  let body = ''
  request.on('data', (chunk) => {
    body += chunk
  })
  request.on('end', async () => {
    const input = JSON.parse(body).input as string[]
    activeRequests += 1
    maxActiveRequests = Math.max(maxActiveRequests, activeRequests)
    await new Promise((resolve) => setTimeout(resolve, 10))
    response.setHeader('content-type', 'application/json')
    response.end(JSON.stringify({ data: input.map(() => ({ embedding: [1, 2, 3] })) }))
    activeRequests -= 1
  })
})

await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
try {
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  const result = await new EmbeddingClient({
    apiKey: 'test-key',
    baseUrl: `http://127.0.0.1:${address.port}`,
    model: 'test-model',
    indexDir: directory
  }).embed(inputs)

  assert.equal(result.length, inputs.length)
  assert.deepEqual(result[0], [1, 2, 3])
  assert.ok(maxActiveRequests >= 2)
  const cache = JSON.parse(readFileSync(cachePath, 'utf8'))
  assert.equal(cache.schemaVersion, 1)
  assert.equal(Object.keys(cache.entries).length, inputs.length)
  console.log('PASS docs search recovers corrupt cache, writes valid JSON, and uses concurrency')
} finally {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve()))
  )
  rmSync(directory, { recursive: true, force: true })
}
