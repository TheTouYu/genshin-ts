/**
 * ui/src/tab.ts — 页签体系命令引擎（票10 · 轮29/30/36-46/66 donor 驱动）
 *
 * 范围（DESIGN §3.5 L4 tab 面 + mappings §4.1）：
 *   - createTabCandidate：悬浮页容器面新建页签（轮29 donor 克隆；tab 仅容器面合法）；
 *   - tabPageAddCandidate：页面项追加（t47 内联扩展，无新记录；默认 页签项_N/页签文本；
 *     新页插在列表前部（轮30 证据），序号 f505=max+1）；
 *   - tabPageRenameCandidate：页面项改名/改文本（名字=entry.f501.f501；文本=
 *     entry.f502.f503.f502.f13.f501——轮29/30 实读）；
 *   - tabPageDefaultCandidate：默认选择（f40 尾部 f502 哨兵 2^56-1 → 1-based 序号；
 *     轮36/66。清默认回哨兵无样本 → fail-closed）；
 *   - tabPageServerEventCandidate：返回服务器事件开关（名字容器内 f504=1 增删 ±3B；
 *     轮37/38）；
 *   - tabStateBlockCandidate：容器/控件状态设置（entry.f503/f504 块 = [目标 entry 列表]
 *     + 尾部启用标记；entry 内 f502=1 = 隐藏；轮39-46）。
 *
 * 嵌套区手术一律走 wire-safe 大值安全层（哨兵/控件 ID 5 字节 varint 精确保留）。
 * 插入位规则：页签=父容器簇物理末端（轮29）。
 */

import { remapUiRecordVarints, setUiControlName } from '../../src/cli/gil_ui.js'
import { allocateControlId, ownerFloatingPageId } from './create.js'
import { tabDonor } from './tab-donors.js'
import { extractContainerRefs, extractMemberIds, parseRoot9 } from './record.js'
import {
  appendMemberId,
  clusterEndId,
  insertRecords,
  withSection,
  ownIdOf
} from './section-ops.js'
import { emitSafe, parseSafe, safeNum, s0, s2, type SafeField } from './wire-safe.js'

const DEFAULT_SELECTION_SENTINEL = 18446744073709551615n // ff×9 01（2^64-1，10B canonical；轮35 实读）

// ============ 1. 新建页签（轮29） ============

export interface TabCreateOptions {
  /** 目标悬浮页容器 ID（tab 仅容器面合法；DESIGN §1.2 placement） */
  containerId: number
  /** 新页签 ID（缺省=避让扫描分配） */
  id?: number
  name?: string
  position?: readonly [number, number]
  size?: readonly [number, number]
  /** 物理插入锚点覆盖（缺省=父容器簇物理末端，轮29 规则） */
  insertAfterId?: number
}

export interface TabCreateResult {
  bytes: Uint8Array
  tabId: number
  containerId: number
  pageCount: number
}

export function createTabCandidate(sourceBytes: Uint8Array, options: TabCreateOptions): TabCreateResult {
  const parsed = parseRoot9(sourceBytes)
  const container = parsed.recordsById.get(options.containerId)
  if (!container) throw new Error(`[error] 容器不存在: ${options.containerId}`)
  if (ownerFloatingPageId(parsed, options.containerId) === undefined) {
    throw new Error(`[error] 容器 ${options.containerId} 不属于任何悬浮页（tab 仅可放置于悬浮页容器）`)
  }
  const tabId = allocateControlId(parsed, options.id)
  const donor = tabDonor('tab-create')
  let record = remapUiRecordVarints(Buffer.from(donor.hex, 'hex'), {
    [donor.selfId]: tabId,
    [donor.parentId!]: options.containerId
  })
  if (options.name !== undefined) record = setUiControlName(record, options.name)
  let pageCount = 1
  const bytes = withSection(sourceBytes, (section, sectionParsed) => {
    appendMemberId(section, options.containerId, tabId)
    const anchor = options.insertAfterId ?? clusterEndId(sectionParsed, options.containerId)
    insertRecords(section, [record], anchor)
    const donorRef = loadTabList(record, tabId)
    pageCount = donorRef.f40m.filter((f) => f.number === 501).length
  })
  return { bytes, tabId, containerId: options.containerId, pageCount }
}

// ============ t47 安全层定位（记录 → comp47 → f503 → f40 页面列表） ============

function loadTabList(
  recordRaw: Uint8Array,
  tabId: number
): {
  recordFields: SafeField[]
  compSlot: SafeField
  comp: SafeField[]
  f503: SafeField
  f503m: SafeField[]
  f40: SafeField
  f40m: SafeField[]
} {
  const recordFields = parseSafe(recordRaw)
  if (!recordFields) throw new Error(`[error] 页签记录解析失败: ${tabId}`)
  let compSlot: SafeField | undefined
  let comp: SafeField[] | undefined
  for (const f of recordFields) {
    if (f.number !== 505 || f.wire !== 2) continue
    const inner = parseSafe(f.value as Uint8Array)
    if (inner && safeNum(inner, 502) === 47) {
      compSlot = f
      comp = inner
      break
    }
  }
  if (!compSlot || !comp) throw new Error(`[error] 页签 ${tabId} 缺 t47 组件——fail-closed`)
  const f503 = comp.find((f) => f.number === 503 && f.wire === 2)
  const f503m = f503 ? parseSafe(f503.value as Uint8Array) : undefined
  const f40 = f503m?.find((f) => f.number === 40 && f.wire === 2)
  const f40m = f40 ? parseSafe(f40.value as Uint8Array) : undefined
  if (!f503 || !f503m || !f40 || !f40m) {
    throw new Error(`[error] 页签 ${tabId} t47 页面列表缺失（f503.f40）——fail-closed`)
  }
  return { recordFields, compSlot, comp, f503, f503m, f40, f40m }
}

/** 逐层回发：entry → f40 → f503 → comp → 记录字节 */
function emitRecordFromList(ref: ReturnType<typeof loadTabList>): Uint8Array {
  ref.f40.value = emitSafe(ref.f40m)
  ref.f503.value = emitSafe(ref.f503m)
  ref.compSlot.value = emitSafe(ref.comp)
  return emitSafe(ref.recordFields)
}

/** 定位页面项（按 f505 序号 1-based；返回其 f501 字段与解析内容） */
function findPageEntry(
  f40m: readonly SafeField[],
  page: number
): { entryField: SafeField; entry: SafeField[] } {
  for (const f of f40m) {
    if (f.number !== 501 || f.wire !== 2) continue
    const entry = parseSafe(f.value as Uint8Array)
    if (entry && safeNum(entry, 505) === page) return { entryField: f, entry }
  }
  throw new Error(`[error] 页面项 #${page} 不存在（f505 序号未命中）——fail-closed`)
}

function withTabRecord(
  sourceBytes: Uint8Array,
  tabId: number,
  mutate: (ref: ReturnType<typeof loadTabList>) => void
): Uint8Array {
  return withSection(sourceBytes, (section) => {
    const field = section.find((f) => ownIdOf(f) === tabId)
    if (!field) throw new Error(`[error] 页签记录不存在: ${tabId}`)
    const ref = loadTabList(field.value as Uint8Array, tabId)
    mutate(ref)
    field.value = emitRecordFromList(ref)
  })
}

function requireTab(parsed: ReturnType<typeof parseRoot9>, tabId: number) {
  const tab = parsed.recordsById.get(tabId)
  if (!tab) throw new Error(`[error] 页签不存在: ${tabId}`)
  if (tab.kind !== 'tab') throw new Error(`[error] ${tabId} 不是页签记录（kind=${tab.kind}）`)
  return tab
}

// ============ 2. 页面项追加（轮30） ============

export interface TabPageAddResult {
  bytes: Uint8Array
  tabId: number
  page: number
  name: string
}

/** donor（轮29 默认单页面项）的默认条目模板：名字 utf8 按页号替换 */
function defaultEntryTemplate(pageNo: number): Uint8Array {
  const donor = tabDonor('tab-create')
  const recordFields = parseSafe(Buffer.from(donor.hex, 'hex'))
  if (!recordFields) throw new Error('[error] tab donor 解析失败')
  const ref = (() => {
    for (const f of recordFields) {
      if (f.number !== 505 || f.wire !== 2) continue
      const inner = parseSafe(f.value as Uint8Array)
      if (inner && safeNum(inner, 502) === 47) {
        const f503 = inner.find((x) => x.number === 503 && x.wire === 2)!
        const f503m = parseSafe(f503.value as Uint8Array)!
        const f40 = f503m.find((x) => x.number === 40 && x.wire === 2)!
        return { f503, f503m, f40 }
      }
    }
    throw new Error('[error] tab donor 缺 t47——fail-closed')
  })()
  const f40m = parseSafe(ref.f40.value as Uint8Array)!
  const firstEntry = f40m.find((f) => f.number === 501 && f.wire === 2)
  if (!firstEntry) throw new Error('[error] tab donor 默认页面项缺失——fail-closed')
  const entry = parseSafe(firstEntry.value as Uint8Array)!
  // 名字容器 f501.f501 = 页签项_N
  const nameContainerField = entry.find((f) => f.number === 501 && f.wire === 2)!
  const nameContainer = parseSafe(nameContainerField.value as Uint8Array)!
  const nameField = nameContainer.find((f) => f.number === 501 && f.wire === 2)!
  const name = `页签项_${pageNo}`
  nameField.value = new Uint8Array(Buffer.from(name, 'utf8'))
  nameContainerField.value = emitSafe(nameContainer)
  entry.find((f) => f.number === 505)!.value = pageNo
  return emitSafe(entry)
}

export function tabPageAddCandidate(sourceBytes: Uint8Array, options: { tabId: number }): TabPageAddResult {
  const parsed = parseRoot9(sourceBytes)
  requireTab(parsed, options.tabId)
  let pageNo = 1
  let name = ''
  const bytes = withTabRecord(sourceBytes, options.tabId, (ref) => {
    const ordinals = ref.f40m
      .filter((f) => f.number === 501 && f.wire === 2)
      .map((f) => safeNum(parseSafe(f.value as Uint8Array) ?? [], 505) ?? 0)
    pageNo = Math.max(0, ...ordinals) + 1
    name = `页签项_${pageNo}`
    const entryBytes = defaultEntryTemplate(pageNo)
    // 新页插在列表前部（轮30 证据：页签2 在页签1 之前）
    const firstEntryAt = ref.f40m.findIndex((f) => f.number === 501 && f.wire === 2)
    ref.f40m.splice(firstEntryAt < 0 ? 0 : firstEntryAt, 0, s2(501, entryBytes))
  })
  return { bytes, tabId: options.tabId, page: pageNo, name }
}

// ============ 3. 页面项改名/改文本（轮30） ============

export interface TabPageRenameOptions {
  tabId: number
  page: number
  name?: string
  text?: string
}

export function tabPageRenameCandidate(
  sourceBytes: Uint8Array,
  options: TabPageRenameOptions
): Uint8Array {
  const parsed = parseRoot9(sourceBytes)
  requireTab(parsed, options.tabId)
  if (options.name === undefined && options.text === undefined) {
    throw new Error('[error] rename 需要至少 --name 或 --text')
  }
  return withTabRecord(sourceBytes, options.tabId, (ref) => {
    const { entryField, entry } = findPageEntry(ref.f40m, options.page)
    if (options.name !== undefined) {
      const nameContainerField = entry.find((f) => f.number === 501 && f.wire === 2)!
      const nameContainer = parseSafe(nameContainerField.value as Uint8Array)!
      const nameField = nameContainer.find((f) => f.number === 501 && f.wire === 2)!
      nameField.value = new Uint8Array(Buffer.from(options.name, 'utf8'))
      nameContainerField.value = emitSafe(nameContainer)
    }
    if (options.text !== undefined) {
      const textConfigField = entry.find((f) => f.number === 502 && f.wire === 2)!
      const textConfig = parseSafe(textConfigField.value as Uint8Array)!
      const f503 = textConfig.find((f) => f.number === 503 && f.wire === 2)!
      const f503m = parseSafe(f503.value as Uint8Array)!
      const f502 = f503m.find((f) => f.number === 502 && f.wire === 2)!
      const f502m = parseSafe(f502.value as Uint8Array)!
      const f13 = f502m.find((f) => f.number === 13 && f.wire === 2)!
      const f13m = parseSafe(f13.value as Uint8Array)!
      const textField = f13m.find((f) => f.number === 501 && f.wire === 2)!
      textField.value = new Uint8Array(Buffer.from(options.text, 'utf8'))
      f13.value = emitSafe(f13m)
      f502.value = emitSafe(f502m)
      f503.value = emitSafe(f503m)
      textConfigField.value = emitSafe(textConfig)
    }
    entryField.value = emitSafe(entry)
  })
}

// ============ 4. 默认选择（轮36/66） ============

export function tabPageDefaultCandidate(
  sourceBytes: Uint8Array,
  options: { tabId: number; page: number }
): Uint8Array {
  const parsed = parseRoot9(sourceBytes)
  requireTab(parsed, options.tabId)
  if (!Number.isSafeInteger(options.page) || options.page < 1) {
    throw new Error('[error] --page 须为正整数（1-based 页面序号）')
  }
  return withTabRecord(sourceBytes, options.tabId, (ref) => {
    findPageEntry(ref.f40m, options.page) // 序号必须存在
    const sentinelField = ref.f40m.find((f) => f.number === 502 && f.wire === 0)
    if (!sentinelField) {
      throw new Error('[error] 默认选择字段（f40 尾部 f502）缺失——fail-closed')
    }
    if (typeof sentinelField.value === 'bigint' && sentinelField.value !== DEFAULT_SELECTION_SENTINEL) {
      throw new Error('[error] 默认选择字段值异常（非哨兵大值）——fail-closed')
    }
    sentinelField.value = options.page
  })
}

// ============ 5. 返回服务器事件开关（轮37/38） ============

export function tabPageServerEventCandidate(
  sourceBytes: Uint8Array,
  options: { tabId: number; page: number; on: boolean }
): Uint8Array {
  const parsed = parseRoot9(sourceBytes)
  requireTab(parsed, options.tabId)
  return withTabRecord(sourceBytes, options.tabId, (ref) => {
    const { entryField, entry } = findPageEntry(ref.f40m, options.page)
    const nameContainerField = entry.find((f) => f.number === 501 && f.wire === 2)!
    const nameContainer = parseSafe(nameContainerField.value as Uint8Array)!
    const has = nameContainer.some((f) => f.number === 504 && f.wire === 0)
    if (options.on && !has) nameContainer.push(s0(504, 1))
    if (!options.on && has) {
      const at = nameContainer.findIndex((f) => f.number === 504 && f.wire === 0)
      nameContainer.splice(at, 1)
    }
    nameContainerField.value = emitSafe(nameContainer)
    entryField.value = emitSafe(entry)
  })
}

// ============ 6. 容器/控件状态设置（轮39-46） ============

export type TabStateBlock = 'container' | 'control'

export type TabStateOp =
  | { kind: 'upsert'; targetId: number; hidden: boolean }
  | { kind: 'remove'; targetId: number }
  | { kind: 'enable' }
  | { kind: 'disable' }

export interface TabStateOptions {
  tabId: number
  page: number
  block: TabStateBlock
  op: TabStateOp
}

/** 状态块字段号：entry.f503（容器状态）/ entry.f504（控件状态） */
function blockFieldNumber(block: TabStateBlock): number {
  return block === 'container' ? 503 : 504
}

export function tabStateBlockCandidate(
  sourceBytes: Uint8Array,
  options: TabStateOptions
): Uint8Array {
  const parsed = parseRoot9(sourceBytes)
  const tab = requireTab(parsed, options.tabId)
  const number = blockFieldNumber(options.block)
  // 分组序（轮46 铁证 [2085,2089,2097,2108]：entry 按宿主容器 t42 序分组、组内成员序）——
  // 控件状态按目标所属容器分组；容器状态按容器自身 t42 序
  const pageId = tab.parentId !== null ? ownerFloatingPageId(parsed, tab.parentId) : undefined
  const containers =
    pageId !== undefined ? extractContainerRefs(parsed.recordsById.get(pageId)!.fields) : []
  const groupKeyOf = (targetId: number): number => {
    if (options.block === 'container') return containers.indexOf(targetId)
    return containers.findIndex((cid) => {
      const rec = parsed.recordsById.get(cid)
      return rec !== undefined && extractMemberIds(rec.fields).includes(targetId)
    })
  }
  return withTabRecord(sourceBytes, options.tabId, (ref) => {
    const { entryField, entry } = findPageEntry(ref.f40m, options.page)
    const blockField = entry.find((f) => f.number === number && f.wire === 2)
    if (!blockField) {
      throw new Error(`[error] 页面项缺 f${number} 状态块字段——fail-closed`)
    }
    const payload = parseSafe(blockField.value as Uint8Array) ?? []
    applyStateOp(payload, options.op, groupKeyOf)
    blockField.value = emitSafe(payload)
    entryField.value = emitSafe(entry)
  })
}

/** 状态块操作：entry 列表（f501 = {f501: 目标ID, [f502:1=隐藏]}）+ 尾部 f502=1 启用标记 */
function applyStateOp(
  payload: SafeField[],
  op: TabStateOp,
  groupKeyOf: (targetId: number) => number
): void {
  if (op.kind === 'enable') {
    if (!payload.some((f) => f.number === 502 && f.wire === 0)) payload.push(s0(502, 1))
    return
  }
  if (op.kind === 'disable') {
    const at = payload.findIndex((f) => f.number === 502 && f.wire === 0)
    if (at >= 0) payload.splice(at, 1)
    return
  }
  const entryAt = (targetId: number): number =>
    payload.findIndex((f) => {
      if (f.number !== 501 || f.wire !== 2) return false
      const inner = parseSafe(f.value as Uint8Array)
      return inner !== undefined && safeNum(inner, 501) === targetId
    })
  const targetIndex = entryAt(op.targetId)
  if (op.kind === 'remove') {
    if (targetIndex >= 0) payload.splice(targetIndex, 1)
    return
  }
  // upsert：entry = {f501: 目标ID, [f502:1=隐藏]}；隐藏增删与轮40/46 对称
  if (targetIndex >= 0) {
    const inner = parseSafe(payload[targetIndex].value as Uint8Array)!
    const kept = inner.filter((f) => !(f.number === 502 && f.wire === 0))
    if (op.hidden) kept.push(s0(502, 1))
    payload[targetIndex].value = emitSafe(kept)
    return
  }
  // 新 entry 分组插入：同组末尾 / 首个更后组之前 / 标记前（标记恒为块尾）——轮46 序铁证
  const key = groupKeyOf(op.targetId)
  if (key < 0) {
    throw new Error(
      `[error] 状态目标 ${op.targetId} 不属于悬浮页任何容器（t42/成员未命中）——fail-closed`
    )
  }
  const markerAt = payload.findIndex((f) => f.number === 502 && f.wire === 0)
  let insertAt = markerAt < 0 ? payload.length : markerAt
  for (let i = 0; i < payload.length; i++) {
    const f = payload[i]
    if (f.number !== 501 || f.wire !== 2) continue
    const inner = parseSafe(f.value as Uint8Array)
    const otherId = inner !== undefined ? safeNum(inner, 501) : undefined
    if (otherId === undefined) continue
    const otherKey = groupKeyOf(otherId)
    if (otherKey > key) {
      insertAt = i
      break
    }
    if (otherKey === key) insertAt = i + 1
  }
  const entry = s2(501, emitSafe(op.hidden ? [s0(501, op.targetId), s0(502, 1)] : [s0(501, op.targetId)]))
  payload.splice(insertAt, 0, entry)
}
