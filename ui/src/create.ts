/**
 * ui/src/create.ts — assets:ui create 候选生成核心（票 05）
 *
 * 范围：布局面/悬浮页容器面的编辑器「官方单条」控件候选生成（只读 --output，不做 .gil 写回）。
 * 支持 kind（donor 支持矩阵 = 80 快照内真实编辑器新建事件的存在性，见 create-donors.ts）：
 *   - custom-button：layout（轮4）/ container（轮26）
 *   - input-box：layout（轮19）/ container（轮64）
 *   - textbox：container（轮64）；layout 面以容器 donor + f504 重映射生成
 *     （轮64 规则 2：官方控件内容与放置面无关、仅 f504 不同——输入框 2079/2157 已实测同构）
 *   - image：container（轮64）；layout 面同上回退
 *   - message-queue：layout（轮51）；container 面无样本 → fail-closed
 *   - layout（新建布局）：克隆默认布局官方预置全集（轮1/2 双样本；成员实例/模板不克隆，
 *     物理块插 1839/1840 之间、索引插 1840 之前、ID 尾段连续）——波1 主菜单布局
 *
 * wire 依据（知识权威 ui-controls.md）：
 * - 官方预置控件 = 单条 502 记录（f504=宿主布局/容器；无模板/实例分离）——轮4/19/51/64；
 * - 悬浮页详情元素挂实例侧容器（宿主 f503 追加成员；未同步不动模板侧）——轮26/64；
 * - 判别器需 parent 上下文（轮64）；placement 表见 ui/types.ts UI_KIND_REGISTRY；
 * - ID 分配禁止 max+1 直推：扫描已用 ID 取尾部空洞最高空闲（mappings §8 例 2031），
 *   无空洞才 maxUsed+1；
 * - 未解码字节一律透传/不猜：donor 缺失或面无样本时显式报错（fail-closed，铁律 8）。
 */

import { buildFile, encodeVarint, readUint32BE } from '../../src/injector/binary.js'
import {
  emitWireMessage,
  parseWireMessage,
  type WireField
} from '../../src/cli/static_assembly/wire.js'
import {
  remapUiRecordVarints,
  setUiControlName,
  setUiControlTransform
} from '../../src/cli/gil_ui.js'
import { CREATE_DONORS, createDonor } from './create-donors.js'
import {
  CLIENT_CONTAINER_CHILD_DONOR,
  CLIENT_CONTAINER_GROUP_DONOR
} from './create-donors-client-container.js'
import { CLIENT_CONTROL_DONORS } from './create-donors-client-controls.js'
import type { UiCreateDonor, UiCreateDonorKind } from './create-donors.js'
import {
  DEFAULT_LAYOUT_ID,
  extractContainerRefs,
  extractMemberIds,
  firstVarint,
  LIBRARY_CONTAINER_ID,
  packedVarints,
  parseRoot9,
  recordNameOf
} from './record.js'
import { UI_KIND_REGISTRY } from './types.js'
import type { UiRecordMeta } from './types.js'
import type { ParsedRoot9 } from './record.js'

export type CreateControlKind =
  | Extract<UiCreateDonorKind, 'custom-button' | 'textbox' | 'image' | 'input-box' | 'message-queue'>
  /** 空客户端控件容器（两件套：容器组 f502=23 + 容器节点 f502=86）——2026-10-23 hl 差分 donor */
  | 'client-container'

export type CreateSurface =
  | { kind: 'layout'; layoutId: number }
  | { kind: 'container'; containerId: number }

export interface CreateUiCandidateOptions {
  /** 控件 kind（支持矩阵见文件头） */
  kind: CreateControlKind
  /** 目标放置面（写命令前必须 placement 校验） */
  surface: CreateSurface
  /** 未指定 → allocateControlId 避让分配（禁止 max+1 直推） */
  id?: number
  /** 控件名（默认沿用 donor 的编辑器默认名，如「自定义按钮/文本框/图文输入框…」） */
  name?: string
  /** 位置=控件中心绝对坐标（1600×900；编辑器坐标 y 向上：0=屏幕底、900=屏幕顶，视觉越靠上 y 越大；
   *  内部换算 wire=C−(800,450)——轮18 贴边公式 上缘中心 y=900−h/2−m 同口径） */
  position?: readonly [number, number]
  size?: readonly [number, number]
  /** 物理插入锚点：插到该记录之后（与编辑器样本逐字节对拍时用）；默认追加 502 段尾 */
  insertAfterId?: number
}

export interface CreateUiCandidateResult {
  /** 整文件候选字节（可直接 --output 落盘 / diff / 回读断言） */
  bytes: Uint8Array
  kind: CreateControlKind
  surface: CreateSurface
  parentId: number
  newId: number
  /** donor 溯源（真实编辑器样本） */
  donorSource: string
  donorKind: UiCreateDonorKind
  donorSelfId: number
  donorParentId: number
  /** donor 实际放置面（textbox/image 布局面回退自容器 donor 时 = 'container'） */
  donorSurface: 'layout' | 'container'
  /** 布局面使用了容器面 donor（跨面同构回退；输入框对 2079/2157 同构已断言实证） */
  donorFallback?: boolean
  insertAfterId?: number
}

/** 放置面对应的 placement 键（registry SurfacePlacement） */
export function placementKeyOf(surface: CreateSurface): 'layout' | 'container' {
  return surface.kind === 'layout' ? 'layout' : 'container'
}

/** placement 校验（DESIGN 1.2 / 用户权威：普通控件三面通用；tab 仅容器面…） */
export function assertPlacement(kind: CreateControlKind, surface: CreateSurface): void {
  // client-container 是容器类（非 UI_KIND_REGISTRY 的控件族），只允许布局面，由专用装配函数校验
  if (kind === 'client-container') {
    if (surface.kind !== 'layout') {
      throw new Error('[error] 客户端控件容器仅可放置于布局（客户端控件只能活在容器画布或模板里）')
    }
    return
  }
  const spec = UI_KIND_REGISTRY[kind]
  const placement = placementKeyOf(surface)
  if (!spec.placement.includes(placement)) {
    const faces = spec.placement
      .map((face) => (face === 'layout' ? '布局' : face === 'container' ? '悬浮页容器' : '控件组库'))
      .join(' / ')
    throw new Error(`[error] ${spec.label} 仅可放置于 ${faces}（当前目标=该面之外的放置面）`)
  }
}

/**
 * donor 解析（支持矩阵 = 真实编辑器新建样本）：
 * - 同 kind 同面样本直接命中；
 * - textbox/image 的布局面：80 快照无布局新建样本 → 回退容器面 donor（跨面同构轮64 规则 2）；
 * - message-queue 容器面：无样本 → fail-closed（不猜字节）。
 */
export function resolveDonor(kind: CreateControlKind, placement: 'layout' | 'container'): {
  donor: UiCreateDonor
  donorSurface: 'layout' | 'container'
  fallback: boolean
} {
  const directId = `${kind}.${placement}` as UiCreateDonor['id']
  if (CREATE_DONORS.some((item) => item.id === directId)) {
    const donor = createDonor(directId)
    return { donor, donorSurface: donor.surface, fallback: false }
  }
  if (placement === 'layout' && (kind === 'textbox' || kind === 'image')) {
    const donor = createDonor(kind === 'textbox' ? 'textbox.container' : 'image.container')
    return { donor, donorSurface: donor.surface, fallback: true }
  }
  if (placement === 'container' && kind === 'message-queue') {
    throw new Error(
      '[error] message-queue 容器面无编辑器新建样本（80 快照内队列仅轮51 布局面样本）——' +
        '本轮 fail-closed；待容器面差分轮后再启用'
    )
  }
  const donor = createDonor(directId)
  return { donor, donorSurface: donor.surface, fallback: false }
}

function requireRecord(parsed: ParsedRoot9, id: number, what: string) {
  const record = parsed.recordsById.get(id)
  if (!record) throw new Error(`[error] ${what}记录不存在: ${id}`)
  return record
}

/** 容器记录是否带 f503 成员列表（宿主追加语义的前提） */
function hasMemberList(parsed: ParsedRoot9, id: number): boolean {
  const record = parsed.recordsById.get(id)
  return record !== undefined && record.fields.some((f) => f.number === 503 && f.wire === 2)
}

/** 容器归属悬浮页：找到 t42 引用该容器的悬浮页实体（实例侧/页面容器均须在册） */
export function ownerFloatingPageId(parsed: ParsedRoot9, containerId: number): number | undefined {
  for (const record of parsed.records) {
    if (record.kind !== 'floating-page') continue
    if (extractContainerRefs(record.fields).includes(containerId)) return record.id
  }
  return undefined
}

/**
 * 解析 `--on` 放置面文本 → CreateSurface。
 * 支持：layout:<ID|名称> / container:<容器ID> / 悬浮页:<悬浮页ID|名称>:<容器ID>。
 * 校验在解析时完成（fail-closed：找不到/不属于悬浮页一律报错，不猜）。
 */
export function resolveSurfaceTarget(parsed: ParsedRoot9, raw: string): CreateSurface {
  const parts = raw.split(':').map((part) => part.trim())
  if (parts.length < 2 || parts.some((part) => part === '')) {
    throw new Error(
      '[error] --on 格式须为 layout:<ID|名称>、container:<容器ID> 或 悬浮页:<悬浮页ID|名称>:<容器ID>'
    )
  }
  if (parts[0] === 'layout') {
    const numeric = Number(parts[1])
    let layoutId: number
    if (Number.isSafeInteger(numeric) && parts[1] !== '') {
      layoutId = numeric
      requireRecord(parsed, layoutId, '布局')
    } else {
      const matches = parsed.records.filter(
        (r) => r.kind === 'layout' && recordNameOf(r.fields, r.raw) === parts[1]
      )
      if (matches.length === 0)
        throw new Error(`[error] 布局不存在: ${parts[1]}（可用 list --tree 查名/ID）`)
      if (matches.length > 1) throw new Error(`[error] 布局名不唯一: ${parts[1]}，请用 layout:<ID>`)
      layoutId = matches[0].id
    }
    const layout = requireRecord(parsed, layoutId, '布局')
    if (layout.kind !== 'layout') throw new Error(`[error] ${layoutId} 不是布局记录`)
    return { kind: 'layout', layoutId }
  }
  if (parts[0] === 'container') {
    const containerId = Number(parts[1])
    if (!Number.isSafeInteger(containerId))
      throw new Error('[error] container 面需数字容器 ID（悬浮页容器/固有容器组）')
    return validateContainerSurface(parsed, containerId)
  }
  if (parts[0] === '悬浮页') {
    if (parts.length < 3) {
      throw new Error('[error] 悬浮页面格式须为 悬浮页:<悬浮页ID|名称>:<容器ID>')
    }
    const pageNumeric = Number(parts[1])
    let pageId: number
    if (Number.isSafeInteger(pageNumeric) && parts[1] !== '') {
      pageId = pageNumeric
    } else {
      const matches = parsed.records.filter(
        (r) => r.kind === 'floating-page' && recordNameOf(r.fields, r.raw) === parts[1]
      )
      if (matches.length === 0)
        throw new Error(`[error] 悬浮页不存在: ${parts[1]}（可用 list --tree 查名/ID）`)
      if (matches.length > 1) throw new Error(`[error] 悬浮页名不唯一: ${parts[1]}，请用 ID`)
      pageId = matches[0].id
    }
    const page = requireRecord(parsed, pageId, '悬浮页')
    if (page.kind !== 'floating-page') throw new Error(`[error] ${pageId} 不是悬浮页记录`)
    const containerId = Number(parts[2])
    if (!Number.isSafeInteger(containerId))
      throw new Error('[error] 悬浮页面容器需数字容器 ID')
    const refs = extractContainerRefs(page.fields)
    if (!refs.includes(containerId))
      throw new Error(`[error] 容器 ${containerId} 不在悬浮页 ${pageId} 的容器列表（t42）中`)
    return validateContainerSurface(parsed, containerId)
  }
  throw new Error('[error] --on 首段须为 layout / container / 悬浮页（当前: ' + parts[0] + '）')
}

/** 控件类 kind（判别含 parent 上下文；容器面校验时排除，容器=非控件的宿主记录） */
const CONTROL_KINDS = new Set([
  'custom-button',
  'interactive-button',
  'custom-switch',
  'textbox',
  'image',
  'input-box',
  'message-queue',
  'tab',
  'close-button',
  'material-member',
  'layout',
  'floating-page'
])

function validateContainerSurface(parsed: ParsedRoot9, containerId: number): CreateSurface {
  const record = requireRecord(parsed, containerId, '容器')
  // 容器语义 = 宿主（非控件类记录）+ f503 成员列表 + 属于某悬浮页 t42
  // （固有容器组/页面容器可能被分类为 asset-group/container/unknown，不允许按 kind 白名单硬判）
  if (CONTROL_KINDS.has(record.kind)) {
    throw new Error(`[error] ${containerId} 不是悬浮页容器（kind=${record.kind} 属控件/布局类）`)
  }
  if (!hasMemberList(parsed, containerId)) {
    throw new Error(`[error] 容器 ${containerId} 缺少 f503 成员列表（宿主追加语义不成立）`)
  }
  if (ownerFloatingPageId(parsed, containerId) === undefined) {
    throw new Error(`[error] 容器 ${containerId} 不属于任何悬浮页（t42 未引用）——只允许挂悬浮页容器`)
  }
  return { kind: 'container', containerId }
}

/**
 * 收集 root9 全部已用控制 ID（记录 ID + 顶层索引 + 宿主 f503 成员 + 记录顶层
 * 0x40000000 段 varint——父引用等），供避让分配（不回扫深层嵌套，够用且不过判）。
 */
export function collectUsedControlIds(parsed: ParsedRoot9): Set<number> {
  const used = new Set<number>()
  const ID_ZONE_MIN = 1073741824
  const ID_ZONE_MAX = 2147483647
  for (const record of parsed.records) {
    used.add(record.id)
    for (const member of extractMemberIds(record.fields)) used.add(member)
    for (const v of record.fields) {
      if (v.wire !== 0 || v.value === undefined) continue
      const value = v.value as number
      if (value >= ID_ZONE_MIN && value <= ID_ZONE_MAX) used.add(value)
    }
  }
  for (const id of parsed.indexIds) used.add(id)
  return used
}

/**
 * ID 避让分配（mappings §8；禁止 max+1 直推 = 禁止把编辑器内部计数器当连续）：
 * 1. 尾部相邻空闲段（编辑器跳变留下的空洞，如轮4 的 2019..2031）→ 取其中最高位（贴近
 *    maxUsed 的缺口，例 2031）；
 * 2. 无空洞（连续到顶）→ 取 maxUsed+1（对当前文件无冲突的尾部接续）。
 */
export function allocateControlId(parsed: ParsedRoot9, explicitId?: number): number {
  const used = collectUsedControlIds(parsed)
  if (explicitId !== undefined) {
    if (!Number.isSafeInteger(explicitId) || explicitId < 0) {
      throw new Error('[error] --id 须为非负安全整数')
    }
    if (used.has(explicitId)) {
      throw new Error(`[error] --id ${explicitId} 已被占用（记录/索引/引用冲突），请避让或另选`)
    }
    return explicitId
  }
  const ID_FLOOR = 1073741843 // 系统容器 1840-1842 / 默认布局 1825 之上
  if (used.size === 0) return ID_FLOOR
  const maxUsed = Math.max(...used)
  for (let id = maxUsed - 1; id >= ID_FLOOR; id--) {
    if (!used.has(id)) return id
  }
  return maxUsed + 1
}

function encodePackedVarints(values: readonly number[]): Uint8Array {
  return Uint8Array.from(values.flatMap((value) => Array.from(encodeVarint(value))))
}

function ownIdOf(field: WireField): number | undefined {
  if (field.number !== 502 || field.wire !== 2) return undefined
  const fields = parseWireMessage(field.value as Uint8Array)
  return fields ? firstVarint(fields, 501) : undefined
}

/**
 * 低层装配：root9 502 段插入新记录 + 宿主记录 f503 packed 追加 + 整文件重建。
 * 全程 parse/emit 保真（未触碰的字段原样透传），插入位置可用 insertAfterId 指定。
 */
function applySectionChanges(
  bytes: Uint8Array,
  ops: { record: Uint8Array; recordId: number; parentId: number; insertAfterId?: number }
): Uint8Array {
  const top = parseWireMessage(bytes.subarray(20, bytes.length - 4))
  if (!top) throw new Error('[error] malformed GIL payload')
  const root9 = top.find((f) => f.number === 9 && f.wire === 2)
  if (!root9) throw new Error('[error] root9 section missing')
  const section = parseWireMessage(root9.value as Uint8Array)
  if (!section) throw new Error('[error] invalid root 9 section')
  const ownerIndex = section.findIndex((f) => ownIdOf(f) === ops.parentId)
  if (ownerIndex < 0) throw new Error(`[error] 宿主记录不存在: ${ops.parentId}`)
  const ownerField = section[ownerIndex]
  const owner = parseWireMessage(ownerField.value as Uint8Array)
  if (!owner) throw new Error(`[error] 宿主记录解析失败: ${ops.parentId}`)
  const members = owner.find((f) => f.number === 503 && f.wire === 2)
  if (!members) throw new Error(`[error] 宿主记录缺少 f503 成员列表: ${ops.parentId}`)
  const ids = packedVarints(members.value as Uint8Array)
  if (ids.includes(ops.recordId)) {
    throw new Error(`[error] 宿主记录已包含成员 ${ops.recordId}`)
  }
  ids.push(ops.recordId)
  members.value = encodePackedVarints(ids)
  ownerField.value = emitWireMessage(owner)
  let at = section.length
  if (ops.insertAfterId !== undefined) {
    const anchorIndex = section.findIndex((f) => ownIdOf(f) === ops.insertAfterId)
    if (anchorIndex < 0) {
      throw new Error(`[error] 插入锚点记录不存在: ${ops.insertAfterId}`)
    }
    at = anchorIndex + 1
  }
  section.splice(at, 0, { number: 502, wire: 2, value: ops.record })
  root9.value = emitWireMessage(section)
  return buildFile(emitWireMessage(top), {
    schema: readUint32BE(bytes, 4),
    headTag: readUint32BE(bytes, 8),
    fileType: readUint32BE(bytes, 12),
    tailTag: readUint32BE(bytes, bytes.length - 4)
  })
}

/**
 * 生成官方单条控件候选（支持矩阵 kind × 放置面，见文件头；字节级 donor 装配）。
 * 只读：返回整文件候选字节，不写盘。
 */
export function createUiCandidate(
  bytes: Uint8Array,
  options: CreateUiCandidateOptions
): CreateUiCandidateResult {
  const placement = placementKeyOf(options.surface)
  assertPlacement(options.kind, options.surface)
  const parsed = parseRoot9(bytes)
  const parentId =
    options.surface.kind === 'layout' ? options.surface.layoutId : options.surface.containerId
  requireRecord(parsed, parentId, options.surface.kind === 'layout' ? '布局' : '容器')
  if (options.surface.kind === 'container') {
    validateContainerSurface(parsed, parentId)
  } else {
    const parent = parsed.recordsById.get(parentId)
    if (!parent || parent.kind !== 'layout') {
      throw new Error(`[error] ${parentId} 不是布局记录`)
    }
  }
  if (!hasMemberList(parsed, parentId)) {
    throw new Error(`[error] 宿主 ${parentId} 缺少 f503 成员列表`)
  }
  const newId = allocateControlId(parsed, options.id)
  const { donor, donorSurface, fallback } = resolveDonor(options.kind, placement)
  let record: Uint8Array = Buffer.from(donor.hex, 'hex')
  const map: Record<number, number> = {}
  if (donor.selfId !== newId) map[donor.selfId] = newId
  if (donor.parentId !== parentId) map[donor.parentId] = parentId
  record = remapUiRecordVarints(record, map)
  if (options.name !== undefined) record = setUiControlName(record, options.name)
  if (options.position !== undefined || options.size !== undefined) {
    record = setUiControlTransform(record, {
      ...(options.position !== undefined ? { position: options.position } : {}),
      ...(options.size !== undefined ? { size: options.size } : {})
    })
  }
  const candidateBytes = applySectionChanges(bytes, {
    record,
    recordId: newId,
    parentId,
    ...(options.insertAfterId !== undefined ? { insertAfterId: options.insertAfterId } : {})
  })
  return {
    bytes: candidateBytes,
    kind: options.kind,
    surface: options.surface,
    parentId,
    newId,
    donorSource: donor.sourceSnapshot,
    donorKind: donor.kind,
    donorSelfId: donor.selfId,
    donorParentId: donor.parentId,
    donorSurface,
    ...(fallback ? { donorFallback: true } : {}),
    ...(options.insertAfterId !== undefined ? { insertAfterId: options.insertAfterId } : {})
  }
}

/** 便捷默认：--on 缺省 = 默认布局（按 ID 定位，不按名字） */
export function defaultCreateSurface(): CreateSurface {
  return { kind: 'layout', layoutId: DEFAULT_LAYOUT_ID }
}

export interface CreateLayoutOptions {
  /** 布局名（缺省「自定义布局」；与现布局重名自动加 _1/_2…，编辑器去重模式轮1/2） */
  name?: string
  /** 布局 ID（缺省=尾部连续段首；克隆成员 ID 依序 +1..+N） */
  id?: number
}

export interface CreateLayoutResult {
  /** 整文件候选字节（--output 只读） */
  bytes: Uint8Array
  kind: 'layout'
  name: string
  layoutId: number
  /** 新布局 f503 成员 = 克隆的官方预置记录 ID（编辑器克隆序） */
  memberIds: number[]
  /** 被克隆的默认布局官方预置记录数（编辑器=克隆官方预置全集，实例/模板不克隆） */
  officialsCount: number
}

/**
 * 连续 ID 段分配（布局+克隆族专用；轮1/2 双样本：编辑器=当前最大记录 ID+1 起连续）。
 * 仅布局克隆使用此尾段规则；普通单控件仍走 allocateControlId 空洞避让。
 */
function allocateConsecutiveRun(parsed: ParsedRoot9, count: number, layoutId?: number): number[] {
  const used = collectUsedControlIds(parsed)
  const start = layoutId ?? (used.size === 0 ? 1073741843 : Math.max(...used) + 1)
  if (!Number.isSafeInteger(start) || start < 0) {
    throw new Error('[error] 布局 ID 段起点非法')
  }
  const ids: number[] = []
  for (let i = 0; i < count; i++) {
    const id = start + i
    if (used.has(id)) {
      throw new Error(`[error] 布局克隆 ID 段与现存冲突: ${id}（可 --id 指定空闲起点）`)
    }
    ids.push(id)
  }
  return ids
}

/**
 * 新建自定义布局候选 = 克隆默认布局「官方预置全集」（轮1/2 双样本 CONFIRMED）：
 *   - 新 layout 记录 = 默认布局记录字节克隆（f501/自引用/成员列表重映射 + 名字替换）；
 *   - 官方预置成员逐条克隆（自身 ID + f504 父布局重映射；名字/几何随克隆保留）；
 *   - 物理插入：整块插在 1839（最后官方预置）之后、1840（控件组库容器）之前——
 *     布局记录在前、14 克隆按成员序（轮1/2 after 快照取证）；
 *   - 顶层索引：新布局 ID 插到 1840 之前（索引按创建序，1825,1989,2004,1840…）；
 *   - 实例/模板成员不克隆（自定义布局=官方预置全集，轮1/2 证据）。
 * 只读：返回整文件候选字节，不写盘。
 */
export function createLayoutCandidate(
  bytes: Uint8Array,
  options: CreateLayoutOptions = {}
): CreateLayoutResult {
  const parsed = parseRoot9(bytes)
  const defaultLayout = parsed.recordsById.get(DEFAULT_LAYOUT_ID)
  if (!defaultLayout || defaultLayout.kind !== 'layout') {
    throw new Error(`[error] 默认布局 ${DEFAULT_LAYOUT_ID} 不存在或非布局记录`)
  }
  const memberIds = extractMemberIds(defaultLayout.fields)
  const officials = memberIds
    .map((id) => parsed.recordsById.get(id))
    .filter(
      (record): record is UiRecordMeta =>
        record !== undefined && record.kind === 'official' && record.parentId === DEFAULT_LAYOUT_ID
    )
  if (officials.length === 0) {
    throw new Error('[error] 默认布局无官方预置成员可克隆（克隆语义不成立）')
  }
  // 名字去重（编辑器模式：已存在则追加 _1/_2…，轮2 样本 自定义布局_1）
  const baseName = options.name ?? '自定义布局'
  const layoutNames = new Set(
    parsed.records.filter((r) => r.kind === 'layout').map((r) => recordNameOf(r.fields, r.raw))
  )
  let name = baseName
  let suffix = 1
  while (layoutNames.has(name)) {
    name = `${baseName}_${suffix}`
    suffix += 1
  }
  // ID 段：布局 + N 克隆（连续，轮1/2 编辑器行为）
  const ids = allocateConsecutiveRun(parsed, 1 + officials.length, options.id)
  const layoutId = ids[0]
  const cloneIds = ids.slice(1)
  // 1) 布局记录克隆：自身 ID 重映射 + 成员表改写为克隆 ID（官方预置全集；非官方成员
  //    （实例/模板，如轮5+ 默认布局里的实例按钮）不克隆——实例复制属模板化语义（波2），
  //    无编辑器样本不猜，见 ui/types.ts 口径与票据 open-items）
  const layoutMap: Record<number, number> = {
    [DEFAULT_LAYOUT_ID]: layoutId
  }
  let layoutRecord = remapUiRecordVarints(defaultLayout.raw, layoutMap)
  layoutRecord = rewriteRecordMemberIds(layoutRecord, cloneIds)
  layoutRecord = setUiControlName(layoutRecord, name)
  // 2) 官方预置成员克隆：自身 ID + 父布局重映射
  const cloneRecords = officials.map((official, index) =>
    remapUiRecordVarints(official.raw, {
      [official.id]: cloneIds[index],
      [DEFAULT_LAYOUT_ID]: layoutId
    })
  )
  // 3) 物理插入 + 索引更新 + 整文件重建
  const block: WireField[] = [
    { number: 502, wire: 2, value: layoutRecord },
    ...cloneRecords.map((value) => ({ number: 502, wire: 2, value }))
  ]
  const candidateBytes = applyLayoutInsert(bytes, block, layoutId)
  return {
    bytes: candidateBytes,
    kind: 'layout',
    name,
    layoutId,
    memberIds: cloneIds,
    officialsCount: officials.length
  }
}

/** 记录成员表改写：把宿主记录的顶层 f503 packed 整体替换为 ids（布局克隆专用） */
function rewriteRecordMemberIds(recordRaw: Uint8Array, ids: readonly number[]): Uint8Array {
  const fields = parseWireMessage(recordRaw)
  if (!fields) throw new Error('[error] 布局记录解析失败')
  const members = fields.find((f) => f.number === 503 && f.wire === 2)
  if (!members) throw new Error('[error] 布局记录缺少 f503 成员列表')
  members.value = encodePackedVarints(ids)
  return emitWireMessage(fields)
}

/** 低层装配：整块插到 1840 之前 + 顶层索引插入 layoutId（1840 之前）+ 整文件重建 */
function applyLayoutInsert(
  bytes: Uint8Array,
  block: WireField[],
  layoutId: number
): Uint8Array {
  const top = parseWireMessage(bytes.subarray(20, bytes.length - 4))
  if (!top) throw new Error('[error] malformed GIL payload')
  const root9 = top.find((f) => f.number === 9 && f.wire === 2)
  if (!root9) throw new Error('[error] root9 section missing')
  const section = parseWireMessage(root9.value as Uint8Array)
  if (!section) throw new Error('[error] invalid root 9 section')
  const anchor = section.findIndex((f) => ownIdOf(f) === LIBRARY_CONTAINER_ID)
  if (anchor < 0) {
    throw new Error(`[error] 控件组库容器 ${LIBRARY_CONTAINER_ID} 不存在（布局块锚点缺失）`)
  }
  section.splice(anchor, 0, ...block)
  // 顶层索引：layoutId 插到 1840 之前（索引创建序 1825,1989,2004,1840…）
  const indexField = section.find((f) => f.number === 501 && f.wire === 2)
  if (!indexField) throw new Error('[error] root9 顶层索引缺失')
  const indexIds = packedVarints(indexField.value as Uint8Array)
  const at = indexIds.indexOf(LIBRARY_CONTAINER_ID)
  if (at < 0) {
    throw new Error(`[error] 顶层索引缺 1840（无法定位布局插入位）`)
  }
  indexIds.splice(at, 0, layoutId)
  indexField.value = encodePackedVarints(indexIds)
  root9.value = emitWireMessage(section)
  return buildFile(emitWireMessage(top), {
    schema: readUint32BE(bytes, 4),
    headTag: readUint32BE(bytes, 8),
    fileType: readUint32BE(bytes, 12),
    tailTag: readUint32BE(bytes, bytes.length - 4)
  })
}

export { DEFAULT_LAYOUT_ID }

/** 插入单条记录（不追加父成员；父子关系已在记录字节内）。与 applySectionChanges 同一保真重建口径。 */
function insertRecordOnly(bytes: Uint8Array, record: Uint8Array, afterRecordId?: number): Uint8Array {
  const top = parseWireMessage(bytes.subarray(20, bytes.length - 4))
  if (!top) throw new Error('[error] malformed GIL payload')
  const root9 = top.find((f) => f.number === 9 && f.wire === 2)
  if (!root9) throw new Error('[error] root9 section missing')
  const section = parseWireMessage(root9.value as Uint8Array)
  if (!section) throw new Error('[error] invalid root 9 section')
  let at = section.length
  if (afterRecordId !== undefined) {
    const index = section.findIndex((f) => ownIdOf(f) === afterRecordId)
    if (index >= 0) at = index + 1
  }
  section.splice(at, 0, { number: 502, wire: 2, value: record })
  root9.value = emitWireMessage(section)
  return buildFile(emitWireMessage(top), {
    schema: readUint32BE(bytes, 4),
    headTag: readUint32BE(bytes, 8),
    fileType: readUint32BE(bytes, 12),
    tailTag: readUint32BE(bytes, bytes.length - 4)
  })
}

export interface CreateClientContainerOptions {
  /** 只支持布局面（官方约束：客户端控件只能活在容器画布或模板里；容器本体挂布局） */
  surface: { kind: 'layout'; layoutId: number }
  /** 容器组 ID（缺省=避让分配） */
  id?: number
  /** 容器组名称（缺省沿用 donor 的「客户端控件容器」） */
  name?: string
}

export interface CreateClientContainerResult {
  bytes: Uint8Array
  surface: { kind: 'layout'; layoutId: number }
  /** 布局 ID（= 容器组 f504 父引用） */
  parentId: number
  containerId: number
  childId: number
  donorSource: string
  donorSelfId: number
  donorChildId: number
}

/**
 * 生成「空客户端控件容器」候选（两件套）。
 * 依据（ui-controls.md「布局挂载」节，2026-10-23 hl 差分 CONFIRMED）：
 *   一次编辑器操作 = 容器组记录（f502=23 isGroup，f504=布局，children 指子）+ 容器节点子控件（f502=86）
 *   + 布局 f503 成员列表尾部追加容器组 ID。
 * 只读：返回整文件候选字节，不写盘。
 */
export function createClientContainerCandidate(
  bytes: Uint8Array,
  options: CreateClientContainerOptions
): CreateClientContainerResult {
  const parsed = parseRoot9(bytes)
  const layoutId = options.surface.layoutId
  if (options.surface.kind !== 'layout') throw new Error('[error] 客户端控件容器只支持布局面')
  const layout = parsed.recordsById.get(layoutId)
  if (!layout || layout.kind !== 'layout') throw new Error(`[error] ${layoutId} 不是布局记录`)
  if (!hasMemberList(parsed, layoutId)) throw new Error(`[error] 布局 ${layoutId} 缺少 f503 成员列表`)

  const containerId = allocateControlId(parsed, options.id)
  const used = collectUsedControlIds(parsed)
  used.add(containerId)
  let childId = containerId + 1
  while (used.has(childId)) childId += 1

  const groupDonor = CLIENT_CONTAINER_GROUP_DONOR
  const childDonor = CLIENT_CONTAINER_CHILD_DONOR
  const groupMap: Record<number, number> = {
    [groupDonor.selfId]: containerId,
    [groupDonor.childId]: childId,
    [groupDonor.parentId]: layoutId
  }
  let groupRecord: Uint8Array = remapUiRecordVarints(
    Buffer.from(groupDonor.hex, 'hex'),
    groupMap
  )
  if (options.name !== undefined) groupRecord = setUiControlName(groupRecord, options.name)
  const childRecord: Uint8Array = remapUiRecordVarints(
    Buffer.from(childDonor.hex, 'hex'),
    { [childDonor.selfId]: childId }
  )

  const withGroup = applySectionChanges(bytes, {
    record: groupRecord,
    recordId: containerId,
    parentId: layoutId
  })
  const withChild = insertRecordOnly(withGroup, childRecord, containerId)
  return {
    bytes: withChild,
    surface: options.surface,
    parentId: layoutId,
    containerId,
    childId,
    donorSource: groupDonor.sourceSnapshot,
    donorSelfId: groupDonor.selfId,
    donorChildId: groupDonor.childId
  }
}

/** 客户端控件 kind 集合（create 支持面；判别见 client-kinds.ts） */
export const CLIENT_CONTROL_KINDS = [
  'client-textbox',
  'client-cursor-area',
  'client-reference',
  'client-grid',
  'client-button',
  'client-textwindow',
  'client-keyhint',
  'client-image',
  'client-animation',
  'client-fullscreen-animation'
] as const

export type ClientControlKind = (typeof CLIENT_CONTROL_KINDS)[number]

/**
 * 把子控件挂到父记录的 children 列表（客户端树，形态两分）：
 * - 容器节点：children = **顶层 f503 packed varints**（hl 1880 实测：b9..c2 连续 ID）
 * - 容器组：children = f505 块内 f503{f73{f501=<child>}}（hl 1891 实测）
 * 列表缺失时（空容器节点）在 f501/f502 之后插入顶层 f503 packed 字段。
 */
function appendClientChild(bytes: Uint8Array, parentId: number, childId: number): Uint8Array {
  const top = parseWireMessage(bytes.subarray(20, bytes.length - 4))
  if (!top) throw new Error('[error] malformed GIL payload')
  const root9 = top.find((f) => f.number === 9 && f.wire === 2)
  if (!root9) throw new Error('[error] root9 section missing')
  const section = parseWireMessage(root9.value as Uint8Array)
  if (!section) throw new Error('[error] invalid root 9 section')
  const index = section.findIndex((f) => ownIdOf(f) === parentId)
  if (index < 0) throw new Error(`[error] 父记录不存在: ${parentId}`)
  const parentFields = parseWireMessage(section[index].value as Uint8Array)
  if (!parentFields) throw new Error(`[error] 父记录解析失败: ${parentId}`)

  const asPackedList = (value: Uint8Array): number[] | undefined => {
    try {
      const ids = packedVarints(value)
      return ids.length > 0 && ids.every((id) => id >= 1073741824) ? ids : undefined
    } catch {
      return undefined
    }
  }

  // 1) 顶层 f503 packed（容器节点）
  const packed = parentFields.find((f) => f.number === 503 && f.wire === 2)
  const packedIds = packed ? asPackedList(packed.value as Uint8Array) : undefined
  if (packed && packedIds) {
    if (packedIds.includes(childId)) throw new Error(`[error] 父记录已含子 ${childId}`)
    packedIds.push(childId)
    packed.value = encodePackedVarints(packedIds)
  } else {
    // 2) f505 块内 f503{f73{f501}}（容器组）
    let appended = false
    for (const field of parentFields) {
      if (field.number !== 505 || field.wire !== 2) continue
      const block = parseWireMessage(field.value as Uint8Array)
      const list = block?.find((f) => f.number === 503 && f.wire === 2)
      if (!block || !list) continue
      const listFields = parseWireMessage(list.value as Uint8Array)
      if (!listFields || !listFields.some((f) => f.number === 73 && f.wire === 2)) continue
      listFields.push({
        number: 73,
        wire: 2,
        value: emitWireMessage([{ number: 501, wire: 0, value: childId }])
      })
      list.value = emitWireMessage(listFields)
      field.value = emitWireMessage(block)
      appended = true
      break
    }
    if (!appended) {
      // 3) 空父记录：插入顶层 f503 packed（位置 = f502 之后，与 hl 1880 字段次序一致）
      const insertAt = Math.max(1, parentFields.findIndex((f) => f.number === 502) + 1)
      parentFields.splice(insertAt, 0, {
        number: 503,
        wire: 2,
        value: encodePackedVarints([childId])
      })
    }
  }
  section[index].value = emitWireMessage(parentFields)
  root9.value = emitWireMessage(section)
  return buildFile(emitWireMessage(top), {
    schema: readUint32BE(bytes, 4),
    headTag: readUint32BE(bytes, 8),
    fileType: readUint32BE(bytes, 12),
    tailTag: readUint32BE(bytes, bytes.length - 4)
  })
}

export interface CreateClientControlOptions {
  kind: ClientControlKind
  /** 目标容器（容器节点；容器组另走 create --type client-container） */
  surface: { kind: 'container'; containerId: number }
  id?: number
  name?: string
}

export interface CreateClientControlResult {
  bytes: Uint8Array
  kind: ClientControlKind
  surface: { kind: 'container'; containerId: number }
  parentId: number
  newId: number
  donorSource: string
  donorSelfId: number
  donorParentId: number
}

/**
 * 生成客户端控件候选（单控件，挂到指定容器节点）。
 * 依据（ui-controls.md + hl 差分）：控件记录 f504=父容器节点；父容器节点顶层 f503 packed 追加子 ID。
 * 只读：返回整文件候选字节，不写盘。
 */
export function createClientControlCandidate(
  bytes: Uint8Array,
  options: CreateClientControlOptions
): CreateClientControlResult {
  const donor = CLIENT_CONTROL_DONORS.find((item) => item.kind === options.kind)
  if (!donor) throw new Error(`[error] 无客户端控件 donor: ${options.kind}`)
  const parsed = parseRoot9(bytes)
  const parentId = options.surface.containerId
  const parent = parsed.recordsById.get(parentId)
  if (!parent) throw new Error(`[error] 容器不存在: ${parentId}`)
  if (parent.kind !== 'client-container-node' && parent.kind !== 'client-container') {
    throw new Error(`[error] ${parentId} 不是客户端容器（kind=${parent.kind}）`)
  }
  const newId = allocateControlId(parsed, options.id)
  const map: Record<number, number> = { [donor.selfId]: newId }
  if (donor.parentId !== parentId) map[donor.parentId] = parentId
  let record: Uint8Array = remapUiRecordVarints(Buffer.from(donor.hex, 'hex'), map)
  if (options.name !== undefined) record = setUiControlName(record, options.name)
  const withRecord = insertRecordOnly(bytes, record)
  const withChild = appendClientChild(withRecord, parentId, newId)
  return {
    bytes: withChild,
    kind: options.kind,
    surface: options.surface,
    parentId,
    newId,
    donorSource: '1073741834.hl-v1-empty-container.gil',
    donorSelfId: donor.selfId,
    donorParentId: donor.parentId
  }
}
