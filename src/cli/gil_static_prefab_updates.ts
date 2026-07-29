import fs from 'node:fs'

import type { GstsStaticPrefabUpdate } from '../compiler/gsts_config.js'
import { buildFile, readUint32BE } from '../injector/binary.js'
import {
  setStaticAssemblyComponents,
  setStaticAssemblyPosition,
  setStaticAssemblyScale
} from './gil_static_assemblies.js'
import {
  emitWireMessage,
  findWireRecord,
  nthWireField,
  parseWireMessage,
  printableWireText,
  wireMessage,
  wireRecordId
} from './static_assembly/wire.js'

export type StaticPrefabUpdateResult = {
  bytes: Uint8Array
  prefabId: number
  instanceId: number
}

function recordName(record: Uint8Array): string | undefined {
  const visit = (data: Uint8Array): string | undefined => {
    const fields = parseWireMessage(data)
    if (!fields) return undefined
    for (const field of fields) {
      if (field.wire !== 2) continue
      const text = printableWireText(field.value as Uint8Array)
      if (text) return text
      if (field.number !== 501) {
        const nested = visit(field.value as Uint8Array)
        if (nested) return nested
      }
    }
    return undefined
  }
  return visit(record)
}

function instanceDefinitionId(record: Uint8Array): number {
  const fields = parseWireMessage(record)
  if (!fields) throw new Error('[error] invalid prefab instance record')
  const reference = wireMessage(nthWireField(fields, 2))
  const id = nthWireField(reference, 1)
  if (id.wire !== 0 || typeof id.value !== 'number') {
    throw new Error('[error] invalid prefab instance definition reference')
  }
  return id.value
}

function validateUpdate(update: GstsStaticPrefabUpdate): void {
  if (!Number.isSafeInteger(update.prefabId) || update.prefabId < 0) {
    throw new Error('[error] prefabId must be a non-negative safe integer')
  }
  if (!Number.isSafeInteger(update.instanceId) || update.instanceId < 0) {
    throw new Error('[error] instanceId must be a non-negative safe integer')
  }
  if (!update.expectedName) throw new Error('[error] expectedName is required')
  if (!update.components?.length && !update.position && !update.scale) {
    throw new Error('[error] static prefab update requires components, position or scale')
  }
  if (
    update.components &&
    new Set(update.components.map((component) => component.type)).size !== update.components.length
  ) {
    throw new Error('[error] static prefab update components must not contain duplicate types')
  }
  for (const [name, values] of [
    ['position', update.position],
    ['scale', update.scale]
  ] as const) {
    if (values && (values.length !== 3 || values.some((value) => !Number.isFinite(value)))) {
      throw new Error(`[error] ${name} must contain three finite numbers`)
    }
  }
}

export function applyStaticPrefabUpdate(params: {
  gilPath: string
  update: GstsStaticPrefabUpdate
}): StaticPrefabUpdateResult {
  const source = new Uint8Array(fs.readFileSync(params.gilPath))
  if (source.length < 24) throw new Error('[error] invalid gil size')
  const top = parseWireMessage(source.slice(20, -4))
  if (!top) throw new Error('[error] malformed GIL payload')
  const update = params.update
  validateUpdate(update)

  const definitions = wireMessage(nthWireField(top, 4))
  const instances = wireMessage(nthWireField(top, 8))
  const definitionField = definitions.find(
    (field) =>
      field.number === 1 &&
      field.wire === 2 &&
      wireRecordId(field.value as Uint8Array) === update.prefabId
  )
  const instanceField = instances.find(
    (field) =>
      field.number === 1 &&
      field.wire === 2 &&
      wireRecordId(field.value as Uint8Array) === update.instanceId
  )
  if (update.components && !definitionField) {
    findWireRecord([], update.prefabId)
    throw new Error('[error] unreachable')
  }
  if (!instanceField) {
    findWireRecord([], update.instanceId)
    throw new Error('[error] unreachable')
  }

  let definition = definitionField?.value as Uint8Array | undefined
  let instance = instanceField.value as Uint8Array
  if (definition && recordName(definition) !== update.expectedName) {
    throw new Error('[error] definition expectedName does not match current record')
  }
  if (recordName(instance) !== update.expectedName) {
    throw new Error('[error] instance expectedName does not match current record')
  }
  if (instanceDefinitionId(instance) !== update.prefabId) {
    throw new Error('[error] instance does not reference the configured prefabId')
  }

  if (update.components) {
    definition = setStaticAssemblyComponents(definition!, update.components, 8)
    instance = setStaticAssemblyComponents(instance, update.components, 7)
  }
  if (update.position) {
    instance = setStaticAssemblyPosition(instance, update.position, 6)
  }
  if (update.scale) {
    instance = setStaticAssemblyScale(instance, update.scale, 6)
  }
  if (definitionField && definition) definitionField.value = definition
  instanceField.value = instance
  nthWireField(top, 4).value = emitWireMessage(definitions)
  nthWireField(top, 8).value = emitWireMessage(instances)

  return {
    bytes: buildFile(emitWireMessage(top), {
      schema: readUint32BE(source, 4),
      headTag: readUint32BE(source, 8),
      fileType: readUint32BE(source, 12),
      tailTag: readUint32BE(source, source.length - 4)
    }),
    prefabId: update.prefabId,
    instanceId: update.instanceId
  }
}
