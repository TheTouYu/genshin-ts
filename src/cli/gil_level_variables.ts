import { buildFile, encodeVarint, readUint32BE, readVarint } from '../injector/binary.js'
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
  /** 原始类型码（1..27，含具体列表码）；update 用它与 UiVarType 精确映射 */
  typeCode: number
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

/** 原始标量列表类型码（packed 编码；str_list=11、vec3_list=15 除外）。 */
function isPackedListCode(listCode: number): boolean {
  return (
    listCode === 7 || listCode === 8 || listCode === 9 || listCode === 10 ||
    listCode === 13 || listCode === 22 || listCode === 23 || listCode === 24
  )
}

/** 解码 packed 原始标量列表：raw 是元素原始字节拼接（float=fixed32，其余=varint；entity=完整 {field1 varint}）。 */
function decodePackedList(listCode: number, raw: Uint8Array): unknown[] {
  if (listCode === 10) {
    const out: number[] = []
    for (let offset = 0; offset + 4 <= raw.length; offset += 4) {
      out.push(Buffer.from(raw.subarray(offset, offset + 4)).readFloatLE(0))
    }
    return out
  }
  if (listCode === 13) {
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
    out.push(listCode === 9 ? v.value === 1 : v.value)
    offset = v.next
  }
  return out
}

/** 解码 dict：读取 f37 的 parallel f501 keys + f502 values */
function decodeDictValue(f4msg: readonly WireField[] | undefined): unknown {
  const f37 = f4msg ? firstBytes(f4msg, 37) : undefined
  if (!f37) return {}
  return decodeDictF37(f37)
}

/** 解码一段原始 f37 字典消息（parallel f501 keys + f502 values；兼容旧 Map25 层，直接忽略 f1 记录）为普通对象。 */
export function decodeDictF37(f37: Uint8Array): unknown {
  const m = parseMessageFields(f37)
  const keys: (string | number)[] = []
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
  // int key（f13 varint）保持数字键，str key（f16）保持字符串键；JSON 输出时键会被
  // 序列化为字符串，但类型语义（UiDictPair.keyType）与编码（f13/f16）不丢失。
  const result: Record<string | number, unknown> = {}
  for (let i = 0; i < keys.length && i < vals.length; i++) result[keys[i]] = vals[i]
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
    if (!branch) return ''
    const str = firstBytes(parseMessageFields(branch), 1)
    return str ? textOf(str) : ''
  }
  if (code === 5) {
    const branch = firstBytes(em, 15)
    return branch ? (firstFloat32(parseMessageFields(branch), 1) ?? 0) : 0
  }
  if (code === 12) {
    // 与 decodeValue 一致：f22 = {1: {f1:x,f2:y,f3:z}} 稀疏；兼容旧平铺
    const branch = firstBytes(em, 22)
    if (!branch) return [0, 0, 0]
    const branchMsg = parseMessageFields(branch) ?? []
    const wrapped = firstBytes(branchMsg, 1)
    const vm = wrapped ? (parseMessageFields(wrapped) ?? []) : branchMsg
    return [
      firstFloat32(vm, 1) ?? 0,
      firstFloat32(vm, 2) ?? 0,
      firstFloat32(vm, 3) ?? 0
    ]
  }
  // 列表值：f<code+10> 重复元素；原始标量列表为 packed {field1 length-delimited}
  const listField = code + 10
  const listBytes = firstBytes(em, listField)
  if (listBytes) {
    const lm = parseMessageFields(listBytes)
    const listFields = (lm ?? []).filter((f) => f.number === 1)
    if (isPackedListCode(code) && listFields.length === 1 && listFields[0].wire === 2) {
      return decodePackedList(code, listFields[0].value as Uint8Array)
    }
    return listFields.map((f) => {
      if (f.wire === 0) return code === 9 ? (f.value as number) === 1 : f.value
      if (f.wire === 5) return Buffer.from(f.value as Uint8Array).readFloatLE(0)
      return decodeListElement(code, f.value as Uint8Array)
    })
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
    // 编辑器形态：f22 = {1: {f1:x,f2:y,f3:z}}（分量消息包在 field1 里，稀疏）；
    // 兼容旧 CLI 写过的平铺 {f1,f2,f3: fixed32}
    const wrapped = firstBytes(branchMsg, 1)
    const vm = wrapped ? (parseMessageFields(wrapped) ?? []) : branchMsg
    return [
      firstFloat32(vm, 1) ?? 0,
      firstFloat32(vm, 2) ?? 0,
      firstFloat32(vm, 3) ?? 0
    ]
  }
  if (code === 1 || code === 2 || code === 17 || code === 20 || code === 21) return firstVarint(branchMsg, 1) ?? 0
  // 列表：branch 内重复 {f1: 元素}；原始标量列表为 packed {field1 length-delimited}
  const listFields = (branchMsg ?? []).filter((f) => f.number === 1)
  if (isPackedListCode(code) && listFields.length === 1 && listFields[0].wire === 2) {
    return decodePackedList(code, listFields[0].value as Uint8Array)
  }
  return listFields.map((f) => {
    if (f.wire === 0) return code === 9 ? (f.value as number) === 1 : f.value
    if (f.wire === 5) return Buffer.from(f.value as Uint8Array).readFloatLE(0)
    return decodeListElement(code, f.value as Uint8Array)
  })
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
    result.push({ name, type, typeCode: code, value: decodeValue(code, em) })
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
  opts: { value?: unknown; newName?: string },
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
  const uiType = typeCode === undefined ? undefined : uiVarTypeFromCode(typeCode)
  let newEntry = em
  if (opts.value !== undefined) {
    if (uiType === undefined) {
      throw new Error(`[error] unknown level variable type code: ${typeCode}`)
    }
    // 新建/更新 dict 都采用无 Map25 的 f37；不再分配新场景实体
    const valueWire = buildTypedValueWire(uiType, opts.value)
    newEntry = newEntry.map((x) =>
      x.number === 4 && x.wire === 2 ? { ...x, value: valueWire } : x
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
export type UiDictValueType =
  | 'str' | 'int' | 'float'
  | 'str_list' | 'int_list' | 'bool_list' | 'float_list' | 'vec3_list'
export type UiDictPair = {
  key: string | number
  keyType: 'str' | 'int'
  value:
    | string | number
    | readonly string[] | readonly number[] | readonly boolean[]
    | readonly (readonly number[])[]
  valueType: UiDictValueType
}

/** dict key 解析：纯数字（/^-?\d+$/）→ int key（keyType:'int'，key 保持 number）；否则 str key。 */
export function dictKeyOf(raw: string): { key: string | number; keyType: 'str' | 'int' } {
  if (/^-?\d+$/.test(raw)) return { key: Number(raw), keyType: 'int' }
  return { key: raw, keyType: 'str' }
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
const PACKED_LIST_TYPES = new Set<UiVarType>([
  'guid_list', 'int_list', 'bool_list', 'float_list', 'entity_list',
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

/** 类型码 → UiVarType（typeCodeOf 的逆映射；未知码返回 undefined）。 */
export function uiVarTypeFromCode(code: number): UiVarType | undefined {
  return (
    {
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
    } as Record<number, UiVarType>
  )[code]
}

function float32Bytes(value: number): Uint8Array {
  const buf = Buffer.alloc(4)
  buf.writeFloatLE(value, 0)
  return new Uint8Array(buf)
}

type ScalarWireType =
  | 'int' | 'bool' | 'str' | 'float' | 'vec3'
  | 'entity' | 'guid' | 'faction' | 'config_id' | 'prefab_id'

/** vec3 分量消息：编辑器形态 = {f1:x, f2:y, f3:z}，零分量省略（可稀疏），全零 = 空消息
 *  （2026-08-29 v7 差分：新增变量6 = {1:{1:3.0}}、新增变量10 元素 (0,0,0) = {1:空}）。 */
function vec3ComponentsWire(v: readonly number[] | undefined): Uint8Array {
  const comps = [v?.[0] ?? 0, v?.[1] ?? 0, v?.[2] ?? 0]
  const fields: { number: number; wire: 5; value: Uint8Array }[] = []
  for (let i = 0; i < 3; i++) {
    if (comps[i] !== 0) fields.push({ number: i + 1, wire: 5, value: float32Bytes(comps[i]) })
  }
  return emitWireMessage(fields)
}

function scalarValueWire(type: ScalarWireType, value: unknown): Uint8Array {
  if (type === 'str') return emitWireMessage([{ number: 1, wire: 2, value: utf8(String(value)) }])
  if (type === 'bool') return emitWireMessage([{ number: 1, wire: 0, value: value ? 1 : 0 }])
  if (type === 'float') return emitWireMessage([{ number: 1, wire: 5, value: float32Bytes(Number(value)) }])
  if (type === 'vec3') {
    // 编辑器形态：f22 = {1: {f1:x,f2:y,f3:z}}（分量消息包在 field1 里，稀疏）
    return emitWireMessage([
      { number: 1, wire: 2, value: vec3ComponentsWire(value as readonly number[] | undefined) }
    ])
  }
  return emitWireMessage([{ number: 1, wire: 0, value: Number(value) }])
}

/** 单个列表元素 = protobuf repeated 原语：str=field1(len){raw}、int/bool/id=field1(varint)、float=field1(fixed32)、vec3=field1(len){vector} */
function scalarElementWire(type: ScalarWireType, value: unknown): WireField {
  if (type === 'str') return { number: 1, wire: 2, value: utf8(String(value)) }
  if (type === 'bool') return { number: 1, wire: 0, value: value ? 1 : 0 }
  if (type === 'float') return { number: 1, wire: 5, value: float32Bytes(Number(value)) }
  if (type === 'vec3') {
    // 编辑器形态：元素 = {1: {f1:x,f2:y,f3:z}}（分量消息包在 field1 里，稀疏）
    return {
      number: 1,
      wire: 2,
      value: vec3ComponentsWire(value as readonly number[] | undefined)
    }
  }
  return { number: 1, wire: 0, value: Number(value) }
}

/** 元素载荷：float=fixed32；int/bool/guid/faction/config/prefab=varint；entity={field1 varint}。 */
function scalarElementRawBytes(type: ScalarWireType, value: unknown): Uint8Array {
  if (type === 'float') return float32Bytes(Number(value))
  if (type === 'bool') return encodeVarint(value ? 1 : 0)
  if (type === 'entity') return emitWireMessage([{ number: 1, wire: 0, value: Number(value) }])
  return encodeVarint(Number(value))
}

function listElementsWire(type: UiVarType, values: readonly unknown[]): Uint8Array {
  const elemType = type.slice(0, -5) as ScalarWireType
  if (PACKED_LIST_TYPES.has(type)) {
    const packed = Buffer.concat(
      values.map((v) => Buffer.from(scalarElementRawBytes(elemType, v)))
    )
    return emitWireMessage([{ number: 1, wire: 2, value: packed }])
  }
  return emitWireMessage(values.map((v) => scalarElementWire(elemType, v)))
}

/** 生成 dict 项的值消息（标量或列表）：f<type+10> = { f1: 值 } 或 重复 {f1: 值} */
function dictValueMsg(t: UiDictValueType, value: unknown): Uint8Array {
  const code = dictValueTypeCode(t)
  // 真实样本的值项 env 只有两层 {f1:code, f2:{}}；旧实现多包一层 {f1:code, f2:{f1:code, f2:{}}} 导致编辑器不识别
  const env = emitWireMessage([
    { number: 1, wire: 0, value: code },
    { number: 2, wire: 2, value: EMPTY }
  ])
  const valueField = code + 10
  let inner: Uint8Array
  if (t === 'str') inner = emitWireMessage([{ number: 1, wire: 2, value: utf8(String(value)) }])
  else if (t === 'int') inner = emitWireMessage([{ number: 1, wire: 0, value: Number(value) }])
  else if (t === 'float') inner = emitWireMessage([{ number: 1, wire: 5, value: float32Bytes(Number(value)) }])
  else {
    inner = listElementsWire(t as UiVarType, (value as readonly unknown[]))
  }
  return emitWireMessage([
    { number: 1, wire: 0, value: code },
    { number: 2, wire: 2, value: env },
    { number: valueField, wire: 2, value: inner }
  ])
}

export function buildDictF37Wire(pairs: readonly UiDictPair[]): Uint8Array {
  return dictWire(pairs)
}

export function scalarTypeCode(t: 'str' | 'int'): number {
  return t === 'str' ? 6 : 3
}

export function dictValueTypeCode(t: UiDictValueType): number {
  return (
    {
      str: 6,
      int: 3,
      float: 5,
      str_list: 11,
      int_list: 8,
      bool_list: 9,
      float_list: 10,
      vec3_list: 15
    } as Record<UiDictValueType, number>
  )[t]
}

/** 编辑器真实样本（after-dict*.gil）的 dict marker（entry f4.f2/f6、Map25 f2、f35.f501 共用）。
 *  实测 8 对：(6,6)=66、(6,11)=76、(6,5)=65、(6,10)=75、(6,9)=74、(6,15)=78、
 *  (3,3)=43、(3,15)=58。
 *  拟合：marker = keyBase + valueBase；keyBase：str=60、int=40；valueBase：标量=类型码，
 *  列表=第三方 concrete_map M3 下标（bool_list=14、float_list=15、str_list=16、vec3_list=18 等）。
 *  未逐项实样验证的组合为拟合外推。 */
const DICT_MARKER_KEY_BASE: Readonly<Record<number, number>> = { 3: 40, 6: 60 }
const DICT_MARKER_VALUE_BASE: Readonly<Record<number, number>> = {
  // 标量：base = 类型码
  1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 12: 12, 17: 17, 20: 20, 21: 21,
  // 列表：base = concrete_map M3 下标（8 个实测点均命中）
  7: 12, 8: 13, 9: 14, 10: 15, 11: 16, 13: 11, 15: 18, 22: 19, 23: 20, 24: 17
}
export function dictMapMarker(keyTypeCode: number, valueTypeCode: number): number {
  const keyBase = DICT_MARKER_KEY_BASE[keyTypeCode]
  const valueBase = DICT_MARKER_VALUE_BASE[valueTypeCode]
  if (keyBase === undefined || valueBase === undefined) {
    throw new Error(`[error] unsupported dict marker (key=${keyTypeCode}, value=${valueTypeCode})`)
  }
  return keyBase + valueBase
}

/** fail closed：官方规则 = 一个字典由一种键类型 + 一种值类型唯一确定。混合键/混合值会生成
 *  f503/f504 与个别 pair 不一致的畸形 wire（引擎按单一类型解码）；编辑器样本（after-dict-keytypes
 *  等）中全部字典 pair 均同构。 */
export function assertUniformDictPairs(pairs: readonly UiDictPair[], where = 'dict'): void {
  if (pairs.length < 2) return
  const keyType = pairs[0].keyType
  const valueType = pairs[0].valueType
  const mixedKey = pairs.find((p) => p.keyType !== keyType)
  if (mixedKey) {
    throw new Error(
      `[error] ${where}: mixed dict key types (${pairs.map((p) => p.keyType).join(', ')}) — ` +
        'one dict requires one key type (纯数字键=int，其余=str，请统一)'
    )
  }
  const mixedValue = pairs.find((p) => p.valueType !== valueType)
  if (mixedValue) {
    throw new Error(
      `[error] ${where}: mixed dict value types (${pairs.map((p) => p.valueType).join(', ')}) — ` +
        'one dict requires one value type'
    )
  }
}

/** dict 类型包裹 {f1:27, f2:{f2:marker, f502:keyType, f503:valueType}}（entry f4.f2/f6 用，与真实样本一致）。 */
export function buildDictTypeEnvelope(pairs: readonly UiDictPair[]): Uint8Array {
  assertUniformDictPairs(pairs)
  const keyType = scalarTypeCode(pairs[0]?.keyType ?? 'str')
  const valueType = dictValueTypeCode(pairs[0]?.valueType ?? 'str')
  return emitWireMessage([
    { number: 1, wire: 0, value: 27 },
    {
      number: 2,
      wire: 2,
      value: emitWireMessage([
        { number: 2, wire: 0, value: dictMapMarker(keyType, valueType) },
        { number: 502, wire: 0, value: keyType },
        { number: 503, wire: 0, value: valueType }
      ])
    }
  ])
}

/** 扫描 root5 场景实体，返回当前最大实体 ID 的下限（保留给测试断言：新建 dict 不再分配新实体）。 */
export function nextEntityBaseId(bytes: Uint8Array): number {
  const top = parseMessageFields(bytes.slice(20, -4))
  if (!top) return 1073741831
  const root5 = top.find((f) => f.number === 5 && f.wire === 2)
  if (!root5) return 1073741831
  const section = parseMessageFields(root5.value as Uint8Array)
  let entityBase = 1073741831
  for (const f of section ?? []) {
    if (f.number !== 1 || f.wire !== 2) continue
    const id = firstVarint(parseMessageFields(f.value as Uint8Array), 1)
    if (id !== undefined && id >= entityBase) entityBase = id + 1
  }
  return entityBase
}

/** 生成 dict 的 f37（新建/更新同构）：parallel f501 keys + f502 values + f503/f504。
 *  新建 dict 不含 Map25 实体映射层（与编辑器新增变量5-10 真实样本一致）；
 *  Map25 层仅出现在编辑器多对历史样本（新增变量1），非新建必需。 */
function dictWire(pairs: readonly UiDictPair[]): Uint8Array {
  assertUniformDictPairs(pairs)
  const keyField = (p: UiDictPair) => ({
    number: 501,
    wire: 2,
    value: emitWireMessage([
      { number: 1, wire: 0, value: scalarTypeCode(p.keyType) },
      { number: 2, wire: 2, value: emitWireMessage([{ number: 1, wire: 0, value: scalarTypeCode(p.keyType) }, { number: 2, wire: 2, value: EMPTY }]) },
      p.keyType === 'int'
        ? { number: 13, wire: 2, value: emitWireMessage([{ number: 1, wire: 0, value: Number(p.key) }]) }
        : { number: 16, wire: 2, value: emitWireMessage([{ number: 1, wire: 2, value: utf8(String(p.key)) }]) }
    ])
  })
  const valueField = (p: UiDictPair) => ({
    number: 502,
    wire: 2,
    value: dictValueMsg(p.valueType, p.value)
  })
  return emitWireMessage([
    ...pairs.map(keyField),
    ...pairs.map(valueField),
    { number: 503, wire: 0, value: scalarTypeCode(pairs[0]?.keyType ?? 'str') },
    { number: 504, wire: 0, value: dictValueTypeCode(pairs[0]?.valueType ?? 'str') }
  ])
}

/** 生成 entry 的默认值消息（f4），与 create 共用同构编码；新建 dict 不再分配 Map25 场景实体。 */
function buildTypedValueWire(
  type: UiVarType,
  value?: unknown,
  _entityBase?: number,
  _entityIds?: readonly number[]
): Uint8Array {
  const code = typeCodeOf(type)
  if (type === 'dict') {
    const pairs = (value as UiDictPair[]) ?? []
    return emitWireMessage([
      { number: 1, wire: 0, value: 27 },
      { number: 2, wire: 2, value: buildDictTypeEnvelope(pairs) },
      { number: 37, wire: 2, value: dictWire(pairs) }
    ])
  }
  if (SCALAR_TYPES.has(type)) {
    const valueField = code + 10
    const defaultValue =
      type === 'int' || type === 'float' || ID_TYPES.has(type) ? (value as number) ?? 0
      : type === 'bool' ? Boolean(value)
      : type === 'vec3' ? (value as readonly number[]) ?? [0, 0, 0]
      : String(value ?? '')
    return emitWireMessage([
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
  }
  if (LIST_TYPES.has(type)) {
    const elemField = code + 10
    return emitWireMessage([
      { number: 1, wire: 0, value: code },
      { number: 2, wire: 2, value: emitWireMessage([{ number: 1, wire: 0, value: code }, { number: 2, wire: 2, value: EMPTY }]) },
      { number: elemField, wire: 2, value: listElementsWire(type, (value as unknown[]) ?? []) }
    ])
  }
  return EMPTY
}

function buildTypedEntry(name: string, type: UiVarType, value?: unknown, entityBase?: number): Uint8Array {
  const code = typeCodeOf(type)
  const defaultWire = buildTypedValueWire(type, value, entityBase)
  const envelope =
    type === 'dict'
      ? buildDictTypeEnvelope((value as UiDictPair[]) ?? [])
      : emitWireMessage([{ number: 1, wire: 0, value: code }, { number: 2, wire: 2, value: EMPTY }])
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
  const entry = buildTypedEntry(name, type, value, nextEntityBaseId(bytes))
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
