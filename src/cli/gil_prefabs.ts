import { buildFile, readUint32BE } from '../injector/binary.js'
import { emitWireMessage, parseWireMessage, type WireField } from './static_assembly/wire.js'
import { buildCustomDefinitionRecord, buildStaticPrefabRecord, officialPrefabName } from './official_prefabs.js'

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

/** 在 root6 未分类页签组追加一条元件实例登记（type=400，与静态/官方元件实例一致）。 */
function registerElementInstance(top: WireField[], id: number): void {
  const entry = emit([
    { number: 1, wire: 0, value: 400 },
    { number: 2, wire: 0, value: id }
  ])
  let root6 = top.find((f) => f.number === 6 && f.wire === 2)
  if (!root6) {
    root6 = { number: 6, wire: 2, value: emit([]) }
    top.push(root6)
  }
  const records = parse(root6.value as Uint8Array)
  if (!records) throw new Error('[error] invalid root 6 section')
  for (const recordField of records) {
    if (recordField.number !== 1 || recordField.wire !== 2) continue
    const recordFields = parse(recordField.value as Uint8Array)
    if (!recordFields) continue
    if (recordFields.find((x) => x.number === 1 && x.wire === 0)?.value !== 3) continue
    const group = recordFields.find((f) => f.number === 3 && f.wire === 2)
    if (!group) continue
    const groupFields = parse(group.value as Uint8Array)
    if (!groupFields) continue
    const exists = groupFields.some((f) => {
      if (f.number !== 5 || f.wire !== 2) return false
      const em = parse(f.value as Uint8Array)
      return em?.find((x) => x.number === 2 && x.wire === 0)?.value === id
    })
    if (exists) return
    groupFields.push({ number: 5, wire: 2, value: entry })
    group.value = emit(groupFields)
    recordField.value = emit(recordFields)
    root6.value = emit(records)
    return
  }
  // 无未分类页签组：创建最小实体组记录（与 registerEntity 同构）
  const group = emit([
    { number: 1, wire: 2, value: new TextEncoder().encode('未分类页签') },
    { number: 3, wire: 0, value: 2 },
    { number: 5, wire: 2, value: entry }
  ])
  const record = emit([
    { number: 1, wire: 0, value: 3 },
    { number: 2, wire: 2, value: emit([{ number: 1, wire: 2, value: new TextEncoder().encode('root') }, { number: 3, wire: 0, value: 1 }]) },
    { number: 3, wire: 2, value: group }
  ])
  records.push({ number: 1, wire: 2, value: record })
  root6.value = emit(records)
}

/**
 * 创建“静态元件”root8 实例（动态元件 → 静态资源转换后的形态）：
 * 写入 root8.1 静态记录，并在 root6 登记 type400。
 */
export function createStaticPrefabInstance(
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
  const record = buildStaticPrefabRecord({ id: params.id, resourceId: params.resourceId, name, transform })
  let root8 = top.find((f) => f.number === 8 && f.wire === 2)
  if (!root8) {
    root8 = { number: 8, wire: 2, value: emit([]) }
    top.push(root8)
  }
  const section = parse(root8.value as Uint8Array)
  if (!section) throw new Error('[error] invalid root 8 section')
  const exists = section.some((f) => {
    if (f.number !== 1 || f.wire !== 2) return false
    const rec = parse(f.value as Uint8Array)
    return rec?.some((x) => x.number === 1 && x.wire === 0 && x.value === params.id)
  })
  if (exists) throw new Error(`[error] static prefab instance id already exists: ${params.id}`)
  section.push({ number: 1, wire: 2, value: record })
  root8.value = emit(section)
  registerElementInstance(top, params.id)
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
