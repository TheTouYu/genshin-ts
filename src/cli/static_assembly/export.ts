import type {
  GstsStaticAssemblyComponent,
  GstsStaticColor
} from '../../compiler/gsts_config.js'
import {
  packedWireIds,
  parseWireMessage as parse,
  printableWireText as printable,
  wireRecordId as recordId,
  wireRecords as records,
  type WireField
} from './wire.js'

export type ExportedStaticAssemblyItem = {
  resourceId: number
  position: readonly [number, number, number]
  rotation: readonly [number, number, number]
  scale: readonly [number, number, number]
  color?: GstsStaticColor
}

export type ExportedStaticAssembly = {
  name: string
  prefabId: number
  /** [ZH] 模板资源 ID：主定义记录 field 2（如长方体 10009001）。 */
  templateResourceId: number
  /** [ZH] 以自身为模板的重放字段（templatePrefabId/templateInstanceId/templateName）。 */
  templatePrefabId: number
  templateInstanceId: number
  templateName: string
  position: readonly [number, number, number]
  rotation: readonly [number, number, number]
  scale: readonly [number, number, number]
  items: readonly ExportedStaticAssemblyItem[]
  components: readonly GstsStaticAssemblyComponent[]
}

function firstVarint(fields: readonly WireField[] | undefined, number: number): number | undefined {
  const field = fields?.find((item) => item.number === number && item.wire === 0)
  return typeof field?.value === 'number' ? field.value : undefined
}

function floatVector(data: Uint8Array): [number, number, number] {
  const values = [0, 0, 0]
  for (const field of parse(data) ?? []) {
    if (field.wire === 5 && field.number >= 1 && field.number <= 3) {
      values[field.number - 1] = Buffer.from(field.value as Uint8Array).readFloatLE(0)
    }
  }
  return values as [number, number, number]
}

function transformOwner(record: Uint8Array, ownerFieldNumber: number): Uint8Array | undefined {
  const fields = parse(record)
  if (!fields) return undefined
  const owner = fields.find(
    (field) =>
      field.wire === 2 &&
      field.number === ownerFieldNumber &&
      parse(field.value as Uint8Array)?.some(
        (child) => child.number === 1 && child.wire === 0 && child.value === 1
      )
  )
  return owner?.value as Uint8Array | undefined
}

function readTransform(record: Uint8Array, ownerFieldNumber: number): {
  position: [number, number, number]
  rotation: [number, number, number]
  scale: [number, number, number]
} {
  const owner = transformOwner(record, ownerFieldNumber)
  if (!owner) return { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }
  const ownerFields = parse(owner)
  const transform = ownerFields?.find((field) => field.number === 11 && field.wire === 2)
  if (!transform) return { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }
  const transformFields = parse(transform.value as Uint8Array)
  const position = transformFields?.find((field) => field.number === 1 && field.wire === 2)
  const rotation = transformFields?.find((field) => field.number === 2 && field.wire === 2)
  const scale = transformFields?.find((field) => field.number === 3 && field.wire === 2)
  return {
    position: position ? floatVector(position.value as Uint8Array) : [0, 0, 0],
    rotation: rotation ? floatVector(rotation.value as Uint8Array) : [0, 0, 0],
    scale: scale ? floatVector(scale.value as Uint8Array) : [1, 1, 1]
  }
}

function readColor(record: Uint8Array): GstsStaticColor | undefined {
  for (const field of parse(record) ?? []) {
    if (field.wire !== 2 || field.number !== 5) continue
    const entry = parse(field.value as Uint8Array)
    if (!entry) continue
    if (firstVarint(entry, 1) !== 22) continue
    const config = entry.find((item) => item.number === 32 && item.wire === 2)
    if (!config) continue
    const color = parse(config.value as Uint8Array)
    if (!color) continue
    if (!color.some((item) => item.number === 1 && item.wire === 0 && item.value === 1)) {
      return { enabled: false }
    }
    const rgb = firstVarint(color, 5)
    const opacity = color.find((item) => item.number === 4 && item.wire === 5)
    const overlay = firstVarint(color, 6)
    if (rgb === undefined || !opacity) continue
    return {
      enabled: true,
      rgb,
      opacity: Buffer.from(opacity.value as Uint8Array).readFloatLE(0),
      overlay: overlay === 6701 ? 'multiply' : 'overwrite'
    }
  }
  return undefined
}

function definitionName(record: Uint8Array): string | undefined {
  const f6 = parse(record)?.find((field) => field.number === 6 && field.wire === 2)
  if (!f6) return undefined
  const f11 = parse(f6.value as Uint8Array)?.find((field) => field.number === 11 && field.wire === 2)
  if (!f11) return undefined
  const name = parse(f11.value as Uint8Array)?.find(
    (field) => field.number === 1 && field.wire === 2
  )
  return name ? printable(name.value as Uint8Array) : undefined
}

function templateResourceId(record: Uint8Array): number | undefined {
  return firstVarint(parse(record), 2)
}

function componentSlots(record: Uint8Array, fieldNumber: number): Uint8Array[] {
  return (parse(record) ?? [])
    .filter((field) => field.number === fieldNumber && field.wire === 2)
    .map((field) => field.value as Uint8Array)
}

type TabBarRegionGeometry = {
  regionType?: 'box' | 'sphere'
  regionSize?: readonly [number, number, number]
  regionRadius?: number
  regionCenter?: readonly [number, number, number]
}

/** float32 量化值规整为可读小数（如 0.10000000149011612 → 0.1）。 */
function quantizeFloat(value: number): number {
  return Number(value.toFixed(6))
}

/**
 * 解码选项卡区域几何（真实样本 exp5/exp6）：
 * 盒体 f11.f2 = {X,Y,Z} float32；球体 f1=1 + f12 = { f1=偏移子块, f2=float32 半径 }。
 * 默认盒体 1×1×1 不输出 region 字段（保持旧导出形状）；球体恒输出 regionType。
 */
function decodeTabBarRegion(
  region: WireField | undefined
): TabBarRegionGeometry {
  if (!region) return {}
  const regionFields = parse(region.value as Uint8Array)
  if (!regionFields) return {}
  const box = regionFields.find((field) => field.number === 11 && field.wire === 2)
  if (box) {
    const boxFields = parse(box.value as Uint8Array)
    const sizeField = boxFields?.find((field) => field.number === 2 && field.wire === 2)
    if (!sizeField) return {}
    const size = floatVector(sizeField.value as Uint8Array).map(quantizeFloat) as [
      number,
      number,
      number
    ]
    const isDefault = size[0] === 1 && size[1] === 1 && size[2] === 1
    return isDefault ? {} : { regionType: 'box', regionSize: size }
  }
  const marker = regionFields.find((field) => field.number === 1 && field.wire === 0)
  const sphere = regionFields.find((field) => field.number === 12 && field.wire === 2)
  if (marker?.value !== 1 || !sphere) return {}
  const sphereFields = parse(sphere.value as Uint8Array)
  const radiusField = sphereFields?.find((field) => field.number === 2 && field.wire === 5)
  if (!radiusField) return {}
  const radius = quantizeFloat(Buffer.from(radiusField.value as Uint8Array).readFloatLE(0))
  const centerField = sphereFields?.find((field) => field.number === 1 && field.wire === 2)
  const center = centerField ? floatVector(centerField.value as Uint8Array) : [0, 0, 0]
  return {
    regionType: 'sphere',
    regionRadius: radius,
    regionCenter: [quantizeFloat(center[0]), quantizeFloat(center[1]), quantizeFloat(center[2])]
  }
}

function decodeComponent(slot: Uint8Array): GstsStaticAssemblyComponent | undefined {
  const fields = parse(slot)
  if (!fields) return undefined
  const code = firstVarint(fields, 1)
  const enabled = fields.some((field) => field.number === 2 && field.wire === 0 && field.value === 1)
  if (!enabled) return undefined
  if (code === 9) return { type: 'followMotion', preset: 'fullFollow' }
  // 2026-08-13 修正：基础运动器真实类型码为 4（原 18 为模板自带组件误判）
  if (code === 4) return { type: 'basicMotion', preset: 'default' }
  // 铭牌/文本气泡/光源默认槽（nameplate exp2 / component-investigation exp7 / 2026-08-17 灯阵差分）
  if (code === 27) return { type: 'nameplate', preset: 'default' }
  if (code === 28) return { type: 'textBubble', preset: 'default' }
  if (code === 38) return { type: 'lightSource', preset: 'default' }
  if (code === 17) {
    const config = fields.find((field) => field.number === 27 && field.wire === 2)
    if (!config) return undefined
    const configFields = parse(config.value as Uint8Array)
    if (!configFields) return undefined
    const region = configFields.find((field) => field.number === 1 && field.wire === 2)
    let regionName: string | undefined
    if (region) {
      const nameField = parse(region.value as Uint8Array)?.find(
        (field) => field.number === 502 && field.wire === 2
      )
      regionName = nameField ? printable(nameField.value as Uint8Array) : undefined
    }
    const options: string[] = []
    for (const option of configFields) {
      if (option.number !== 2 || option.wire !== 2) continue
      const shortName = parse(option.value as Uint8Array)?.find(
        (field) => field.number === 2 && field.wire === 2
      )
      const text = shortName ? printable(shortName.value as Uint8Array) : undefined
      if (text) options.push(text)
    }
    if (regionName && options.length) {
      return { type: 'tabBar', regionName, options, ...decodeTabBarRegion(region) }
    }
  }
  return undefined
}

export function exportStaticAssemblies(bytes: Uint8Array): ExportedStaticAssembly[] {
  if (bytes.length < 24) throw new Error('[error] invalid GIL size')
  const top = parse(bytes.slice(20, -4))
  if (!top) throw new Error('[error] malformed GIL payload')
  const definitions = records(top, 4, 1)
  const instances = records(top, 8, 1)
  const auxiliaryById = new Map<number, Uint8Array>()
  for (const record of [...records(top, 27, 1), ...records(top, 27, 2)]) {
    const id = recordId(record)
    if (id !== undefined) auxiliaryById.set(id, record)
  }
  const result: ExportedStaticAssembly[] = []
  for (const definition of definitions) {
    const prefabId = recordId(definition)
    if (prefabId === undefined) continue
    let packed: number[] = []
    try {
      packed = packedWireIds(definition)
    } catch {
      // Definitions without a packed field 501 have no decoration items.
    }
    if (!packed.length) continue
    const name = definitionName(definition)
    const resourceId = templateResourceId(definition)
    if (!name || resourceId === undefined) continue
    const instance = instances.find((record) => recordId(record) === prefabId)
    if (!instance) continue
    const main = readTransform(instance, 6)
    const items: ExportedStaticAssemblyItem[] = []
    for (const auxiliaryId of packed) {
      const auxiliary = auxiliaryById.get(auxiliaryId)
      if (!auxiliary) throw new Error(`[error] missing auxiliary record ${auxiliaryId}`)
      const itemResource = firstVarint(parse(auxiliary), 2)
      if (itemResource === undefined)
        throw new Error(`[error] auxiliary record ${auxiliaryId} has no resource ID`)
      const transform = readTransform(auxiliary, 5)
      const color = readColor(auxiliary)
      items.push({ resourceId: itemResource, ...transform, ...(color ? { color } : {}) })
    }
    const components = componentSlots(definition, 8)
      .map(decodeComponent)
      .filter((component): component is GstsStaticAssemblyComponent => component !== undefined)
    result.push({
      name,
      prefabId,
      templateResourceId: resourceId,
      templatePrefabId: prefabId,
      templateInstanceId: prefabId,
      templateName: name,
      ...main,
      items,
      components
    })
  }
  return result.sort((a, b) => a.prefabId - b.prefabId)
}
