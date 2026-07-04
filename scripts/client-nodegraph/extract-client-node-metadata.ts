import fs from 'node:fs'
import path from 'node:path'

import protobuf from 'protobufjs'

import {
  decode_gia_file,
  unwrap_gia
} from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'

type ClientGraphSubType =
  | 'character_skill'
  | 'creation_skill'
  | 'creation_status'
  | 'creation_status_decision'
  | 'bool_filter'
  | 'int_filter'

type DecodedRoot = ReturnType<typeof decode_gia_file>

const DEFAULT_SAMPLE_ROOT = 'D:\\_S2\\mypy_test\\client_nodes'
const GIA_PROTO_PATH =
  'src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto'

const FAMILY_BY_DIR: Record<string, ClientGraphSubType> = {
  角色技能节点图: 'character_skill',
  造物技能节点图: 'creation_skill',
  造物状态节点图: 'creation_status',
  造物状态决策节点图: 'creation_status_decision',
  布尔过滤器节点: 'bool_filter',
  整数过滤器节点: 'int_filter'
}

function walkGiaFiles(dir: string): string[] {
  const out: string[] = []
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, item.name)
    if (item.isDirectory()) {
      out.push(...walkGiaFiles(full))
    } else if (item.isFile() && item.name.toLowerCase().endsWith('.gia')) {
      out.push(full)
    }
  }
  return out
}

function writeJson(filePath: string, value: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + '\n', 'utf8')
}

function familyFromFile(sampleRoot: string, file: string): ClientGraphSubType | undefined {
  const rel = path.relative(sampleRoot, file)
  const first = rel.split(path.sep)[0]
  return first ? FAMILY_BY_DIR[first] : undefined
}

function graphNodes(root: DecodedRoot) {
  return root.graph.graph?.inner.graph.nodes ?? []
}

function graphIdentity(root: DecodedRoot) {
  const graphUnit = root.graph
  const nodeGraph = graphUnit.graph?.inner.graph
  return {
    unitType: graphUnit.id.type,
    which: graphUnit.which,
    nodeGraphType: nodeGraph?.id.type
  }
}

function findClientVarType25(root: DecodedRoot, relFile: string, subType: ClientGraphSubType) {
  const hits: Array<{
    file: string
    subType: ClientGraphSubType
    nodeIndex: number | undefined
    genericId: number | undefined
    concreteId: number | undefined
    pinKind: number | undefined
    pinIndex: number | undefined
    pinType: number | undefined
  }> = []

  for (const node of graphNodes(root)) {
    for (const pin of node.pins ?? []) {
      const concreteValue = pin.value?.bConcreteValue?.value
      const nestedClientType = concreteValue?.itemType?.type_client?.type
      if (Number(pin.type) !== 25 && Number(nestedClientType) !== 25) continue
      hits.push({
        file: relFile,
        subType,
        nodeIndex: node.nodeIndex,
        genericId: node.genericId?.nodeId,
        concreteId: node.concreteId?.nodeId,
        pinKind: pin.i1?.kind,
        pinIndex: pin.i1?.index,
        pinType: pin.type
      })
    }
  }

  return hits
}

function findStatusExtensions(root: DecodedRoot, relFile: string, subType: ClientGraphSubType) {
  return graphNodes(root)
    .filter((node) => node.statusNodeExtension !== undefined)
    .map((node) => ({
      file: relFile,
      subType,
      nodeIndex: node.nodeIndex,
      genericId: node.genericId?.nodeId,
      concreteId: node.concreteId?.nodeId,
      value: node.statusNodeExtension
    }))
}

type DecodedNode = ReturnType<typeof graphNodes>[number]

type MinimalPinRecord = {
  index: number
  kind: 'input' | 'output' | 'in_flow' | 'out_flow' | 'client_exec' | 'client_signal'
  type: string
  clientVarType?: number
}

type MinimalNodeRecord = {
  subType: ClientGraphSubType
  nodeType: string
  displayName: string
  graphType: number
  genericId: number
  concreteId: number
  inputs: MinimalPinRecord[]
  outputs: MinimalPinRecord[]
  flows?: MinimalPinRecord[]
  specialKind?: 'start'
  isStart?: boolean
  sampleFile: string
}

// Phase 3 minimal pass: only the node that appears in every sample of a family.
// Skill/status families share a pinless begins node; filter families instead share
// the result end node that consumes the final value.
const MINIMAL_NODE_TYPE_BY_SUB_TYPE: Record<ClientGraphSubType, string> = {
  character_skill: 'node_graph_begins',
  creation_skill: 'node_graph_begins',
  creation_status: 'node_graph_begins',
  creation_status_decision: 'node_graph_begins',
  bool_filter: 'node_graph_end_boolean',
  int_filter: 'node_graph_end_integer'
}

const EXPECTED_STATUS_EXTENSION = JSON.stringify({ type: 1, inner: { value: 1 } })

const CLIENT_VAR_TYPE_NAMES: Record<number, string> = {
  1: 'entity',
  2: 'entity_list',
  3: 'int',
  4: 'int_list',
  5: 'bool',
  6: 'bool_list',
  7: 'float',
  8: 'float_list',
  9: 'str',
  10: 'str_list',
  11: 'vec3',
  12: 'vec3_list',
  13: 'enum',
  14: 'guid',
  15: 'guid_list',
  16: 'faction',
  17: 'enum_list',
  18: 'config_id',
  19: 'prefab_id',
  20: 'config_id_list',
  21: 'prefab_id_list',
  22: 'local_variable',
  24: 'dict',
  25: 'faction_list'
}

const PIN_KIND_NAMES: Record<number, MinimalPinRecord['kind']> = {
  1: 'in_flow',
  2: 'out_flow',
  3: 'input',
  4: 'output',
  5: 'client_exec',
  6: 'client_signal'
}

type MinimalFamilyCollector = {
  decoded: number
  byGid: Map<number, { samples: number; best?: { node: DecodedNode; relFile: string } }>
}

function collectMinimalNodes(
  collector: Map<ClientGraphSubType, MinimalFamilyCollector>,
  root: DecodedRoot,
  relFile: string,
  subType: ClientGraphSubType
) {
  const family = collector.get(subType) ?? { decoded: 0, byGid: new Map() }
  collector.set(subType, family)
  family.decoded += 1
  const seen = new Set<number>()
  for (const node of graphNodes(root)) {
    const gid = Number(node.genericId?.nodeId)
    const entry = family.byGid.get(gid) ?? { samples: 0 }
    family.byGid.set(gid, entry)
    if (!seen.has(gid)) {
      entry.samples += 1
      seen.add(gid)
    }
    if (!entry.best || (node.pins?.length ?? 0) > (entry.best.node.pins?.length ?? 0)) {
      entry.best = { node, relFile }
    }
  }
}

function minimalPinRecords(node: DecodedNode): {
  inputs: MinimalPinRecord[]
  outputs: MinimalPinRecord[]
  flows: MinimalPinRecord[]
} {
  const inputs: MinimalPinRecord[] = []
  const outputs: MinimalPinRecord[] = []
  const flows: MinimalPinRecord[] = []
  for (const pin of node.pins ?? []) {
    const kind = PIN_KIND_NAMES[Number(pin.i1?.kind)]
    if (!kind) throw new Error(`[error] unknown pin kind ${pin.i1?.kind}`)
    const clientVarType = Number(pin.type ?? 0)
    const record: MinimalPinRecord = {
      index: Number(pin.i1?.index ?? 0),
      kind,
      type:
        kind === 'in_flow' || kind === 'out_flow'
          ? 'flow'
          : (CLIENT_VAR_TYPE_NAMES[clientVarType] ?? `client_${clientVarType}`),
      clientVarType
    }
    if (kind === 'input') inputs.push(record)
    else if (kind === 'output') outputs.push(record)
    else flows.push(record)
  }
  return { inputs, outputs, flows }
}

function buildMinimalMetadata(
  collector: Map<ClientGraphSubType, MinimalFamilyCollector>
): MinimalNodeRecord[] {
  const records: MinimalNodeRecord[] = []
  for (const [subType, family] of [...collector.entries()].sort()) {
    const universal = [...family.byGid.entries()].filter(
      ([, entry]) => entry.samples === family.decoded
    )
    if (universal.length !== 1) {
      throw new Error(
        `[error] ${subType}: expected exactly one universal node, got ${universal.length} (${universal
          .map(([gid]) => gid)
          .join(', ')})`
      )
    }
    const [genericId, entry] = universal[0]
    const { node, relFile } = entry.best!
    const nodeType = MINIMAL_NODE_TYPE_BY_SUB_TYPE[subType]
    const isStart = nodeType === 'node_graph_begins'
    if (subType.startsWith('creation_status')) {
      const observed = JSON.stringify(node.statusNodeExtension)
      if (observed !== EXPECTED_STATUS_EXTENSION) {
        throw new Error(
          `[error] ${subType}: statusNodeExtension mismatch, observed ${observed}, expected ${EXPECTED_STATUS_EXTENSION}`
        )
      }
    }
    const { inputs, outputs, flows } = minimalPinRecords(node)
    records.push({
      subType,
      nodeType,
      displayName: nodeType,
      graphType: Number(node.genericId?.type),
      genericId,
      concreteId: Number(node.concreteId?.nodeId),
      inputs,
      outputs,
      ...(flows.length ? { flows } : {}),
      ...(isStart ? { specialKind: 'start' as const, isStart: true } : {}),
      sampleFile: relFile
    })
  }
  return records
}

type VarBaseField3Hit = {
  path: string
  byteOffset: number
  payloadLength: number
}

function loadGiaRootType() {
  const protoRoot = new protobuf.Root().loadSync(GIA_PROTO_PATH, { keepCase: true })
  protoRoot.resolveAll()
  return protoRoot.lookupType('Root')
}

function scanVarBaseField3Messages(rootType: protobuf.Type, bytes: Uint8Array): VarBaseField3Hit[] {
  const hits: VarBaseField3Hit[] = []
  scanMessageForVarBaseField3(rootType, bytes, '$', 0, hits)
  return hits
}

function scanMessageForVarBaseField3(
  type: protobuf.Type,
  bytes: Uint8Array,
  currentPath: string,
  baseOffset: number,
  hits: VarBaseField3Hit[]
) {
  const fieldsById = type.fieldsById as Record<number, protobuf.Field | undefined>
  const reader = protobuf.Reader.create(bytes)
  const repeatedIndexes = new Map<number, number>()

  while (reader.pos < reader.len) {
    const tagOffset = reader.pos
    const tag = reader.uint32()
    const fieldNo = tag >>> 3
    const wireType = tag & 7

    if (type.name === 'VarBase' && fieldNo === 3 && wireType === 2) {
      const payloadLength = reader.uint32()
      hits.push({
        path: `${currentPath}.#3`,
        byteOffset: baseOffset + tagOffset,
        payloadLength
      })
      reader.skip(payloadLength)
      continue
    }

    const field = fieldsById[fieldNo]
    if (wireType === 2 && field?.resolvedType instanceof protobuf.Type) {
      const payloadLength = reader.uint32()
      const payloadStart = reader.pos
      const payloadEnd = payloadStart + payloadLength
      let childPath = `${currentPath}.${field.name}`
      if (field.repeated) {
        const index = repeatedIndexes.get(fieldNo) ?? 0
        repeatedIndexes.set(fieldNo, index + 1)
        childPath += `[${index}]`
      }
      scanMessageForVarBaseField3(
        field.resolvedType,
        bytes.subarray(payloadStart, payloadEnd),
        childPath,
        baseOffset + payloadStart,
        hits
      )
      reader.pos = payloadEnd
      continue
    }

    reader.skipType(wireType)
  }
}

function annotateInlineVarTypeHintHits(
  rawHits: VarBaseField3Hit[],
  root: DecodedRoot,
  relFile: string,
  subType: ClientGraphSubType
) {
  return rawHits.map((hit) => {
    const match = hit.path.match(/\.nodes\[(\d+)](?:\.[^.]+)*\.pins\[(\d+)]/)
    const node = match ? graphNodes(root)[Number(match[1])] : undefined
    const pin = node && match ? (node.pins ?? [])[Number(match[2])] : undefined
    return {
      file: relFile,
      subType,
      path: hit.path,
      byteOffset: hit.byteOffset,
      payloadLength: hit.payloadLength,
      nodeIndex: node?.nodeIndex,
      genericId: node?.genericId?.nodeId,
      concreteId: node?.concreteId?.nodeId,
      pinKind: pin?.i1?.kind,
      pinIndex: pin?.i1?.index,
      pinType: pin?.type
    }
  })
}

function main() {
  const sampleRoot = path.resolve(process.argv[2] ?? DEFAULT_SAMPLE_ROOT)
  if (!fs.existsSync(sampleRoot)) {
    throw new Error(`[error] client sample root not found: ${sampleRoot}`)
  }

  const giaRootType = loadGiaRootType()
  const files = walkGiaFiles(sampleRoot).sort((a, b) => a.localeCompare(b))
  const familyCounts = new Map<ClientGraphSubType, number>()
  const graphIdentities = new Map<string, number>()
  const unknownFamily: string[] = []
  const decodeFailures: Array<{ file: string; error: string }> = []
  const clientVarType25Hits: ReturnType<typeof findClientVarType25> = []
  const statusExtensionHits: ReturnType<typeof findStatusExtensions> = []
  const inlineVarTypeHintHits: ReturnType<typeof annotateInlineVarTypeHintHits> = []
  const minimalCollector = new Map<ClientGraphSubType, MinimalFamilyCollector>()

  for (const file of files) {
    const relFile = path.relative(sampleRoot, file)
    const subType = familyFromFile(sampleRoot, file)
    if (!subType) {
      unknownFamily.push(relFile)
      continue
    }
    familyCounts.set(subType, (familyCounts.get(subType) ?? 0) + 1)

    let root: DecodedRoot
    try {
      root = decode_gia_file(file, undefined, false)
    } catch (error) {
      decodeFailures.push({
        file: relFile,
        error: error instanceof Error ? error.message : String(error)
      })
      continue
    }

    const identityKey = JSON.stringify({ subType, ...graphIdentity(root) })
    graphIdentities.set(identityKey, (graphIdentities.get(identityKey) ?? 0) + 1)
    clientVarType25Hits.push(...findClientVarType25(root, relFile, subType))
    statusExtensionHits.push(...findStatusExtensions(root, relFile, subType))
    collectMinimalNodes(minimalCollector, root, relFile, subType)

    inlineVarTypeHintHits.push(
      ...annotateInlineVarTypeHintHits(
        scanVarBaseField3Messages(giaRootType, unwrap_gia(file, false)),
        root,
        relFile,
        subType
      )
    )
  }

  const capability = Object.fromEntries(
    [...familyCounts.keys()].sort().map((subType) => [
      subType,
      {
        beyond: { status: 'available', reason: '' },
        classic: {
          status: 'unknown',
          reason: 'client classic mode requires sample confirmation'
        }
      }
    ])
  )

  const statusExtensionValues = [
    ...new Set(statusExtensionHits.map((hit) => JSON.stringify(hit.value)))
  ].map((raw) => JSON.parse(raw) as unknown)

  const report = {
    sampleRoot,
    sampleCount: files.length,
    familyCounts: Object.fromEntries([...familyCounts.entries()].sort()),
    graphIdentities: [...graphIdentities.entries()].map(([raw, count]) => ({
      ...JSON.parse(raw),
      count
    })),
    unknownFamily,
    decodeFailures,
    clientVarType25: {
      conclusion: 'observed faction list type',
      hitCount: clientVarType25Hits.length,
      hits: clientVarType25Hits
    },
    statusNodeExtension: {
      requiredForSubTypes: ['creation_status', 'creation_status_decision'],
      hitCount: statusExtensionHits.length,
      uniqueValues: statusExtensionValues,
      bySubType: statusExtensionHits.reduce<Record<string, number>>((acc, hit) => {
        acc[hit.subType] = (acc[hit.subType] ?? 0) + 1
        return acc
      }, {})
    },
    inlineVarTypeHint: {
      status: 'observed unsupported detail; not a main-chain blocker',
      hitCount: inlineVarTypeHintHits.length,
      files: Object.values(
        inlineVarTypeHintHits.reduce<Record<string, { file: string; count: number }>>(
          (acc, hit) => {
            acc[hit.file] ??= { file: hit.file, count: 0 }
            acc[hit.file].count += 1
            return acc
          },
          {}
        )
      ),
      hits: inlineVarTypeHintHits
    }
  }

  const minimalMetadata = buildMinimalMetadata(minimalCollector)

  writeJson('resources/client_node_metadata.json', minimalMetadata)
  writeJson('resources/client_graph_capability.json', capability)
  writeJson('resources/client_execution_flow_metadata.json', [])
  writeJson('tests/client_generated/_coverage_gaps.json', {
    unsupportedSpecialKinds: ['inline_var_type_hint'],
    conditionalSpecialKinds: ['structure_list_unknown_binding'],
    inlineVarTypeHintFiles: Object.values(
      inlineVarTypeHintHits.reduce<Record<string, { file: string; count: number }>>((acc, hit) => {
        acc[hit.file] ??= { file: hit.file, count: 0 }
        acc[hit.file].count += 1
        return acc
      }, {})
    ),
    missingMetadata: []
  })
  writeJson('tests/client_generated/_report.json', report)

  console.log(`[ok] scanned ${files.length} client gia samples`)
  console.log(
    `[ok] extracted ${minimalMetadata.length} minimal node metadata records: ${minimalMetadata
      .map((r) => `${r.subType}.${r.nodeType}=${r.genericId}/${r.concreteId}`)
      .join(', ')}`
  )
}

main()
