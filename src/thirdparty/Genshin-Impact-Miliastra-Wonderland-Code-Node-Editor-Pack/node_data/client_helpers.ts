import {
  CLIENT_NODE_METADATA,
  type ClientGraphSubType,
  type ClientNodeMetadata
} from './client_node_metadata.js'

const bySubTypeAndNodeType = new Map<string, ClientNodeMetadata>()
const bySubTypeAndGenericId = new Map<string, ClientNodeMetadata>()
const bySubTypeAndConcreteId = new Map<string, ClientNodeMetadata>()

for (const item of CLIENT_NODE_METADATA) {
  bySubTypeAndNodeType.set(`${item.subType}:${item.nodeType}`, item)
  bySubTypeAndGenericId.set(`${item.subType}:${item.genericId}`, item)
  bySubTypeAndConcreteId.set(`${item.subType}:${String(item.concreteId)}`, item)
}

export function getClientNodeMetadata(
  subType: ClientGraphSubType,
  nodeType: string
): ClientNodeMetadata | undefined {
  return bySubTypeAndNodeType.get(`${subType}:${nodeType}`)
}

export function requireClientNodeMetadata(
  subType: ClientGraphSubType,
  nodeType: string
): ClientNodeMetadata {
  const found = getClientNodeMetadata(subType, nodeType)
  if (!found) {
    throw new Error(`[CLIENT_NODE_UNAVAILABLE] ${subType}.${nodeType}`)
  }
  return found
}

export function getClientNodeMetadataByGenericId(
  subType: ClientGraphSubType,
  genericId: number
): ClientNodeMetadata | undefined {
  return bySubTypeAndGenericId.get(`${subType}:${genericId}`)
}

export function getClientNodeMetadataByConcreteId(
  subType: ClientGraphSubType,
  concreteId: number | string
): ClientNodeMetadata | undefined {
  return bySubTypeAndConcreteId.get(`${subType}:${String(concreteId)}`)
}
