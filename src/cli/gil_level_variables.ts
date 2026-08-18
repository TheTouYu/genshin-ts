import { buildFile, readUint32BE, readVarint } from '../injector/binary.js'
import { emitWireMessage, parseWireMessage, type WireField } from './static_assembly/wire.js'

const LEVEL_ENTITY_ID = 1094713345 // 关卡实体（root5.1），承载关卡变量 f7[comp11].11
const TEXT = new TextEncoder()
const TEXT_DECODER = new TextDecoder()

export type LevelVariable = {
  name: string
  type:
    | 'entity' | 'guid' | 'int' | 'bool' | 'float' | 'str' | 'vec3'
    | 'faction' | 'config_id' | 'prefab_id'
    | 'list' | 'dict'
  value: unknown
}

function parseMessageFields(data: Uint8Array): WireField[] | undefined {
  return parseWireMessage(data)
}

function textOf(value: Uint8Array): string {
  try {
    return TEXT_DECODER.decode(value)
  } catch {
    return ''
  }
}

function utf8(value: string): Uint8Array {
  return TEXT.encode(value)
}

function firstVarint(fields: readonly WireField[] | undefined, number: number): number | undefined {
  const field = fields?.find((item) => item.number === number && item.wire === 0)
  return typeof field?.value === 'number' ? field.value : undefined
}

function firstBytes(fields: readonly WireField[] | undefined, number: number): Uint8Array | undefined {
  const field = fields?.find((item) => item.number === number && item.wire === 2)
  return field?.value instanceof Uint8Array ? field.value : undefined
}

function root5LevelEntity(top: readonly WireField[], entityId = LEVEL_ENTITY_ID): WireField | undefined {
  const root5 = top.find((f) => f.number === 5 && f.wire === 2)
  if (!root5) return undefined
  const section = parseMessageFields(root5.value as Uint8Array)
  if (!section) return undefined
  return section.find((field) => {
    if (field.number !== 1 || field.wire !== 2) return false
    const rec = field.value as Uint8Array
    const id = firstVarint(parseMessageFields(rec), 1)
    if (id === entityId) return true
    // fallback: resourceId 10003004 = 关卡实体
    return entityId === LEVEL_ENTITY_ID && firstVarint(parseMessageFields(rec), 8) === 10003004
  })
}

function levelVarComponent(record: Uint8Array): { field: WireField; message: WireField[] } | undefined {
  const fields = parseMessageFields(record)
  if (!fields) return undefined
  for (const f of fields) {
    if (f.number !== 7 || f.wire !== 2) continue
    const comp = parseMessageFields(f.value as Uint8Array)
    if (comp?.some((x) => x.number === 11 && x.wire === 2)) {
      return { field: f, message: comp }
    }
  }
  return undefined
}

function firstFloat32(fields: readonly WireField[] | undefined, number: number): number | undefined {
  const field = fields?.find((item) => item.number === number && item.wire === 5)
  return field?.value instanceof Uint8Array && field.value.length === 4
    ? Buffer.from(field.value).readFloatLE(0)
    : undefined
}

function typeNameOf(code: number): LevelVariable['type'] {
  if (code === 3) return 'int'
  if (code === 4) return 'bool'
  if (code === 5) return 'float'
  if (code === 6) return 'str'
  if (code === 12) return 'vec3'
  if (code === 1) return 'entity'
  if (code === 2) return 'guid'
  if (code === 17) return 'faction'
  if (code === 20) return 'config_id'
  if (code === 21) return 'prefab_id'
  if (code === 27) return 'dict'
  return 'list'
}

/** 解码单个列表元素（元素字段 = {f1: 值字节}） */
function decodeListElement(listCode: number, raw: Uint8Array): unknown {
  const em = parseMessageFields(raw)
  if (listCode === 11) return textOf(raw)
  if (listCode === 10) return Buffer.from(raw).readFloatLE(0)
  if (listCode === 9) {
    const v = readVarint(raw, 0)
    return v ? v.value === 1 : false
  }
  if (listCode === 15) {
    const vm = parseMessageFields(raw)
    return [firstFloat32(vm, 1) ?? 0, firstFloat32(vm, 2) ?? 0, firstFloat32(vm, 3) ?? 0]
  }
  const v = readVarint(raw, 0)
  return v ? v.value : 0
}

/** 解码 dict：读取 f37 的 parallel f501 keys + f502 values */
function decodeDictValue(f4msg: readonly WireField[] | undefined): unknown {
  const f37 = f4msg ? firstBytes(f4msg, 37) : undefined
  if (!f37) return {}
  const m = parseMessageFields(f37)
  const keys: unknown[] = []
  const vals: unknown[] = []
  for (const f of m ?? []) {
    if (f.number === 501 && f.wire === 2) {
      const em = parseMessageFields(f.value as Uint8Array)
      const b = firstBytes(em, 16)
      const keyMsg = b ? parseMessageFields(b) : undefined
      const keyStr = keyMsg ? firstBytes(keyMsg, 1) : undefined
      keys.push(keyStr ? textOf(keyStr) : (firstVarint(parseMessageFields(firstBytes(em, 13) ?? EMPTY), 1) ?? 0))
    } else if (f.number === 502 && f.wire === 2) {
      vals.push(decodeEntryValue(f.value as Uint8Array))
    }
  }
  const result: Record<string, unknown> = {}
  for (let i = 0; i < keys.length && i < vals.length; i++) result[String(keys[i])] = vals[i]
  return result
}

/** 解码一个 dict 值项（f502）或任意 entry 的 value 消息 */
function decodeEntryValue(raw: Uint8Array): unknown {
  const em = parseMessageFields(raw)
  if (!em) return null
  const code = firstVarint(em, 1) ?? 27
  if (code === 3) {
    const branch = firstBytes(em, 13)
    return branch ? (firstVarint(parseMessageFields(branch), 1) ?? 0) : 0
  }
  if (code === 4) {
    const branch = firstBytes(em, 14)
    return branch ? (firstVarint(parseMessageFields(branch), 1) === 1) : false
  }
  if (code === 6) {
    const branch = firstBytes(em, 16)
    return branch ? textOf(branch) : ''
  }
  // 列表值：f<code+10> 重复元素
  const listField = code + 10
  const listBytes = firstBytes(em, listField)
  if (listBytes) {
    const lm = parseMessageFields(listBytes)
    return (lm ?? []).filter((f) => f.number === 1 && f.wire === 2).map((f) => decodeListElement(code, f.value as Uint8Array))
  }
  return null
}

function decodeValue(code: number, entry: WireField[]): unknown {
  if (code === 27) {
    const f4 = firstBytes(entry, 4)
    return decodeDictValue(parseMessageFields(f4 ?? EMPTY))
  }
  const f4 = firstBytes(entry, 4)
  if (!f4) return code === 3 ? 0 : code === 4 ? false : null
  const f4msg = parseMessageFields(f4)
  const valueField = code + 10
  const branch = firstBytes(f4msg, valueField)
  if (!branch) return code === 3 ? 0 : code === 4 ? false : null
  const branchMsg = parseMessageFields(branch)
  if (code === 3) return firstVarint(branchMsg, 1) ?? 0
  if (code === 4) return (firstVarint(branchMsg, 1) ?? 0) === 1
  if (code === 5) return firstFloat32(branchMsg, 1) ?? 0
  if (code === 6) {
    const b = firstBytes(branchMsg, 1)
    return b ? textOf(b) : ''
  }
  if (code === 12) {
    const vm = parseMessageFields(firstBytes(branchMsg, 1) ?? EMPTY)
    return [firstFloat32(vm, 1) ?? 0, firstFloat32(vm, 2) ?? 0, firstFloat32(vm, 3) ?? 0]
  }
  if (code === 1 || code === 2 || code === 17 || code === 20 || code === 21) return firstVarint(branchMsg, 1) ?? 0
  // 列表：branch 内重复 {f1: 元素}
  return (branchMsg ?? [])
    .filter((f) => f.number === 1 && f.wire === 2)
    .map((f) => decodeListElement(code, f.value as Uint8Array))
}

export function listLevelVariables(bytes: Uint8Array, entityId?: number): LevelVariable[] {
  const top = parseMessageFields(bytes.slice(20, -4))
  if (!top) throw new Error('[error] malformed GIL payload')
  const entity = root5LevelEntity(top, entityId)
  if (!entity) return []
  const comp = levelVarComponent(entity.value as Uint8Array)
  if (!comp) return []
  const f11 = comp.message.find((x) => x.number === 11 && x.wire === 2)
  if (!f11) return []
  const varsMsg = parseMessageFields(f11.value as Uint8Array)
  if (!varsMsg) return []
  const result: LevelVariable[] = []
  for (const entry of varsMsg) {
    if (entry.number !== 1 || entry.wire !== 2) continue
    const em = parseMessageFields(entry.value as Uint8Array)
    if (!em) continue
    const name = firstBytes(em, 2) ? textOf(firstBytes(em, 2)!) : ''
    const code = firstVarint(em, 3) ?? 27
    const type = typeNameOf(code)
    result.push({ name, type, value: decodeValue(code, em) })
  }
  return result
}

export function createLevelVariable(
  bytes: Uint8Array,
  name: string,
  type: 'bool' | 'int',
  value?: number | boolean,
  entityId?: number
): { bytes: Uint8Array; name: string } {
  const top = parseMessageFields(bytes.slice(20, -4))
  if (!top) throw new Error('[error] malformed GIL payload')
  const root5 = top.find((f) => f.number === 5 && f.wire === 2)
  if (!root5) throw new Error('[error] root 5 not found')
  const section = parseMessageFields(root5.value as Uint8Array)
  if (!section) throw new Error('[error] invalid root 5 section')
  const targetEntity = entityId ?? LEVEL_ENTITY_ID
  const entityIdx = section.findIndex((f) => {
    if (f.number !== 1 || f.wire !== 2) return false
    const rec = f.value as Uint8Array
    return (
      firstVarint(parseMessageFields(rec), 1) === targetEntity ||
      (targetEntity === LEVEL_ENTITY_ID && firstVarint(parseMessageFields(rec), 8) === 10003004)
    )
  })
  if (entityIdx < 0) throw new Error('[error] level entity not found')
  const entity = section[entityIdx]
  const entityFields = parseMessageFields(entity.value as Uint8Array)
  if (!entityFields) throw new Error('[error] invalid level entity')
  const f7Idx = entityFields.findIndex((f) => {
    if (f.number !== 7 || f.wire !== 2) return false
    const comp = parseMessageFields(f.value as Uint8Array)
    return comp?.some((x) => x.number === 11 && x.wire === 2)
  })
  if (f7Idx < 0) throw new Error('[error] level variable component not found')
  const f7 = entityFields[f7Idx]
  const comp = parseMessageFields(f7.value as Uint8Array)
  if (!comp) throw new Error('[error] invalid level variable component')
  const f11 = comp.find((x) => x.number === 11 && x.wire === 2)
  const varsMsg = f11 ? parseMessageFields(f11.value as Uint8Array) ?? [] : []
  const entry = buildEntry(name, type, value)
  varsMsg.push({ number: 1, wire: 2, value: entry })
  const newF11 = f11
    ? { ...f11, value: emitWireMessage(varsMsg) }
    : { number: 11, wire: 2, value: emitWireMessage(varsMsg) }
  const newComp = emitWireMessage(comp.map((x) => (x === f11 ? newF11 : x)))
  entityFields[f7Idx] = { ...f7, value: newComp }
  section[entityIdx] = { ...entity, value: emitWireMessage(entityFields) }
  root5.value = emitWireMessage(section)
  return {
    bytes: buildFile(emitWireMessage(top), {
      schema: readUint32BE(bytes, 4),
      headTag: readUint32BE(bytes, 8),
      fileType: readUint32BE(bytes, 12),
      tailTag: readUint32BE(bytes, bytes.length - 4)
    }),
    name
  }
}

export function updateLevelVariable(
  bytes: Uint8Array,
  name: string,
  opts: { value?: number | boolean; newName?: string },
  entityId?: number
): { bytes: Uint8Array; name: string } {
  const top = parseMessageFields(bytes.slice(20, -4))
  if (!top) throw new Error('[error] malformed GIL payload')
  const root5 = top.find((f) => f.number === 5 && f.wire === 2)
  if (!root5) throw new Error('[error] root 5 not found')
  const section = parseMessageFields(root5.value as Uint8Array)
  if (!section) throw new Error('[error] invalid root 5 section')
  const targetEntity = entityId ?? LEVEL_ENTITY_ID
  const entityIdx = section.findIndex((f) => {
    if (f.number !== 1 || f.wire !== 2) return false
    const rec = f.value as Uint8Array
    return (
      firstVarint(parseMessageFields(rec), 1) === targetEntity ||
      (targetEntity === LEVEL_ENTITY_ID && firstVarint(parseMessageFields(rec), 8) === 10003004)
    )
  })
  if (entityIdx < 0) throw new Error('[error] level entity not found')
  const entity = section[entityIdx]
  const entityFields = parseMessageFields(entity.value as Uint8Array)
  if (!entityFields) throw new Error('[error] invalid level entity')
  const f7Idx = entityFields.findIndex((f) => {
    if (f.number !== 7 || f.wire !== 2) return false
    const comp = parseMessageFields(f.value as Uint8Array)
    return comp?.some((x) => x.number === 11 && x.wire === 2)
  })
  if (f7Idx < 0) throw new Error('[error] level variable component not found')
  const f7 = entityFields[f7Idx]
  const comp = parseMessageFields(f7.value as Uint8Array)
  if (!comp) throw new Error('[error] invalid level variable component')
  const f11 = comp.find((x) => x.number === 11 && x.wire === 2)
  const varsMsg = f11 ? parseMessageFields(f11.value as Uint8Array) ?? [] : []
  const entryIdx = varsMsg.findIndex((x) => {
    if (x.number !== 1 || x.wire !== 2) return false
    const em = parseMessageFields(x.value as Uint8Array)
    const en = em ? firstBytes(em, 2) : undefined
    return en ? textOf(en) === name : false
  })
  if (entryIdx < 0) throw new Error(`[error] level variable not found: ${name}`)
  const entryField = varsMsg[entryIdx]
  const em = parseMessageFields(entryField.value as Uint8Array)
  if (!em) throw new Error('[error] invalid level variable entry')
  const typeCode = firstVarint(em, 3)
  const type: LevelVariable['type'] =
    typeCode === 3 ? 'int' : typeCode === 4 ? 'bool' : typeCode === 6 ? 'str' : typeCode === 27 ? 'dict' : 'list'
  let newEntry = em
  if (opts.value !== undefined && type !== 'int' && type !== 'bool') {
    throw new Error(`[error] value update for ${type} variables not yet supported`)
  }
  if (opts.value !== undefined) {
    const code = type === 'int' ? 3 : 4
    const defaultValue = type === 'int' ? Number(opts.value) : Boolean(opts.value)
    const defaultBranch =
      type === 'int'
        ? {
            number: 13,
            wire: 2,
            value:
              defaultValue !== 0
                ? emitWireMessage([{ number: 1, wire: 0, value: Number(defaultValue) }])
                : EMPTY
          }
        : {
            number: 14,
            wire: 2,
            value: defaultValue ? emitWireMessage([{ number: 1, wire: 0, value: 1 }]) : EMPTY
          }
    newEntry = newEntry.map((x) =>
      x.number === 4 && x.wire === 2
        ? {
            ...x,
            value: emitWireMessage([
              { number: 1, wire: 0, value: code },
              {
                number: 2,
                wire: 2,
                value: emitWireMessage([
                  { number: 1, wire: 0, value: code },
                  { number: 2, wire: 2, value: EMPTY }
                ])
              },
              defaultBranch
            ])
          }
        : x
    )
  }
  if (opts.newName !== undefined) {
    newEntry = newEntry.map((x) =>
      x.number === 2 && x.wire === 2 ? { ...x, value: utf8(opts.newName!) } : x
    )
  }
  varsMsg[entryIdx] = { ...entryField, value: emitWireMessage(newEntry) }
  const newF11 = f11 ? { ...f11, value: emitWireMessage(varsMsg) } : f11!
  const newComp = emitWireMessage(comp.map((x) => (x === f11 ? newF11 : x)))
  entityFields[f7Idx] = { ...f7, value: newComp }
  section[entityIdx] = { ...entity, value: emitWireMessage(entityFields) }
  root5.value = emitWireMessage(section)
  return {
    bytes: buildFile(emitWireMessage(top), {
      schema: readUint32BE(bytes, 4),
      headTag: readUint32BE(bytes, 8),
      fileType: readUint32BE(bytes, 12),
      tailTag: readUint32BE(bytes, bytes.length - 4)
    }),
    name: opts.newName ?? name
  }
}

const EMPTY = new Uint8Array()

function buildEntry(name: string, type: 'bool' | 'int', value?: number | boolean): Uint8Array {
  const code = type === 'int' ? 3 : 4
  const defaultValue = type === 'int' ? (typeof value === 'number' ? value : 0) : Boolean(value)
  const defaultBranch =
    type === 'int'
      ? {
          number: 13,
          wire: 2,
          value:
            typeof defaultValue === 'number' && defaultValue !== 0
              ? emitWireMessage([{ number: 1, wire: 0, value: defaultValue }])
              : EMPTY
        }
      : {
          number: 14,
          wire: 2,
          value: defaultValue ? emitWireMessage([{ number: 1, wire: 0, value: 1 }]) : EMPTY
        }
  return emitWireMessage([
    { number: 2, wire: 2, value: utf8(name) },
    { number: 3, wire: 0, value: code },
    {
      number: 4,
      wire: 2,
      value: emitWireMessage([
        { number: 1, wire: 0, value: code },
        {
          number: 2,
          wire: 2,
          value: emitWireMessage([
            { number: 1, wire: 0, value: code },
            { number: 2, wire: 2, value: EMPTY }
          ])
        },
        defaultBranch
      ])
    },
    { number: 5, wire: 0, value: 1 },
    {
      number: 6,
      wire: 2,
      value: emitWireMessage([
        { number: 1, wire: 0, value: code },
        { number: 2, wire: 2, value: EMPTY }
      ])
    }
  ])
}

export type UiVarType =
  | 'entity'
  | 'guid'
  | 'int'
  | 'bool'
  | 'float'
  | 'str'
  | 'vec3'
  | 'guid_list'
  | 'int_list'
  | 'bool_list'
  | 'float_list'
  | 'str_list'
  | 'entity_list'
  | 'vec3_list'
  | 'faction'
  | 'config_id'
  | 'prefab_id'
  | 'config_id_list'
  | 'prefab_id_list'
  | 'faction_list'
  | 'dict'
export type UiDictValueType = 'str' | 'int' | 'str_list' | 'int_list'
export type UiDictPair = {
  key: string
  keyType: 'str' | 'int'
  value: string | number | readonly string[] | readonly number[]
  valueType: UiDictValueType
}

/** id 类标量（varint 编码，与 int 同构）：entity/guid/faction/config_id/prefab_id */
const ID_TYPES = new Set<UiVarType>(['entity', 'guid', 'faction', 'config_id', 'prefab_id'])
const SCALAR_TYPES = new Set<UiVarType>([
  'entity', 'guid', 'int', 'bool', 'float', 'str', 'vec3', 'faction', 'config_id', 'prefab_id'
])
const LIST_TYPES = new Set<UiVarType>([
  'guid_list', 'int_list', 'bool_list', 'float_list', 'str_list', 'entity_list', 'vec3_list',
  'config_id_list', 'prefab_id_list', 'faction_list'
])

function typeCodeOf(type: UiVarType): number {
  return (
    {
      entity: 1,
      guid: 2,
      int: 3,
      bool: 4,
      float: 5,
      str: 6,
      guid_list: 7,
      int_list: 8,
      bool_list: 9,
      float_list: 10,
      str_list: 11,
      vec3: 12,
      entity_list: 13,
      vec3_list: 15,
      faction: 17,
      config_id: 20,
      prefab_id: 21,
      config_id_list: 22,
      prefab_id_list: 23,
      faction_list: 24,
      dict: 27
    } as Record<UiVarType, number>
  )[type]
}

function float32Bytes(value: number): Uint8Array {
  const buf = Buffer.alloc(4)
  buf.writeFloatLE(value, 0)
  return new Uint8Array(buf)
}

type ScalarWireType =
  | 'int' | 'bool' | 'str' | 'float' | 'vec3'
  | 'entity' | 'guid' | 'faction' | 'config_id' | 'prefab_id'

function scalarValueWire(type: ScalarWireType, value: unknown): Uint8Array {
  if (type === 'str') return emitWireMessage([{ number: 1, wire: 2, value: utf8(String(value)) }])
  if (type === 'bool') return emitWireMessage([{ number: 1, wire: 0, value: value ? 1 : 0 }])
  if (type === 'float') return emitWireMessage([{ number: 1, wire: 5, value: float32Bytes(Number(value)) }])
  if (type === 'vec3') {
    const v = (value as readonly number[] | undefined) ?? [0, 0, 0]
    return emitWireMessage([
      { number: 1, wire: 5, value: float32Bytes(v[0] ?? 0) },
      { number: 2, wire: 5, value: float32Bytes(v[1] ?? 0) },
      { number: 3, wire: 5, value: float32Bytes(v[2] ?? 0) }
    ])
  }
  return emitWireMessage([{ number: 1, wire: 0, value: Number(value) }])
}

function listElementsWire(type: UiVarType, values: readonly unknown[]): Uint8Array {
  const elemType = type.slice(0, -5) as ScalarWireType
  return emitWireMessage(values.map((v) => ({ number: 1, wire: 2, value: scalarValueWire(elemType, v) })))
}

function scalarTypeCode(t: 'str' | 'int'): number {
  return t === 'str' ? 6 : 3
}

function dictValueTypeCode(t: UiDictValueType): number {
  return t === 'str' ? 6 : t === 'int' ? 3 : t === 'str_list' ? 11 : 8
}

/** 生成 dict 项的值消息（标量或列表）：f<type+10> = { f1: 值 } 或 重复 {f1: 值} */
function dictValueMsg(t: UiDictValueType, value: unknown): Uint8Array {
  const code = dictValueTypeCode(t)
  const env = emitWireMessage([
    { number: 1, wire: 0, value: code },
    { number: 2, wire: 2, value: emitWireMessage([{ number: 1, wire: 0, value: code }, { number: 2, wire: 2, value: EMPTY }]) }
  ])
  const valueField = code + 10
  let inner: Uint8Array
  if (t === 'str') inner = emitWireMessage([{ number: 1, wire: 2, value: utf8(String(value)) }])
  else if (t === 'int') inner = emitWireMessage([{ number: 1, wire: 0, value: Number(value) }])
  else {
    const isStrList = t === 'str_list'
    inner = emitWireMessage(
      (value as readonly unknown[]).map((v) => ({
        number: 1,
        wire: 2,
        value: isStrList
          ? emitWireMessage([{ number: 1, wire: 2, value: utf8(String(v)) }])
          : emitWireMessage([{ number: 1, wire: 0, value: Number(v) }])
      }))
    )
  }
  return emitWireMessage([
    { number: 1, wire: 0, value: code },
    { number: 2, wire: 2, value: env },
    { number: valueField, wire: 2, value: inner }
  ])
}

function dictWire(pairs: readonly UiDictPair[], entityBase: number): Uint8Array {
  const keyField = (p: UiDictPair) => ({
    number: 501,
    wire: 2,
    value: emitWireMessage([
      { number: 1, wire: 0, value: scalarTypeCode(p.keyType) },
      { number: 2, wire: 2, value: emitWireMessage([{ number: 1, wire: 0, value: scalarTypeCode(p.keyType) }, { number: 2, wire: 2, value: EMPTY }]) },
      { number: 16, wire: 2, value: emitWireMessage([{ number: 1, wire: 2, value: utf8(p.key) }]) }
    ])
  })
  const valueField = (p: UiDictPair) => ({
    number: 502,
    wire: 2,
    value: dictValueMsg(p.valueType, p.value)
  })
  // Map(25) 实体映射层：每对分配一个实体 ID
  const mapEntries = pairs.map((p, i) => ({
    number: 1,
    wire: 2,
    value: emitWireMessage([
      { number: 1, wire: 0, value: 25 },
      {
        number: 2,
        wire: 2,
        value: emitWireMessage([
          { number: 1, wire: 0, value: 25 },
          { number: 2, wire: 2, value: emitWireMessage([{ number: 2, wire: 0, value: 63 }, { number: 502, wire: 0, value: scalarTypeCode(p.keyType) }, { number: 503, wire: 0, value: dictValueTypeCode(p.valueType) }]) }
        ])
      },
      {
        number: 35,
        wire: 2,
        value: emitWireMessage([
          { number: 1, wire: 2, value: emitWireMessage([{ number: 1, wire: 0, value: scalarTypeCode(p.keyType) }, { number: 2, wire: 2, value: emitWireMessage([{ number: 1, wire: 0, value: scalarTypeCode(p.keyType) }, { number: 2, wire: 2, value: EMPTY }]) }, { number: 16, wire: 2, value: emitWireMessage([{ number: 1, wire: 2, value: utf8(p.key) }]) }]) },
          { number: 1, wire: 2, value: dictValueMsg(p.valueType, p.value) },
          { number: 501, wire: 0, value: 63 },
          { number: 502, wire: 2, value: emitWireMessage([{ number: 2, wire: 0, value: 28 }, { number: 4, wire: 0, value: entityBase + i }]) }
        ])
      }
    ])
  }))
  return emitWireMessage([
    ...mapEntries,
    ...pairs.map(keyField),
    ...pairs.map(valueField),
    { number: 503, wire: 0, value: 6 },
    { number: 504, wire: 0, value: dictValueTypeCode(pairs[0]?.valueType ?? 'str') }
  ])
}

function buildTypedEntry(name: string, type: UiVarType, value?: unknown, entityBase?: number): Uint8Array {
  const code = typeCodeOf(type)
  let defaultWire: Uint8Array = EMPTY
  if (type === 'dict') {
    const pairs = (value as UiDictPair[]) ?? []
    const keyType = scalarTypeCode(pairs[0]?.keyType ?? 'str')
    const valueType = dictValueTypeCode(pairs[0]?.valueType ?? 'str')
    defaultWire = emitWireMessage([
      { number: 1, wire: 0, value: 27 },
      {
        number: 2,
        wire: 2,
        value: emitWireMessage([
          { number: 1, wire: 0, value: 27 },
          { number: 2, wire: 2, value: emitWireMessage([{ number: 2, wire: 0, value: 63 }, { number: 502, wire: 0, value: keyType }, { number: 503, wire: 0, value: valueType }]) }
        ])
      },
      { number: 37, wire: 2, value: dictWire(pairs, entityBase ?? 1073741831) }
    ])
  } else if (SCALAR_TYPES.has(type)) {
    const valueField = code + 10
    const defaultValue =
      type === 'int' || type === 'float' || ID_TYPES.has(type) ? (value as number) ?? 0
      : type === 'bool' ? Boolean(value)
      : type === 'vec3' ? (value as readonly number[]) ?? [0, 0, 0]
      : String(value ?? '')
    defaultWire = emitWireMessage([
      { number: 1, wire: 0, value: code },
      { number: 2, wire: 2, value: emitWireMessage([{ number: 1, wire: 0, value: code }, { number: 2, wire: 2, value: EMPTY }]) },
      {
        number: valueField,
        wire: 2,
        value:
          (type === 'int' && (value as number) === 0) || (type === 'bool' && !value)
            ? EMPTY
            : scalarValueWire(type as ScalarWireType, defaultValue)
      }
    ])
  } else if (LIST_TYPES.has(type)) {
    const elemField = code + 10
    defaultWire = emitWireMessage([
      { number: 1, wire: 0, value: code },
      { number: 2, wire: 2, value: emitWireMessage([{ number: 1, wire: 0, value: code }, { number: 2, wire: 2, value: EMPTY }]) },
      { number: elemField, wire: 2, value: listElementsWire(type, (value as unknown[]) ?? []) }
    ])
  }
  const envelope = emitWireMessage([{ number: 1, wire: 0, value: code }, { number: 2, wire: 2, value: EMPTY }])
  return emitWireMessage([
    { number: 2, wire: 2, value: utf8(name) },
    { number: 3, wire: 0, value: code },
    { number: 4, wire: 2, value: defaultWire },
    { number: 5, wire: 0, value: 1 },
    { number: 6, wire: 2, value: envelope }
  ])
}

export function createLevelVariableTyped(
  bytes: Uint8Array,
  name: string,
  type: UiVarType,
  value?: unknown,
  entityId?: number
): { bytes: Uint8Array; name: string } {
  const top = parseMessageFields(bytes.slice(20, -4))
  if (!top) throw new Error('[error] malformed GIL payload')
  const root5 = top.find((f) => f.number === 5 && f.wire === 2)
  if (!root5) throw new Error('[error] root 5 not found')
  const section = parseMessageFields(root5.value as Uint8Array)
  if (!section) throw new Error('[error] invalid root 5 section')
  const targetEntity = entityId ?? LEVEL_ENTITY_ID
  const entityIdx = section.findIndex((f) => {
    if (f.number !== 1 || f.wire !== 2) return false
    const rec = f.value as Uint8Array
    return (
      firstVarint(parseMessageFields(rec), 1) === targetEntity ||
      (targetEntity === LEVEL_ENTITY_ID && firstVarint(parseMessageFields(rec), 8) === 10003004)
    )
  })
  if (entityIdx < 0) throw new Error('[error] level entity not found')
  const entity = section[entityIdx]
  const entityFields = parseMessageFields(entity.value as Uint8Array)
  if (!entityFields) throw new Error('[error] invalid level entity')
  const f7Idx = entityFields.findIndex((f) => {
    if (f.number !== 7 || f.wire !== 2) return false
    const comp = parseMessageFields(f.value as Uint8Array)
    return comp?.some((x) => x.number === 11 && x.wire === 2)
  })
  if (f7Idx < 0) throw new Error('[error] level variable component not found')
  const f7 = entityFields[f7Idx]
  const comp = parseMessageFields(f7.value as Uint8Array)
  if (!comp) throw new Error('[error] invalid level variable component')
  const f11 = comp.find((x) => x.number === 11 && x.wire === 2)
  const varsMsg = f11 ? parseMessageFields(f11.value as Uint8Array) ?? [] : []
  let entityBase = 1073741831
  for (const f of section) {
    if (f.number !== 1 || f.wire !== 2) continue
    const id = firstVarint(parseMessageFields(f.value as Uint8Array), 1)
    if (id !== undefined && id >= entityBase) entityBase = id + 1
  }
  const entry = buildTypedEntry(name, type, value, entityBase)
  varsMsg.push({ number: 1, wire: 2, value: entry })
  const newF11 = f11
    ? { ...f11, value: emitWireMessage(varsMsg) }
    : { number: 11, wire: 2, value: emitWireMessage(varsMsg) }
  const newComp = emitWireMessage(comp.map((x) => (x === f11 ? newF11 : x)))
  entityFields[f7Idx] = { ...f7, value: newComp }
  section[entityIdx] = { ...entity, value: emitWireMessage(entityFields) }
  root5.value = emitWireMessage(section)
  return {
    bytes: buildFile(emitWireMessage(top), {
      schema: readUint32BE(bytes, 4),
      headTag: readUint32BE(bytes, 8),
      fileType: readUint32BE(bytes, 12),
      tailTag: readUint32BE(bytes, bytes.length - 4)
    }),
    name
  }
}
