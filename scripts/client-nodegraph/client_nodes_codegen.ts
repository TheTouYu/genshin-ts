/**
 * Generate full client execution-flow classes (src/definitions/client_nodes.ts)
 * from sample-extracted metadata (resources/client_node_metadata.json) and the
 * official bilingual docs (resources/node_definitions.json).
 *
 * Every generated method mirrors the server style: bilingual JSDoc, a real
 * typed signature, parseValue per argument, registry.registerNode, markPin on
 * output pins. Records that cannot be reconciled mechanically are written to
 * the gap report instead of guessed.
 */
import type { ClientEnumBinding } from './client_enum_binding.js'
import {
  docTypeTag,
  lookupDocNode,
  lookupDocNodeVariants,
  type AlignedDocNode,
  type DocAlignment,
  type DocParam
} from './doc_name_alignment.js'

// ---------------------------------------------------------------------------
// Shared shapes
// ---------------------------------------------------------------------------

export type MetaPin = {
  index: number
  kind: 'input' | 'output' | 'in_flow' | 'out_flow' | 'client_exec' | 'client_signal'
  type: string
  reflective?: boolean
  clientVarType?: number
  defaultValue?: unknown
}

export type MetaRecord = {
  subType: string
  nodeType: string
  displayName: string
  genericId: number
  concreteId: number | string | null
  inputs: MetaPin[]
  outputs: MetaPin[]
  flows?: MetaPin[]
  reflectMap?: Array<{ concreteId: number | string; variantKey: string; pins?: MetaPin[] }>
  specialKind?: string
  isStart?: boolean
  sampleFile: string
}

export type GapEntry = {
  subType: string
  nodeType: string
  displayName: string
  reason: string
  detail?: string
}

export type FlowMetadataEntry = {
  methodName: string
  nodeType: string
  subTypes: string[]
  modes: string[]
  kind: 'data' | 'exec' | 'control_flow'
  params: Array<{ name: string; irType: string; docZh: string; docEn: string }>
  returns: Array<{ name: string; irType: string; docZh: string; docEn: string }> | null
  docs: { en: string; zh: string }
  reflect?: { variantKeys: string[] }
}

export type CodegenResult = {
  classFileBody: string
  flowMetadata: FlowMetadataEntry[]
  methodsBySubType: Record<string, string[]>
  gaps: GapEntry[]
  /**
   * subType -> nodeType -> physical input pin index per public method arg.
   * Only present when not identity (hidden pins shift the mapping); consumed
   * by the IR->GIA transform so IR args stay in signature order without holes.
   */
  argPinsBySubType: Record<string, Record<string, number[]>>
}

const SUB_TYPES = [
  'character_skill',
  'character_control_skill',
  'creation_skill',
  'creation_status',
  'creation_status_decision',
  'bool_filter',
  'int_filter'
] as const

const CLASS_NAME_BY_SUB_TYPE: Record<string, string> = {
  character_skill: 'ClientCharacterSkillExecutionFlowFunctions',
  character_control_skill: 'ClientCharacterControlSkillExecutionFlowFunctions',
  creation_skill: 'ClientCreationSkillExecutionFlowFunctions',
  creation_status: 'ClientCreationStatusExecutionFlowFunctions',
  creation_status_decision: 'ClientCreationStatusDecisionExecutionFlowFunctions',
  bool_filter: 'ClientBoolFilterExecutionFlowFunctions',
  int_filter: 'ClientIntFilterExecutionFlowFunctions'
}

/** nodes excluded from method generation: graph entry/exit handled by the runtime */
const RUNTIME_INTERNAL_NODE_TYPES = new Set([
  'node_graph_begins',
  'node_graph_end_boolean',
  'node_graph_end_integer'
])

/** nodes emitted from hand templates, not the auto pipeline (control flow +
 * the three round-2-proven special encodings, task 四.3) */
const HAND_NODE_TYPES = new Set([
  'double_branch',
  'finite_loop',
  'traverse_entity_list',
  'break_loop',
  'assembly_list',
  'multiple_branches',
  'data_type_conversion',
  'get_custom_variable',
  'send_signal_to_server_node_graph',
  // 字典反射节点：键/值类型不体现在 cid/引脚变体上，样本推导必然产生假确定
  // 类型（如 entity[] vs bigint[] 漂移），改为服务器对齐的泛型手写模板
  'get_list_of_values_from_dictionary',
  'get_list_of_keys_from_dictionary',
  'query_dictionary_value_by_key',
  'query_if_dictionary_contains_specific_key',
  'query_if_dictionary_contains_specific_value',
  // 字典构造节点：cid 恒定（1048/1049），同样用服务器对齐泛型模板
  'assembly_dictionary',
  'create_dictionary',
  // 类型列表构造节点：文档零入参但样本有 1 数量 + 10 枚举隐藏引脚，
  // 手写模板暴露可选 types 参数（省略时与编辑器默认行为一致）
  'get_entity_type_list',
  'get_ray_filter_type_list'
])

// ---------------------------------------------------------------------------
// Type tables
// ---------------------------------------------------------------------------

/** runtime parameter (input) TS type per scalar IR type */
const PARAM_TS_BY_IR: Record<string, string> = {
  bool: 'BoolValue',
  int: 'IntValue',
  float: 'FloatValue',
  str: 'StrValue',
  vec3: 'Vec3Value',
  guid: 'GuidValue',
  entity: 'EntityValue',
  faction: 'FactionValue',
  config_id: 'ConfigIdValue',
  prefab_id: 'PrefabIdValue',
  enum: 'EnumerationValue',
  dict: 'DictValue'
}

/** runtime return TS type per scalar IR type */
const RETURN_TS_BY_IR: Record<string, string> = {
  bool: 'boolean',
  int: 'bigint',
  float: 'number',
  str: 'string',
  vec3: 'vec3',
  guid: 'guid',
  entity: 'entity',
  faction: 'faction',
  config_id: 'configId',
  prefab_id: 'prefabId',
  enum: 'enumeration'
}

/** value class constructor expression per scalar IR type */
const CLASS_EXPR_BY_IR: Record<string, string> = {
  bool: 'bool',
  int: 'int',
  float: 'float',
  str: 'str',
  vec3: 'vec3',
  guid: 'guid',
  entity: 'entity',
  faction: 'faction',
  config_id: 'configId',
  prefab_id: 'prefabId',
  enum: 'enumeration'
}

/** matchTypes candidate priority, mirroring server candidate ordering */
const TYPE_PRIORITY = [
  'float',
  'int',
  'bool',
  'config_id',
  'entity',
  'faction',
  'guid',
  'prefab_id',
  'str',
  'vec3',
  'dict'
]

/** doc data_type tags accepted for a pin IR type during doc<->pin alignment */
const DOC_TAGS_BY_PIN_TYPE: Record<string, string[]> = {
  bool: ['B'],
  int: ['I'],
  float: ['F'],
  str: ['S'],
  vec3: ['V'],
  enum: ['N'],
  entity: ['E'],
  guid: ['U'],
  config_id: ['C'],
  prefab_id: ['P'],
  faction: ['A'],
  dict: ['D'],
  bool_list: ['BL', 'L'],
  int_list: ['IL', 'L'],
  float_list: ['FL', 'L'],
  str_list: ['SL', 'L'],
  vec3_list: ['VL', 'L'],
  entity_list: ['EL', 'L'],
  enum_list: ['NL', 'L'],
  config_id_list: ['CL', 'L'],
  guid_list: ['UL', 'L'],
  prefab_id_list: ['L'],
  faction_list: ['L']
}

/** IR type per unambiguous doc data_type tag (used for doc-synthesized outputs) */
const IR_BY_DOC_TAG: Record<string, string> = {
  B: 'bool',
  I: 'int',
  F: 'float',
  S: 'str',
  V: 'vec3',
  E: 'entity',
  N: 'enum',
  U: 'guid',
  C: 'config_id',
  P: 'prefab_id',
  A: 'faction',
  D: 'dict',
  BL: 'bool_list',
  IL: 'int_list',
  FL: 'float_list',
  SL: 'str_list',
  VL: 'vec3_list',
  EL: 'entity_list',
  NL: 'enum_list',
  CL: 'config_id_list',
  UL: 'guid_list'
}

/** IR types expressible as generated method parameters */
const SUPPORTED_PARAM_TYPES = new Set([
  ...Object.keys(PARAM_TS_BY_IR),
  ...['bool', 'int', 'float', 'str', 'vec3', 'guid', 'entity', 'faction', 'config_id', 'prefab_id', 'enum'].map(
    (t) => `${t}_list`
  )
])

/** IR types expressible as generated method returns */
const SUPPORTED_RETURN_TYPES = new Set([
  ...Object.keys(RETURN_TS_BY_IR),
  ...['bool', 'int', 'float', 'str', 'vec3', 'guid', 'entity', 'faction', 'config_id', 'prefab_id', 'enum'].map(
    (t) => `${t}_list`
  )
])

const RESERVED_WORDS = new Set([
  'arguments', 'await', 'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger',
  'default', 'delete', 'do', 'else', 'enum', 'eval', 'export', 'extends', 'false', 'finally',
  'for', 'function', 'if', 'implements', 'import', 'in', 'instanceof', 'interface', 'let', 'new',
  'null', 'package', 'private', 'protected', 'public', 'return', 'static', 'super', 'switch',
  'this', 'throw', 'true', 'try', 'typeof', 'var', 'void', 'while', 'with', 'yield'
])

/** identifiers every generated method body may use; params must not shadow them */
const BODY_BASE_RESERVED = new Set([
  'ref', 'ret', 'genericType', 'variantKey', 'outputIrType', 'registry',
  'parseValue', 'matchTypes'
])

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function isListType(irType: string): boolean {
  return irType.endsWith('_list')
}

function elemType(irType: string): string {
  return irType.replace(/_list$/, '')
}

function paramTs(irType: string): string {
  if (isListType(irType)) return `${PARAM_TS_BY_IR[elemType(irType)]}[]`
  return PARAM_TS_BY_IR[irType]
}

function returnTs(irType: string): string {
  if (isListType(irType)) return `${RETURN_TS_BY_IR[elemType(irType)]}[]`
  return RETURN_TS_BY_IR[irType]
}

function typePriority(irType: string): number {
  const i = TYPE_PRIORITY.indexOf(elemType(irType))
  return i < 0 ? TYPE_PRIORITY.length : i
}

/** `_3d_vector_addition` -> `_3dVectorAddition`, `get_list_length` -> `getListLength` */
export function snakeToCamel(nodeType: string): string {
  return nodeType.replace(/_([a-z0-9])/g, (_, c: string, offset: number) =>
    offset === 0 ? `_${c}` : c.toUpperCase()
  )
}

function sanitizeDocText(text: string): string {
  return String(text ?? '')
    .replace(/\s+/g, ' ')
    .replace(/\*\//g, '*\\/')
    .trim()
}

function identFromDocName(name: string, fallback: string): string {
  const cleaned = String(name ?? '')
    .replace(/['’"“”]/g, '')
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim()
  if (!cleaned) return fallback
  const parts = cleaned.split(' ')
  let ident = parts
    .map((p, i) => (i === 0 ? p.charAt(0).toLowerCase() + p.slice(1) : p.charAt(0).toUpperCase() + p.slice(1)))
    .join('')
  if (/^\d/.test(ident)) ident = `_${ident}`
  if (RESERVED_WORDS.has(ident)) ident = `${ident}_`
  return ident
}

function uniqueIdent(base: string, used: Set<string>, reserved?: Set<string>): string {
  const taken = (id: string) => used.has(id) || BODY_BASE_RESERVED.has(id) || reserved?.has(id)
  if (!taken(base)) {
    used.add(base)
    return base
  }
  if (!taken(`${base}Value`)) {
    used.add(`${base}Value`)
    return `${base}Value`
  }
  let n = 2
  while (taken(`${base}${n}`)) n += 1
  used.add(`${base}${n}`)
  return `${base}${n}`
}

// ---------------------------------------------------------------------------
// Doc <-> pin alignment
// ---------------------------------------------------------------------------

type DocParamPair = { en: DocParam; zh?: DocParam }

type BoundParam = {
  pin: MetaPin
  doc: DocParamPair
}

type AlignResult =
  | { ok: true; bound: BoundParam[]; hidden: MetaPin[] }
  | { ok: false; reason: string; detail: string }

function docCompatibleWithPin(pin: MetaPin, docTag: string, candidates?: string[]): boolean {
  if (docTag === '' || docTag === '?') return true
  if (pin.reflective) {
    if (docTag === 'G' || docTag === 'L') return true
    const tags = new Set((candidates ?? []).flatMap((c) => DOC_TAGS_BY_PIN_TYPE[c] ?? []))
    return tags.has(docTag)
  }
  return (DOC_TAGS_BY_PIN_TYPE[pin.type] ?? []).includes(docTag)
}

/**
 * Greedy in-order alignment: every doc input param must bind to a pin (same
 * relative order); pins that match no doc param are hidden (kept at editor
 * defaults). Any unbound doc param fails the record. The en and zh data_type
 * columns occasionally disagree (doc typos); a pin binds when either language
 * is compatible.
 */
function alignInputs(
  pins: MetaPin[],
  docIns: DocParamPair[],
  candidatesByPin: Map<number, string[]>
): AlignResult {
  const bound: BoundParam[] = []
  const hidden: MetaPin[] = []
  let d = 0
  for (const pin of pins) {
    const doc = docIns[d]
    const candidates = doc ? candidatesByPin.get(pin.index) : undefined
    const compatible =
      doc &&
      (docCompatibleWithPin(pin, docTypeTag(doc.en.dataType), candidates) ||
        (doc.zh !== undefined && docCompatibleWithPin(pin, docTypeTag(doc.zh.dataType), candidates)))
    if (compatible) {
      bound.push({ pin, doc: doc! })
      d += 1
    } else {
      hidden.push(pin)
    }
  }
  if (d < docIns.length) {
    const missed = docIns
      .slice(d)
      .map((p) => `${p.en.name} [${docTypeTag(p.en.dataType)}]`)
      .join(', ')
    return {
      ok: false,
      reason: 'doc_param_alignment_failed',
      detail: `unbound doc params: ${missed}; pins: ${pins.map((p) => p.reflective ? 'G' : p.type).join(',')}`
    }
  }
  return { ok: true, bound, hidden }
}

// ---------------------------------------------------------------------------
// Method spec construction
// ---------------------------------------------------------------------------

type ParamSpec = {
  pinIndex: number
  ident: string
  /** concrete IR type; reflective params carry candidates instead */
  irType?: string
  reflective: boolean
  candidates?: string[]
  /** concrete TS enum class bound from the enum seeds (four.1) */
  enumClass?: string
  docEnName: string
  docEnDesc: string
  docZhName: string
  docZhDesc: string
}

type ReturnSpec = {
  pinIndex: number
  ident: string
  /** concrete IR type; reflect-dependent returns resolved via variant map */
  irType?: string
  reflective: boolean
  /** concrete TS enum class bound from the enum seeds (four.1) */
  enumClass?: string
  docEnName: string
  docEnDesc: string
  docZhName: string
  docZhDesc: string
}

type ReflectSpec = {
  /** reflective input pin indexes in ascending order */
  pinIndexes: number[]
  /** true when every variant assigns one identical type to all reflective pins */
  joint: boolean
  candidatesByPin: Map<number, string[]>
  variants: Array<{ inTypes: string[]; outType?: string }>
}

type MethodSpec = {
  methodName: string
  nodeType: string
  subType: string
  displayName: string
  recordType: 'data' | 'exec'
  inputPins: MetaPin[]
  params: ParamSpec[]
  returns: ReturnSpec[]
  reflect?: ReflectSpec
  docsEn: string
  docsZh: string
}

function pairDocParams(doc: AlignedDocNode, io: 'in' | 'out'): DocParamPair[] {
  const filter = (p: DocParam) => (io === 'out' ? p.io === 'out' : p.io !== 'out')
  const en = doc.en.params.filter(filter)
  const zh = doc.zh.params.filter(filter)
  return en.map((p, i) => ({ en: p, zh: zh.length === en.length ? zh[i] : undefined }))
}

function buildReflectSpec(record: MetaRecord): ReflectSpec | { gap: GapEntry } {
  const gap = (reason: string, detail?: string): { gap: GapEntry } => ({
    gap: {
      subType: record.subType,
      nodeType: record.nodeType,
      displayName: record.displayName,
      reason,
      ...(detail ? { detail } : {})
    }
  })
  const pinIndexes = record.inputs
    .filter((p) => p.reflective)
    .map((p) => p.index)
    .sort((a, b) => a - b)
  if (!record.reflectMap?.length) return gap('reflect_no_variant_evidence')

  const reflectiveOutputs = record.outputs.filter((p) => p.reflective)
  if (reflectiveOutputs.length > 1) return gap('reflect_multiple_reflective_outputs')

  const candidatesByPin = new Map<number, string[]>()
  const variants: ReflectSpec['variants'] = []
  for (const variant of record.reflectMap) {
    const inTypes: string[] = []
    for (const index of pinIndexes) {
      const pin = variant.pins?.find((p) => p.kind === 'input' && p.index === index)
      if (!pin) return gap('reflect_variant_pin_incomplete', `variant ${variant.variantKey} misses input pin #${index}`)
      if (!SUPPORTED_PARAM_TYPES.has(pin.type)) {
        return gap('reflect_unsupported_pin_type', `variant ${variant.variantKey} input pin #${index} is ${pin.type}`)
      }
      inTypes.push(pin.type)
      const cands = candidatesByPin.get(index) ?? []
      if (!cands.includes(pin.type)) cands.push(pin.type)
      candidatesByPin.set(index, cands)
    }
    const outPin = variant.pins?.find((p) => p.kind === 'output')
    variants.push({ inTypes, ...(outPin ? { outType: outPin.type } : {}) })
  }

  // per-pin candidates must not mix scalar and list types (matchTypes cannot)
  for (const [index, cands] of candidatesByPin) {
    const hasList = cands.some(isListType)
    const hasScalar = cands.some((c) => !isListType(c))
    if (hasList && hasScalar) {
      return gap('reflect_mixed_scalar_list_candidates', `input pin #${index}: ${cands.join(', ')}`)
    }
    cands.sort((a, b) => typePriority(a) - typePriority(b))
  }

  const joint =
    pinIndexes.length > 0 &&
    variants.every((v) => new Set(v.inTypes).size === 1) &&
    // all pins share one candidate set
    [...candidatesByPin.values()].every(
      (cands) => cands.join('|') === [...candidatesByPin.values()][0].join('|')
    )

  variants.sort((a, b) => typePriority(a.inTypes[0]) - typePriority(b.inTypes[0]))
  return { pinIndexes, joint, candidatesByPin, variants }
}

function buildMethodSpec(
  record: MetaRecord,
  doc: AlignedDocNode,
  enumBinding: ClientEnumBinding
): MethodSpec | GapEntry {
  let firstGap: GapEntry | null = null
  const gap = (reason: string, detail?: string): GapEntry => {
    firstGap ??= {
      subType: record.subType,
      nodeType: record.nodeType,
      displayName: record.displayName,
      reason,
      ...(detail ? { detail } : {})
    }
    return firstGap
  }

  if (record.specialKind === 'structure_list_unknown_binding') {
    return gap('unsupported_special_kind', record.specialKind)
  }
  if (record.nodeType === 'get_custom_variable' || record.nodeType === 'send_signal_to_server_node_graph') {
    return gap('hand_template', record.nodeType)
  }

  const localVarPin = [...record.inputs, ...record.outputs].find((p) => p.type === 'local_variable')
  if (localVarPin) return gap('local_variable_pins')

  // reflect analysis first: candidates feed the doc alignment compat check
  let reflect: ReflectSpec | undefined
  const hasReflective = [...record.inputs, ...record.outputs].some((p) => p.reflective)
  if (hasReflective) {
    const built = buildReflectSpec(record)
    if ('gap' in built) return built.gap
    reflect = built
  }

  const docIns = pairDocParams(doc, 'in')
  const aligned = alignInputs(record.inputs, docIns, reflect?.candidatesByPin ?? new Map())
  if (!aligned.ok) return gap(aligned.reason, aligned.detail)

  // reflective pins must be user-facing: hidden ones cannot drive matchTypes
  if (reflect) {
    const boundIndexes = new Set(aligned.bound.map((b) => b.pin.index))
    const hiddenReflective = reflect.pinIndexes.filter((i) => !boundIndexes.has(i))
    if (hiddenReflective.length) {
      return gap('reflective_pin_hidden', `pins ${hiddenReflective.join(', ')}`)
    }
  }

  // ---- returns first: their value-class constructors reserve identifiers ----
  // metadata output pins are authoritative when observed; otherwise doc
  // outputs synthesize pin indexes 0..n-1 (samples only serialize connected
  // output pins, so unconnected outputs are legitimately absent)
  const docOuts = pairDocParams(doc, 'out')
  const returnIdents = new Set<string>()
  const returns: ReturnSpec[] = []
  const pushReturn = (
    pinIndex: number,
    doc: DocParamPair | undefined,
    irType: string | undefined,
    reflective: boolean,
    fallbackName: string
  ): true | GapEntry => {
    if (irType !== undefined && !SUPPORTED_RETURN_TYPES.has(irType)) {
      return gap('unsupported_return_type', `${doc?.en.name ?? fallbackName}: ${irType}`)
    }
    const enumClass =
      irType === 'enum'
        ? enumBinding.resolveReturn(doc?.zh?.name)
        : irType === 'enum_list'
          ? enumBinding.resolveListReturn(record.nodeType)
          : undefined
    returns.push({
      pinIndex,
      ident: uniqueIdent(identFromDocName(doc?.en.name ?? '', fallbackName), returnIdents),
      ...(irType !== undefined ? { irType } : {}),
      reflective,
      ...(enumClass ? { enumClass } : {}),
      docEnName: doc?.en.name ?? fallbackName,
      docEnDesc: sanitizeDocText(doc?.en.description ?? ''),
      docZhName: doc?.zh?.name ?? '',
      docZhDesc: sanitizeDocText(doc?.zh?.description ?? '')
    })
    return true
  }

  /**
   * Single output on a reflect record: variant output evidence decides the
   * return shape. A concrete (non-reflective) pin type from one sample must
   * not be trusted when the variants prove per-variant output types (e.g.
   * addition records int output pins but has int/float variants).
   */
  const pushReflectSingleReturn = (
    pinIndex: number,
    docPair: DocParamPair | undefined,
    pin: MetaPin | undefined,
    fallbackName: string
  ): true | GapEntry => {
    const outTypes = reflect!.variants.map((v) => v.outType)
    const defined = [...new Set(outTypes.filter((t): t is string => t !== undefined))]
    const concretePinType =
      pin && !pin.reflective && pin.type && pin.type !== 'unknown' ? pin.type : undefined
    if (defined.length === 1) {
      // constant output across all variants with evidence; a concrete pin type
      // from samples must agree
      if (concretePinType && concretePinType !== defined[0]) {
        return gap('reflect_output_type_conflict', `pin ${concretePinType} vs variants ${defined[0]}`)
      }
      return pushReturn(pinIndex, docPair, defined[0], false, fallbackName)
    }
    if (defined.length > 1) {
      // per-variant output types require complete evidence to map every key
      if (outTypes.some((t) => t === undefined)) {
        return gap('reflect_output_type_unresolved', `partial variant outputs: ${defined.join(', ')}`)
      }
      if (defined.some((t) => !SUPPORTED_RETURN_TYPES.has(t))) {
        return gap('unsupported_return_type', `reflective output: ${defined.join(', ')}`)
      }
      return pushReturn(pinIndex, docPair, undefined, true, fallbackName)
    }
    if (concretePinType) {
      return pushReturn(pinIndex, docPair, concretePinType, false, fallbackName)
    }
    // no pin/variant evidence at all: an unambiguous doc data_type still
    // proves a constant output type (e.g. comparators -> 布尔值)
    if (docPair) {
      const docIrType =
        IR_BY_DOC_TAG[docTypeTag(docPair.en.dataType)] ??
        IR_BY_DOC_TAG[docTypeTag(docPair.zh?.dataType ?? '')]
      if (docIrType) {
        return pushReturn(pinIndex, docPair, docIrType, false, fallbackName)
      }
    }
    return gap('reflect_output_type_unresolved')
  }

  if (record.outputs.length) {
    if (record.outputs.length !== docOuts.length) {
      return gap(
        'output_alignment_failed',
        `observed ${record.outputs.length} output pins, docs list ${docOuts.length}`
      )
    }
    const sorted = [...record.outputs].sort((a, b) => a.index - b.index)
    for (const [i, pin] of sorted.entries()) {
      if (reflect && sorted.length === 1) {
        const pushed = pushReflectSingleReturn(pin.index, docOuts[i], pin, `output${i + 1}`)
        if (pushed !== true) return pushed
      } else if (pin.reflective) {
        return gap('reflect_output_type_unresolved', 'reflective pin in multi-output record')
      } else {
        const pushed = pushReturn(pin.index, docOuts[i], pin.type, false, `output${i + 1}`)
        if (pushed !== true) return pushed
      }
    }
  } else if (docOuts.length) {
    if (reflect && docOuts.length === 1) {
      const pushed = pushReflectSingleReturn(0, docOuts[0], undefined, 'output1')
      if (pushed !== true) return pushed
    } else {
      for (const [i, docOut] of docOuts.entries()) {
        const tag = docTypeTag(docOut.en.dataType)
        const irType =
          IR_BY_DOC_TAG[tag] ?? IR_BY_DOC_TAG[docTypeTag(docOut.zh?.dataType ?? '')]
        if (!irType) {
          return gap('output_type_unresolved', `${docOut.en.name} [${tag}]`)
        }
        const pushed = pushReturn(i, docOut, irType, false, `output${i + 1}`)
        if (pushed !== true) return pushed
      }
    }
  }

  // ---- params: must not shadow the value-class constructors the body needs ----
  const constructorReserved = new Set<string>()
  for (const r of returns) {
    if (r.reflective) {
      constructorReserved.add('ValueClassMap')
      constructorReserved.add('list')
    } else {
      constructorReserved.add(isListType(r.irType!) ? 'list' : CLASS_EXPR_BY_IR[r.irType!])
    }
  }

  const usedIdents = new Set<string>(returnIdents)
  const params: ParamSpec[] = []
  for (const [i, b] of aligned.bound.entries()) {
    const ident = uniqueIdent(
      identFromDocName(b.doc.en.name, `input${i + 1}`),
      usedIdents,
      constructorReserved
    )
    if (b.pin.reflective) {
      params.push({
        pinIndex: b.pin.index,
        ident,
        reflective: true,
        candidates: reflect!.candidatesByPin.get(b.pin.index),
        docEnName: b.doc.en.name,
        docEnDesc: sanitizeDocText(b.doc.en.description),
        docZhName: b.doc.zh?.name ?? '',
        docZhDesc: sanitizeDocText(b.doc.zh?.description ?? '')
      })
      continue
    }
    if (!SUPPORTED_PARAM_TYPES.has(b.pin.type)) {
      return gap(`unsupported_param_type`, `${b.doc.en.name}: ${b.pin.type}`)
    }
    const enumClass =
      b.pin.type === 'enum'
        ? enumBinding.resolve(record, b.pin, b.doc.zh?.name)
        : b.pin.type === 'enum_list'
          ? enumBinding.resolveListParam(b.doc.zh?.name)
          : undefined
    params.push({
      pinIndex: b.pin.index,
      ident,
      irType: b.pin.type,
      reflective: false,
      ...(enumClass ? { enumClass } : {}),
      docEnName: b.doc.en.name,
      docEnDesc: sanitizeDocText(b.doc.en.description),
      docZhName: b.doc.zh?.name ?? '',
      docZhDesc: sanitizeDocText(b.doc.zh?.description ?? '')
    })
  }

  const docsEn = sanitizeDocText(doc.en.functions.join('; ')) || sanitizeDocText(doc.enName)
  const docsZh = sanitizeDocText(doc.zh.functions.join('; '))

  return {
    methodName: snakeToCamel(record.nodeType),
    nodeType: record.nodeType,
    subType: record.subType,
    displayName: record.displayName,
    recordType: record.flows?.length ? 'exec' : 'data',
    inputPins: record.inputs,
    params,
    returns,
    ...(reflect ? { reflect } : {}),
    docsEn,
    docsZh
  }
}

// ---------------------------------------------------------------------------
// Code emission
// ---------------------------------------------------------------------------

function jsdocBlock(lines: string[]): string {
  const body = lines.map((l) => (l ? `   * ${l}` : '   *')).join('\n')
  return `  /**\n${body}\n   */`
}

function buildJsdoc(spec: MethodSpec): string {
  const lines: string[] = []
  lines.push(spec.docsEn)
  lines.push('')
  lines.push(spec.docsZh ? `${spec.displayName}: ${spec.docsZh}` : spec.displayName)
  if (spec.params.length) {
    lines.push('')
    for (const p of spec.params) {
      lines.push(`@param ${p.ident}${p.docEnDesc ? ` ${p.docEnDesc}` : ''}`)
      lines.push('')
      const zhName = p.docZhName || p.docEnName || p.ident
      lines.push(p.docZhDesc ? `${zhName}: ${p.docZhDesc}` : zhName)
    }
  }
  if (spec.returns.length) {
    lines.push('')
    if (spec.returns.length === 1) {
      const r = spec.returns[0]
      lines.push(`@returns${r.docEnDesc ? ` ${r.docEnDesc}` : ''}`)
      lines.push('')
      const zhName = r.docZhName || r.docEnName || r.ident
      lines.push(r.docZhDesc ? `${zhName}: ${r.docZhDesc}` : zhName)
    } else {
      lines.push('@returns')
      for (const r of spec.returns) {
        lines.push('')
        lines.push(`${r.ident}${r.docEnDesc ? ` — ${r.docEnDesc}` : ''}`)
        const zhName = r.docZhName || r.docEnName || r.ident
        lines.push(r.docZhDesc ? `${zhName}: ${r.docZhDesc}` : zhName)
      }
    }
  }
  return jsdocBlock(lines)
}

/** args array literal in signature order; hidden pins are the transform's job (argPins) */
function buildArgsArray(spec: MethodSpec): string {
  return `[${spec.params.map((p) => `${p.ident}Obj`).join(', ')}]`
}

/** physical input pin index per public arg; undefined when identity */
function argPinsOf(spec: MethodSpec): number[] | undefined {
  const argPins = spec.params.map((p) => p.pinIndex)
  return argPins.some((pin, i) => pin !== i) ? argPins : undefined
}

function retConstruction(irTypeExpr: { kind: 'literal'; irType: string } | { kind: 'expr'; expr: string; isList: boolean }): string {
  if (irTypeExpr.kind === 'literal') {
    const t = irTypeExpr.irType
    if (isListType(t)) {
      const elem = elemType(t)
      if (elem === 'enum') return `new list('enum')`
      return `new list('${elem}')`
    }
    return `new ${CLASS_EXPR_BY_IR[t]}()`
  }
  return irTypeExpr.isList ? `new list(${irTypeExpr.expr})` : `new ValueClassMap[${irTypeExpr.expr}]()`
}

/** single-return tail: construct ret, markPin, return */
function emitSingleReturn(
  r: ReturnSpec,
  construction: string,
  tsType: string
): string[] {
  return [
    `    const ret = ${construction}`,
    `    ret.markPin(ref, '${r.ident}', ${r.pinIndex})`,
    `    return ret as unknown as ${tsType}`
  ]
}

function paramTsOf(p: ParamSpec): string {
  if (p.enumClass) return p.irType === 'enum_list' ? `${p.enumClass}[]` : p.enumClass
  return paramTs(p.irType!)
}

function returnTsOf(r: ReturnSpec): string {
  if (r.enumClass) return r.irType === 'enum_list' ? `${r.enumClass}[]` : r.enumClass
  return returnTs(r.irType!)
}

/** enum returns with a bound class carry the class name (conn typing + hints) */
function retConstructionOf(r: ReturnSpec): string {
  if (r.irType === 'enum' && r.enumClass) return `new enumeration('${r.enumClass}')`
  return retConstruction({ kind: 'literal', irType: r.irType! })
}

function emitNonReflectMethod(spec: MethodSpec): string {
  const sigParams = spec.params.map((p) => `${p.ident}: ${paramTsOf(p)}`).join(', ')
  const retTs =
    spec.returns.length === 0
      ? 'void'
      : spec.returns.length === 1
        ? returnTsOf(spec.returns[0])
        : `{ ${spec.returns.map((r) => `${r.ident}: ${returnTsOf(r)}`).join('; ')} }`

  const body: string[] = []
  for (const p of spec.params) {
    body.push(`    const ${p.ident}Obj = parseValue(${p.ident}, '${p.irType}')`)
  }
  const register = [
    `${spec.returns.length ? '    const ref = ' : '    '}this.registry.registerNode({`,
    `      id: 0,`,
    `      type: '${spec.recordType}',`,
    `      nodeType: '${spec.nodeType}',`,
    `      args: ${buildArgsArray(spec)}`,
    `    })`
  ]
  body.push(...register)

  if (spec.returns.length === 1) {
    const r = spec.returns[0]
    body.push(...emitSingleReturn(r, retConstructionOf(r), returnTsOf(r)))
  } else if (spec.returns.length > 1) {
    body.push(`    return {`)
    for (const [i, r] of spec.returns.entries()) {
      body.push(`      ${r.ident}: (() => {`)
      body.push(`        const ret = ${retConstructionOf(r)}`)
      body.push(`        ret.markPin(ref, '${r.ident}', ${r.pinIndex})`)
      body.push(`        return ret as unknown as ${returnTsOf(r)}`)
      body.push(`      })()${i < spec.returns.length - 1 ? ',' : ''}`)
    }
    body.push(`    }`)
  }

  return [
    buildJsdoc(spec),
    `  ${spec.methodName}(${sigParams}): ${retTs} {`,
    ...body,
    `  }`
  ].join('\n')
}

function emitReflectMethod(spec: MethodSpec): string {
  const reflect = spec.reflect!
  const singleReturn = spec.returns.length === 1 ? spec.returns[0] : undefined
  if (spec.returns.length > 1) {
    throw new Error(`[bug] reflect method ${spec.subType}.${spec.nodeType} with multiple returns`)
  }

  // ---- overload signatures (one per variant) ----
  const overloads: string[] = []
  for (const variant of reflect.variants) {
    const paramSig = spec.params
      .map((p) => {
        if (!p.reflective) return `${p.ident}: ${paramTsOf(p)}`
        const slot = reflect.pinIndexes.indexOf(p.pinIndex)
        return `${p.ident}: ${paramTs(variant.inTypes[slot])}`
      })
      .join(', ')
    const outTs = singleReturn
      ? singleReturn.reflective
        ? returnTs(variant.outType!)
        : returnTsOf(singleReturn)
      : 'void'
    overloads.push(`  ${spec.methodName}(${paramSig}): ${outTs}`)
  }

  // ---- implementation signature (unions) ----
  const unionOf = (types: string[]) => [...new Set(types)].join(' | ')
  const implParams = spec.params
    .map((p) => {
      if (!p.reflective) return `${p.ident}: ${paramTsOf(p)}`
      return `${p.ident}: ${unionOf(p.candidates!.map(paramTs))}`
    })
    .join(', ')
  const implRet = singleReturn
    ? singleReturn.reflective
      ? unionOf(reflect.variants.map((v) => returnTs(v.outType!)))
      : returnTsOf(singleReturn)
    : 'void'

  const body: string[] = []
  const reflectParams = spec.params.filter((p) => p.reflective)

  // ---- type matching ----
  const typeExprByPin = new Map<number, { matched: string; isList: boolean }>()
  if (reflect.joint) {
    const cands = reflect.candidatesByPin.get(reflect.pinIndexes[0])!
    const listMode = isListType(cands[0])
    const candList = cands.map((c) => `'${listMode ? elemType(c) : c}'`).join(', ')
    const argNames = reflectParams.map((p) => p.ident).join(', ')
    body.push(`    const genericType = matchTypes([${candList}], ${argNames})`)
    for (const p of reflectParams) {
      typeExprByPin.set(p.pinIndex, { matched: 'genericType', isList: listMode })
    }
  } else {
    for (const p of reflectParams) {
      const cands = reflect.candidatesByPin.get(p.pinIndex)!
      const listMode = isListType(cands[0])
      const candList = cands.map((c) => `'${listMode ? elemType(c) : c}'`).join(', ')
      body.push(`    const ${p.ident}Type = matchTypes([${candList}], ${p.ident})`)
      typeExprByPin.set(p.pinIndex, { matched: `${p.ident}Type`, isList: listMode })
    }
  }

  // ---- parseValue per param ----
  for (const p of spec.params) {
    if (!p.reflective) {
      body.push(`    const ${p.ident}Obj = parseValue(${p.ident}, '${p.irType}')`)
    } else {
      const t = typeExprByPin.get(p.pinIndex)!
      const typeExpr = t.isList ? `\`\${${t.matched}}_list\` as const` : t.matched
      body.push(`    const ${p.ident}Obj = parseValue(${p.ident}, ${typeExpr})`)
    }
  }

  // ---- variant validation + return construction data ----
  const variantKeyOf = (v: { inTypes: string[] }) => v.inTypes.join('|')
  const runtimeKeyParts = reflect.pinIndexes.map((idx) => {
    const t = typeExprByPin.get(idx)!
    return t.isList ? `\`\${${t.matched}}_list\`` : t.matched
  })

  const register = [
    `${spec.returns.length ? '    const ref = ' : '    '}this.registry.registerNode({`,
    `      id: 0,`,
    `      type: '${spec.recordType}',`,
    `      nodeType: '${spec.nodeType}',`,
    `      args: ${buildArgsArray(spec)}`,
    `    })`
  ]

  if (!singleReturn) {
    body.push(...register)
  } else if (!singleReturn.reflective) {
    body.push(...register)
    body.push(...emitSingleReturn(singleReturn, retConstructionOf(singleReturn), returnTsOf(singleReturn)))
  } else {
    // output type depends on the resolved variant
    const outsAreLists = reflect.variants.every((v) => isListType(v.outType!))
    const outsAreScalars = reflect.variants.every((v) => !isListType(v.outType!))
    if (!outsAreLists && !outsAreScalars) {
      throw new Error(`[bug] reflect method ${spec.subType}.${spec.nodeType} mixes scalar and list outputs`)
    }
    if (reflect.joint && reflect.variants.every((v) => variantKeyOf(v) === `${v.inTypes[0]}` && v.outType === v.inTypes[0])) {
      // identity mapping: output type equals the matched input type
      body.push(...register)
      const construction = typeExprByPin.get(reflect.pinIndexes[0])!.isList
        ? `new list(genericType)`
        : `new ValueClassMap[genericType]()`
      body.push(...emitSingleReturn(singleReturn, construction, implRet))
    } else {
      const mapEntries = reflect.variants
        .map((v) => {
          const out = v.outType!
          const outValue = outsAreLists ? elemType(out) : out
          return `'${variantKeyOf(v)}': '${outValue}'`
        })
        .join(', ')
      const outUnion = [...new Set(reflect.variants.map((v) => (outsAreLists ? elemType(v.outType!) : v.outType!)))]
        .map((t) => `'${t}'`)
        .join(' | ')
      body.push(`    const variantKey = [${runtimeKeyParts.join(', ')}].join('|')`)
      body.push(
        `    const outputIrType = ({ ${mapEntries} } as Record<string, ${outUnion} | undefined>)[variantKey]`
      )
      body.push(`    if (!outputIrType) {`)
      body.push(
        `      throw new Error(\`[error] ${spec.nodeType}: unsupported type combination \${variantKey}\`)`
      )
      body.push(`    }`)
      body.push(...register)
      const construction = outsAreLists
        ? `new list(outputIrType)`
        : `new ValueClassMap[outputIrType]()`
      body.push(...emitSingleReturn(singleReturn, construction, implRet))
    }
  }

  return [
    buildJsdoc(spec),
    ...overloads,
    `  ${spec.methodName}(${implParams}): ${implRet} {`,
    ...body,
    `  }`
  ].join('\n')
}

/**
 * 枚举匹配 mirrors the server's enumerationsEqual: one same-class overload per
 * census-representable enum class (编辑器下拉行) plus a generic implementation
 * signature, so IntelliSense offers concrete classes and mixed-class
 * comparisons fail to compile. Non-census classes (RayFilterType 等) are not
 * selectable in the editor and get no overload.
 */
function emitEnumerationMatch(spec: MethodSpec, enumClasses: string[]): string {
  const [p1, p2] = spec.params.map((p) => p.ident)
  const r = spec.returns[0]
  const overloads = enumClasses.map((c) => `  ${spec.methodName}(${p1}: ${c}, ${p2}: ${c}): boolean`)
  return [
    buildJsdoc(spec),
    ...overloads,
    `  ${spec.methodName}<T extends EnumerationType>(`,
    `    ${p1}: EnumerationTypeMap[T],`,
    `    ${p2}: EnumerationTypeMap[T]`,
    `  ): boolean {`,
    `    const ${p1}Obj = parseValue(${p1}, 'enum')`,
    `    const ${p2}Obj = parseValue(${p2}, 'enum')`,
    `    if (${p1}Obj.getClassName() !== ${p2}Obj.getClassName()) {`,
    `      throw new Error('enumeration type mismatch')`,
    `    }`,
    `    const ref = this.registry.registerNode({`,
    `      id: 0,`,
    `      type: '${spec.recordType}',`,
    `      nodeType: '${spec.nodeType}',`,
    `      args: [${p1}Obj, ${p2}Obj]`,
    `    })`,
    ...emitSingleReturn(r, retConstructionOf(r), returnTsOf(r)),
    `  }`
  ].join('\n')
}

function emitMethod(spec: MethodSpec, enumBinding: ClientEnumBinding): string {
  if (spec.nodeType === 'enumeration_match') {
    return emitEnumerationMatch(spec, enumBinding.matchClasses)
  }
  return spec.reflect ? emitReflectMethod(spec) : emitNonReflectMethod(spec)
}

// ---------------------------------------------------------------------------
// Hand-written control flow templates (per family)
// ---------------------------------------------------------------------------

function controlFlowJsdoc(
  doc: AlignedDocNode | undefined,
  zhName: string,
  extraParams: Array<{ ident: string; en: string; zh: string }>,
  returns?: { en: string; zh: string }
): string {
  const lines: string[] = []
  lines.push(sanitizeDocText(doc?.en.functions.join('; ') ?? '') || zhName)
  lines.push('')
  const zhDocs = sanitizeDocText(doc?.zh.functions.join('; ') ?? '')
  lines.push(zhDocs ? `${zhName}: ${zhDocs}` : zhName)
  if (extraParams.length) {
    lines.push('')
    for (const p of extraParams) {
      lines.push(`@param ${p.ident}${p.en ? ` ${p.en}` : ''}`)
      lines.push('')
      lines.push(p.zh)
    }
  }
  if (returns) {
    lines.push('')
    lines.push(`@returns${returns.en ? ` ${returns.en}` : ''}`)
    lines.push('')
    lines.push(returns.zh)
  }
  return jsdocBlock(lines)
}

function docParamText(doc: AlignedDocNode | undefined, zhName: string): { en: string; zh: string } {
  const en = doc?.en.params.find((p) => p.io !== 'out' && identFromDocName(p.name, '') !== '')
  const zh = doc?.zh.params.find((p) => p.io !== 'out')
  return {
    en: sanitizeDocText(en?.description ?? ''),
    zh: zh ? `${zh.name}${zh.description ? `: ${sanitizeDocText(zh.description)}` : ''}` : zhName
  }
}

function emitDoubleBranch(subType: string, doc: AlignedDocNode | undefined): string {
  const cond = docParamText(doc, '条件')
  return `${controlFlowJsdoc(doc, '双分支', [{ ident: 'condition', en: cond.en, zh: cond.zh }])}
  doubleBranch(condition: BoolValue, trueBranch: () => void, falseBranch: () => void): void {
    const TRUE_SOURCE_INDEX = 0
    const FALSE_SOURCE_INDEX = 1

    const conditionObj = parseValue(condition, 'bool')
    const ref = this.registry.registerNode({
      id: 0,
      type: 'exec',
      nodeType: 'double_branch',
      args: [conditionObj]
    })

    const t = this.registry.withExecBranch(ref.id, TRUE_SOURCE_INDEX, () =>
      globalThis.gsts.ctx.withCtx('client_${subType}_if', trueBranch)
    )
    const f = this.registry.withExecBranch(ref.id, FALSE_SOURCE_INDEX, () =>
      globalThis.gsts.ctx.withCtx('client_${subType}_if', falseBranch)
    )

    // 启用 join：未 return 的分支尾部连到后续；空分支从分支节点输出直接连出
    const joinEndpoints: Array<{ nodeId: number; sourceIndex?: number }> = []
    ;[
      { sourceIndex: TRUE_SOURCE_INDEX, ...t },
      { sourceIndex: FALSE_SOURCE_INDEX, ...f }
    ].forEach((r) => {
      if (r.terminatedByReturn) return
      if (r.tailEndpoints.length) joinEndpoints.push(...r.tailEndpoints)
      else joinEndpoints.push({ nodeId: ref.id, sourceIndex: r.sourceIndex })
    })
    this.registry.setCurrentExecTailEndpoints(joinEndpoints)
  }`
}

function emitBreakLoop(doc: AlignedDocNode | undefined): string {
  return `${controlFlowJsdoc(doc, '跳出循环', [])}
  breakLoop(...loopNodeIds: IntValue[]): void {
    const loopNodeIdObjs = loopNodeIds.map((id) => parseValue(id, 'int'))
    this.registry.registerNode({
      id: 0,
      type: 'exec',
      nodeType: 'break_loop',
      args: loopNodeIdObjs
    })
    // break_loop has no exec output; terminate the current path to avoid invalid chaining.
    this.registry.returnFromCurrentExecPath({ countReturn: false })
  }`
}

function emitFiniteLoop(subType: string, doc: AlignedDocNode | undefined): string {
  const ins = doc?.zh.params.filter((p) => p.io !== 'out') ?? []
  const outs = doc?.zh.params.filter((p) => p.io === 'out') ?? []
  const enIns = doc?.en.params.filter((p) => p.io !== 'out') ?? []
  const enOuts = doc?.en.params.filter((p) => p.io === 'out') ?? []
  const param = (i: number, zhFallback: string) => ({
    en: sanitizeDocText(enIns[i]?.description ?? ''),
    zh: ins[i] ? `${ins[i].name}${ins[i].description ? `: ${sanitizeDocText(ins[i].description)}` : ''}` : zhFallback
  })
  const p0 = param(0, '循环起始值')
  const p1 = param(1, '循环终止值')
  const r = {
    en: sanitizeDocText(enOuts[0]?.description ?? ''),
    zh: outs[0] ? `${outs[0].name}${outs[0].description ? `: ${sanitizeDocText(outs[0].description)}` : ''}` : '当前循环值'
  }
  return `${controlFlowJsdoc(
    doc,
    '有限循环',
    [
      { ident: 'loopStartValue', en: p0.en, zh: p0.zh },
      { ident: 'loopEndValue', en: p1.en, zh: p1.zh }
    ],
    r
  )}
  finiteLoop(
    loopStartValue: IntValue,
    loopEndValue: IntValue,
    loopBody: (loopValue: bigint, breakLoop: () => void) => void
  ): void {
    const LOOP_BODY_SOURCE_INDEX = 0
    const LOOP_COMPLETE_SOURCE_INDEX = 1

    const loopStartValueObj = parseValue(loopStartValue, 'int')
    const loopEndValueObj = parseValue(loopEndValue, 'int')
    const ref = this.registry.registerNode({
      id: 0,
      type: 'exec',
      nodeType: 'finite_loop',
      args: [loopStartValueObj, loopEndValueObj]
    })
    const ret = new int()
    ret.markPin(ref, 'currentLoopValue', 0)

    this.registry.withExecBranch(ref.id, LOOP_BODY_SOURCE_INDEX, () => {
      this.registry.withLoop(ref.id, () => {
        globalThis.gsts.ctx.withCtx('client_${subType}_loop', () =>
          loopBody(ret as unknown as bigint, () => this.breakLoop(ref.id))
        )
      })
    })
    this.registry.markLinkNextExecFrom(ref.id, LOOP_COMPLETE_SOURCE_INDEX)
  }`
}

function emitTraverseEntityList(subType: string, doc: AlignedDocNode | undefined): string {
  const ins = doc?.zh.params.filter((p) => p.io !== 'out') ?? []
  const outs = doc?.zh.params.filter((p) => p.io === 'out') ?? []
  const enIns = doc?.en.params.filter((p) => p.io !== 'out') ?? []
  const enOuts = doc?.en.params.filter((p) => p.io === 'out') ?? []
  const p0 = {
    en: sanitizeDocText(enIns[0]?.description ?? ''),
    zh: ins[0] ? `${ins[0].name}${ins[0].description ? `: ${sanitizeDocText(ins[0].description)}` : ''}` : '实体列表'
  }
  const r = {
    en: sanitizeDocText(enOuts[0]?.description ?? ''),
    zh: outs[0] ? `${outs[0].name}${outs[0].description ? `: ${sanitizeDocText(outs[0].description)}` : ''}` : '当前实体'
  }
  return `${controlFlowJsdoc(doc, '遍历实体列表', [{ ident: 'entityList', en: p0.en, zh: p0.zh }], r)}
  traverseEntityList(
    entityList: EntityValue[],
    loopBody: (currentEntity: entity, breakLoop: () => void) => void
  ): void {
    const LOOP_BODY_SOURCE_INDEX = 0
    const LOOP_COMPLETE_SOURCE_INDEX = 1

    const entityListObj = parseValue(entityList, 'entity_list')
    const ref = this.registry.registerNode({
      id: 0,
      type: 'exec',
      nodeType: 'traverse_entity_list',
      args: [entityListObj]
    })
    const ret = new entity()
    ret.markPin(ref, 'currentEntity', 0)

    this.registry.withExecBranch(ref.id, LOOP_BODY_SOURCE_INDEX, () => {
      this.registry.withLoop(ref.id, () => {
        globalThis.gsts.ctx.withCtx('client_${subType}_loop', () =>
          loopBody(ret as unknown as entity, () => this.breakLoop(ref.id))
        )
      })
    })
    this.registry.markLinkNextExecFrom(ref.id, LOOP_COMPLETE_SOURCE_INDEX)
  }`
}

/** family element IR types (matchTypes priority order) from the reflect map */
function assemblyElemTypes(record: MetaRecord): string[] {
  const types = record.reflectMap!.map((v) => v.pins!.find((p) => p.kind === 'input')!.type)
  return [...new Set(types)].sort((a, b) => typePriority(a) - typePriority(b))
}

/**
 * 拼装列表: fixed 12 pins (count + 10 element slots + list output), element
 * type selects the concrete variant. Mirrors the server assemblyList surface
 * capped at the editor's 10 slots; the element->pin(+1) shift and count/slot
 * literal encoding live in the IR->GIA transform.
 */
function emitAssemblyList(record: MetaRecord, doc: AlignedDocNode | undefined): string {
  const types = assemblyElemTypes(record)
  const ins = doc?.zh.params.filter((p) => p.io !== 'out') ?? []
  const outs = doc?.zh.params.filter((p) => p.io === 'out') ?? []
  const enIns = doc?.en.params.filter((p) => p.io !== 'out') ?? []
  const enOuts = doc?.en.params.filter((p) => p.io === 'out') ?? []
  const p0 = {
    en: sanitizeDocText(enIns[0]?.description ?? ''),
    zh: ins[0] ? `${ins[0].name}${ins[0].description ? `: ${sanitizeDocText(ins[0].description)}` : ''}` : '0~9'
  }
  const r = {
    en: sanitizeDocText(enOuts[0]?.description ?? ''),
    zh: outs[0] ? `${outs[0].name}${outs[0].description ? `: ${sanitizeDocText(outs[0].description)}` : ''}` : '列表'
  }
  const overloads = types.flatMap((t) => [
    `  assemblyList(_0to9: ${paramTs(t)}[]): ${returnTs(`${t}_list`)}`,
    `  assemblyList(_0to9: ${paramTs(t)}[], type: '${t}'): ${returnTs(`${t}_list`)}`
  ])
  const union = types.map((t) => `'${t}'`).join(' | ')
  return `${controlFlowJsdoc(doc, '拼装列表', [{ ident: '_0to9', en: p0.en, zh: p0.zh }], r)}
${overloads.join('\n')}
  assemblyList<T extends ${union}>(
    _0to9: RuntimeParameterValueTypeMap[T][],
    type?: T
  ): RuntimeReturnValueTypeMap[\`\${T}_list\`] {
    if (_0to9.length === 0 || _0to9.length > 10) {
      throw new Error(\`[error] assemblyList: expected 1-10 elements, got \${_0to9.length}\`)
    }
    let genericType = matchTypes([${types.map((t) => `'${t}'`).join(', ')}], ..._0to9)
    if (type) genericType = type
    const elementObjs = _0to9.map((v) => parseValue(v, genericType))
    const ref = this.registry.registerNode({
      id: 0,
      type: 'data',
      nodeType: 'assembly_list',
      args: elementObjs
    })
    const ret = new list(genericType)
    ret.markPin(ref, 'list', 0)
    return ret as unknown as RuntimeReturnValueTypeMap[\`\${T}_list\`]
  }`
}

/**
 * 多分支: branch case values live in in[1] (int_list literal); flow-outs use
 * the server convention (default = source 0, cases = 1..N). Ported from the
 * server multipleBranches (int-only: the client node has a single int/int_list
 * variant) so TS switch lowering keeps identical alias/join semantics.
 */
function emitMultipleBranches(subType: string, doc: AlignedDocNode | undefined): string {
  const p = docParamText(doc, '控制表达式')
  return `${controlFlowJsdoc(doc, '多分支', [{ ident: 'controlExpression', en: p.en, zh: p.zh }])}
  multipleBranches(
    controlExpression: IntValue,
    branches: Record<number, (() => void) | number> & { default?: (() => void) | number }
  ): void {
    const controlExpressionObj = parseValue(controlExpression, 'int')

    const rawBranches = branches as Record<string, unknown>
    const caseKeys = Object.keys(rawBranches).filter((k) => k !== 'default')
    const caseArgs = caseKeys.map((k) => new int(Number(k)))

    const ref = this.registry.registerNode({
      id: 0,
      type: 'exec',
      nodeType: 'multiple_branches',
      args: [controlExpressionObj, ...caseArgs]
    })

    // 分支执行：按约定 default 的 source_index 固定为 0；其它分支按顺序从 1 开始递增
    type BranchResult = {
      terminatedByReturn?: boolean
      tailEndpoints: Array<{ nodeId: number; sourceIndex?: number }>
      headNodeId?: number
    }
    const branchResults: Array<{ sourceIndex: number } & BranchResult> = []

    const defaultVal = rawBranches.default
    let defaultResult: BranchResult | undefined
    const emptyDefault: BranchResult = { terminatedByReturn: false, tailEndpoints: [] }

    if (typeof defaultVal === 'function') {
      const r = this.registry.withExecBranch(ref.id, 0, () =>
        globalThis.gsts.ctx.withCtx('client_${subType}_switch', defaultVal as () => void)
      )
      defaultResult = r
      branchResults.push({ sourceIndex: 0, ...r })
    } else if (defaultVal === undefined) {
      // 空默认分支视为“未 return 且无节点”，join 时需要从分支节点对应输出直接连出
      branchResults.push({ sourceIndex: 0, ...emptyDefault })
    }

    const branchResultsByKey = new Map<string, BranchResult>()

    caseKeys.forEach((k, i) => {
      const v = rawBranches[k]
      if (typeof v !== 'function') return
      const sourceIndex = i + 1
      const r = this.registry.withExecBranch(ref.id, sourceIndex, () =>
        globalThis.gsts.ctx.withCtx('client_${subType}_switch', v as () => void)
      )
      branchResultsByKey.set(k, r)
      branchResults.push({ sourceIndex, ...r })
    })

    const resolveAliasKey = (input: unknown): string | null => {
      if (typeof input === 'string') return input
      if (typeof input === 'number') return String(input)
      return null
    }

    const ensureCaseKey = (key: string, origin: string) => {
      if (!caseKeys.includes(key)) {
        throw new Error(\`[error] multipleBranches: "\${origin}" refers to missing case "\${key}"\`)
      }
    }

    const resolveTarget = (
      key: string,
      stack: string[]
    ): { kind: 'case'; key: string } | { kind: 'default' } => {
      if (stack.includes(key)) {
        throw new Error(
          \`[error] multipleBranches: circular case alias "\${stack.join(' -> ')} -> \${key}"\`
        )
      }
      const value = rawBranches[key]
      if (typeof value === 'function') return { kind: 'case', key }
      const alias = resolveAliasKey(value)
      if (!alias) {
        throw new Error(\`[error] multipleBranches: "\${key}" must be a function or case alias\`)
      }
      if (alias === 'default') return { kind: 'default' }
      ensureCaseKey(alias, key)
      return resolveTarget(alias, [...stack, key])
    }

    const resolveDefault = (): { kind: 'case'; key: string } | { kind: 'default' } => {
      if (typeof defaultVal === 'function') return { kind: 'default' }
      const alias = resolveAliasKey(defaultVal)
      if (!alias) {
        throw new Error('[error] multipleBranches: default must be a function or case alias')
      }
      if (alias === 'default') {
        throw new Error('[error] multipleBranches: default alias cannot refer to itself')
      }
      ensureCaseKey(alias, 'default')
      return resolveTarget(alias, ['default'])
    }

    const attachAlias = (sourceIndex: number, target: BranchResult | undefined) => {
      const resolved = target ?? emptyDefault
      if (resolved.headNodeId !== undefined) {
        this.registry.connectExecBranchOutput(ref.id, sourceIndex, resolved.headNodeId)
        return
      }
      branchResults.push({ sourceIndex, ...resolved })
    }

    caseKeys.forEach((k, i) => {
      const v = rawBranches[k]
      if (typeof v === 'function') return
      const target = resolveTarget(k, [])
      if (target.kind === 'default') {
        attachAlias(i + 1, defaultResult)
      } else {
        attachAlias(i + 1, branchResultsByKey.get(target.key))
      }
    })

    if (defaultVal !== undefined && typeof defaultVal !== 'function') {
      const target = resolveDefault()
      if (target.kind === 'default') {
        attachAlias(0, defaultResult)
      } else {
        attachAlias(0, branchResultsByKey.get(target.key))
      }
    }

    // 启用 join：后续顺序代码连接到所有未 return 的分支尾部（空分支则从分支节点输出直接连出）
    const joinEndpoints: Array<{ nodeId: number; sourceIndex?: number }> = []
    branchResults.forEach((r) => {
      if (r.terminatedByReturn) return
      if (r.tailEndpoints.length) {
        joinEndpoints.push(...r.tailEndpoints)
      } else {
        joinEndpoints.push({ nodeId: ref.id, sourceIndex: r.sourceIndex })
      }
    })
    this.registry.setCurrentExecTailEndpoints(joinEndpoints)
  }`
}

/**
 * 数据类型转换: concrete id is constant (130); the variant is carried by the
 * conversion enum on in[0] plus per-pin type/indexOfConcrete, all derived from
 * the enum in the IR->GIA transform. Same conversion matrix as the server.
 */
function emitDataTypeConversion(doc: AlignedDocNode | undefined): string {
  const p = docParamText(doc, '输入')
  const outs = doc?.zh.params.filter((param) => param.io === 'out') ?? []
  const enOuts = doc?.en.params.filter((param) => param.io === 'out') ?? []
  const r = {
    en: sanitizeDocText(enOuts[0]?.description ?? ''),
    zh: outs[0] ? `${outs[0].name}${outs[0].description ? `: ${sanitizeDocText(outs[0].description)}` : ''}` : '转换结果'
  }
  return `${controlFlowJsdoc(doc, '数据类型转换', [{ ident: 'input', en: p.en, zh: p.zh }], r)}
  dataTypeConversion<T extends keyof DataTypeConversionMap, U extends DataTypeConversionMap[T]>(
    input: RuntimeParameterValueTypeMap[T],
    type: U
  ): RuntimeReturnValueTypeMap[U] {
    const inputType = matchTypes(
      [
        'float',
        'int',
        // 以上浮点和整数必须前置, 以便字面量匹配到正确类型
        'bool',
        'entity',
        'faction',
        'guid',
        'vec3'
      ],
      input
    )
    const inputObj = parseValue(input, inputType)
    if (inputType === 'faction') {
      const metadata = inputObj.getMetadata()
      if (!metadata || metadata.kind !== 'pin') {
        throw new Error('[error] dataTypeConversion: faction input must be wired')
      }
    }
    if (!DATA_TYPE_CONVERSIONS.has(\`\${inputType}->\${String(type)}\`)) {
      throw new Error(
        \`[error] dataTypeConversion: unsupported conversion \${inputType} -> \${String(type)}\`
      )
    }
    const ref = this.registry.registerNode({
      id: 0,
      type: 'data',
      nodeType: \`data_type_conversion_\${String(type)}\`,
      args: [inputObj]
    })
    const ret = new ValueClassMap[type]()
    ret.markPin(ref, 'output', 0)
    return ret as unknown as RuntimeReturnValueTypeMap[U]
  }`
}

function customVarFamilySubTypes(nodeType: string): string[] {
  if (nodeType !== 'get_custom_variable') return []
  return [
    'character_skill',
    'character_control_skill',
    'creation_skill',
    'bool_filter',
    'int_filter',
    'creation_status',
    'creation_status_decision'
  ]
}

function emitGetCustomVariable(subType: string, doc: AlignedDocNode | undefined): string | null {
  if (!customVarFamilySubTypes('get_custom_variable').includes(subType)) return null
  const p0 = docParamText(doc, '目标实体')
  const p1 = docParamText(doc, '变量名')
  return `${controlFlowJsdoc(
    doc,
    '获取自定义变量',
    [
      { ident: 'targetEntity', en: p0.en, zh: p0.zh },
      { ident: 'variableName', en: p1.en, zh: p1.zh }
    ],
    { en: 'Variable value', zh: '变量值' }
  )}
  getCustomVariable(targetEntity: EntityValue, variableName: StrValue): generic {
    const targetEntityObj = parseValue(targetEntity, 'entity')
    const variableNameObj = parseValue(variableName, 'str')
    const ref = this.registry.registerNode({
      id: 0,
      type: 'data',
      nodeType: 'get_custom_variable',
      args: [targetEntityObj, variableNameObj]
    })
    const ret = new generic()
    ret.markPin(ref, 'variableValue', 0)
    return ret
  }`
}

/** 按中文参数名取入参双语 JSDoc 文本（docParamText 只取首个入参，不适用于多参节点） */
function docParamTextByZhName(
  doc: AlignedDocNode | undefined,
  zhName: string
): { en: string; zh: string } {
  const zhIns = doc?.zh.params.filter((p) => p.io !== 'out') ?? []
  const enIns = doc?.en.params.filter((p) => p.io !== 'out') ?? []
  const idx = zhIns.findIndex((p) => p.name === zhName)
  const zh = idx >= 0 ? zhIns[idx] : undefined
  const en = idx >= 0 ? enIns[idx] : undefined
  return {
    en: sanitizeDocText(en?.description ?? ''),
    zh: zh ? `${zh.name}${zh.description ? `: ${sanitizeDocText(zh.description)}` : ''}` : zhName
  }
}

function docReturnText(doc: AlignedDocNode | undefined, zhFallback: string): { en: string; zh: string } {
  const zh = doc?.zh.params.find((p) => p.io === 'out')
  const en = doc?.en.params.find((p) => p.io === 'out')
  return {
    en: sanitizeDocText(en?.description ?? ''),
    zh: zh ? `${zh.name}${zh.description ? `: ${sanitizeDocText(zh.description)}` : ''}` : zhFallback
  }
}

// ---------------------------------------------------------------------------
// Dictionary reflect nodes (server-parity generics)
//
// 字典的键/值类型不体现在 concreteId（恒定 1050..1055）或输入引脚变体上，
// 无法从样本推导确定的出参类型；与服务器同款：签名用 dict<K, V> 泛型，
// 运行时从字典对象读取键/值类型构造返回值。
// ---------------------------------------------------------------------------

function emitGetListOfValuesFromDictionary(doc: AlignedDocNode | undefined): string {
  const p0 = docParamTextByZhName(doc, '字典')
  return `${controlFlowJsdoc(
    doc,
    '获取字典中值组成的列表',
    [{ ident: 'dictionary', en: p0.en, zh: p0.zh }],
    docReturnText(doc, '值列表')
  )}
  getListOfValuesFromDictionary<
    K extends DictKeyType,
    V extends keyof CommonLiteralValueTypeMap
  >(dictionary: dict<K, V>): RuntimeReturnValueTypeMap[\`\${V}_list\`] {
    const dictionaryObj = parseValue(dictionary, 'dict')
    const valueType = dictionaryObj.getValueType() as V
    const ref = this.registry.registerNode({
      id: 0,
      type: 'data',
      nodeType: 'get_list_of_values_from_dictionary',
      args: [dictionaryObj]
    })
    const ret = new list(valueType)
    ret.markPin(ref, 'valueList', 0)
    return ret as unknown as RuntimeReturnValueTypeMap[\`\${V}_list\`]
  }`
}

function emitGetListOfKeysFromDictionary(doc: AlignedDocNode | undefined): string {
  const p0 = docParamTextByZhName(doc, '字典')
  return `${controlFlowJsdoc(
    doc,
    '获取字典中键组成的列表',
    [{ ident: 'dictionary', en: p0.en, zh: p0.zh }],
    docReturnText(doc, '键列表')
  )}
  getListOfKeysFromDictionary<K extends DictKeyType, V extends DictValueType>(
    dictionary: dict<K, V>
  ): RuntimeReturnValueTypeMap[\`\${K}_list\`] {
    const dictionaryObj = parseValue(dictionary, 'dict')
    const ref = this.registry.registerNode({
      id: 0,
      type: 'data',
      nodeType: 'get_list_of_keys_from_dictionary',
      args: [dictionaryObj]
    })
    const ret = new list(dictionaryObj.getKeyType())
    ret.markPin(ref, 'keyList', 0)
    return ret as unknown as RuntimeReturnValueTypeMap[\`\${K}_list\`]
  }`
}

function emitQueryDictionaryValueByKey(doc: AlignedDocNode | undefined): string {
  const p0 = docParamTextByZhName(doc, '字典')
  const p1 = docParamTextByZhName(doc, '键')
  return `${controlFlowJsdoc(
    doc,
    '以键查询字典值',
    [
      { ident: 'dictionary', en: p0.en, zh: p0.zh },
      { ident: 'key', en: p1.en, zh: p1.zh }
    ],
    docReturnText(doc, '值')
  )}
  queryDictionaryValueByKey<K extends DictKeyType, V extends DictValueType>(
    dictionary: dict<K, V>,
    key: RuntimeParameterValueTypeMap[K]
  ): RuntimeReturnValueTypeMap[V] {
    const dictionaryObj = parseValue(dictionary, 'dict')
    const keyObj = parseValue(key, dictionaryObj.getKeyType())
    const valueType = dictionaryObj.getValueType()
    const ref = this.registry.registerNode({
      id: 0,
      type: 'data',
      nodeType: 'query_dictionary_value_by_key',
      args: [dictionaryObj, keyObj]
    })
    if (isListType(valueType)) {
      const ret = new list(getBaseValueType(valueType))
      ret.markPin(ref, 'value', 0)
      return ret as unknown as RuntimeReturnValueTypeMap[V]
    }
    const ret = new ValueClassMap[valueType]()
    ret.markPin(ref, 'value', 0)
    return ret as unknown as RuntimeReturnValueTypeMap[V]
  }`
}

function emitQueryIfDictionaryContainsSpecificKey(doc: AlignedDocNode | undefined): string {
  const p0 = docParamTextByZhName(doc, '字典')
  const p1 = docParamTextByZhName(doc, '键')
  return `${controlFlowJsdoc(
    doc,
    '查询字典是否包含特定键',
    [
      { ident: 'dictionary', en: p0.en, zh: p0.zh },
      { ident: 'key', en: p1.en, zh: p1.zh }
    ],
    docReturnText(doc, '是否包含')
  )}
  queryIfDictionaryContainsSpecificKey<K extends DictKeyType, V extends DictValueType>(
    dictionary: dict<K, V>,
    key: RuntimeParameterValueTypeMap[K]
  ): boolean {
    const dictionaryObj = parseValue(dictionary, 'dict')
    const keyObj = parseValue(key, dictionaryObj.getKeyType())
    const ref = this.registry.registerNode({
      id: 0,
      type: 'data',
      nodeType: 'query_if_dictionary_contains_specific_key',
      args: [dictionaryObj, keyObj]
    })
    const ret = new bool()
    ret.markPin(ref, 'include', 0)
    return ret as unknown as boolean
  }`
}

function emitQueryIfDictionaryContainsSpecificValue(doc: AlignedDocNode | undefined): string {
  const p0 = docParamTextByZhName(doc, '字典')
  const p1 = docParamTextByZhName(doc, '值')
  return `${controlFlowJsdoc(
    doc,
    '查询字典是否包含特定值',
    [
      { ident: 'dictionary', en: p0.en, zh: p0.zh },
      { ident: 'value', en: p1.en, zh: p1.zh }
    ],
    docReturnText(doc, '是否包含')
  )}
  queryIfDictionaryContainsSpecificValue<
    K extends DictKeyType,
    V extends keyof CommonLiteralValueTypeMap
  >(dictionary: dict<K, V>, value: RuntimeParameterValueTypeMap[V]): boolean {
    const dictionaryObj = parseValue(dictionary, 'dict')
    const valueObj = parseValue(value, dictionaryObj.getValueType())
    const ref = this.registry.registerNode({
      id: 0,
      type: 'data',
      nodeType: 'query_if_dictionary_contains_specific_value',
      args: [dictionaryObj, valueObj]
    })
    const ret = new bool()
    ret.markPin(ref, 'include', 0)
    return ret as unknown as boolean
  }`
}

/** 字典键类型 -> 参数 TS 类型（服务器 assemblyDictionary/createDictionary 重载矩阵同款） */
const DICT_KEY_PARAM_TS: Record<string, string> = {
  int: 'IntValue',
  str: 'StrValue',
  entity: 'EntityValue',
  guid: 'GuidValue',
  faction: 'FactionValue',
  config_id: 'ConfigIdValue',
  prefab_id: 'PrefabIdValue'
}

/**
 * 字典值标量类型 -> 参数 TS 类型；vec3 标量用类类型（与服务器一致：
 * [x,y,z] 数组字面量会与列表值产生重载歧义），列表值统一 Value[]。
 */
const DICT_VALUE_PARAM_TS: Record<string, { scalar: string; list: string }> = {
  float: { scalar: 'FloatValue', list: 'FloatValue[]' },
  int: { scalar: 'IntValue', list: 'IntValue[]' },
  bool: { scalar: 'BoolValue', list: 'BoolValue[]' },
  config_id: { scalar: 'ConfigIdValue', list: 'ConfigIdValue[]' },
  entity: { scalar: 'EntityValue', list: 'EntityValue[]' },
  faction: { scalar: 'FactionValue', list: 'FactionValue[]' },
  guid: { scalar: 'GuidValue', list: 'GuidValue[]' },
  prefab_id: { scalar: 'PrefabIdValue', list: 'PrefabIdValue[]' },
  str: { scalar: 'StrValue', list: 'StrValue[]' },
  vec3: { scalar: 'vec3', list: 'Vec3Value[]' }
}

/**
 * 拼装字典：服务器 assemblyDictionary 同款重载矩阵 + 泛型实现。IR args 与
 * 服务器同形（k1,v1,k2,v2... 摊平），GIA 侧 count 引脚与 100 个键/值槽由转换器补齐。
 */
function emitAssemblyDictionary(doc: AlignedDocNode | undefined): string {
  const p0 = docParamTextByZhName(doc, '键0~49')
  const overloads = Object.entries(DICT_KEY_PARAM_TS).flatMap(([k, kTs]) =>
    Object.entries(DICT_VALUE_PARAM_TS).flatMap(([v, vTs]) => [
      `  assemblyDictionary(pairs: { k: ${kTs}; v: ${vTs.scalar} }[]): ReadonlyDict<'${k}', '${v}'>`,
      `  assemblyDictionary(pairs: { k: ${kTs}; v: ${vTs.list} }[]): ReadonlyDict<'${k}', '${v}_list'>`
    ])
  )
  return `${controlFlowJsdoc(
    doc,
    '拼装字典',
    [{ ident: 'pairs', en: p0.en || 'Key-Value Pairs (1-50)', zh: '键值对: 至多50个键值对' }],
    docReturnText(doc, '字典')
  )}
${overloads.join('\n')}
  assemblyDictionary<K extends DictKeyType, V extends DictValueType>(
    pairs: {
      k: RuntimeParameterValueTypeMap[K]
      v: RuntimeParameterValueTypeMap[V]
    }[]
  ): ReadonlyDict<K, V> {
    if (pairs.length === 0) throw new Error('Pairs cannot be empty')

    if (pairs.length > 50) throw new Error('Pairs cannot be more than 50')

    const keys = pairs.map((p) => p.k)
    const keyType = matchTypes(
      ['int', 'str', 'entity', 'guid', 'faction', 'config_id', 'prefab_id'],
      ...keys
    )
    const values = pairs.map((p) => p.v)
    const valueType = matchTypes(
      [
        'float',
        'int',
        'bool',
        'config_id',
        'entity',
        'faction',
        'guid',
        'prefab_id',
        'str',
        'vec3'
      ],
      ...values
    )

    const key0to49Obj = keys.map((k) => parseValue(k, keyType))

    const isValueTypeList = values[0] instanceof list
    const value0to49Obj = isValueTypeList
      ? values.map((v) =>
          parseValue(v, (valueType + '_list') as keyof CommonLiteralValueListTypeMap)
        )
      : values.map((v) => parseValue(v, valueType))

    const kv0to49Args = key0to49Obj.flatMap((k, i) => [k, value0to49Obj[i]])

    const ref = this.registry.registerNode({
      id: 0,
      type: 'data',
      nodeType: 'assembly_dictionary',
      args: kv0to49Args
    })
    const retValueType = isValueTypeList ? ((valueType + '_list') as DictValueType) : valueType
    const ret = new dict(keyType, retValueType) as dict<K, V>
    ret.markPin(ref, 'dictionary', 0)
    return ret
  }`
}

/** 建立字典：服务器 createDictionary 同款重载矩阵 + 泛型实现，键/值列表必须已定型 */
function emitCreateDictionary(doc: AlignedDocNode | undefined): string {
  const p0 = docParamTextByZhName(doc, '键列表')
  const p1 = docParamTextByZhName(doc, '值列表')
  const overloads = Object.entries(DICT_KEY_PARAM_TS).flatMap(([k, kTs]) =>
    Object.entries(DICT_VALUE_PARAM_TS).map(
      ([v, vTs]) =>
        `  createDictionary(keyList: ${kTs}[], valueList: ${vTs.list}): ReadonlyDict<'${k}', '${v}'>`
    )
  )
  return `${controlFlowJsdoc(
    doc,
    '建立字典',
    [
      { ident: 'keyList', en: p0.en, zh: p0.zh },
      { ident: 'valueList', en: p1.en, zh: p1.zh }
    ],
    docReturnText(doc, '字典')
  )}
${overloads.join('\n')}
  createDictionary<K extends DictKeyType, V extends keyof CommonLiteralValueTypeMap>(
    keyList: RuntimeParameterValueTypeMap[K][],
    valueList: RuntimeParameterValueTypeMap[V][]
  ): ReadonlyDict<K, V> {
    const keyListConcreteType = (keyList as unknown as list<K>).getConcreteType()
    if (!keyListConcreteType) {
      throw new Error("[error] createDictionary(): keyList must be typed, use list('type', 0)")
    }
    const keyListObj = parseValue(
      keyList,
      (keyListConcreteType + '_list') as keyof CommonLiteralValueListTypeMap
    )
    const valueListConcreteType = (valueList as unknown as list<V>).getConcreteType()
    if (!valueListConcreteType) {
      throw new Error("[error] createDictionary(): valueList must be typed, use list('type', 0)")
    }
    const valueListObj = parseValue(
      valueList,
      (valueListConcreteType + '_list') as keyof CommonLiteralValueListTypeMap
    )
    const ref = this.registry.registerNode({
      id: 0,
      type: 'data',
      nodeType: 'create_dictionary',
      args: [keyListObj, valueListObj]
    })
    const ret = new dict(keyListConcreteType, valueListConcreteType)
    ret.markPin(ref, 'dictionary', 0)
    return ret
  }`
}

// ---------------------------------------------------------------------------
// Type list builders (hidden pins)
//
// 获取实体类型列表 / 获取射线筛选类型列表：官方文档零入参，但样本节点带
// 1 个数量引脚 + 10 个枚举槽（编辑器隐藏引脚，语料 结构采样_…_攻击盒 填值
// 实证）。方法暴露可选 types 参数；省略时保持引脚默认值（与旧零参行为一致）。
// ---------------------------------------------------------------------------

function emitTypeListBuilder(
  doc: AlignedDocNode | undefined,
  methodName: string,
  nodeType: string,
  zhName: string,
  enumClass: string
): string {
  return `${controlFlowJsdoc(
    doc,
    zhName,
    [{ ident: 'types', en: 'Types to assemble into the list (up to 10)', zh: '类型0~9: 放入列表的类型，至多10个；省略时使用编辑器默认值' }],
    docReturnText(doc, '列表')
  )}
  ${methodName}(types?: ${enumClass}[]): ${enumClass}[] {
    if (types && types.length > 10) {
      throw new Error(\`[error] ${methodName}: expected at most 10 types, got \${types.length}\`)
    }
    const typeObjs = (types ?? []).map((t) => parseValue(t, 'enum'))
    const ref = this.registry.registerNode({
      id: 0,
      type: 'data',
      nodeType: '${nodeType}',
      args: typeObjs
    })
    const ret = new list('enum')
    ret.markPin(ref, 'list', 0)
    return ret as unknown as ${enumClass}[]
  }`
}

function emitSendSignalToServer(doc: AlignedDocNode | undefined): string {
  return `${controlFlowJsdoc(doc, '向服务器节点图发送信号', [{ ident: 'signalName', en: 'Signal name', zh: '信号名' }])}
  sendSignalToServerNodeGraph(signalName: StrValue): void {
    const signalNameObj = parseValue(signalName, 'str')
    this.registry.registerNode({
      id: 0,
      type: 'exec',
      nodeType: 'send_signal_to_server_node_graph',
      args: [signalNameObj]
    })
  }`
}

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

export function generateClientNodes(
  metadata: MetaRecord[],
  alignment: DocAlignment,
  enumBinding: ClientEnumBinding
): CodegenResult {
  const gaps: GapEntry[] = []
  const methodTextsBySubType = new Map<string, string[]>()
  const methodNamesBySubType = new Map<string, string[]>()
  const argPinsBySubType: Record<string, Record<string, number[]>> = {}
  for (const subType of SUB_TYPES) {
    methodTextsBySubType.set(subType, [])
    methodNamesBySubType.set(subType, [])
  }

  // flow metadata grouped by identical method identity across families
  const flowEntryByKey = new Map<string, FlowMetadataEntry>()

  const pushFlowEntry = (
    spec: MethodSpec,
    kind: FlowMetadataEntry['kind'],
    doc: { en: string; zh: string }
  ) => {
    const params = spec.params.map((p) => ({
      name: p.ident,
      irType: p.reflective ? p.candidates!.join(' | ') : p.irType!,
      docZh: p.docZhName,
      docEn: p.docEnName
    }))
    const returns = spec.returns.length
      ? spec.returns.map((r) => ({
          name: r.ident,
          irType: r.reflective
            ? [...new Set(spec.reflect!.variants.map((v) => v.outType!))].join(' | ')
            : r.irType!,
          docZh: r.docZhName,
          docEn: r.docEnName
        }))
      : null
    const identity = JSON.stringify({ m: spec.methodName, p: params, r: returns })
    const existing = flowEntryByKey.get(identity)
    if (existing) {
      if (!existing.subTypes.includes(spec.subType)) existing.subTypes.push(spec.subType)
      return
    }
    flowEntryByKey.set(identity, {
      methodName: spec.methodName,
      nodeType: spec.nodeType,
      subTypes: [spec.subType],
      modes: ['beyond'],
      kind,
      params,
      returns,
      docs: doc,
      ...(spec.reflect
        ? { reflect: { variantKeys: spec.reflect.variants.map((v) => v.inTypes.join('|')) } }
        : {})
    })
  }

  const sortedMetadata = [...metadata].sort(
    (a, b) => a.subType.localeCompare(b.subType) || a.nodeType.localeCompare(b.nodeType)
  )

  for (const record of sortedMetadata) {
    if (record.isStart || RUNTIME_INTERNAL_NODE_TYPES.has(record.nodeType)) continue

    const doc = lookupDocNode(alignment, record.subType, record.displayName)

    if (HAND_NODE_TYPES.has(record.nodeType)) {
      const texts = methodTextsBySubType.get(record.subType)!
      const names = methodNamesBySubType.get(record.subType)!
      switch (record.nodeType) {
        case 'double_branch':
          texts.push(emitDoubleBranch(record.subType, doc))
          names.push('doubleBranch')
          break
        case 'finite_loop':
          texts.push(emitFiniteLoop(record.subType, doc))
          names.push('finiteLoop')
          break
        case 'traverse_entity_list':
          texts.push(emitTraverseEntityList(record.subType, doc))
          names.push('traverseEntityList')
          break
        case 'break_loop':
          texts.push(emitBreakLoop(doc))
          names.push('breakLoop')
          break
        case 'assembly_list':
          texts.push(emitAssemblyList(record, doc))
          names.push('assemblyList')
          break
        case 'multiple_branches':
          texts.push(emitMultipleBranches(record.subType, doc))
          names.push('multipleBranches')
          break
        case 'data_type_conversion':
          texts.push(emitDataTypeConversion(doc))
          names.push('dataTypeConversion')
          break
        case 'get_custom_variable': {
          const t = emitGetCustomVariable(record.subType, doc)
          if (t) {
            texts.push(t)
            names.push('getCustomVariable')
          }
          break
        }
        case 'send_signal_to_server_node_graph':
          texts.push(emitSendSignalToServer(doc))
          names.push('sendSignalToServerNodeGraph')
          break
        case 'get_list_of_values_from_dictionary':
          texts.push(emitGetListOfValuesFromDictionary(doc))
          names.push('getListOfValuesFromDictionary')
          break
        case 'get_list_of_keys_from_dictionary':
          texts.push(emitGetListOfKeysFromDictionary(doc))
          names.push('getListOfKeysFromDictionary')
          break
        case 'query_dictionary_value_by_key':
          texts.push(emitQueryDictionaryValueByKey(doc))
          names.push('queryDictionaryValueByKey')
          break
        case 'query_if_dictionary_contains_specific_key':
          texts.push(emitQueryIfDictionaryContainsSpecificKey(doc))
          names.push('queryIfDictionaryContainsSpecificKey')
          break
        case 'query_if_dictionary_contains_specific_value':
          texts.push(emitQueryIfDictionaryContainsSpecificValue(doc))
          names.push('queryIfDictionaryContainsSpecificValue')
          break
        case 'assembly_dictionary':
          texts.push(emitAssemblyDictionary(doc))
          names.push('assemblyDictionary')
          break
        case 'create_dictionary':
          texts.push(emitCreateDictionary(doc))
          names.push('createDictionary')
          break
        case 'get_entity_type_list':
          texts.push(
            emitTypeListBuilder(doc, 'getEntityTypeList', 'get_entity_type_list', '获取实体类型列表', 'EntityType')
          )
          names.push('getEntityTypeList')
          break
        case 'get_ray_filter_type_list':
          texts.push(
            emitTypeListBuilder(doc, 'getRayFilterTypeList', 'get_ray_filter_type_list', '获取射线筛选类型列表', 'RayFilterType')
          )
          names.push('getRayFilterTypeList')
          break
      }
      continue
    }

    // some zh doc names describe different node shapes per family; try each
    // doc variant (majority shape first) until one aligns with the pins
    const docVariants = lookupDocNodeVariants(alignment, record.subType, record.displayName)
    if (!docVariants.length) {
      gaps.push({
        subType: record.subType,
        nodeType: record.nodeType,
        displayName: record.displayName,
        reason: 'doc_missing'
      })
      continue
    }

    let spec: MethodSpec | null = null
    let firstGap: GapEntry | null = null
    for (const docVariant of docVariants) {
      const built = buildMethodSpec(record, docVariant, enumBinding)
      if ('reason' in built) {
        firstGap ??= built
        continue
      }
      spec = built
      break
    }
    if (!spec) {
      gaps.push(firstGap!)
      continue
    }

    let text: string
    try {
      text = emitMethod(spec, enumBinding)
    } catch (err) {
      gaps.push({
        subType: record.subType,
        nodeType: record.nodeType,
        displayName: record.displayName,
        reason: 'emission_failed',
        detail: String(err instanceof Error ? err.message : err)
      })
      continue
    }
    methodTextsBySubType.get(record.subType)!.push(text)
    methodNamesBySubType.get(record.subType)!.push(spec.methodName)
    const argPins = argPinsOf(spec)
    if (argPins) {
      ;(argPinsBySubType[record.subType] ??= {})[record.nodeType] = argPins
    }
    pushFlowEntry(spec, spec.recordType === 'data' ? 'data' : 'exec', {
      en: spec.docsEn,
      zh: spec.docsZh
    })
  }

  // control-flow flow metadata entries (fixed shapes)
  const controlFlowEntries: FlowMetadataEntry[] = []
  const handFamilies = (nodeType: string) =>
    SUB_TYPES.filter((s) => metadata.some((r) => r.subType === s && r.nodeType === nodeType))
  const handEntry = (
    methodName: string,
    nodeType: string,
    params: FlowMetadataEntry['params'],
    returns: FlowMetadataEntry['returns'],
    docs: FlowMetadataEntry['docs']
  ): FlowMetadataEntry | null => {
    const subTypes = handFamilies(nodeType)
    if (!subTypes.length) return null
    return {
      methodName,
      nodeType,
      subTypes: [...subTypes],
      modes: ['beyond'],
      kind: 'control_flow',
      params,
      returns,
      docs
    }
  }
  const handDocs = (zhName: string): FlowMetadataEntry['docs'] => {
    const rec = metadata.find((r) => r.displayName === zhName)
    const doc = rec ? lookupDocNode(alignment, rec.subType, rec.displayName) : undefined
    return {
      en: sanitizeDocText(doc?.en.functions.join('; ') ?? ''),
      zh: sanitizeDocText(doc?.zh.functions.join('; ') ?? '')
    }
  }
  for (const entry of [
    handEntry(
      'doubleBranch',
      'double_branch',
      [{ name: 'condition', irType: 'bool', docZh: '条件', docEn: 'Condition' }],
      null,
      handDocs('双分支')
    ),
    handEntry(
      'finiteLoop',
      'finite_loop',
      [
        { name: 'loopStartValue', irType: 'int', docZh: '循环起始值', docEn: 'Loop Start Value' },
        { name: 'loopEndValue', irType: 'int', docZh: '循环终止值', docEn: 'Loop End Value' }
      ],
      [{ name: 'currentLoopValue', irType: 'int', docZh: '当前循环值', docEn: 'Current Loop Value' }],
      handDocs('有限循环')
    ),
    handEntry(
      'traverseEntityList',
      'traverse_entity_list',
      [{ name: 'entityList', irType: 'entity_list', docZh: '实体列表', docEn: 'Entity List' }],
      [{ name: 'currentEntity', irType: 'entity', docZh: '当前实体', docEn: 'Current Entity' }],
      handDocs('遍历实体列表')
    ),
    handEntry('breakLoop', 'break_loop', [], null, handDocs('跳出循环'))
  ]) {
    if (entry) controlFlowEntries.push(entry)
  }

  // ---- assemble the class file ----
  const classes = SUB_TYPES.map((subType) => {
    const texts = methodTextsBySubType.get(subType)!
    return `export class ${CLASS_NAME_BY_SUB_TYPE[subType]} extends ClientExecutionFlowFunctionsBase {
${texts.join('\n\n')}
}`
  })

  const bodyText = classes.join('\n\n')
  // 服务器同款字典值类型窄化辅助；仅在字典节点生成时注入
  const dictHelpers = /\bisListType\(/.test(bodyText)
    ? `function isListType(type: DictValueType): type is keyof CommonLiteralValueListTypeMap {
  return type.endsWith('_list')
}

function getBaseValueType(
  type: keyof CommonLiteralValueListTypeMap
): keyof CommonLiteralValueTypeMap {
  return type.replace('_list', '') as keyof CommonLiteralValueTypeMap
}

`
    : ''
  const usesIdent = (name: string) => new RegExp(`\\b${name}\\b`).test(dictHelpers + bodyText)

  const valueClassImports = [
    'bool', 'configId', 'dict', 'entity', 'enumeration', 'faction', 'float', 'generic', 'guid',
    'int', 'list', 'prefabId', 'str', 'vec3', 'ValueClassMap'
  ].filter(usesIdent)
  const valueTypeImports = [
    'BoolValue', 'ConfigIdValue', 'DictKeyType', 'DictValue', 'DictValueType', 'EntityValue',
    'EnumerationValue', 'FactionValue', 'FloatValue', 'GuidValue', 'IntValue', 'PrefabIdValue',
    'ReadonlyDict', 'StrValue', 'Vec3Value', 'value'
  ].filter(usesIdent)
  const irTypeImports = ['CommonLiteralValueListTypeMap', 'CommonLiteralValueTypeMap'].filter(
    usesIdent
  )
  const nodesImports = ['matchTypes', 'parseValue'].filter(usesIdent)
  const serverEnumImports = [
    ...enumBinding.serverClasses,
    'EnumerationType',
    'EnumerationTypeMap'
  ].filter(usesIdent)
  const clientEnumImports = enumBinding.clientOnlyClasses
    .map((c) => c.className)
    .filter(usesIdent)
  const enumImportLines = [
    serverEnumImports.length
      ? `import type { ${serverEnumImports.join(', ')} } from './enum.js'`
      : '',
    clientEnumImports.length
      ? `import type { ${clientEnumImports.join(', ')} } from './client_enums.js'`
      : ''
  ].filter(Boolean)

  const classFileBody = `// This file is generated by scripts/client-nodegraph/generate-client-nodegraph-modules.ts.
// Source of truth: resources/client_node_metadata.json (sample-extracted pins)
// + resources/node_definitions.json (official bilingual docs). Do not edit.
import type { ExecutionFlowRegistry } from '../runtime/core.js'
import {
${[...valueClassImports, ...valueTypeImports.map((t) => `type ${t}`)].map((s) => `  ${s}`).join(',\n')}
} from '../runtime/value.js'
/** supported conversion pairs; IR encodes data_type_conversion_<out> like the server */
const DATA_TYPE_CONVERSIONS = new Set([
  'int->bool',
  'int->float',
  'int->str',
  'entity->str',
  'guid->str',
  'bool->int',
  'bool->str',
  'float->int',
  'float->str',
  'vec3->str',
  'faction->str'
])

${enumImportLines.length ? `${enumImportLines.join('\n')}\n` : ''}${irTypeImports.length ? `import type { ${irTypeImports.join(', ')} } from '../runtime/IR.js'\n` : ''}import type { RuntimeParameterValueTypeMap, RuntimeReturnValueTypeMap } from '../runtime/value.js'
import type { DataTypeConversionMap } from './nodes.js'
import { ${nodesImports.join(', ')} } from './nodes.js'

${dictHelpers}class ClientExecutionFlowFunctionsBase {
  constructor(protected registry: ExecutionFlowRegistry) {}
}

${bodyText}

export type ClientExecutionFlowFunctionsBySubType = {
  character_skill: ClientCharacterSkillExecutionFlowFunctions
  character_control_skill: ClientCharacterControlSkillExecutionFlowFunctions
  creation_skill: ClientCreationSkillExecutionFlowFunctions
  creation_status: ClientCreationStatusExecutionFlowFunctions
  creation_status_decision: ClientCreationStatusDecisionExecutionFlowFunctions
  bool_filter: ClientBoolFilterExecutionFlowFunctions
  int_filter: ClientIntFilterExecutionFlowFunctions
}
`

  const flowMetadata = [...flowEntryByKey.values(), ...controlFlowEntries].sort(
    (a, b) => a.methodName.localeCompare(b.methodName) || a.nodeType.localeCompare(b.nodeType)
  )

  const methodsBySubType: Record<string, string[]> = {}
  for (const subType of SUB_TYPES) {
    methodsBySubType[subType] = [...new Set(methodNamesBySubType.get(subType)!)].sort()
  }

  return { classFileBody, flowMetadata, methodsBySubType, gaps, argPinsBySubType }
}
