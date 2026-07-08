import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import path from 'node:path'

import { decode_gia_file } from '../../../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'

const file = process.argv[2] ?? 'dist/tests/composite/v2/all-types/list-type-ops-smoke.gia'
if (!existsSync(file)) {
  throw new Error(`GIA file not found: ${file}`)
}

const data = decode_gia_file(path.resolve(file)) as any

const expectedListVarType: Record<string, number> = {
  bool: 9,
  int: 8,
  float: 10,
  str: 11,
  vec3: 15,
  guid: 7,
  entity: 13,
  prefab_id: 23,
  config_id: 22,
  faction: 24
}

const listConsumerNodeIds = new Set([
  100, // Concatenate List
  107, // Clear List (generic/int variant)
  113, // Clear List bool variant
  114, // List Includes This Value (generic/int variant)
  115,
  116,
  117,
  118,
  119,
  120,
  121, // Search List and Return Value ID (generic/int variant)
  122,
  123,
  124,
  125,
  126,
  127,
  128, // Get Corresponding Value From List (generic/int variant)
  129,
  130,
  131,
  132,
  133,
  134,
  135, // Insert Value Into List (generic/int variant)
  136,
  137,
  138,
  139,
  140,
  141,
  142, // Get List Length (generic/int variant)
  143,
  144,
  145,
  146,
  147,
  148,
  153, // Remove Value From List (generic/int variant)
  154,
  155,
  156,
  157,
  158,
  159,
  509, // List Iteration Loop variants
  510,
  511,
  512,
  513,
  514,
  515,
  554,
  555,
  556,
  557,
  558,
  559,
  560,
  561,
  562,
  563,
  564,
  565,
  570,
  571,
  2644,
  2645,
  2650,
  2651,
  2652,
  2655,
  3280
])

function compositeGraphNamesByGraphId(decoded: any): Map<number, string> {
  const out = new Map<number, string>()
  for (const a of decoded.accessories ?? []) {
    const def = a.compositeDef?.inner?.def
    if (!def) continue
    const graphId = a.relatedIds?.[0]?.id
    if (typeof graphId === 'number') out.set(graphId, def.name)
    else if (typeof graphId?.id === 'number') out.set(graphId.id, def.name)
  }
  return out
}

function nodeId(node: any): number | undefined {
  return node.genericId?.nodeId ?? node.genericId?.id
}

function pinKind(pin: any): number | undefined {
  return pin.i1?.kind
}

function pinIndex(pin: any): number | undefined {
  return pin.i1?.index
}

function firstListInputType(node: any): number | undefined {
  const p = (node.pins ?? []).find((pin: any) => pinKind(pin) === 3 && pinIndex(pin) === 0)
  return p?.type
}

const graphNames = compositeGraphNamesByGraphId(data)
const failures: string[] = []
const checked: string[] = []

for (const a of data.accessories ?? []) {
  const graph = a.graph?.inner?.graph
  if (!graph) continue
  const name = graphNames.get(a.id?.id)
  const match = /^TTD-列表类型-(.+)$/.exec(name ?? '')
  if (!match) continue

  const typeName = match[1]!
  const expected = expectedListVarType[typeName]
  assert.notEqual(expected, undefined, `missing expected list VarType for ${typeName}`)

  for (const node of graph.nodes ?? []) {
    const nid = nodeId(node)
    if (!nid || !listConsumerNodeIds.has(nid)) continue
    const actual = firstListInputType(node)
    checked.push(`${name} nodeIndex=${node.nodeIndex} nodeId=${nid} firstListInputType=${actual}`)
    if (actual !== expected) {
      failures.push(
        `${name}: nodeIndex=${node.nodeIndex} nodeId=${nid} expected first list input VarType ${expected}, got ${actual}`
      )
    }
  }
}

assert.ok(checked.length > 0, 'no list operation pins were checked')

if (failures.length) {
  console.error('Composite list type pin smoke FAILED')
  console.error(`Checked pins: ${checked.length}`)
  console.error(failures.join('\n'))
  process.exitCode = 1
} else {
  console.log(`Composite list type pin smoke passed. Checked pins: ${checked.length}`)
}
