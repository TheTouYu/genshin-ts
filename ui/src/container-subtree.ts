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
 * root9 顶层索引（f501）重建 = **全部无 f504 的记录，按物理顺序**。
 * 编辑器实测（1073741843.after-import2 / 1073741840.after-layout-templates）：
 * 模板组、容器节点、布局、库根、层级根在索引里；实例组（有 f504）与控件子件（有 f504）不在。
 * 索引顺序必须与记录物理顺序单调一致（D558 整图写回事故的判据之一）。
 */
function rebuildIndexFromParentless(section: WireField[]): void {
  const indexField = section.find((field) => field.number === SELF_FIELD && field.wire === 2)
  if (!indexField) throw new Error('[error] root9 顶层索引（f501）缺失')
  const ids: number[] = []
  for (const field of section) {
    if (field.number !== FAMILY_TYPE_FIELD || field.wire !== 2) continue
    const fields = parseWireMessage(field.value as Uint8Array)
    if (!fields) continue
    const id = firstVarint(fields, SELF_FIELD)
    if (id === undefined) continue
    if (firstVarint(fields, PARENT_FIELD) === undefined) ids.push(id)
  }
  indexField.value = encodePackedVarints(ids)
}

function insertRecords(section: WireField[], records: readonly Uint8Array[]): void {
  // root9 形态恒为 `501(索引) | 502×N(记录) | 503(尾标)`：新记录插在尾标之前
  const tailAt = section.findIndex((field) => field.number === MEMBER_FIELD && field.wire === 0)
  const at = tailAt >= 0 ? tailAt : section.length
  section.splice(at, 0, ...records.map((value) => ({ number: FAMILY_TYPE_FIELD, wire: 2, value })))
}

/**
 * 索引自检：①集合 = 全部无 f504 记录；②顺序 = 记录物理顺序（D558 整图写回事故的判据）。
 */
function assertIndexInvariant(parsed: ParsedRoot9): void {
  const parentless = parsed.records
    .filter((record) => record.parentId === null)
    .map((record) => record.id)
  const indexed = [...parsed.indexIds]
  if (parentless.join(',') !== indexed.join(',')) {
    throw new Error(
      '[error] 自检失败：root9 顶层索引与「无 f504 记录按物理顺序」不一致\n' +
        `  parentless=${parentless.join(',')}\n  index     =${indexed.join(',')}`
    )
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

function allocateRun(parsed: ParsedRoot9, count: number, explicit?: number): number[] {
  const used = usedIds(parsed)
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
 * 布局实例化（模板子树 → 布局实例子树）
 * ------------------------------------------------------------------ */

export interface InstantiateOptions {
  templateGroupId: number
  layoutId: number
  /** 显式实例组 ID（缺省=从 1073742500 起避让） */
  id?: number
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
  /** 结构自检（回读同构）；false 时本函数抛错 */
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
  const parsed = parseRoot9(bytes)
  const template = requireRecord(parsed, options.templateGroupId, '容器模板')
  if (template.kind !== 'client-container') {
    throw new Error(`[error] ${options.templateGroupId} 不是客户端控件容器（kind=${template.kind}）`)
  }
  if (!template.familyTypes.includes(FAMILY_TEMPLATE)) {
    throw new Error(`[error] ${options.templateGroupId} 不是容器模板（族 ${template.familyTypes.join('/')}）`)
  }
  const layout = requireRecord(parsed, options.layoutId, '布局')
  if (layout.kind !== 'layout') throw new Error(`[error] ${options.layoutId} 不是布局记录`)

  const childrenMap = buildChildrenMap(parsed)
  const { ids: subtreeIds, tree } = subtreeOf(options.templateGroupId, childrenMap, parsed)
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

  const out = withRoot9Section(bytes, (section) => {
    insertRecords(section, records)
    rebuildIndexFromParentless(section)
    appendMember(section, options.layoutId, instanceGroupId)
    const templateFields =
      parseWireMessage(recordEntry(section, options.templateGroupId).value as Uint8Array) ?? []
    // 顺手清掉悬空实例引用（记录已被删除的历史残留），再追加本次实例
    const current = instanceIdsOf(templateFields)
    const liveIds = current.filter((id) => parsed.recordsById.has(id))
    const next = liveIds.includes(instanceGroupId) ? liveIds : [...liveIds, instanceGroupId]
    if (next.join(',') !== current.join(',')) {
      setInstanceList(section, options.templateGroupId, next)
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
  assertIndexInvariant(parsedOut)

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
    rebuildIndexFromParentless(section)
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
  assertIndexInvariant(parsedOutSave)

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
    const liveIds = current.filter((id) => parsed.recordsById.has(id))
    const next = liveIds.includes(options.instanceGroupId)
      ? liveIds
      : [...liveIds, options.instanceGroupId]
    // 列表有变化（新增或清掉悬空实例）才写回
    if (next.join(',') !== current.join(',')) {
      setInstanceList(section, options.templateGroupId, next)
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
