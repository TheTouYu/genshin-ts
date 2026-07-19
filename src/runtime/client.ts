import type {
  ClientGraphInfo,
  ClientIRDocument,
  ClientNode,
  ClientValueHandle,
  ClientValueIR,
  ValueType
} from './IR.js'

export type SupportedClientGraphType = 'skill'

export type ClientGraphOptions = {
  type: SupportedClientGraphType
  id: number
  name?: string
}

type ClientLiteral =
  | boolean
  | number
  | string
  | readonly [number, number, number]

function isClientLiteral(value: unknown): value is ClientLiteral {
  return (
    typeof value === 'boolean' ||
    typeof value === 'number' ||
    typeof value === 'string' ||
    (Array.isArray(value) && value.length === 3 && value.every((item) => typeof item === 'number'))
  )
}

export type ClientListValue = ClientValueHandle & {
  readonly elementType: ValueType
  readonly elements: readonly (ClientLiteral | ClientValueHandle)[]
  readonly encoding: 'assembly-list'
}

export type ClientExecutionFlowFunctions = {
  sendSignalToServerNodeGraph(signalName: string, ...params: ClientLiteral[]): void
  getSelfEntity(): ClientValueHandle
  queryGuidByEntity(entity: ClientValueHandle): ClientValueHandle
  assemblyList(elementType: ValueType, elements: readonly (ClientLiteral | ClientValueHandle)[]): ClientListValue
  sendSignalToServerNodeGraphValues(signalName: string, params: readonly (ClientValueHandle | ClientLiteral | ClientListValue)[]): void
}

class ClientGraphRegistry {
  private readonly nodes: ClientNode[] = []
  private nextNodeId = 1
  private started = false
  private currentNodeId?: number

  private registerDataNode(type: string, valueType: ValueType, args: ClientValueIR[] = []): ClientValueHandle {
    const node: ClientNode = {
      id: this.nextNodeId++,
      type,
      clientValues: args,
      next: []
    }
    this.nodes.push(node)
    return Object.freeze({ __clientValue: true, type: valueType, nodeId: node.id, pinIndex: 0 })
  }

  constructor(private readonly options: ClientGraphOptions) {}

  start(): void {
    if (this.started) {
      throw new Error('[error] client graph onStart() can only be declared once')
    }
    this.started = true
    const node: ClientNode = {
      id: this.nextNodeId++,
      type: 'client_graph_begins'
    }
    this.nodes.push(node)
    this.currentNodeId = node.id
  }

  sendSignalToServerNodeGraph(signalName: string, params: ClientLiteral[]): void {
    if (!this.started || this.currentNodeId === undefined) {
      throw new Error('[error] client node calls are only available in g.client().onStart()')
    }
    if (!signalName) {
      throw new Error('[error] client signal name must not be empty')
    }
    const node: ClientNode = {
      id: this.nextNodeId++,
      type: 'send_signal_to_server_node_graph',
      signalRef: { name: signalName },
      clientValues: params.map((value) => ({
        kind: 'literal',
        type: (typeof value === 'number'
          ? 'float'
          : Array.isArray(value)
            ? 'vec3'
            : 'str') as 'bool' | 'float' | 'str' | 'vec3',
        value
      })),
      next: []
    }
    const previous = this.nodes[this.nodes.length - 1]
    previous.next = [{ node_id: node.id, target_index: 0 }]
    this.nodes.push(node)
    this.currentNodeId = node.id
  }

  getSelfEntity(): ClientValueHandle {
    return this.registerDataNode('get_self_entity', 'entity')
  }

  queryGuidByEntity(entityValue: ClientValueHandle): ClientValueHandle {
    if (entityValue.type !== 'entity') throw new Error('[error] queryGuidByEntity requires an entity value')
    return this.registerDataNode('query_guid_by_entity', 'guid', [{
      kind: 'conn',
      type: 'entity',
      node_id: entityValue.nodeId,
      index: entityValue.pinIndex
    }])
  }

  assemblyList(elementType: ValueType, elements: readonly (ClientLiteral | ClientValueHandle)[]): ClientListValue {
    if (elements.length > 10) throw new Error('[error] client assembly_list supports at most 10 elements')
    const elementValues = elements.map((value): ClientValueIR => typeof value === 'object' && value && '__clientValue' in value
      ? { kind: 'conn', type: value.type, node_id: value.nodeId, index: value.pinIndex }
      : { kind: 'literal', type: elementType.replace(/_list$/, '') as ValueType, value })
    const handle = this.registerDataNode(
      'assembly_list',
      `${elementType}_list` as ValueType,
      [{ kind: 'literal', type: 'int', value: elements.length }, ...elementValues]
    )
    const node = this.nodes.find((candidate) => candidate.id === handle.nodeId)
    if (node) {
      node.elementType = elementType
      node.elementCount = elements.length
      node.elementValues = elementValues
    }
    return Object.freeze({ ...handle, elementType, elements, encoding: 'assembly-list' as const })
  }

  sendSignalToServerGraphValues(signalName: string, params: readonly (ClientValueHandle | ClientLiteral | ClientListValue)[]): void {
    const values: ClientValueIR[] = params.map((value): ClientValueIR => typeof value === 'object' && value && '__clientValue' in value
      ? 'elements' in value
        ? {
            kind: 'list',
            encoding: value.encoding,
            elementType: value.elementType,
            node_id: value.nodeId,
            index: value.pinIndex,
            elements: value.elements.map((element): ClientValueIR => typeof element === 'object' && element && '__clientValue' in element
              ? { kind: 'conn', type: element.type, node_id: element.nodeId, index: element.pinIndex }
              : { kind: 'literal', type: typeof element === 'number' ? 'float' : Array.isArray(element) ? 'vec3' : typeof element as ValueType, value: element })
          }
        : { kind: 'conn', type: value.type, node_id: value.nodeId, index: value.pinIndex }
      : { kind: 'literal', type: typeof value === 'number' ? 'float' : Array.isArray(value) ? 'vec3' : typeof value as ValueType, value })
    const node: ClientNode = {
      id: this.nextNodeId++,
      type: 'send_signal_to_server_node_graph',
      signalRef: { name: signalName },
      clientValues: values,
      next: []
    }
    const previous = this.nodes[this.nodes.length - 1]
    previous.next = [{ node_id: node.id, target_index: 0 }]
    this.nodes.push(node)
    this.currentNodeId = node.id
  }

  toIR(): ClientIRDocument {
    const graph: ClientGraphInfo = {
      type: 'client',
      client_type: this.options.type,
      id: this.options.id,
      name: this.options.name
    }
    return {
      ir_version: 1,
      ir_type: 'node_graph',
      graph,
      nodes: this.nodes
    }
  }
}

const CLIENT_GRAPH_ID_MIN = 1082130432
const CLIENT_GRAPH_ID_MAX = 1082169753
const clientRegistries: ClientGraphRegistry[] = []

export function hasClientGraphRegistries(): boolean {
  return clientRegistries.length > 0
}

function validateClientGraphId(id: number): void {
  if (!Number.isInteger(id) || id < CLIENT_GRAPH_ID_MIN || id > CLIENT_GRAPH_ID_MAX) {
    throw new Error(
      `[error] client graph id must be an integer in ${CLIENT_GRAPH_ID_MIN}..${CLIENT_GRAPH_ID_MAX}`
    )
  }
  if (clientRegistries.some((registry) => registry.toIR().graph.id === id)) {
    throw new Error(`[error] duplicate client graph id: ${id}`)
  }
}

export function createClientGraph(options: ClientGraphOptions) {
  if (clientRegistries.length > 0) {
    throw new Error('[error] only one client graph may be declared per entry file')
  }
  validateClientGraphId(options.id)
  const registry = new ClientGraphRegistry(options)
  clientRegistries.push(registry)
  return {
    onStart(handler: (f: ClientExecutionFlowFunctions) => void) {
      registry.start()
      const f: ClientExecutionFlowFunctions = {
        sendSignalToServerNodeGraph(signalName, ...params) {
          if (params.some((param) => !isClientLiteral(param))) {
            throw new Error('[error] unsupported client literal parameter')
          }
          registry.sendSignalToServerNodeGraph(signalName, params)
        },
        getSelfEntity: () => registry.getSelfEntity(),
        queryGuidByEntity: (entity) => registry.queryGuidByEntity(entity),
        assemblyList: (elementType, elements) => registry.assemblyList(elementType, elements),
        sendSignalToServerNodeGraphValues: (signalName, params) =>
          registry.sendSignalToServerGraphValues(signalName, params)
      }
      handler(f)
      return this
    }
  }
}

export function buildClientGraphRegistriesIRDocuments(): ClientIRDocument[] {
  return clientRegistries.map((registry) => registry.toIR())
}

export function resetClientGraphRegistriesForTest(): void {
  clientRegistries.length = 0
}

export { CLIENT_GRAPH_ID_MIN, CLIENT_GRAPH_ID_MAX }
