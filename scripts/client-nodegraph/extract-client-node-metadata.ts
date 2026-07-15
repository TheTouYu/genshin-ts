import fs from 'node:fs'
import path from 'node:path'

import protobuf from 'protobufjs'

import { SERVER_EVENT_ZH_TO_EN, SERVER_F_ZH_TO_EN } from '../../src/definitions/zh_aliases.js'
import {
  decode_gia_file,
  unwrap_gia
} from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'
import { buildDocNameAlignment, lookupDocNode, type DocAlignment } from './doc_name_alignment.js'

type ClientGraphSubType =
  | 'character_skill'
  | 'character_control_skill'
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
const ROUND3_EVIDENCE_PATH = 'resources/client_structure_evidence.round3.json'
const CLIENT_NODE_MODES_PATH = 'resources/client_node_modes.json'

const FAMILY_BY_DIR: Record<string, ClientGraphSubType> = {
  角色技能节点图: 'character_skill',
  角色操控技能节点图: 'character_control_skill',
  造物技能节点图: 'creation_skill',
  造物状态节点图: 'creation_status',
  造物状态决策节点图: 'creation_status_decision',
  布尔过滤器节点: 'bool_filter',
  整数过滤器节点: 'int_filter'
}

// User-defined signal senders/receivers carry dynamic high-range generic ids
// (0x60000018 send / 0x6000001B receive observed in round-2 samples); they are
// per-graph artifacts, not fixed node types, and are excluded from metadata.
const DYNAMIC_GENERIC_ID_MIN = 0x60000000

// The one node present in every sample of a family: begins for skill/status
// families, the result end node for filter families.
const UNIVERSAL_NODE_BY_SUB_TYPE: Record<
  ClientGraphSubType,
  { genericId: number; nodeType: string }
> = {
  character_skill: { genericId: 200042, nodeType: 'node_graph_begins' },
  character_control_skill: { genericId: 200042, nodeType: 'node_graph_begins' },
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
  /** single consistent literal payload observed across all set instances */
  defaultValue?: number | string | boolean | [number, number, number]
  /** editor i2 index when it differs from i1 (round-3 pinIndexRemap evidence) */
  i2Index?: number
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

type ClientGraphModeData = {
  status: 'available' | 'unavailable'
  reason: string
  genericIds: number[]
}

type ClientNodeModeData = {
  graphs: Record<
    ClientGraphSubType,
    {
      entryGenericId: number
      beyond: ClientGraphModeData
      classic: ClientGraphModeData
    }
  >
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

function applyEditorStaticMetadata(records: NodeRecord[], modeData: ClientNodeModeData) {
  const creationRecovery = records.find(
    (record) => record.subType === 'creation_skill' && record.nodeType === 'recover_creation_s_hp'
  )
  if (!creationRecovery) throw new Error('[error] missing sampled creation recovery metadata')
  creationRecovery.genericId = 200249
  creationRecovery.displayName = '造物恢复生命值'

  const graphTypeBySubType: Record<ClientGraphSubType, number> = {
    bool_filter: 20001,
    int_filter: 20001,
    character_skill: 20002,
    character_control_skill: 20002,
    creation_skill: 20002,
    creation_status: 20007,
    creation_status_decision: 20007
  }
  const staticSeeds = new Map<number, Omit<NodeRecord, 'subType' | 'graphType'>>([
    [
      200242,
      {
        nodeType: 'get_player_s_character_list',
        displayName: '获取玩家的角色列表',
        genericId: 200242,
        concreteId: 1067,
        inputs: [{ index: 0, kind: 'input', type: 'entity', clientVarType: 1 }],
        outputs: [{ index: 0, kind: 'output', type: 'entity_list', clientVarType: 2 }],
        sampleFile: 'BeyondEditorStatic/Node/16783183026819652111.mihoyobin'
      }
    ],
    [
      200251,
      {
        nodeType: 'get_active_character_of_specified_player',
        displayName: '获取指定玩家的前台角色',
        genericId: 200251,
        concreteId: 1002,
        inputs: [{ index: 0, kind: 'input', type: 'entity', clientVarType: 1 }],
        outputs: [{ index: 0, kind: 'output', type: 'entity', clientVarType: 1 }],
        sampleFile: 'BeyondEditorStatic/Node/17432833879509313657.mihoyobin'
      }
    ],
    [
      200254,
      {
        nodeType: 'check_classic_mode_character_id',
        displayName: '查询经典模式角色编号',
        genericId: 200254,
        concreteId: 1069,
        inputs: [{ index: 0, kind: 'input', type: 'entity', clientVarType: 1 }],
        outputs: [{ index: 0, kind: 'output', type: 'int', clientVarType: 3 }],
        sampleFile: 'BeyondEditorStatic/Node/279208459246344190.mihoyobin'
      }
    ]
  ])

  const reused: Array<{
    subType: ClientGraphSubType
    genericId: number
    nodeType: string
    sourceSubType: ClientGraphSubType | 'static'
  }> = []

  for (const [subType, graph] of Object.entries(modeData.graphs) as Array<
    [ClientGraphSubType, ClientNodeModeData['graphs'][ClientGraphSubType]]
  >) {
    const supportedIds = new Set([...graph.beyond.genericIds, ...graph.classic.genericIds])
    for (const genericId of [...supportedIds].sort((a, b) => a - b)) {
      if (records.some((record) => record.subType === subType && record.genericId === genericId)) {
        continue
      }

      const seed = staticSeeds.get(genericId)
      const source = records
        .filter((record) => record.genericId === genericId)
        .sort((a, b) => a.subType.localeCompare(b.subType))[0]
      if (!seed && !source) {
        throw new Error(`[error] ${subType}:${genericId} has no sample or static metadata seed`)
      }

      const record: NodeRecord = seed
        ? { ...structuredClone(seed), subType, graphType: graphTypeBySubType[subType] }
        : {
            ...structuredClone(source!),
            subType,
            graphType: graphTypeBySubType[subType]
          }
      const conflict = records.find(
        (item) => item.subType === subType && item.nodeType === record.nodeType
      )
      if (conflict) {
        throw new Error(
          `[error] ${subType}.${record.nodeType} maps to both ${conflict.genericId} and ${genericId}`
        )
      }
      records.push(record)
      reused.push({
        subType,
        genericId,
        nodeType: record.nodeType,
        sourceSubType: source?.subType ?? 'static'
      })
    }
  }

  return reused
}

/**
 * Round-3 verified i1->i2 pin remap table (32 genericIds, corpus-wide zero
 * conflicts). Keys are `${pinKind}:${i1Index}`, values the editor i2 index.
 */
function loadPinIndexRemap(): Map<number, Map<string, number>> {
  const evidence = JSON.parse(fs.readFileSync(ROUND3_EVIDENCE_PATH, 'utf8')) as {
    pinIndexRemap: { nodes: Array<{ genericId: number; i1ToI2: Record<string, string> }> }
  }
  const byGenericId = new Map<number, Map<string, number>>()
  for (const node of evidence.pinIndexRemap.nodes) {
    const remap = new Map<string, number>()
    for (const [from, to] of Object.entries(node.i1ToI2)) {
      const f = from.match(/^k(\d+)\[(\d+)]$/)
      const t = to.match(/^k(\d+)\[(\d+)]$/)
      if (!f || !t || f[1] !== t[1]) {
        throw new Error(`[error] bad i1ToI2 entry ${from} -> ${to} (genericId ${node.genericId})`)
      }
      remap.set(`${f[1]}:${f[2]}`, Number(t[2]))
    }
    byGenericId.set(node.genericId, remap)
  }
  return byGenericId
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

// keep leading underscores: server method `_3dVectorDotProduct` -> `_3d_vector_dot_product`
function camelToSnake(name: string): string {
  return name.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`)
}

/** official doc en name -> snake nodeType, keeping the leading-digit underscore rule */
function docEnToSnake(name: string): string {
  const snake = normalizeNodeType(name)
  return /^\d/.test(snake) ? `_${snake}` : snake
}

type EnglishNodeTypeResult = {
  nodeType: string
  source: 'server_alias' | 'official_doc'
  /** set when both sources resolve but disagree; server alias wins for parity */
  docDivergence?: string
}

/**
 * Server alias names keep priority (server-parity method names for shared
 * nodes); official client doc names fill every remaining gap.
 */
function englishNodeType(
  alignment: DocAlignment,
  subType: string,
  displayName: string
): EnglishNodeTypeResult | undefined {
  const serverEn =
    (SERVER_F_ZH_TO_EN as Record<string, string>)[displayName] ??
    (SERVER_EVENT_ZH_TO_EN as Record<string, string>)[displayName]
  const doc = lookupDocNode(alignment, subType, displayName)
  if (serverEn) {
    const serverSnake = camelToSnake(serverEn)
    const docSnake = doc ? docEnToSnake(doc.enName) : undefined
    return {
      nodeType: serverSnake,
      source: 'server_alias',
      ...(docSnake && docSnake !== serverSnake ? { docDivergence: doc!.enName } : {})
    }
  }
  if (doc) return { nodeType: docEnToSnake(doc.enName), source: 'official_doc' }
  return undefined
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
  /** scalar payload observed on this pin (unwrapped b* field) */
  literal?: { payload: PinLiteral; set: boolean }
}

type PinLiteral = number | string | boolean | [number, number, number]

/**
 * Extract the scalar payload carried by a pin value. Editor defaults are
 * stored with alreadySetVal=false but still carry the b* payload, so set-ness
 * is not required. Wrapped ConcreteBase and list payloads return undefined.
 */
function pinLiteralPayload(value: any): PinLiteral | undefined {
  if (!value || Number(value.class) === 10000) return undefined
  if (value.bInt !== undefined) return Number(value.bInt.val ?? 0)
  if (value.bFloat !== undefined) return Number(value.bFloat.val ?? 0)
  if (value.bString !== undefined) return String(value.bString.val ?? '')
  if (value.bEnum !== undefined) return Number(value.bEnum.val ?? 0)
  if (value.bId !== undefined) return Number(value.bId.val ?? 0)
  if (value.bVector !== undefined) {
    const v = value.bVector.val ?? {}
    return [Number(v.x ?? 0), Number(v.y ?? 0), Number(v.z ?? 0)]
  }
  return undefined
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
    const payload = pinLiteralPayload(pin.value)
    return {
      kind: Number(pin.i1?.kind ?? 0),
      index: Number(pin.i1?.index ?? 0),
      type: Number(pin.type ?? 0),
      unresolvedReflective: Number(pin.value?.class) === 10000 && Number(ioc ?? 0) === -1,
      wrappedConcrete: Number(pin.value?.class) === 10000,
      ...(payload !== undefined
        ? { literal: { payload, set: Boolean(pin.value?.alreadySetVal) } }
        : {})
    }
  })
}

function mergePins(agg: GidAggregate): {
  records: Map<string, PinRecord>
  reflectiveInputIndexes: number[]
  reflectiveOutputIndexes: number[]
} {
  type Merged = {
    kind: number
    index: number
    types: Set<number>
    sawUnresolved: boolean
    /** payloads carried by pins the sample author did not touch (editor defaults) */
    unsetPayloads: Set<string>
  }
  const merged = new Map<string, Merged>()
  for (const inst of agg.instances) {
    for (const pin of inst.pins) {
      const key = `${pin.kind}:${pin.index}`
      const m = merged.get(key) ?? {
        kind: pin.kind,
        index: pin.index,
        types: new Set<number>(),
        sawUnresolved: false,
        unsetPayloads: new Set<string>()
      }
      merged.set(key, m)
      if (pin.type !== 0) m.types.add(pin.type)
      if (pin.unresolvedReflective) m.sawUnresolved = true
      if (pin.literal !== undefined && !pin.literal.set) {
        m.unsetPayloads.add(JSON.stringify(pin.literal.payload))
      }
    }
  }

  const records = new Map<string, PinRecord>()
  const reflectiveInputIndexes: number[] = []
  const reflectiveOutputIndexes: number[] = []
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
    // A pin whose untouched instances all carry the same payload documents the
    // editor default (e.g. hidden operator-selector enums: bEnum val 300/301).
    if (kind === 'input' && !reflective && m.unsetPayloads.size === 1) {
      record.defaultValue = JSON.parse([...m.unsetPayloads][0])
    }
    records.set(key, record)
    if (reflective && kind === 'input') reflectiveInputIndexes.push(m.index)
    if (reflective && kind === 'output') reflectiveOutputIndexes.push(m.index)
  }
  reflectiveInputIndexes.sort((a, b) => a - b)
  reflectiveOutputIndexes.sort((a, b) => a - b)
  return { records, reflectiveInputIndexes, reflectiveOutputIndexes }
}

type ReflectVariant = {
  concreteId: number
  variantKey: string
  pins?: PinRecord[]
}

function deriveReflectMap(
  agg: GidAggregate,
  reflectiveInputIndexes: number[],
  reflectiveOutputIndexes: number[]
): {
  variants: ReflectVariant[]
  conflicts: string[]
  underived: number[]
  outputDrifts: string[]
} {
  const byConcrete = new Map<number, Map<string, number>>()
  for (const inst of agg.instances) {
    if (inst.concreteId === undefined) continue
    const typed = new Map(inst.pins.filter((p) => p.kind === 3).map((p) => [p.index, p]))
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
  const outputDrifts: string[] = []
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
    const candidates = agg.instances.filter(
      (i) =>
        i.concreteId === cid &&
        reflectiveInputIndexes.every((idx) =>
          i.pins.some((p) => p.kind === 3 && p.index === idx && p.type !== 0)
        )
    )
    const inst = candidates[0]
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
      for (const idx of reflectiveOutputIndexes) {
        // 输出类型必须在同 cid+同输入键的全部实例上一致；出现漂移（如字典节点的
        // 值类型不体现在 cid/输入引脚上）时记录任何一种都是假确定类型，直接不记录
        const observed = new Set<number>()
        for (const cand of candidates) {
          const pin = cand.pins.find((p) => p.kind === 4 && p.index === idx)
          if (pin && pin.type !== 0) observed.add(pin.type)
        }
        if (observed.size > 1) {
          outputDrifts.push(
            `concreteId ${cid} output pin #${idx} type drifts across samples: ` +
              `${[...observed]
                .sort((a, b) => a - b)
                .map((t) => CLIENT_VAR_TYPE_NAMES[t] ?? `client_${t}`)
                .join(' | ')}`
          )
          continue
        }
        const [type] = observed
        if (type === undefined) continue
        variantPins.push({
          index: idx,
          kind: 'output',
          type: CLIENT_VAR_TYPE_NAMES[type] ?? `client_${type}`,
          clientVarType: type
        })
      }
    }
    variants.push({
      concreteId: cid,
      variantKey: key,
      pins: variantPins.length ? variantPins : undefined
    })
  }
  return { variants, conflicts, underived, outputDrifts }
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
  for (const field of [
    'bId',
    'bInt',
    'bFloat',
    'bString',
    'bEnum',
    'bVector',
    'bArray',
    'bStruct',
    'bMap',
    'bMapPair'
  ]) {
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

function collectValueShapes(shapes: Map<string, ValueShape>, root: DecodedRoot, relFile: string) {
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
  const modeData = JSON.parse(fs.readFileSync(CLIENT_NODE_MODES_PATH, 'utf8')) as ClientNodeModeData

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
        .filter((gid) => gid !== universalGid && gid < DYNAMIC_GENERIC_ID_MIN)
    )
    const namedGid = isBaseSample && residualGids.size === 1 ? [...residualGids][0] : undefined

    for (const node of graphNodes(root)) {
      const gid = Number(node.genericId?.nodeId)
      if (gid >= DYNAMIC_GENERIC_ID_MIN) continue
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

  const docAlignment = buildDocNameAlignment()
  const pinIndexRemapByGid = loadPinIndexRemap()
  const records: NodeRecord[] = []
  const nodeTypeSeen = new Map<string, string>()
  const missingEnglishNames: Array<{
    subType: string
    displayName: string
    nodeType: string
    genericId: number
  }> = []
  const nodeTypeSources: Record<string, number> = {}
  const serverAliasDivergences: Array<{
    subType: string
    displayName: string
    nodeType: string
    officialDocEnName: string
  }> = []
  const reflectReport: Array<{
    subType: string
    nodeType: string
    genericId: number
    variantKeys: Record<string, number | string>
    conflicts?: string[]
    /** 同 cid+输入键下输出类型漂移：输出不由变体决定，已从 variantPins 剔除 */
    outputTypeDrifts?: string[]
    underivedConcreteIds?: number[]
    provenance?: 'family' | 'generic_id_union'
    status: 'resolved' | 'needs_developer_confirmation'
  }> = []

  type ReflectDerivation = {
    record: NodeRecord
    reflectiveInputIndexes: number[]
    observedConcreteIds: number[]
    variants: ReflectVariant[]
    conflicts: string[]
    outputDrifts: string[]
  }
  const reflectDerivations: ReflectDerivation[] = []

  function buildRecord(agg: GidAggregate, fixedNodeType?: string): NodeRecord {
    // Prefer the non-minimal base name as the display name
    const bases = [...agg.baseNames].filter((b) => !b.startsWith('最小图')).sort()
    const displayName = bases[0] ?? [...agg.baseNames].sort()[0]
    if (!displayName && !fixedNodeType) {
      throw new Error(
        `[error] ${agg.subType}:${agg.genericId} has no demonstrating base sample (seen in ${agg.exampleFile})`
      )
    }
    const english = fixedNodeType
      ? undefined
      : englishNodeType(docAlignment, agg.subType, displayName)
    const nodeType = fixedNodeType ?? english?.nodeType ?? normalizeNodeType(displayName)
    if (!english && !fixedNodeType) {
      missingEnglishNames.push({
        subType: agg.subType,
        displayName,
        nodeType,
        genericId: agg.genericId
      })
    } else if (english) {
      nodeTypeSources[english.source] = (nodeTypeSources[english.source] ?? 0) + 1
      if (english.docDivergence) {
        serverAliasDivergences.push({
          subType: agg.subType,
          displayName,
          nodeType,
          officialDocEnName: english.docDivergence
        })
      }
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

    const { records: pinRecords, reflectiveInputIndexes, reflectiveOutputIndexes } = mergePins(agg)
    const i2Remap = pinIndexRemapByGid.get(agg.genericId)
    if (i2Remap) {
      for (const [key, pin] of pinRecords) {
        const i2 = i2Remap.get(key)
        if (i2 !== undefined) pin.i2Index = i2
      }
    }
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

    if (concreteIds.size > 1 || reflectiveInputIndexes.length > 0) {
      const { variants, conflicts, outputDrifts } = deriveReflectMap(
        agg,
        reflectiveInputIndexes,
        reflectiveOutputIndexes
      )
      // Final reflectMap assignment happens in the cross-family union pass
      // below; concrete variant evidence for the same genericId is shared
      // between families (same node definition, same concrete id space).
      reflectDerivations.push({
        record,
        reflectiveInputIndexes,
        observedConcreteIds: [...concreteIds].sort((a, b) => a - b),
        variants,
        conflicts,
        outputDrifts
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

  // -------------------------------------------------------------------------
  // Cross-family reflect union: the same genericId denotes the same node
  // definition in every family, so per-family variant evidence is merged and
  // validated globally before being attached to each family's record.
  // -------------------------------------------------------------------------

  const derivationsByGid = new Map<number, ReflectDerivation[]>()
  for (const derivation of reflectDerivations) {
    const list = derivationsByGid.get(derivation.record.genericId) ?? []
    list.push(derivation)
    derivationsByGid.set(derivation.record.genericId, list)
  }

  for (const [gid, group] of derivationsByGid) {
    const conflicts = group.flatMap((d) => d.conflicts)
    const outputDrifts = group.flatMap((d) => d.outputDrifts)
    const indexSets = new Set(group.map((d) => d.reflectiveInputIndexes.join(',')))
    if (indexSets.size > 1) {
      conflicts.push(
        `genericId ${gid} reflective input indexes differ across families: ${[...indexSets].join(' | ')}`
      )
    }

    const union = new Map<string, ReflectVariant>()
    const cidToKey = new Map<number | string, string>()
    const contributors = new Set<string>()
    // 已判定跨族漂移的输出引脚（`${variantKey}#${index}`）：后续族不得重新引入
    const driftedOutputs = new Set<string>()
    for (const d of group) {
      for (const v of d.variants) {
        const priorCid = union.get(v.variantKey)?.concreteId
        if (priorCid !== undefined && priorCid !== v.concreteId) {
          conflicts.push(
            `genericId ${gid} key "${v.variantKey}" maps to concreteIds ${priorCid} and ${v.concreteId}`
          )
          continue
        }
        const priorKey = cidToKey.get(v.concreteId)
        if (priorKey !== undefined && priorKey !== v.variantKey) {
          conflicts.push(
            `genericId ${gid} concreteId ${v.concreteId} maps to keys "${priorKey}" and "${v.variantKey}"`
          )
          continue
        }
        cidToKey.set(v.concreteId, v.variantKey)
        const existing = union.get(v.variantKey)
        if (!existing) {
          union.set(v.variantKey, v)
        } else {
          // 同键变体跨族合并：输入引脚按键构造必然一致；输出引脚类型若跨族
          // 漂移（同 cid 下输出不由变体决定），则该输出不可记录为确定类型，
          // 且一旦判漂移即永久剔除，后续族不得重新引入
          const merged: PinRecord[] = (existing.pins ?? []).filter((p) => p.kind === 'input')
          const existingOuts = (existing.pins ?? []).filter((p) => p.kind === 'output')
          const incomingOuts = (v.pins ?? []).filter((p) => p.kind === 'output')
          const outIndexes = new Set([
            ...existingOuts.map((p) => p.index),
            ...incomingOuts.map((p) => p.index)
          ])
          for (const idx of [...outIndexes].sort((a, b) => a - b)) {
            const driftKey = `${v.variantKey}#${idx}`
            if (driftedOutputs.has(driftKey)) continue
            const a = existingOuts.find((p) => p.index === idx)
            const b = incomingOuts.find((p) => p.index === idx)
            if (a && b && a.clientVarType !== b.clientVarType) {
              driftedOutputs.add(driftKey)
              outputDrifts.push(
                `genericId ${gid} key "${v.variantKey}" output pin #${idx} type drifts across families: ` +
                  `${a.type} | ${b.type}`
              )
              continue
            }
            merged.push((a ?? b)!)
          }
          union.set(v.variantKey, {
            concreteId: existing.concreteId,
            variantKey: existing.variantKey,
            pins: merged.length ? merged : undefined
          })
        }
        contributors.add(d.record.subType)
      }
    }

    const observedCids = [...new Set(group.flatMap((d) => d.observedConcreteIds))].sort(
      (a, b) => a - b
    )
    const underived = observedCids.filter((cid) => !cidToKey.has(cid))
    const unionVariants = [...union.values()].sort(
      (a, b) => Number(a.concreteId) - Number(b.concreteId)
    )

    for (const d of group) {
      const record = d.record
      const status =
        conflicts.length ||
        underived.length ||
        unionVariants.length === 0 ||
        d.reflectiveInputIndexes.length === 0
          ? 'needs_developer_confirmation'
          : 'resolved'
      const provenance =
        status !== 'resolved'
          ? undefined
          : d.variants.length === unionVariants.length
            ? ('family' as const)
            : ('generic_id_union' as const)
      // Unconfirmed variant rules must not be silently applied: publish an
      // empty reflectMap so the resolver rejects the node with a stable error.
      record.reflectMap =
        status === 'resolved'
          ? unionVariants.map((v) => ({
              concreteId: v.concreteId,
              variantKey: v.variantKey,
              ...(v.pins ? { pins: v.pins } : {})
            }))
          : []
      record.specialKind = 'reflect'
      reflectReport.push({
        subType: record.subType,
        nodeType: record.nodeType,
        genericId: gid,
        variantKeys: Object.fromEntries(unionVariants.map((v) => [v.variantKey, v.concreteId])),
        ...(conflicts.length ? { conflicts: [...new Set(conflicts)] } : {}),
        ...(outputDrifts.length ? { outputTypeDrifts: [...new Set(outputDrifts)] } : {}),
        ...(underived.length ? { underivedConcreteIds: underived } : {}),
        ...(provenance ? { provenance } : {}),
        status
      })
    }
  }

  const editorStaticReuse = applyEditorStaticMetadata(records, modeData)

  records.sort((a, b) => a.subType.localeCompare(b.subType) || a.nodeType.localeCompare(b.nodeType))

  // -------------------------------------------------------------------------
  // Reports
  // -------------------------------------------------------------------------

  const capability = Object.fromEntries(
    Object.entries(modeData.graphs).map(([subType, graph]) => [
      subType,
      {
        beyond: { status: graph.beyond.status, reason: graph.beyond.reason },
        classic: { status: graph.classic.status, reason: graph.classic.reason }
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
      missingEnglishName: missingEnglishNames.length,
      nodeTypeSources,
      serverAliasDivergenceCount: serverAliasDivergences.length
    },
    editorStaticReuse: {
      source: CLIENT_NODE_MODES_PATH,
      recoveredCount: editorStaticReuse.length,
      recovered: editorStaticReuse,
      correctedGenericIds: [
        {
          subType: 'creation_skill',
          nodeType: 'recover_creation_s_hp',
          from: 200075,
          to: 200249,
          source: 'BeyondEditorStatic/Node/9073923717836444300.mihoyobin'
        }
      ]
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
  writeJson('tests/client_generated/_doc_name_alignment.json', {
    description:
      'zh<->en alignment of resources/node_definitions.json client/detail pages (index-based pairing is forbidden; see doc_name_alignment.ts)',
    pagePairs: docAlignment.report.pagePairs,
    zhEntries: docAlignment.report.zhEntries,
    matchRate: docAlignment.report.matchRate,
    provenance: docAlignment.report.provenance,
    nodeTypeSources,
    serverAliasDivergences,
    spellingVariants: docAlignment.report.conflicts,
    unresolved: docAlignment.report.unresolved,
    sectionLeftovers: docAlignment.report.sectionLeftovers,
    seedMisses: docAlignment.report.seedMisses,
    zhOnlyPages: docAlignment.report.zhOnlyPages,
    zhToEn: Object.fromEntries(
      [...docAlignment.byZhName.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([zh, info]) => [zh, info.enName])
    )
  })
  writeJson('tests/client_generated/_value_shapes.json', {
    description:
      'Observed VarBase shapes for literal input pins (alreadySetVal=true) grouped by clientVarType',
    shapeCount: valueShapeList.length,
    byClientVarType: valueShapeList.reduce<Record<string, number>>((acc, s) => {
      acc[`${s.clientVarType}:${s.typeName}`] =
        (acc[`${s.clientVarType}:${s.typeName}`] ?? 0) + s.count
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
