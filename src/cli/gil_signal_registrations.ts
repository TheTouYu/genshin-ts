import { buildFile, readUint32BE } from '../injector/binary.js'
import type { SignalParamType } from '../runtime/core.js'
import {
  emitWireMessage,
  parseWireMessage,
  printableWireText,
  type WireField
} from './static_assembly/wire.js'

export type SignalRegistrationParam = {
  name: string
  type: SignalParamType
}

export type SignalRegistrationSpec = {
  name: string
  params: readonly SignalRegistrationParam[]
  sendId: number
  monitorId: number
  serverId: number
}

// Register input: node IDs optional, auto-assigned from the highest occupied ID.
export type SignalRegistrationInput = Omit<
  SignalRegistrationSpec,
  'sendId' | 'monitorId' | 'serverId'
> & {
  sendId?: number
  monitorId?: number
  serverId?: number
}

export type RegisterSignalResult = {
  bytes: Uint8Array
  signal: SignalRegistrationSpec
  templateSignalName: string
}

export type UpdateSignalResult = RegisterSignalResult & {
  previousSignalName: string
}

export type RepairSignalResult = RegisterSignalResult & {
  status: 'repaired' | 'already-repaired'
}

type SignalIdentity = Pick<SignalRegistrationSpec, 'sendId' | 'monitorId' | 'serverId'>

type SignalIndexEntry = {
  field: WireField
  name: string
  params: SignalRegistrationParam[]
  identity: SignalIdentity
  paramEntries: WireField[]
  /** 注册表条目的 signalVersion（f6）。引擎要求与三份 CompositeDef #4 身份字段的 field5 一致
   * （2026-08-15 灯阵实证：repair 复刻模板 field5=2 但条目 signalVersion=3 → 引擎拒绝加载，
   * 用户重存统一为 4 后正常）。 */
  signalVersion: number
}

type DefinitionKind = 'send' | 'monitor' | 'server'

type ParamTemplates = {
  sourceSignal: string
  sourceParam: string
  index: WireField
  send?: WireField
  monitor?: WireField
  server?: WireField
}

type SignalPool = {
  byType: Map<SignalParamType, ParamTemplates[]>
}

const TEXT = new TextEncoder()
const SIGNAL_NODE_CLASS = 10001
const SERVER_NODE_TYPE = 20000
const CLIENT_NODE_TYPE = 20002
const SIGNAL_NODE_KIND = 22001
const MONITOR_FIXED_OUTPUTS = new Set(['事件源实体', '事件源GUID', '信号来源实体'])

export const PARAM_TYPE_CODES: Partial<Record<SignalParamType, number>> = {
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
  faction_list: 24
}

// ─────────────────────────────────────────────────────────────────────────────
// Builtin parameter layouts: byte-verbatim from editor-created signals.
// Evidence: 信号测试全参数 / 信号测试全参数-列表 (map 1073741849), verify_ping
// (map 1073741888) — descriptors verified identical across maps 1849/1850/1888.
// Each row: "n3-hex|n4-hex" per node kind; pins = canonical per-type base
// (send/monitor/server) as allocated by the editor on fresh maps; field2 = the
// per-type constant inside the send node's n3 (monitor n3 field2 = field2 + 3,
// the three fixed outputs). Same-type repeats: send +4k, monitor +k, server +k,
// field2 +k (verified for str in cube_turn/verify_ping/face_turn).
// ─────────────────────────────────────────────────────────────────────────────
type BuiltinParamLayout = {
  send: string
  mon: string
  ser: string
  pins: readonly [number, number, number]
  field2: number
}

const BUILTIN_PARAM_LAYOUTS: Partial<Record<SignalParamType, BuiltinParamLayout>> = {
  entity: {
    send: '08 03 10 01|18 01 20 01',
    mon: '08 04 10 04|18 01 20 01',
    ser: '08 03 10 01|18 01 20 01',
    pins: [69, 77, 84],
    field2: 1
  },
  guid: {
    send: '08 03 10 05|08 01 18 02 20 02',
    mon: '08 04 10 08|08 01 18 02 20 02',
    ser: '08 03 10 05|08 01 18 0e 20 0e',
    pins: [94, 113, 126],
    field2: 5
  },
  int: {
    send: '08 03|08 02 18 03 20 03',
    mon: '08 04 10 03|08 02 18 03 20 03',
    ser: '08 03|08 02 18 03 20 03',
    pins: [68, 76, 83],
    field2: 0
  },
  bool: {
    send: '08 03 10 04|08 06 18 04 20 04 aa 06 02 08 01',
    mon: '08 04 10 07|08 06 18 04 20 04 aa 06 02 08 01',
    ser: '08 03 10 04|08 06 18 05 20 05 aa 06 04 08 c1 9a 0c',
    pins: [93, 112, 125],
    field2: 4
  },
  float: {
    send: '08 03 10 01|08 04 18 05 20 05',
    mon: '08 04 10 04|08 04 18 05 20 05',
    ser: '08 03 10 01|08 04 18 07 20 07',
    pins: [90, 109, 122],
    field2: 1
  },
  str: {
    send: '08 03|08 05 18 06 20 06',
    mon: '08 04 10 03|08 05 18 06 20 06',
    ser: '08 03|08 05 18 09 20 09',
    pins: [12, 34, 40],
    field2: 0
  },
  guid_list: {
    send: '08 03 10 03|08 92 4e 18 07 20 07 b2 06 08 0a 06 08 01 18 02 20 02',
    mon: '08 04 10 06|08 92 4e 18 07 20 07 b2 06 08 0a 06 08 01 18 02 20 02',
    ser: '08 03 10 03|08 92 4e 18 0f 20 0f b2 06 08 0a 06 08 01 18 0e 20 0e',
    pins: [136, 150, 163],
    field2: 3
  },
  float_list: {
    send: '08 03 10 08|08 92 4e 18 08 20 08 b2 06 08 0a 06 08 02 18 03 20 03',
    mon: '08 04 10 0b|08 92 4e 18 08 20 08 b2 06 08 0a 06 08 02 18 03 20 03',
    ser: '08 03 10 08|08 92 4e 18 04 20 04 b2 06 08 0a 06 08 02 18 03 20 03',
    pins: [141, 155, 168],
    field2: 8
  },
  bool_list: {
    send: '08 03 10 02|08 92 4e 18 09 20 09 b2 06 0d 0a 0b 08 06 18 04 20 04 aa 06 02 08 01',
    mon: '08 04 10 05|08 92 4e 18 09 20 09 b2 06 0d 0a 0b 08 06 18 04 20 04 aa 06 02 08 01',
    ser: '08 03 10 02|08 92 4e 18 06 20 06 b2 06 0f 0a 0d 08 06 18 05 20 05 aa 06 04 08 c1 9a 0c',
    pins: [70, 78, 85],
    field2: 2
  },
  int_list: {
    send: '08 03 10 07|08 92 4e 18 0a 20 0a b2 06 08 0a 06 08 04 18 05 20 05',
    mon: '08 04 10 0a|08 92 4e 18 0a 20 0a b2 06 08 0a 06 08 04 18 05 20 05',
    ser: '08 03 10 07|08 92 4e 18 08 20 08 b2 06 08 0a 06 08 04 18 07 20 07',
    pins: [140, 154, 167],
    field2: 7
  },
  str_list: {
    send: '08 03 10 06|08 92 4e 18 0b 20 0b b2 06 08 0a 06 08 05 18 06 20 06',
    mon: '08 04 10 09|08 92 4e 18 0b 20 0b b2 06 08 0a 06 08 05 18 06 20 06',
    ser: '08 03 10 06|08 92 4e 18 0a 20 0a b2 06 08 0a 06 08 05 18 09 20 09',
    pins: [139, 153, 166],
    field2: 6
  },
  vec3: {
    send: '08 03 10 02|08 07 18 0c 20 0c',
    mon: '08 04 10 05|08 07 18 0c 20 0c',
    ser: '08 03 10 02|08 07 18 0b 20 0b',
    pins: [91, 110, 123],
    field2: 2
  },
  entity_list: {
    send: '08 03 10 02|08 92 4e 18 0d 20 0d b2 06 06 0a 04 18 01 20 01',
    mon: '08 04 10 05|08 92 4e 18 0d 20 0d b2 06 06 0a 04 18 01 20 01',
    ser: '08 03 10 02|08 92 4e 18 02 20 02 b2 06 06 0a 04 18 01 20 01',
    pins: [135, 149, 162],
    field2: 2
  },
  vec3_list: {
    send: '08 03 10 05|08 92 4e 18 0f 20 0f b2 06 08 0a 06 08 07 18 0c 20 0c',
    mon: '08 04 10 08|08 92 4e 18 0f 20 0f b2 06 08 0a 06 08 07 18 0c 20 0c',
    ser: '08 03 10 05|08 92 4e 18 0c 20 0c b2 06 08 0a 06 08 07 18 0b 20 0b',
    pins: [138, 152, 165],
    field2: 5
  },
  config_id: {
    send: '08 03 10 08|08 01 18 14 20 14',
    mon: '08 04 10 0b|08 01 18 14 20 14',
    ser: '08 03 10 08|08 01 18 12 20 12',
    pins: [97, 116, 129],
    field2: 8
  },
  prefab_id: {
    send: '08 03 10 07|08 01 18 15 20 15',
    mon: '08 04 10 0a|08 01 18 15 20 15',
    ser: '08 03 10 07|08 01 18 13 20 13',
    pins: [96, 115, 128],
    field2: 7
  },
  config_id_list: {
    send: '08 03|08 92 4e 18 16 20 16 b2 06 08 0a 06 08 01 18 14 20 14',
    mon: '08 04 10 03|08 92 4e 18 16 20 16 b2 06 08 0a 06 08 01 18 14 20 14',
    ser: '08 03|08 92 4e 18 14 20 14 b2 06 08 0a 06 08 01 18 12 20 12',
    pins: [133, 147, 160],
    field2: 0
  },
  prefab_id_list: {
    send: '08 03 10 01|08 92 4e 18 17 20 17 b2 06 08 0a 06 08 01 18 15 20 15',
    mon: '08 04 10 04|08 92 4e 18 17 20 17 b2 06 08 0a 06 08 01 18 15 20 15',
    ser: '08 03 10 01|08 92 4e 18 15 20 15 b2 06 08 0a 06 08 01 18 13 20 13',
    pins: [134, 148, 161],
    field2: 1
  }
}

// Server definition identity field 4 n2 (byte-verbatim from editor output):
// {1:10001, 2:20002, 3:22000, 5:2000} — identical in maps 1849 and 1888.
const BUILTIN_SERVER_F4_N2 = new Uint8Array([
  0x08, 0x91, 0x4e, 0x10, 0xa2, 0x9c, 0x01, 0x18, 0xf0, 0xab, 0x01, 0x28, 0xd0, 0x0f
])

// Monitor fixed outputs (byte-verbatim from editor output; canonical fresh-map pins).
const BUILTIN_MONITOR_FIXED: { name: string; n3: string; n4: string; pin: number }[] = [
  { name: '事件源实体', n3: '08 04', n4: '18 01 20 01', pin: 15 },
  { name: '事件源GUID', n3: '08 04 10 01', n4: '08 01 18 02 20 02', pin: 16 },
  { name: '信号来源实体', n3: '08 04 10 02', n4: '18 01 20 01', pin: 17 }
]

// Signal-name pin n4 messages (byte-verbatim from verify_ping; name replaced).
const BUILTIN_NAMEPIN_N4: Record<'send' | 'mon' | 'ser', string> = {
  send: '08 05 12 1b 08 05 10 01 22 05 08 01 a2 06 00 ca 06 0d 0a 0b 76 65 72 69 66 79 5f 70 69 6e 67 30 01 3a 02 08 04',
  mon: '08 05 12 1b 08 05 10 01 22 05 08 01 a2 06 00 ca 06 0d 0a 0b 76 65 72 69 66 79 5f 70 69 6e 67 30 01 3a 02 08 04',
  ser: '08 05 12 1d 08 05 10 01 22 07 08 02 aa 06 02 10 09 ca 06 0d 0a 0b 76 65 72 69 66 79 5f 70 69 6e 67 20 09 30 01 3a 02 08 04'
}
const BUILTIN_NAMEPIN_PINS: Record<'send' | 'mon' | 'ser', number> = { send: 43, mon: 44, ser: 46 }

function hexToBytes(hex: string): Uint8Array {
  const parts = hex.trim().split(/\s+/).filter(Boolean)
  return new Uint8Array(parts.map((part) => parseInt(part, 16)))
}

function splitLayout(row: string): { n3: Uint8Array; n4: Uint8Array } {
  const [n3, n4] = row.split('|')
  return { n3: hexToBytes(n3), n4: hexToBytes(n4) }
}

// Set (or add) the varint field 2 inside an n3 descriptor, keeping other fields.
function n3WithField2(n3: Uint8Array, field2: number): Uint8Array {
  const parsed = fields(n3, 'builtin n3 descriptor')
  const existing = parsed.find((entry) => entry.number === 2 && entry.wire === 0)
  const next = existing
    ? parsed.map((entry) => (entry === existing ? { ...entry, value: field2 } : entry))
    : [...parsed, { number: 2, wire: 0, value: field2 }]
  next.sort((a, b) => a.number - b.number)
  return emitWireMessage(next)
}

// Replace the signal name inside a name-pin n4 message
// (field 2 -> field 105 -> field 1 holds the name string).
function namePinWithSignal(n4: Uint8Array, name: string): Uint8Array {
  const top = fields(n4, 'builtin name pin n4')
  const inner = top.find((entry) => entry.number === 2 && entry.wire === 2)
  if (!inner) return n4
  const innerFields = message(inner, 'builtin name pin n4 field 2')
  const nextInner = innerFields.map((entry) => {
    if (entry.number !== 105 || entry.wire !== 2) return entry
    const sub = fields(entry.value as Uint8Array, 'builtin name pin name field')
    const nameField = sub.find((nested) => nested.number === 1 && nested.wire === 2)
    if (!nameField) return entry
    return { ...entry, value: emitWireMessage([{ ...nameField, value: TEXT.encode(name) }]) }
  })
  return emitWireMessage(
    top.map((entry) => (entry === inner ? { ...entry, value: emitWireMessage(nextInner) } : entry))
  )
}

const BUILTIN_PLACEHOLDER_PREFIX = 'param_'


function fields(data: Uint8Array, label: string): WireField[] {
  const result = parseWireMessage(data)
  if (!result) throw new Error(`[error] invalid ${label}`)
  return result
}

function message(field: WireField, label: string): WireField[] {
  if (field.wire !== 2) throw new Error(`[error] invalid ${label}`)
  return fields(field.value as Uint8Array, label)
}

function one(source: readonly WireField[], number: number, label: string): WireField {
  const matches = source.filter((field) => field.number === number)
  if (matches.length !== 1) {
    throw new Error(`[error] expected one ${label}, found ${matches.length}`)
  }
  return matches[0]
}

function varint(source: readonly WireField[], number: number): number | undefined {
  const field = source.find((entry) => entry.number === number && entry.wire === 0)
  return field?.value as number | undefined
}

function text(source: readonly WireField[], number: number): string | undefined {
  const field = source.find((entry) => entry.number === number && entry.wire === 2)
  return field ? printableWireText(field.value as Uint8Array) : undefined
}

function nodeIdentity(data: Uint8Array): {
  class?: number
  type?: number
  kind?: number
  id?: number
} {
  const value = fields(data, 'signal node identity')
  return {
    class: varint(value, 1),
    type: varint(value, 2),
    kind: varint(value, 3),
    id: varint(value, 5)
  }
}

function encodeNodeIdentity(type: number, id: number): Uint8Array {
  return emitWireMessage([
    { number: 1, wire: 0, value: SIGNAL_NODE_CLASS },
    { number: 2, wire: 0, value: type },
    { number: 3, wire: 0, value: SIGNAL_NODE_KIND },
    { number: 5, wire: 0, value: id }
  ])
}

function parseSignalIndexEntry(field: WireField): SignalIndexEntry | undefined {
  if (field.number !== 3 || field.wire !== 2) return undefined
  const value = message(field, 'signal index entry')
  const send = value.find((entry) => entry.number === 1 && entry.wire === 2)
  const monitor = value.find((entry) => entry.number === 2 && entry.wire === 2)
  const server = value.find((entry) => entry.number === 7 && entry.wire === 2)
  const name = text(value, 3)
  if (!send || !monitor || !server || !name) return undefined
  const sendIdentity = nodeIdentity(send.value as Uint8Array)
  const monitorIdentity = nodeIdentity(monitor.value as Uint8Array)
  const serverIdentity = nodeIdentity(server.value as Uint8Array)
  if (
    sendIdentity.class !== SIGNAL_NODE_CLASS ||
    sendIdentity.type !== SERVER_NODE_TYPE ||
    sendIdentity.kind !== SIGNAL_NODE_KIND ||
    monitorIdentity.class !== SIGNAL_NODE_CLASS ||
    monitorIdentity.type !== SERVER_NODE_TYPE ||
    monitorIdentity.kind !== SIGNAL_NODE_KIND ||
    serverIdentity.class !== SIGNAL_NODE_CLASS ||
    serverIdentity.type !== CLIENT_NODE_TYPE ||
    serverIdentity.kind !== SIGNAL_NODE_KIND ||
    !sendIdentity.id ||
    !monitorIdentity.id ||
    !serverIdentity.id
  ) {
    return undefined
  }
  const params = value
    .filter((entry) => entry.number === 4 && entry.wire === 2)
    .map((entry) => {
      const param = message(entry, 'signal index parameter')
      const code = varint(param, 2)
      const type = Object.entries(PARAM_TYPE_CODES).find(([, value]) => value === code)?.[0] as
        | SignalParamType
        | undefined
      const paramName = text(param, 1)
      if (!paramName || !type)
        throw new Error(`[error] unsupported template signal parameter type: ${code}`)
      return { name: paramName, type }
    })
  const signalVersion = varint(value, 6)
  if (signalVersion === undefined) return undefined
  return {
    field,
    name,
    params,
    signalVersion,
    identity: {
      sendId: sendIdentity.id,
      monitorId: monitorIdentity.id,
      serverId: serverIdentity.id
    },
    paramEntries: value.filter((entry) => entry.number === 4 && entry.wire === 2)
  }
}

function signalIndex(top: readonly WireField[]): { field: WireField; fields: WireField[] } {
  const field = one(top, 5, 'signal registry field 10.5')
  return { field, fields: message(field, 'signal registry') }
}

function signalEntries(indexFields: readonly WireField[]): SignalIndexEntry[] {
  return indexFields
    .map(parseSignalIndexEntry)
    .filter((entry): entry is SignalIndexEntry => !!entry)
}

function transformMessage(
  data: Uint8Array,
  transform: (field: WireField, ancestors: readonly number[]) => WireField,
  ancestors: readonly number[] = []
): Uint8Array {
  return emitWireMessage(
    fields(data, 'signal registration template').map((field) => {
      const nested =
        field.wire === 2 && printableWireText(field.value as Uint8Array) === undefined
          ? {
              ...field,
              value: transformMessage(field.value as Uint8Array, transform, [
                ...ancestors,
                field.number
              ])
            }
          : field
      return transform(nested, ancestors)
    })
  )
}

function subParamName(sub: WireField): string | undefined {
  if (sub.wire !== 2) return undefined
  if (printableWireText(sub.value as Uint8Array) !== undefined) return undefined
  const subFields = message(sub, 'parameter entry')
  const name = subFields.find((entry) => entry.number === 1 && entry.wire === 2)
  return name ? printableWireText(name.value as Uint8Array) : undefined
}

function definitionParams(wrapper: WireField, kind: DefinitionKind): WireField[] {
  const wrapperFields = message(wrapper, 'signal definition wrapper')
  const inner = wrapperFields.find((field) => field.number === 1 && field.wire === 2)
  if (!inner) return []
  const root = message(inner, 'signal definition')
  return root.filter((sub) => {
    if (sub.wire !== 2) return false
    const name = subParamName(sub)
    if (!name) return false
    if (kind === 'monitor') return sub.number === 103 && !MONITOR_FIXED_OUTPUTS.has(name)
    return sub.number === 102
  })
}

function buildParamPool(top: readonly WireField[], entries: SignalIndexEntry[]): SignalPool {
  const definitions = new Map<number, { kind: DefinitionKind; wrapper: WireField }>()
  for (const field of top) {
    if (field.number !== 2 || field.wire !== 2) continue
    const id = definitionNodeId(field)
    if (id) definitions.set(id, { kind: 'send', wrapper: field })
  }
  const byType = new Map<SignalParamType, ParamTemplates[]>()
  for (const entry of entries) {
    const kindOfId = new Map<number, DefinitionKind>([
      [entry.identity.sendId, 'send'],
      [entry.identity.monitorId, 'monitor'],
      [entry.identity.serverId, 'server']
    ])
    const defs = new Map<DefinitionKind, WireField>()
    for (const [id, kind] of kindOfId) {
      const def = definitions.get(id)
      if (def) {
        def.kind = kind
        defs.set(kind, def.wrapper)
      }
    }
    for (let i = 0; i < entry.paramEntries.length; i++) {
      const param = entry.params[i]
      if (!param) continue
      const templates: ParamTemplates = {
        sourceSignal: entry.name,
        sourceParam: param.name,
        index: entry.paramEntries[i]
      }
      for (const kind of ['send', 'monitor', 'server'] as const) {
        const def = defs.get(kind)
        if (!def) continue
        const match = definitionParams(def, kind).find((sub) => subParamName(sub) === param.name)
        if (match) templates[kind] = match
      }
      if (templates.send && templates.monitor && templates.server) {
        const existing = byType.get(param.type) ?? []
        existing.push(templates)
        byType.set(param.type, existing)
      }
    }
  }
  return { byType }
}

// Count occurrences of each parameter type in a spec.
function paramTypeCounts(params: readonly SignalRegistrationParam[]): Map<SignalParamType, number> {
  const counts = new Map<SignalParamType, number>()
  for (const param of params) counts.set(param.type, (counts.get(param.type) ?? 0) + 1)
  return counts
}

function poolCovers(pool: SignalPool, params: readonly SignalRegistrationParam[]): boolean {
  for (const [type, count] of paramTypeCounts(params)) {
    if ((pool.byType.get(type)?.length ?? 0) < count) return false
  }
  return true
}

// Generate builtin ParamTemplates for one type, k = startK .. startK+count-1.
// Same-type repeat pins: send +4k (verified for str), monitor +1k, server +1k;
// n3 field2 = layout.field2 + k (send/server), layout.field2 + 3 + k (monitor).
function builtinTemplatesFor(
  type: SignalParamType,
  count: number,
  startK: number
): ParamTemplates[] {
  const layout = BUILTIN_PARAM_LAYOUTS[type]
  if (!layout) return []
  const placeholder = BUILTIN_PLACEHOLDER_PREFIX + type
  const typeCode = PARAM_TYPE_CODES[type]
  if (typeCode === undefined) return []
  const out: ParamTemplates[] = []
  for (let offset = 0; offset < count; offset++) {
    const k = startK + offset
    const sendStep = type === 'str' ? 4 : 1
    const s = layout.pins[0] + sendStep * k
    const m = layout.pins[1] + k
    const r = layout.pins[2] + k
    const send = splitLayout(layout.send)
    const mon = splitLayout(layout.mon)
    const ser = splitLayout(layout.ser)
    out.push({
      sourceSignal: 'builtin-layouts',
      sourceParam: placeholder,
      index: {
        number: 4,
        wire: 2,
        value: emitWireMessage([
          { number: 1, wire: 2, value: TEXT.encode(placeholder) },
          { number: 2, wire: 0, value: typeCode },
          { number: 3, wire: 0, value: 1 },
          { number: 4, wire: 0, value: s },
          { number: 5, wire: 0, value: m },
          { number: 6, wire: 0, value: r }
        ])
      },
      send: {
        number: 102,
        wire: 2,
        value: emitWireMessage([
          { number: 1, wire: 2, value: TEXT.encode(placeholder) },
          { number: 2, wire: 0, value: 1 },
          { number: 3, wire: 2, value: n3WithField2(send.n3, layout.field2 + k) },
          { number: 4, wire: 2, value: send.n4 },
          { number: 8, wire: 0, value: s }
        ])
      },
      monitor: {
        number: 103,
        wire: 2,
        value: emitWireMessage([
          { number: 1, wire: 2, value: TEXT.encode(placeholder) },
          { number: 2, wire: 0, value: 1 },
          { number: 3, wire: 2, value: n3WithField2(mon.n3, layout.field2 + 3 + k) },
          { number: 4, wire: 2, value: mon.n4 },
          { number: 8, wire: 0, value: m }
        ])
      },
      server: {
        number: 102,
        wire: 2,
        value: emitWireMessage([
          { number: 1, wire: 2, value: TEXT.encode(placeholder) },
          { number: 2, wire: 0, value: 1 },
          { number: 3, wire: 2, value: n3WithField2(ser.n3, layout.field2 + k) },
          { number: 4, wire: 2, value: ser.n4 },
          { number: 8, wire: 0, value: r }
        ])
      }
    })
  }
  return out
}

// Merge map-derived templates with builtin ones for the spec's types. Same-type
// repeats beyond the map's templates are extrapolated for str only (verified
// editor pattern); other types fail closed (no real editor evidence exists).
function mergePoolFor(params: readonly SignalRegistrationParam[], mapPool: SignalPool): SignalPool {
  const byType = new Map(mapPool.byType)
  for (const [type, count] of paramTypeCounts(params)) {
    const existing = mapPool.byType.get(type) ?? []
    const missing = count - existing.length
    if (missing <= 0) continue
    if (type !== 'str') {
      // Fail closed for repeats: only the verified single layout exists for
      // non-str types; a second occurrence needs a donor signal registered in
      // the editor. A single occurrence with no map template uses builtin k=0.
      const repeat = existing.length > 0 || missing > 1
      if (repeat) {
        throw new Error(
          `[error] parameter type "${type}" needs ${count} distinct layouts, but the map provides ${existing.length}; ` +
            'builtin layouts cover one occurrence per type (verified editor bytes); ' +
            'repeated non-str params need a donor signal registered in the editor'
        )
      }
    }
    byType.set(type, [...existing, ...builtinTemplatesFor(type, missing, existing.length)])
  }
  return { byType }
}

// Build a synthetic donor template (entry + three definitions) for the builtin
// path. Definitions reuse the same builder the donor path uses, so param
// cloning, pin assignment and index assembly stay on one code path.
function builtinFixedEntry(fixed: { name: string; n3: string; n4: string; pin: number }): WireField {
  return {
    number: 103,
    wire: 2,
    value: emitWireMessage([
      { number: 1, wire: 2, value: TEXT.encode(fixed.name) },
      { number: 2, wire: 0, value: 1 },
      { number: 3, wire: 2, value: hexToBytes(fixed.n3) },
      { number: 4, wire: 2, value: hexToBytes(fixed.n4) },
      { number: 8, wire: 0, value: fixed.pin }
    ])
  }
}

// Fixed input/output pin entries (byte-verbatim from verify_ping, fresh-map
// canonical pins). n100/n101 pins: send 3/5, monitor 13, server 19/20; the
// extra server pin (field 106, no name) uses pin 45.
function builtinPins100(kind: 'send' | 'ser'): WireField {
  const pin = kind === 'send' ? 3 : 19
  return {
    number: 100,
    wire: 2,
    value: emitWireMessage([
      { number: 2, wire: 0, value: 1 },
      { number: 3, wire: 2, value: hexToBytes('08 01') },
      { number: 4, wire: 2, value: emitWireMessage([]) },
      { number: 8, wire: 0, value: pin }
    ])
  }
}
function builtinPins101(kind: 'send' | 'mon' | 'ser'): WireField {
  const pin = kind === 'send' ? 5 : kind === 'mon' ? 13 : 20
  return {
    number: 101,
    wire: 2,
    value: emitWireMessage([
      { number: 2, wire: 0, value: 1 },
      { number: 3, wire: 2, value: hexToBytes('08 02') },
      { number: 4, wire: 2, value: emitWireMessage([]) },
      { number: 8, wire: 0, value: pin }
    ])
  }
}
function builtinServerExtraPin(): WireField {
  return {
    number: 106,
    wire: 2,
    value: emitWireMessage([
      { number: 2, wire: 0, value: 1 },
      { number: 3, wire: 2, value: hexToBytes('08 05') },
      { number: 4, wire: 2, value: hexToBytes('08 02 20 03') },
      { number: 5, wire: 2, value: hexToBytes('08 05 10 01 a2 06 04 08 bc 9b 0c') },
      { number: 8, wire: 0, value: 45 }
    ])
  }
}
function builtinSignalDef(kind: 'send' | 'mon' | 'ser', signal: SignalRegistrationSpec): WireField {
  const sendIdentity = encodeNodeIdentity(SERVER_NODE_TYPE, signal.sendId)
  const monIdentity = encodeNodeIdentity(SERVER_NODE_TYPE, signal.monitorId)
  const serverIdentity = encodeNodeIdentity(CLIENT_NODE_TYPE, signal.serverId)
  // Verified against the editor's own bytes: send n107 field 3 references the
  // SERVER identity (type 20002); server n107 field 3 references the SEND identity.
  const inner =
    kind === 'mon'
      ? { 1: 1002, name: signal.name, a: sendIdentity, b: serverIdentity }
      : kind === 'ser'
        ? { 1: 1001, name: signal.name, a: monIdentity, b: sendIdentity }
        : { 1: 1001, name: signal.name, a: monIdentity, b: serverIdentity }
  const fields: WireField[] = [
    { number: 1, wire: 0, value: inner[1] },
    {
      // monitor def carries the name under field 102, send/server under 101
      number: kind === 'mon' ? 102 : 101,
      wire: 2,
      value: emitWireMessage([
        { number: 1, wire: 2, value: TEXT.encode(inner.name) },
        { number: 2, wire: 2, value: inner.a },
        { number: 3, wire: 2, value: inner.b }
      ])
    }
  ]
  return { number: 107, wire: 2, value: emitWireMessage(fields) }
}
const BUILTIN_DISPLAY: Record<'send' | 'mon' | 'ser', { text: string; kind: number }> = {
  send: { text: '发送信号', kind: 1 },
  mon: { text: '监听信号', kind: 2 },
  ser: { text: '向服务器节点图发送信号', kind: 1 }
}

function buildBuiltinTemplate(
  signal: SignalRegistrationSpec,
  pool: SignalPool
): { template: SignalIndexEntry; templateDefinitions: WireField[] } {
  const first = signal.params[0]
  const firstTemplates = pool.byType.get(first.type)?.[0]
  if (!firstTemplates) throw new Error(`[error] no layout for parameter type: ${first.type}`)
  const kinds: { kind: 'send' | 'mon' | 'ser'; entry: WireField }[] = [
    { kind: 'send', entry: firstTemplates.send! },
    { kind: 'mon', entry: firstTemplates.monitor! },
    { kind: 'ser', entry: firstTemplates.server! }
  ]
  const templateDefinitions = kinds.map(({ kind, entry }) => {
    const id =
      kind === 'send' ? signal.sendId : kind === 'mon' ? signal.monitorId : signal.serverId
    const identity = encodeNodeIdentity(
      kind === 'ser' ? CLIENT_NODE_TYPE : SERVER_NODE_TYPE,
      id
    )
    const root: WireField[] = [
      {
        number: 4,
        wire: 2,
        value: emitWireMessage([
          { number: 1, wire: 2, value: identity },
          { number: 2, wire: 2, value: kind === 'ser' ? BUILTIN_SERVER_F4_N2 : identity },
          { number: 4, wire: 2, value: emitWireMessage([]) },
          { number: 5, wire: 0, value: 2 }
        ])
      }
    ]
    if (kind !== 'mon') root.push(builtinPins100(kind))
    root.push(builtinPins101(kind))
    if (kind === 'mon') {
      for (const fixed of BUILTIN_MONITOR_FIXED) root.push(builtinFixedEntry(fixed))
    }
    root.push(entry)
    if (kind === 'ser') root.push(builtinServerExtraPin())
    root.push({
      number: 106,
      wire: 2,
      value: emitWireMessage([
        { number: 1, wire: 2, value: TEXT.encode('信号名') },
        ...(kind === 'ser'
          ? [
              { number: 2, wire: 0, value: 1 },
              { number: 3, wire: 2, value: hexToBytes('08 05 10 01') }
            ]
          : []),
        { number: 4, wire: 2, value: namePinWithSignal(hexToBytes(BUILTIN_NAMEPIN_N4[kind]), signal.name) },
        { number: 5, wire: 2, value: hexToBytes('08 06 10 01') },
        { number: 8, wire: 0, value: BUILTIN_NAMEPIN_PINS[kind] }
      ])
    })
    root.push(builtinSignalDef(kind, signal))
    root.push({ number: 200, wire: 2, value: TEXT.encode(BUILTIN_DISPLAY[kind].text) })
    root.push({ number: 203, wire: 0, value: BUILTIN_DISPLAY[kind].kind })
    root.push({ number: 204, wire: 0, value: 8 })
    return { number: 2, wire: 2, value: emitWireMessage([{ number: 1, wire: 2, value: emitWireMessage(root) }]) }
  })
  const template: SignalIndexEntry = {
    field: {
      number: 3,
      wire: 2,
      value: emitWireMessage([
        { number: 1, wire: 2, value: encodeNodeIdentity(SERVER_NODE_TYPE, signal.sendId) },
        { number: 2, wire: 2, value: encodeNodeIdentity(SERVER_NODE_TYPE, signal.monitorId) },
        { number: 3, wire: 2, value: TEXT.encode(signal.name) },
        { number: 4, wire: 2, value: firstTemplates.index.value },
        { number: 6, wire: 0, value: 2 },
        { number: 7, wire: 2, value: encodeNodeIdentity(CLIENT_NODE_TYPE, signal.serverId) }
      ])
    },
    name: signal.name,
    params: [...signal.params],
    identity: { sendId: signal.sendId, monitorId: signal.monitorId, serverId: signal.serverId },
    paramEntries: [firstTemplates.index],
    // builtin 布局的版本固定为 2（复刻 1888 verify_ping 的创建后一次编辑状态），
    // 与上方 field f6=2 及三份定义 #4 field5=2 保持一致。
    signalVersion: 2
  }
  return { template, templateDefinitions }
}

function cloneParamEntry(template: WireField, oldName: string, newName: string): WireField {
  return {
    ...template,
    value: transformMessage(template.value as Uint8Array, (field) => {
      if (field.wire === 2) {
        const current = printableWireText(field.value as Uint8Array)
        if (current === oldName) return { ...field, value: TEXT.encode(newName) }
      }
      return field
    })
  }
}

function replaceInFixed(
  data: Uint8Array,
  template: SignalIndexEntry,
  spec: SignalRegistrationSpec
): Uint8Array {
  const idMap = new Map([
    [template.identity.sendId, spec.sendId],
    [template.identity.monitorId, spec.monitorId],
    [template.identity.serverId, spec.serverId]
  ])
  return transformMessage(data, (field) => {
    if (field.wire === 0 && field.number === 5 && idMap.has(field.value as number)) {
      return { ...field, value: idMap.get(field.value as number)! }
    }
    if (field.wire === 2) {
      const current = printableWireText(field.value as Uint8Array)
      if (current === template.name) return { ...field, value: TEXT.encode(spec.name) }
    }
    return field
  })
}

// Signal node IDs live in the 0x60000000 segment; the editor assigns them
// consecutively per registered signal (send, monitor, server). The builtin
// send/monitor/sendServer definitions occupy 1610612738..1610612740, so
// auto-assignment starts after the highest occupied ID and is therefore
// guaranteed collision-free (IDs carry no semantics, only uniqueness).
function assignSignalIds(
  spec: SignalRegistrationInput,
  occupiedIds: ReadonlySet<number>
): SignalRegistrationSpec {
  const provided = [spec.sendId, spec.monitorId, spec.serverId].filter((id) => id !== undefined)
  if (provided.length > 0 && provided.length < 3) {
    throw new Error(
      '[error] provide all three of sendId/monitorId/serverId or none (auto-assigned)'
    )
  }
  if (provided.length === 3) {
    return { ...spec, sendId: spec.sendId!, monitorId: spec.monitorId!, serverId: spec.serverId! }
  }
  const base = occupiedIds.size > 0 ? Math.max(...occupiedIds) : 1610612740
  const sendId = base + 1
  return { ...spec, sendId, monitorId: sendId + 1, serverId: sendId + 2 }
}

function validateSpec(spec: SignalRegistrationSpec, pool: SignalPool): void {
  if (!spec.name.trim()) throw new Error('[error] signal name is required')
  const ids = [spec.sendId, spec.monitorId, spec.serverId]
  if (ids.some((id) => !Number.isSafeInteger(id) || id <= 0) || new Set(ids).size !== ids.length) {
    throw new Error(
      '[error] sendId, monitorId and serverId must be distinct positive safe integers'
    )
  }
  const names = new Set<string>()
  const typeCounts = new Map<SignalParamType, number>()
  for (const param of spec.params) {
    if (!param.name.trim() || names.has(param.name)) {
      throw new Error(`[error] duplicate or empty signal parameter name: ${param.name}`)
    }
    names.add(param.name)
    if (param.type === 'faction' || param.type === 'faction_list') {
      throw new Error(`[error] unsupported editor signal parameter type: ${param.type}`)
    }
    const templates = pool.byType.get(param.type)
    if (!templates?.length) {
      throw new Error(
        `[error] no template entry for parameter type "${param.type}" in this map; register it first via the editor`
      )
    }
    const count = (typeCounts.get(param.type) ?? 0) + 1
    typeCounts.set(param.type, count)
    if (count > templates.length) {
      throw new Error(
        `[error] parameter type "${param.type}" needs ${count} distinct layouts, ` +
          `but the template GIL provides ${templates.length}`
      )
    }
  }
}

function buildIndexEntry(
  template: SignalIndexEntry,
  spec: SignalRegistrationSpec,
  pool: SignalPool
): WireField {
  const value = message(template.field, 'signal index entry')
  let paramSlot = 0
  const typeOffsets = new Map<SignalParamType, number>()
  const templateFor = (param: SignalRegistrationParam) => {
    const offset = typeOffsets.get(param.type) ?? 0
    typeOffsets.set(param.type, offset + 1)
    return pool.byType.get(param.type)![offset]
  }
  const rebuilt = value.flatMap((field) => {
    if (field.number === 1) {
      return [{ ...field, value: encodeNodeIdentity(SERVER_NODE_TYPE, spec.sendId) }]
    }
    if (field.number === 2) {
      return [{ ...field, value: encodeNodeIdentity(SERVER_NODE_TYPE, spec.monitorId) }]
    }
    if (field.number === 3) return [{ ...field, value: TEXT.encode(spec.name) }]
    if (field.number === 7) {
      return [{ ...field, value: encodeNodeIdentity(CLIENT_NODE_TYPE, spec.serverId) }]
    }
    if (field.number !== 4 || field.wire !== 2) return [field]
    if (paramSlot > 0) return []
    paramSlot++
    return spec.params.map((param) => {
      const templates = templateFor(param)
      return cloneParamEntry(templates.index, templates.sourceParam, param.name)
    })
  })
  return { ...template.field, value: emitWireMessage(rebuilt) }
}

function buildDefinition(
  main: WireField,
  kind: DefinitionKind,
  template: SignalIndexEntry,
  spec: SignalRegistrationSpec,
  pool: SignalPool
): WireField {
  const wrapperFields = message(main, 'signal definition wrapper')
  const inner = wrapperFields.find((field) => field.number === 1 && field.wire === 2)
  if (!inner) throw new Error(`[error] incomplete template signal definition: ${template.name}`)
  const root = message(inner, 'signal definition')
  let paramSlot = 0
  const typeOffsets = new Map<SignalParamType, number>()
  const rebuilt = root.flatMap((sub) => {
    const name = sub.wire === 2 ? subParamName(sub) : undefined
    const isParam =
      !!name &&
      (kind === 'monitor'
        ? sub.number === 103 && !MONITOR_FIXED_OUTPUTS.has(name)
        : sub.number === 102)
    if (!isParam) {
      return [
        {
          ...sub,
          value:
            sub.wire === 2 && printableWireText(sub.value as Uint8Array) === undefined
              ? replaceInFixed(sub.value as Uint8Array, template, spec)
              : sub.value
        }
      ]
    }
    if (paramSlot > 0) return []
    paramSlot++
    return spec.params.map((param) => {
      const offset = typeOffsets.get(param.type) ?? 0
      typeOffsets.set(param.type, offset + 1)
      const templates = pool.byType.get(param.type)?.[offset]
      const entry = templates?.[kind]
      if (!templates || !entry) {
        throw new Error(`[error] no ${kind} template entry for parameter type: ${param.type}`)
      }
      return cloneParamEntry(entry, templates.sourceParam, param.name)
    })
  })
  return {
    ...main,
    value: emitWireMessage(
      wrapperFields.map((field) =>
        field === inner ? { ...field, value: emitWireMessage(rebuilt) } : field
      )
    )
  }
}

/**
 * 把 CompositeDef 身份字段 #4 的最后一个 field5 varint 改写为指定版本。
 * 引擎要求三份定义的 #4 field5 与注册表条目 signalVersion 一致（2026-08-15 灯阵实证：
 * repair 复刻模板 field5=2 但条目 signalVersion=3 → 引擎拒绝加载 → 启动失败）。
 * #4 内 field5 可能多次出现（如 42B 身份块内 28 85 80 80 80 06 后另有版本字段 28 xx），
 * 只改写最后一个 occurrence（版本字段），其余保持。
 */
function rewriteDefinitionVersion(main: WireField, version: number): WireField {
  const wrapperFields = message(main, 'signal definition wrapper')
  const inner = wrapperFields.find((field) => field.number === 1 && field.wire === 2)
  if (!inner) return main
  const root = message(inner, 'signal definition')
  const nextRoot = root.map((sub) => {
    if (sub.number !== 4 || sub.wire !== 2) return sub
    const idFields = message(sub, 'signal definition identity')
    const lastIndex = idFields.map((f) => f.number).lastIndexOf(5)
    if (lastIndex < 0 || idFields[lastIndex].wire !== 0) return sub
    const next = [...idFields]
    next[lastIndex] = { ...next[lastIndex], value: version }
    return { ...sub, value: emitWireMessage(next) }
  })
  return {
    ...main,
    value: emitWireMessage(
      wrapperFields.map((field) =>
        field === inner ? { ...field, value: emitWireMessage(nextRoot) } : field
      )
    )
  }
}

function containsText(data: Uint8Array, expected: string, depth = 0): boolean {
  if (depth > 8) return false
  for (const field of parseWireMessage(data) ?? []) {
    if (field.wire !== 2) continue
    const value = field.value as Uint8Array
    const candidate = printableWireText(value)
    if (
      candidate === expected ||
      (candidate === undefined && containsText(value, expected, depth + 1))
    ) {
      return true
    }
  }
  return false
}

function definitionNamePinIndex(wrapper: WireField, signalName: string): number | undefined {
  const wrapperFields = message(wrapper, 'signal definition wrapper')
  const inner = wrapperFields.find((field) => field.number === 1 && field.wire === 2)
  if (!inner) return undefined
  const root = message(inner, 'signal definition')
  for (const field of root.filter((entry) => entry.number === 106 && entry.wire === 2)) {
    if (!containsText(field.value as Uint8Array, signalName)) continue
    const pinIndex = varint(message(field, 'signal name pin layout'), 8)
    if (pinIndex !== undefined) return pinIndex
  }
  return undefined
}

function definitionTexts(wrapper: WireField): string[] {
  if (wrapper.number !== 2 || wrapper.wire !== 2) return []
  const wrapperFields = message(wrapper, 'signal definition wrapper')
  const inner = wrapperFields.find((field) => field.number === 1 && field.wire === 2)
  if (!inner) return []
  const found: string[] = []
  const visit = (data: Uint8Array) => {
    for (const field of fields(data, 'signal definition')) {
      if (field.wire !== 2) continue
      const value = field.value as Uint8Array
      const candidate = printableWireText(value)
      if (candidate) found.push(candidate)
      else visit(value)
    }
  }
  visit(inner.value as Uint8Array)
  return found
}

function definitionNodeId(wrapper: WireField): number | undefined {
  if (wrapper.number !== 2 || wrapper.wire !== 2) return undefined
  const wrapperFields = message(wrapper, 'signal definition wrapper')
  const inner = wrapperFields.find((field) => field.number === 1 && field.wire === 2)
  if (!inner) return undefined
  const root = message(inner, 'signal definition')
  const id = root.find((field) => field.number === 4 && field.wire === 2)
  if (!id) return undefined
  const generic = message(id, 'signal definition id').find(
    (field) => field.number === 1 && field.wire === 2
  )
  return generic ? nodeIdentity(generic.value as Uint8Array).id : undefined
}

function header(bytes: Uint8Array) {
  if (bytes.length < 24) throw new Error('[error] invalid GIL size')
  return {
    schema: readUint32BE(bytes, 4),
    headTag: readUint32BE(bytes, 8),
    fileType: readUint32BE(bytes, 12),
    tailTag: readUint32BE(bytes, bytes.length - 4)
  }
}

function readSignalSource(bytes: Uint8Array): {
  sourceHeader: ReturnType<typeof header>
  sourceRoot: WireField[]
  topField: WireField
  top: WireField[]
  index: ReturnType<typeof signalIndex>
  entries: SignalIndexEntry[]
} {
  const sourceHeader = header(bytes)
  if (sourceHeader.headTag !== 0x0326 || sourceHeader.tailTag !== 0x0679) {
    throw new Error('[error] invalid GIL header tags')
  }
  const sourcePayload = bytes.slice(20, -4)
  const sourceRoot = fields(sourcePayload, 'GIL payload')
  if (!Buffer.from(emitWireMessage(sourceRoot)).equals(Buffer.from(sourcePayload))) {
    throw new Error('[error] GIL payload is not safely round-trippable')
  }
  const topField = one(sourceRoot, 10, 'top-level field 10')
  const top = message(topField, 'top-level field 10')
  const index = signalIndex(top)
  return { sourceHeader, sourceRoot, topField, top, index, entries: signalEntries(index.fields) }
}

export function repairSignalInGil(input: {
  bytes: Uint8Array
  targetSignalName: string
  templateBytes: Uint8Array
  templateSignalName: string
  expectedParams?: SignalRegistrationParam[]
}): RepairSignalResult {
  const targetSource = readSignalSource(input.bytes)
  const targets = targetSource.entries.filter((entry) => entry.name === input.targetSignalName)
  if (targets.length !== 1) {
    throw new Error(`[error] target signal registry entry is not unique: ${input.targetSignalName}`)
  }
  const target = targets[0]
  if (input.templateSignalName !== target.name) {
    throw new Error('[error] template signal name must match target signal')
  }
  if (
    input.expectedParams &&
    input.expectedParams.map(({ name, type }) => `${name}:${type}`).join('|') !==
      target.params.map(({ name, type }) => `${name}:${type}`).join('|')
  ) {
    throw new Error(`[error] target signal schema mismatch: ${target.name}`)
  }

  const templateSource = readSignalSource(input.templateBytes)
  const templates = templateSource.entries.filter(
    (entry) => entry.name === input.templateSignalName
  )
  if (templates.length !== 1) {
    throw new Error(
      `[error] template signal registry entry is not unique: ${input.templateSignalName}`
    )
  }
  const template = templates[0]
  if (
    template.params.map(({ name, type }) => `${name}:${type}`).join('|') !==
    target.params.map(({ name, type }) => `${name}:${type}`).join('|')
  ) {
    throw new Error(`[error] template signal schema mismatch: ${target.name}`)
  }

  const targetIds = [target.identity.sendId, target.identity.monitorId, target.identity.serverId]
  if (new Set(targetIds).size !== 3) {
    throw new Error(`[error] target signal identity conflict: ${target.name}`)
  }
  const targetDefinitions = new Map<number, WireField>()
  for (const id of targetIds) {
    const matches = targetSource.top.filter(
      (field) => field.number === 2 && definitionNodeId(field) === id
    )
    if (matches.length !== 1) {
      throw new Error(`[error] target signal definition cannot be uniquely located: ${id}`)
    }
    targetDefinitions.set(id, matches[0])
  }

  const templateIds = [
    template.identity.sendId,
    template.identity.monitorId,
    template.identity.serverId
  ]
  if (new Set(templateIds).size !== 3) {
    throw new Error(`[error] template signal identity conflict: ${template.name}`)
  }
  const templateDefinitions = new Map<number, WireField>()
  for (const id of templateIds) {
    const matches = templateSource.top.filter(
      (field) =>
        field.number === 2 &&
        definitionNodeId(field) === id &&
        definitionTexts(field).includes(template.name)
    )
    if (matches.length !== 1) {
      throw new Error(`[error] incomplete template signal definition: ${id}`)
    }
    if (definitionNamePinIndex(matches[0], template.name) === undefined) {
      throw new Error(`[error] template signal name pin layout is missing: ${id}`)
    }
    templateDefinitions.set(id, matches[0])
  }

  const pool = buildParamPool(templateSource.top, [template])
  const signal: SignalRegistrationSpec = { ...target, ...target.identity }
  validateSpec(signal, pool)
  const replacements = new Map<WireField, WireField>()
  const kinds: DefinitionKind[] = ['send', 'monitor', 'server']
  for (let index = 0; index < kinds.length; index++) {
    replacements.set(
      targetDefinitions.get(targetIds[index])!,
      // 版本一致性：buildDefinition 复刻模板 #4 field5，需改写为目标条目 signalVersion，
      // 否则引擎拒绝加载（2026-08-15 灯阵实证：field5=2 vs 条目 signalVersion=3 → 启动失败）。
      rewriteDefinitionVersion(
        buildDefinition(
          templateDefinitions.get(templateIds[index])!,
          kinds[index],
          template,
          signal,
          pool
        ),
        target.signalVersion
      )
    )
  }
  const nextTop = targetSource.top.map((field) => replacements.get(field) ?? field)
  // 重建注册表索引条目：pool 来自模板（规范布局），条目 pinIndex 同步为模板值。
  // 修复前 repair 只重建三份定义、条目残留旧 pinIndex（2026-08-15 灯阵信号差分实证：
  // 用户编辑器"追加参数"路径写入序号式布局，repair 需整体恢复为类型值布局）。
  const indexPosition = nextTop.indexOf(targetSource.index.field)
  if (indexPosition < 0) {
    throw new Error('[error] signal registry index not found in target')
  }
  const nextIndex = targetSource.index.fields.map((field) =>
    field === target.field ? buildIndexEntry(target, signal, pool) : field
  )
  nextTop[indexPosition] = { ...targetSource.index.field, value: emitWireMessage(nextIndex) }
  const unchanged = Buffer.compare(
    Buffer.from(emitWireMessage(nextTop)),
    Buffer.from(emitWireMessage(targetSource.top))
  ) === 0
  if (unchanged) {
    return {
      bytes: input.bytes,
      signal,
      templateSignalName: template.name,
      status: 'already-repaired'
    }
  }
  const nextRoot = targetSource.sourceRoot.map((field) =>
    field === targetSource.topField ? { ...field, value: emitWireMessage(nextTop) } : field
  )
  return {
    bytes: buildFile(emitWireMessage(nextRoot), targetSource.sourceHeader),
    signal,
    templateSignalName: template.name,
    status: 'repaired'
  }
}

export function updateSignalInGil(input: {
  bytes: Uint8Array
  targetSignalName: string
  signal: Omit<SignalRegistrationSpec, 'sendId' | 'monitorId' | 'serverId'>
}): UpdateSignalResult {
  const { sourceHeader, sourceRoot, topField, top, index, entries } = readSignalSource(input.bytes)
  const target = entries.find((entry) => entry.name === input.targetSignalName)
  if (!target) throw new Error(`[error] signal not found: ${input.targetSignalName}`)
  if (
    input.signal.name !== target.name &&
    entries.some((entry) => entry.name === input.signal.name)
  ) {
    throw new Error(`[error] signal already registered: ${input.signal.name}`)
  }

  const signal: SignalRegistrationSpec = { ...input.signal, ...target.identity }
  const pool = buildParamPool(top, entries)
  validateSpec(signal, pool)
  const kinds = new Map<number, DefinitionKind>([
    [target.identity.sendId, 'send'],
    [target.identity.monitorId, 'monitor'],
    [target.identity.serverId, 'server']
  ])
  const found = new Set<number>()
  const nextTop = top.map((field) => {
    const id = definitionNodeId(field)
    const kind = id === undefined ? undefined : kinds.get(id)
    if (!kind) return field
    found.add(id!)
    return buildDefinition(field, kind, target, signal, pool)
  })
  if (found.size !== 3) throw new Error(`[error] incomplete signal definitions: ${target.name}`)

  const targetIndexPosition = index.fields.indexOf(target.field)
  const nextIndex = [...index.fields]
  nextIndex[targetIndexPosition] = buildIndexEntry(target, signal, pool)
  const indexPosition = nextTop.indexOf(index.field)
  nextTop[indexPosition] = { ...index.field, value: emitWireMessage(nextIndex) }
  const nextRoot = sourceRoot.map((field) =>
    field === topField ? { ...field, value: emitWireMessage(nextTop) } : field
  )
  return {
    bytes: buildFile(emitWireMessage(nextRoot), sourceHeader),
    signal,
    templateSignalName: target.name,
    previousSignalName: target.name
  }
}

export function registerSignalInGil(input: {
  bytes: Uint8Array
  templateSignalName?: string
  signal: SignalRegistrationInput
  templateBytes?: Uint8Array
}): RegisterSignalResult {
  const sourceHeader = header(input.bytes)
  if (sourceHeader.headTag !== 0x0326 || sourceHeader.tailTag !== 0x0679) {
    throw new Error('[error] invalid GIL header tags')
  }
  const sourcePayload = input.bytes.slice(20, -4)
  const sourceRoot = fields(sourcePayload, 'GIL payload')
  if (!Buffer.from(emitWireMessage(sourceRoot)).equals(Buffer.from(sourcePayload))) {
    throw new Error('[error] GIL payload is not safely round-trippable')
  }
  const topField = one(sourceRoot, 10, 'top-level field 10')
  let top = message(topField, 'top-level field 10')
  let index: { field: WireField; fields: WireField[] }
  let existingEntries: SignalIndexEntry[]
  if (top.some((field) => field.number === 5 && field.wire === 2)) {
    index = signalIndex(top)
    existingEntries = signalEntries(index.fields)
  } else {
    // 全新地图尚无信号注册表：自动初始化空注册表
    // （编辑器结构：field 5 = 空 message，有序插入，wire 无损；与 /tmp/init-signal-registry.mjs 同构）
    const emptyRegistry: WireField = { number: 5, wire: 2, value: emitWireMessage([]) }
    const insertAt = top.findIndex((field) => field.number > 5)
    top = [...top]
    top.splice(insertAt < 0 ? top.length : insertAt, 0, emptyRegistry)
    index = { field: emptyRegistry, fields: [] }
    existingEntries = []
  }
  if (existingEntries.some((entry) => entry.name === input.signal.name)) {
    throw new Error(`[error] signal already registered: ${input.signal.name}`)
  }
  const occupiedIds = new Set(
    existingEntries.flatMap((entry) => [
      entry.identity.sendId,
      entry.identity.monitorId,
      entry.identity.serverId
    ])
  )
  const signal = assignSignalIds(input.signal, occupiedIds)
  for (const id of [signal.sendId, signal.monitorId, signal.serverId]) {
    if (occupiedIds.has(id)) throw new Error(`[error] signal node ID already occupied: ${id}`)
  }

  // Resolve the parameter-layout source: an explicit donor signal, or builtin
  // layouts (byte-verbatim from editor-created signals) when no donor covers
  // every requested parameter type.
  let source:
    | {
        template: SignalIndexEntry
        pool: SignalPool
        templateDefinitions: WireField[]
        templateName: string
      }
    | undefined
  if (input.templateSignalName !== undefined) {
    const templateBytes = input.templateBytes ?? input.bytes
    const templatePayload = templateBytes.slice(20, -4)
    const templateRoot = fields(templatePayload, 'template GIL payload')
    const templateTop = message(
      one(templateRoot, 10, 'template top-level field 10'),
      'template field 10'
    )
    if (!templateTop.some((field) => field.number === 5 && field.wire === 2)) {
      throw new Error(
        `[error] template GIL has no signal registry; use a donor GIL with registered signals`
      )
    }
    const donor = signalEntries(signalIndex(templateTop).fields).find(
      (entry) => entry.name === input.templateSignalName
    )
    if (!donor) throw new Error(`[error] template signal not found: ${input.templateSignalName}`)
    const donorPool = buildParamPool(templateTop, [donor])
    if (poolCovers(donorPool, signal.params)) {
      validateSpec(signal, donorPool)
      source = {
        template: donor,
        pool: donorPool,
        templateDefinitions: templateTop.filter(
          (field) => field.number === 2 && definitionTexts(field).includes(donor.name)
        ),
        templateName: donor.name
      }
    }
  }
  if (source === undefined) {
    // Builtin fallback: map-derived pin bases are reused when the map already
    // has same-type signals; otherwise canonical fresh-map bases are used.
    const mapPool = buildParamPool(top, existingEntries)
    const pool = mergePoolFor(signal.params, mapPool)
    validateSpec(signal, pool)
    const built = buildBuiltinTemplate(signal, pool)
    source = {
      template: built.template,
      pool,
      templateDefinitions: built.templateDefinitions,
      templateName: 'builtin-layouts'
    }
  }
  const { template, pool, templateDefinitions, templateName } = source
  const byId = new Map(templateDefinitions.map((field) => [definitionNodeId(field), field]))
  const orderedTemplateIds = [
    template.identity.serverId,
    template.identity.monitorId,
    template.identity.sendId
  ]
  const kinds: Record<number, DefinitionKind> = {
    [template.identity.serverId]: 'server',
    [template.identity.monitorId]: 'monitor',
    [template.identity.sendId]: 'send'
  }
  const clones = orderedTemplateIds.map((id) => {
    const field = byId.get(id)
    if (!field || field.wire !== 2)
      throw new Error(`[error] incomplete template signal definition: ${id}`)
    return buildDefinition(field, kinds[id], template, signal, pool)
  })

  const signalDefinitionIndexes = top
    .map((field, index) => ({ field, index }))
    .filter(({ field }) => field.number === 2 && definitionTexts(field).length > 0)
    .map(({ index }) => index)
  const insertAt = signalDefinitionIndexes.length
    ? Math.max(...signalDefinitionIndexes) + 1
    : top.findIndex((field) => field.number > 2)
  const nextTop = [...top]
  nextTop.splice(insertAt < 0 ? nextTop.length : insertAt, 0, ...clones)

  const indexPosition = nextTop.findIndex((field) => field === index.field)
  const idFields: WireField[] = [
    { number: 2, wire: 2, value: encodeNodeIdentity(SERVER_NODE_TYPE, signal.sendId) },
    { number: 2, wire: 2, value: encodeNodeIdentity(SERVER_NODE_TYPE, signal.monitorId) },
    { number: 2, wire: 2, value: encodeNodeIdentity(CLIENT_NODE_TYPE, signal.serverId) }
  ]
  const firstEntry = index.fields.findIndex((field) => field.number === 3)
  const nextIndex = [...index.fields]
  nextIndex.splice(firstEntry < 0 ? nextIndex.length : firstEntry, 0, ...idFields)
  nextIndex.push(buildIndexEntry(template, signal, pool))
  const indexCount = nextIndex.find((field) => field.number === 6 && field.wire === 0)
  if (indexCount) indexCount.value = (indexCount.value as number) + 1
  nextTop[indexPosition] = { ...index.field, value: emitWireMessage(nextIndex) }

  const nextRoot = sourceRoot.map((field) =>
    field === topField ? { ...field, value: emitWireMessage(nextTop) } : field
  )
  const result = buildFile(emitWireMessage(nextRoot), sourceHeader)
  return {
    bytes: result,
    signal,
    templateSignalName: templateName!
  }
}
