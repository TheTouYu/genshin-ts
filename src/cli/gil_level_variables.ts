import { buildFile, readUint32BE } from '../injector/binary.js'
import { emitWireMessage, parseWireMessage, type WireField } from './static_assembly/wire.js'

const LEVEL_ENTITY_ID = 1094713345 // 关卡实体（root5.1），承载关卡变量 f7[comp11].11
const TEXT = new TextEncoder()
const TEXT_DECODER = new TextDecoder()

export type LevelVariable = {
  name: string
  type: 'bool' | 'int'
  value: boolean | number
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

function root5LevelEntity(top: readonly WireField[]): WireField | undefined {
  const root5 = top.find((f) => f.number === 5 && f.wire === 2)
  if (!root5) return undefined
  const section = parseMessageFields(root5.value as Uint8Array)
  if (!section) return undefined
  return section.find((field) => {
    if (field.number !== 1 || field.wire !== 2) return false
    const rec = field.value as Uint8Array
    const id = firstVarint(parseMessageFields(rec), 1)
    if (id === LEVEL_ENTITY_ID) return true
    // fallback: resourceId 10003004 = 关卡实体
    return firstVarint(parseMessageFields(rec), 8) === 10003004
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

function decodeValue(type: 'bool' | 'int', entry: WireField[]): boolean | number {
  const f4 = firstBytes(entry, 4)
  if (f4) {
    const f4msg = parseMessageFields(f4)
    const branch = type === 'int' ? firstBytes(f4msg, 13) : firstBytes(f4msg, 14)
    if (branch) {
      const branchMsg = parseMessageFields(branch)
      const v = firstVarint(branchMsg, 1)
      if (type === 'int') return v ?? 0
      return v === 1
    }
    return type === 'int' ? 0 : false
  }
  return type === 'int' ? 0 : false
}

export function listLevelVariables(bytes: Uint8Array): LevelVariable[] {
  const top = parseMessageFields(bytes.slice(20, -4))
  if (!top) throw new Error('[error] malformed GIL payload')
  const entity = root5LevelEntity(top)
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
    const type = firstVarint(em, 3) === 3 ? 'int' : 'bool'
    result.push({ name, type, value: decodeValue(type, em) })
  }
  return result
}

export function createLevelVariable(
  bytes: Uint8Array,
  name: string,
  type: 'bool' | 'int',
  value?: number | boolean
): { bytes: Uint8Array; name: string } {
  const top = parseMessageFields(bytes.slice(20, -4))
  if (!top) throw new Error('[error] malformed GIL payload')
  const root5 = top.find((f) => f.number === 5 && f.wire === 2)
  if (!root5) throw new Error('[error] root 5 not found')
  const section = parseMessageFields(root5.value as Uint8Array)
  if (!section) throw new Error('[error] invalid root 5 section')
  const entityIdx = section.findIndex((f) => {
    if (f.number !== 1 || f.wire !== 2) return false
    const rec = f.value as Uint8Array
    return (
      firstVarint(parseMessageFields(rec), 1) === LEVEL_ENTITY_ID ||
      firstVarint(parseMessageFields(rec), 8) === 10003004
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
