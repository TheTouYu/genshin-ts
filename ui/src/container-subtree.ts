/**
 * ui/src/container-subtree.ts — 客户端控件容器：模板子树 ⇄ 布局实例 ⇄ 存为模板（子树级装配）
 *
 * 与本目录 create.ts 的分工：
 *   - create.ts 的 `client-container` 是**字节级固定 donor**（空容器两件套），只能造空容器；
 *   - 本模块从**已导入的 root9 容器模板记录本身**推导整棵子树（容器组 → 容器节点 → 全部子控件），
 *     复制成布局实例，或把库实例复制成模板。不写死任何模板/容器/子控件 ID 或名字。
 *
 * wire 权威（真机差分，证据均在 workspace/flower-tea/device-package/）：
 *   模板组  = 根记录（无 f504），族描述符 `f502{f14{f501=实例列表}, f501=4, f502=4}`
 *   布局实例组 = `f502{f13{f501=模板组}, f501=3, f502=3}` + `f504=布局ID`，布局 f503 尾部追加实例组
 *   容器节点 = 模板组/实例组的成员（组内 `f505{f72..f503{f73{f501=节点}}}`），节点**无 f504**
 *   子控件   = 节点顶层 `f503` packed 成员表；子控件 `f504=节点ID`
 *   脚本挂载 = 记录内 `f74` 槽（深层，含脚本 GUID 条目）；复制记录时**整段原样保留**
 *   证据样本：
 *     - 空容器导入：1073741843.after-import-20261029.gil（1845/1846）
 *     - 16 文本框：1073741843.after-import2-20261029.gil（1854/1855 + 1856..1871）
 *     - 7 HUD 文本框：1073741843.after-import3-20261029.gil（1882/1883 + …）
 *     - 编辑器把**非空**模板拖进布局：1073741840.after-layout-templates-20261028-1131.gil
 *       （模板 2021/2022 + 实例 2049/2050 + 16 个**复制**子控件 2051..2066，且挂载随复制到 2050）
 *     - 库实例存为模板：1073741843.after-click-template → after-save-template
 *       （实例 1850 的 f13 改指新模板 1852、自身改名 _1，旧模板 1845 的 f14 实例列表清空）
 *
 * 纪律：全部只读返回候选整文件字节；ID 分配沿用 create.ts 的「避让扫描 + 2500 安全段」；
 * 未解码结构一律原样透传（f74 挂载区、几何/文本块），不猜字节。
 */

import { buildFile, readUint32BE } from '../../src/injector/binary.js'
import {
  emitWireMessage,
  parseWireMessage,
  type WireField
} from '../../src/cli/static_assembly/wire.js'
import { collectCompTypes, extractMemberIds, firstVarint, packedVarints, parseRoot9 } from './record.js'
import { updateUiControl } from '../../src/cli/gil_ui.js'
import { createClientControlCandidate } from './create.js'
import type { ParsedRoot9 } from './record.js'

/** 控件 ID 段下界（root9 记录 ID 与引用 ID 都在 0x40000000 段） */
const ID_ZONE_MIN = 1073741824
/** 客户端控件容器安全 ID 段（编辑器会把低位分配给特殊根/模板实例，见 create.ts 注释） */
export const CONTAINER_SAFE_ID_FLOOR = 1073742500
/** 脚本挂载槽字段（与 src/cli/gil_scripts.ts 的 MOUNT_LIST_FIELD 同值；此处只做「不重映射」保护） */
const MOUNT_FIELD = 74
/** 记录自身 ID / 父引用 */
const SELF_FIELD = 501
const PARENT_FIELD = 504
/** 成员表（packed 或 f505 内的 f73{f501} 条目） */
const MEMBER_FIELD = 503
const COMPONENT_FIELD = 505
/** 族描述符内的类型标 / 引用 / 实例列表 */
const FAMILY_TYPE_FIELD = 502
const FAMILY_TEMPLATE = 4
const FAMILY_INSTANCE = 3

export interface ContainerTreeNode {
  id: number
  kind: string
  name: string
  children: ContainerTreeNode[]
}

export interface ContainerMount {
  hostId: number
  scriptGuids: number[]
}

export interface ContainerRecordInfo {
  groupId: number
  name: string
  /** template = 模板区根记录（无 f504）；instance = 实例（f504=布局/库） */
  family: 'template' | 'instance'
  /** 实例的模板引用（f502{f13{f501}}） */
  templateGroupId?: number
  parentId?: number
  /** 容器节点 ID（正常 1 个；多节点原样报告） */
  nodeIds: number[]
  /** 组 → 节点 → 子控件（DFS 前序，含组本身） */
  subtreeIds: number[]
  tree: ContainerTreeNode
  childCount: number
  childKinds: Record<string, number>
  mounts: ContainerMount[]
  /** 模板族描述符里的实例 ID 列表（f14.f501 packed） */
  instanceIds: number[]
}

export interface ContainerInventory {
  templates: ContainerRecordInfo[]
  instances: ContainerRecordInfo[]
  /** 独立模板节点根（无容器组，GIA 也会导入这种；只报告，不实例化） */
  standaloneTemplateNodes: Array<{
    id: number
    name: string
    childCount: number
    childKinds: Record<string, number>
  }>
}

function encodePackedVarints(values: readonly number[]): Uint8Array {
  return Uint8Array.from(encodeVarintList(values))
}

function encodeVarintList(values: readonly number[]): number[] {
  const out: number[] = []
  for (const value of values) {
    let v = value >>> 0
    for (;;) {
      const byte = v & 0x7f
      v >>>= 7
      if (v === 0) {
        out.push(byte)
        break
      }
      out.push(byte | 0x80)
    }
  }
  return out
}

function decodePackedVarints(data: Uint8Array): number[] | undefined {
  const out: number[] = []
  let offset = 0
  while (offset < data.length) {
    let shift = 0
    let value = 0
    let byte: number | undefined
    do {
      byte = data[offset]
      if (byte === undefined) return undefined
      offset += 1
      value += (byte & 0x7f) * 2 ** shift
      shift += 7
      if (shift > 35) return undefined
    } while (byte & 0x80)
    out.push(value >>> 0)
  }
  return out
}

/** packed 载荷是否是一串控件 ID（全在 0x40000000 段）——用于安全识别成员表 */
function isIdList(data: Uint8Array): boolean {
  if (data.length === 0) return false
  const values = decodePackedVarints(data)
  return values !== undefined && values.length > 0 && values.every((v) => v >= ID_ZONE_MIN)
}

/* ------------------------------------------------------------------ *
 * 子树结构读取
 * ------------------------------------------------------------------ */

/** 全图子表：成员表（f503 / f505.f73）+ 子记录 f504 双向合并，保持「成员表顺序优先」 */
function buildChildrenMap(parsed: ParsedRoot9): Map<number, number[]> {
  const map = new Map<number, number[]>()
  const push = (parent: number, child: number): void => {
    if (parent === child) return
    const list = map.get(parent)
    if (!list) map.set(parent, [child])
    else if (!list.includes(child)) list.push(child)
  }
  for (const record of parsed.records) {
    for (const member of extractMemberIds(record.fields)) push(record.id, member)
  }
  for (const record of parsed.records) {
    if (record.parentId !== null) push(record.parentId, record.id)
  }
  return map
}

function subtreeOf(
  rootId: number,
  childrenMap: Map<number, number[]>,
  parsed: ParsedRoot9
): { ids: number[]; tree: ContainerTreeNode } {
  const ids: number[] = []
  const seen = new Set<number>()
  const walk = (id: number, depth: number): ContainerTreeNode => {
    const record = parsed.recordsById.get(id)
    ids.push(id)
    seen.add(id)
    const children: ContainerTreeNode[] = []
    if (depth < 64) {
      for (const child of childrenMap.get(id) ?? []) {
        if (seen.has(child)) continue
        if (!parsed.recordsById.has(child)) continue
        children.push(walk(child, depth + 1))
      }
    }
    return {
      id,
      kind: record?.kind ?? 'missing',
      name: record?.name ?? '',
      children
    }
  }
  const tree = walk(rootId, 0)
  return { ids, tree }
}

function collectKinds(tree: ContainerTreeNode): Record<string, number> {
  const out: Record<string, number> = {}
  for (const child of tree.children) {
    out[child.kind] = (out[child.kind] ?? 0) + 1
    const nested = collectKinds(child)
    for (const [kind, count] of Object.entries(nested)) out[kind] = (out[kind] ?? 0) + count
  }
  return out
}

function countNodes(tree: ContainerTreeNode): number {
  return tree.children.reduce((sum, child) => sum + 1 + countNodes(child), 0)
}

function familyDescriptorOf(fields: readonly WireField[], type: number): WireField[] | undefined {
  for (const field of fields) {
    if (field.number !== FAMILY_TYPE_FIELD || field.wire !== 2) continue
    const sub = parseWireMessage(field.value as Uint8Array)
    if (!sub) continue
    if (firstVarint(sub, SELF_FIELD) === type) return sub
  }
  return undefined
}

function instanceIdsOf(fields: readonly WireField[]): number[] {
  const descriptor = familyDescriptorOf(fields, FAMILY_TEMPLATE)
  if (!descriptor) return []
  const listField = descriptor.find((f) => f.number === 14 && f.wire === 2)
  if (!listField) return []
  const list = parseWireMessage(listField.value as Uint8Array)
  const payload = list?.find((f) => f.number === SELF_FIELD && f.wire === 2)
  if (!payload) return []
  return decodePackedVarints(payload.value as Uint8Array) ?? []
}

function templateRefOf(fields: readonly WireField[]): number | undefined {
  const descriptor = familyDescriptorOf(fields, FAMILY_INSTANCE)
  if (!descriptor) return undefined
  const refField = descriptor.find((f) => f.number === 13 && f.wire === 2)
  if (!refField) return undefined
  const ref = parseWireMessage(refField.value as Uint8Array)
  return ref ? firstVarint(ref, SELF_FIELD) : undefined
}

/** 脚本挂载（host guid → script guid 列表）；来自记录内 f74 槽，深层扫描 */
export function readMountSlots(
  fields: readonly WireField[],
  hostId: number
): ContainerMount | undefined {
  const guids: number[] = []
  const scan = (list: readonly WireField[], depth: number): void => {
    if (depth > 10) return
    for (const field of list) {
      if (field.wire !== 2) continue
      const data = field.value as Uint8Array
      if (field.number === MOUNT_FIELD) {
        const entries = parseWireMessage(data)
        if (!entries) continue
        for (const entry of entries) {
          if (entry.number !== FAMILY_TYPE_FIELD || entry.wire !== 2) continue
          const wrapper = parseWireMessage(entry.value as Uint8Array)
          const leafWrapper = wrapper?.find((f) => f.number === 1 && f.wire === 2)
          const leaf = leafWrapper ? parseWireMessage(leafWrapper.value as Uint8Array) : undefined
          const guid = leaf ? firstVarint(leaf, 1) : undefined
          if (guid !== undefined) guids.push(guid)
        }
        continue
      }
      const nested = parseWireMessage(data)
      if (nested) scan(nested, depth + 1)
    }
  }
  scan(fields, 0)
  return guids.length > 0 ? { hostId, scriptGuids: guids } : undefined
}

/** 容器盘点：模板组（族 4）/ 实例组（族 3）/ 独立模板节点（族 4 的节点根） */
export function inventoryContainers(bytes: Uint8Array): ContainerInventory {
  const parsed = parseRoot9(bytes)
  const childrenMap = buildChildrenMap(parsed)
  const templates: ContainerRecordInfo[] = []
  const instances: ContainerRecordInfo[] = []
  const standaloneTemplateNodes: ContainerInventory['standaloneTemplateNodes'] = []

  for (const record of parsed.records) {
    if (record.kind === 'client-container') {
      const { ids, tree } = subtreeOf(record.id, childrenMap, parsed)
      const family = record.familyTypes.includes(FAMILY_TEMPLATE) ? 'template' : 'instance'
      const nodeIds = tree.children.map((child) => child.id)
      // 子控件计数 = 容器节点**之下**的控件（节点本身不算子控件）
      const childKinds: Record<string, number> = {}
      let childCount = 0
      for (const node of tree.children) {
        childCount += countNodes(node)
        for (const [kind, count] of Object.entries(collectKinds(node))) {
          childKinds[kind] = (childKinds[kind] ?? 0) + count
        }
      }
      const mounts: ContainerMount[] = []
      for (const id of ids) {
        const meta = parsed.recordsById.get(id)
        if (!meta) continue
        const slot = readMountSlots(meta.fields, id)
        if (slot) mounts.push(slot)
      }
      const info: ContainerRecordInfo = {
        groupId: record.id,
        name: record.name,
        family,
        ...(templateRefOf(record.fields) !== undefined
          ? { templateGroupId: templateRefOf(record.fields) as number }
          : {}),
        ...(record.parentId !== null ? { parentId: record.parentId } : {}),
        nodeIds,
        subtreeIds: ids,
        tree,
        childCount,
        childKinds,
        mounts,
        instanceIds: instanceIdsOf(record.fields)
      }
      if (family === 'template') templates.push(info)
      else instances.push(info)
      continue
    }
    if (record.kind === 'client-container-node' && record.familyTypes.includes(FAMILY_TEMPLATE)) {
      const { tree } = subtreeOf(record.id, childrenMap, parsed)
      standaloneTemplateNodes.push({
        id: record.id,
        name: record.name,
        childCount: countNodes(tree),
        childKinds: collectKinds(tree)
      })
    }
  }
  return { templates, instances, standaloneTemplateNodes }
}

/** 子树同构签名（忽略 ID，只比 类型/层级/名字/顺序）——自检与 fixture 断言共用 */
export function subtreeSignature(tree: ContainerTreeNode): string {
  const parts = tree.children.map((child) => `${child.kind}:${child.name}(${subtreeSignature(child)})`)
  return parts.join(',')
}

/* ------------------------------------------------------------------ *
 * 记录克隆（ID 重映射 + 族描述符改写），f74 挂载区原样保留
 * ------------------------------------------------------------------ */

function cloneFields(fields: readonly WireField[], idMap: ReadonlyMap<number, number>): WireField[] {
  const out: WireField[] = []
  for (const field of fields) {
    // 脚本挂载槽：内部是脚本 GUID，不在控件 ID 空间，整段原样保留
    if (field.number === MOUNT_FIELD) {
      out.push({ number: field.number, wire: field.wire, value: field.value })
      continue
    }
    if (field.wire === 0) {
      const value = Number(field.value)
      out.push({ number: field.number, wire: 0, value: idMap.get(value) ?? value })
      continue
    }
    if (field.wire !== 2) {
      out.push({ number: field.number, wire: field.wire, value: field.value })
      continue
    }
    const data = field.value as Uint8Array
    if (field.number === MEMBER_FIELD && isIdList(data)) {
      const values = decodePackedVarints(data) ?? []
      out.push({
        number: field.number,
        wire: 2,
        value: encodePackedVarints(values.map((value) => idMap.get(value) ?? value))
      })
      continue
    }
    const nested = parseWireMessage(data)
    if (nested) {
      out.push({ number: field.number, wire: 2, value: emitWireMessage(cloneFields(nested, idMap)) })
      continue
    }
    out.push({ number: field.number, wire: 2, value: data })
  }
  return out
}

function replaceFamilyDescriptor(
  fields: readonly WireField[],
  type: number,
  replacement: WireField
): WireField[] {
  let replaced = false
  const out = fields.map((field) => {
    if (replaced || field.number !== FAMILY_TYPE_FIELD || field.wire !== 2) return field
    const sub = parseWireMessage(field.value as Uint8Array)
    if (!sub || firstVarint(sub, SELF_FIELD) !== type) return field
    replaced = true
    return replacement
  })
  if (!replaced) throw new Error(`[error] 记录缺少族 ${type} 描述符（无法改写模板/实例形态）`)
  return out
}

function removeField(fields: readonly WireField[], number: number, wire: number): WireField[] {
  return fields.filter((field) => !(field.number === number && field.wire === wire))
}

/** 在最后一个族描述符（f502）之后插入 f504 父引用——编辑器实例组的字段次序 */
function insertParentAfterFamily(fields: readonly WireField[], parentId: number): WireField[] {
  const out: WireField[] = []
  let insertAt = 1
  fields.forEach((field, index) => {
    out.push(field)
    if (field.number === FAMILY_TYPE_FIELD && field.wire === 2) insertAt = index + 1
  })
  out.splice(insertAt, 0, { number: PARENT_FIELD, wire: 0, value: parentId })
  return out
}

function makeInstanceDescriptor(templateGroupId: number): WireField {
  return {
    number: FAMILY_TYPE_FIELD,
    wire: 2,
    value: emitWireMessage([
      {
        number: 13,
        wire: 2,
        value: emitWireMessage([{ number: SELF_FIELD, wire: 0, value: templateGroupId }])
      },
      { number: SELF_FIELD, wire: 0, value: FAMILY_INSTANCE },
      { number: FAMILY_TYPE_FIELD, wire: 0, value: FAMILY_INSTANCE }
    ])
  }
}

function makeTemplateDescriptor(instanceGroupId: number): WireField {
  return {
    number: FAMILY_TYPE_FIELD,
    wire: 2,
    value: emitWireMessage([
      {
        number: 14,
        wire: 2,
        value: emitWireMessage([
          {
            number: SELF_FIELD,
            wire: 2,
            value: encodePackedVarints([instanceGroupId])
          }
        ])
      },
      { number: SELF_FIELD, wire: 0, value: FAMILY_TEMPLATE },
      { number: FAMILY_TYPE_FIELD, wire: 0, value: FAMILY_TEMPLATE }
    ])
  }
}

/** 名字写入（记录内 f505 组件 type15 的 f12.f501 文本） */
function withName(record: Uint8Array, name: string): Uint8Array {
  const fields = parseWireMessage(record)
  if (!fields) return record
  const text = new TextEncoder().encode(name)
  for (const field of fields) {
    if (field.number !== COMPONENT_FIELD || field.wire !== 2) continue
    const sub = parseWireMessage(field.value as Uint8Array)
    if (!sub || firstVarint(sub, FAMILY_TYPE_FIELD) !== 15) continue
    const nameField = sub.find((f) => f.number === 12 && f.wire === 2)
    if (!nameField) continue
    nameField.value = emitWireMessage([{ number: SELF_FIELD, wire: 2, value: text }])
    field.value = emitWireMessage(sub)
    return emitWireMessage(fields)
  }
  return record
}

/* ------------------------------------------------------------------ *
 * root9 段编辑
 * ------------------------------------------------------------------ */

function withRoot9Section(bytes: Uint8Array, mutate: (section: WireField[]) => void): Uint8Array {
  const top = parseWireMessage(bytes.subarray(20, bytes.length - 4))
  if (!top) throw new Error('[error] malformed GIL payload')
  const root9 = top.find((field) => field.number === 9 && field.wire === 2)
  if (!root9) throw new Error('[error] root9 section missing')
  const section = parseWireMessage(root9.value as Uint8Array)
  if (!section) throw new Error('[error] invalid root 9 section')
  mutate(section)
  root9.value = emitWireMessage(section)
  return buildFile(emitWireMessage(top), {
    schema: readUint32BE(bytes, 4),
    headTag: readUint32BE(bytes, 8),
    fileType: readUint32BE(bytes, 12),
    tailTag: readUint32BE(bytes, bytes.length - 4)
  })
}

function ownIdOfField(field: WireField): number | undefined {
  if (field.number !== FAMILY_TYPE_FIELD || field.wire !== 2) return undefined
  const fields = parseWireMessage(field.value as Uint8Array)
  return fields ? firstVarint(fields, SELF_FIELD) : undefined
}

/**
 * root9 顶层索引（f501）**追加**新根记录 ID（已存在则跳过；绝不重排/清空既有顺序）。
 *
 * 事实依据：编辑器自己的索引顺序不等于记录物理顺序 —— 1073741842 的索引是
 * `1932,1931,1930,1825,1840,1841,1842`（模板新→旧，再布局/库/系统根），而物理顺序是
 * `1825…,1840,1841,1842,1930,1931,1932,2500,2501,2502,2503,2540`。
 * 2026-10-29 的事故里我按「物理顺序重建索引」把既有顺序改写了 → 交付给编辑器时
 * 结构不再与它自己写出的一致。故这里只做**追加**：新容器节点入索引（编辑器产物里
 * 节点都在索引里），既有顺序与既有缺项（旧 CLI 留下的未入索引记录）一律不动。
 */
function appendIndexEntries(section: WireField[], ids: readonly number[]): void {
  const indexField = section.find((field) => field.number === SELF_FIELD && field.wire === 2)
  if (!indexField) throw new Error('[error] root9 顶层索引（f501）缺失')
  const current = decodePackedVarints(indexField.value as Uint8Array)
  if (!current) throw new Error('[error] root9 顶层索引不是 packed varints')
  const additions = ids.filter((id) => !current.includes(id))
  if (additions.length === 0) return
  indexField.value = encodePackedVarints([...current, ...additions])
}

function insertRecords(section: WireField[], records: readonly Uint8Array[]): void {
  // root9 形态恒为 `501(索引) | 502×N(记录) | 503(尾标)`：新记录插在尾标之前
  const tailAt = section.findIndex((field) => field.number === MEMBER_FIELD && field.wire === 0)
  const at = tailAt >= 0 ? tailAt : section.length
  section.splice(at, 0, ...records.map((value) => ({ number: FAMILY_TYPE_FIELD, wire: 2, value })))
}

/**
 * 索引自检（**无悬空**）：索引里每个 ID 必须对应真实记录。
 * 注意：不能要求「索引 == 全部无 f504 记录」——1073741842 这类旧 CLI 写的地图里
 * 容器组/节点并未入索引，编辑器仍正常打开；硬按物理顺序重建反而会改写编辑器顺序。
 */
function assertIndexNoDangling(parsed: ParsedRoot9): void {
  const dangling = [...parsed.indexIds].filter((id) => !parsed.recordsById.has(id))
  if (dangling.length > 0) {
    throw new Error(`[error] 自检失败：root9 顶层索引含悬空记录 ${dangling.join(',')}`)
  }
}

function recordEntry(section: readonly WireField[], recordId: number): WireField {
  const entry = section.find((field) => ownIdOfField(field) === recordId)
  if (!entry) throw new Error(`[error] root9 记录不存在: ${recordId}`)
  return entry
}

function appendMember(section: WireField[], hostId: number, memberId: number): void {
  const entry = recordEntry(section, hostId)
  const fields = parseWireMessage(entry.value as Uint8Array)
  if (!fields) throw new Error(`[error] 记录解析失败: ${hostId}`)
  const members = fields.find((field) => field.number === MEMBER_FIELD && field.wire === 2)
  if (!members) throw new Error(`[error] 宿主记录缺少 f503 成员表: ${hostId}`)
  const ids = decodePackedVarints(members.value as Uint8Array)
  if (!ids) throw new Error(`[error] 成员表不是 packed varints: ${hostId}`)
  if (ids.includes(memberId)) throw new Error(`[error] ${hostId} 已含成员 ${memberId}`)
  members.value = encodePackedVarints([...ids, memberId])
  entry.value = emitWireMessage(fields)
}

function removeMember(section: WireField[], hostId: number, memberId: number): boolean {
  const entry = section.find((field) => ownIdOfField(field) === hostId)
  if (!entry) return false
  const fields = parseWireMessage(entry.value as Uint8Array)
  if (!fields) return false
  const members = fields.find((field) => field.number === MEMBER_FIELD && field.wire === 2)
  if (!members) return false
  const ids = decodePackedVarints(members.value as Uint8Array)
  if (!ids || !ids.includes(memberId)) return false
  members.value = encodePackedVarints(ids.filter((id) => id !== memberId))
  entry.value = emitWireMessage(fields)
  return true
}

/** 模板族描述符的实例列表增删（f502{f14{f501 packed}}） */
function setInstanceList(section: WireField[], templateGroupId: number, ids: readonly number[]): void {
  const entry = recordEntry(section, templateGroupId)
  const fields = parseWireMessage(entry.value as Uint8Array)
  if (!fields) throw new Error(`[error] 记录解析失败: ${templateGroupId}`)
  const descriptorIndex = fields.findIndex((field) => {
    if (field.number !== FAMILY_TYPE_FIELD || field.wire !== 2) return false
    const sub = parseWireMessage(field.value as Uint8Array)
    return sub !== undefined && firstVarint(sub, SELF_FIELD) === FAMILY_TEMPLATE
  })
  if (descriptorIndex < 0) throw new Error(`[error] ${templateGroupId} 不是容器模板（无族 4 描述符）`)
  const descriptor = parseWireMessage(fields[descriptorIndex].value as Uint8Array)
  if (!descriptor) throw new Error(`[error] 模板族描述符解析失败: ${templateGroupId}`)
  const payload = ids.length > 0 ? encodePackedVarints(ids) : new Uint8Array(0)
  const listIndex = descriptor.findIndex((field) => field.number === 14 && field.wire === 2)
  if (listIndex >= 0) {
    const list = parseWireMessage(descriptor[listIndex].value as Uint8Array) ?? []
    const payloadIndex = list.findIndex((field) => field.number === SELF_FIELD && field.wire === 2)
    if (payloadIndex >= 0) {
      if (ids.length > 0) list[payloadIndex].value = payload
      else list.splice(payloadIndex, 1)
    } else if (ids.length > 0) {
      list.push({ number: SELF_FIELD, wire: 2, value: payload })
    }
    descriptor[listIndex].value = emitWireMessage(list)
  } else if (ids.length > 0) {
    descriptor.push({
      number: 14,
      wire: 2,
      value: emitWireMessage([{ number: SELF_FIELD, wire: 2, value: payload }])
    })
  }
  fields[descriptorIndex].value = emitWireMessage(descriptor)
  entry.value = emitWireMessage(fields)
}

/* ------------------------------------------------------------------ *
 * ID 分配
 * ------------------------------------------------------------------ */

function usedIds(parsed: ParsedRoot9): Set<number> {
  const used = new Set<number>()
  for (const record of parsed.records) {
    used.add(record.id)
    for (const member of extractMemberIds(record.fields)) used.add(member)
    for (const field of record.fields) {
      if (field.wire !== 0) continue
      const value = Number(field.value)
      if (value >= ID_ZONE_MIN) used.add(value)
    }
  }
  for (const id of parsed.indexIds) used.add(id)
  return used
}

function allocateRun(
  parsed: ParsedRoot9,
  count: number,
  explicit?: number,
  avoid: readonly number[] = []
): number[] {
  const used = usedIds(parsed)
  for (const id of avoid) used.add(id)
  const start = explicit ?? CONTAINER_SAFE_ID_FLOOR
  if (!Number.isSafeInteger(start) || start < CONTAINER_SAFE_ID_FLOOR) {
    throw new Error(`[error] --id 须 >= ${CONTAINER_SAFE_ID_FLOOR}（低位会被编辑器特殊根/模板实例占用）`)
  }
  const ids: number[] = []
  let cursor = start
  while (ids.length < count) {
    if (used.has(cursor)) {
      cursor += 1
      continue
    }
    ids.push(cursor)
    cursor += 1
  }
  return ids
}

/* ------------------------------------------------------------------ *
 * 占位子控件（空容器节点会被编辑器保存时剪掉 → 挂载丢失）
 * ------------------------------------------------------------------ */

/** 占位子控件默认名 / 位置 / 尺寸（1×1 在屏幕外；2026-10-29 B 事故后固化） */
export const PLACEHOLDER_CONTROL_NAME = 'gsts_anchor'
export const PLACEHOLDER_POSITION: readonly [number, number] = [-2000, -2000]
export const PLACEHOLDER_SIZE: readonly [number, number] = [1, 1]

export interface EnsurePlaceholderResult {
  bytes: Uint8Array
  nodeId: number
  added: boolean
  childId?: number
}

/** 节点的现有子控件 ID（成员表 ∩ 记录存在；再并上 f504 指向它的记录） */
function childIdsOf(parsed: ParsedRoot9, nodeId: number): number[] {
  const out: number[] = []
  const node = parsed.recordsById.get(nodeId)
  if (node) {
    for (const id of extractMemberIds(node.fields)) {
      if (parsed.recordsById.has(id) && !out.includes(id)) out.push(id)
    }
  }
  for (const record of parsed.records) {
    if (record.parentId === nodeId && !out.includes(record.id)) out.push(record.id)
  }
  return out
}

/**
 * 保证容器节点至少有一个占位子控件。
 *
 * 依据（真机事故 + D662）：**空的客户端控件容器节点会被编辑器保存时剪掉**，
 * 连带丢掉脚本挂载（`mounts=0`），且节点 ID 可能被编辑器改分配给
 * ClientUIRootHierarchyRoot / ClientUIPrototypeHierarchyRoot。故布局实例与模板节点
 * 都必须带至少一个子控件；占位件用 1×1 放到屏幕外（-2000,-2000），ID 走 >= 1073742500 安全段。
 */
export function ensureContainerPlaceholder(
  bytes: Uint8Array,
  options: { nodeId: number; name?: string; id?: number; avoid?: readonly number[] }
): EnsurePlaceholderResult {
  const parsed = parseRoot9(bytes)
  const node = parsed.recordsById.get(options.nodeId)
  if (!node) throw new Error(`[error] 容器节点不存在: ${options.nodeId}`)
  if (node.kind !== 'client-container-node') {
    throw new Error(`[error] ${options.nodeId} 不是容器节点（kind=${node.kind}）`)
  }
  const existing = childIdsOf(parsed, options.nodeId)
  if (existing.length > 0) {
    return { bytes, nodeId: options.nodeId, added: false }
  }
  const newId = allocateRun(parsed, 1, options.id, options.avoid ?? [])[0]
  const created = createClientControlCandidate(bytes, {
    kind: 'client-textbox',
    surface: { kind: 'container', containerId: options.nodeId },
    id: newId,
    name: options.name ?? PLACEHOLDER_CONTROL_NAME
  })
  const positioned = updateUiControl(created.bytes, newId, {
    position: [...PLACEHOLDER_POSITION] as [number, number],
    size: [...PLACEHOLDER_SIZE] as [number, number]
  })
  const after = parseRoot9(positioned.bytes)
  const child = after.recordsById.get(newId)
  if (!child) throw new Error(`[error] 占位子控件写入失败: ${newId}`)
  if (child.parentId !== options.nodeId) {
    throw new Error(`[error] 占位子控件 f504 不是容器节点（${child.parentId} != ${options.nodeId}）`)
  }
  const nodeAfter = after.recordsById.get(options.nodeId)
  if (!nodeAfter || !extractMemberIds(nodeAfter.fields).includes(newId)) {
    throw new Error(`[error] 容器节点成员表未包含占位子控件 ${newId}`)
  }
  if (newId < CONTAINER_SAFE_ID_FLOOR) {
    throw new Error(`[error] 占位子控件 ID ${newId} 落在编辑器动态段（< ${CONTAINER_SAFE_ID_FLOOR}）`)
  }
  return { bytes: positioned.bytes, nodeId: options.nodeId, added: true, childId: newId }
}

/* ------------------------------------------------------------------ *
 * ClientUI 层级根（fam 87/88）——编辑器打开容器图的前提
 * ------------------------------------------------------------------ */

/** 编辑器系统层级根族号：87=ClientUIRootHierarchyRoot，88=ClientUIPrototypeHierarchyRoot */
export const CLIENT_UI_ROOT_FAMILY = 87
export const CLIENT_UI_PROTOTYPE_ROOT_FAMILY = 88
export const CLIENT_UI_ROOT_NAMES: Record<number, string> = {
  [CLIENT_UI_ROOT_FAMILY]: 'ClientUIRootHierarchyRoot',
  [CLIENT_UI_PROTOTYPE_ROOT_FAMILY]: 'ClientUIPrototypeHierarchyRoot'
}

export interface ClientUiRootStatus {
  rootId?: number
  prototypeRootId?: number
  missing: number[]
}

/** 查地图里是否已有 ClientUI 层级根（fam 87/88） */
export function clientUiRootStatus(bytes: Uint8Array): ClientUiRootStatus {
  const parsed = parseRoot9(bytes)
  const find = (family: number): number | undefined =>
    parsed.records.find((record) => record.familyTypes.includes(family))?.id
  const rootId = find(CLIENT_UI_ROOT_FAMILY)
  const prototypeRootId = find(CLIENT_UI_PROTOTYPE_ROOT_FAMILY)
  const missing: number[] = []
  if (rootId === undefined) missing.push(CLIENT_UI_ROOT_FAMILY)
  if (prototypeRootId === undefined) missing.push(CLIENT_UI_PROTOTYPE_ROOT_FAMILY)
  return {
    ...(rootId !== undefined ? { rootId } : {}),
    ...(prototypeRootId !== undefined ? { prototypeRootId } : {}),
    missing
  }
}

export interface EnsureClientUiRootsResult {
  bytes: Uint8Array
  status: ClientUiRootStatus
  added: Array<{ id: number; name: string; family: number }>
}

/**
 * 从 donor 地图**只读复制** ClientUI 层级根（fam 87/88）到目标图，并登记进 root9 顶层索引。
 *
 * 为什么必须有：2026-10-29 事故证据（地图 1841 三张快照 + 1842/1845 对照）——
 *   · 有 87/88 根的地图（1840/1843/1827/1834/1844…）：容器记录跨多次编辑器保存存活；
 *   · 缺 87/88 根的地图（1841.cli-clean、1842、1845）：**编辑器一打开就自己补根**
 *     （1841 里补出的根正好占用了我们容器节点用过的 ID），随后整棵客户端容器子树被丢弃/重编号，
 *     脚本挂载一起没了（`mounts=0`）。
 * 目标图已有则原样返回；缺哪条补哪条（按 donor 里同名同族记录克隆 + 新 ID 重映射）。
 */
export function ensureClientUiHierarchyRoots(
  bytes: Uint8Array,
  options: { donor: Uint8Array; id?: number }
): EnsureClientUiRootsResult {
  const status = clientUiRootStatus(bytes)
  if (status.missing.length === 0) return { bytes, status, added: [] }
  const donorParsed = parseRoot9(options.donor)
  const templates: Array<{ family: number; record: { raw: Uint8Array; id: number; name: string } }> = []
  for (const family of status.missing) {
    const record = donorParsed.records.find((item) => item.familyTypes.includes(family))
    if (!record) {
      throw new Error(
        `[error] donor 地图里没有 fam=${family} 的 ClientUI 层级根（${CLIENT_UI_ROOT_NAMES[family]}）`
      )
    }
    templates.push({ family, record: { raw: record.raw, id: record.id, name: record.name } })
  }
  const parsed = parseRoot9(bytes)
  const ids = allocateRun(parsed, templates.length, options.id)
  const records: Uint8Array[] = []
  const added: EnsureClientUiRootsResult['added'] = []
  templates.forEach((item, index) => {
    const cloned = cloneFields(
      parseWireMessage(item.record.raw) ?? [],
      new Map([[item.record.id, ids[index]]])
    )
    records.push(emitWireMessage(cloned))
    added.push({ id: ids[index], name: item.record.name, family: item.family })
  })
  const out = withRoot9Section(bytes, (section) => {
    insertRecords(section, records)
    appendIndexEntries(
      section,
      added.map((item) => item.id)
    )
  })
  const after = clientUiRootStatus(out)
  if (after.missing.length > 0) {
    throw new Error(`[error] ClientUI 层级根复制后仍缺失: ${after.missing.join(',')}`)
  }
  return { bytes: out, status: after, added }
}

export interface ContainerInvariantOptions {
  templateGroupId: number
  instanceGroupId: number
  layoutId: number
  /** 本次操作新建的记录（这些必须落在 >= 1073742500 安全段；GIA 导入的既有子控件不受限） */
  createdIds?: readonly number[]
}

/**
 * 写后结构不变量（缺一条就抛错，不做"看起来差不多"）：
 *   ①模板组与布局实例组各自都有容器节点；②每个容器节点至少 1 个子控件，且子控件 f504=该节点；
 *   ③布局实例继承模板节点的全部脚本挂载；④布局成员表含实例组、模板 f14 含实例组；
 *   ⑤实例组与模板组的成员表无悬空引用；⑥root9 顶层索引 = 无 f504 记录按物理顺序。
 */
export function assertContainerInvariants(
  bytes: Uint8Array,
  options: ContainerInvariantOptions
): { templateChildCount: number; instanceChildCount: number; mounts: number[] } {
  const parsed = parseRoot9(bytes)
  const inventory = inventoryContainers(bytes)
  const template = inventory.templates.find((item) => item.groupId === options.templateGroupId)
  const instance = inventory.instances.find((item) => item.groupId === options.instanceGroupId)
  if (!template) throw new Error(`[error] 自检失败：找不到容器模板 ${options.templateGroupId}`)
  if (!instance) throw new Error(`[error] 自检失败：找不到布局实例 ${options.instanceGroupId}`)
  if (template.nodeIds.length === 0) {
    throw new Error('[error] 自检失败：容器模板没有容器节点成员（结构异常）')
  }
  if (instance.nodeIds.length === 0) {
    throw new Error('[error] 自检失败：布局实例没有容器节点成员（编辑器会剪掉整棵子树）')
  }
  if (instance.templateGroupId !== options.templateGroupId) {
    throw new Error('[error] 自检失败：实例未指向模板组')
  }
  if (instance.parentId !== options.layoutId) {
    throw new Error('[error] 自检失败：实例组 f504 不是目标布局')
  }
  const childCountOf = (tree: ContainerTreeNode, nodeKinds: Set<string>): number =>
    tree.children
      .filter((child) => nodeKinds.has(child.kind))
      .reduce((sum, node) => sum + node.children.length, 0)
  const nodes = new Set(['client-container-node'])
  const templateChildCount = childCountOf(template.tree, nodes)
  const instanceChildCount = childCountOf(instance.tree, nodes)
  if (templateChildCount === 0) {
    throw new Error('[error] 自检失败：模板节点没有占位子控件（编辑器会剪掉空容器节点 → 挂载丢失）')
  }
  if (instanceChildCount === 0) {
    throw new Error('[error] 自检失败：布局实例节点没有占位子控件（编辑器会剪掉空容器节点 → 挂载丢失）')
  }
  for (const treeNode of [...template.tree.children, ...instance.tree.children]) {
    for (const child of treeNode.children) {
      const record = parsed.recordsById.get(child.id)
      if (!record) throw new Error(`[error] 自检失败：子控件记录不存在 ${child.id}`)
      if (record.parentId !== treeNode.id) {
        throw new Error(
          `[error] 自检失败：子控件 ${child.id} 的 f504=${record.parentId ?? '-'} 不是节点 ${treeNode.id}`
        )
      }
    }
  }
  const templateMounts = new Set(template.mounts.flatMap((mount) => mount.scriptGuids))
  const instanceMounts = new Set(instance.mounts.flatMap((mount) => mount.scriptGuids))
  for (const guid of templateMounts) {
    if (!instanceMounts.has(guid)) {
      throw new Error(`[error] 自检失败：布局实例未继承脚本挂载 ${guid}`)
    }
  }
  const layout = requireRecord(parsed, options.layoutId, '布局')
  if (!extractMemberIds(layout.fields).includes(options.instanceGroupId)) {
    throw new Error('[error] 自检失败：布局成员表未包含实例组')
  }
  const templateRecord = requireRecord(parsed, options.templateGroupId, '容器模板')
  if (!instanceIdsOf(templateRecord.fields).includes(options.instanceGroupId)) {
    throw new Error('[error] 自检失败：模板 f14 实例列表未包含实例组')
  }
  for (const groupId of [options.templateGroupId, options.instanceGroupId]) {
    const record = requireRecord(parsed, groupId, '容器组')
    for (const member of extractMemberIds(record.fields)) {
      if (!parsed.recordsById.has(member)) {
        throw new Error(`[error] 自检失败：容器组 ${groupId} 成员表有悬空引用 ${member}`)
      }
    }
  }
  for (const id of options.createdIds ?? []) {
    if (id < CONTAINER_SAFE_ID_FLOOR) {
      throw new Error(
        `[error] 自检失败：新建记录 ${id} 落在编辑器动态段（< ${CONTAINER_SAFE_ID_FLOOR}），会被改分配`
      )
    }
  }
  assertIndexNoDangling(parsed)
  const rootStatus = clientUiRootStatus(bytes)
  if (rootStatus.missing.length > 0) {
    throw new Error(
      `[error] 自检失败：地图缺 ClientUI 层级根 fam=${rootStatus.missing.join('/')}` +
        '（编辑器打开时会自建这两条根并丢弃/重编号客户端容器子树 → 挂载丢失）；' +
        '用 --system-donor <已含层级根的.gil> 让 CLI 先补齐'
    )
  }
  return {
    templateChildCount,
    instanceChildCount,
    mounts: [...instanceMounts].sort((a, b) => a - b)
  }
}

/* ------------------------------------------------------------------ *
 * 布局实例化（模板子树 → 布局实例子树）
 * ------------------------------------------------------------------ */

export interface InstantiateOptions {
  templateGroupId: number
  layoutId: number
  /** 显式实例组 ID（缺省=从 1073742500 起避让） */
  id?: number
  /** 占位子控件名（缺省 gsts_anchor） */
  placeholderName?: string
  /** 关掉占位子控件（不推荐；自检会因空节点失败） */
  skipPlaceholder?: boolean
}

export interface InstantiateResult {
  bytes: Uint8Array
  templateGroupId: number
  layoutId: number
  instanceGroupId: number
  instanceNodeId: number
  /** 复制出的全部记录 ID（组、节点、子控件） */
  recordIds: number[]
  copiedRecords: number
  childCount: number
  /** 复制到实例节点上的挂载（= 模板节点挂载） */
  transferredMounts: ContainerMount[]
  /** 本次为模板节点补的占位子控件 */
  placeholders: Array<{ nodeId: number; childId: number }>
  /** 结构自检（回读同构 + 节点/占位/挂载不变量）；不通过时本函数抛错 */
  selfCheck: 'pass'
}

function requireRecord(parsed: ParsedRoot9, id: number, label: string) {
  const record = parsed.recordsById.get(id)
  if (!record) throw new Error(`[error] ${label}不存在: ${id}`)
  return record
}

/**
 * 把容器模板的整棵子树复制成布局实例：
 *   ①组 → 实例组（族描述符 4 → `f13{f501=模板组}`+族 3、f504=布局）
 *   ②节点 + 全部子控件逐条复制（子控件 f504 指向新节点）
 *   ③布局 f503 尾部追加实例组；④模板族 f14 实例列表追加实例组
 * 脚本挂载（f74）随记录原样复制，因此实例节点自动继承模板节点的挂载。
 */
export function instantiateContainerTemplate(
  bytes: Uint8Array,
  options: InstantiateOptions
): InstantiateResult {
  {
    const probe = requireRecord(parseRoot9(bytes), options.templateGroupId, '容器模板')
    if (probe.kind !== 'client-container') {
      throw new Error(`[error] ${options.templateGroupId} 不是客户端控件容器（kind=${probe.kind}）`)
    }
    if (!probe.familyTypes.includes(FAMILY_TEMPLATE)) {
      throw new Error(
        `[error] ${options.templateGroupId} 不是容器模板（族 ${probe.familyTypes.join('/')}）`
      )
    }
    const layoutProbe = requireRecord(parseRoot9(bytes), options.layoutId, '布局')
    if (layoutProbe.kind !== 'layout') throw new Error(`[error] ${options.layoutId} 不是布局记录`)
  }

  // ⓪ 模板节点先补占位子控件（空节点会被编辑器剪掉 → 挂载丢；2026-10-29 B 事故）
  const placeholders: Array<{ nodeId: number; childId: number }> = []
  let current = bytes
  if (!options.skipPlaceholder) {
    const templateParsed = parseRoot9(current)
    const templateTree = subtreeOf(
      options.templateGroupId,
      buildChildrenMap(templateParsed),
      templateParsed
    ).tree
    const nodeIds = templateTree.children
      .filter((child) => templateParsed.recordsById.get(child.id)?.kind === 'client-container-node')
      .map((child) => child.id)
    if (nodeIds.length === 0) {
      throw new Error(
        `[error] ${options.templateGroupId} 的成员里没有容器节点：结构异常，CLI 不猜（请先在编辑器里补节点或重新导入）`
      )
    }
    for (const nodeId of nodeIds) {
      const ensured = ensureContainerPlaceholder(current, {
        nodeId,
        ...(options.placeholderName !== undefined ? { name: options.placeholderName } : {}),
        ...(options.id !== undefined ? { avoid: [options.id] } : {})
      })
      current = ensured.bytes
      if (ensured.added && ensured.childId !== undefined) {
        placeholders.push({ nodeId, childId: ensured.childId })
      }
    }
  }

  const parsed = parseRoot9(current)
  const template = requireRecord(parsed, options.templateGroupId, '容器模板')

  const childrenMap = buildChildrenMap(parsed)
  const { ids: subtreeIds, tree } = subtreeOf(options.templateGroupId, childrenMap, parsed)
  if (subtreeIds.length < 2) {
    throw new Error(
      `[error] 模板 ${options.templateGroupId} 子树只有组记录（缺容器节点）：结构异常，拒绝实例化`
    )
  }
  const instanceIds = allocateRun(parsed, subtreeIds.length, options.id)
  const idMap = new Map<number, number>()
  subtreeIds.forEach((oldId, index) => idMap.set(oldId, instanceIds[index]))
  const instanceGroupId = instanceIds[0]
  const instanceNodeId = instanceIds[1]

  // 组记录：重映射 + 族描述符改写 + f504
  const groupFields = parseWireMessage(template.raw)
  if (!groupFields) throw new Error('[error] 模板组记录解析失败')
  let clonedGroup = cloneFields(groupFields, idMap)
  clonedGroup = replaceFamilyDescriptor(
    clonedGroup,
    FAMILY_TEMPLATE,
    makeInstanceDescriptor(options.templateGroupId)
  )
  clonedGroup = removeField(clonedGroup, PARENT_FIELD, 0)
  clonedGroup = insertParentAfterFamily(clonedGroup, options.layoutId)

  const records: Uint8Array[] = [emitWireMessage(clonedGroup)]
  // 节点与子控件：逐条克隆（子树 DFS 顺序，父前子后）
  for (const oldId of subtreeIds.slice(1)) {
    const record = parsed.recordsById.get(oldId)
    if (!record) continue
    const fields = parseWireMessage(record.raw)
    if (!fields) throw new Error(`[error] 子树记录解析失败: ${oldId}`)
    const cloned = cloneFields(fields, idMap)
    records.push(emitWireMessage(cloned))
  }

  const out = withRoot9Section(current, (section) => {
    insertRecords(section, records)
    appendIndexEntries(section, [instanceNodeId])
    appendMember(section, options.layoutId, instanceGroupId)
    const templateFields =
      parseWireMessage(recordEntry(section, options.templateGroupId).value as Uint8Array) ?? []
    // 只追加，不剪既有项（编辑器自己也保留悬空实例引用，如 1073741842 的 1073742012）
    const current = instanceIdsOf(templateFields)
    if (!current.includes(instanceGroupId)) {
      setInstanceList(section, options.templateGroupId, [...current, instanceGroupId])
    }
  })

  // 回读自检：实例子树必须与模板子树同构（类型/层级/名字/顺序）
  const after = inventoryContainers(out)
  const instance = after.instances.find((item) => item.groupId === instanceGroupId)
  if (!instance) throw new Error('[error] 自检失败：回读找不到生成的布局实例')
  if (instance.templateGroupId !== options.templateGroupId) {
    throw new Error('[error] 自检失败：实例未指向模板组')
  }
  if (instance.parentId !== options.layoutId) {
    throw new Error('[error] 自检失败：实例组 f504 不是目标布局')
  }
  const templateSignature = subtreeSignature(tree)
  const instanceSignature = subtreeSignature(instance.tree)
  if (templateSignature !== instanceSignature) {
    throw new Error(
      `[error] 自检失败：实例子树与模板不同构\n  template=${templateSignature}\n  instance=${instanceSignature}`
    )
  }
  const layoutAfter = requireRecord(parseRoot9(out), options.layoutId, '布局')
  if (!extractMemberIds(layoutAfter.fields).includes(instanceGroupId)) {
    throw new Error('[error] 自检失败：布局成员表未包含实例组')
  }
  const templateAfter = requireRecord(parseRoot9(out), options.templateGroupId, '容器模板')
  if (!instanceIdsOf(templateAfter.fields).includes(instanceGroupId)) {
    throw new Error('[error] 自检失败：模板族实例列表未包含实例组')
  }
  const parsedOut = parseRoot9(out)
  if (!parsedOut.indexIds.has(instanceNodeId)) {
    throw new Error('[error] 自检失败：实例节点未进入 root9 顶层索引（编辑器会当孤儿根处理）')
  }
  if (parsedOut.indexIds.has(instanceGroupId)) {
    throw new Error('[error] 自检失败：实例组不应进入顶层索引（编辑器样本中实例组不在森林根集）')
  }
  // 节点/占位/挂载/双向引用/索引 全量不变量（缺一条抛错）
  assertContainerInvariants(out, {
    templateGroupId: options.templateGroupId,
    instanceGroupId,
    layoutId: options.layoutId,
    createdIds: [...instanceIds, ...placeholders.map((item) => item.childId)]
  })

  return {
    bytes: out,
    templateGroupId: options.templateGroupId,
    layoutId: options.layoutId,
    instanceGroupId,
    instanceNodeId,
    recordIds: instanceIds,
    copiedRecords: records.length,
    childCount: countNodes(tree) - tree.children.length,
    transferredMounts: instance.mounts.filter((mount) => mount.hostId === instanceNodeId),
    placeholders,
    selfCheck: 'pass'
  }
}

/* ------------------------------------------------------------------ *
 * 库/布局实例 → 容器模板（存为模板）
 * ------------------------------------------------------------------ */

export interface SaveTemplateOptions {
  instanceGroupId: number
  /** 新模板名（缺省=实例名；撞名自动 _1/_2） */
  name?: string
  /** 显式新模板组 ID */
  id?: number
}

export interface SaveTemplateResult {
  bytes: Uint8Array
  instanceGroupId: number
  /** 实例原来的模板引用（可能没有） */
  previousTemplateGroupId?: number
  newTemplateGroupId: number
  newTemplateNodeId: number
  newName: string
  recordIds: number[]
  copiedRecords: number
  childCount: number
  selfCheck: 'pass'
}

/**
 * 把实例（库实例/布局实例）复制成容器模板：新模板组 + 节点 + 全部子控件；
 * 实例 f13 改指新模板（编辑器行为），实例与新模板同名去重；旧模板族实例列表移除该实例。
 */
export function saveInstanceAsTemplate(
  bytes: Uint8Array,
  options: SaveTemplateOptions
): SaveTemplateResult {
  const parsed = parseRoot9(bytes)
  const instance = requireRecord(parsed, options.instanceGroupId, '容器实例')
  if (instance.kind !== 'client-container') {
    throw new Error(`[error] ${options.instanceGroupId} 不是客户端控件容器（kind=${instance.kind}）`)
  }
  if (!instance.familyTypes.includes(FAMILY_INSTANCE)) {
    throw new Error(`[error] ${options.instanceGroupId} 不是实例（族 ${instance.familyTypes.join('/')}）`)
  }
  const childrenMap = buildChildrenMap(parsed)
  const { ids: subtreeIds, tree } = subtreeOf(options.instanceGroupId, childrenMap, parsed)
  const newIds = allocateRun(parsed, subtreeIds.length, options.id)
  const idMap = new Map<number, number>()
  subtreeIds.forEach((oldId, index) => idMap.set(oldId, newIds[index]))
  const newTemplateGroupId = newIds[0]
  const newTemplateNodeId = newIds[1]

  // 名字去重：对照既有容器模板名（编辑器行为：模板与实例同名，重名追加 _1/_2）
  const taken = new Set(parsed.records.filter((r) => r.kind === 'client-container' && r.familyTypes.includes(FAMILY_TEMPLATE)).map((r) => r.name))
  const base = options.name ?? instance.name ?? '客户端控件容器'
  let newName = base
  let suffix = 1
  while (taken.has(newName)) {
    newName = `${base}_${suffix}`
    suffix += 1
  }

  const groupFields = parseWireMessage(instance.raw)
  if (!groupFields) throw new Error('[error] 实例组记录解析失败')
  let clonedGroup = cloneFields(groupFields, idMap)
  clonedGroup = removeField(clonedGroup, PARENT_FIELD, 0)
  clonedGroup = replaceFamilyDescriptor(
    clonedGroup,
    FAMILY_INSTANCE,
    makeTemplateDescriptor(options.instanceGroupId)
  )
  const records: Uint8Array[] = [withName(emitWireMessage(clonedGroup), newName)]
  for (const oldId of subtreeIds.slice(1)) {
    const record = parsed.recordsById.get(oldId)
    if (!record) continue
    const fields = parseWireMessage(record.raw)
    if (!fields) throw new Error(`[error] 子树记录解析失败: ${oldId}`)
    records.push(emitWireMessage(cloneFields(fields, idMap)))
  }

  const previousTemplateGroupId = templateRefOf(groupFields)
  const out = withRoot9Section(bytes, (section) => {
    insertRecords(section, records)
    appendIndexEntries(section, [newTemplateGroupId, newTemplateNodeId])
    // 实例改指新模板 + 实例改名（与编辑器 after-save-template 样本一致）
    const entry = recordEntry(section, options.instanceGroupId)
    const fields = parseWireMessage(entry.value as Uint8Array)
    if (!fields) throw new Error('[error] 实例组记录解析失败')
    const descriptorIndex = fields.findIndex((field) => {
      if (field.number !== FAMILY_TYPE_FIELD || field.wire !== 2) return false
      const sub = parseWireMessage(field.value as Uint8Array)
      return sub !== undefined && firstVarint(sub, SELF_FIELD) === FAMILY_INSTANCE
    })
    if (descriptorIndex < 0) throw new Error('[error] 实例缺少族 3 描述符')
    fields[descriptorIndex] = makeInstanceDescriptor(newTemplateGroupId)
    entry.value = withName(emitWireMessage(fields), newName)
    if (previousTemplateGroupId !== undefined) {
      const templateEntry = section.find((field) => ownIdOfField(field) === previousTemplateGroupId)
      if (templateEntry) {
        const previous = instanceIdsOf(
          parseWireMessage(templateEntry.value as Uint8Array) ?? []
        ).filter((id) => id !== options.instanceGroupId)
        setInstanceList(section, previousTemplateGroupId, previous)
      }
    }
  })

  const after = inventoryContainers(out)
  const created = after.templates.find((item) => item.groupId === newTemplateGroupId)
  if (!created) throw new Error('[error] 自检失败：回读找不到新模板')
  if (subtreeSignature(created.tree) !== subtreeSignature(tree)) {
    throw new Error('[error] 自检失败：新模板子树与实例不同构')
  }
  if (!created.instanceIds.includes(options.instanceGroupId)) {
    throw new Error('[error] 自检失败：新模板实例列表未包含源实例')
  }
  const instanceAfter = requireRecord(parseRoot9(out), options.instanceGroupId, '容器实例')
  if (templateRefOf(instanceAfter.fields) !== newTemplateGroupId) {
    throw new Error('[error] 自检失败：实例未改指新模板')
  }
  if (instanceAfter.name !== newName) {
    throw new Error('[error] 自检失败：实例未改名')
  }
  const parsedOutSave = parseRoot9(out)
  for (const id of [newTemplateGroupId, newTemplateNodeId]) {
    if (!parsedOutSave.indexIds.has(id)) {
      throw new Error(`[error] 自检失败：新模板记录 ${id} 未进入 root9 顶层索引`)
    }
  }
  assertIndexNoDangling(parsedOutSave)

  return {
    bytes: out,
    instanceGroupId: options.instanceGroupId,
    ...(previousTemplateGroupId !== undefined ? { previousTemplateGroupId } : {}),
    newTemplateGroupId,
    newTemplateNodeId,
    newName,
    recordIds: newIds,
    copiedRecords: records.length,
    childCount: countNodes(tree) - tree.children.length,
    selfCheck: 'pass'
  }
}

/**
 * 把「模板组 → 实例组」的反向引用写进模板族描述符（`f14{f501 packed}`），并清掉悬空实例引用。
 * 编辑器每个实例都会登记在模板的 f14 里（1073741840.after-layout-templates：2021.f14=[2049]）；
 * create 的字节级 donor 路径与 instantiate 共用这一条，避免「只有实例引用模板、模板不知道实例」的单向树。
 */
export function linkTemplateInstance(
  bytes: Uint8Array,
  options: { templateGroupId: number; instanceGroupId: number }
): Uint8Array {
  const parsed = parseRoot9(bytes)
  const template = parsed.recordsById.get(options.templateGroupId)
  if (!template) throw new Error(`[error] 容器模板不存在: ${options.templateGroupId}`)
  if (!template.familyTypes.includes(FAMILY_TEMPLATE)) {
    throw new Error(`[error] ${options.templateGroupId} 不是容器模板（族 ${template.familyTypes.join('/')}）`)
  }
  if (!parsed.recordsById.has(options.instanceGroupId)) {
    throw new Error(`[error] 实例不存在: ${options.instanceGroupId}`)
  }
  return withRoot9Section(bytes, (section) => {
    const templateFields =
      parseWireMessage(recordEntry(section, options.templateGroupId).value as Uint8Array) ?? []
    const current = instanceIdsOf(templateFields)
    // 只追加（保留既有项，含历史悬空引用——编辑器同款行为）
    if (!current.includes(options.instanceGroupId)) {
      setInstanceList(section, options.templateGroupId, [...current, options.instanceGroupId])
    }
  })
}

/** 名称/ID 选择器：`<id>` 或 `name:<名字>` 或纯名字（模板/实例通用） */
export function selectContainers(
  inventory: ContainerInventory,
  selector: string,
  family: 'template' | 'instance' | 'any' = 'template'
): ContainerRecordInfo[] {
  const pool =
    family === 'template'
      ? inventory.templates
      : family === 'instance'
        ? inventory.instances
        : [...inventory.templates, ...inventory.instances]
  const trimmed = selector.trim()
  if (trimmed === '' || trimmed === 'all') return pool
  if (/^\d+$/.test(trimmed)) {
    const id = Number(trimmed)
    return pool.filter((item) => item.groupId === id)
  }
  const name = trimmed.startsWith('name:') ? trimmed.slice(5) : trimmed
  return pool.filter((item) => item.name === name)
}

/** 找出「相对基线新增」的容器模板（记录 ID 不在基线的 root9 里） */
export function newTemplatesSince(baselineBytes: Uint8Array, inventory: ContainerInventory): number[] {
  const baseline = parseRoot9(baselineBytes)
  return inventory.templates
    .filter((template) => !baseline.recordsById.has(template.groupId))
    .map((template) => template.groupId)
}

/** 布局定位：ID 或名字（缺省=第一个布局记录） */
export function resolveLayout(parsed: ParsedRoot9, selector?: string): number {
  const layouts = parsed.records.filter((record) => record.kind === 'layout')
  if (layouts.length === 0) throw new Error('[error] 地图里没有布局记录')
  if (selector === undefined) return layouts[0].id
  const trimmed = selector.trim()
  if (/^\d+$/.test(trimmed)) {
    const id = Number(trimmed)
    if (!layouts.some((layout) => layout.id === id)) throw new Error(`[error] 布局不存在: ${id}`)
    return id
  }
  const name = trimmed.startsWith('name:') ? trimmed.slice(5) : trimmed
  const found = layouts.find((layout) => layout.name === name)
  if (!found) {
    throw new Error(
      `[error] 布局名不存在: ${name}（可选: ${layouts.map((l) => `${l.id}:${l.name}`).join(', ')}）`
    )
  }
  return found.id
}

/** 已在该布局里的实例（幂等/重复保护） */
export function layoutInstancesOf(
  inventory: ContainerInventory,
  templateGroupId: number,
  layoutId: number
): number[] {
  return inventory.instances
    .filter((item) => item.templateGroupId === templateGroupId && item.parentId === layoutId)
    .map((item) => item.groupId)
}

export type { ParsedRoot9 }
export { collectCompTypes }
