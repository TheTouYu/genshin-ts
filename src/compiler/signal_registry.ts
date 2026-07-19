import type { SignalParamType } from '../runtime/core.js'

export type RegisteredSignalParam = {
  name: string
  type: SignalParamType
  parameterDefinitionPinIndex?: number
}

export type RegisteredSignalClientEncoding = {
  parameterCompositePinIndices: number[]
  bindingCompositePinIndex: number
  nameCompositePinIndex: number
}

export type RegisteredSignalDefinition = {
  name: string
  params: RegisteredSignalParam[]
  sendId: number
  monitorId: number
  serverId: number
  clientEncoding?: RegisteredSignalClientEncoding
}

export type SignalRegistry = ReadonlyMap<string, RegisteredSignalDefinition>

export function createSignalRegistry(
  entries: readonly RegisteredSignalDefinition[]
): SignalRegistry {
  const registry = new Map<string, RegisteredSignalDefinition>()
  for (const entry of entries) {
    if (registry.has(entry.name)) {
      throw new Error(`[error] duplicate registered signal: ${entry.name}`)
    }
    registry.set(entry.name, entry)
  }
  return registry
}

export function serializeSignalRegistry(registry: SignalRegistry): RegisteredSignalDefinition[] {
  return [...registry.values()]
}

export function deserializeSignalRegistry(entries: readonly RegisteredSignalDefinition[]): SignalRegistry {
  return createSignalRegistry(entries)
}
