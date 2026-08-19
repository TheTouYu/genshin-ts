import fs from 'node:fs'

import {
  applyReplacement,
  decodeUtf8,
  encodeVarint,
  parseMessage,
  readVarint
} from '../injector/binary.js'
import type { LenField } from '../injector/types.js'
import { readGilPayloadFields } from './gil_extract_utils.js'
import {
  buildDictF37Wire,
  buildDictTypeEnvelope,
  decodeDictF37,
  type UiDictPair,
  type UiDictValueType
} from './gil_level_variables.js'

export type CustomVariableType =
  | 'entity'
  | 'guid'
  | 'int'
  | 'bool'
  | 'float'
  | 'str'
  | 'guid_list'
  | 'int_list'
  | 'bool_list'
  | 'float_list'
  | 'str_list'
  | 'vec3'
  | 'entity_list'
  | 'vec3_list'
  | 'faction'
  | 'config_id'
  | 'prefab_id'
  | 'config_id_list'
  | 'prefab_id_list'
  | 'faction_list'
  | 'dict'
  | 'unknown'

export type CustomVariableDefinition = {
  name: string
  type: CustomVariableType
  typeCode: number
  initialValueWire: Uint8Array
}

export type CustomPrefabInitialCustomVariables = {
  prefabId: number
  basePrefabId?: number
  variables: readonly CustomVariableDefinition[]
}

export type CustomVariableScalarValue = bigint | boolean | number | string
export type CustomVariableVectorValue = readonly [number, number, number]
export type CustomVariableInitialValue =
  | CustomVariableScalarValue
  | CustomVariableVectorValue
  | readonly CustomVariableScalarValue[]
  | readonly CustomVariableVectorValue[]
  | readonly UiDictPair[]

export type CustomVariableUpdate = {
  name: string
  type: Exclude<CustomVariableType, 'unknown'>
  initialValue?: CustomVariableInitialValue
}

/** A declaration upserts an initial variable and uses the type default when omitted. */
export type CustomVariableDeclaration = CustomVariableUpdate

export type ApplyCustomVariableUpdatesResult = {
  bytes: Uint8Array
  changed: readonly { name: string; type: CustomVariableType }[]
  unchanged: readonly string[]
}

export type SyncPrefabCustomVariableDeclarationsResult = ApplyCustomVariableUpdatesResult & {
  synchronizedInstanceCount: number
}

/** @deprecated Use SyncPrefabCustomVariableDeclarationsResult for player or character templates. */
export type SyncPlayerCustomVariableDeclarationsResult = SyncPrefabCustomVariableDeclarationsResult

type WireField = {
  field: number
  wire: number
  keyStart: number
  lenStart?: number
  dataStart: number
  dataEnd: number
  value?: number
}

const TYPE_BY_CODE: Readonly<Record<number, CustomVariableType>> = {
  1: 'entity',
  2: 'guid',
  3: 'int',
  4: 'bool',
  5: 'float',
  6: 'str',
  7: 'guid_list',
  8: 'int_list',
  9: 'bool_list',
  10: 'float_list',
  11: 'str_list',
  12: 'vec3',
  13: 'entity_list',
  15: 'vec3_list',
  17: 'faction',
  20: 'config_id',
  21: 'prefab_id',
  22: 'config_id_list',
  23: 'prefab_id_list',
  24: 'faction_list',
  27: 'dict'
}

function fieldsOf(buf: Uint8Array): WireField[] {
  const fields: WireField[] = []
  let offset = 0
  while (offset < buf.length) {
    const keyStart = offset
    const key = readVarint(buf, offset)
    if (!key) break
    offset = key.next
    const field = key.value >> 3
    const wire = key.value & 7
    if (wire === 0) {
      const value = readVarint(buf, offset)
      if (!value) break
      fields.push({
        field,
        wire,
        keyStart,
        dataStart: offset,
        dataEnd: value.next,
        value: value.value
      })
      offset = value.next
      continue
    }
    if (wire === 1 || wire === 5) {
      const width = wire === 1 ? 8 : 4
      if (offset + width > buf.length) break
      fields.push({ field, wire, keyStart, dataStart: offset, dataEnd: offset + width })
      offset += width
      continue
    }
    if (wire === 2) {
      const lenStart = offset
      const len = readVarint(buf, offset)
      if (!len || len.next + len.value > buf.length) break
      fields.push({
        field,
        wire,
        keyStart,
        lenStart,
        dataStart: len.next,
        dataEnd: len.next + len.value
      })
      offset = len.next + len.value
      continue
    }
    break
  }
  return fields
}

function bytesField(fields: WireField[], buf: Uint8Array, field: number): Uint8Array | undefined {
  const match = fields.find((entry) => entry.field === field && entry.wire === 2)
  return match ? buf.subarray(match.dataStart, match.dataEnd) : undefined
}

function varintField(fields: WireField[], field: number): number | undefined {
  return fields.find((entry) => entry.field === field && entry.wire === 0)?.value
}

function fixed32Fields(fields: WireField[], buf: Uint8Array, field: number): number | undefined {
  const match = fields.find((entry) => entry.field === field && entry.wire === 5)
  if (!match || match.dataEnd - match.dataStart !== 4) return undefined
  return Buffer.from(buf.subarray(match.dataStart, match.dataEnd)).readFloatLE(0)
}

/** 解码 single 元素消息（f<type+10> 内的元素）：str=raw、float=fixed32、bool=varint、其余 varint。 */
function decodeElementWire(type: CustomVariableType, raw: Uint8Array): unknown {
  if (type === 'str') return decodeUtf8(raw)
  if (type === 'float') return Buffer.from(raw).readFloatLE(0)
  if (type === 'bool') {
    const v = readVarint(raw, 0)
    return v ? v.value === 1 : false
  }
  if (type === 'vec3') {
    const m = fieldsOf(raw)
    return [
      fixed32Fields(m, raw, 1) ?? 0,
      fixed32Fields(m, raw, 2) ?? 0,
      fixed32Fields(m, raw, 3) ?? 0
    ]
  }
  const v = readVarint(raw, 0)
  return v ? v.value : 0
}

/** 解码 packed 原始标量列表：raw 是元素原始字节拼接（float=fixed32，其余=varint；entity=完整 {field1 varint}）。 */
function decodePackedListValue(type: CustomVariableType, raw: Uint8Array): unknown[] {
  const elementType = type.slice(0, -5) as CustomVariableType
  if (elementType === 'float') {
    const out: number[] = []
    for (let offset = 0; offset + 4 <= raw.length; offset += 4) {
      out.push(Buffer.from(raw.subarray(offset, offset + 4)).readFloatLE(0))
    }
    return out
  }
  if (elementType === 'entity') {
    // 真实编辑器样本为完整 {field1(varint)} 拼接；兼容旧 CLI 的裸 varint 拼接。
    // 先尝试按完整 field1 消息流解析；只有整段恰好消费完才视为新格式，
    // 否则回退到旧 CLI 的裸 varint 拼接（避免旧数据首个元素恰为 8 时误判）。
    const full: number[] = []
    let fullOffset = 0
    while (fullOffset < raw.length) {
      const key = readVarint(raw, fullOffset)
      if (!key || key.value !== 8) break
      const v = readVarint(raw, key.next)
      if (!v) break
      full.push(v.value)
      fullOffset = v.next
    }
    if (fullOffset === raw.length) return full
    const fallback: number[] = []
    let fallbackOffset = 0
    while (fallbackOffset < raw.length) {
      const v = readVarint(raw, fallbackOffset)
      if (!v) break
      fallback.push(v.value)
      fallbackOffset = v.next
    }
    return fallback
  }
  const out: unknown[] = []
  let offset = 0
  while (offset < raw.length) {
    const v = readVarint(raw, offset)
    if (!v) break
    out.push(elementType === 'bool' ? v.value === 1 : v.value)
    offset = v.next
  }
  return out
}

/** 把变量定义解码为可读值（标量/列表/dict）。 */
export function decodeCustomVariableValue(definition: CustomVariableDefinition): unknown {
  const { type, initialValueWire } = definition
  if (type === 'dict') {
    return initialValueWire.length ? decodeDictF37(initialValueWire) : {}
  }
  const fields = fieldsOf(initialValueWire)
  if (LIST_TYPES.has(type)) {
    const elementType = type.slice(0, -5) as CustomVariableType
    const listFields = fields.filter((entry) => entry.field === 1)
    if (
      PACKED_LIST_TYPES.has(type) &&
      listFields.length === 1 &&
      listFields[0].wire === 2
    ) {
      return decodePackedListValue(
        type,
        initialValueWire.subarray(listFields[0].dataStart, listFields[0].dataEnd)
      )
    }
    return listFields.map((entry) => {
      if (entry.wire === 0) {
        const v = entry.value ?? 0
        return elementType === 'bool' ? v === 1 : v
      }
      if (entry.wire === 5) {
        return Buffer.from(initialValueWire.subarray(entry.dataStart, entry.dataEnd)).readFloatLE(0)
      }
      return decodeElementWire(elementType, initialValueWire.subarray(entry.dataStart, entry.dataEnd))
    })
  }
  if (type === 'str') {
    const b = bytesField(fields, initialValueWire, 1)
    return b ? decodeUtf8(b) : ''
  }
  if (type === 'bool') {
    const v = varintField(fields, 1)
    return (v ?? 0) === 1
  }
  if (type === 'float') return fixed32Fields(fields, initialValueWire, 1) ?? 0
  if (type === 'vec3') {
    const vecBytes = bytesField(fields, initialValueWire, 1)
    const vm = vecBytes ? fieldsOf(vecBytes) : undefined
    return [
      fixed32Fields(vm ?? [], vecBytes ?? new Uint8Array(), 1) ?? 0,
      fixed32Fields(vm ?? [], vecBytes ?? new Uint8Array(), 2) ?? 0,
      fixed32Fields(vm ?? [], vecBytes ?? new Uint8Array(), 3) ?? 0
    ]
  }
  return varintField(fields, 1) ?? 0
}

function encodeVarintField(field: number, value: number | bigint): Buffer {
  return Buffer.concat([
    Buffer.from(encodeVarint(field << 3)),
    Buffer.from(encodeVarintValue(value))
  ])
}

function encodeLengthField(field: number, data: Uint8Array): Buffer {
  return Buffer.concat([
    Buffer.from(encodeVarint((field << 3) | 2)),
    Buffer.from(encodeVarint(data.length)),
    Buffer.from(data)
  ])
}

function encodeStringList(values: readonly string[]): Uint8Array {
  return Buffer.concat(values.map((value) => encodeLengthField(1, Buffer.from(value, 'utf8'))))
}

const LIST_TYPES = new Set<CustomVariableType>([
  'guid_list',
  'int_list',
  'bool_list',
  'float_list',
  'str_list',
  'entity_list',
  'vec3_list',
  'config_id_list',
  'prefab_id_list',
  'faction_list'
])

/** 原始标量列表：编辑器/游戏使用 protobuf packed 编码（f<type+10> = 单个 {field1 length-delimited}）。 */
const PACKED_LIST_TYPES = new Set<CustomVariableType>([
  'guid_list',
  'int_list',
  'bool_list',
  'float_list',
  'entity_list',
  'config_id_list',
  'prefab_id_list',
  'faction_list'
])

function defaultInitialValue(type: CustomVariableType): CustomVariableInitialValue {
  if (type === 'bool') return false
  if (type === 'vec3') return [0, 0, 0]
  if (type === 'str') return ''
  if (type === 'int') return 0n
  if (type === 'float') return 0
  if (type === 'dict') return []
  if (LIST_TYPES.has(type)) return []
  return 0
}

function valueOf(update: CustomVariableUpdate): CustomVariableInitialValue {
  return update.initialValue === undefined ? defaultInitialValue(update.type) : update.initialValue
}

function encodeBigIntVarint(value: bigint): Uint8Array {
  if (value < 0n) throw new Error('[error] integer custom variable values must be non-negative')
  const bytes: number[] = []
  let current = value
  do {
    const byte = Number(current & 0x7fn)
    current >>= 7n
    bytes.push(current ? byte | 0x80 : byte)
  } while (current)
  return Uint8Array.from(bytes)
}

function encodeVarintValue(value: bigint | number): Uint8Array {
  return typeof value === 'bigint' ? encodeBigIntVarint(value) : encodeVarint(value)
}

function encodeFixed32Field(field: number, value: number): Buffer {
  const data = Buffer.alloc(4)
  data.writeFloatLE(value, 0)
  return Buffer.concat([Buffer.from(encodeVarint((field << 3) | 5)), data])
}

function encodeVector(value: CustomVariableVectorValue): Buffer {
  if (value.length !== 3 || value.some((item) => !Number.isFinite(item))) {
    throw new Error('[error] vec3 custom variable values must contain three finite numbers')
  }
  return Buffer.concat([
    encodeFixed32Field(1, value[0]),
    encodeFixed32Field(2, value[1]),
    encodeFixed32Field(3, value[2])
  ])
}

function encodeScalarValue(type: CustomVariableType, value: unknown): Buffer {
  if (type === 'str') {
    if (typeof value !== 'string') throw new Error('[error] str custom variable value must be a string')
    return encodeLengthField(1, Buffer.from(value, 'utf8'))
  }
  if (type === 'vec3') {
    if (!Array.isArray(value)) throw new Error('[error] vec3 custom variable value must be [x, y, z]')
    return encodeLengthField(1, encodeVector(value as unknown as CustomVariableVectorValue))
  }
  if (type === 'bool') {
    if (typeof value !== 'boolean') throw new Error('[error] bool custom variable value must be boolean')
    return encodeVarintField(1, value ? 1 : 0)
  }
  if (type === 'float') {
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('[error] float custom variable value must be finite')
    return encodeFixed32Field(1, value)
  }
  if (type === 'int') {
    if (typeof value !== 'bigint') throw new Error('[error] int custom variable value must be bigint')
    return encodeVarintField(1, value)
  }
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`[error] ${type} custom variable value must be a non-negative safe integer`)
  }
  return encodeVarintField(1, value)
}

/** 元素载荷：float=fixed32；int/bool/guid/faction/config/prefab=varint；entity={field1 varint}。 */
function encodeScalarRawValue(type: CustomVariableType, value: unknown): Uint8Array {
  if (type === 'float') {
    if (typeof value !== 'number' || !Number.isFinite(value))
      throw new Error('[error] float custom variable value must be finite')
    const data = Buffer.alloc(4)
    data.writeFloatLE(value, 0)
    return data
  }
  if (type === 'bool') {
    if (typeof value !== 'boolean')
      throw new Error('[error] bool custom variable value must be boolean')
    return encodeVarintValue(value ? 1 : 0)
  }
  if (type === 'int') {
    if (typeof value !== 'bigint')
      throw new Error('[error] int custom variable value must be bigint')
    return encodeVarintValue(value)
  }
  if (type === 'entity') {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
      throw new Error('[error] entity custom variable value must be a non-negative safe integer')
    }
    return encodeVarintField(1, value)
  }
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`[error] ${type} custom variable value must be a non-negative safe integer`)
  }
  return encodeVarintValue(value)
}

function encodeInitialValue(
  update: CustomVariableUpdate,
  entityBase = 1073741831
): Uint8Array {
  const value = valueOf(update)
  if (update.type === 'dict') {
    if (!Array.isArray(value)) {
      throw new Error('[error] dict custom variable value must be an array of UiDictPair')
    }
    return buildDictF37Wire(value as readonly UiDictPair[])
  }
  if (!LIST_TYPES.has(update.type)) return encodeScalarValue(update.type, value)
  if (!Array.isArray(value)) throw new Error(`[error] ${update.type} custom variable value must be an array`)
  const elementType = update.type.slice(0, -5) as CustomVariableType
  if (PACKED_LIST_TYPES.has(update.type)) {
    const raw = Buffer.concat(
      (value as readonly unknown[]).map((item) =>
        Buffer.from(encodeScalarRawValue(elementType, item))
      )
    )
    return encodeLengthField(1, raw)
  }
  return Buffer.concat(
    (value as readonly unknown[]).map((item) => encodeScalarValue(elementType, item))
  )
}

function codeForType(type: CustomVariableUpdate['type']): number {
  return Object.entries(TYPE_BY_CODE).find(([, candidate]) => candidate === type)?.[0]
    ? Number(Object.entries(TYPE_BY_CODE).find(([, candidate]) => candidate === type)![0])
    : (() => { throw new Error(`[error] unsupported custom variable type: ${type}`) })()
}

function encodeTypedValueEnvelope(typeCode: number): Buffer {
  return Buffer.concat([
    encodeVarintField(1, typeCode),
    encodeLengthField(
      2,
      Buffer.concat([encodeVarintField(1, typeCode), encodeLengthField(2, Buffer.alloc(0))])
    )
  ])
}

function encodeDefinition(update: CustomVariableUpdate, entityBase = 1073741831): Buffer {
  const typeCode = codeForType(update.type)
  const specializedField = typeFieldForCode(typeCode)
  if (!specializedField) throw new Error(`[error] unsupported custom variable type: ${update.type}`)
  const initial = encodeInitialValue(update, entityBase)
  // dict 的类型包裹（f4.f2 / f6）需带 {f2:marker, f502:keyType, f503:valueType}，与真实编辑器样本一致
  const envelope =
    update.type === 'dict'
      ? buildDictTypeEnvelope(valueOf(update) as readonly UiDictPair[])
      : encodeTypedValueEnvelope(typeCode)
  // dict 的 f4 = {f1:27, f2: <envelope>, f37: ...}（envelope 自带 f1:27，故显式补 f4 的 f1+f2）；
  // 非 dict 的 envelope 已含 f1+f2，直接拼接默认值字段。
  const typePayload =
    update.type === 'dict'
      ? Buffer.concat([
          encodeVarintField(1, typeCode),
          encodeLengthField(2, envelope),
          encodeLengthField(specializedField, initial)
        ])
      : Buffer.concat([envelope, encodeLengthField(specializedField, initial)])
  return Buffer.concat([
    encodeLengthField(2, Buffer.from(update.name, 'utf8')),
    encodeVarintField(3, typeCode),
    encodeLengthField(4, typePayload),
    encodeVarintField(5, 1),
    encodeLengthField(6, envelope)
  ])
}

function typeFieldForCode(typeCode: number): number | undefined {
  const type = TYPE_BY_CODE[typeCode]
  return typeCode + 10 && type !== 'unknown' ? typeCode + 10 : undefined
}

/** 变量容器路径：prefab 元件定义 = root4.1[*].8.11，场景实体 = root5.1[entity].7.11 */
type VariableContainerPath = { root: 4 | 5; container: 8 | 7 }
const PREFAB_PATH: VariableContainerPath = { root: 4, container: 8 }
const ENTITY_PATH: VariableContainerPath = { root: 5, container: 7 }

function ownerEntriesFor(payload: Uint8Array, fields: LenField[], path: VariableContainerPath): LenField[] {
  return fields.filter((field) => field.depth === 2 && field.p0 === path.root && field.p1 === 1)
}

function variableContainerFor(fields: LenField[], owner: LenField, path: VariableContainerPath): LenField | undefined {
  return fields.find(
    (field) =>
      field.depth === 4 &&
      field.p0 === path.root &&
      field.p1 === 1 &&
      field.p2 === path.container &&
      field.p3 === 11 &&
      field.dataStart >= owner.dataStart &&
      field.dataEnd <= owner.dataEnd
  )
}

function variableFieldsFor(fields: LenField[], owner: LenField, path: VariableContainerPath): LenField[] {
  return fields.filter(
    (field) =>
      field.depth === 5 &&
      field.p0 === path.root &&
      field.p1 === 1 &&
      field.p2 === path.container &&
      field.p3 === 11 &&
      field.p4 === 1 &&
      field.dataStart >= owner.dataStart &&
      field.dataEnd <= owner.dataEnd
  )
}

/** 扫描 root5 场景实体，返回当前最大实体 ID 的下限（供新建场景实体的 ID 分配使用）。 */
function entityBaseFor(payload: Uint8Array, fields: LenField[]): number {
  let base = 1073741831
  for (const owner of fields.filter((field) => field.depth === 2 && field.p0 === 5 && field.p1 === 1)) {
    const id = varintField(fieldsOf(payload.subarray(owner.dataStart, owner.dataEnd)), 1)
    if (id !== undefined && id >= base) base = id + 1
  }
  return base
}

function ownerEntries(payload: Uint8Array, fields: LenField[]): LenField[] {
  return ownerEntriesFor(payload, fields, PREFAB_PATH)
}

function ownerIdentity(
  payload: Uint8Array,
  owner: LenField
): { prefabId?: number; basePrefabId?: number } {
  const entry = fieldsOf(payload.subarray(owner.dataStart, owner.dataEnd))
  return { prefabId: varintField(entry, 1), basePrefabId: varintField(entry, 2) }
}

function variableFieldsInOwner(fields: LenField[], owner: LenField): LenField[] {
  return variableFieldsFor(fields, owner, PREFAB_PATH)
}

function parseDefinition(
  payload: Uint8Array,
  field: LenField
): CustomVariableDefinition | undefined {
  const data = payload.subarray(field.dataStart, field.dataEnd)
  const fields = fieldsOf(data)
  const nameBytes = bytesField(fields, data, 2)
  const typeCode = varintField(fields, 3)
  const typeBytes = bytesField(fields, data, 4)
  const name = nameBytes ? decodeUtf8(nameBytes) : undefined
  if (!name || typeCode === undefined || !typeBytes) return undefined
  const specialized = typeFieldForCode(typeCode)
  const typeFields = fieldsOf(typeBytes)
  const initial =
    specialized === undefined ? undefined : bytesField(typeFields, typeBytes, specialized)
  return {
    name,
    type: TYPE_BY_CODE[typeCode] ?? 'unknown',
    typeCode,
    initialValueWire: initial ? Uint8Array.from(initial) : new Uint8Array()
  }
}

export function readCustomPrefabInitialCustomVariables(params: {
  gilPath: string
  prefabId: number
}): CustomPrefabInitialCustomVariables {
  const { payload, fields } = readGilPayloadFields(params.gilPath)
  const owner = ownerEntries(payload, fields).find(
    (entry) => ownerIdentity(payload, entry).prefabId === params.prefabId
  )
  if (!owner) throw new Error(`[error] custom prefab not found: ${params.prefabId}`)
  const identity = ownerIdentity(payload, owner)
  return {
    prefabId: params.prefabId,
    basePrefabId: identity.basePrefabId,
    variables: variableFieldsInOwner(fields, owner)
      .map((field) => parseDefinition(payload, field))
      .filter((definition): definition is CustomVariableDefinition => !!definition)
  }
}

/** The caller must pass the editor-confirmed player template prefab ID. */
export function readPlayerInitialCustomVariables(params: {
  gilPath: string
  playerPrefabId: number
}) {
  return readCustomPrefabInitialCustomVariables({
    gilPath: params.gilPath,
    prefabId: params.playerPrefabId
  })
}

/** The caller must pass the editor-confirmed character template prefab ID. */
export function readCharacterInitialCustomVariables(params: {
  gilPath: string
  characterPrefabId: number
}) {
  return readCustomPrefabInitialCustomVariables({
    gilPath: params.gilPath,
    prefabId: params.characterPrefabId
  })
}

export function applyCustomPrefabInitialCustomVariableDeclarations(params: {
  gilPath: string
  prefabId: number
  declarations: readonly CustomVariableDeclaration[]
}): ApplyCustomVariableUpdatesResult {
  const existing = readCustomPrefabInitialCustomVariables({
    gilPath: params.gilPath,
    prefabId: params.prefabId
  })
  const existingNames = new Set(existing.variables.map((definition) => definition.name))
  const updates = params.declarations.filter((declaration) => existingNames.has(declaration.name))
  const additions = params.declarations.filter(
    (declaration) => !existingNames.has(declaration.name)
  )
  const updated = applyCustomPrefabInitialCustomVariableUpdates({
    gilPath: params.gilPath,
    prefabId: params.prefabId,
    updates
  })
  if (additions.length === 0) return updated

  let nextPayload = updated.bytes.subarray(20, -4)
  let nextFields = parsePayloadFields(nextPayload)
  const owner = ownerEntries(nextPayload, nextFields).find(
    (entry) => ownerIdentity(nextPayload, entry).prefabId === params.prefabId
  )
  if (!owner) throw new Error(`[error] custom prefab not found after update: ${params.prefabId}`)
  const variableContainer = variableContainerFor(nextFields, owner, PREFAB_PATH)
  if (!variableContainer)
    throw new Error(`[error] custom variable container not found: ${params.prefabId}`)
  const entityBase = entityBaseFor(nextPayload, nextFields)
  const appended = Buffer.concat([
    Buffer.from(nextPayload.subarray(variableContainer.dataStart, variableContainer.dataEnd)),
    ...additions.map((declaration) => encodeLengthField(1, encodeDefinition(declaration, entityBase)))
  ])
  nextPayload = applyReplacement(nextPayload, nextFields, variableContainer, appended)
  return {
    bytes: rebuildGilFileFromSource(updated.bytes, nextPayload),
    changed: [
      ...updated.changed,
      ...additions.map((declaration) => ({ name: declaration.name, type: declaration.type }))
    ],
    unchanged: updated.unchanged
  }
}

/**
 * Mirrors missing declarations into every template instance that explicitly references prefabId.
 * This is separate from the top-level CustomPrefab resource definition.
 */
export function syncPrefabCustomVariableDeclarations(params: {
  gilPath: string
  prefabId: number
  declarations: readonly CustomVariableDeclaration[]
}): SyncPrefabCustomVariableDeclarationsResult {
  const names = new Set(params.declarations.map((declaration) => declaration.name))
  if (names.size !== params.declarations.length) {
    throw new Error('[error] duplicate template custom variable declaration name')
  }
  const source = new Uint8Array(fs.readFileSync(params.gilPath))
  let payload: Uint8Array = Uint8Array.from(source.subarray(20, -4))
  let fields = parsePayloadFields(payload)
  let synchronizedInstanceCount = 0
  const changed: { name: string; type: CustomVariableType }[] = []
  const unchanged: string[] = []

  while (true) {
    const instances = fields.filter(
      (field) =>
        field.depth === 2 &&
        field.p0 === 5 &&
        field.p1 === 1 &&
        varintField(fieldsOf(payload.subarray(field.dataStart, field.dataEnd)), 1) ===
          params.prefabId
    )
    const instance = instances.find((candidate) => {
      const namesInInstance = new Set(
        fields
          .filter(
            (variable) =>
              variable.depth === 5 &&
              variable.p0 === 5 &&
              variable.p1 === 1 &&
              variable.p2 === 7 &&
              variable.p3 === 11 &&
              variable.p4 === 1 &&
              variable.dataStart >= candidate.dataStart &&
              variable.dataEnd <= candidate.dataEnd
          )
          .map((variable) => parseDefinition(payload, variable)?.name)
      )
      return params.declarations.some((declaration) => !namesInInstance.has(declaration.name))
    })
    if (!instance) break
    const containers = fields.filter(
      (field) =>
        field.depth === 4 &&
        field.p0 === 5 &&
        field.p1 === 1 &&
        field.p2 === 7 &&
        field.p3 === 11 &&
        field.dataStart >= instance.dataStart &&
        field.dataEnd <= instance.dataEnd
    )
    const container = containers[0]
    if (!container) break
    const existing = fields
      .filter(
        (field) =>
          field.depth === 5 &&
          field.p0 === 5 &&
          field.p1 === 1 &&
          field.p2 === 7 &&
          field.p3 === 11 &&
          field.p4 === 1 &&
          field.dataStart >= instance.dataStart &&
          field.dataEnd <= instance.dataEnd
      )
      .map((field) => parseDefinition(payload, field))
      .filter((definition): definition is CustomVariableDefinition => !!definition)
    const existingNames = new Set(existing.map((definition) => definition.name))
    const additions = params.declarations.filter(
      (declaration) => !existingNames.has(declaration.name)
    )
    if (additions.length === 0) break
    const entityBase = entityBaseFor(payload, fields)
    const appended = Buffer.concat([
      Buffer.from(payload.subarray(container.dataStart, container.dataEnd)),
      ...additions.map((declaration) => encodeLengthField(1, encodeDefinition(declaration, entityBase)))
    ])
    payload = Uint8Array.from(applyReplacement(payload, fields, container, appended))
    fields = parsePayloadFields(payload)
    synchronizedInstanceCount++
    changed.push(
      ...additions.map((declaration) => ({ name: declaration.name, type: declaration.type }))
    )
  }
  return {
    bytes: rebuildGilFileFromSource(source, payload),
    changed,
    unchanged,
    synchronizedInstanceCount
  }
}

/** @deprecated Use syncPrefabCustomVariableDeclarations with the confirmed player prefab ID. */
export function syncPlayerCustomVariableDeclarations(params: {
  gilPath: string
  playerPrefabId: number
  declarations: readonly CustomVariableDeclaration[]
}): SyncPlayerCustomVariableDeclarationsResult {
  return syncPrefabCustomVariableDeclarations({
    gilPath: params.gilPath,
    prefabId: params.playerPrefabId,
    declarations: params.declarations
  })
}

/** Synchronizes missing declarations into every instance of the confirmed character template. */
export function syncCharacterCustomVariableDeclarations(params: {
  gilPath: string
  characterPrefabId: number
  declarations: readonly CustomVariableDeclaration[]
}): SyncPrefabCustomVariableDeclarationsResult {
  return syncPrefabCustomVariableDeclarations({
    gilPath: params.gilPath,
    prefabId: params.characterPrefabId,
    declarations: params.declarations
  })
}

export function applyCustomPrefabInitialCustomVariableUpdates(params: {
  gilPath: string
  prefabId: number
  updates: readonly CustomVariableUpdate[]
}): ApplyCustomVariableUpdatesResult {
  const { payload, fields } = readGilPayloadFields(params.gilPath)
  const initialOwner = ownerEntries(payload, fields).find(
    (entry) => ownerIdentity(payload, entry).prefabId === params.prefabId
  )
  if (!initialOwner) throw new Error(`[error] custom prefab not found: ${params.prefabId}`)

  const updates = new Map(params.updates.map((update) => [update.name, update]))
  if (updates.size !== params.updates.length)
    throw new Error('[error] duplicate custom variable update name')

  let nextPayload = payload
  let nextFields = fields
  const entityBase = entityBaseFor(payload, fields)
  const changed: { name: string; type: CustomVariableType }[] = []
  const unchanged: string[] = []
  while (updates.size > 0) {
    const nextOwner = ownerEntries(nextPayload, nextFields).find(
      (entry) => ownerIdentity(nextPayload, entry).prefabId === params.prefabId
    )
    if (!nextOwner)
      throw new Error(`[error] custom prefab not found after update: ${params.prefabId}`)
    const pair = variableFieldsInOwner(nextFields, nextOwner)
      .map((variableField) => ({
        variableField,
        definition: parseDefinition(nextPayload, variableField)
      }))
      .find((item) => item.definition && updates.has(item.definition.name))
    if (!pair?.definition) break
    const { variableField, definition } = pair
    const update = updates.get(definition.name)!
    if (definition.type !== update.type) {
      throw new Error(
        `[error] custom variable type mismatch: ${definition.name}; expected ${update.type}, actual ${definition.type}`
      )
    }
    const wanted = encodeInitialValue(update, entityBase)
    if (Buffer.from(definition.initialValueWire).equals(Buffer.from(wanted))) {
      unchanged.push(definition.name)
      updates.delete(definition.name)
      continue
    }

    const variableBytes = nextPayload.subarray(variableField.dataStart, variableField.dataEnd)
    const directFields = fieldsOf(variableBytes)
    const typeField = directFields.find((field) => field.field === 4 && field.wire === 2)
    if (!typeField)
      throw new Error(`[error] custom variable type payload missing: ${definition.name}`)
    const typeBytes = variableBytes.subarray(typeField.dataStart, typeField.dataEnd)
    const specializedField = typeFieldForCode(definition.typeCode)
    const specialized = specializedField
      ? fieldsOf(typeBytes).find((field) => field.field === specializedField && field.wire === 2)
      : undefined
    if (!specialized || specializedField === undefined) {
      throw new Error(`[error] unsupported custom variable type for update: ${definition.type}`)
    }

    const replacement = encodeLengthField(specializedField, wanted)
    const rebuiltType = Buffer.concat([
      Buffer.from(typeBytes.subarray(0, specialized.keyStart)),
      replacement,
      Buffer.from(typeBytes.subarray(specialized.dataEnd))
    ])
    nextPayload = applyReplacement(
      nextPayload,
      nextFields,
      typeFieldAsPayloadField(variableField, typeField),
      rebuiltType
    )
    nextFields = parsePayloadFields(nextPayload)
    changed.push({ name: definition.name, type: definition.type })
    updates.delete(definition.name)
  }
  if (updates.size > 0)
    throw new Error(`[error] custom variable not found: ${[...updates.keys()].join(', ')}`)
  return { bytes: rebuildGilFile(params.gilPath, nextPayload), changed, unchanged }
}

function entityOwnerFor(payload: Uint8Array, fields: LenField[], entityId: number): LenField | undefined {
  return ownerEntriesFor(payload, fields, ENTITY_PATH).find((entry) => {
    const id = varintField(fieldsOf(payload.subarray(entry.dataStart, entry.dataEnd)), 1)
    return id === entityId
  })
}

/** 读取场景实体（root5.1[entity].7.11）的自定义变量（与关卡变量 entry 同构）。 */
export function readEntityCustomVariables(params: {
  gilPath: string
  entityId: number
}): { entityId: number; variables: readonly CustomVariableDefinition[] } {
  const { payload, fields } = readGilPayloadFields(params.gilPath)
  const owner = entityOwnerFor(payload, fields, params.entityId)
  if (!owner) throw new Error(`[error] scene entity not found: ${params.entityId}`)
  const variables = variableFieldsFor(fields, owner, ENTITY_PATH)
    .map((field) => parseDefinition(payload, field))
    .filter((definition): definition is CustomVariableDefinition => !!definition)
  return { entityId: params.entityId, variables }
}

/** 更新场景实体上已存在自定义变量的初始值（root5.1[entity].7.11）。 */
export function applyEntityCustomVariableUpdates(params: {
  gilPath: string
  entityId: number
  updates: readonly CustomVariableUpdate[]
}): ApplyCustomVariableUpdatesResult {
  const { payload, fields } = readGilPayloadFields(params.gilPath)
  const initialOwner = entityOwnerFor(payload, fields, params.entityId)
  if (!initialOwner) throw new Error(`[error] scene entity not found: ${params.entityId}`)
  const variableContainer = variableContainerFor(fields, initialOwner, ENTITY_PATH)
  if (!variableContainer)
    throw new Error(`[error] custom variable container not found: entity ${params.entityId}`)

  const updates = new Map(params.updates.map((update) => [update.name, update]))
  if (updates.size !== params.updates.length)
    throw new Error('[error] duplicate custom variable update name')

  let nextPayload = payload
  let nextFields = fields
  const entityBase = entityBaseFor(payload, fields)
  const changed: { name: string; type: CustomVariableType }[] = []
  const unchanged: string[] = []
  while (updates.size > 0) {
    const nextOwner = entityOwnerFor(nextPayload, nextFields, params.entityId)
    if (!nextOwner)
      throw new Error(`[error] scene entity not found after update: ${params.entityId}`)
    const pair = variableFieldsFor(nextFields, nextOwner, ENTITY_PATH)
      .map((variableField) => ({
        variableField,
        definition: parseDefinition(nextPayload, variableField)
      }))
      .find((item) => item.definition && updates.has(item.definition.name))
    if (!pair?.definition) break
    const { variableField, definition } = pair
    const update = updates.get(definition.name)!
    if (definition.type !== update.type) {
      throw new Error(
        `[error] custom variable type mismatch: ${definition.name}; expected ${update.type}, actual ${definition.type}`
      )
    }
    const wanted = encodeInitialValue(update, entityBase)
    if (Buffer.from(definition.initialValueWire).equals(Buffer.from(wanted))) {
      unchanged.push(definition.name)
      updates.delete(definition.name)
      continue
    }

    const variableBytes = nextPayload.subarray(variableField.dataStart, variableField.dataEnd)
    const directFields = fieldsOf(variableBytes)
    const typeField = directFields.find((field) => field.field === 4 && field.wire === 2)
    if (!typeField)
      throw new Error(`[error] custom variable type payload missing: ${definition.name}`)
    const typeBytes = variableBytes.subarray(typeField.dataStart, typeField.dataEnd)
    const specializedField = typeFieldForCode(definition.typeCode)
    const specialized = specializedField
      ? fieldsOf(typeBytes).find((field) => field.field === specializedField && field.wire === 2)
      : undefined
    if (!specialized || specializedField === undefined) {
      throw new Error(`[error] unsupported custom variable type for update: ${definition.type}`)
    }

    const replacement = encodeLengthField(specializedField, wanted)
    const rebuiltType = Buffer.concat([
      Buffer.from(typeBytes.subarray(0, specialized.keyStart)),
      replacement,
      Buffer.from(typeBytes.subarray(specialized.dataEnd))
    ])
    nextPayload = applyReplacement(
      nextPayload,
      nextFields,
      typeFieldAsPayloadField(variableField, typeField),
      rebuiltType
    )
    nextFields = parsePayloadFields(nextPayload)
    changed.push({ name: definition.name, type: definition.type })
    updates.delete(definition.name)
  }
  if (updates.size > 0)
    throw new Error(`[error] custom variable not found: ${[...updates.keys()].join(', ')}`)
  return { bytes: rebuildGilFile(params.gilPath, nextPayload), changed, unchanged }
}

/** 在场景实体（root5.1[entity].7.11）上声明自定义变量：已存在则更新初始值，缺失则追加。 */
export function applyEntityCustomVariableDeclarations(params: {
  gilPath: string
  entityId: number
  declarations: readonly CustomVariableDeclaration[]
}): ApplyCustomVariableUpdatesResult {
  const existing = readEntityCustomVariables({
    gilPath: params.gilPath,
    entityId: params.entityId
  })
  const existingNames = new Set(existing.variables.map((definition) => definition.name))
  const updates = params.declarations.filter((declaration) => existingNames.has(declaration.name))
  const additions = params.declarations.filter(
    (declaration) => !existingNames.has(declaration.name)
  )
  const updated = applyEntityCustomVariableUpdates({
    gilPath: params.gilPath,
    entityId: params.entityId,
    updates
  })
  if (additions.length === 0) return updated

  let nextPayload = updated.bytes.subarray(20, -4)
  let nextFields = parsePayloadFields(nextPayload)
  const owner = entityOwnerFor(nextPayload, nextFields, params.entityId)
  if (!owner) throw new Error(`[error] scene entity not found after update: ${params.entityId}`)
  const variableContainer = variableContainerFor(nextFields, owner, ENTITY_PATH)
  if (!variableContainer)
    throw new Error(`[error] custom variable container not found: entity ${params.entityId}`)
  const entityBase = entityBaseFor(nextPayload, nextFields)
  const appended = Buffer.concat([
    Buffer.from(nextPayload.subarray(variableContainer.dataStart, variableContainer.dataEnd)),
    ...additions.map((declaration) => encodeLengthField(1, encodeDefinition(declaration, entityBase)))
  ])
  nextPayload = applyReplacement(nextPayload, nextFields, variableContainer, appended)
  return {
    bytes: rebuildGilFileFromSource(updated.bytes, nextPayload),
    changed: [
      ...updated.changed,
      ...additions.map((declaration) => ({ name: declaration.name, type: declaration.type }))
    ],
    unchanged: updated.unchanged
  }
}

function typeFieldAsPayloadField(variableField: LenField, local: WireField): LenField {
  if (local.lenStart === undefined)
    throw new Error('[error] expected length-delimited type payload')
  return {
    ...variableField,
    lenOffset: variableField.dataStart + local.lenStart,
    lenSize: local.dataStart - local.lenStart,
    dataStart: variableField.dataStart + local.dataStart,
    dataEnd: variableField.dataStart + local.dataEnd
  }
}

function parsePayloadFields(payload: Uint8Array): LenField[] {
  const fields: LenField[] = []
  parseMessage(payload, 0, payload.length, 0, 0, 0, 0, 0, 0, 0, fields)
  return fields
}

function rebuildGilFile(gilPath: string, payload: Uint8Array): Uint8Array {
  return rebuildGilFileFromSource(new Uint8Array(fs.readFileSync(gilPath)), payload)
}

function rebuildGilFileFromSource(source: Uint8Array, payload: Uint8Array): Uint8Array {
  const out = Buffer.alloc(payload.length + 24)
  Buffer.from(source).copy(out, 0, 0, 20)
  new DataView(out.buffer, out.byteOffset, out.byteLength).setUint32(0, payload.length + 20, false)
  new DataView(out.buffer, out.byteOffset, out.byteLength).setUint32(16, payload.length, false)
  Buffer.from(payload).copy(out, 20)
  Buffer.from(source).copy(out, out.length - 4, source.length - 4)
  return out
}
