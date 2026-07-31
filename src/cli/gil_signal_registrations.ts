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

export type RegisterSignalResult = {
  bytes: Uint8Array
  signal: SignalRegistrationSpec
  templateSignalName: string
}

type SignalIdentity = Pick<SignalRegistrationSpec, 'sendId' | 'monitorId' | 'serverId'>

type SignalIndexEntry = {
  field: WireField
  name: string
  params: SignalRegistrationParam[]
  identity: SignalIdentity
  paramEntries: WireField[]
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
  byType: Map<SignalParamType, ParamTemplates>
}

const TEXT = new TextEncoder()
const SIGNAL_NODE_CLASS = 10001
const SERVER_NODE_TYPE = 20000
const CLIENT_NODE_TYPE = 20002
const SIGNAL_NODE_KIND = 22001
const MONITOR_FIXED_OUTPUTS = new Set(['事件源实体', '事件源GUID', '信号来源实体'])

const PARAM_TYPE_CODES: Partial<Record<SignalParamType, number>> = {
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

function nodeIdentity(data: Uint8Array): { class?: number; type?: number; kind?: number; id?: number } {
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
      if (!paramName || !type) throw new Error(`[error] unsupported template signal parameter type: ${code}`)
      return { name: paramName, type }
    })
  return {
    field,
    name,
    params,
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
  return indexFields.map(parseSignalIndexEntry).filter((entry): entry is SignalIndexEntry => !!entry)
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
              value: transformMessage(field.value as Uint8Array, transform, [...ancestors, field.number])
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
  const byType = new Map<SignalParamType, ParamTemplates>()
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
      let templates = byType.get(param.type)
      if (!templates) {
        templates = { sourceSignal: entry.name, sourceParam: param.name, index: entry.paramEntries[i] }
        byType.set(param.type, templates)
      }
      for (const kind of ['send', 'monitor', 'server'] as const) {
        const def = defs.get(kind)
        if (!def || templates[kind]) continue
        const match = definitionParams(def, kind).find((sub) => subParamName(sub) === param.name)
        if (match) templates[kind] = match
      }
    }
  }
  return { byType }
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

function validateSpec(spec: SignalRegistrationSpec, pool: SignalPool): void {
  if (!spec.name.trim()) throw new Error('[error] signal name is required')
  const ids = [spec.sendId, spec.monitorId, spec.serverId]
  if (ids.some((id) => !Number.isSafeInteger(id) || id <= 0) || new Set(ids).size !== ids.length) {
    throw new Error('[error] sendId, monitorId and serverId must be distinct positive safe integers')
  }
  const names = new Set<string>()
  const typeCounts = new Map<SignalParamType, number>()
  for (const param of spec.params) {
    if (!param.name.trim() || names.has(param.name)) {
      throw new Error(`[error] duplicate or empty signal parameter name: ${param.name}`)
    }
    names.add(param.name)
    const templates = pool.byType.get(param.type)
    if (!templates) {
      throw new Error(
        `[error] no template entry for parameter type "${param.type}" in this map; register it first via the editor`
      )
    }
    // Two parameters of the same type would clone the same template entries and
    // collide on the pin numbers (f8/f4-f6) embedded in the entries; the editor
    // assigns fresh pins per parameter, which we cannot fabricate without a
    // pin-allocation spec.
    typeCounts.set(param.type, (typeCounts.get(param.type) ?? 0) + 1)
    if (typeCounts.get(param.type)! > 1) {
      throw new Error(
        `[error] parameter type "${param.type}" appears ${typeCounts.get(param.type)} times; ` +
          'each type may be used once per signal because pin numbers are cloned from the template entry'
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
      const templates = pool.byType.get(param.type)!
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
      const templates = pool.byType.get(param.type)
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

export function registerSignalInGil(input: {
  bytes: Uint8Array
  templateSignalName: string
  signal: SignalRegistrationSpec
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
  const top = message(topField, 'top-level field 10')
  const index = signalIndex(top)
  const existingEntries = signalEntries(index.fields)
  if (existingEntries.some((entry) => entry.name === input.signal.name)) {
    throw new Error(`[error] signal already registered: ${input.signal.name}`)
  }
  const occupiedIds = new Set(
    existingEntries.flatMap((entry) => [entry.identity.sendId, entry.identity.monitorId, entry.identity.serverId])
  )
  for (const id of [input.signal.sendId, input.signal.monitorId, input.signal.serverId]) {
    if (occupiedIds.has(id)) throw new Error(`[error] signal node ID already occupied: ${id}`)
  }

  const templateBytes = input.templateBytes ?? input.bytes
  const templatePayload = templateBytes.slice(20, -4)
  const templateRoot = fields(templatePayload, 'template GIL payload')
  const templateTop = message(one(templateRoot, 10, 'template top-level field 10'), 'template field 10')
  const template = signalEntries(signalIndex(templateTop).fields).find(
    (entry) => entry.name === input.templateSignalName
  )
  if (!template) throw new Error(`[error] template signal not found: ${input.templateSignalName}`)

  const pool = buildParamPool(templateTop, signalEntries(signalIndex(templateTop).fields))
  validateSpec(input.signal, pool)

  const templateDefinitions = templateTop.filter(
    (field) => field.number === 2 && definitionTexts(field).includes(template.name)
  )
  const byId = new Map(templateDefinitions.map((field) => [definitionNodeId(field), field]))
  const orderedTemplateIds = [template.identity.serverId, template.identity.monitorId, template.identity.sendId]
  const kinds: Record<number, DefinitionKind> = {
    [template.identity.serverId]: 'server',
    [template.identity.monitorId]: 'monitor',
    [template.identity.sendId]: 'send'
  }
  const clones = orderedTemplateIds.map((id) => {
    const field = byId.get(id)
    if (!field || field.wire !== 2) throw new Error(`[error] incomplete template signal definition: ${id}`)
    return buildDefinition(field, kinds[id], template, input.signal, pool)
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
    { number: 2, wire: 2, value: encodeNodeIdentity(SERVER_NODE_TYPE, input.signal.sendId) },
    { number: 2, wire: 2, value: encodeNodeIdentity(SERVER_NODE_TYPE, input.signal.monitorId) },
    { number: 2, wire: 2, value: encodeNodeIdentity(CLIENT_NODE_TYPE, input.signal.serverId) }
  ]
  const firstEntry = index.fields.findIndex((field) => field.number === 3)
  const nextIndex = [...index.fields]
  nextIndex.splice(firstEntry < 0 ? nextIndex.length : firstEntry, 0, ...idFields)
  nextIndex.push(buildIndexEntry(template, input.signal, pool))
  const indexCount = nextIndex.find((field) => field.number === 6 && field.wire === 0)
  if (indexCount) indexCount.value = (indexCount.value as number) + 1
  nextTop[indexPosition] = { ...index.field, value: emitWireMessage(nextIndex) }

  const nextRoot = sourceRoot.map((field) =>
    field === topField ? { ...field, value: emitWireMessage(nextTop) } : field
  )
  const result = buildFile(emitWireMessage(nextRoot), sourceHeader)
  return {
    bytes: result,
    signal: input.signal,
    templateSignalName: template.name
  }
}
