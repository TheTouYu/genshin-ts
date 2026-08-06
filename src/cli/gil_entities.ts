import type {
  GstsStaticAssemblyComponent,
  GstsStaticColor
} from '../compiler/gsts_config.js'
import { buildFile, readUint32BE } from '../injector/binary.js'
import {
  emitWireMessage as emit,
  findWireRecord as findRecord,
  parseWireMessage as parse,
  printableWireText as printable,
  wireMessage as message,
  wireRecordId as recordId,
  wireRecords as records,
  type WireField
} from './static_assembly/wire.js'

export type EntityTransform = {
  position: readonly [number, number, number]
  rotation: readonly [number, number, number]
  scale: readonly [number, number, number]
}

export type ExportedEntity = {
  id: number
  name: string
  definitionId: number
  resourceId?: number
  position: readonly [number, number, number]
  rotation: readonly [number, number, number]
  scale: readonly [number, number, number]
  components: readonly GstsStaticAssemblyComponent[]
  color?: GstsStaticColor
}

export type EntityImport = {
  name?: string
  id: number
  definitionId: number
  /** 仅用于选择转换模板；省略时与 definitionId 相同，不会写入目标实体。 */
  sourceDefinitionId?: number
  position?: readonly [number, number, number]
  rotation?: readonly [number, number, number]
  scale?: readonly [number, number, number]
  /** 0xAARRGGBB（解析自 '#RRGGBB'） */
  color?: number
}

const TEXT = new TextEncoder()
const TEXT_DECODER = new TextDecoder()

function firstVarint(fields: readonly WireField[] | undefined, number: number): number | undefined {
  const field = fields?.find((item) => item.number === number && item.wire === 0)
  return typeof field?.value === 'number' ? field.value : undefined
}

function floatVector(data: Uint8Array): [number, number, number] {
  const values = [0, 0, 0]
  for (const field of parse(data) ?? []) {
    if (field.wire === 5 && field.number >= 1 && field.number <= 3) {
      values[field.number - 1] = Buffer.from(field.value as Uint8Array).readFloatLE(0)
    }
  }
  return values as [number, number, number]
}

function vector(values: readonly number[], sparse: boolean): Uint8Array {
  return emit(
    values.flatMap((value, index) =>
      sparse && value === 0 ? [] : [{ number: index + 1, wire: 5, value: float32(value) }]
    )
  )
}

function float32(value: number): Uint8Array {
  const result = Buffer.alloc(4)
  result.writeFloatLE(value)
  return result
}

export function readTransform(record: Uint8Array, ownerFieldNumber: number): EntityTransform {
  const fields = parse(record)
  const owner = fields?.find(
    (field) =>
      field.wire === 2 &&
      field.number === ownerFieldNumber &&
      parse(field.value as Uint8Array)?.some(
        (child) => child.number === 1 && child.wire === 0 && child.value === 1
      )
  )
  if (!owner) return { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }
  const transform = parse(owner.value as Uint8Array)?.find(
    (field) => field.number === 11 && field.wire === 2
  )
  if (!transform) return { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }
  const transformFields = parse(transform.value as Uint8Array)
  const position = transformFields?.find((field) => field.number === 1 && field.wire === 2)
  const rotation = transformFields?.find((field) => field.number === 2 && field.wire === 2)
  const scale = transformFields?.find((field) => field.number === 3 && field.wire === 2)
  return {
    position: position ? floatVector(position.value as Uint8Array) : [0, 0, 0],
    rotation: rotation ? floatVector(rotation.value as Uint8Array) : [0, 0, 0],
    scale: scale ? floatVector(scale.value as Uint8Array) : [1, 1, 1]
  }
}

function readColor(record: Uint8Array): GstsStaticColor | undefined {
  for (const field of parse(record) ?? []) {
    // 实体材质槽在 #6{f1=22}（不是 #5 名称槽；2026-08-06 v9 地图 27 块实测）
    if (field.wire !== 2 || field.number !== 6) continue
    const entry = parse(field.value as Uint8Array)
    if (!entry) continue
    if (firstVarint(entry, 1) !== 22) continue
    const config = entry.find((item) => item.number === 32 && item.wire === 2)
    if (!config) continue
    const color = parse(config.value as Uint8Array)
    if (!color) continue
    if (!color.some((item) => item.number === 1 && item.wire === 0 && item.value === 1)) {
      return { enabled: false }
    }
    // 颜色值是 f3=0xAARRGGBB varint；f5 是材质引用（球体改色 0x7FFFFFF→0x07B5AED7）。
    // readVarint 返回 int32（0xFFFFFFFF→-1），颜色必须规整为无符号
    const rgb = (firstVarint(color, 3) ?? 0) >>> 0
    const opacity = color.find((item) => item.number === 4 && item.wire === 5)
    const overlay = firstVarint(color, 6)
    if (rgb === undefined || !opacity) continue
    return {
      enabled: true,
      rgb,
      opacity: Buffer.from(opacity.value as Uint8Array).readFloatLE(0),
      overlay: overlay === 6701 ? 'multiply' : 'overwrite'
    }
  }
  return undefined
}

function entityName(record: Uint8Array): string | undefined {
  const f5 = parse(record)?.find((field) => field.number === 5 && field.wire === 2)
  if (!f5) return undefined
  const f11 = parse(f5.value as Uint8Array)?.find((field) => field.number === 11 && field.wire === 2)
  if (!f11) return undefined
  const name = parse(f11.value as Uint8Array)?.find(
    (field) => field.number === 1 && field.wire === 2
  )
  return name ? printable(name.value as Uint8Array) : undefined
}

function componentSlots(record: Uint8Array, fieldNumber: number): Uint8Array[] {
  return (parse(record) ?? [])
    .filter((field) => field.number === fieldNumber && field.wire === 2)
    .map((field) => field.value as Uint8Array)
}

function decodeComponent(slot: Uint8Array): GstsStaticAssemblyComponent | undefined {
  const fields = parse(slot)
  if (!fields) return undefined
  const code = firstVarint(fields, 1)
  const enabled = fields.some((field) => field.number === 2 && field.wire === 0 && field.value === 1)
  if (!enabled) return undefined
  if (code === 9) return { type: 'followMotion', preset: 'fullFollow' }
  if (code === 18) return { type: 'basicMotion', preset: 'default' }
  if (code === 17) {
    const config = fields.find((field) => field.number === 27 && field.wire === 2)
    if (!config) return undefined
    const configFields = parse(config.value as Uint8Array)
    if (!configFields) return undefined
    const region = configFields.find((field) => field.number === 1 && field.wire === 2)
    let regionName: string | undefined
    if (region) {
      const nameField = parse(region.value as Uint8Array)?.find(
        (field) => field.number === 502 && field.wire === 2
      )
      regionName = nameField ? printable(nameField.value as Uint8Array) : undefined
    }
    const options: string[] = []
    for (const option of configFields) {
      if (option.number !== 2 || option.wire !== 2) continue
      const shortName = parse(option.value as Uint8Array)?.find(
        (field) => field.number === 2 && field.wire === 2
      )
      const text = shortName ? printable(shortName.value as Uint8Array) : undefined
      if (text) options.push(text)
    }
    if (regionName && options.length) return { type: 'tabBar', regionName, options }
  }
  return undefined
}

export function exportEntities(bytes: Uint8Array): ExportedEntity[] {
  if (bytes.length < 24) throw new Error('[error] invalid GIL size')
  const top = parse(bytes.slice(20, -4))
  if (!top) throw new Error('[error] malformed GIL payload')
  const result: ExportedEntity[] = []
  for (const record of records(top, 5, 1)) {
    const id = recordId(record)
    if (id === undefined) continue
    const name = entityName(record)
    const relation = parse(record)?.find((field) => field.number === 2 && field.wire === 2)
    const definitionId = firstVarint(
      relation ? parse(relation.value as Uint8Array) : undefined,
      1
    )
    if (!name || definitionId === undefined) continue
    const resourceId = firstVarint(parse(record), 8)
    const components = componentSlots(record, 7)
      .map(decodeComponent)
      .filter((component): component is GstsStaticAssemblyComponent => component !== undefined)
    result.push({
      id,
      name,
      definitionId,
      ...(resourceId === undefined ? {} : { resourceId }),
      ...readTransform(record, 6),
      ...(readColor(record) ? { color: readColor(record)! } : {}),
      components
    })
  }
  return result.sort((a, b) => a.id - b.id)
}

function withEntityName(nameMessage: Uint8Array, name: string): Uint8Array {
  const fields = parse(nameMessage)
  if (!fields) return nameMessage
  const f11 = fields.find((field) => field.number === 11 && field.wire === 2)
  if (!f11) return nameMessage
  const f11Fields = parse(f11.value as Uint8Array)
  if (!f11Fields) return nameMessage
  const nameField = f11Fields.find((field) => field.number === 1 && field.wire === 2)
  if (!nameField) return nameMessage
  nameField.value = TEXT.encode(name)
  f11.value = emit(f11Fields)
  return emit(fields)
}

export function setTransform(
  record: Uint8Array,
  transform: EntityTransform,
  slotNumber = 6
): Uint8Array {
  const fields = parse(record)
  if (!fields) throw new Error('[error] invalid transform record')
  const owner = fields.find(
    (field) =>
      field.wire === 2 &&
      field.number === slotNumber &&
      parse(field.value as Uint8Array)?.some(
        (child) => child.number === 1 && child.wire === 0 && child.value === 1
      )
  )
  if (!owner) throw new Error('[error] entity transform owner not found')
  const ownerFields = message(owner)
  const transformField = ownerFields.find((field) => field.number === 11 && field.wire === 2)
  if (!transformField) throw new Error('[error] entity transform field 11 not found')
  const existing = message(transformField).filter((field) => ![1, 2, 3].includes(field.number))
  transformField.value = emit([
    { number: 1, wire: 2, value: vector(transform.position, true) },
    { number: 2, wire: 2, value: vector(transform.rotation, true) },
    { number: 3, wire: 2, value: vector(transform.scale, false) },
    ...existing
  ])
  owner.value = emit(ownerFields)
  return emit(fields)
}

/**
 * 从元件定义记录转换场景实体记录。规则来自真实编辑器样本：
 * 资源 f2→f8、名称/能力 f6→f5（追加 19/52 两个默认能力）、
 * 装饰物列表 f7→f6（transform 更新为新位置）、组件槽 f8→f7（逐字节继承）、
 * 删除 def 独有 f10 与 packed 501，新增 f2={f1=defRef}。
 */
/**
 * 实体名称：首个能力槽 `#5` 内层 f11（UTF-8）。
 */
function entityNameOf(record: Uint8Array): string | undefined {
  const fields = parse(record)
  if (!fields) return undefined
  const firstAbility = fields.find((field) => field.number === 5 && field.wire === 2)
  if (!firstAbility) return undefined
  for (const child of message(firstAbility)) {
    if (child.number === 11 && child.wire === 2) {
      return TEXT_DECODER.decode(child.value as Uint8Array)
    }
  }
  return undefined
}

/**
 * 材质槽已启用自定义颜色时的颜色值（#6{f1=22}.f32 的 f1=1 且 f3 varint）。
 */
function materialColorOf(record: Uint8Array): number | undefined {
  const fields = parse(record)
  if (!fields) return undefined
  const slot = fields.find(
    (field) =>
      field.wire === 2 &&
      field.number === 6 &&
      parse(field.value as Uint8Array)?.some(
        (child) => child.number === 1 && child.wire === 0 && child.value === 22
      )
  )
  if (!slot) return undefined
  const mat = message(slot).find((field) => field.number === 32 && field.wire === 2)
  if (!mat) return undefined
  const matFields = message(mat)
  if (firstVarint(matFields, 1) !== 1) return undefined
  // readVarint 返回 int32（0xFFFFFFFF→-1），颜色规整为无符号
  return (firstVarint(matFields, 3) ?? 0) >>> 0
}

/**
 * 写入实体级自定义颜色（材质槽 #6{f1=22}.f32：f1=1 启用 + f3=0xAARRGGBB）。
 * 编码来自真实样本：白色=0xFFFFFFFF（启用标记 08 01）、粉红=0xFFED5757
 * （2026-08-06 v8：用户给长方体打开自定义颜色默认白色，材质槽 21B→23B）。
 */
function setMaterialColor(record: Uint8Array, argb: number): Uint8Array {
  const fields = parse(record)
  if (!fields) throw new Error('[error] entity record malformed')
  const slot = fields.find(
    (field) =>
      field.wire === 2 &&
      field.number === 6 &&
      parse(field.value as Uint8Array)?.some(
        (child) => child.number === 1 && child.wire === 0 && child.value === 22
      )
  )
  if (!slot) throw new Error('[error] definition has no material slot (cannot set color)')
  const slotFields = message(slot)
  const mat = slotFields.find((field) => field.number === 32 && field.wire === 2)
  if (!mat) throw new Error('[error] material slot missing field 32')
  const matFields = message(mat)
  mat.value = emit([
    { number: 1, wire: 0, value: 1 },
    { number: 3, wire: 0, value: argb },
    ...matFields.filter((field) => field.number !== 1 && field.number !== 3)
  ])
  slot.value = emit(slotFields)
  return emit(fields)
}

export function entityFromDefinition(
  definition: Uint8Array,
  params: {
    id: number
    name: string
    definitionId: number
    transform: EntityTransform
    color?: number
  }
): Uint8Array {
  const fields = parse(definition)
  if (!fields) throw new Error('[error] invalid definition record')
  const out: WireField[] = []
  let resourceId: number | undefined
  let nameOccurrence = 0
  let defaultsPushed = false
  const pushDefaults = () => {
    if (defaultsPushed) return
    defaultsPushed = true
    // 追加实体默认能力（真实样本：f1=19/f28 与 f1=52/f62）。
    out.push({ number: 5, wire: 2, value: emit([{ number: 1, wire: 0, value: 19 }, { number: 28, wire: 2, value: new Uint8Array() }]) })
    out.push({ number: 5, wire: 2, value: emit([{ number: 1, wire: 0, value: 52 }, { number: 62, wire: 2, value: new Uint8Array() }]) })
  }
  for (const field of fields) {
    if (field.number === 1) {
      out.push({ number: 1, wire: 0, value: params.id })
    } else if (field.number === 2) {
      resourceId = typeof field.value === 'number' ? field.value : undefined
      out.push({ number: 2, wire: 2, value: emit([{ number: 1, wire: 0, value: params.definitionId }]) })
    } else if (field.number === 6) {
      nameOccurrence++
      out.push({
        number: 5,
        wire: 2,
        value: nameOccurrence === 1 ? withEntityName(field.value as Uint8Array, params.name) : field.value
      })
    } else if (field.number === 7) {
      pushDefaults()
      out.push({ number: 6, wire: 2, value: field.value })
    } else if (field.number === 8) {
      out.push({ number: 7, wire: 2, value: field.value })
    } else if (field.number === 10 || field.number === 501) {
      // 元件定义独有：实体样本中不存在。
    } else {
      out.push(field)
    }
  }
  pushDefaults()
  if (resourceId !== undefined) out.push({ number: 8, wire: 0, value: resourceId })
  let record = setTransform(emit(out), params.transform)
  if (params.color !== undefined) record = setMaterialColor(record, params.color)
  return record
}

function registerEntity(top: readonly WireField[], entityId: number, definitionId: number): void {
  const entry = emit([
    { number: 1, wire: 0, value: 200 },
    { number: 2, wire: 0, value: entityId }
  ])
  const root6 = top.find((field) => field.number === 6 && field.wire === 2)
  if (!root6) throw new Error('[error] root 6 section not found')
  const records = message(root6)
  for (const recordField of records) {
    if (recordField.number !== 1 || recordField.wire !== 2) continue
    const recordFields = message(recordField)
    if (firstVarint(recordFields, 1) !== 3) continue
    const group = recordFields.find((field) => field.number === 3 && field.wire === 2)
    if (!group) continue
    const groupFields = message(group)
    if (!groupFields.some((field) => field.number === 1 && field.wire === 2)) continue
    // 编辑器登记为纯追加式：新条目（type=200 实体）追加到组末尾，不按元件插入
    // （v3→v4 真实样本：五棱柱实体 135 的 (200,135) 追加在 (400,134)(100,133) 之后）
    groupFields.push({ number: 5, wire: 2, value: entry })
    group.value = emit(groupFields)
    recordField.value = emit(recordFields)
    root6.value = emit(records)
    return
  }
  // 全新地图无实体组（root 6 #1=3）：创建最小实体组记录（同构于编辑器结构，
  // record #2={1:'root',3:1}，group #1='未分类页签'/#3=2；与 minimalFolderRoot6 同构）
  const group = emit([
    { number: 1, wire: 2, value: TEXT.encode('未分类页签') },
    { number: 3, wire: 0, value: 2 },
    { number: 5, wire: 2, value: entry }
  ])
  const record = emit([
    { number: 1, wire: 0, value: 3 },
    { number: 2, wire: 2, value: emit([{ number: 1, wire: 2, value: TEXT.encode('root') }, { number: 3, wire: 0, value: 1 }]) },
    { number: 3, wire: 2, value: group }
  ])
  records.push({ number: 1, wire: 2, value: record })
  root6.value = emit(records)
}

export function applyEntities(params: {
  bytes: Uint8Array
  entities: readonly EntityImport[]
  definitions: readonly Uint8Array[]
}): Uint8Array {
  const top = parse(params.bytes.slice(20, -4))
  if (!top) throw new Error('[error] malformed GIL payload')
  const occupied = new Set<number>()
  // 实体 ID 与 definition/instance/entity 共用计数器：root 5 实体 + root 6 组全部条目
  // （100/400/200）都占用 ID，冲突会致编辑器报“存档损坏”
  const top5Existing = top.find((field) => field.number === 5 && field.wire === 2)
  if (top5Existing) {
    for (const record of records(top, 5, 1)) {
      const id = recordId(record)
      if (id !== undefined) occupied.add(id)
    }
  }
  for (const field of top) {
    if (field.number !== 6 || field.wire !== 2) continue
    for (const recordField of message(field)) {
      if (recordField.number !== 1 || recordField.wire !== 2) continue
      const recordFields = message(recordField)
      if (firstVarint(recordFields, 1) !== 3) continue
      const group = recordFields.find((f) => f.number === 3 && f.wire === 2)
      if (!group) continue
      for (const entry of message(group)) {
        if (entry.number !== 5 || entry.wire !== 2) continue
        const id = firstVarint(message(entry), 2)
        if (id !== undefined) occupied.add(id)
      }
    }
  }
  const existingById = new Map<number, Uint8Array>()
  for (const record of records(top, 5, 1)) {
    const id = recordId(record)
    if (id !== undefined) existingById.set(id, record)
  }
  for (const entity of params.entities) {
    if (occupied.has(entity.id) && !existingById.has(entity.id))
      throw new Error(`[error] entity ID conflict: ${entity.id}`)
    occupied.add(entity.id)
  }
  let top5 = top.find((field) => field.number === 5 && field.wire === 2)
  if (!top5) {
    top5 = { number: 5, wire: 2, value: emit([]) }
    top.push(top5)
  }
  const section = message(top5)
  for (const entity of params.entities) {
    const definition = findRecord(
      params.definitions,
      entity.sourceDefinitionId ?? entity.definitionId
    )
    const existing = existingById.get(entity.id)
    const base = existing ? readTransform(existing, 6) : undefined
    let color: number | undefined
    if (entity.color !== undefined) color = entity.color
    else if (existing) color = materialColorOf(existing)
    const record = entityFromDefinition(definition, {
      id: entity.id,
      name: entity.name ?? (existing ? entityNameOf(existing) ?? '' : ''),
      definitionId: entity.definitionId,
      transform: {
        position: entity.position ?? base?.position ?? [0, 0, 0],
        rotation: entity.rotation ?? base?.rotation ?? [0, 0, 0],
        scale: entity.scale ?? base?.scale ?? [1, 1, 1]
      },
      ...(color !== undefined ? { color } : {})
    })
    if (existing) {
      // 更新已有实体：原位替换记录，不重复登记组条目
      const index = section.findIndex(
        (field) =>
          field.number === 1 &&
          field.wire === 2 &&
          Buffer.from(field.value as Uint8Array).equals(Buffer.from(existing))
      )
      if (index < 0) throw new Error(`[error] existing entity record not found: ${entity.id}`)
      section[index] = { number: 1, wire: 2, value: record }
    } else {
      section.push({ number: 1, wire: 2, value: record })
      registerEntity(top, entity.id, entity.definitionId)
    }
  }
  top5.value = emit(section)
  const rebuilt = emit(top)
  // 头部长字段必须重建：编辑器按头部长度解析 payload，旧长度会导致“存档损坏”
  // （2026-08-06 实测：applyEntities 曾原样复制源头，payload 变大后长度字段过期，
  // 编辑器拒绝加载；其他写回路径统一用 buildFile）
  return buildFile(rebuilt, {
    schema: readUint32BE(params.bytes, 4),
    headTag: readUint32BE(params.bytes, 8),
    fileType: readUint32BE(params.bytes, 12),
    tailTag: readUint32BE(params.bytes, params.bytes.length - 4)
  })
}
