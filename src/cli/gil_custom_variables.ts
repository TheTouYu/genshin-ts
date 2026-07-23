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

export type CustomVariableUpdate =
  | { name: string; type: 'str'; initialValue: string }
  | { name: string; type: 'str_list'; initialValue: readonly string[] }

/** A declaration upserts an initial variable: updates an existing same-typed variable or adds a missing one. */
export type CustomVariableDeclaration = CustomVariableUpdate

export type ApplyCustomVariableUpdatesResult = {
  bytes: Uint8Array
  changed: readonly { name: string; type: CustomVariableType }[]
  unchanged: readonly string[]
}

export type SyncPlayerCustomVariableDeclarationsResult = ApplyCustomVariableUpdatesResult & {
  synchronizedInstanceCount: number
}

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
  24: 'faction_list'
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

function encodeVarintField(field: number, value: number): Buffer {
  return Buffer.concat([Buffer.from(encodeVarint(field << 3)), Buffer.from(encodeVarint(value))])
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

function encodeInitialValue(update: CustomVariableUpdate): Uint8Array {
  if (update.type === 'str') return encodeLengthField(1, Buffer.from(update.initialValue, 'utf8'))
  return encodeStringList(update.initialValue)
}

function codeForType(type: CustomVariableUpdate['type']): number {
  if (type === 'str') return 6
  return 11
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

function encodeDefinition(update: CustomVariableUpdate): Buffer {
  const typeCode = codeForType(update.type)
  const specializedField = typeFieldForCode(typeCode)
  if (!specializedField) throw new Error(`[error] unsupported custom variable type: ${update.type}`)
  const initial = encodeInitialValue(update)
  const typePayload = Buffer.concat([
    encodeTypedValueEnvelope(typeCode),
    encodeLengthField(specializedField, initial)
  ])
  return Buffer.concat([
    encodeLengthField(2, Buffer.from(update.name, 'utf8')),
    encodeVarintField(3, typeCode),
    encodeLengthField(4, typePayload),
    encodeVarintField(5, 1),
    encodeLengthField(6, encodeTypedValueEnvelope(typeCode))
  ])
}

function typeFieldForCode(typeCode: number): number | undefined {
  const type = TYPE_BY_CODE[typeCode]
  return typeCode + 10 && type !== 'unknown' ? typeCode + 10 : undefined
}

function ownerEntries(payload: Uint8Array, fields: LenField[]): LenField[] {
  return fields.filter((field) => field.depth === 2 && field.p0 === 4 && field.p1 === 1)
}

function ownerIdentity(
  payload: Uint8Array,
  owner: LenField
): { prefabId?: number; basePrefabId?: number } {
  const entry = fieldsOf(payload.subarray(owner.dataStart, owner.dataEnd))
  return { prefabId: varintField(entry, 1), basePrefabId: varintField(entry, 2) }
}

function variableFieldsInOwner(fields: LenField[], owner: LenField): LenField[] {
  return fields.filter(
    (field) =>
      field.depth === 5 &&
      field.p0 === 4 &&
      field.p1 === 1 &&
      field.p2 === 8 &&
      field.p3 === 11 &&
      field.p4 === 1 &&
      field.dataStart >= owner.dataStart &&
      field.dataEnd <= owner.dataEnd
  )
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
  const variableContainer = nextFields.find(
    (field) =>
      field.depth === 4 &&
      field.p0 === 4 &&
      field.p1 === 1 &&
      field.p2 === 8 &&
      field.p3 === 11 &&
      field.dataStart >= owner.dataStart &&
      field.dataEnd <= owner.dataEnd
  )
  if (!variableContainer)
    throw new Error(`[error] custom variable container not found: ${params.prefabId}`)
  const appended = Buffer.concat([
    Buffer.from(nextPayload.subarray(variableContainer.dataStart, variableContainer.dataEnd)),
    ...additions.map((declaration) => encodeLengthField(1, encodeDefinition(declaration)))
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
 * Mirrors missing player-variable declarations into every player-template instance that explicitly
 * references playerPrefabId. This is separate from the top-level CustomPrefab resource definition.
 */
export function syncPlayerCustomVariableDeclarations(params: {
  gilPath: string
  playerPrefabId: number
  declarations: readonly CustomVariableDeclaration[]
}): SyncPlayerCustomVariableDeclarationsResult {
  const names = new Set(params.declarations.map((declaration) => declaration.name))
  if (names.size !== params.declarations.length) {
    throw new Error('[error] duplicate player custom variable declaration name')
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
          params.playerPrefabId
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
    const appended = Buffer.concat([
      Buffer.from(payload.subarray(container.dataStart, container.dataEnd)),
      ...additions.map((declaration) => encodeLengthField(1, encodeDefinition(declaration)))
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
    const wanted = encodeInitialValue(update)
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
