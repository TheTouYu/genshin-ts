import type {
  GstsStaticAssemblyComponent,
  GstsStaticColor
} from '../compiler/gsts_config.js'
import { buildFile, encodeVarint, readUint32BE, readVarint } from '../injector/binary.js'
import {
  buildOfficialPrefabRecord,
  isOfficialResourceId,
  officialPrefabName
} from './official_prefabs.js'
import { removeStaticAssemblyComponents } from './gil_static_assemblies.js'
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
  auxIds: readonly number[]
  color?: GstsStaticColor
}

export type EntityImport = {
  name?: string
  /** 新建实体可省略：由 CLI 自动分配下一个空闲系统 GUID（≥1077936129）。 */
  id?: number
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

function readVarintStream(data: Uint8Array): number[] {
  const result: number[] = []
  let offset = 0
  while (offset < data.length) {
    const item = readVarint(data, offset)
    if (!item) throw new Error('[error] malformed entity aux ID list')
    result.push(item.value >>> 0)
    offset = item.next
  }
  return result
}

/** 读取实体 f5{f1=40}.f50.f501 的装饰物 ID 列表。 */
export function readEntityAuxIds(record: Uint8Array): number[] {
  for (const field of parse(record) ?? []) {
    if (field.wire !== 2 || field.number !== 5) continue
    const slot = parse(field.value as Uint8Array)
    if (!slot || firstVarint(slot, 1) !== 40) continue
    const f50 = slot.find((child) => child.number === 50 && child.wire === 2)
    if (!f50) return []
    const list = parse(f50.value as Uint8Array)?.find(
      (child) => child.number === 501 && child.wire === 2
    )
    return list ? readVarintStream(list.value as Uint8Array) : []
  }
  return []
}

/** 读取 aux 记录 f4{f1=40}.f50.f502 的宿主 ID（instance-side aux 的归属）。 */
function auxOwnerOf(record: Uint8Array): number | undefined {
  for (const field of parse(record) ?? []) {
    if (field.wire !== 2 || field.number !== 4) continue
    const slot = parse(field.value as Uint8Array)
    if (!slot || firstVarint(slot, 1) !== 40) continue
    const f50 = slot.find((child) => child.number === 50 && child.wire === 2)
    if (!f50) continue
    return firstVarint(parse(f50.value as Uint8Array), 502)
  }
  return undefined
}

function varintBytes(values: readonly number[]): Uint8Array {
  return Uint8Array.from(values.flatMap((value) => Array.from(encodeVarint(value))))
}

/** 写 aux f4{t=40} 槽的 f502 ownerID（槽不存在则新建；与 attachAux 编码同构）。 */
function writeAuxOwner(record: Uint8Array, ownerId: number): Uint8Array {
  const fields = parse(record)
  if (!fields) throw new Error('[error] aux record malformed')
  const f50Value = emit([{ number: 502, wire: 0, value: ownerId }])
  const slotIndex = fields.findIndex(
    (field) =>
      field.wire === 2 &&
      field.number === 4 &&
      parse(field.value as Uint8Array)?.some(
        (child) => child.number === 1 && child.wire === 0 && child.value === 40
      )
  )
  if (slotIndex >= 0) {
    const slotFields = message(fields[slotIndex])
    const f50 = slotFields.find((child) => child.number === 50 && child.wire === 2)
    if (f50) f50.value = f50Value
    else slotFields.push({ number: 50, wire: 2, value: f50Value })
    fields[slotIndex] = { ...fields[slotIndex], value: emit(slotFields) }
  } else {
    fields.push({
      number: 4,
      wire: 2,
      value: emit([
        { number: 1, wire: 0, value: 40 },
        { number: 50, wire: 2, value: f50Value }
      ])
    })
  }
  return emit(fields)
}

/** 写实体 f5{t=40} 槽的 f501 ID 列表（槽不存在则新建；与 attachAux 编码同构）。 */
function writeEntityAuxIds(record: Uint8Array, ids: number[]): Uint8Array {
  const fields = parse(record)
  if (!fields) throw new Error('[error] entity record malformed')
  const f50Value =
    ids.length === 0 ? new Uint8Array() : emit([{ number: 501, wire: 2, value: varintBytes(ids) }])
  const slotIndex = fields.findIndex(
    (field) =>
      field.wire === 2 &&
      field.number === 5 &&
      parse(field.value as Uint8Array)?.some(
        (child) => child.number === 1 && child.wire === 0 && child.value === 40
      )
  )
  if (slotIndex >= 0) {
    const slotFields = message(fields[slotIndex])
    const f50 = slotFields.find((child) => child.number === 50 && child.wire === 2)
    if (f50) f50.value = f50Value
    else slotFields.push({ number: 50, wire: 2, value: f50Value })
    fields[slotIndex] = { ...fields[slotIndex], value: emit(slotFields) }
  } else {
    fields.push({
      number: 5,
      wire: 2,
      value: emit([
        { number: 1, wire: 0, value: 40 },
        { number: 50, wire: 2, value: f50Value }
      ])
    })
  }
  return emit(fields)
}

/** 改写 aux f12{f1} 的宿主 ID（实体挂载样本 f12={f1: 宿主ID}，非空）。 */
function withAuxHostId(record: Uint8Array, hostId: number): Uint8Array {
  const fields = parse(record)
  if (!fields) throw new Error('[error] aux record malformed')
  const f12 = fields.find((field) => field.number === 12 && field.wire === 2)
  if (!f12) return record
  const inner = parse(f12.value as Uint8Array)
  const f1 = inner?.find((field) => field.number === 1 && field.wire === 0)
  if (!f1) return record
  f1.value = hostId
  f12.value = emit(inner!)
  return emit(fields)
}

/** 把旧实体记录的 f5{t=40} 挂接槽整体带到新记录（覆盖 definition 自带空槽）。 */
function carryAuxSlot(from: Uint8Array, to: Uint8Array): Uint8Array {
  const fromFields = parse(from)
  const slot = fromFields?.find(
    (field) =>
      field.wire === 2 &&
      field.number === 5 &&
      parse(field.value as Uint8Array)?.some(
        (child) => child.number === 1 && child.wire === 0 && child.value === 40
      )
  )
  if (!slot) return to
  const toFields = parse(to)
  if (!toFields) throw new Error('[error] entity record malformed')
  const existingIndex = toFields.findIndex(
    (field) =>
      field.wire === 2 &&
      field.number === 5 &&
      parse(field.value as Uint8Array)?.some(
        (child) => child.number === 1 && child.wire === 0 && child.value === 40
      )
  )
  if (existingIndex >= 0) toFields[existingIndex] = slot
  else toFields.push(slot)
  return emit(toFields)
}

/**
 * 把 definition 的 instance-side aux（root27.f2 中 f502=definitionId 的记录）
 * 复制一套挂到实体：新 aux ID（root27 最大 ID+1 起）、f502/f12 指向实体、
 * 实体 f5{t=40}.f50.f501 写新 aux ID 列表。无可用 aux 时返回 undefined。
 * 真实样本（1073741862 足球）：definition 与实体各有 132 条 instance-side
 * aux，除 f1/f502/f12 外逐字节一致。
 */
function attachDefinitionAuxes(
  top: WireField[],
  entityRecord: Uint8Array,
  definitionId: number,
  entityId: number
): Uint8Array | undefined {
  let root27 = top.find((field) => field.number === 27 && field.wire === 2)
  const donors = (root27 ? message(root27) : [])
    .filter((field) => field.number === 2 && field.wire === 2)
    .map((field) => field.value as Uint8Array)
    .filter((record) => auxOwnerOf(record) === definitionId)
  if (donors.length === 0) return undefined
  let nextId = 0x40000001
  if (root27) {
    for (const sub of message(root27)) {
      if (sub.wire !== 2) continue
      const id = recordId(sub.value as Uint8Array)
      if (id !== undefined && id >= nextId) nextId = id + 1
    }
  }
  const clones: Uint8Array[] = []
  for (const donor of donors) {
    let record = writeAuxOwner(donor, entityId)
    record = withAuxHostId(record, entityId)
    const fields = parse(record)
    if (!fields) throw new Error('[error] aux record malformed')
    const f1 = fields.find((field) => field.number === 1 && field.wire === 0)
    if (!f1) throw new Error('[error] aux record missing field 1')
    f1.value = nextId++
    clones.push(emit(fields))
  }
  if (!root27) {
    root27 = { number: 27, wire: 2, value: emit([]) }
    top.push(root27)
  }
  const fields = message(root27)
  for (const record of clones) fields.push({ number: 2, wire: 2, value: record })
  root27.value = emit(fields)
  return writeEntityAuxIds(entityRecord, clones.map((record) => recordId(record)!))
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

export type TabBarRegionGeometry = {
  regionType?: 'box' | 'sphere'
  regionSize?: readonly [number, number, number]
  regionRadius?: number
  regionCenter?: readonly [number, number, number]
}

/** float32 量化值规整为可读小数（如 0.10000000149011612 → 0.1）。 */
function quantizeFloat(value: number): number {
  return Number(value.toFixed(6))
}

/**
 * 解码选项卡区域几何（真实样本 exp5/exp6）：
 * 盒体 f11.f2 = {X,Y,Z} float32；球体 f1=1 + f12 = { f1=偏移子块, f2=float32 半径 }。
 * 默认盒体 1×1×1 不输出 region 字段（保持旧导出形状）；球体恒输出 regionType。
 */
export function decodeTabBarRegion(
  region: WireField | undefined
): TabBarRegionGeometry {
  if (!region) return {}
  const regionFields = parse(region.value as Uint8Array)
  if (!regionFields) return {}
  const box = regionFields.find((field) => field.number === 11 && field.wire === 2)
  if (box) {
    const boxFields = parse(box.value as Uint8Array)
    const sizeField = boxFields?.find((field) => field.number === 2 && field.wire === 2)
    if (!sizeField) return {}
    const size = floatVector(sizeField.value as Uint8Array).map(quantizeFloat) as [
      number,
      number,
      number
    ]
    const isDefault = size[0] === 1 && size[1] === 1 && size[2] === 1
    return isDefault ? {} : { regionType: 'box', regionSize: size }
  }
  const marker = regionFields.find((field) => field.number === 1 && field.wire === 0)
  const sphere = regionFields.find((field) => field.number === 12 && field.wire === 2)
  if (marker?.value !== 1 || !sphere) return {}
  const sphereFields = parse(sphere.value as Uint8Array)
  const radiusField = sphereFields?.find((field) => field.number === 2 && field.wire === 5)
  if (!radiusField) return {}
  const radius = quantizeFloat(Buffer.from(radiusField.value as Uint8Array).readFloatLE(0))
  const centerField = sphereFields?.find((field) => field.number === 1 && field.wire === 2)
  const center = centerField ? floatVector(centerField.value as Uint8Array) : [0, 0, 0]
  return {
    regionType: 'sphere',
    regionRadius: radius,
    regionCenter: [quantizeFloat(center[0]), quantizeFloat(center[1]), quantizeFloat(center[2])]
  }
}

function decodeComponent(slot: Uint8Array): GstsStaticAssemblyComponent | undefined {
  const fields = parse(slot)
  if (!fields) return undefined
  const code = firstVarint(fields, 1)
  const enabled = fields.some((field) => field.number === 2 && field.wire === 0 && field.value === 1)
  if (!enabled) return undefined
  if (code === 9) return { type: 'followMotion', preset: 'fullFollow' }
  // 2026-08-13 修正：基础运动器真实类型码为 4（原 18 为模板自带组件误判）
  if (code === 4) return { type: 'basicMotion', preset: 'default' }
  // 铭牌/文本气泡/光源默认槽（nameplate exp2 / component-investigation exp7 / 2026-08-17 灯阵差分）
  if (code === 27) return { type: 'nameplate', preset: 'default' }
  if (code === 28) return { type: 'textBubble', preset: 'default' }
  if (code === 38) return { type: 'lightSource', preset: 'default' }
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
    if (regionName && options.length) {
      return { type: 'tabBar', regionName, options, ...decodeTabBarRegion(region) }
    }
  }
  return undefined
}

export function exportEntities(bytes: Uint8Array): ExportedEntity[] {
  if (bytes.length < 24) throw new Error('[error] invalid GIL size')
  const top = parse(bytes.slice(20, -4))
  if (!top) throw new Error('[error] malformed GIL payload')
  const result: ExportedEntity[] = []
  const entityContainer = top.find((field) => field.number === 5 && field.wire === 2)
  if (!entityContainer) return result
  const entityRecords = parse(entityContainer.value as Uint8Array)
  if (!entityRecords) throw new Error('[error] malformed GIL root 5 container')
  for (const record of entityRecords
    .filter((field) => field.number === 1 && field.wire === 2)
    .map((field) => field.value as Uint8Array)) {
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
      components,
      auxIds: readEntityAuxIds(record)
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
 * 重写实体 tabBar 组件的选项标签，并补齐「初始生效」等编辑器中必填的选项字段。
 *
 * 编辑器真实编码（2026-08-25 rubik-3x3 用户手动修复后比对备份与当前样本）：
 * 每个选项是一条 f2 子消息，至少需要：
 *   f1 index（1-based）
 *   f2 短标签（UTF-8）
 *   f3 = 1（初始生效；缺省或为 0 时该选项在玩家面板不可见）
 *   f6 空字符串
 *   f503 = "<label>  序号: <index>"（两个空格）
 *   f504 = 13
 * 旧样本里出现过的 f4/f5 均为 1，编辑器保存后当前写法已不再输出；新选项按当前样本
 * 只生成上述字段。如果目标实体没有 tabBar 组件，抛错。
 */
export function setTabBarOptions(
  bytes: Uint8Array,
  entityId: number,
  options: readonly string[]
): Uint8Array {
  if (!options.length) throw new Error('[error] tab options must not be empty')
  const top = parse(bytes.slice(20, -4))
  if (!top) throw new Error('[error] malformed GIL payload')
  const top5 = top.find((field) => field.number === 5 && field.wire === 2)
  if (!top5) throw new Error('[error] entity section not found')
  const section = message(top5)
  const entityField = section.find(
    (item) =>
      item.number === 1 &&
      item.wire === 2 &&
      recordId(item.value as Uint8Array) === entityId
  )
  if (!entityField) throw new Error(`[error] entity not found: ${entityId}`)
  const fields = message(entityField)
  const slot = fields.find((field) => {
    if (field.number !== 7 || field.wire !== 2) return false
    const slotFields = parse(field.value as Uint8Array)
    if (!slotFields) return false
    const code = slotFields.find((item) => item.number === 1 && item.wire === 0)?.value
    const enabled = slotFields.find((item) => item.number === 2 && item.wire === 0)?.value
    return code === 17 && enabled === 1
  })
  if (!slot) {
    throw new Error(`[error] entity ${entityId} has no enabled tabBar component`)
  }
  const slotFields = message(slot)
  const configField = slotFields.find((field) => field.number === 27 && field.wire === 2)
  if (!configField) throw new Error('[error] tabBar component missing config field 27')
  const configFields = message(configField)
  const regionFields = configFields.filter((field) => field.number !== 2)
  const optionFields = options.map((label, index) => {
    const text = TEXT.encode(label)
    const body = [
      { number: 1, wire: 0, value: index + 1 },
      { number: 2, wire: 2, value: text },
      { number: 3, wire: 0, value: 1 },
      { number: 6, wire: 2, value: new Uint8Array() },
      { number: 503, wire: 2, value: TEXT.encode(`${label}  序号: ${index + 1}`) },
      { number: 504, wire: 0, value: 13 }
    ]
    return { number: 2, wire: 2, value: emit(body) }
  })
  configField.value = emit([...regionFields, ...optionFields])
  entityField.value = emit(fields)
  top5.value = emit(section)
  const rebuilt = emit(top)
  return buildFile(rebuilt, {
    schema: readUint32BE(bytes, 4),
    headTag: readUint32BE(bytes, 8),
    fileType: readUint32BE(bytes, 12),
    tailTag: readUint32BE(bytes, bytes.length - 4)
  })
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
    /** 目标地图 root 4 无本地 definition 时，实体 relation 需写内建资源标记 {2:1} */
    builtinResource?: boolean
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
      out.push({
        number: 2,
        wire: 2,
        value: emit([
          { number: 1, wire: 0, value: params.definitionId },
          ...(params.builtinResource ? [{ number: 2, wire: 0, value: 1 }] : [])
        ])
      })
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
  if (top5Existing) {
    for (const record of records(top, 5, 1)) {
      const id = recordId(record)
      if (id !== undefined) existingById.set(id, record)
    }
  }
  // 目标地图 root 4 本地 definition ID 集合：definitionId 不在集合内时实体是
  // “直接 res 引用”，relation 必须带内建标记 {2:1}（2026-08-07 实测：缺标记的
  // 实体编辑器加载时被忽略，用户新建实体直接复用该 ID 并覆盖注入记录）。
  // 自定义元件 ID 区间：游戏/编辑器只认 0x40400000 区间（>=1077936129）的元件
  // def/inst/entity ID。0x4000xxxx 区间的实体加载时被整体丢弃 → 地图打开为空
  // （2026-08-09 R4 空图根因；aux ID 无此限制）。
  const MIN_CUSTOM_ENTITY_ID = 1077936129 // 0x40400001
  // 自动分配只看 0x40400000 自定义块；0x40c/0x410/0x414 等系统实体
  // （默认模板/角色编辑/关卡实体）不参与“下一个实体 GUID”递增。
  const CUSTOM_ID_BLOCK_END = 0x40500000

  const localDefinitions = new Set<number>()

  // 官方直引判定：definitionId 是官方 resID 且本地无对应定义（或用户显式给了
  // donor 定义时仍走定义转换路径）。
  function findRecordExists(records: readonly Uint8Array[], id: number): boolean {
    return records.some((record) => recordId(record) === id)
  }
  if (top.find((field) => field.number === 4 && field.wire === 2)) {
    for (const record of records(top, 4, 1)) {
      const id = recordId(record)
      if (id !== undefined) localDefinitions.add(id)
    }
  }
  // 实体/定义/实例共享 ID 计数器：root 4 定义与 root 8 实例也加入占用，
  // 避免自动分配的新实体撞上已有元件/实例 ID。
  for (const id of localDefinitions) occupied.add(id)
  const top8Existing = top.find((field) => field.number === 8 && field.wire === 2)
  if (top8Existing) {
    for (const record of records(top, 8, 1)) {
      const id = recordId(record)
      if (id !== undefined) occupied.add(id)
    }
  }
  // 新建实体省略 id 时自动分配：从自定义块当前最大占用 ID 的下一个开始
  // （至少 1077936129）。
  let maxOccupied = MIN_CUSTOM_ENTITY_ID - 1
  for (const id of occupied) {
    if (id >= MIN_CUSTOM_ENTITY_ID && id < CUSTOM_ID_BLOCK_END && id > maxOccupied) {
      maxOccupied = id
    }
  }
  let nextId = maxOccupied + 1
  const resolvedEntities = params.entities.map((entity) => {
    let id = entity.id
    if (id === undefined) {
      while (occupied.has(nextId)) nextId++
      id = nextId
      nextId++
    } else {
      if (id < MIN_CUSTOM_ENTITY_ID) {
        throw new Error(
          `[error] entity ID ${id} is below the custom entity ID range (>= ${MIN_CUSTOM_ENTITY_ID}); lower IDs are dropped by the game and the map opens empty`
        )
      }
      if (occupied.has(id) && !existingById.has(id))
        throw new Error(`[error] entity ID conflict: ${id}`)
    }
    occupied.add(id)
    return { ...entity, id }
  })
  let top5 = top.find((field) => field.number === 5 && field.wire === 2)
  if (!top5) {
    top5 = { number: 5, wire: 2, value: emit([]) }
    top.push(top5)
  }
  const section = message(top5)
  for (const entity of resolvedEntities) {
    const sourceDefinitionId = entity.sourceDefinitionId ?? entity.definitionId
    // 官方直引：目标地图无本地定义时以官方骨架生成实体（f2={1:resID,2:1}、
    // f5×10/f6×15/f7×6/f8=resID，与 root 8 官方引用实例同构）。真实样本：
    // 平面实体 1077936142（after-place-official-entity.gil）
    const official = isOfficialResourceId(entity.definitionId) && !findRecordExists(params.definitions, sourceDefinitionId)
    const existing = existingById.get(entity.id)
    const base = existing ? readTransform(existing, 6) : undefined
    let color: number | undefined
    if (entity.color !== undefined) color = entity.color
    else if (existing) color = materialColorOf(existing)
    const transform = {
      position: entity.position ?? base?.position ?? [0, 0, 0],
      rotation: entity.rotation ?? base?.rotation ?? [0, 0, 0],
      scale: entity.scale ?? base?.scale ?? [1, 1, 1]
    }
    const name = entity.name ?? (existing ? entityNameOf(existing) ?? '' : '')
    let record: Uint8Array
    if (official) {
      record = buildOfficialPrefabRecord({
        id: entity.id,
        resourceId: entity.definitionId,
        name: name || (officialPrefabName(entity.definitionId) ?? ''),
        transform
      })
      if (color !== undefined) record = setMaterialColor(record, color)
    } else {
      record = entityFromDefinition(findRecord(params.definitions, sourceDefinitionId), {
        id: entity.id,
        name,
        definitionId: entity.definitionId,
        transform,
        builtinResource: !localDefinitions.has(entity.definitionId),
        ...(color !== undefined ? { color } : {})
      })
    }
    if (existing) {
      // 更新已有实体：保留旧记录挂接槽，避免更新后装饰物丢失
      record = carryAuxSlot(existing, record)
    }
    // 挂接 definition 的 instance-side aux（新建实体，或旧实体无挂接时）
    if (!existing || readEntityAuxIds(existing).length === 0) {
      const attached = attachDefinitionAuxes(top, record, sourceDefinitionId, entity.id)
      if (attached !== undefined) record = attached
    }
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
  // 地图级属性注册表（root 22）：编辑器手加带非默认 Transform 的实体时，引擎
  // 自动写入 `PropertyTransform` 条目（f1 名称 + f2.bytes=01）。CLI 此前漏写，
  // 导致 import 的实体与编辑器原生添加不完整等价（2026-08-21 真实地图差分验证：
  // 1 球/2 球均只置 01，是地图级开关，不按实体数增长）。
  // 只有本次导入存在非默认 Transform 且 root 22 尚无该条目时补写；root 22 已
  // 有内容（如铭牌等其它属性注册）时保持不动，避免覆盖用户已有注册。
  const hasCustomTransform = params.entities.some((entity) => {
    const pos = entity.position ?? [0, 0, 0]
    const rot = entity.rotation ?? [0, 0, 0]
    const scale = entity.scale ?? [1, 1, 1]
    return (
      pos.some((v) => Math.abs(v) > 1e-9) ||
      rot.some((v) => Math.abs(v) > 1e-9) ||
      scale.some((v) => Math.abs(v - 1) > 1e-9)
    )
  })
  if (hasCustomTransform) {
    const top22 = top.find((field) => field.number === 22 && field.wire === 2)
    const root22Empty = !top22 || (top22.value as Uint8Array).length === 0
    if (root22Empty) {
      const propertyTransform = emit([
        { number: 1, wire: 2, value: new TextEncoder().encode('PropertyTransform') },
        { number: 2, wire: 2, value: new Uint8Array([1]) }
      ])
      if (top22) top22.value = propertyTransform
      else top.push({ number: 22, wire: 2, value: propertyTransform })
    }
  }
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

/** 从场景实体（root 5）记录中按组件类型码移除组件槽；返回新 GIL 与实际移除清单。 */
export function removeEntityComponents(
  bytes: Uint8Array,
  entityId: number,
  typeCodes: readonly number[]
): { bytes: Uint8Array; removed: number[] } {
  const top = parse(bytes.slice(20, -4))
  if (!top) throw new Error('[error] malformed GIL payload')
  const top5 = top.find((field) => field.number === 5 && field.wire === 2)
  if (!top5) throw new Error('[error] entity section not found')
  const section = message(top5)
  const field = section.find(
    (item) =>
      item.number === 1 &&
      item.wire === 2 &&
      recordId(item.value as Uint8Array) === entityId
  )
  if (!field) throw new Error(`[error] entity not found: ${entityId}`)
  const record = field.value as Uint8Array
  const result = removeStaticAssemblyComponents(record, typeCodes, 7)
  field.value = result.bytes
  top5.value = emit(section)
  const rebuilt = emit(top)
  return {
    bytes: buildFile(rebuilt, {
      schema: readUint32BE(bytes, 4),
      headTag: readUint32BE(bytes, 8),
      fileType: readUint32BE(bytes, 12),
      tailTag: readUint32BE(bytes, bytes.length - 4)
    }),
    removed: result.removed
  }
}
