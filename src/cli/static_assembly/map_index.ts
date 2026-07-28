import { readUint32BE } from '../../injector/binary.js'
import {
  collectWireTexts,
  collectWireVarints,
  nthWireField,
  packedWireIds,
  parseWireMessage,
  wireMessage,
  wireRecordId,
  wireRecords,
  type WireField
} from './wire.js'

export type StaticAssemblyTransform = {
  position: readonly [number, number, number]
  rotation: readonly [number, number, number]
  scale: readonly [number, number, number]
}

export type StaticAssemblyIndexedRecord = {
  id: number
  name?: string
  names: readonly string[]
  ownerIds: readonly number[]
  resourceIds: readonly number[]
  packedIds: readonly number[]
  definitionId?: number
  transform?: StaticAssemblyTransform
}

export type StaticAssemblyMapIndex = {
  header: { schema: number; headTag: number; fileType: number; tailTag: number }
  payloadSize: number
  topLevelFields: readonly { number: number; wire: number; count: number }[]
  definitions: readonly StaticAssemblyIndexedRecord[]
  instances: readonly StaticAssemblyIndexedRecord[]
  definitionAuxiliaries: readonly StaticAssemblyIndexedRecord[]
  instanceAuxiliaries: readonly StaticAssemblyIndexedRecord[]
  ownerRegistryIds: readonly number[]
  occupiedIds: {
    prefabs: readonly number[]
    instances: readonly number[]
    definitionAuxiliaries: readonly number[]
    instanceAuxiliaries: readonly number[]
  }
  diagnostics: readonly string[]
  top: WireField[]
}

function safeId(value: number | undefined): value is number {
  return value !== undefined && Number.isSafeInteger(value) && value >= 0
}

function uniqueSorted(values: readonly number[]): number[] {
  return [...new Set(values.filter((value) => safeId(value)))].sort((a, b) => a - b)
}

function vector(data: Uint8Array, defaults: readonly number[]): readonly [number, number, number] {
  const fields = parseWireMessage(data) ?? []
  const values = defaults.map((fallback, index) => {
    const field = fields.find((candidate) => candidate.number === index + 1 && candidate.wire === 5)
    return field ? Buffer.from(field.value as Uint8Array).readFloatLE() : fallback
  })
  return values as [number, number, number]
}

function readTransform(record: Uint8Array): StaticAssemblyTransform | undefined {
  const fields = parseWireMessage(record)
  if (!fields) return undefined
  for (const owner of fields) {
    if (owner.wire !== 2 || (owner.number !== 5 && owner.number !== 6)) continue
    const ownerFields = parseWireMessage(owner.value as Uint8Array)
    if (!ownerFields) continue
    const marker = ownerFields.some(
      (field) => field.number === 1 && field.wire === 0 && field.value === 1
    )
    const transform = ownerFields.find((field) => field.number === 11 && field.wire === 2)
    if (!marker || !transform) continue
    const values = parseWireMessage(transform.value as Uint8Array)
    if (!values) continue
    const position = values.find((field) => field.number === 1 && field.wire === 2)
    const rotation = values.find((field) => field.number === 2 && field.wire === 2)
    const scale = values.find((field) => field.number === 3 && field.wire === 2)
    return {
      position: position ? vector(position.value as Uint8Array, [0, 0, 0]) : [0, 0, 0],
      rotation: rotation ? vector(rotation.value as Uint8Array, [0, 0, 0]) : [0, 0, 0],
      scale: scale ? vector(scale.value as Uint8Array, [1, 1, 1]) : [1, 1, 1]
    }
  }
  return undefined
}

function directReference(record: Uint8Array): number | undefined {
  const fields = parseWireMessage(record)
  const relation = fields?.find((field) => field.number === 2 && field.wire === 2)
  if (!relation) return undefined
  const value = parseWireMessage(relation.value as Uint8Array)?.find(
    (field) => field.number === 1 && field.wire === 0
  )?.value
  return typeof value === 'number' && safeId(value) ? value : undefined
}

function indexRecord(
  record: Uint8Array,
  kind: 'definition' | 'instance' | 'auxiliary'
): StaticAssemblyIndexedRecord | undefined {
  const id = wireRecordId(record)
  if (!safeId(id)) return undefined
  const names = [...new Set(collectWireTexts(record))]
  let packedIds: number[] = []
  try {
    packedIds = packedWireIds(record)
  } catch {
    // Packed IDs only exist on custom-prefab definition/instance records.
  }
  const allIds = uniqueSorted(collectWireVarints(record))
  return {
    id,
    ...(names.length === 1 ? { name: names[0] } : {}),
    names,
    ownerIds: allIds.filter((value) => value !== id),
    resourceIds: allIds.filter((value) => value >= 10000000 && value < 1000000000),
    packedIds,
    ...(kind === 'instance' ? { definitionId: directReference(record) } : {}),
    ...(readTransform(record) ? { transform: readTransform(record) } : {})
  }
}

function indexedRecords(
  top: readonly WireField[],
  section: number,
  recordType: number,
  kind: 'definition' | 'instance' | 'auxiliary'
): StaticAssemblyIndexedRecord[] {
  return wireRecords(top, section, recordType)
    .map((record) => indexRecord(record, kind))
    .filter((record): record is StaticAssemblyIndexedRecord => record !== undefined)
    .sort((a, b) => a.id - b.id)
}

function registryOwners(top: readonly WireField[]): number[] {
  const section = wireMessage(nthWireField(top, 6))
  return uniqueSorted(
    section.flatMap((field) =>
      field.number === 1 && field.wire === 2 ? collectWireVarints(field.value as Uint8Array) : []
    )
  )
}

export function createStaticAssemblyMapIndex(bytes: Uint8Array): StaticAssemblyMapIndex {
  if (bytes.length < 24) throw new Error('[error] invalid GIL size')
  const payload = bytes.slice(20, -4)
  const top = parseWireMessage(payload)
  if (!top) throw new Error('[error] malformed GIL payload')
  const required = [4, 6, 8, 27]
  const missing = required.filter((number) => !top.some((field) => field.number === number))
  if (missing.length) {
    const recognized = [...new Set(top.map((field) => field.number))].sort((a, b) => a - b)
    throw new Error(
      `[error] unsupported GIL layout: missing sections ${missing.join(',')}; ` +
        `recognized sections ${recognized.join(',')}`
    )
  }
  const definitions = indexedRecords(top, 4, 1, 'definition')
  const instances = indexedRecords(top, 8, 1, 'instance')
  const definitionAuxiliaries = indexedRecords(top, 27, 1, 'auxiliary')
  const instanceAuxiliaries = indexedRecords(top, 27, 2, 'auxiliary')
  const counts = new Map<number, { wire: number; count: number }>()
  for (const field of top) {
    const current = counts.get(field.number)
    counts.set(field.number, { wire: field.wire, count: (current?.count ?? 0) + 1 })
  }
  return {
    header: {
      schema: readUint32BE(bytes, 4),
      headTag: readUint32BE(bytes, 8),
      fileType: readUint32BE(bytes, 12),
      tailTag: readUint32BE(bytes, bytes.length - 4)
    },
    payloadSize: payload.length,
    topLevelFields: [...counts.entries()]
      .sort(([a], [b]) => a - b)
      .map(([number, value]) => ({ number, ...value })),
    definitions,
    instances,
    definitionAuxiliaries,
    instanceAuxiliaries,
    ownerRegistryIds: registryOwners(top),
    occupiedIds: {
      prefabs: definitions.map((record) => record.id),
      instances: instances.map((record) => record.id),
      definitionAuxiliaries: definitionAuxiliaries.map((record) => record.id),
      instanceAuxiliaries: instanceAuxiliaries.map((record) => record.id)
    },
    diagnostics: [],
    top
  }
}
