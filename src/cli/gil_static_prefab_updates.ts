import fs from 'node:fs'

import type {
  GstsStaticAssemblyComponent,
  GstsStaticPrefabUpdate
} from '../compiler/gsts_config.js'
import { buildFile, readUint32BE } from '../injector/binary.js'
import { decodeTabBarRegion, type TabBarRegionGeometry } from './gil_entities.js'
import {
  componentSnapshot,
  removeStaticAssemblyComponents,
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
  /** [ZH] 实际从定义与实例中移除的组件类型码。 / [EN] Type codes actually removed from definition and instance. */
  removedComponents: number[]
}

/** [ZH] 选项卡区域配置（tab-options 更新后的最终值）。 / [EN] Tab region config after a tab-options update. */
export type TabOptionsRegion = {
  regionName: string
  regionType: 'box' | 'sphere'
  regionSize: readonly [number, number, number]
  regionRadius: number
  regionCenter: readonly [number, number, number]
}

/** [ZH] tab-options 更新参数；区域字段缺省时继承实例现有选项卡槽。 / [EN] tab-options update params; region fields default to the instance's current tab slot. */
export type TabOptionsUpdateParams = {
  gilPath: string
  /** [ZH] 既有场景实例 ID（root 8）；元件定义 ID 从实例引用自动解析。 / [EN] Existing scene instance ID (root 8); the prefab definition ID is resolved from the instance reference. */
  instanceId: number
  /** [ZH] 实例当前名称（防误改）。 / [EN] Current instance name (safety check). */
  expectedName: string
  /** [ZH] 新的选项短名列表（按序编号）。 / [EN] New option short names (numbered in order). */
  options: readonly string[]
  regionName?: string
  regionType?: 'box' | 'sphere'
  regionSize?: readonly [number, number, number]
  regionRadius?: number
  regionCenter?: readonly [number, number, number]
}

/** [ZH] tab-options 更新结果。 / [EN] tab-options update result. */
export type TabOptionsUpdateResult = StaticPrefabUpdateResult & {
  /** [ZH] 更新后选项卡区域的最终配置。 / [EN] Final tab region config after the update. */
  region: TabOptionsRegion
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
  if (!update.components?.length && !update.removeComponents?.length && !update.position && !update.scale) {
    throw new Error('[error] static prefab update requires components, removeComponents, position or scale')
  }
  if (update.removeComponents) {
    if (
      update.removeComponents.some(
        (typeCode) => !Number.isSafeInteger(typeCode) || typeCode < 0
      )
    ) {
      throw new Error('[error] removeComponents must contain non-negative safe integer type codes')
    }
    if (new Set(update.removeComponents).size !== update.removeComponents.length) {
      throw new Error('[error] static prefab update removeComponents must not contain duplicate type codes')
    }
    if (update.components) {
      const addedCodes = update.components.map((component) => componentSnapshot(component).typeCode)
      const overlap = update.removeComponents.filter((typeCode) => addedCodes.includes(typeCode))
      if (overlap.length) {
        throw new Error(
          `[error] static prefab update must not add and remove the same component type ${overlap.join(',')}`
        )
      }
    }
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
  if (update.removeComponents && !definitionField) {
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
  const removedComponents: number[] = []
  if (update.removeComponents?.length) {
    const definitionRemoval = removeStaticAssemblyComponents(
      definition!,
      update.removeComponents,
      8
    )
    const instanceRemoval = removeStaticAssemblyComponents(instance, update.removeComponents, 7)
    definition = definitionRemoval.bytes
    instance = instanceRemoval.bytes
    removedComponents.push(
      ...[...new Set([...definitionRemoval.removed, ...instanceRemoval.removed])].sort(
        (a, b) => a - b
      )
    )
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
    instanceId: update.instanceId,
    removedComponents
  }
}

type DecodedTabBarSlot = {
  regionName: string
  options: string[]
  geometry: TabBarRegionGeometry
}

/** 从记录组件槽（definition f8 / instance f7）中解码 type 17 选项卡槽。 */
function decodeTabBarSlot(record: Uint8Array, fieldNumber: number): DecodedTabBarSlot | undefined {
  const fields = parseWireMessage(record)
  if (!fields) return undefined
  for (const field of fields) {
    if (field.number !== fieldNumber || field.wire !== 2) continue
    const slot = parseWireMessage(field.value as Uint8Array)
    if (!slot) continue
    const typeCode = slot.find((child) => child.number === 1 && child.wire === 0)?.value
    if (typeCode !== 17) continue
    if (!slot.some((child) => child.number === 2 && child.wire === 0 && child.value === 1)) continue
    const config = slot.find((child) => child.number === 27 && child.wire === 2)
    if (!config) continue
    const configFields = parseWireMessage(config.value as Uint8Array)
    if (!configFields) continue
    const region = configFields.find((child) => child.number === 1 && child.wire === 2)
    let regionName: string | undefined
    if (region) {
      const nameField = parseWireMessage(region.value as Uint8Array)?.find(
        (child) => child.number === 502 && child.wire === 2
      )
      regionName = nameField ? printableWireText(nameField.value as Uint8Array) : undefined
    }
    const options: string[] = []
    for (const option of configFields) {
      if (option.number !== 2 || option.wire !== 2) continue
      const shortName = parseWireMessage(option.value as Uint8Array)?.find(
        (child) => child.number === 2 && child.wire === 2
      )
      const text = shortName ? printableWireText(shortName.value as Uint8Array) : undefined
      if (text) options.push(text)
    }
    if (regionName && options.length) {
      return { regionName, options, geometry: decodeTabBarRegion(region) }
    }
  }
  return undefined
}

/**
 * [ZH] 同步 root5 场景实体的 tabBar 组件槽（field 7）。
 * tab-options 写 root4 定义 + root8 实例后，场景实体（root5）上的组件槽是独立副本，
 * 游戏实际读取的是场景实体的副本；不同步会导致"改了元件但游戏里没生效"。
 * 场景实体通过 field 2 引用 prefabId，匹配后写其 field 7 组件槽（编码与 root8 实例一致）。
 * 无匹配场景实体时保持原样（不报错，避免误伤无 tabBar 副本的实体）。
 *
 * [EN] Sync the tabBar component slot (field 7) of the root5 scene entity.
 * The scene entity (root5) carries an independent copy of the component slot
 * that the game actually reads; without syncing it, editing the prefab has no
 * in-game effect. The scene entity references the prefabId via field 2; its
 * field 7 slot is encoded identically to the root8 instance.
 */
function syncSceneEntityTabOptions(
  bytes: Uint8Array,
  prefabId: number,
  component: GstsStaticAssemblyComponent
): Uint8Array {
  const top = parseWireMessage(bytes.slice(20, -4))
  if (!top) return bytes
  const entities = wireMessage(nthWireField(top, 5))
  let changed = false
  for (const field of entities) {
    if (field.number !== 1 || field.wire !== 2) continue
    const entity = field.value as Uint8Array
    if (instanceDefinitionId(entity) !== prefabId) continue
    field.value = setStaticAssemblyComponents(entity, [component], 7)
    changed = true
  }
  if (!changed) return bytes
  nthWireField(top, 5).value = emitWireMessage(entities)
  return buildFile(emitWireMessage(top), {
    schema: readUint32BE(bytes, 4),
    headTag: readUint32BE(bytes, 8),
    fileType: readUint32BE(bytes, 12),
    tailTag: readUint32BE(bytes, bytes.length - 4)
  })
}

/**
 * [ZH] 更新既有实例的选项卡选项：保留现有区域配置，仅替换选项列表。
 * 元件定义（root 4 f8）、场景实例（root 8 f7）与场景实体（root 5 f7）三层同步写；
 * 区域字段可覆盖。
 *
 * [EN] Replace the tab options of an existing instance: the current region
 * config is preserved and only the option list is replaced. The prefab
 * definition (root 4 f8), the scene instance (root 8 f7) and the scene entity
 * (root 5 f7) are all updated; region fields may be overridden.
 */
export function applyTabOptionsUpdate(params: TabOptionsUpdateParams): TabOptionsUpdateResult {
  const source = new Uint8Array(fs.readFileSync(params.gilPath))
  if (source.length < 24) throw new Error('[error] invalid gil size')
  const top = parseWireMessage(source.slice(20, -4))
  if (!top) throw new Error('[error] malformed GIL payload')

  const instances = wireMessage(nthWireField(top, 8))
  const instanceField = instances.find(
    (field) =>
      field.number === 1 &&
      field.wire === 2 &&
      wireRecordId(field.value as Uint8Array) === params.instanceId
  )
  if (!instanceField) {
    findWireRecord([], params.instanceId)
    throw new Error('[error] unreachable')
  }
  const instance = instanceField.value as Uint8Array
  if (recordName(instance) !== params.expectedName) {
    throw new Error('[error] instance expectedName does not match current record')
  }
  if (!params.options.length || params.options.some((option) => !option || option.includes('\u0000'))) {
    throw new Error('[error] options must be a non-empty list of non-empty strings')
  }
  const slot = decodeTabBarSlot(instance, 7)
  if (!slot) {
    throw new Error(
      `[error] instance ${params.instanceId} has no decodable tabBar component (type 17)`
    )
  }
  const regionType = params.regionType ?? slot.geometry.regionType ?? 'box'
  if (regionType !== 'box' && regionType !== 'sphere') {
    throw new Error('[error] regionType must be box or sphere')
  }
  const regionSize = params.regionSize ?? slot.geometry.regionSize ?? [1, 1, 1]
  const regionRadius = params.regionRadius ?? slot.geometry.regionRadius ?? 1
  const regionCenter = params.regionCenter ?? slot.geometry.regionCenter ?? [0, 0, 0]
  const regionName = params.regionName ?? slot.regionName
  const component: GstsStaticAssemblyComponent = {
    type: 'tabBar',
    regionName,
    options: params.options,
    regionType,
    ...(regionType === 'box'
      ? { regionSize, regionCenter }
      : { regionRadius, regionCenter })
  }
  const result = applyStaticPrefabUpdate({
    gilPath: params.gilPath,
    update: {
      prefabId: instanceDefinitionId(instance),
      instanceId: params.instanceId,
      expectedName: params.expectedName,
      components: [component]
    }
  })
  // 同步 root5 场景实体（游戏实际读取的组件槽副本），否则"改了元件但游戏里没生效"。
  const bytes = syncSceneEntityTabOptions(result.bytes, result.prefabId, component)
  return {
    ...result,
    bytes,
    region: { regionName, regionType, regionSize, regionRadius, regionCenter }
  }
}
