import fs from 'node:fs'
import path from 'node:path'

import protobuf from 'protobufjs'

import { SERVER_EVENT_ZH_TO_EN, SERVER_F_ZH_TO_EN } from '../../src/definitions/zh_aliases.js'
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
type DecodedNode = NonNullable<
  NonNullable<DecodedRoot['graph']['graph']>['inner']['graph']['nodes']
>[number]

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

// The one node present in every sample of a family: begins for skill/status
// families, the result end node for filter families.
const UNIVERSAL_NODE_BY_SUB_TYPE: Record<ClientGraphSubType, { genericId: number; nodeType: string }> = {
  character_skill: { genericId: 200042, nodeType: 'node_graph_begins' },
  creation_skill: { genericId: 200042, nodeType: 'node_graph_begins' },
  creation_status: { genericId: 200126, nodeType: 'node_graph_begins' },
  creation_status_decision: { genericId: 200126, nodeType: 'node_graph_begins' },
  bool_filter: { genericId: 200000, nodeType: 'node_graph_end_boolean' },
  int_filter: { genericId: 200122, nodeType: 'node_graph_end_integer' }
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

const PIN_KIND_NAMES: Record<number, PinRecord['kind']> = {
  1: 'in_flow',
  2: 'out_flow',
  3: 'input',
  4: 'output',
  5: 'client_exec',
  6: 'client_signal'
}

type PinRecord = {
  index: number
  kind: 'input' | 'output' | 'in_flow' | 'out_flow' | 'client_exec' | 'client_signal'
  type: string
  reflective?: boolean
  clientVarType?: number
}

type NodeRecord = {
  subType: ClientGraphSubType
  nodeType: string
  displayName: string
  graphType: number
  genericId: number
  concreteId: number | string | null
  inputs: PinRecord[]
  outputs: PinRecord[]
  flows?: PinRecord[]
  reflectMap?: Array<{ concreteId: number | string; variantKey: string; pins?: PinRecord[] }>
  specialKind?: string
  isStart?: boolean
  contextDeclaration?: { kind: number; index: number }
  sampleFile: string
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

function normalizeNodeType(name: string): string {
  return name
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()
}

function camelToSnake(name: string): string {
  return name.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`).replace(/^_/, '')
}

function englishNodeType(displayName: string): string | undefined {
  const en =
    (SERVER_F_ZH_TO_EN as Record<string, string>)[displayName] ??
    (SERVER_EVENT_ZH_TO_EN as Record<string, string>)[displayName]
  return en ? camelToSnake(en) : undefined
}

// ---------------------------------------------------------------------------
// Observation aggregation
// ---------------------------------------------------------------------------

type PinInstance = {
  kind: number
  index: number
  type: number
  // ConcreteBase wrapper with indexOfConcrete === -1 marks an unresolved reflective pin
  unresolvedReflective: boolean
  wrappedConcrete: boolean
}

type NodeInstance = {
  concreteId: number | undefined
  pins: PinInstance[]
}

type GidAggregate = {
  subType: ClientGraphSubType
  genericId: number
  graphTypes: Set<number>
  baseNames: Set<string>
  exampleFile: string
  instances: NodeInstance[]
  ctxDecls: Set<string>
  statusExts: Set<string>
}

function pinInstances(node: DecodedNode): PinInstance[] {
  return (node.pins ?? []).map((pin) => {
    const ioc = pin.value?.bConcreteValue?.indexOfConcrete
    return {
      kind: Number(pin.i1?.kind ?? 0),
      index: Number(pin.i1?.index ?? 0),
      type: Number(pin.type ?? 0),
      unresolvedReflective: Number(pin.value?.class) === 10000 && Number(ioc ?? 0) === -1,
      wrappedConcrete: Number(pin.value?.class) === 10000
    }
  })
}

function mergePins(agg: GidAggregate): {
  records: Map<string, PinRecord>
  reflectiveInputIndexes: number[]
} {
  type Merged = {
    kind: number
    index: number
    types: Set<number>
    sawUnresolved: boolean
  }
  const merged = new Map<string, Merged>()
  for (const inst of agg.instances) {
    for (const pin of inst.pins) {
      const key = `${pin.kind}:${pin.index}`
      const m = merged.get(key) ?? {
        kind: pin.kind,
        index: pin.index,
        types: new Set<number>(),
        sawUnresolved: false
      }
      merged.set(key, m)
      if (pin.type !== 0) m.types.add(pin.type)
      if (pin.unresolvedReflective) m.sawUnresolved = true
    }
  }

  const records = new Map<string, PinRecord>()
  const reflectiveInputIndexes: number[] = []
  for (const [key, m] of merged) {
    const kind = PIN_KIND_NAMES[m.kind]
    if (!kind) {
      throw new Error(`[error] ${agg.subType}:${agg.genericId} unknown pin kind ${m.kind}`)
    }
    const isFlow = kind === 'in_flow' || kind === 'out_flow'
    const reflective = !isFlow && (m.sawUnresolved || m.types.size > 1)
    const singleType = m.types.size === 1 ? [...m.types][0] : undefined
    const record: PinRecord = {
      index: m.index,
      kind,
      type: isFlow
        ? 'flow'
        : reflective
          ? 'generic'
          : singleType !== undefined
            ? (CLIENT_VAR_TYPE_NAMES[singleType] ?? `client_${singleType}`)
            : 'unknown'
    }
    if (reflective) record.reflective = true
    if (!isFlow && !reflective && singleType !== undefined) record.clientVarType = singleType
    records.set(key, record)
    if (reflective && kind === 'input') reflectiveInputIndexes.push(m.index)
  }
  reflectiveInputIndexes.sort((a, b) => a - b)
  return { records, reflectiveInputIndexes }
}

type ReflectVariant = {
  concreteId: number
  variantKey: string
  pins?: PinRecord[]
}

function deriveReflectMap(
  agg: GidAggregate,
  reflectiveInputIndexes: number[]
): { variants: ReflectVariant[]; conflicts: string[]; underived: number[] } {
  const byConcrete = new Map<number, Map<string, number>>()
  for (const inst of agg.instances) {
    if (inst.concreteId === undefined) continue
    const typed = new Map(
      inst.pins.filter((p) => p.kind === 3).map((p) => [p.index, p])
    )
    const keyParts: string[] = []
    let derivable = true
    for (const idx of reflectiveInputIndexes) {
      const pin = typed.get(idx)
      if (!pin || pin.type === 0) {
        derivable = false
        break
      }
      keyParts.push(String(pin.type))
    }
    if (!derivable) continue
    const key = keyParts.join(',')
    const byKey = byConcrete.get(inst.concreteId) ?? new Map<string, number>()
    byConcrete.set(inst.concreteId, byKey)
    byKey.set(key, (byKey.get(key) ?? 0) + 1)
  }

  const variants: ReflectVariant[] = []
  const conflicts: string[] = []
  const keyToConcrete = new Map<string, number>()
  const underived: number[] = []

  const observedConcreteIds = new Set(
    agg.instances.map((i) => i.concreteId).filter((c): c is number => c !== undefined)
  )
  for (const cid of [...observedConcreteIds].sort((a, b) => a - b)) {
    const byKey = byConcrete.get(cid)
    if (!byKey || byKey.size === 0) {
      underived.push(cid)
      continue
    }
    if (byKey.size > 1) {
      conflicts.push(`concreteId ${cid} maps to multiple keys: ${[...byKey.keys()].join(' | ')}`)
      continue
    }
    const key = [...byKey.keys()][0]
    const prior = keyToConcrete.get(key)
    if (prior !== undefined && prior !== cid) {
      conflicts.push(`variant key "${key}" maps to concreteIds ${prior} and ${cid}`)
      continue
    }
    keyToConcrete.set(key, cid)
    const variantPins: PinRecord[] = []
    const inst = agg.instances.find(
      (i) =>
        i.concreteId === cid &&
        reflectiveInputIndexes.every((idx) =>
          i.pins.some((p) => p.kind === 3 && p.index === idx && p.type !== 0)
        )
    )
    if (inst) {
      for (const idx of reflectiveInputIndexes) {
        const pin = inst.pins.find((p) => p.kind === 3 && p.index === idx)!
        variantPins.push({
          index: idx,
          kind: 'input',
          type: CLIENT_VAR_TYPE_NAMES[pin.type] ?? `client_${pin.type}`,
          clientVarType: pin.type
        })
      }
    }
    variants.push({ concreteId: cid, variantKey: key, pins: variantPins.length ? variantPins : undefined })
  }
  return { variants, conflicts, underived }
}

// ---------------------------------------------------------------------------
// Literal value shape census (Task 12 evidence)
// ---------------------------------------------------------------------------

type ValueShape = {
  clientVarType: number
  typeName: string
  shape: unknown
  sampleFile: string
  genericId: number
  pinIndex: number
  count: number
}

function shapeOfVarBase(value: any): unknown {
  if (value === undefined || value === null) return undefined
  const shape: Record<string, unknown> = { class: Number(value.class) }
  if (value.alreadySetVal !== undefined) shape.alreadySetVal = Boolean(value.alreadySetVal)
  if (value.itemType) {
    const it: Record<string, unknown> = { classBase: Number(value.itemType.classBase) }
    const tc = value.itemType.type_client
    if (tc) {
      const tcs: Record<string, unknown> = { type: Number(tc.type) }
      if (tc.implKind !== undefined) tcs.implKind = Number(tc.implKind)
      if (tc.marker) tcs.marker = true
      if (tc.containerBinding) tcs.containerBinding = tc.containerBinding
      it.type_client = tcs
    }
    if (value.itemType.type_server) it.type_server = '(server)'
    shape.itemType = it
  }
  for (const field of ['bId', 'bInt', 'bFloat', 'bString', 'bEnum', 'bVector', 'bArray', 'bStruct', 'bMap', 'bMapPair']) {
    if (value[field] !== undefined) shape[field] = `set(${typeof value[field]})`
  }
  if (value.bConcreteValue) {
    shape.bConcreteValue = {
      indexOfConcrete: Number(value.bConcreteValue.indexOfConcrete ?? 0),
      structs: value.bConcreteValue.structs ? true : undefined,
      value: shapeOfVarBase(value.bConcreteValue.value)
    }
  }
  return shape
}

function collectValueShapes(
  shapes: Map<string, ValueShape>,
  root: DecodedRoot,
  relFile: string
) {
  for (const node of graphNodes(root)) {
    for (const pin of node.pins ?? []) {
      if (Number(pin.i1?.kind) !== 3) continue
      if (!pin.value?.alreadySetVal) continue
      const pinType = Number(pin.type ?? 0)
      if (pinType === 0) continue
      const shape = shapeOfVarBase(pin.value)
      const key = `${pinType}:${JSON.stringify(shape)}`
      const existing = shapes.get(key)
      if (existing) {
        existing.count += 1
      } else {
        shapes.set(key, {
          clientVarType: pinType,
          typeName: CLIENT_VAR_TYPE_NAMES[pinType] ?? `client_${pinType}`,
          shape,
          sampleFile: relFile,
          genericId: Number(node.genericId?.nodeId),
          pinIndex: Number(pin.i1?.index ?? 0),
          count: 1
        })
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Existing special-case reports
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

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
  const valueShapes = new Map<string, ValueShape>()

  const gidAggregates = new Map<string, GidAggregate>()
  const universalAggregates = new Map<ClientGraphSubType, GidAggregate>()

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
    collectValueShapes(valueShapes, root, relFile)

    inlineVarTypeHintHits.push(
      ...annotateInlineVarTypeHintHits(
        scanVarBaseField3Messages(giaRootType, unwrap_gia(file, false)),
        root,
        relFile,
        subType
      )
    )

    const stem = path.basename(file, path.extname(file))
    const suffixMatch = stem.match(/^(.*?)(?:_(连线|填值))?$/u)
    const baseName = suffixMatch?.[1] ?? stem
    const isBaseSample = !suffixMatch?.[2]
    const universalGid = UNIVERSAL_NODE_BY_SUB_TYPE[subType].genericId

    // Name attribution: a suffix-less base sample demonstrates exactly one
    // non-universal node; only that node inherits the sample's base name.
    const residualGids = new Set(
      graphNodes(root)
        .map((node) => Number(node.genericId?.nodeId))
        .filter((gid) => gid !== universalGid)
    )
    const namedGid = isBaseSample && residualGids.size === 1 ? [...residualGids][0] : undefined

    for (const node of graphNodes(root)) {
      const gid = Number(node.genericId?.nodeId)
      const isUniversal = gid === universalGid
      const key = `${subType}:${gid}`
      let agg = isUniversal ? universalAggregates.get(subType) : gidAggregates.get(key)
      if (!agg) {
        agg = {
          subType,
          genericId: gid,
          graphTypes: new Set(),
          baseNames: new Set(),
          exampleFile: relFile,
          instances: [],
          ctxDecls: new Set(),
          statusExts: new Set()
        }
        if (isUniversal) universalAggregates.set(subType, agg)
        else gidAggregates.set(key, agg)
      }
      agg.graphTypes.add(Number(node.genericId?.type))
      if (gid === namedGid) agg.baseNames.add(baseName)
      const rawCid = node.concreteId?.nodeId
      agg.instances.push({
        concreteId: rawCid === undefined || rawCid === null ? undefined : Number(rawCid),
        pins: pinInstances(node)
      })
      if (node.contextDeclaration) {
        agg.ctxDecls.add(
          JSON.stringify({
            kind: Number(node.contextDeclaration.kind),
            index: Number(node.contextDeclaration.index)
          })
        )
      }
      if (node.statusNodeExtension) {
        agg.statusExts.add(JSON.stringify(node.statusNodeExtension))
      }
    }
  }

  // -------------------------------------------------------------------------
  // Build metadata records
  // -------------------------------------------------------------------------

  const inlineHintGids = new Set(
    inlineVarTypeHintHits
      .filter((hit) => hit.genericId !== undefined)
      .map((hit) => `${hit.subType}:${hit.genericId}`)
  )

  const records: NodeRecord[] = []
  const nodeTypeSeen = new Map<string, string>()
  const missingEnglishNames: Array<{ subType: string; displayName: string; nodeType: string; genericId: number }> = []
  const reflectReport: Array<{
    subType: string
    nodeType: string
    genericId: number
    variantKeys: Record<string, number | string>
    conflicts?: string[]
    underivedConcreteIds?: number[]
    status: 'resolved' | 'needs_developer_confirmation'
  }> = []

  function buildRecord(agg: GidAggregate, fixedNodeType?: string): NodeRecord {
    // Prefer the non-minimal base name as the display name
    const bases = [...agg.baseNames].filter((b) => !b.startsWith('最小图')).sort()
    const displayName = bases[0] ?? [...agg.baseNames].sort()[0]
    if (!displayName && !fixedNodeType) {
      throw new Error(
        `[error] ${agg.subType}:${agg.genericId} has no demonstrating base sample (seen in ${agg.exampleFile})`
      )
    }
    const english = fixedNodeType ?? englishNodeType(displayName)
    const nodeType = english ?? normalizeNodeType(displayName)
    if (!english && !fixedNodeType) {
      missingEnglishNames.push({
        subType: agg.subType,
        displayName,
        nodeType,
        genericId: agg.genericId
      })
    }

    const dupKey = `${agg.subType}:${nodeType}`
    const dup = nodeTypeSeen.get(dupKey)
    if (dup) {
      throw new Error(`[error] duplicate nodeType ${dupKey} from ${dup} and ${displayName}`)
    }
    nodeTypeSeen.set(dupKey, displayName)

    if (agg.graphTypes.size !== 1) {
      throw new Error(
        `[error] ${agg.subType}:${agg.genericId} inconsistent NodeProperty.type: ${[...agg.graphTypes].join(',')}`
      )
    }
    if (agg.ctxDecls.size > 1) {
      throw new Error(
        `[error] ${agg.subType}:${agg.genericId} inconsistent contextDeclaration: ${[...agg.ctxDecls].join(' | ')}`
      )
    }
    if (agg.statusExts.size > 1) {
      throw new Error(
        `[error] ${agg.subType}:${agg.genericId} inconsistent statusNodeExtension: ${[...agg.statusExts].join(' | ')}`
      )
    }

    const { records: pinRecords, reflectiveInputIndexes } = mergePins(agg)
    const inputs: PinRecord[] = []
    const outputs: PinRecord[] = []
    const flows: PinRecord[] = []
    for (const record of pinRecords.values()) {
      if (record.kind === 'input') inputs.push(record)
      else if (record.kind === 'output') outputs.push(record)
      else flows.push(record)
    }
    inputs.sort((a, b) => a.index - b.index)
    outputs.sort((a, b) => a.index - b.index)
    flows.sort((a, b) => a.kind.localeCompare(b.kind) || a.index - b.index)

    const concreteIds = new Set(
      agg.instances.map((i) => i.concreteId).filter((c): c is number => c !== undefined)
    )

    const record: NodeRecord = {
      subType: agg.subType,
      nodeType,
      displayName,
      graphType: [...agg.graphTypes][0],
      genericId: agg.genericId,
      concreteId: concreteIds.size === 1 ? [...concreteIds][0] : null,
      inputs,
      outputs,
      ...(flows.length ? { flows } : {}),
      sampleFile: agg.exampleFile
    }

    if (concreteIds.size > 1) {
      const { variants, conflicts, underived } = deriveReflectMap(agg, reflectiveInputIndexes)
      record.reflectMap = variants.map((v) => ({
        concreteId: v.concreteId,
        variantKey: v.variantKey,
        ...(v.pins ? { pins: v.pins } : {})
      }))
      record.specialKind = 'reflect'
      const status =
        conflicts.length || underived.length || variants.length === 0
          ? 'needs_developer_confirmation'
          : 'resolved'
      reflectReport.push({
        subType: agg.subType,
        nodeType,
        genericId: agg.genericId,
        variantKeys: Object.fromEntries(variants.map((v) => [v.variantKey, v.concreteId])),
        ...(conflicts.length ? { conflicts } : {}),
        ...(underived.length ? { underivedConcreteIds: underived } : {}),
        status
      })
    }

    if (agg.ctxDecls.size === 1) {
      record.contextDeclaration = JSON.parse([...agg.ctxDecls][0])
    }
    if (inlineHintGids.has(`${agg.subType}:${agg.genericId}`) && !record.specialKind) {
      record.specialKind = 'inline_var_type_hint'
    }
    return record
  }

  for (const subType of Object.keys(UNIVERSAL_NODE_BY_SUB_TYPE) as ClientGraphSubType[]) {
    const agg = universalAggregates.get(subType)
    if (!agg) throw new Error(`[error] ${subType}: universal node not observed`)
    const spec = UNIVERSAL_NODE_BY_SUB_TYPE[subType]
    const record = buildRecord(agg, spec.nodeType)
    record.displayName = spec.nodeType
    if (spec.nodeType === 'node_graph_begins') {
      record.specialKind = 'start'
      record.isStart = true
    }
    if (subType.startsWith('creation_status')) {
      const observed = [...agg.statusExts][0]
      if (observed !== EXPECTED_STATUS_EXTENSION) {
        throw new Error(
          `[error] ${subType}: statusNodeExtension mismatch, observed ${observed}, expected ${EXPECTED_STATUS_EXTENSION}`
        )
      }
    }
    records.push(record)
  }

  for (const key of [...gidAggregates.keys()].sort()) {
    records.push(buildRecord(gidAggregates.get(key)!))
  }
  records.sort(
    (a, b) => a.subType.localeCompare(b.subType) || a.nodeType.localeCompare(b.nodeType)
  )

  // -------------------------------------------------------------------------
  // Reports
  // -------------------------------------------------------------------------

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

  const inlineHintFiles = Object.values(
    inlineVarTypeHintHits.reduce<Record<string, { file: string; count: number }>>((acc, hit) => {
      acc[hit.file] ??= { file: hit.file, count: 0 }
      acc[hit.file].count += 1
      return acc
    }, {})
  )

  const report = {
    sampleRoot,
    sampleCount: files.length,
    familyCounts: Object.fromEntries([...familyCounts.entries()].sort()),
    graphIdentities: [...graphIdentities.entries()].map(([raw, count]) => ({
      ...JSON.parse(raw),
      count
    })),
    metadataCounts: {
      total: records.length,
      bySubType: records.reduce<Record<string, number>>((acc, r) => {
        acc[r.subType] = (acc[r.subType] ?? 0) + 1
        return acc
      }, {}),
      withReflectMap: records.filter((r) => r.reflectMap).length,
      missingEnglishName: missingEnglishNames.length
    },
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
      files: inlineHintFiles,
      hits: inlineVarTypeHintHits
    }
  }

  const valueShapeList = [...valueShapes.values()].sort(
    (a, b) => a.clientVarType - b.clientVarType || b.count - a.count
  )

  writeJson('resources/client_node_metadata.json', records)
  writeJson('resources/client_graph_capability.json', capability)
  writeJson('resources/client_execution_flow_metadata.json', [])
  writeJson('tests/client_generated/_value_shapes.json', {
    description:
      'Observed VarBase shapes for literal input pins (alreadySetVal=true) grouped by clientVarType',
    shapeCount: valueShapeList.length,
    byClientVarType: valueShapeList.reduce<Record<string, number>>((acc, s) => {
      acc[`${s.clientVarType}:${s.typeName}`] = (acc[`${s.clientVarType}:${s.typeName}`] ?? 0) + s.count
      return acc
    }, {}),
    shapes: valueShapeList
  })
  writeJson('tests/client_generated/_reflect_resolution.json', {
    description: 'Reflect/generic variant resolution coverage derived from samples',
    multiVariantGenericIds: reflectReport.length,
    needsDeveloperConfirmation: reflectReport.filter(
      (r) => r.status === 'needs_developer_confirmation'
    ).length,
    entries: reflectReport
  })
  writeJson('tests/client_generated/_coverage_gaps.json', {
    unsupportedSpecialKinds: ['inline_var_type_hint'],
    conditionalSpecialKinds: ['structure_list_unknown_binding'],
    inlineVarTypeHintFiles: inlineHintFiles,
    missingEnglishName: missingEnglishNames,
    reflectNeedsConfirmation: reflectReport.filter(
      (r) => r.status === 'needs_developer_confirmation'
    ),
    missingMetadata: []
  })
  writeJson('tests/client_generated/_report.json', report)

  console.log(`[ok] scanned ${files.length} client gia samples`)
  console.log(
    `[ok] extracted ${records.length} node metadata records (${records.filter((r) => r.reflectMap).length} with reflectMap, ${missingEnglishNames.length} without english name)`
  )
}

main()
