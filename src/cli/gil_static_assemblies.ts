import fs from 'node:fs'

import type {
  GstsResolvedStaticAssembly,
  GstsStaticAssemblyComponent,
  GstsStaticAssemblyItem,
  GstsStaticColor
} from '../compiler/gsts_config.js'
import { buildFile, encodeVarint, readUint32BE } from '../injector/binary.js'
import {
  collectWireVarints as allVarints,
  emitWireMessage as emit,
  findWireRecord as findRecord,
  wireMessage as message,
  nthWireField as nth,
  packedWireIds as packedIds,
  parseWireMessage as parse,
  printableWireText as printable,
  wireRecordId as recordId,
  wireRecords as records,
  type WireField
} from './static_assembly/wire.js'

export type StaticAssemblyResult = {
  bytes: Uint8Array
  prefabId: number
  definitionAuxiliaryIds: readonly number[]
  instanceAuxiliaryIds: readonly number[]
}

type Transform = Required<Pick<GstsStaticAssemblyItem, 'position' | 'rotation' | 'scale'>>

const TEXT = new TextEncoder()
const UTF8 = new TextDecoder('utf-8', { fatal: true })

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

function fullFollowComponent(): Uint8Array {
  return emit([
    { number: 1, wire: 0, value: 9 },
    { number: 2, wire: 0, value: 1 },
    {
      number: 19,
      wire: 2,
      value: emit([
        { number: 2, wire: 2, value: TEXT.encode('GI_RootNode') },
        {
          number: 3,
          wire: 2,
          value: emit([
            { number: 1, wire: 5, value: float32(1) },
            { number: 3, wire: 5, value: float32(1) }
          ])
        },
        { number: 4, wire: 2, value: new Uint8Array() },
        { number: 5, wire: 0, value: 1200 },
        { number: 6, wire: 0, value: 1100 },
        {
          number: 7,
          wire: 2,
          value: emit([{ number: 11, wire: 2, value: new Uint8Array() }])
        },
        { number: 502, wire: 2, value: TEXT.encode('完全跟随') }
      ])
    }
  ])
}

function basicMotionComponent(): Uint8Array {
  return Buffer.from(
    '08121001e2015e4a25180120012a0032003d0000803f420052005801ba1f0ce58f97e587' +
      'bbe789b9e69588d81f0d5228180120012a0032003d0000803f420052005801ba1f0fe8a2' +
      'abe587bbe58092e789b9e69588d81f0d5a0b47495f526f6f744e6f6465',
    'hex'
  )
}

function componentSnapshot(component: GstsStaticAssemblyComponent): {
  typeCode: number
  bytes: Uint8Array
} {
  if (component.type === 'followMotion' && component.preset === 'fullFollow') {
    return { typeCode: 9, bytes: fullFollowComponent() }
  }
  if (component.type === 'basicMotion' && component.preset === 'default') {
    return { typeCode: 18, bytes: basicMotionComponent() }
  }
  throw new Error('[error] unsupported static assembly component')
}

export function setStaticAssemblyComponents(
  record: Uint8Array,
  components: readonly GstsStaticAssemblyComponent[],
  fieldNumber: number
): Uint8Array {
  if (!components.length) return record
  const fields = parse(record)
  if (!fields) throw new Error('[error] invalid component owner record')
  for (const component of components) {
    const snapshot = componentSnapshot(component)
    const existingIndex = fields.findIndex((field) => {
      if (field.number !== fieldNumber || field.wire !== 2) return false
      const componentFields = parse(field.value as Uint8Array)
      return componentFields?.some(
        (child) => child.number === 1 && child.wire === 0 && child.value === snapshot.typeCode
      )
    })
    const value = { number: fieldNumber, wire: 2, value: snapshot.bytes } as WireField
    if (existingIndex >= 0) fields[existingIndex] = value
    else fields.push(value)
  }
  return emit(fields)
}

function colorFields(color: GstsStaticColor): WireField[] {
  if (!color.enabled) {
    return [
      { number: 3, wire: 0, value: 0xffffffff },
      { number: 4, wire: 5, value: float32(100) },
      { number: 5, wire: 0, value: 0xffffff },
      { number: 6, wire: 0, value: 6700 }
    ]
  }
  if (!Number.isInteger(color.rgb) || color.rgb < 0 || color.rgb > 0xffffff) {
    throw new Error('[error] color rgb must be an integer from 0x000000 to 0xFFFFFF')
  }
  if (!Number.isFinite(color.opacity) || color.opacity < 0 || color.opacity > 100) {
    throw new Error('[error] color opacity must be from 0 to 100')
  }
  const alpha = Math.round((color.opacity / 100) * 255)
  const argb = ((alpha << 24) | color.rgb) >>> 0
  const opacity = Math.fround((alpha / 255) * 100)
  return [
    { number: 1, wire: 0, value: 1 },
    { number: 3, wire: 0, value: argb },
    { number: 4, wire: 5, value: float32(opacity) },
    { number: 5, wire: 0, value: color.rgb },
    { number: 6, wire: 0, value: color.overlay === 'multiply' ? 6701 : 6700 }
  ]
}

function setColor(record: Uint8Array, color: GstsStaticColor): Uint8Array {
  let changed = 0
  const rewrite = (data: Uint8Array): Uint8Array => {
    const fields = parse(data)
    if (!fields) return data
    return emit(
      fields.map((field) => {
        if (field.number === 32 && field.wire === 2) {
          const existing = parse(field.value as Uint8Array)
          if (existing?.some((child) => child.number === 3)) {
            changed++
            const unknown = existing.filter((child) => ![1, 3, 4, 5, 6].includes(child.number))
            return { ...field, value: emit([...colorFields(color), ...unknown]) }
          }
        }
        if (
          field.wire !== 2 ||
          field.number === 501 ||
          printable(field.value as Uint8Array) !== undefined
        )
          return field
        return { ...field, value: rewrite(field.value as Uint8Array) }
      })
    )
  }
  const result = rewrite(record)
  if (changed !== 1) throw new Error(`[error] expected one color field 32, changed ${changed}`)
  return result
}

function vector(values: readonly number[], sparse: boolean): Uint8Array {
  return emit(
    values.flatMap((value, index) =>
      sparse && value === 0 ? [] : [{ number: index + 1, wire: 5, value: float32(value) }]
    )
  )
}

function staticAssemblyTransformOwner(fields: WireField[], ownerFieldNumber?: number): WireField {
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
  return owner
}

export function setStaticAssemblyTransform(
  record: Uint8Array,
  transform: Transform,
  ownerFieldNumber?: number
): Uint8Array {
  const fields = parse(record)
  if (!fields) throw new Error('[error] invalid transform record')
  const owner = staticAssemblyTransformOwner(fields, ownerFieldNumber)
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

export function setStaticAssemblyPosition(
  record: Uint8Array,
  position: readonly [number, number, number],
  ownerFieldNumber?: number
): Uint8Array {
  const fields = parse(record)
  if (!fields) throw new Error('[error] invalid transform record')
  const owner = staticAssemblyTransformOwner(fields, ownerFieldNumber)
  const ownerFields = message(owner)
  const transformField = nth(ownerFields, 11)
  const transformFields = message(transformField)
  const positionField = transformFields.find((field) => field.number === 1 && field.wire === 2)
  if (!positionField) throw new Error('[error] transform position not found')
  positionField.value = vector(position, true)
  transformField.value = emit(transformFields)
  owner.value = emit(ownerFields)
  return emit(fields)
}

export function setStaticAssemblyScale(
  record: Uint8Array,
  scale: readonly [number, number, number],
  ownerFieldNumber?: number
): Uint8Array {
  const fields = parse(record)
  if (!fields) throw new Error('[error] invalid transform record')
  const owner = staticAssemblyTransformOwner(fields, ownerFieldNumber)
  const ownerFields = message(owner)
  const transformField = nth(ownerFields, 11)
  const transformFields = message(transformField)
  const scaleField = transformFields.find((field) => field.number === 3 && field.wire === 2)
  if (!scaleField) throw new Error('[error] transform scale not found')
  scaleField.value = vector(scale, false)
  transformField.value = emit(transformFields)
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
  const transformed = setStaticAssemblyTransform(named.bytes, assemblyTransform(params.item))
  return params.item.color ? setColor(transformed, params.item.color) : transformed
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

function validateAssembly(assembly: GstsResolvedStaticAssembly): void {
  if (!assembly.name || !Number.isSafeInteger(assembly.prefabId) || assembly.prefabId < 0) {
    throw new Error('[error] assembly name and non-negative prefabId are required')
  }
  if (!Number.isSafeInteger(assembly.templatePrefabId) || assembly.templatePrefabId < 0) {
    throw new Error('[error] templatePrefabId must be a non-negative integer')
  }
  if (!Number.isSafeInteger(assembly.templateInstanceId) || assembly.templateInstanceId < 0) {
    throw new Error('[error] templateInstanceId must be a non-negative integer')
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
  const components = assembly.components ?? []
  if (new Set(components.map((component) => component.type)).size !== components.length) {
    throw new Error('[error] assembly components must not contain duplicate component types')
  }
  components.forEach(componentSnapshot)
}

export function applyStaticAssembly(params: {
  gilPath: string
  assembly: GstsResolvedStaticAssembly
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
    assembly.templateInstanceId
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
  if (assembly.color) definition = setColor(definition, assembly.color)
  definition = setStaticAssemblyComponents(definition, assembly.components ?? [], 8)
  top4.push({ number: 1, wire: 2, value: definition })

  const instanceName = replaceText(sourceInstance, assembly.templateName, assembly.name)
  if (instanceName.count !== 1)
    throw new Error(`[error] instance name replacements=${instanceName.count}`)
  let instance = replaceVarint(
    instanceName.bytes,
    assembly.templateInstanceId,
    assembly.prefabId
  ).bytes
  instance = replaceVarint(instance, assembly.templatePrefabId, assembly.prefabId).bytes
  if (!Buffer.from(instance).includes(Buffer.from(TEXT.encode(assembly.name)))) {
    throw new Error('[error] instance name lost while replacing owner ID')
  }
  instance = setPackedIds(instance, assembly.instanceAuxiliaryIds)
  if (!Buffer.from(instance).includes(Buffer.from(TEXT.encode(assembly.name)))) {
    throw new Error('[error] instance name lost while replacing packed IDs')
  }
  instance = setStaticAssemblyTransform(
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
  if (assembly.color) instance = setColor(instance, assembly.color)
  instance = setStaticAssemblyComponents(instance, assembly.components ?? [], 7)
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
        sourceOwnerId: assembly.templateInstanceId,
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
