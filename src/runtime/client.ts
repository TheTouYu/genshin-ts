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
  getAllPlayers(): ClientValueHandle
  getPresetStatus(entity: ClientValueHandle, status: ClientValueHandle | ClientLiteral): ClientValueHandle
  getEntityFaction(entity: ClientValueHandle): ClientValueHandle
  getEntityTags(entity: ClientValueHandle): ClientValueHandle
  getEntitiesByTag(tag: ClientValueHandle | ClientLiteral): ClientValueHandle
  getAggroTarget(entity: ClientValueHandle): ClientValueHandle
  getAggroList(entity: ClientValueHandle): ClientValueHandle
  isFactionHostile(a: ClientValueHandle | ClientLiteral, b: ClientValueHandle | ClientLiteral): ClientValueHandle
  isEntityActive(entity: ClientValueHandle): ClientValueHandle
  getOverlappingEntities(entity: ClientValueHandle, relation: ClientValueHandle | ClientLiteral): ClientValueHandle
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
  booleanAnd(a: ClientValueHandle | ClientLiteral, b: ClientValueHandle | ClientLiteral): ClientValueHandle
  booleanOr(a: ClientValueHandle | ClientLiteral, b: ClientValueHandle | ClientLiteral): ClientValueHandle
  booleanNot(value: ClientValueHandle | ClientLiteral): ClientValueHandle
  booleanXor(a: ClientValueHandle | ClientLiteral, b: ClientValueHandle | ClientLiteral): ClientValueHandle
  sine(value: ClientValueHandle | ClientLiteral): ClientValueHandle
  cosine(value: ClientValueHandle | ClientLiteral): ClientValueHandle
  tangent(value: ClientValueHandle | ClientLiteral): ClientValueHandle
  arcsine(value: ClientValueHandle | ClientLiteral): ClientValueHandle
  arccosine(value: ClientValueHandle | ClientLiteral): ClientValueHandle
  arctangent(value: ClientValueHandle | ClientLiteral): ClientValueHandle
  radiansToDegrees(value: ClientValueHandle | ClientLiteral): ClientValueHandle
  degreesToRadians(value: ClientValueHandle | ClientLiteral): ClientValueHandle
  equalInt(a: ClientValueHandle | ClientLiteral, b: ClientValueHandle | ClientLiteral): ClientValueHandle
  greaterThanInt(a: ClientValueHandle | ClientLiteral, b: ClientValueHandle | ClientLiteral): ClientValueHandle
  lessThanInt(a: ClientValueHandle | ClientLiteral, b: ClientValueHandle | ClientLiteral): ClientValueHandle
  lessThanOrEqualInt(a: ClientValueHandle | ClientLiteral, b: ClientValueHandle | ClientLiteral): ClientValueHandle
  greaterThanOrEqualInt(a: ClientValueHandle | ClientLiteral, b: ClientValueHandle | ClientLiteral): ClientValueHandle
  addInt(a: ClientValueHandle | ClientLiteral, b: ClientValueHandle | ClientLiteral): ClientValueHandle
  subtractInt(a: ClientValueHandle | ClientLiteral, b: ClientValueHandle | ClientLiteral): ClientValueHandle
  multiplyInt(a: ClientValueHandle | ClientLiteral, b: ClientValueHandle | ClientLiteral): ClientValueHandle
  divideInt(a: ClientValueHandle | ClientLiteral, b: ClientValueHandle | ClientLiteral): ClientValueHandle
  absoluteInt(value: ClientValueHandle | ClientLiteral): ClientValueHandle
  listLength(list: ClientListValue): ClientValueHandle
  listIncludes(value: ClientValueHandle | ClientLiteral, list: ClientListValue): ClientValueHandle
  listMaximum(list: ClientListValue): ClientValueHandle
  listMinimum(list: ClientListValue): ClientValueHandle
  filterEntitiesInSphere(radius: ClientValueHandle | ClientLiteral, center: ClientValueHandle | ClientLiteral, relation: ClientValueHandle | ClientLiteral): ClientValueHandle
  filterEntitiesInSquare(x: ClientValueHandle | ClientLiteral, y: ClientValueHandle | ClientLiteral, z: ClientValueHandle | ClientLiteral, center: ClientValueHandle | ClientLiteral, relation: ClientValueHandle | ClientLiteral): ClientValueHandle
  getScannedEntity(): ClientValueHandle
  getScannableEntities(): ClientValueHandle
  getActiveScanTags(entity: ClientValueHandle): ClientValueHandle
  randomInt(a: ClientValueHandle | ClientLiteral, b: ClientValueHandle | ClientLiteral): ClientValueHandle
  assemblyList(elementType: ValueType, elements: readonly (ClientLiteral | ClientValueHandle)[]): ClientListValue
  sendSignalToServerNodeGraphValues(signalName: string, params: readonly (ClientValueHandle | ClientLiteral | ClientListValue | undefined)[]): void
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

  getAllPlayers(): ClientValueHandle {
    return this.registerDataNode('get_all_players', 'entity_list')
  }

  getPresetStatus(entity: ClientValueHandle, status: ClientValueHandle | ClientLiteral): ClientValueHandle {
    return this.registerQueryWithArgs('get_preset_status', 'int', [entity, status], ['entity', 'int'])
  }

  getEntityFaction(entity: ClientValueHandle): ClientValueHandle {
    return this.registerEntityQuery('get_entity_faction', 'faction', entity, 'getEntityFaction')
  }

  getEntityTags(entity: ClientValueHandle): ClientValueHandle {
    return this.registerEntityQuery('get_entity_tags', 'int_list', entity, 'getEntityTags')
  }

  getEntitiesByTag(tag: ClientValueHandle | ClientLiteral): ClientValueHandle {
    return this.registerQueryWithArgs('get_entities_by_tag', 'entity_list', [tag], ['int'])
  }

  getAggroTarget(entity: ClientValueHandle): ClientValueHandle {
    return this.registerEntityQuery('get_aggro_target', 'entity', entity, 'getAggroTarget')
  }

  getAggroList(entity: ClientValueHandle): ClientValueHandle {
    return this.registerEntityQuery('get_aggro_list', 'entity_list', entity, 'getAggroList')
  }

  isFactionHostile(a: ClientValueHandle | ClientLiteral, b: ClientValueHandle | ClientLiteral): ClientValueHandle {
    return this.registerMathNode('is_faction_hostile', 'bool', [[a, 'faction'], [b, 'faction']])
  }

  isEntityActive(entity: ClientValueHandle): ClientValueHandle {
    return this.registerEntityQuery('is_entity_active', 'bool', entity, 'isEntityActive')
  }

  getOverlappingEntities(entity: ClientValueHandle, relation: ClientValueHandle | ClientLiteral): ClientValueHandle {
    return this.registerQueryWithArgs('get_overlapping_entities', 'entity_list', [entity, relation], ['entity', 'int'])
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

  booleanAnd(a: ClientValueHandle | ClientLiteral, b: ClientValueHandle | ClientLiteral): ClientValueHandle {
    return this.registerMathNode('boolean_and', 'bool', [[a, 'bool'], [b, 'bool']])
  }

  booleanOr(a: ClientValueHandle | ClientLiteral, b: ClientValueHandle | ClientLiteral): ClientValueHandle {
    return this.registerMathNode('boolean_or', 'bool', [[a, 'bool'], [b, 'bool']])
  }

  booleanNot(value: ClientValueHandle | ClientLiteral): ClientValueHandle {
    return this.registerMathNode('boolean_not', 'bool', [[value, 'bool']])
  }

  booleanXor(a: ClientValueHandle | ClientLiteral, b: ClientValueHandle | ClientLiteral): ClientValueHandle {
    return this.registerMathNode('boolean_xor', 'bool', [[a, 'bool'], [b, 'bool']])
  }

  sine(value: ClientValueHandle | ClientLiteral): ClientValueHandle {
    return this.registerMathNode('sine', 'float', [[value, 'float']])
  }

  cosine(value: ClientValueHandle | ClientLiteral): ClientValueHandle {
    return this.registerMathNode('cosine', 'float', [[value, 'float']])
  }

  tangent(value: ClientValueHandle | ClientLiteral): ClientValueHandle {
    return this.registerMathNode('tangent', 'float', [[value, 'float']])
  }

  arcsine(value: ClientValueHandle | ClientLiteral): ClientValueHandle {
    return this.registerMathNode('arcsine', 'float', [[value, 'float']])
  }

  arccosine(value: ClientValueHandle | ClientLiteral): ClientValueHandle {
    return this.registerMathNode('arccosine', 'float', [[value, 'float']])
  }

  arctangent(value: ClientValueHandle | ClientLiteral): ClientValueHandle {
    return this.registerMathNode('arctangent', 'float', [[value, 'float']])
  }

  radiansToDegrees(value: ClientValueHandle | ClientLiteral): ClientValueHandle {
    return this.registerMathNode('radians_to_degrees', 'float', [[value, 'float']])
  }

  degreesToRadians(value: ClientValueHandle | ClientLiteral): ClientValueHandle {
    return this.registerMathNode('degrees_to_radians', 'float', [[value, 'float']])
  }

  private registerVariantNode(type: string, outputType: ValueType, concrete: number, values: readonly (ClientValueHandle | ClientLiteral)[], inputType: ValueType): ClientValueHandle {
    const result = this.registerDataNode(type, outputType, values.map((value) => this.clientMathValue(value, inputType)))
    const node = this.nodes.find((candidate) => candidate.id === result.nodeId)
    if (node) node.clientValues = [{ kind: 'literal', type: 'int', value: concrete }, ...(node.clientValues ?? [])]
    return result
  }

  equalInt(a: ClientValueHandle | ClientLiteral, b: ClientValueHandle | ClientLiteral) { return this.registerVariantNode('equal_int', 'bool', 12, [a, b], 'int') }
  greaterThanInt(a: ClientValueHandle | ClientLiteral, b: ClientValueHandle | ClientLiteral) { return this.registerVariantNode('greater_than_int', 'bool', 12, [a, b], 'int') }
  lessThanInt(a: ClientValueHandle | ClientLiteral, b: ClientValueHandle | ClientLiteral) { return this.registerVariantNode('less_than_int', 'bool', 12, [a, b], 'int') }
  lessThanOrEqualInt(a: ClientValueHandle | ClientLiteral, b: ClientValueHandle | ClientLiteral) { return this.registerVariantNode('less_equal_int', 'bool', 12, [a, b], 'int') }
  greaterThanOrEqualInt(a: ClientValueHandle | ClientLiteral, b: ClientValueHandle | ClientLiteral) { return this.registerVariantNode('greater_equal_int', 'bool', 12, [a, b], 'int') }
  addInt(a: ClientValueHandle | ClientLiteral, b: ClientValueHandle | ClientLiteral) { return this.registerVariantNode('add_int', 'int', 30, [a, b], 'int') }
  subtractInt(a: ClientValueHandle | ClientLiteral, b: ClientValueHandle | ClientLiteral) { return this.registerVariantNode('subtract_int', 'int', 30, [a, b], 'int') }
  multiplyInt(a: ClientValueHandle | ClientLiteral, b: ClientValueHandle | ClientLiteral) { return this.registerVariantNode('multiply_int', 'int', 30, [a, b], 'int') }
  divideInt(a: ClientValueHandle | ClientLiteral, b: ClientValueHandle | ClientLiteral) { return this.registerVariantNode('divide_int', 'int', 30, [a, b], 'int') }
  absoluteInt(value: ClientValueHandle | ClientLiteral) { return this.registerVariantNode('absolute_int', 'int', 32, [value], 'int') }
  listLength(list: ClientListValue) { return this.registerDataNode('list_length', 'int', [{ kind: 'conn', type: list.type, node_id: list.nodeId, index: list.pinIndex }]) }
  listIncludes(value: ClientValueHandle | ClientLiteral, list: ClientListValue) { return this.registerQueryWithArgs('list_includes', 'bool', [value, list], ['int', list.type]) }
  listMaximum(list: ClientListValue) { return this.registerDataNode('list_maximum_int', 'int', [{ kind: 'conn', type: list.type, node_id: list.nodeId, index: list.pinIndex }]) }
  listMinimum(list: ClientListValue) { return this.registerDataNode('list_minimum_int', 'int', [{ kind: 'conn', type: list.type, node_id: list.nodeId, index: list.pinIndex }]) }
  filterEntitiesInSphere(radius: ClientValueHandle | ClientLiteral, center: ClientValueHandle | ClientLiteral, relation: ClientValueHandle | ClientLiteral) { return this.registerMathNode('filter_entities_sphere', 'entity_list', [[radius, 'float'], [center, 'vec3'], [relation, 'int']]) }
  filterEntitiesInSquare(x: ClientValueHandle | ClientLiteral, y: ClientValueHandle | ClientLiteral, z: ClientValueHandle | ClientLiteral, center: ClientValueHandle | ClientLiteral, relation: ClientValueHandle | ClientLiteral) { return this.registerMathNode('filter_entities_square', 'entity_list', [[x, 'float'], [y, 'float'], [z, 'float'], [center, 'vec3'], [relation, 'int']]) }
  getScannedEntity() { return this.registerDataNode('get_scanned_entity', 'entity', undefined, 1) }
  getScannableEntities() { return this.registerDataNode('get_scannable_entities', 'entity_list') }
  getActiveScanTags(entity: ClientValueHandle) { return this.registerEntityQuery('get_active_scan_tags', 'config_id', entity, 'getActiveScanTags') }
  randomInt(a: ClientValueHandle | ClientLiteral, b: ClientValueHandle | ClientLiteral) { return this.registerMathNode('random_int', 'int', [[a, 'int'], [b, 'int']]) }

  private registerQueryWithArgs(
    nodeType: string,
    outputType: ValueType,
    values: readonly (ClientValueHandle | ClientLiteral)[],
    types: readonly ValueType[]
  ): ClientValueHandle {
    return this.registerDataNode(nodeType, outputType, values.map((value, index) => this.clientMathValue(value, types[index])))
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

  sendSignalToServerGraphValues(signalName: string, params: readonly (ClientValueHandle | ClientLiteral | ClientListValue | undefined)[]): void {
    const values: (ClientValueIR | undefined)[] = params.map((value): ClientValueIR | undefined => value === undefined ? undefined : typeof value === 'object' && value && '__clientValue' in value
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
        : value.type.endsWith('_list')
          ? { kind: 'list', encoding: 'assembly-list', elementType: value.type.slice(0, -5) as ValueType, node_id: value.nodeId, index: value.pinIndex, elements: [] }
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
        getAllPlayers: () => registry.getAllPlayers(),
        getPresetStatus: (entity, status) => registry.getPresetStatus(entity, status),
        getEntityFaction: (entity) => registry.getEntityFaction(entity),
        getEntityTags: (entity) => registry.getEntityTags(entity),
        getEntitiesByTag: (tag) => registry.getEntitiesByTag(tag),
        getAggroTarget: (entity) => registry.getAggroTarget(entity),
        getAggroList: (entity) => registry.getAggroList(entity),
        isFactionHostile: (a, b) => registry.isFactionHostile(a, b),
        isEntityActive: (entity) => registry.isEntityActive(entity),
        getOverlappingEntities: (entity, relation) => registry.getOverlappingEntities(entity, relation),
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
        equalInt: (a, b) => registry.equalInt(a, b),
        greaterThanInt: (a, b) => registry.greaterThanInt(a, b),
        lessThanInt: (a, b) => registry.lessThanInt(a, b),
        lessThanOrEqualInt: (a, b) => registry.lessThanOrEqualInt(a, b),
        greaterThanOrEqualInt: (a, b) => registry.greaterThanOrEqualInt(a, b),
        addInt: (a, b) => registry.addInt(a, b),
        subtractInt: (a, b) => registry.subtractInt(a, b),
        multiplyInt: (a, b) => registry.multiplyInt(a, b),
        divideInt: (a, b) => registry.divideInt(a, b),
        absoluteInt: (value) => registry.absoluteInt(value),
        listLength: (list) => registry.listLength(list),
        listIncludes: (value, list) => registry.listIncludes(value, list),
        listMaximum: (list) => registry.listMaximum(list),
        listMinimum: (list) => registry.listMinimum(list),
        filterEntitiesInSphere: (radius, center, relation) => registry.filterEntitiesInSphere(radius, center, relation),
        filterEntitiesInSquare: (x, y, z, center, relation) => registry.filterEntitiesInSquare(x, y, z, center, relation),
        getScannedEntity: () => registry.getScannedEntity(),
        getScannableEntities: () => registry.getScannableEntities(),
        getActiveScanTags: (entity) => registry.getActiveScanTags(entity),
        randomInt: (a, b) => registry.randomInt(a, b),
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
        booleanAnd: (a, b) => registry.booleanAnd(a, b),
        booleanOr: (a, b) => registry.booleanOr(a, b),
        booleanNot: (value) => registry.booleanNot(value),
        booleanXor: (a, b) => registry.booleanXor(a, b),
        sine: (value) => registry.sine(value),
        cosine: (value) => registry.cosine(value),
        tangent: (value) => registry.tangent(value),
        arcsine: (value) => registry.arcsine(value),
        arccosine: (value) => registry.arccosine(value),
        arctangent: (value) => registry.arctangent(value),
        radiansToDegrees: (value) => registry.radiansToDegrees(value),
        degreesToRadians: (value) => registry.degreesToRadians(value),
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
