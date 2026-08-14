import type {
  Argument,
  ServerGraphMode,
  ServerNode,
  ValueType,
  Variable
} from '../../runtime/IR.js'
import type { DictKeyType, DictValueType } from '../../runtime/value.js'
import {
  SPECIAL_NODE_MAPPINGS,
  enumKeyLowerFromEnumId,
  enumKeyLowerFromEnumName,
  getNodeIdLowerMap,
  parseEnumValue
} from './mappings.js'
import type { ConnTypeIndex, ConnTypeInfo } from './node_id.js'

export type ResolvedValueType =
  | { kind: 'scalar'; name: Exclude<ValueType, 'dict' | 'enum' | 'enumeration' | 'local_variable'> }
  | { kind: 'list'; element: ResolvedValueType }
  | { kind: 'dict'; key: ResolvedValueType; value: ResolvedValueType }
  | { kind: 'enum'; enumName?: string; enumValue?: string }
  | { kind: 'local-variable'; value?: ResolvedValueType }

export type GraphCompileContext = {
  scope: { kind: 'root' | 'composite-impl'; name: string }
  mode?: ServerGraphMode
  variablesByName: Map<string, Variable>
  connectionTypes: ConnTypeIndex
  diagnostics?: Diagnostic[]
  fallbacks?: ResolutionFallback[]
  strictTypeChecks?: boolean
}

export type Diagnostic = {
  code: 'E_TYPED_INPUT_CONFLICT' | 'E_UNRESOLVED_VALUE_TYPE' | 'E_UNKNOWN_NODE_VARIANT'
  message: string
  nodeId?: number
  nodeType?: string
  argIndex?: number
}

export type ResolutionFallback = {
  reason: 'missing-variable-declaration' | 'unsupported-resolved-type' | 'missing-concrete-variant'
  nodeId: number
  nodeType: string
  variableName?: string
}

export type ResolvedInput = {
  logicalArgIndex: number
  physicalPinIndex: number
  type?: ResolvedValueType
  source: { kind: 'literal' | 'connection' | 'omitted' }
}

export type ResolvedNodeIdentity = {
  logicalType: string
  genericNodeId: number
  concreteNodeId?: number
}

function scalarType(type: string | undefined): ResolvedValueType | undefined {
  if (!type) return undefined
  if (type === 'dict' || type === 'enum' || type === 'enumeration' || type === 'local_variable') {
    return undefined
  }
  if (type.endsWith('_list')) {
    const element = scalarType(type.slice(0, -5))
    return element ? { kind: 'list', element } : undefined
  }
  if (
    ['bool', 'int', 'float', 'str', 'vec3', 'guid', 'entity', 'faction', 'prefab_id', 'config_id'].includes(
      type
    )
  ) {
    return { kind: 'scalar', name: type as Exclude<ValueType, 'dict' | 'enum' | 'enumeration' | 'local_variable'> }
  }
  return undefined
}

function fromTypeInfo(info: ConnTypeInfo): ResolvedValueType | undefined {
  if (!info?.type) return undefined
  if (info.type === 'dict') {
    const key = scalarType(info.dict.k)
    const value = scalarType(info.dict.v)
    return key && value ? { kind: 'dict', key, value } : undefined
  }
  if (info.type === 'enum') return { kind: 'enum', enumName: info.enum }
  if (info.type === 'local_variable') return { kind: 'local-variable' }
  return scalarType(info.type)
}

function fromVariable(variable: Variable): ResolvedValueType | undefined {
  if (variable.type === 'dict') {
    const key = scalarType(variable.dict.k)
    const value = scalarType(variable.dict.v)
    return key && value ? { kind: 'dict', key, value } : undefined
  }
  if ((variable.type as string) === 'local_variable') return { kind: 'local-variable' }
  return scalarType(variable.type)
}

function fromArgument(
  arg: Argument | null | undefined,
  context: GraphCompileContext
): ResolvedValueType | undefined {
  if (!arg) return undefined
  if (arg.type === 'conn') {
    const info = context.connectionTypes.get(arg.value.node_id)?.get(arg.value.index)
    if (info) return fromTypeInfo(info)
    if (arg.value.type === 'dict' && arg.value.dict) {
      return fromTypeInfo({ type: 'dict', dict: arg.value.dict })
    }
    if (arg.value.type === 'enum' || arg.value.type === 'enumeration') {
      return { kind: 'enum', enumName: arg.value.enum }
    }
    if (arg.value.type === 'local_variable') return { kind: 'local-variable' }
    return scalarType(arg.value.type)
  }
  if (arg.type === 'dict' && arg.dict) {
    return fromTypeInfo({ type: 'dict', dict: arg.dict })
  }
  if (arg.type === 'enum' || arg.type === 'enumeration') {
    // Literal enum IR carries the value key only; class name is recovered via parseEnumValue.
    return {
      kind: 'enum',
      enumValue: typeof arg.value === 'string' ? arg.value : undefined
    }
  }
  if (arg.type === 'local_variable') return { kind: 'local-variable' }
  return scalarType(arg.type)
}

function sameType(a: ResolvedValueType, b: ResolvedValueType): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

function firstProducedType(
  nodeId: number,
  context: GraphCompileContext
): ResolvedValueType | undefined {
  const outputs = context.connectionTypes.get(nodeId)
  if (!outputs) return undefined
  for (const info of outputs.values()) {
    const type = fromTypeInfo(info)
    if (type && type.kind !== 'local-variable') return type
  }
  return undefined
}

function report(context: GraphCompileContext, diagnostic: Diagnostic): never {
  context.diagnostics?.push(diagnostic)
  throw new Error(`[error] ${diagnostic.code}: ${diagnostic.message}`)
}

function recordFallback(context: GraphCompileContext, fallback: ResolutionFallback): void {
  context.fallbacks?.push(fallback)
}

export function resolveArgumentTypes(
  node: ServerNode,
  context: GraphCompileContext
): ResolvedInput[] {
  return (node.args ?? []).map((arg, logicalArgIndex) => ({
    logicalArgIndex,
    physicalPinIndex: logicalArgIndex,
    type: fromArgument(arg, context),
    source: !arg
      ? { kind: 'omitted' as const }
      : arg.type === 'conn'
        ? { kind: 'connection' as const }
        : { kind: 'literal' as const }
  }))
}

export function resolveNodeIdentity(
  node: ServerNode,
  context: GraphCompileContext,
  inputs = resolveArgumentTypes(node, context)
): ResolvedNodeIdentity {
  const lower = (SPECIAL_NODE_MAPPINGS[node.type] ?? node.type).toLowerCase()
  const nodeIds = getNodeIdLowerMap()
  const genericNodeId = node.type.startsWith('data_type_conversion_')
    ? nodeIds.get('data_type_conversion__generic')
    : nodeIds.get(lower) ?? nodeIds.get(`${lower}__generic`)
  if (genericNodeId === undefined) {
    report(context, {
      code: 'E_UNKNOWN_NODE_VARIANT',
      message: `unknown generic node identity for ${node.type}`,
      nodeId: node.id,
      nodeType: node.type
    })
  }

  const isDataTypeConversion = node.type.startsWith('data_type_conversion_')
  if (isDataTypeConversion) {
    const inputType = inputs[0]?.type
    const outputType = node.type.slice('data_type_conversion_'.length)
    const inputSuffix = inputType?.kind === 'scalar'
      ? inputType.name === 'vec3' ? 'vec' : inputType.name
      : undefined
    const concreteNodeId = inputSuffix
      ? nodeIds.get(`data_type_conversion__${inputSuffix}_${outputType}`)
      : undefined
    if (!concreteNodeId) {
      recordFallback(context, {
        reason: inputSuffix ? 'missing-concrete-variant' : 'unsupported-resolved-type',
        nodeId: node.id,
        nodeType: node.type
      })
      report(context, {
        code: 'E_UNKNOWN_NODE_VARIANT',
        message: `missing data type conversion variant for ${inputSuffix ?? 'unresolved'}→${outputType}`,
        nodeId: node.id,
        nodeType: node.type,
        argIndex: 0
      })
    }
    return { logicalType: node.type, genericNodeId, concreteNodeId }
  }

  if (usesSharedScalarSameTypeBinaryResolution(node.type)) {
    const left = inputs[0]?.type
    const right = inputs[1]?.type
    if (
      left?.kind === 'scalar' &&
      right?.kind === 'scalar' &&
      left.name === right.name &&
      nodeIds.has(`${lower}__${left.name}`)
    ) {
      const concreteNodeId = nodeIds.get(`${lower}__${left.name}`)
      if (concreteNodeId === undefined) {
        report(context, {
          code: 'E_UNKNOWN_NODE_VARIANT',
          message: `missing scalar same-type binary variant ${lower}__${left.name}`,
          nodeId: node.id,
          nodeType: node.type
        })
      }
      return { logicalType: node.type, genericNodeId, concreteNodeId }
    }
    return { logicalType: node.type, genericNodeId }
  }

  // P5-W7: residual scalar ops share root/impl concrete identity resolution.
  // Typed families use primary scalar input suffix; generic-only families stay on generic.
  if (usesSharedResidualScalarResolution(node.type)) {
    const primary = resolveResidualScalarPrimaryType(node.type, inputs)
    if (primary?.kind === 'scalar' && (primary.name === 'int' || primary.name === 'float')) {
      const concreteNodeId = nodeIds.get(`${lower}__${primary.name}`)
      if (concreteNodeId !== undefined) {
        return { logicalType: node.type, genericNodeId, concreteNodeId }
      }
      // Generic-only residual ops (modulo/logical/sqrt/round) have no typed suffix.
      // Keep generic identity rather than inventing composite-only fallbacks.
      if (SHARED_RESIDUAL_GENERIC_ONLY_SCALAR_NODE_TYPES.has(node.type)) {
        return { logicalType: node.type, genericNodeId }
      }
      report(context, {
        code: 'E_UNKNOWN_NODE_VARIANT',
        message: `missing residual scalar variant ${lower}__${primary.name}`,
        nodeId: node.id,
        nodeType: node.type
      })
    }
    return { logicalType: node.type, genericNodeId }
  }

  // P5-W8: enumerations_equal concrete id is selected by enum kind, not produced bool type.
  // Must land on typed variant (476/477/...) — generic(475) hides enum values in editor.
  if (usesSharedEnumerationsEqualResolution(node.type)) {
    // genericNodeId is required on ResolvedNodeIdentity; missing generic already reported above.
    const sharedGenericNodeId = genericNodeId ?? 0
    const enumKey = resolveEnumerationsEqualEnumKey(node, inputs)
    if (!enumKey) {
      report(context, {
        code: 'E_UNKNOWN_NODE_VARIANT',
        message: 'enumerations_equal requires enum literal value or connection enum metadata',
        nodeId: node.id,
        nodeType: node.type,
        argIndex: 0
      })
      return { logicalType: node.type, genericNodeId: sharedGenericNodeId }
    }
    const concreteNodeId = nodeIds.get(`enumerations_equal__${enumKey}`)
    if (concreteNodeId === undefined) {
      report(context, {
        code: 'E_UNKNOWN_NODE_VARIANT',
        message: `enumerations_equal missing typed node id for enum "${enumKey}"`,
        nodeId: node.id,
        nodeType: node.type,
        argIndex: 0
      })
      return { logicalType: node.type, genericNodeId: sharedGenericNodeId }
    }
    return { logicalType: node.type, genericNodeId: sharedGenericNodeId, concreteNodeId }
  }

  let declaredType: ResolvedValueType | undefined
  const isNodeGraphSetter = node.type === 'set_node_graph_variable'
  const isNodeGraphGetter = node.type === 'get_node_graph_variable'
  const isCustomSetter = node.type === 'set_custom_variable'
  const isCustomGetter = node.type === 'get_custom_variable'
  const isLocalSetter = node.type === 'set_local_variable'
  const isLocalGetter = node.type === 'get_local_variable'
  const isSetter = isNodeGraphSetter || isCustomSetter || isLocalSetter
  const isGetter = isNodeGraphGetter || isCustomGetter || isLocalGetter

  if (isNodeGraphSetter || isNodeGraphGetter) {
    const nameArg = node.args?.[0]
    const variableName = nameArg?.type === 'str' ? nameArg.value : undefined
    const variable = variableName ? context.variablesByName.get(variableName) : undefined
    declaredType = variable ? fromVariable(variable) : undefined
    if (!variable) {
      recordFallback(context, {
        reason: 'missing-variable-declaration',
        nodeId: node.id,
        nodeType: node.type,
        variableName
      })
    }
    const assigned = inputs[1]?.type
    if (context.strictTypeChecks && declaredType && assigned && !sameType(declaredType, assigned)) {
      report(context, {
        code: 'E_TYPED_INPUT_CONFLICT',
        message: `declared variable type ${JSON.stringify(declaredType)} conflicts with assigned value ${JSON.stringify(assigned)} in ${context.scope.name}`,
        nodeId: node.id,
        nodeType: node.type,
        argIndex: 1
      })
    }
  }

  const typed = isNodeGraphGetter
    ? declaredType
    : isCustomGetter || isLocalGetter
      ? firstProducedType(node.id, context)
      : isCustomSetter
        ? inputs[2]?.type
        : isLocalSetter
          ? inputs[1]?.type
          : declaredType ?? inputs[1]?.type ?? inputs[2]?.type ?? inputs[0]?.type

  // set_or_add_key_value_pairs_to_dictionary：kv 变体由 dict 参数（或 key/value 参数）类型决定
  // （对齐 node_id.ts resolveGiaNodeId 的 set_or_add 分支语义；枚举键不带 Dict_ 前缀，
  //  如 Set_or_Add_Key_Value_Pairs_to_Dictionary__Int_Vec=995）
  if (node.type === 'set_or_add_key_value_pairs_to_dictionary') {
    const dictType = inputs[0]?.type
    const kvType =
      dictType?.kind === 'dict' && dictType.key.kind === 'scalar' && dictType.value.kind === 'scalar'
        ? { k: dictType.key, v: dictType.value }
        : undefined
    const fallbackK = inputs[1]?.type
    const fallbackV = inputs[2]?.type
    const kType = kvType?.k ?? (fallbackK?.kind === 'scalar' ? fallbackK : undefined)
    const vType = kvType?.v ?? (fallbackV?.kind === 'scalar' ? fallbackV : undefined)
    const kSuffix = kType ? (kType.name === 'vec3' ? 'vec' : kType.name) : undefined
    const vSuffix = vType ? (vType.name === 'vec3' ? 'vec' : vType.name) : undefined
    if (kSuffix && vSuffix) {
      const kvConcrete = nodeIds.get(`${lower}__${kSuffix}_${vSuffix}`)
      if (kvConcrete !== undefined) {
        return { logicalType: node.type, genericNodeId, concreteNodeId: kvConcrete }
      }
    }
  }
  const suffix = typed?.kind === 'scalar'
    ? typed.name === 'vec3' ? 'vec' : typed.name
    : typed?.kind === 'list' && typed.element.kind === 'scalar'
      ? `list_${typed.element.name === 'vec3' ? 'vec' : typed.element.name}`
      : typed?.kind === 'dict' && typed.key.kind === 'scalar' && typed.value.kind === 'scalar'
        ? `dict_${typed.key.name === 'vec3' ? 'vec' : typed.key.name}_${typed.value.name === 'vec3' ? 'vec' : typed.value.name}`
        : undefined
  if (!suffix) {
    if (typed && (isSetter || isGetter)) {
      recordFallback(context, {
        reason: 'unsupported-resolved-type',
        nodeId: node.id,
        nodeType: node.type
      })
    }
    return { logicalType: node.type, genericNodeId }
  }

  const concreteNodeId =
    nodeIds.get(`${lower}__${suffix}`) ??
    nodeIds.get(
      `${lower}__${suffix.replaceAll('_config_id', '_config').replaceAll('_prefab_id', '_prefab')}`
    )
  if (concreteNodeId === undefined && (isSetter || isGetter)) {
    recordFallback(context, {
      reason: 'missing-concrete-variant',
      nodeId: node.id,
      nodeType: node.type
    })
    report(context, {
      code: 'E_UNKNOWN_NODE_VARIANT',
      message: `missing concrete variant ${lower}__${suffix}`,
      nodeId: node.id,
      nodeType: node.type
    })
  }
  return { logicalType: node.type, genericNodeId, concreteNodeId }
}

const SHARED_SCALAR_SAME_TYPE_BINARY_NODE_TYPES = new Set([
  'addition',
  'subtraction',
  'multiplication',
  'division',
  'equal',
  'greater_than',
  'less_than',
  'greater_than_or_equal_to',
  'less_than_or_equal_to'
])

function resolveEnumerationsEqualEnumKey(
  node: ServerNode,
  inputs: ResolvedInput[]
): string | undefined {
  const primary = inputs[0]?.type
  if (primary?.kind !== 'enum') return undefined
  if (primary.enumName) {
    return enumKeyLowerFromEnumName(primary.enumName)
  }
  if (primary.enumValue) {
    try {
      const { enumId } = parseEnumValue(primary.enumValue, 0, node.type)
      return enumKeyLowerFromEnumId(enumId)
    } catch {
      return undefined
    }
  }
  return undefined
}

/**
 * Residual scalar families previously served only by composite
 * resolveImplOrdinaryConcreteNodeId (P5-W6 residual table; enumerations_equal is P5-W8).
 */
const SHARED_RESIDUAL_TYPED_SCALAR_NODE_TYPES = new Set([
  'exponentiation',
  'absolute_value_operation',
  'sign_operation',
  'range_limiting_operation',
  'take_larger_value',
  'take_smaller_value'
])

const SHARED_RESIDUAL_GENERIC_ONLY_SCALAR_NODE_TYPES = new Set([
  'modulo_operation',
  'logical_and_operation',
  'logical_or_operation',
  'logical_not_operation',
  'logical_xor_operation',
  'arithmetic_square_root_operation',
  'round_to_integer_operation'
])

const SHARED_RESIDUAL_SCALAR_NODE_TYPES = new Set([
  ...SHARED_RESIDUAL_TYPED_SCALAR_NODE_TYPES,
  ...SHARED_RESIDUAL_GENERIC_ONLY_SCALAR_NODE_TYPES
])

function resolveResidualScalarPrimaryType(
  nodeType: string,
  inputs: ResolvedInput[]
): ResolvedValueType | undefined {
  // range_limiting uses value/min/max; primary type is the value input.
  // unary residual ops use inputs[0]; binary residual ops use left when same-type.
  if (
    nodeType === 'take_larger_value' ||
    nodeType === 'take_smaller_value' ||
    nodeType === 'exponentiation' ||
    nodeType === 'modulo_operation' ||
    nodeType === 'logical_and_operation' ||
    nodeType === 'logical_or_operation' ||
    nodeType === 'logical_xor_operation'
  ) {
    const left = inputs[0]?.type
    const right = inputs[1]?.type
    if (
      left?.kind === 'scalar' &&
      right?.kind === 'scalar' &&
      left.name === right.name
    ) {
      return left
    }
    return left?.kind === 'scalar' ? left : undefined
  }
  return inputs[0]?.type
}

export function usesSharedVariantResolution(nodeType: string): boolean {
  return (
    nodeType === 'set_node_graph_variable' ||
    nodeType === 'get_node_graph_variable' ||
    nodeType === 'set_or_add_key_value_pairs_to_dictionary' ||
    nodeType === 'set_custom_variable' ||
    nodeType === 'get_custom_variable' ||
    nodeType === 'set_local_variable' ||
    nodeType === 'get_local_variable' ||
    SHARED_SCALAR_SAME_TYPE_BINARY_NODE_TYPES.has(nodeType) ||
    SHARED_RESIDUAL_SCALAR_NODE_TYPES.has(nodeType) ||
    nodeType === 'enumerations_equal' ||
    nodeType.startsWith('data_type_conversion_')
  )
}

export function usesSharedScalarSameTypeBinaryResolution(nodeType: string): boolean {
  return SHARED_SCALAR_SAME_TYPE_BINARY_NODE_TYPES.has(nodeType)
}

export function usesSharedResidualScalarResolution(nodeType: string): boolean {
  return SHARED_RESIDUAL_SCALAR_NODE_TYPES.has(nodeType)
}

export function usesSharedEnumerationsEqualResolution(nodeType: string): boolean {
  return nodeType === 'enumerations_equal'
}

export function usesSharedOrdinaryConcreteIdentity(nodeType: string): boolean {
  return (
    usesSharedScalarSameTypeBinaryResolution(nodeType) ||
    usesSharedResidualScalarResolution(nodeType) ||
    usesSharedEnumerationsEqualResolution(nodeType)
  )
}

export const SHARED_RESIDUAL_SCALAR_NODE_TYPE_LIST = [
  ...SHARED_RESIDUAL_SCALAR_NODE_TYPES
] as const
