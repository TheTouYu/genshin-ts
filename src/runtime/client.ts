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
  getEntityPosition(entity: ClientValueHandle): ClientValueHandle
  getEntityRotation(entity: ClientValueHandle): ClientValueHandle
  findEntityByGuid(guid: ClientValueHandle): ClientValueHandle
  getCharacterEntity(player: ClientValueHandle): ClientValueHandle
  getTargetEntity(): ClientValueHandle
  getAttackTarget(entity: ClientValueHandle): ClientValueHandle
  getTargetAttachmentPointLocation(entity: ClientValueHandle, name: string): ClientValueHandle
  getTargetAttachmentPointRotation(entity: ClientValueHandle, name: string): ClientValueHandle
  getCurrentCharacter(): ClientValueHandle
  queryIfSelfIsInCombat(): ClientValueHandle
  queryIfEntityIsInCombat(entity: ClientValueHandle): ClientValueHandle
  queryIfEntityIsOnField(entity: ClientValueHandle): ClientValueHandle
  getOwnerPlayer(character: ClientValueHandle): ClientValueHandle
  dotVector3(a: ClientValueHandle | ClientLiteral, b: ClientValueHandle | ClientLiteral): ClientValueHandle
  crossVector3(a: ClientValueHandle | ClientLiteral, b: ClientValueHandle | ClientLiteral): ClientValueHandle
  splitVector3(vector: ClientValueHandle | ClientLiteral): {
    x: ClientValueHandle
    y: ClientValueHandle
    z: ClientValueHandle
  }
  scaleVector3(scale: ClientValueHandle | ClientLiteral, vector: ClientValueHandle | ClientLiteral): ClientValueHandle
  angleBetweenVector3(a: ClientValueHandle | ClientLiteral, b: ClientValueHandle | ClientLiteral): ClientValueHandle
  rotateVector3(vector: ClientValueHandle | ClientLiteral, rotation: ClientValueHandle | ClientLiteral): ClientValueHandle
  vector3Length(vector: ClientValueHandle | ClientLiteral): ClientValueHandle
  createVector3(x: ClientValueHandle | ClientLiteral, y: ClientValueHandle | ClientLiteral, z: ClientValueHandle | ClientLiteral): ClientValueHandle
  normalizeVector3(vector: ClientValueHandle | ClientLiteral): ClientValueHandle
  directionVectorToRotation(forward: ClientValueHandle | ClientLiteral, up: ClientValueHandle | ClientLiteral): ClientValueHandle
  assemblyList(elementType: ValueType, elements: readonly (ClientLiteral | ClientValueHandle)[]): ClientListValue
  sendSignalToServerNodeGraphValues(signalName: string, params: readonly (ClientValueHandle | ClientLiteral | ClientListValue)[]): void
}

class ClientGraphRegistry {
  private readonly nodes: ClientNode[] = []
  private nextNodeId = 1
  private started = false
  private currentNodeId?: number

  private registerDataNode(type: string, valueType: ValueType, args: ClientValueIR[] = [], outputCount = 1): any {
    const node: ClientNode = {
      id: this.nextNodeId++,
      type,
      clientValues: args,
      next: []
    }
    this.nodes.push(node)
    if (outputCount === 3) {
      return Object.freeze({
        x: { __clientValue: true as const, type: 'float' as const, nodeId: node.id, pinIndex: 0 },
        y: { __clientValue: true as const, type: 'float' as const, nodeId: node.id, pinIndex: 1 },
        z: { __clientValue: true as const, type: 'float' as const, nodeId: node.id, pinIndex: 2 }
      })
    }
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

  getEntityPosition(entityValue: ClientValueHandle): ClientValueHandle {
    return this.registerEntityQuery('get_entity_position', 'vec3', entityValue, 'getEntityPosition')
  }

  getEntityRotation(entityValue: ClientValueHandle): ClientValueHandle {
    return this.registerEntityQuery('get_entity_rotation', 'vec3', entityValue, 'getEntityRotation')
  }

  findEntityByGuid(guidValue: ClientValueHandle): ClientValueHandle {
    if (guidValue.type !== 'guid') throw new Error('[error] findEntityByGuid requires a guid value')
    return this.registerDataNode('find_entity_by_guid', 'entity', [{ kind: 'conn', type: 'guid', node_id: guidValue.nodeId, index: guidValue.pinIndex }])
  }

  getCharacterEntity(playerValue: ClientValueHandle): ClientValueHandle {
    return this.registerEntityQuery('get_character_entity', 'entity', playerValue, 'getCharacterEntity')
  }

  getTargetEntity(): ClientValueHandle {
    return this.registerDataNode('get_target_entity', 'entity')
  }

  getAttackTarget(entityValue: ClientValueHandle): ClientValueHandle {
    return this.registerEntityQuery('get_attack_target', 'entity', entityValue, 'getAttackTarget')
  }

  getTargetAttachmentPointLocation(entityValue: ClientValueHandle, name: string): ClientValueHandle {
    return this.registerEntityStringQuery('get_attachment_location', 'vec3', entityValue, name, 'getTargetAttachmentPointLocation')
  }

  getTargetAttachmentPointRotation(entityValue: ClientValueHandle, name: string): ClientValueHandle {
    return this.registerEntityStringQuery('get_attachment_rotation', 'vec3', entityValue, name, 'getTargetAttachmentPointRotation')
  }

  getCurrentCharacter(): ClientValueHandle {
    return this.registerDataNode('get_current_character', 'entity')
  }

  queryIfSelfIsInCombat(): ClientValueHandle {
    return this.registerDataNode('query_self_in_combat', 'bool')
  }

  queryIfEntityIsInCombat(entityValue: ClientValueHandle): ClientValueHandle {
    return this.registerEntityQuery('query_entity_in_combat', 'bool', entityValue, 'queryIfEntityIsInCombat')
  }

  queryIfEntityIsOnField(entityValue: ClientValueHandle): ClientValueHandle {
    return this.registerEntityQuery('query_entity_on_field', 'bool', entityValue, 'queryIfEntityIsOnField')
  }

  getOwnerPlayer(characterValue: ClientValueHandle): ClientValueHandle {
    return this.registerEntityQuery('get_owner_player', 'entity', characterValue, 'getOwnerPlayer')
  }

  private clientMathValue(value: ClientValueHandle | ClientLiteral, type: ValueType): ClientValueIR {
    return typeof value === 'object' && value && '__clientValue' in value
      ? { kind: 'conn', type: value.type, node_id: value.nodeId, index: value.pinIndex }
      : { kind: 'literal', type, value }
  }

  private registerMathNode(type: string, outputType: ValueType, args: readonly [ClientValueHandle | ClientLiteral, ValueType][], outputCount = 1): any {
    return this.registerDataNode(type, outputType, args.map(([value, valueType]) => this.clientMathValue(value, valueType)), outputCount)
  }

  dotVector3(a: ClientValueHandle | ClientLiteral, b: ClientValueHandle | ClientLiteral): ClientValueHandle {
    return this.registerMathNode('dot_vector3', 'float', [[a, 'vec3'], [b, 'vec3']])
  }

  crossVector3(a: ClientValueHandle | ClientLiteral, b: ClientValueHandle | ClientLiteral): ClientValueHandle {
    return this.registerMathNode('cross_vector3', 'vec3', [[a, 'vec3'], [b, 'vec3']])
  }

  splitVector3(vector: ClientValueHandle | ClientLiteral) {
    return this.registerMathNode('split_vector3', 'float', [[vector, 'vec3']], 3)
  }

  scaleVector3(scale: ClientValueHandle | ClientLiteral, vector: ClientValueHandle | ClientLiteral): ClientValueHandle {
    return this.registerMathNode('scale_vector3', 'vec3', [[scale, 'float'], [vector, 'vec3']])
  }

  angleBetweenVector3(a: ClientValueHandle | ClientLiteral, b: ClientValueHandle | ClientLiteral): ClientValueHandle {
    return this.registerMathNode('angle_vector3', 'float', [[a, 'vec3'], [b, 'vec3']])
  }

  rotateVector3(vector: ClientValueHandle | ClientLiteral, rotation: ClientValueHandle | ClientLiteral): ClientValueHandle {
    return this.registerMathNode('rotate_vector3', 'vec3', [[vector, 'vec3'], [rotation, 'vec3']])
  }

  vector3Length(vector: ClientValueHandle | ClientLiteral): ClientValueHandle {
    return this.registerMathNode('length_vector3', 'float', [[vector, 'vec3']])
  }

  createVector3(x: ClientValueHandle | ClientLiteral, y: ClientValueHandle | ClientLiteral, z: ClientValueHandle | ClientLiteral): ClientValueHandle {
    return this.registerMathNode('create_vector3', 'vec3', [[x, 'float'], [y, 'float'], [z, 'float']])
  }

  normalizeVector3(vector: ClientValueHandle | ClientLiteral): ClientValueHandle {
    return this.registerMathNode('normalize_vector3', 'vec3', [[vector, 'vec3']])
  }

  directionVectorToRotation(forward: ClientValueHandle | ClientLiteral, up: ClientValueHandle | ClientLiteral): ClientValueHandle {
    return this.registerMathNode('direction_to_rotation', 'vec3', [[forward, 'vec3'], [up, 'vec3']])
  }

  private registerEntityQuery(
    nodeType: string,
    outputType: ValueType,
    entityValue: ClientValueHandle,
    methodName: string
  ): ClientValueHandle {
    if (entityValue.type !== 'entity') throw new Error(`[error] ${methodName} requires an entity value`)
    return this.registerDataNode(nodeType, outputType, [{
      kind: 'conn',
      type: 'entity',
      node_id: entityValue.nodeId,
      index: entityValue.pinIndex
    }])
  }

  private registerEntityStringQuery(
    nodeType: string,
    outputType: ValueType,
    entityValue: ClientValueHandle,
    name: string,
    methodName: string
  ): ClientValueHandle {
    if (entityValue.type !== 'entity') throw new Error(`[error] ${methodName} requires an entity value`)
    if (!name) throw new Error(`[error] ${methodName} requires a non-empty attachment point name`)
    return this.registerDataNode(nodeType, outputType, [
      { kind: 'conn', type: 'entity', node_id: entityValue.nodeId, index: entityValue.pinIndex },
      { kind: 'literal', type: 'str', value: name }
    ])
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
        getEntityPosition: (entity) => registry.getEntityPosition(entity),
        getEntityRotation: (entity) => registry.getEntityRotation(entity),
        findEntityByGuid: (guid) => registry.findEntityByGuid(guid),
        getCharacterEntity: (player) => registry.getCharacterEntity(player),
        getTargetEntity: () => registry.getTargetEntity(),
        getAttackTarget: (entity) => registry.getAttackTarget(entity),
        getTargetAttachmentPointLocation: (entity, name) => registry.getTargetAttachmentPointLocation(entity, name),
        getTargetAttachmentPointRotation: (entity, name) => registry.getTargetAttachmentPointRotation(entity, name),
        getCurrentCharacter: () => registry.getCurrentCharacter(),
        queryIfSelfIsInCombat: () => registry.queryIfSelfIsInCombat(),
        queryIfEntityIsInCombat: (entity) => registry.queryIfEntityIsInCombat(entity),
        queryIfEntityIsOnField: (entity) => registry.queryIfEntityIsOnField(entity),
        getOwnerPlayer: (character) => registry.getOwnerPlayer(character),
        dotVector3: (a, b) => registry.dotVector3(a, b),
        crossVector3: (a, b) => registry.crossVector3(a, b),
        splitVector3: (vector) => registry.splitVector3(vector),
        scaleVector3: (scale, vector) => registry.scaleVector3(scale, vector),
        angleBetweenVector3: (a, b) => registry.angleBetweenVector3(a, b),
        rotateVector3: (vector, rotation) => registry.rotateVector3(vector, rotation),
        vector3Length: (vector) => registry.vector3Length(vector),
        createVector3: (x, y, z) => registry.createVector3(x, y, z),
        normalizeVector3: (vector) => registry.normalizeVector3(vector),
        directionVectorToRotation: (forward, up) => registry.directionVectorToRotation(forward, up),
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
