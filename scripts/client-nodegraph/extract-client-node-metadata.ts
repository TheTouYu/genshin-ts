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

  writeJson('resources/client_node_metadata.json', [])
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
}

main()
