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
  'creation_skill',
  'creation_status',
  'creation_status_decision',
  'bool_filter',
  'int_filter'
] as const

const CLASS_NAME_BY_SUB_TYPE: Record<string, string> = {
  character_skill: 'ClientCharacterSkillExecutionFlowFunctions',
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

/** control-flow nodes emitted from hand templates, not the auto pipeline */
const HAND_NODE_TYPES = new Set([
  'double_branch',
  'finite_loop',
  'traverse_entity_list',
  'break_loop'
])

/** dynamic-pin nodes without a sample-proven variable-arity client encoding */
const DYNAMIC_PIN_NODE_TYPES = new Set(['assembly_list', 'multiple_branches'])

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
  ...['bool', 'int', 'float', 'str', 'vec3', 'guid', 'entity', 'faction', 'config_id', 'prefab_id'].map(
    (t) => `${t}_list`
  )
])

/** IR types expressible as generated method returns */
const SUPPORTED_RETURN_TYPES = new Set([
  ...Object.keys(RETURN_TS_BY_IR),
  ...['bool', 'int', 'float', 'str', 'vec3', 'guid', 'entity', 'faction', 'config_id', 'prefab_id'].map(
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

function buildMethodSpec(record: MetaRecord, doc: AlignedDocNode): MethodSpec | GapEntry {
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

  if (record.specialKind === 'inline_var_type_hint' || record.specialKind === 'structure_list_unknown_binding') {
    return gap('unsupported_special_kind', record.specialKind)
  }
  if (DYNAMIC_PIN_NODE_TYPES.has(record.nodeType)) return gap('dynamic_pins')
  if (record.nodeType === 'send_signal_to_server_node_graph') {
    return gap('signal_pins_unproven', 'signal name rides client_signal pins; no input pin evidence')
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
    returns.push({
      pinIndex,
      ident: uniqueIdent(identFromDocName(doc?.en.name ?? '', fallbackName), returnIdents),
      ...(irType !== undefined ? { irType } : {}),
      reflective,
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
    params.push({
      pinIndex: b.pin.index,
      ident,
      irType: b.pin.type,
      reflective: false,
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
    if (isListType(t)) return `new list('${elemType(t)}')`
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

function emitNonReflectMethod(spec: MethodSpec): string {
  const sigParams = spec.params.map((p) => `${p.ident}: ${paramTs(p.irType!)}`).join(', ')
  const retTs =
    spec.returns.length === 0
      ? 'void'
      : spec.returns.length === 1
        ? returnTs(spec.returns[0].irType!)
        : `{ ${spec.returns.map((r) => `${r.ident}: ${returnTs(r.irType!)}`).join('; ')} }`

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
    body.push(...emitSingleReturn(r, retConstruction({ kind: 'literal', irType: r.irType! }), returnTs(r.irType!)))
  } else if (spec.returns.length > 1) {
    body.push(`    return {`)
    for (const [i, r] of spec.returns.entries()) {
      body.push(`      ${r.ident}: (() => {`)
      body.push(`        const ret = ${retConstruction({ kind: 'literal', irType: r.irType! })}`)
      body.push(`        ret.markPin(ref, '${r.ident}', ${r.pinIndex})`)
      body.push(`        return ret as unknown as ${returnTs(r.irType!)}`)
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
        if (!p.reflective) return `${p.ident}: ${paramTs(p.irType!)}`
        const slot = reflect.pinIndexes.indexOf(p.pinIndex)
        return `${p.ident}: ${paramTs(variant.inTypes[slot])}`
      })
      .join(', ')
    const outTs = singleReturn
      ? returnTs(singleReturn.reflective ? variant.outType! : singleReturn.irType!)
      : 'void'
    overloads.push(`  ${spec.methodName}(${paramSig}): ${outTs}`)
  }

  // ---- implementation signature (unions) ----
  const unionOf = (types: string[]) => [...new Set(types)].join(' | ')
  const implParams = spec.params
    .map((p) => {
      if (!p.reflective) return `${p.ident}: ${paramTs(p.irType!)}`
      return `${p.ident}: ${unionOf(p.candidates!.map(paramTs))}`
    })
    .join(', ')
  const implRet = singleReturn
    ? singleReturn.reflective
      ? unionOf(reflect.variants.map((v) => returnTs(v.outType!)))
      : returnTs(singleReturn.irType!)
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
    body.push(...emitSingleReturn(
      singleReturn,
      retConstruction({ kind: 'literal', irType: singleReturn.irType! }),
      returnTs(singleReturn.irType!)
    ))
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

function emitMethod(spec: MethodSpec): string {
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

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

export function generateClientNodes(
  metadata: MetaRecord[],
  alignment: DocAlignment
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
      const built = buildMethodSpec(record, docVariant)
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
      text = emitMethod(spec)
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
  const usesIdent = (name: string) => new RegExp(`\\b${name}\\b`).test(bodyText)

  const valueClassImports = [
    'bool', 'configId', 'entity', 'enumeration', 'faction', 'float', 'guid', 'int', 'list',
    'prefabId', 'str', 'vec3', 'ValueClassMap'
  ].filter(usesIdent)
  const valueTypeImports = [
    'BoolValue', 'ConfigIdValue', 'DictValue', 'EntityValue', 'EnumerationValue', 'FactionValue',
    'FloatValue', 'GuidValue', 'IntValue', 'PrefabIdValue', 'StrValue', 'Vec3Value'
  ].filter(usesIdent)
  const nodesImports = ['matchTypes', 'parseValue'].filter(usesIdent)

  const classFileBody = `// This file is generated by scripts/client-nodegraph/generate-client-nodegraph-modules.ts.
// Source of truth: resources/client_node_metadata.json (sample-extracted pins)
// + resources/node_definitions.json (official bilingual docs). Do not edit.
import type { ExecutionFlowRegistry } from '../runtime/core.js'
import {
${[...valueClassImports, ...valueTypeImports.map((t) => `type ${t}`)].map((s) => `  ${s}`).join(',\n')}
} from '../runtime/value.js'
import { ${nodesImports.join(', ')} } from './nodes.js'

class ClientExecutionFlowFunctionsBase {
  constructor(protected registry: ExecutionFlowRegistry) {}
}

${bodyText}

export type ClientExecutionFlowFunctionsBySubType = {
  character_skill: ClientCharacterSkillExecutionFlowFunctions
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
