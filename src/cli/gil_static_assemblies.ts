import fs from 'node:fs'

import { buildFile, encodeVarint, readUint32BE, readVarint } from '../injector/binary.js'

export type GstsStaticAssemblyItem = {
  resourceId: number
  position: readonly [number, number, number]
  rotation?: readonly [number, number, number]
  scale?: readonly [number, number, number]
}

export type GstsStaticAssembly = {
  name: string
  prefabId: number
  templatePrefabId: number
  templateName: string
  position: readonly [number, number, number]
  rotation?: readonly [number, number, number]
  scale?: readonly [number, number, number]
  items: readonly GstsStaticAssemblyItem[]
  definitionAuxiliaryIds: readonly number[]
  instanceAuxiliaryIds: readonly number[]
}

export type StaticAssemblyResult = {
  bytes: Uint8Array
  prefabId: number
  definitionAuxiliaryIds: readonly number[]
  instanceAuxiliaryIds: readonly number[]
}

type WireField = {
  number: number
  wire: number
  value: number | Uint8Array
}

type Transform = Required<Pick<GstsStaticAssemblyItem, 'position' | 'rotation' | 'scale'>>

const TEXT = new TextEncoder()
const UTF8 = new TextDecoder('utf-8', { fatal: true })

function parse(data: Uint8Array): WireField[] | undefined {
  const fields: WireField[] = []
  let offset = 0
  while (offset < data.length) {
    const key = readVarint(data, offset)
    if (!key || key.value >> 3 === 0) return undefined
    offset = key.next
    const number = key.value >> 3
    const wire = key.value & 7
    if (wire === 0) {
      const value = readVarint(data, offset)
      if (!value) return undefined
      fields.push({ number, wire, value: value.value })
      offset = value.next
    } else if (wire === 1 || wire === 5) {
      const width = wire === 1 ? 8 : 4
      if (offset + width > data.length) return undefined
      fields.push({ number, wire, value: data.slice(offset, offset + width) })
      offset += width
    } else if (wire === 2) {
      const length = readVarint(data, offset)
      if (!length || length.next + length.value > data.length) return undefined
      fields.push({ number, wire, value: data.slice(length.next, length.next + length.value) })
      offset = length.next + length.value
    } else {
      return undefined
    }
  }
  return fields
}

function emit(fields: readonly WireField[]): Uint8Array {
  const parts: Uint8Array[] = []
  for (const field of fields) {
    parts.push(encodeVarint((field.number << 3) | field.wire))
    if (field.wire === 0) parts.push(encodeVarint(field.value as number))
    else if (field.wire === 2) {
      const value = field.value as Uint8Array
      parts.push(encodeVarint(value.length), value)
    } else {
      parts.push(field.value as Uint8Array)
    }
  }
  return Buffer.concat(parts.map((part) => Buffer.from(part)))
}

function message(field: WireField): WireField[] {
  if (field.wire !== 2) throw new Error(`[error] field ${field.number} is not length-delimited`)
  const result = parse(field.value as Uint8Array)
  if (!result) throw new Error(`[error] field ${field.number} is not a protobuf-like message`)
  return result
}

function nth(fields: readonly WireField[], number: number, occurrence = 1): WireField {
  const result = fields.filter((field) => field.number === number)[occurrence - 1]
  if (!result) throw new Error(`[error] missing field ${number}[${occurrence}]`)
  return result
}

function recordId(record: Uint8Array): number | undefined {
  const first = parse(record)?.[0]
  return first?.number === 1 && first.wire === 0 ? (first.value as number) : undefined
}

function records(top: readonly WireField[], topNumber: number, recordNumber: number): Uint8Array[] {
  return message(nth(top, topNumber))
    .filter((field) => field.number === recordNumber && field.wire === 2)
    .map((field) => field.value as Uint8Array)
}

function findRecord(records_: readonly Uint8Array[], id: number): Uint8Array {
  const matches = records_.filter((record) => recordId(record) === id)
  if (matches.length !== 1)
    throw new Error(`[error] expected one record for ID ${id}, found ${matches.length}`)
  return matches[0]
}

function printable(data: Uint8Array): string | undefined {
  try {
    const text = UTF8.decode(data)
    return text && [...text].every((char) => /\P{C}/u.test(char)) ? text : undefined
  } catch {
    return undefined
  }
}

function mapMessage(data: Uint8Array, fn: (field: WireField) => WireField): Uint8Array {
  const fields = parse(data)
  if (!fields) return data
  return emit(fields.map(fn))
}

function replaceText(
  data: Uint8Array,
  oldText: string,
  newText: string
): { bytes: Uint8Array; count: number } {
  const oldBytes = TEXT.encode(oldText)
  const newBytes = TEXT.encode(newText)
  const fields = parse(data)
  if (!fields) return { bytes: data, count: 0 }
  let count = 0
  const next = fields.map((field) => {
    if (field.wire !== 2 || field.number === 501) return field
    const value = field.value as Uint8Array
    if (Buffer.from(value).equals(Buffer.from(oldBytes))) {
      count++
      return { ...field, value: newBytes }
    }
    if (printable(value) !== undefined) return field
    const nested = replaceText(value, oldText, newText)
    count += nested.count
    return nested.count ? { ...field, value: nested.bytes } : field
  })
  return { bytes: emit(next), count }
}

function replaceVarint(
  data: Uint8Array,
  oldValue: number,
  newValue: number
): { bytes: Uint8Array; count: number } {
  const fields = parse(data)
  if (!fields) return { bytes: data, count: 0 }
  let count = 0
  const next = fields.map((field) => {
    if (field.wire === 0 && field.value === oldValue) {
      count++
      return { ...field, value: newValue }
    }
    if (
      field.wire !== 2 ||
      field.number === 501 ||
      printable(field.value as Uint8Array) !== undefined
    )
      return field
    const nested = replaceVarint(field.value as Uint8Array, oldValue, newValue)
    count += nested.count
    return nested.count ? { ...field, value: nested.bytes } : field
  })
  return { bytes: emit(next), count }
}

function packedIds(record: Uint8Array): number[] {
  const fields = parse(record)
  if (!fields) throw new Error('[error] invalid record')
  for (const field of fields) {
    if (field.number === 501 && field.wire === 2) {
      const ids: number[] = []
      let offset = 0
      const value = field.value as Uint8Array
      while (offset < value.length) {
        const decoded = readVarint(value, offset)
        if (!decoded) throw new Error('[error] malformed packed field 501')
        ids.push(decoded.value)
        offset = decoded.next
      }
      return ids
    }
    if (
      field.wire === 2 &&
      field.number !== 501 &&
      printable(field.value as Uint8Array) === undefined
    ) {
      try {
        return packedIds(field.value as Uint8Array)
      } catch {
        // Continue searching sibling fields.
      }
    }
  }
  throw new Error('[error] packed field 501 not found')
}

function setPackedIds(record: Uint8Array, ids: readonly number[]): Uint8Array {
  let changed = 0
  const rewrite = (data: Uint8Array): Uint8Array => {
    const fields = parse(data)
    if (!fields) return data
    return emit(
      fields.map((field) => {
        if (field.number === 501 && field.wire === 2) {
          changed++
          return { ...field, value: Buffer.concat(ids.map((id) => Buffer.from(encodeVarint(id)))) }
        }
        if (field.wire !== 2 || printable(field.value as Uint8Array) !== undefined) return field
        return { ...field, value: rewrite(field.value as Uint8Array) }
      })
    )
  }
  const result = rewrite(record)
  if (changed !== 1) throw new Error(`[error] expected one packed field 501, changed ${changed}`)
  return result
}

function float32(value: number): Uint8Array {
  const result = Buffer.alloc(4)
  result.writeFloatLE(value)
  return result
}

function vector(values: readonly number[], sparse: boolean): Uint8Array {
  return emit(
    values.flatMap((value, index) =>
      sparse && value === 0 ? [] : [{ number: index + 1, wire: 5, value: float32(value) }]
    )
  )
}

function setTransform(
  record: Uint8Array,
  transform: Transform,
  ownerFieldNumber?: number
): Uint8Array {
  const fields = parse(record)
  if (!fields) throw new Error('[error] invalid transform record')
  const owner = fields.find((field) => {
    if (
      field.wire !== 2 ||
      (ownerFieldNumber !== undefined
        ? field.number !== ownerFieldNumber
        : field.number !== 5 && field.number !== 6)
    )
      return false
    const child = parse(field.value as Uint8Array)
    return (
      !!child &&
      child.some((item) => item.number === 1 && item.wire === 0 && item.value === 1) &&
      child.some((item) => item.number === 11 && item.wire === 2)
    )
  })
  if (!owner) throw new Error('[error] transform owner not found')
  const ownerFields = message(owner)
  const transformField = nth(ownerFields, 11)
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

function assemblyTransform(item: GstsStaticAssemblyItem): Transform {
  if (
    item.position.length !== 3 ||
    (item.rotation !== undefined && item.rotation.length !== 3) ||
    (item.scale !== undefined && item.scale.length !== 3)
  ) {
    throw new Error('[error] item position, rotation and scale must each contain three numbers')
  }
  const transform = {
    position: item.position,
    rotation: item.rotation ?? [0, 0, 0],
    scale: item.scale ?? [1, 1, 1]
  } as Transform
  for (const value of [...transform.position, ...transform.rotation, ...transform.scale]) {
    if (!Number.isFinite(value)) throw new Error('[error] transform values must be finite numbers')
  }
  return transform
}

function decorationName(record: Uint8Array): string {
  const visit = (data: Uint8Array): string | undefined => {
    const fields = parse(data)
    if (!fields) return undefined
    for (const field of fields) {
      if (field.wire !== 2) continue
      const text = printable(field.value as Uint8Array)
      if (text && /^装饰物_\d+$/.test(text)) return text
      if (!text && field.number !== 501) {
        const nested = visit(field.value as Uint8Array)
        if (nested) return nested
      }
    }
    return undefined
  }
  const name = visit(record)
  if (!name) throw new Error('[error] decoration name field not found')
  return name
}

function setAuxiliary(
  record: Uint8Array,
  params: {
    id: number
    ownerId: number
    sourceOwnerId: number
    definitionId?: number
    item: GstsStaticAssemblyItem
    ordinal: number
  }
): Uint8Array {
  const fields = parse(record)
  if (!fields) throw new Error('[error] invalid auxiliary record')
  nth(fields, 1).value = params.id
  nth(fields, 2).value = params.item.resourceId
  let result = emit(fields)
  const replaced = replaceVarint(result, params.sourceOwnerId, params.ownerId)
  if (replaced.count < 1) throw new Error('[error] auxiliary owner reference not found')
  result = replaced.bytes
  if (params.definitionId !== undefined) {
    const next = parse(result)
    if (!next) throw new Error('[error] invalid auxiliary instance record')
    const backlink = message(nth(next, 12))
    nth(backlink, 1).value = params.definitionId
    nth(next, 12).value = emit(backlink)
    result = emit(next)
  }
  const named = replaceText(result, decorationName(result), `装饰物_${params.ordinal}`)
  if (named.count !== 1)
    throw new Error(`[error] expected one decoration name, changed ${named.count}`)
  return setTransform(named.bytes, assemblyTransform(params.item))
}

function allVarints(data: Uint8Array): number[] {
  const fields = parse(data)
  if (!fields) return []
  return fields.flatMap((field) => {
    if (field.wire === 0) return [field.value as number]
    return field.wire === 2 && field.number !== 501 ? allVarints(field.value as Uint8Array) : []
  })
}

function copyRegistry(top6: WireField[], sourceOwnerId: number, ownerId: number): void {
  let copied = 0
  for (const topField of top6) {
    if (topField.number !== 1 || topField.wire !== 2) continue
    const record = message(topField)
    for (const child of record) {
      if (child.number !== 3 || child.wire !== 2) continue
      const group = message(child)
      for (const entry of [...group]) {
        if (
          entry.number !== 5 ||
          entry.wire !== 2 ||
          !allVarints(entry.value as Uint8Array).includes(sourceOwnerId)
        )
          continue
        const entryFields = message(entry)
        nth(entryFields, 2).value = ownerId
        group.push({ number: 5, wire: 2, value: emit(entryFields) })
        copied++
      }
      child.value = emit(group)
    }
    topField.value = emit(record)
  }
  if (copied === 0)
    throw new Error(`[error] component ${sourceOwnerId} has no field 6 registry entries`)
}

function assertIdsFree(top: readonly WireField[], ids: readonly number[]): void {
  const occupied = new Set<number>()
  for (const [topNumber, recordNumber] of [
    [4, 1],
    [8, 1],
    [27, 1],
    [27, 2]
  ] as const) {
    for (const record of records(top, topNumber, recordNumber)) {
      const id = recordId(record)
      if (id !== undefined) occupied.add(id)
    }
  }
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index)
  const conflicts = ids.filter((id) => occupied.has(id))
  if (duplicates.length || conflicts.length) {
    throw new Error(
      `[error] assembly IDs conflict: ${[...new Set([...duplicates, ...conflicts])].join(', ')}`
    )
  }
}

function validateAssembly(assembly: GstsStaticAssembly): void {
  if (!assembly.name || !Number.isSafeInteger(assembly.prefabId) || assembly.prefabId < 0) {
    throw new Error('[error] assembly name and non-negative prefabId are required')
  }
  if (!Number.isSafeInteger(assembly.templatePrefabId) || assembly.templatePrefabId < 0) {
    throw new Error('[error] templatePrefabId must be a non-negative integer')
  }
  if (!assembly.templateName) throw new Error('[error] templateName is required')
  if (!assembly.items.length) throw new Error('[error] assembly requires at least one item')
  if (
    assembly.definitionAuxiliaryIds.length !== assembly.items.length ||
    assembly.instanceAuxiliaryIds.length !== assembly.items.length
  ) {
    throw new Error('[error] each item requires one definition and one instance auxiliary ID')
  }
  const ids = [
    assembly.prefabId,
    ...assembly.definitionAuxiliaryIds,
    ...assembly.instanceAuxiliaryIds
  ]
  if (ids.some((id) => !Number.isSafeInteger(id) || id < 0))
    throw new Error('[error] assembly IDs must be non-negative safe integers')
  assembly.items.forEach(assemblyTransform)
}

export function applyStaticAssembly(params: {
  gilPath: string
  assembly: GstsStaticAssembly
}): StaticAssemblyResult {
  const source = new Uint8Array(fs.readFileSync(params.gilPath))
  if (source.length < 24) throw new Error('[error] invalid gil size')
  const payload = source.slice(20, -4)
  const top = parse(payload)
  if (!top) throw new Error('[error] malformed GIL payload')
  const assembly = params.assembly
  validateAssembly(assembly)
  assertIdsFree(top, [
    assembly.prefabId,
    ...assembly.definitionAuxiliaryIds,
    ...assembly.instanceAuxiliaryIds
  ])

  const top4 = message(nth(top, 4))
  const top6 = message(nth(top, 6))
  const top8 = message(nth(top, 8))
  const top27 = message(nth(top, 27))
  const sourceDefinition = findRecord(
    top4.filter((field) => field.number === 1).map((field) => field.value as Uint8Array),
    assembly.templatePrefabId
  )
  const sourceInstance = findRecord(
    top8.filter((field) => field.number === 1).map((field) => field.value as Uint8Array),
    assembly.templatePrefabId
  )
  const sourceDefinitionIds = packedIds(sourceDefinition)
  const sourceInstanceIds = packedIds(sourceInstance)
  if (!sourceDefinitionIds.length || !sourceInstanceIds.length)
    throw new Error('[error] template has no decoration items')

  const definitionName = replaceText(sourceDefinition, assembly.templateName, assembly.name)
  if (definitionName.count !== 1)
    throw new Error(`[error] definition name replacements=${definitionName.count}`)
  let definition = replaceVarint(
    definitionName.bytes,
    assembly.templatePrefabId,
    assembly.prefabId
  ).bytes
  definition = setPackedIds(definition, assembly.definitionAuxiliaryIds)
  top4.push({ number: 1, wire: 2, value: definition })

  const instanceName = replaceText(sourceInstance, assembly.templateName, assembly.name)
  if (instanceName.count !== 1)
    throw new Error(`[error] instance name replacements=${instanceName.count}`)
  let instance = replaceVarint(
    instanceName.bytes,
    assembly.templatePrefabId,
    assembly.prefabId
  ).bytes
  if (!Buffer.from(instance).includes(Buffer.from(TEXT.encode(assembly.name)))) {
    throw new Error('[error] instance name lost while replacing owner ID')
  }
  instance = setPackedIds(instance, assembly.instanceAuxiliaryIds)
  if (!Buffer.from(instance).includes(Buffer.from(TEXT.encode(assembly.name)))) {
    throw new Error('[error] instance name lost while replacing packed IDs')
  }
  instance = setTransform(
    instance,
    {
      position: assembly.position,
      rotation: assembly.rotation ?? [0, 0, 0],
      scale: assembly.scale ?? [1, 1, 1]
    },
    6
  )
  if (!Buffer.from(instance).includes(Buffer.from(TEXT.encode(assembly.name)))) {
    throw new Error('[error] instance name lost while setting Transform')
  }
  top8.push({ number: 1, wire: 2, value: instance })

  const auxiliaryDefinitions = top27
    .filter((field) => field.number === 1)
    .map((field) => field.value as Uint8Array)
  const auxiliaryInstances = top27
    .filter((field) => field.number === 2)
    .map((field) => field.value as Uint8Array)
  for (const [index, item] of assembly.items.entries()) {
    const sourceDefinitionId = sourceDefinitionIds[index % sourceDefinitionIds.length]
    const sourceInstanceId = sourceInstanceIds[index % sourceInstanceIds.length]
    top27.push({
      number: 1,
      wire: 2,
      value: setAuxiliary(findRecord(auxiliaryDefinitions, sourceDefinitionId), {
        id: assembly.definitionAuxiliaryIds[index],
        ownerId: assembly.prefabId,
        sourceOwnerId: assembly.templatePrefabId,
        item,
        ordinal: index + 1
      })
    })
    top27.push({
      number: 2,
      wire: 2,
      value: setAuxiliary(findRecord(auxiliaryInstances, sourceInstanceId), {
        id: assembly.instanceAuxiliaryIds[index],
        ownerId: assembly.prefabId,
        sourceOwnerId: assembly.templatePrefabId,
        definitionId: assembly.definitionAuxiliaryIds[index],
        item,
        ordinal: index + 1
      })
    })
  }

  copyRegistry(top6, assembly.templatePrefabId, assembly.prefabId)
  nth(top, 4).value = emit(top4)
  nth(top, 6).value = emit(top6)
  nth(top, 8).value = emit(top8)
  nth(top, 27).value = emit(top27)
  return {
    bytes: buildFile(emit(top), {
      schema: readUint32BE(source, 4),
      headTag: readUint32BE(source, 8),
      fileType: readUint32BE(source, 12),
      tailTag: readUint32BE(source, source.length - 4)
    }),
    prefabId: assembly.prefabId,
    definitionAuxiliaryIds: assembly.definitionAuxiliaryIds,
    instanceAuxiliaryIds: assembly.instanceAuxiliaryIds
  }
}
