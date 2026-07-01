export const SERVER_DEFAULT_GRAPH_ID = 1073741825
export const CLIENT_DEFAULT_GRAPH_ID = 1082130433

export type GraphDocumentType = 'server' | 'client'

export function defaultGraphIdForType(type: GraphDocumentType | undefined): number {
  return type === 'client' ? CLIENT_DEFAULT_GRAPH_ID : SERVER_DEFAULT_GRAPH_ID
}

export function resolveGraphIdForGraph(graph?: { type?: unknown; id?: unknown }): number {
  const id = graph?.id
  if (typeof id === 'number' && Number.isFinite(id)) return id
  return defaultGraphIdForType(graph?.type === 'client' ? 'client' : 'server')
}
