import fs from 'node:fs'

import type { GstsStaticPrefabCategory } from '../compiler/gsts_config.js'
import { buildFile, readUint32BE } from '../injector/binary.js'
import {
  emitWireMessage,
  nthWireField,
  parseWireMessage,
  printableWireText,
  wireMessage,
  wireRecordId,
  wireRecords,
  type WireField
} from './static_assembly/wire.js'

export type StaticPrefabCategoriesResult = {
  bytes: Uint8Array
  categories: readonly GstsStaticPrefabCategory[]
}

const DEFAULT_CATEGORY_NAME = '未分类页签'
const TEXT = new TextEncoder()

function categoryName(fields: readonly WireField[]): string | undefined {
  const field = fields.find((candidate) => candidate.number === 1 && candidate.wire === 2)
  return field ? printableWireText(field.value as Uint8Array) : undefined
}

function member(prefabId: number): WireField {
  return {
    number: 5,
    wire: 2,
    value: emitWireMessage([
      { number: 1, wire: 0, value: 100 },
      { number: 2, wire: 0, value: prefabId }
    ])
  }
}

function validateCategories(
  definitions: readonly Uint8Array[],
  categories: readonly GstsStaticPrefabCategory[]
): void {
  if (!categories.length) throw new Error('[error] static prefab categories must not be empty')
  const names = new Set<string>()
  const assigned = new Set<number>()
  const definitionIds = new Set(definitions.map(wireRecordId).filter((id) => id !== undefined))
  for (const category of categories) {
    if (!category || typeof category !== 'object') {
      throw new Error('[error] static prefab category must be an object')
    }
    if (typeof category.name !== 'string' || !category.name) {
      throw new Error('[error] static prefab category name is required')
    }
    if (!Array.isArray(category.prefabIds)) {
      throw new Error(`[error] static prefab category ${category.name} prefabIds must be an array`)
    }
    if (names.has(category.name)) {
      throw new Error(`[error] duplicate static prefab category name: ${category.name}`)
    }
    if (category.create !== undefined && typeof category.create !== 'boolean') {
      throw new Error(`[error] static prefab category ${category.name} create must be boolean`)
    }
    if (category.id !== undefined && (!Number.isSafeInteger(category.id) || category.id < 0)) {
      throw new Error(
        `[error] static prefab category ${category.name} id must be a non-negative safe integer`
      )
    }
    names.add(category.name)
    for (const prefabId of category.prefabIds) {
      if (!Number.isSafeInteger(prefabId) || prefabId < 0) {
        throw new Error('[error] static prefab category IDs must be non-negative safe integers')
      }
      if (!definitionIds.has(prefabId)) {
        throw new Error(`[error] static prefab category prefab ${prefabId} not found`)
      }
      if (assigned.has(prefabId)) {
        throw new Error(`[error] prefab ${prefabId} is assigned to multiple categories`)
      }
      assigned.add(prefabId)
    }
  }
}

export function applyStaticPrefabCategories(params: {
  gilPath: string
  categories: readonly GstsStaticPrefabCategory[]
}): StaticPrefabCategoriesResult {
  const source = new Uint8Array(fs.readFileSync(params.gilPath))
  if (source.length < 24) throw new Error('[error] invalid gil size')
  const top = parseWireMessage(source.slice(20, -4))
  if (!top) throw new Error('[error] malformed GIL payload')
  const definitions = wireRecords(top, 4, 1)
  validateCategories(definitions, params.categories)

  const registry = wireMessage(nthWireField(top, 6))
  const categoryRecordFields = registry.filter(
    (field) => field.wire === 2 && wireRecordId(field.value as Uint8Array) === 6
  )
  if (categoryRecordFields.length !== 1) {
    throw new Error(
      `[error] expected one static prefab category record, found ${categoryRecordFields.length}`
    )
  }
  const categoryRecord = parseWireMessage(categoryRecordFields[0].value as Uint8Array)
  if (!categoryRecord) throw new Error('[error] invalid static prefab category record')
  const rootField = categoryRecord.find((field) => {
    if (field.number !== 2 || field.wire !== 2) return false
    const fields = parseWireMessage(field.value as Uint8Array)
    return fields && categoryName(fields) === 'root'
  })
  if (!rootField) throw new Error('[error] static prefab category root not found')
  const root = parseWireMessage(rootField.value as Uint8Array)!
  const existingCategories = root
    .filter((field) => field.number === 4 && field.wire === 2)
    .map((field) => parseWireMessage(field.value as Uint8Array)!)
  const existingNames = new Set(existingCategories.map((fields) => categoryName(fields)))
  const existingIds = new Set(
    existingCategories.flatMap((fields) =>
      fields
        .filter((field) => field.number === 3 && field.wire === 0)
        .map((field) => field.value as number)
    )
  )
  const maxCategoryId = Math.max(0, ...existingIds)
  const createdIds = new Set<number>()
  const createdCategoryIds = new Map<string, number>()
  for (const configured of params.categories) {
    if (configured.create) {
      if (existingNames.has(configured.name)) {
        throw new Error(`[error] static prefab category ${configured.name} already exists`)
      }
      const id = configured.id ?? maxCategoryId + createdIds.size + 1
      if (existingIds.has(id) || createdIds.has(id)) {
        throw new Error(`[error] static prefab category ID ${id} is already occupied`)
      }
      createdIds.add(id)
      createdCategoryIds.set(configured.name, id)
    } else if (configured.id !== undefined) {
      throw new Error(`[error] existing static prefab category ${configured.name} cannot set id`)
    }
  }

  const assignedIds = new Set(params.categories.flatMap((category) => category.prefabIds))
  const defaultMatches = categoryRecord.filter((field) => {
    if (field.number !== 3 || field.wire !== 2) return false
    const fields = parseWireMessage(field.value as Uint8Array)
    return fields && categoryName(fields) === DEFAULT_CATEGORY_NAME
  })
  if (defaultMatches.length !== 1) {
    throw new Error(
      `[error] static prefab category ${DEFAULT_CATEGORY_NAME} not found exactly once`
    )
  }
  const defaultFields = parseWireMessage(defaultMatches[0].value as Uint8Array)!
  defaultMatches[0].value = emitWireMessage(
    defaultFields.filter((field) => {
      if (field.number !== 5 || field.wire !== 2) return true
      const fields = parseWireMessage(field.value as Uint8Array)
      if (!fields) return true
      const kind = fields.find((child) => child.number === 1 && child.wire === 0)?.value
      const id = fields.find((child) => child.number === 2 && child.wire === 0)?.value
      return kind !== 100 || typeof id !== 'number' || !assignedIds.has(id)
    })
  )

  for (const configured of params.categories) {
    const matches = root.filter((field) => {
      if (field.number !== 4 || field.wire !== 2) return false
      const fields = parseWireMessage(field.value as Uint8Array)
      return fields && categoryName(fields) === configured.name
    })
    if (configured.create) {
      const id = createdCategoryIds.get(configured.name)!
      const fields: WireField[] = [
        { number: 1, wire: 2, value: TEXT.encode(configured.name) },
        { number: 3, wire: 0, value: id },
        ...configured.prefabIds.map(member)
      ]
      root.push({ number: 4, wire: 2, value: emitWireMessage(fields) })
      continue
    }
    if (matches.length !== 1) {
      throw new Error(`[error] static prefab category ${configured.name} not found exactly once`)
    }
    const fields = parseWireMessage(matches[0].value as Uint8Array)!
    matches[0].value = emitWireMessage([
      ...fields.filter((field) => field.number !== 5),
      ...configured.prefabIds.map(member)
    ])
  }

  rootField.value = emitWireMessage(root)
  categoryRecordFields[0].value = emitWireMessage(categoryRecord)
  nthWireField(top, 6).value = emitWireMessage(registry)
  return {
    bytes: buildFile(emitWireMessage(top), {
      schema: readUint32BE(source, 4),
      headTag: readUint32BE(source, 8),
      fileType: readUint32BE(source, 12),
      tailTag: readUint32BE(source, source.length - 4)
    }),
    categories: params.categories.map((category) => ({
      name: category.name,
      prefabIds: [...category.prefabIds]
    }))
  }
}
