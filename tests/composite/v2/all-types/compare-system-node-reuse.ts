import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import path from 'node:path'

import { decode_gia_file } from '../../../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'

const args = process.argv.slice(2)
const strict = args.includes('--strict')
const file = args.find((arg) => !arg.startsWith('-')) ?? 'dist/tests/composite/v2/all-types/system-node-reuse-smoke.gia'
if (!existsSync(file)) {
  throw new Error(`GIA file not found: ${file}`)
}

const protoPath = path.resolve(
  'src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto'
)
const data = decode_gia_file(path.resolve(file), protoPath) as any

const PIN_KIND_IN_PARAM = 3
const PIN_KIND_OUT_PARAM = 4
const NODE_IDS = {
  assemblyList: 169,
  concatenateList: 100,
  getListLength: 142,
  addition: 200,
  equal: 14
} as const

const cases = [
  {
    name: 'L1-复用对照-list-length',
    nodeIds: [NODE_IDS.assemblyList, NODE_IDS.getListLength]
  },
  {
    name: 'L1-复用对照-concatenate-list',
    nodeIds: [NODE_IDS.assemblyList, NODE_IDS.concatenateList]
  },
  {
    name: 'L1-复用对照-arithmetic',
    nodeIds: [NODE_IDS.assemblyList, NODE_IDS.getListLength, NODE_IDS.addition, NODE_IDS.equal]
  }
] as const

type PinSignature = {
  kind: number | undefined
  index: number | undefined
  type: number | undefined
  valueClass: number | undefined
  concreteIndex: number | undefined
  concreteValueClass: number | undefined
  connects: Array<{ nodeId: number | undefined; kind: number | undefined; index: number | undefined }>
}

type NodeSignature = {
  nodeId: number | undefined
  pins: PinSignature[]
}

function nodeId(node: any): number | undefined {
  return node.genericId?.nodeId ?? node.genericId?.id ?? node.concreteId?.nodeId ?? node.concreteId?.id
}

function compositeGraphNamesByGraphId(decoded: any): Map<number, string> {
  const out = new Map<number, string>()
  for (const accessory of decoded.accessories ?? []) {
    const def = accessory.compositeDef?.inner?.def
    if (!def) continue
    const graphId = accessory.relatedIds?.[0]?.id
    if (typeof graphId === 'number') out.set(graphId, def.name)
  }
  return out
}

function implGraphByCompositeName(decoded: any, name: string): any | undefined {
  const names = compositeGraphNamesByGraphId(decoded)
  for (const accessory of decoded.accessories ?? []) {
    const graph = accessory.graph?.inner?.graph
    if (!graph) continue
    if (names.get(accessory.id?.id) === name) return graph
  }
  return undefined
}

function graphNodeIdByIndex(nodes: any[]): Map<number, number | undefined> {
  const out = new Map<number, number | undefined>()
  for (const node of nodes) {
    out.set(node.nodeIndex, nodeId(node))
  }
  return out
}

function pinSignature(pin: any, nodeIdByIndex: Map<number, number | undefined>): PinSignature {
  return {
    kind: pin.i1?.kind,
    index: pin.i1?.index,
    type: pin.type,
    valueClass: pin.value?.class,
    concreteIndex: pin.value?.bConcreteValue?.indexOfConcrete,
    concreteValueClass: pin.value?.bConcreteValue?.value?.class,
    connects: (pin.connects ?? []).map((connect: any) => ({
      nodeId: nodeIdByIndex.get(connect.id),
      kind: connect.connect?.kind,
      index: connect.connect?.index
    }))
  }
}

function comparablePins(node: any, nodeIdByIndex: Map<number, number | undefined>): PinSignature[] {
  return (node.pins ?? [])
    .filter((pin: any) => pin.i1?.kind === PIN_KIND_IN_PARAM || pin.i1?.kind === PIN_KIND_OUT_PARAM)
    .map((pin: any) => pinSignature(pin, nodeIdByIndex))
    .sort((a: PinSignature, b: PinSignature) => (a.kind ?? 0) - (b.kind ?? 0) || (a.index ?? 0) - (b.index ?? 0))
}

function signature(node: any, nodeIdByIndex: Map<number, number | undefined>): NodeSignature {
  return {
    nodeId: nodeId(node),
    pins: comparablePins(node, nodeIdByIndex)
  }
}

function signatureKey(sig: NodeSignature): string {
  return JSON.stringify(sig)
}

function signatureSummary(sig: NodeSignature): string {
  const pins = sig.pins
    .map((pin) => {
      const connects = pin.connects.length > 0 ? ` connects=${pin.connects.length}` : ''
      const concrete = pin.concreteIndex !== undefined ? ` concrete=${pin.concreteIndex}/${pin.concreteValueClass}` : ''
      return `${pin.kind}:${pin.index} type=${pin.type} class=${pin.valueClass}${concrete}${connects}`
    })
    .join('; ')
  return `nodeId=${sig.nodeId} [${pins}]`
}

function countSignatures(nodes: any[], targetNodeIds: readonly number[]): Map<string, { sig: NodeSignature; count: number }> {
  const targets = new Set<number>(targetNodeIds)
  const nodeIdByIndex = graphNodeIdByIndex(nodes)
  const out = new Map<string, { sig: NodeSignature; count: number }>()
  for (const node of nodes) {
    const id = nodeId(node)
    if (id === undefined || !targets.has(id)) continue
    const sig = signature(node, nodeIdByIndex)
    const key = signatureKey(sig)
    const existing = out.get(key)
    if (existing) {
      existing.count++
    } else {
      out.set(key, { sig, count: 1 })
    }
  }
  return out
}

function subsetFailures(
  main: Map<string, { sig: NodeSignature; count: number }>,
  impl: Map<string, { sig: NodeSignature; count: number }>
): string[] {
  const failures: string[] = []
  for (const [key, implEntry] of impl) {
    const mainEntry = main.get(key)
    const mainCount = mainEntry?.count ?? 0
    if (mainCount < implEntry.count) {
      failures.push(
        `missing matching main signature x${implEntry.count - mainCount}: ${signatureSummary(implEntry.sig)}`
      )
    }
  }
  return failures
}

const mainNodes = data.graph?.graph?.inner?.graph?.nodes ?? []
const failures: string[] = []
const checked: string[] = []

for (const c of cases) {
  const graph = implGraphByCompositeName(data, c.name)
  assert.ok(graph, `missing composite impl graph: ${c.name}`)

  const mainSigs = countSignatures(mainNodes, c.nodeIds)
  const implSigs = countSignatures(graph.nodes ?? [], c.nodeIds)
  assert.ok(implSigs.size > 0, `${c.name}: no target impl nodes found`)

  const caseFailures = subsetFailures(mainSigs, implSigs)
  checked.push(`${c.name}: target signatures=${implSigs.size}`)
  if (caseFailures.length > 0) {
    failures.push(`${c.name}:\n  ${caseFailures.join('\n  ')}`)
  }
}

if (failures.length > 0) {
  console.error(
    strict
      ? 'Composite system-node reuse compare FAILED'
      : 'Composite system-node reuse compare found differences (diagnostic mode)'
  )
  console.error(checked.join('\n'))
  console.error(failures.join('\n'))
  if (strict) process.exitCode = 1
} else {
  console.log(`Composite system-node reuse compare passed. ${checked.join('; ')}`)
}
