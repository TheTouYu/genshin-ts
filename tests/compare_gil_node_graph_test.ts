import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { buildFile, encodeVarint } from '../src/injector/binary.js'
import { loadGiaProto } from '../src/injector/proto.js'

function concat(...parts: Uint8Array[]): Uint8Array {
  return Buffer.concat(parts.map((part) => Buffer.from(part)))
}

function bytesField(field: number, value: Uint8Array): Uint8Array {
  return concat(encodeVarint((field << 3) | 2), encodeVarint(value.length), value)
}

const graphId = 1073741840
const { nodeGraphMessage } = loadGiaProto()
const temp = mkdtempSync(path.join(tmpdir(), 'gsts-nodegraph-diff-'))

function makeGil(file: string, nodes: object[]): string {
  const graph = nodeGraphMessage.create({
    id: { class: 10000, type: 20000, kind: 21001, id: graphId },
    name: '_GSTS_increment_probe',
    nodes
  })
  const payload = bytesField(
    10,
    bytesField(1, bytesField(1, nodeGraphMessage.encode(graph).finish()))
  )
  const output = path.join(temp, file)
  writeFileSync(
    output,
    buildFile(payload, {
      schema: 1,
      headTag: 0x0326,
      fileType: 0,
      tailTag: 0x0679
    })
  )
  return output
}

try {
  const before = makeGil('before.gil', [])
  const after = makeGil('after.gil', [
    {
      nodeIndex: 1,
      genericId: { class: 10001, type: 20000, kind: 22000, nodeId: 300000 },
      pins: []
    }
  ])
  const stdout = execFileSync(
    process.execPath,
    ['--import', 'tsx', 'tools/compare-gil-node-graph.ts', before, after, String(graphId)],
    { cwd: path.resolve(import.meta.dirname, '..'), encoding: 'utf8' }
  )
  const result = JSON.parse(stdout)
  assert.equal(result.graph.beforeNodeCount, 0)
  assert.equal(result.graph.afterNodeCount, 1)
  assert.equal(result.graph.metadataChanged, false)
  assert.deepEqual(result.nodes.removed, [])
  assert.deepEqual(result.nodes.changed, [])
  assert.deepEqual(result.nodes.added, [
    {
      nodeIndex: 1,
      after: { nodeIndex: 1, genericId: 300000, pinCount: 0 }
    }
  ])
  assert.match(result.files.before.sha256, /^[0-9a-f]{64}$/)
  console.log('[ok] adjacent GIL snapshots report one bounded NodeGraph increment')
} finally {
  rmSync(temp, { recursive: true, force: true })
}
