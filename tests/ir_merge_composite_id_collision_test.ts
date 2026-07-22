import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { mergeIrJsonFilesByGraphId } from '../src/compiler/ir_merge.js'

const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsts-composite-id-collision-'))

function composite(id: number, name: string, nestedId?: number) {
  return {
    name,
    id,
    type: 'composite',
    inflows: [],
    outflows: [],
    inputs: [
      {
        name: 'value',
        visible: true,
        index: 0,
        type: name.includes('entity') ? 'entity' : 'vec3',
        pinIndex: 100
      }
    ],
    outputs: [],
    implNodes: nestedId
      ? [{ id: 1, type: '__composite_call__', args: [{ type: 'int', value: nestedId }] }]
      : [],
    implEdges: {},
    compositePins: []
  }
}

function writeSource(name: string, definition: ReturnType<typeof composite>) {
  const file = path.join(outDir, `${name}.json`)
  fs.writeFileSync(
    file,
    JSON.stringify({
      ir_version: 1,
      ir_type: 'node_graph',
      graph: { id: name === 'controls' ? 1073741851 : 1073741850, type: 'server', name },
      nodes: [{ id: 1, type: '__composite_call__', args: [{ type: 'int', value: definition.id }] }],
      compositeDefs: [definition]
    })
  )
  return file
}

const first = writeSource('controls', composite(1610700002, 'collision repro input writer'))
const second = writeSource(
  'lifecycle',
  composite(1610700002, 'collision repro movement', 1610700002)
)

const results = mergeIrJsonFilesByGraphId({ outDirAbs: outDir, irJsonPaths: [first, second] })
const definitions = results.flatMap((result) => (result.merged as any).compositeDefs ?? [])

assert.equal(definitions.length, 2, 'all NodeGraphs must retain their Composite definitions')
assert.equal(new Set(definitions.map((def: any) => def.id)).size, 2, 'Composite IDs must be unique')

const controls = definitions.find((def: any) => def.name === 'collision repro input writer')
const lifecycle = definitions.find((def: any) => def.name === 'collision repro movement')
assert.equal(controls.id, 1610700002)
assert.notEqual(lifecycle.id, controls.id)
const lifecycleResult = results.find((result) => result.graphId === 1073741850)!
assert.equal((lifecycleResult.merged as any).nodes[0].args[0].value, lifecycle.id)
assert.equal(lifecycle.implNodes[0].args[0].value, lifecycle.id)

const persistedLifecycle = JSON.parse(fs.readFileSync(second, 'utf8'))
assert.equal(persistedLifecycle.compositeDefs[0].id, lifecycle.id)
assert.equal(persistedLifecycle.nodes[0].args[0].value, lifecycle.id)
assert.equal(persistedLifecycle.compositeDefs[0].implNodes[0].args[0].value, lifecycle.id)

console.log('cross-NodeGraph Composite ID collision regression passed')
fs.rmSync(outDir, { recursive: true, force: true })
