import { buildFile, readUint32BE } from '../injector/binary.js'
import { emitWireMessage, parseWireMessage, type WireField } from './static_assembly/wire.js'
import { buildCustomDefinitionRecord, officialPrefabName } from './official_prefabs.js'

function parse(data: Uint8Array): WireField[] | undefined {
  return parseWireMessage(data)
}

function emit(fields: readonly WireField[]): Uint8Array {
  return emitWireMessage(fields)
}

export function createCustomPrefab(
  bytes: Uint8Array,
  params: { id: number; resourceId: number; name?: string; position?: readonly number[] }
): { bytes: Uint8Array; id: number; name: string } {
  const top = parse(bytes.slice(20, -4))
  if (!top) throw new Error('[error] malformed GIL payload')
  const name = params.name || officialPrefabName(params.resourceId) || ''
  const pos = params.position ?? [0, 0, 0]
  const transform = {
    position: [pos[0] ?? 0, pos[1] ?? 0, pos[2] ?? 0] as [number, number, number],
    rotation: [0, 0, 0] as [number, number, number],
    scale: [1, 1, 1] as [number, number, number]
  }
  const record = buildCustomDefinitionRecord({ id: params.id, resourceId: params.resourceId, name, transform })
  let root4 = top.find((f) => f.number === 4 && f.wire === 2)
  if (!root4) {
    root4 = { number: 4, wire: 2, value: emit([]) }
    top.push(root4)
  }
  const section = parse(root4.value as Uint8Array)
  if (!section) throw new Error('[error] invalid root 4 section')
  const exists = section.some((f) => {
    if (f.number !== 1 || f.wire !== 2) return false
    const rec = parse(f.value as Uint8Array)
    return rec?.some((x) => x.number === 1 && x.wire === 0 && x.value === params.id)
  })
  if (exists) throw new Error(`[error] prefab id already exists: ${params.id}`)
  section.push({ number: 1, wire: 2, value: record })
  root4.value = emit(section)
  return {
    bytes: buildFile(emit(top), {
      schema: readUint32BE(bytes, 4),
      headTag: readUint32BE(bytes, 8),
      fileType: readUint32BE(bytes, 12),
      tailTag: readUint32BE(bytes, bytes.length - 4)
    }),
    id: params.id,
    name
  }
}
