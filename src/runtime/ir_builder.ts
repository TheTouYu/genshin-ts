import type { ExecutionFlow, IRBuildInput } from './execution_flow_types.js'
import type {
  Argument,
  ConnectionArgument,
  IRDocument,
  NextConnection,
  ServerNode,
  ValueType
} from './IR.js'
import type { MetaCallRecord } from './meta_call_types.js'
import {
  bool,
  configId,
  customVariableSnapshot,
  dict,
  DictKeyType,
  DictValueType,
  entity,
  enumeration,
  faction,
  float,
  generic,
  guid,
  int,
  list,
  localVariable,
  prefabId,
  str,
  struct,
  value,
  ValueMetadata,
  vec3
} from './value.js'

function camelToSnake(s: string): string {
  return s.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`).replace(/^_/, '')
}

function buildConnValueType(arg: value): {
  type: ValueType
  enum?: string
  dict?: { k: DictKeyType; v: DictValueType }
} {
  if (arg instanceof bool) return { type: 'bool' }
  if (arg instanceof int) return { type: 'int' }
  if (arg instanceof float) return { type: 'float' }
  if (arg instanceof str) return { type: 'str' }
  if (arg instanceof vec3) return { type: 'vec3' }
  if (arg instanceof guid) return { type: 'guid' }
  if (arg instanceof entity) return { type: 'entity' }
  if (arg instanceof prefabId) return { type: 'prefab_id' }
  if (arg instanceof configId) return { type: 'config_id' }
  if (arg instanceof faction) return { type: 'faction' }
  if (arg instanceof struct) return { type: 'struct' }
  if (arg instanceof localVariable) return { type: 'local_variable' }
  if (arg instanceof customVariableSnapshot) return { type: 'custom_variable_snapshot' }
  if (arg instanceof enumeration) return { type: 'enum', enum: camelToSnake(arg.getClassName()) }

  if (arg instanceof list) {
    const t = `${arg.getConcreteType()}_list` as ValueType
    return { type: t }
  }

  if (arg instanceof dict) {
    return {
      type: 'dict',
      dict: {
        k: arg.getKeyType() as DictKeyType,
        v: arg.getValueType() as DictValueType
      }
    }
  }

  if (arg instanceof generic) {
    const t = arg.getConcreteType()
    if (!t) {
      throw new Error(
        '[error] generic connection value has no concrete type (call asType()/asDict() first)'
      )
    }
    if (t !== 'dict') return { type: t }
    const k = arg.getDictKeyType()
    const v = arg.getDictValueType()
    if (!k || !v) {
      throw new Error(
        '[error] generic(dict) connection value missing dict key/value type (call asDict() first)'
      )
    }
    return { type: 'dict', dict: { k, v } }
  }

  throw new Error(
    `[error] unsupported connection value type: ${arg.constructor?.name ?? 'unknown'}`
  )
}

function buildConnectionArgument(meta: ValueMetadata, arg: value): ConnectionArgument | null {
  if (meta.kind !== 'pin') return null
  const { type, dict, enum: enumName } = buildConnValueType(arg)
  return {
    type: 'conn',
    value: {
      node_id: meta.record.id,
      index: meta.pinIndex,
      type,
      enum: enumName,
      dict
    }
  }
}

function buildArgument(record: MetaCallRecord, arg: value, argIndex: number): Argument {
  const compositeInputIndex = record.compositeInputIndices?.[argIndex]
  const withCompositeInputIndex = (argument: Argument): Argument => {
    if (compositeInputIndex === undefined || argument === null) return argument
    return { ...(argument as Record<string, unknown>), compositeInputIndex } as unknown as Argument
  }

  const meta = arg.getMetadata()
  if (!meta)
    throw new Error(
      `Error in ${record.nodeType} - Value has no metadata: ${JSON.stringify(arg.toIRLiteral())}`
    )
  const conn = buildConnectionArgument(meta, arg)
  if (conn) return withCompositeInputIndex(conn)

  return withCompositeInputIndex(arg.toIRLiteral())
}

type NodeBuilder = (record: MetaCallRecord, next?: NextConnection[]) => ServerNode

const buildDefaultNode: NodeBuilder = (record, next) => {
  const node: ServerNode = {
    id: record.id,
    type: record.nodeType
  }
  const args = record.args.map((arg, index) => buildArgument(record, arg, index))
  if (args.length) node.args = args
  if (next?.length) node.next = next
  return node
}

const buildBreakLoopNode: NodeBuilder = (record, next) => {
  const node: ServerNode = {
    id: record.id,
    type: record.nodeType
  }

  const out: NextConnection[] = []
  // break_loop has no exec output; only connect to loop break input pins.
  // if (next?.length) out.push(...next)

  for (const arg of record.args) {
    const lit = arg.toIRLiteral()
    if (!lit) continue
    if (lit.type !== 'int' || typeof lit.value !== 'number') {
      throw new Error(`Error in break_loop - Invalid loop node id literal: ${JSON.stringify(lit)}`)
    }
    out.push({ node_id: lit.value, target_index: 1 })
  }

  if (out.length) node.next = out
  return node
}

const NODE_BUILDERS: Record<string, NodeBuilder> = {
  break_loop: buildBreakLoopNode
}

function buildNodeFromRecord(record: MetaCallRecord, next?: NextConnection[]): ServerNode {
  const builder = NODE_BUILDERS[record.nodeType] ?? buildDefaultNode
  return builder(record, next)
}

function buildNodesFromFlow(flow: ExecutionFlow): ServerNode[] {
  // __bootstrap__ 流：仅用于搭建执行上下文（如 stage 初始化），
  // 不产生实际 IR 节点。当 removeUnusedNodes=false 时仍需此处跳过，
  // 防止引导节点污染 GIA 输出。
  if (flow.eventNode.nodeType === '__bootstrap__') return []

  const nodes: ServerNode[] = []

  const getNext = (id: number) => flow.edges[id]

  nodes.push(buildNodeFromRecord(flow.eventNode, getNext(flow.eventNode.id)))

  flow.execNodes.forEach((execNode) => {
    nodes.push(buildNodeFromRecord(execNode, getNext(execNode.id)))
  })

  flow.dataNodes.forEach((dataNode) => {
    nodes.push(buildNodeFromRecord(dataNode))
  })

  return nodes
}

export function buildIRDocument(input: IRBuildInput): IRDocument {
  const nodes = input.flows.flatMap(buildNodesFromFlow)

  return {
    ir_version: 1,
    ir_type: 'node_graph',
    graph: {
      type: 'server',
      mode: input.serverMode ?? 'beyond',
      sub_type: input.serverSubType ?? 'entity',
      id: input.graphId,
      name: input.graphName
    },
    variables: input.variables,
    nodes
  }
}
