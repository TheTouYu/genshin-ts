import type {
  Argument,
  ServerGraphMode,
  ServerNode,
  ValueType,
  Variable
} from '../../runtime/IR.js'
import type { DictKeyType, DictValueType } from '../../runtime/value.js'
import { SPECIAL_NODE_MAPPINGS, getNodeIdLowerMap } from './mappings.js'
import type { ConnTypeIndex, ConnTypeInfo } from './node_id.js'

export type ResolvedValueType =
  | { kind: 'scalar'; name: Exclude<ValueType, 'dict' | 'enum' | 'enumeration' | 'local_variable'> }
  | { kind: 'list'; element: ResolvedValueType }
  | { kind: 'dict'; key: ResolvedValueType; value: ResolvedValueType }
  | { kind: 'enum'; enumName?: string }
  | { kind: 'local-variable'; value?: ResolvedValueType }

export type GraphCompileContext = {
  scope: { kind: 'root' | 'composite-impl'; name: string }
  mode?: ServerGraphMode
  variablesByName: Map<string, Variable>
  connectionTypes: ConnTypeIndex
  diagnostics?: Diagnostic[]
}

export type Diagnostic = {
  code: 'E_TYPED_INPUT_CONFLICT' | 'E_UNRESOLVED_VALUE_TYPE' | 'E_UNKNOWN_NODE_VARIANT'
  message: string
  nodeId?: number
  nodeType?: string
  argIndex?: number
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

function scalarType(type: string): ResolvedValueType | undefined {
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
  if (arg.type === 'enum' || arg.type === 'enumeration') return { kind: 'enum' }
  if (arg.type === 'local_variable') return { kind: 'local-variable' }
  return scalarType(arg.type)
}

function sameType(a: ResolvedValueType, b: ResolvedValueType): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

function report(context: GraphCompileContext, diagnostic: Diagnostic): never {
  context.diagnostics?.push(diagnostic)
  throw new Error(`[error] ${diagnostic.code}: ${diagnostic.message}`)
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
  const genericNodeId = nodeIds.get(lower) ?? nodeIds.get(`${lower}__generic`)
  if (genericNodeId === undefined) {
    report(context, {
      code: 'E_UNKNOWN_NODE_VARIANT',
      message: `unknown generic node identity for ${node.type}`,
      nodeId: node.id,
      nodeType: node.type
    })
  }

  let declaredType: ResolvedValueType | undefined
  if (node.type === 'set_node_graph_variable' || node.type === 'set_custom_variable') {
    const nameArg = node.args?.[0]
    const variableName = nameArg?.type === 'str' ? nameArg.value : undefined
    const variable = variableName ? context.variablesByName.get(variableName) : undefined
    declaredType = variable ? fromVariable(variable) : undefined
    const assigned = inputs[1]?.type ?? inputs[2]?.type
    if (declaredType && assigned && !sameType(declaredType, assigned)) {
      report(context, {
        code: 'E_TYPED_INPUT_CONFLICT',
        message: `declared variable type conflicts with assigned value in ${context.scope.name}`,
        nodeId: node.id,
        nodeType: node.type,
        argIndex: 1
      })
    }
  }

  const typed = (declaredType ?? inputs[1]?.type ?? inputs[0]?.type)
  const suffix = typed?.kind === 'scalar'
    ? typed.name === 'vec3' ? 'vec' : typed.name
    : typed?.kind === 'list' && typed.element.kind === 'scalar'
      ? `list_${typed.element.name === 'vec3' ? 'vec' : typed.element.name}`
      : undefined
  if (!suffix) return { logicalType: node.type, genericNodeId }

  const concreteNodeId = nodeIds.get(`${lower}__${suffix}`)
  if (concreteNodeId === undefined && (node.type === 'set_node_graph_variable' || node.type === 'set_custom_variable')) {
    report(context, {
      code: 'E_UNKNOWN_NODE_VARIANT',
      message: `missing concrete variant ${lower}__${suffix}`,
      nodeId: node.id,
      nodeType: node.type
    })
  }
  return { logicalType: node.type, genericNodeId, concreteNodeId }
}
