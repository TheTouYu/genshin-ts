import type { SignalParamType } from '../runtime/core.js'

export type RegisteredSignalParam = {
  name: string
  type: SignalParamType
  /** Pin indexes from the registry entry's send/monitor/server views. */
  sendPinIndex?: number
  monitorPinIndex?: number
  serverPinIndex?: number
  /** VarType used by the server definition view; it can differ from `type`. */
  serverType?: number
}

export type RegisteredSignalClientEncoding = {
  parameterCompositePinIndices: number[]
  bindingCompositePinIndex: number
  nameCompositePinIndex: number
}

export type RegisteredSignalEncoding = {
  signalVersion: number
  sendNameCompositePinIndex: number
  monitorNameCompositePinIndex: number
  /** Exact CompositeDef payloads; preserve unknown protobuf fields. */
  definitionBytes: { send: string; monitor: string; server: string }
  source?: { uid: number; mapId: number; gameVersion: string }
}

export type RegisteredSignalDefinition = {
  name: string
  params: RegisteredSignalParam[]
  sendId: number
  monitorId: number
  serverId: number
  encoding?: RegisteredSignalEncoding
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

export function deserializeSignalRegistry(
  entries: readonly RegisteredSignalDefinition[]
): SignalRegistry {
  return createSignalRegistry(entries)
}
