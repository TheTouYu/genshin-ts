import { buildFile, readUint32BE } from '../injector/binary.js'
import { emitWireMessage, parseWireMessage, type WireField } from './static_assembly/wire.js'
import {
  addDefaultComponentSlots,
  buildCustomDefinitionRecord,
  buildStaticPrefabRecord,
  officialPrefabName,
  removeComponentSlots
} from './official_prefabs.js'

function parse(data: Uint8Array): WireField[] | undefined {
  return parseWireMessage(data)
}

function emit(fields: readonly WireField[]): Uint8Array {
  return emitWireMessage(fields)
}

export function createCustomPrefab(
  bytes: Uint8Array,
  params: { id: number; resourceId: number; name?: string; position?: readonly number[] }
): { bytes: Uint8Array; id: number; name: string } {
  const top = parse(bytes.slice(20, -4))
  if (!top) throw new Error('[error] malformed GIL payload')
  const name = params.name || officialPrefabName(params.resourceId) || ''
  const pos = params.position ?? [0, 0, 0]
  const transform = {
    position: [pos[0] ?? 0, pos[1] ?? 0, pos[2] ?? 0] as [number, number, number],
    rotation: [0, 0, 0] as [number, number, number],
    scale: [1, 1, 1] as [number, number, number]
  }
  const record = buildCustomDefinitionRecord({ id: params.id, resourceId: params.resourceId, name, transform })
  let root4 = top.find((f) => f.number === 4 && f.wire === 2)
  if (!root4) {
    root4 = { number: 4, wire: 2, value: emit([]) }
    top.push(root4)
  }
  const section = parse(root4.value as Uint8Array)
  if (!section) throw new Error('[error] invalid root 4 section')
  const exists = section.some((f) => {
    if (f.number !== 1 || f.wire !== 2) return false
    const rec = parse(f.value as Uint8Array)
    return rec?.some((x) => x.number === 1 && x.wire === 0 && x.value === params.id)
  })
  if (exists) throw new Error(`[error] prefab id already exists: ${params.id}`)
  section.push({ number: 1, wire: 2, value: record })
  root4.value = emit(section)
  registerElementEntry(top, { groupType: 6, entryType: 100, id: params.id })
  return {
    bytes: buildFile(emit(top), {
      schema: readUint32BE(bytes, 4),
      headTag: readUint32BE(bytes, 8),
      fileType: readUint32BE(bytes, 12),
      tailTag: readUint32BE(bytes, bytes.length - 4)
    }),
    id: params.id,
    name
  }
}

/**
 * 在 root6 未分类页签组追加一条登记（2026-08-20 样本闭合）：
 * - 动态定义：type6 组 + {100, defID}（create 动态用，编辑器保存时也会补）
 * - 静态/官方页面模型：type3 组 + {400, instanceID}
 * type6/type3 组结构同构（{1:组号, 2:{1:'root',3:1}, 3:{1:'未分类页签',3:2,5:[条目]}}）。
 */
function registerElementEntry(
  top: WireField[],
  params: { groupType: number; entryType: number; id: number }
): void {
  const entry = emit([
    { number: 1, wire: 0, value: params.entryType },
    { number: 2, wire: 0, value: params.id }
  ])
  let root6 = top.find((f) => f.number === 6 && f.wire === 2)
  if (!root6) {
    root6 = { number: 6, wire: 2, value: emit([]) }
    top.push(root6)
  }
  const records = parse(root6.value as Uint8Array)
  if (!records) throw new Error('[error] invalid root 6 section')
  for (const recordField of records) {
    if (recordField.number !== 1 || recordField.wire !== 2) continue
    const recordFields = parse(recordField.value as Uint8Array)
    if (!recordFields) continue
    if (recordFields.find((x) => x.number === 1 && x.wire === 0)?.value !== params.groupType) continue
    const group = recordFields.find((f) => f.number === 3 && f.wire === 2)
    if (!group) continue
    const groupFields = parse(group.value as Uint8Array)
    if (!groupFields) continue
    const exists = groupFields.some((f) => {
      if (f.number !== 5 || f.wire !== 2) return false
      const em = parse(f.value as Uint8Array)
      return em?.find((x) => x.number === 2 && x.wire === 0)?.value === params.id
    })
    if (exists) return
    groupFields.push({ number: 5, wire: 2, value: entry })
    group.value = emit(groupFields)
    recordField.value = emit(recordFields)
    root6.value = emit(records)
    return
  }
  // 无未分类页签组：创建最小记录（与 registerEntity 同构）
  const group = emit([
    { number: 1, wire: 2, value: new TextEncoder().encode('未分类页签') },
    { number: 3, wire: 0, value: 2 },
    { number: 5, wire: 2, value: entry }
  ])
  const record = emit([
    { number: 1, wire: 0, value: params.groupType },
    { number: 2, wire: 2, value: emit([{ number: 1, wire: 2, value: new TextEncoder().encode('root') }, { number: 3, wire: 0, value: 1 }]) },
    { number: 3, wire: 2, value: group }
  ])
  records.push({ number: 1, wire: 2, value: record })
  root6.value = emit(records)
}

/**
 * 创建“静态元件”root8 实例（动态元件 → 静态资源转换后的形态）：
 * 写入 root8.1 静态记录，并在 root6 登记 type400。
 */
export function createStaticPrefabInstance(
  bytes: Uint8Array,
  params: { id: number; resourceId: number; name?: string; position?: readonly number[] }
): { bytes: Uint8Array; id: number; name: string } {
  const top = parse(bytes.slice(20, -4))
  if (!top) throw new Error('[error] malformed GIL payload')
  const name = params.name || officialPrefabName(params.resourceId) || ''
  const pos = params.position ?? [0, 0, 0]
  const transform = {
    position: [pos[0] ?? 0, pos[1] ?? 0, pos[2] ?? 0] as [number, number, number],
    rotation: [0, 0, 0] as [number, number, number],
    scale: [1, 1, 1] as [number, number, number]
  }
  const record = buildStaticPrefabRecord({ id: params.id, resourceId: params.resourceId, name, transform })
  let root8 = top.find((f) => f.number === 8 && f.wire === 2)
  if (!root8) {
    root8 = { number: 8, wire: 2, value: emit([]) }
    top.push(root8)
  }
  const section = parse(root8.value as Uint8Array)
  if (!section) throw new Error('[error] invalid root 8 section')
  const exists = section.some((f) => {
    if (f.number !== 1 || f.wire !== 2) return false
    const rec = parse(f.value as Uint8Array)
    return rec?.some((x) => x.number === 1 && x.wire === 0 && x.value === params.id)
  })
  if (exists) throw new Error(`[error] static prefab instance id already exists: ${params.id}`)
  section.push({ number: 1, wire: 2, value: record })
  root8.value = emit(section)
  registerElementEntry(top, { groupType: 3, entryType: 400, id: params.id })
  return {
    bytes: buildFile(emit(top), {
      schema: readUint32BE(bytes, 4),
      headTag: readUint32BE(bytes, 8),
      fileType: readUint32BE(bytes, 12),
      tailTag: readUint32BE(bytes, bytes.length - 4)
    }),
    id: params.id,
    name
  }
}

function topFields(bytes: Uint8Array): WireField[] {
  const top = parseWireMessage(bytes.slice(20, -4))
  if (!top) throw new Error('[error] malformed GIL payload')
  return top
}

function rebuild(bytes: Uint8Array, top: readonly WireField[]): Uint8Array {
  return buildFile(emit(top), {
    schema: readUint32BE(bytes, 4),
    headTag: readUint32BE(bytes, 8),
    fileType: readUint32BE(bytes, 12),
    tailTag: readUint32BE(bytes, bytes.length - 4)
  })
}

/** root4 是否存在指定定义 ID。 */
function hasDefinition(top: readonly WireField[], definitionId: number): boolean {
  const root4 = top.find((f) => f.number === 4 && f.wire === 2)
  if (!root4) return false
  return (parseWireMessage(root4.value as Uint8Array) ?? []).some((f) => {
    if (f.number !== 1 || f.wire !== 2) return false
    return (
      parseWireMessage(f.value as Uint8Array)?.find(
        (x) => x.number === 1 && x.wire === 0 && x.value === definitionId
      ) !== undefined
    )
  })
}

/** 记录内组件槽数量（field number = slotNumber）。 */
function componentSlotCount(record: Uint8Array, slotNumber: number): number {
  const fields = parseWireMessage(record)
  return fields ? fields.filter((f) => f.number === slotNumber && f.wire === 2).length : 0
}

/**
 * 设置/清除名字槽静态标记（2026-08-20 样本闭合：切换静态时名字槽 f11 加 {f2:1}；
 * 动态与纯静态类型均无）。ownerNumber：定义 = 6（f6 槽1）、实例/实体 = 5（f5 槽1）。
 */
function setStaticNameMarker(
  record: Uint8Array,
  ownerNumber: number,
  marker: boolean
): Uint8Array {
  const fields = parseWireMessage(record)
  if (!fields) return record
  for (const owner of fields) {
    if (owner.wire !== 2 || owner.number !== ownerNumber) continue
    const ownerFields = parseWireMessage(owner.value as Uint8Array)
    if (!ownerFields) continue
    if (ownerFields.find((x) => x.number === 1 && x.wire === 0)?.value !== 1) continue
    const f11 = ownerFields.find((x) => x.number === 11 && x.wire === 2)
    if (!f11) continue
    const f11Fields = parseWireMessage(f11.value as Uint8Array) ?? []
    const hasMarker = f11Fields.some((x) => x.number === 2 && x.wire === 0 && x.value === 1)
    if (marker === hasMarker) continue
    f11.value = marker
      ? emit([...f11Fields, { number: 2, wire: 0, value: 1 }])
      : emit(f11Fields.filter((x) => !(x.number === 2 && x.wire === 0 && x.value === 1)))
    owner.value = emit(ownerFields)
    return emit(fields)
  }
  return record
}

/** 转换记录组件槽：toStatic 删除、toDynamic 追加官方默认槽。返回是否发生变更。 */
function convertRecordComponents(
  record: Uint8Array,
  slotNumber: number,
  toStatic: boolean
): { bytes: Uint8Array; changed: boolean } {
  const current = componentSlotCount(record, slotNumber)
  const want = toStatic ? 0 : 6
  if (current === want) return { bytes: record, changed: false }
  return {
    bytes: toStatic
      ? removeComponentSlots(record, slotNumber)
      : addDefaultComponentSlots(record, slotNumber),
    changed: true
  }
}

/**
 * 动态 ↔ 静态切换元件（2026-08-20 五个真实样本闭合的规律）：
 * - 实例（root8.1）：f7 组件槽 删除/恢复官方默认 6 槽
 * - 自定义定义（root4.1，实例 f2 引用的本地定义）：f8 组件槽同步 删除/恢复
 * - **实体联动**：引用该定义的 root5 场景实体 f7 组件槽同步 删除/恢复（transform 等保留）
 * - 官方引用式实例（f2={1:resID,2:1}，无本地定义）：只转换实例，不联动实体
 * - root46 登记：语义未闭合（f1 非单调/f2 未知），fail-closed 不写
 */
export function convertPrefabStatic(
  bytes: Uint8Array,
  params: { id: number; toStatic: boolean }
): { bytes: Uint8Array; id: number; definitionId?: number; entitiesUpdated: number } {
  const top = topFields(bytes)
  let instanceField: WireField | undefined
  let definitionId: number | undefined

  // 定位实例：优先按实例 ID（root8.1.f1）；找不到再按定义 ID（root4.1.f1）反向找引用实例
  // （CLI create 动态只建定义无页面模型时，instanceField 保持 undefined，仅转定义+实体）
  const root8 = top.find((f) => f.number === 8 && f.wire === 2)
  let root8Section: WireField[] = []
  if (root8) {
    root8Section = parseWireMessage(root8.value as Uint8Array) ?? []
    for (const f of root8Section) {
      if (f.number !== 1 || f.wire !== 2) continue
      const rec = parseWireMessage(f.value as Uint8Array)
      if (!rec) continue
      if (rec.find((x) => x.number === 1 && x.wire === 0)?.value === params.id) {
        instanceField = f
        break
      }
    }
    if (!instanceField) {
      const root4 = top.find((f) => f.number === 4 && f.wire === 2)
      const isDefinition =
        root4 !== undefined &&
        (parseWireMessage(root4.value as Uint8Array) ?? []).some((f) => {
          if (f.number !== 1 || f.wire !== 2) return false
          return (
            parseWireMessage(f.value as Uint8Array)?.find(
              (x) => x.number === 1 && x.wire === 0 && x.value === params.id
            ) !== undefined
          )
        })
      if (isDefinition) {
        definitionId = params.id
        for (const f of root8Section) {
          if (f.number !== 1 || f.wire !== 2) continue
          const rec = parseWireMessage(f.value as Uint8Array)
          const f2 = rec?.find((x) => x.number === 2 && x.wire === 2)
          const f2Fields = f2 ? (parseWireMessage(f2.value as Uint8Array) ?? []) : []
          if (f2Fields.find((x) => x.number === 1 && x.wire === 0)?.value === definitionId) {
            instanceField = f
            break
          }
        }
      }
    }
  }
  // 实例未找到但定义存在（定义-only 元件）：允许只转换定义+实体
  if (!instanceField && definitionId === undefined) {
    throw new Error(`[error] prefab not found: ${params.id}`)
  }

  // 实例的本地定义引用（f2={1:defID} 且 root4 存在该定义）
  if (instanceField) {
    const instanceRec = parseWireMessage(instanceField.value as Uint8Array)!
    if (definitionId === undefined) {
      const f2 = instanceRec.find((x) => x.number === 2 && x.wire === 2)
      const f2Fields = f2 ? (parseWireMessage(f2.value as Uint8Array) ?? []) : []
      const ref = f2Fields.find((x) => x.number === 1 && x.wire === 0)?.value
      if (typeof ref === 'number' && hasDefinition(top, ref)) definitionId = ref
    }

    // 1. 实例：名字槽静态标记（f5 槽1.f11.f2=1）+ 组件槽（f7）
    const instanceWithMarker = setStaticNameMarker(
      instanceField.value as Uint8Array,
      5,
      params.toStatic
    )
    const instanceResult = convertRecordComponents(instanceWithMarker, 7, params.toStatic)
    if (instanceResult.changed) {
      instanceField.value = instanceResult.bytes
      if (root8) root8.value = emit(root8Section)
    }
  }

  // 2. 自定义定义组件槽（f8）——定义式元件
  if (definitionId !== undefined) {
    const root4 = top.find((f) => f.number === 4 && f.wire === 2)
    if (root4) {
      const section = parseWireMessage(root4.value as Uint8Array) ?? []
      for (const f of section) {
        if (f.number !== 1 || f.wire !== 2) continue
        const rec = parseWireMessage(f.value as Uint8Array)
        if (!rec) continue
        if (rec.find((x) => x.number === 1 && x.wire === 0)?.value !== definitionId) continue
        const defWithMarker = setStaticNameMarker(f.value as Uint8Array, 6, params.toStatic)
        const defResult = convertRecordComponents(defWithMarker, 8, params.toStatic)
        if (defResult.changed) {
          f.value = defResult.bytes
          root4.value = emit(section)
        }
        break
      }
    }
  }

  // 3. 实体联动：root5 中 f2={1:definitionId} 的场景实体同步 名字槽标记 + f7 组件槽
  let entitiesUpdated = 0
  if (definitionId !== undefined) {
    const root5 = top.find((f) => f.number === 5 && f.wire === 2)
    if (root5) {
      const section = parseWireMessage(root5.value as Uint8Array) ?? []
      for (const f of section) {
        if (f.number !== 1 || f.wire !== 2) continue
        const rec = parseWireMessage(f.value as Uint8Array)
        if (!rec) continue
        const f2 = rec.find((x) => x.number === 2 && x.wire === 2)
        const f2Fields = f2 ? (parseWireMessage(f2.value as Uint8Array) ?? []) : []
        if (f2Fields.find((x) => x.number === 1 && x.wire === 0)?.value !== definitionId) continue
        const entityWithMarker = setStaticNameMarker(f.value as Uint8Array, 5, params.toStatic)
        const entityResult = convertRecordComponents(entityWithMarker, 7, params.toStatic)
        if (entityResult.changed) {
          f.value = entityResult.bytes
          root5.value = emit(section)
          entitiesUpdated++
        }
      }
    }
  }

  return {
    bytes: rebuild(bytes, top),
    id: params.id,
    ...(definitionId !== undefined ? { definitionId } : {}),
    entitiesUpdated
  }
}
