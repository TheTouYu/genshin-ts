/**
 * ui/src/record.ts — root9 记录读取 + 类型判别 + 属性提取（票 04 list 语义层）
 *
 * wire 知识来源：.agents/skills/editor-incremental-gia-investigator/references/ui-controls.md
 * （按钮族 t50/52/54、输入框 type45、页签 t46-49/58 + kind 320001、队列 type76-79、
 *   容器 comps 11/43、悬浮页 t44 kind 330001、parent 上下文判别轮 64）。
 * 未知结构：unknown[] 标记 + fail-closed，不猜字节。
 */

import { listButtonStates, listPageVariables } from '../../src/cli/gil_ui.js'
import { clientKindOf } from './client-kinds.js'
import {
  collectWireTexts,
  collectWireVarints,
  parseWireMessage,
  type WireField
} from '../../src/cli/static_assembly/wire.js'
import { readVarint } from '../../src/injector/binary.js'
import { parseSafe, safeNum } from './wire-safe.js'
import {
  UI_KIND_REGISTRY,
  type UiGeometry,
  type UiKind,
  type UiRecordMeta,
  type UiRole
} from './types.js'

export type ParentContext =
  | 'layout'
  | 'library'
  | 'container'
  | 'group'
  | 'template'
  | 'none'
  | 'unknown'

export interface ParsedRoot9 {
  top: WireField[]
  section: WireField[]
  records: UiRecordMeta[]
  recordsById: Map<number, UiRecordMeta>
  indexIds: Set<number>
}

export const LIBRARY_CONTAINER_ID = 1073741840
export const DEFAULT_LAYOUT_ID = 1073741825
export const TAB_KIND = 320001
export const FLOATING_PAGE_KIND = 330001
export const FLOATING_PAGE_RICH_KIND = 330002

export function firstVarint(
  fields: readonly WireField[] | undefined,
  number: number
): number | undefined {
  const field = fields?.find((item) => item.number === number && item.wire === 0)
  return typeof field?.value === 'number' ? field.value : undefined
}

export function firstMessage(
  fields: readonly WireField[] | undefined,
  number: number
): WireField[] | undefined {
  const field = fields?.find((item) => item.number === number && item.wire === 2)
  if (!field) return undefined
  return parseWireMessage(field.value as Uint8Array)
}

export function allMessages(
  fields: readonly WireField[] | undefined,
  number: number
): WireField[][] {
  const out: WireField[][] = []
  for (const field of fields ?? []) {
    if (field.number !== number || field.wire !== 2) continue
    const sub = parseWireMessage(field.value as Uint8Array)
    if (sub) out.push(sub)
  }
  return out
}

export function allVarints(fields: readonly WireField[] | undefined, number: number): number[] {
  const out: number[] = []
  for (const field of fields ?? []) {
    if (field.number === number && field.wire === 0) out.push(field.value as number)
  }
  return out
}

export function packedVarints(data: Uint8Array): number[] {
  const out: number[] = []
  let offset = 0
  while (offset < data.length) {
    const item = readVarint(data, offset)
    if (!item) break
    out.push(item.value >>> 0)
    offset = item.next
  }
  return out
}

/** 收集记录的 f505 组件 type 码（f505[f502=type]） */
export function collectCompTypes(fields: readonly WireField[]): number[] {
  const types: number[] = []
  for (const field of fields) {
    if (field.number !== 505 || field.wire !== 2) continue
    const sub = parseWireMessage(field.value as Uint8Array)
    const type = sub?.find((x) => x.number === 502 && x.wire === 0)?.value
    if (typeof type === 'number') types.push(type)
  }
  return types
}

/** 收集记录 family type 码（顶层 f502 槽：layout=7/template=4/instance=3/official=5/asset=55/group=6） */
export function collectFamilyTypes(fields: readonly WireField[]): number[] {
  const types: number[] = []
  for (const field of fields) {
    if (field.number !== 502 || field.wire !== 2) continue
    const sub = parseWireMessage(field.value as Uint8Array)
    const type = sub?.find((x) => x.number === 502 && x.wire === 0)?.value
    if (typeof type === 'number') types.push(type)
  }
  return types
}

export function recordFamilyRole(fields: readonly WireField[]): UiRole {
  const types = collectFamilyTypes(fields)
  if (types.includes(4)) return 'template'
  if (types.includes(3)) return 'instance'
  if (types.includes(5)) return 'official'
  return 'unknown'
}

/** 记录名：优先 name 组件（f505 type15 → 12 → 501），容器名走文本回退 */
export function recordNameOf(fields: readonly WireField[] | undefined, raw?: Uint8Array): string {
  for (const f of fields ?? []) {
    if (f.number !== 505 || f.wire !== 2) continue
    const sub = parseWireMessage(f.value as Uint8Array)
    if (!sub) continue
    const type = sub.find((x) => x.number === 502 && x.wire === 0)?.value
    if (type !== 15) continue
    const t12 = sub.find((x) => x.number === 12 && x.wire === 2)
    const t12m = t12 ? parseWireMessage(t12.value as Uint8Array) : undefined
    const text = t12m?.find((x) => x.number === 501 && x.wire === 2)
    if (text) return new TextDecoder().decode(text.value as Uint8Array)
  }
  if (raw) {
    const texts = collectWireTexts(raw)
    for (const text of texts) {
      if (text === '固有容器' || text === '页面容器' || text === '交互页关闭按钮') return text
    }
    // 容器/组名不在 comp15 路径；取第一个可打印文本作为回退
    if (texts.length > 0) return texts[0]
  }
  return ''
}

export function kindOfRecord(
  familyTypes: readonly number[],
  compTypes: readonly number[],
  name: string,
  parentContext: ParentContext,
  scanVarints?: number[]
): UiKind {
  if (familyTypes.includes(7)) return 'layout'
  const clientKind = clientKindOf(compTypes)
  if (clientKind !== undefined) return clientKind
  if (compTypes.includes(44)) return 'floating-page'
  if (name.includes('交互页关闭按钮') || name.includes('关闭按钮')) return 'close-button'
  if (compTypes.includes(50) && compTypes.includes(52) && compTypes.includes(54)) {
    if (name.includes('交互按钮')) return 'interactive-button'
    if (name.includes('自定义开关')) return 'custom-switch'
    return 'custom-button'
  }
  if (compTypes.includes(45)) return 'input-box'
  if ([76, 77, 78, 79].some((type) => compTypes.includes(type))) return 'message-queue'
  if (
    compTypes.includes(46) &&
    compTypes.includes(47) &&
    compTypes.includes(48) &&
    compTypes.includes(49) &&
    compTypes.includes(58) &&
    (scanVarints?.includes(TAB_KIND) ?? true)
  ) {
    return 'tab'
  }
  if (compTypes.includes(11) && compTypes.includes(43)) return 'container'
  if (compTypes.includes(25)) {
    return parentContext === 'group' ? 'material-member' : 'textbox'
  }
  if (compTypes.includes(38)) {
    return parentContext === 'group' ? 'material-member' : 'image'
  }
  if (familyTypes.includes(55)) return 'asset'
  if (familyTypes.includes(6)) return 'asset-group'
  if (familyTypes.includes(4)) return 'template'
  if (familyTypes.includes(3)) return 'instance'
  if (familyTypes.includes(5)) return 'official'
  return 'unknown'
}

export function roleOfRecord(
  kind: UiKind,
  fields: readonly WireField[],
  parentId: number | null
): UiRole {
  if (kind === 'layout') return 'layout'
  if (kind === 'container' || kind === 'asset-group') return 'group'
  if (kind === 'material-group' || kind === 'style-group') return 'group'
  if (kind === 'material-member') return 'member'
  if (kind === 'message-item' || kind === 'tab-page') return 'internal'
  if (parentId === null && kind === 'template') return 'template'
  const family = recordFamilyRole(fields)
  if (family !== 'unknown') return family
  return 'unknown'
}

/** 从记录字段提取几何（t12 载体；取设备槽 0，槽间差异进 unknown） */
export function extractGeometry(
  fields: readonly WireField[],
  unknown: string[]
): UiGeometry | undefined {
  for (const f of fields) {
    if (f.number !== 505 || f.wire !== 2) continue
    const comp = parseWireMessage(f.value as Uint8Array)
    if (!comp) continue
    if (comp.find((x) => x.number === 502 && x.wire === 0)?.value !== 12) continue
    const f503 = comp.find((x) => x.number === 503 && x.wire === 2)
    const f503m = f503 ? parseWireMessage(f503.value as Uint8Array) : undefined
    const f13 = f503m?.find((x) => x.number === 13 && x.wire === 2)
    const f13m = f13 ? parseWireMessage(f13.value as Uint8Array) : undefined
    const f12 = f13m?.find((x) => x.number === 12 && x.wire === 2)
    const f12m = f12 ? parseWireMessage(f12.value as Uint8Array) : undefined
    const slots = (f12m ?? []).filter((x) => x.number === 501 && x.wire === 2)
    if (slots.length === 0) return undefined
    const decodeSlot = (
      slot: WireField
    ): { position?: [number, number]; size?: [number, number] } => {
      const slotm = parseWireMessage(slot.value as Uint8Array)
      const f502 = slotm?.find((x) => x.number === 502 && x.wire === 2)
      const f502m = f502 ? parseWireMessage(f502.value as Uint8Array) : undefined
      const pos = f502m?.find((x) => x.number === 504 && x.wire === 2)
      const size = f502m?.find((x) => x.number === 505 && x.wire === 2)
      const pair = (data: Uint8Array | undefined): [number, number] | undefined => {
        if (!data) return undefined
        const m = parseWireMessage(data)
        const x = m?.find((f) => f.number === 501 && f.wire === 5)
        const y = m?.find((f) => f.number === 502 && f.wire === 5)
        if (x && y) {
          return [
            Buffer.from(x.value as Uint8Array).readFloatLE(0),
            Buffer.from(y.value as Uint8Array).readFloatLE(0)
          ]
        }
        if (data.length >= 8) {
          return [Buffer.from(data).readFloatLE(0), Buffer.from(data).readFloatLE(4)]
        }
        return undefined
      }
      const decodedPos = pair(pos?.value as Uint8Array | undefined)
      return {
        position: decodedPos ? [decodedPos[0] + 800, decodedPos[1] + 450] : undefined,
        size: pair(size?.value as Uint8Array | undefined)
      }
    }
    const slotsDecoded = slots.map(decodeSlot)
    const first = slotsDecoded[0]
    const consistent = slotsDecoded.every(
      (slot) =>
        JSON.stringify(slot.position) === JSON.stringify(first.position) &&
        JSON.stringify(slot.size) === JSON.stringify(first.size)
    )
    if (!consistent) unknown.push('geometryDeviceSlotsDiffer(仅回显槽0)')
    const geometry: UiGeometry = { deviceSlots: slots.length, slotsConsistent: consistent }
    if (first.position) geometry.position = first.position
    if (first.size) geometry.size = first.size
    return geometry
  }
  return undefined
}

/** 通用文本配置 f19（t25 文本框 / type45 输入框共用）：字号/对齐/文本/颜色 */
export function extractTextConfig(
  componentFields: WireField[] | undefined,
  unknown: string[]
): Record<string, unknown> {
  if (!componentFields) return {}
  const f503 = componentFields.find((x) => x.number === 503 && x.wire === 2)
  const f503m = f503 ? parseWireMessage(f503.value as Uint8Array) : undefined
  const f19 = f503m?.find((x) => x.number === 19 && x.wire === 2)
  const f19m = f19 ? parseWireMessage(f19.value as Uint8Array) : undefined
  if (!f19m) return {}
  const props: Record<string, unknown> = {}
  const fontSize = firstVarint(f19m, 502)
  const align = firstVarint(f19m, 503)
  const color = firstVarint(f19m, 510)
  const textField = f19m.find((x) => x.number === 505 && x.wire === 2)
  const textM = textField ? parseWireMessage(textField.value as Uint8Array) : undefined
  const text = textM?.find((x) => x.number === 501 && x.wire === 2)
  if (text) props.text = new TextDecoder().decode(text.value as Uint8Array)
  if (fontSize !== undefined) props.fontSize = fontSize
  if (align !== undefined) props.align = align === 1 ? 'center' : align === 2 ? 'right' : `unknown:${align}`
  if (color !== undefined) props.color = argbToHex(color)
  const f62 = f19m.find((x) => x.number === 62 && x.wire === 2)
  if (f62) props.richImages = countRichImages(f62.value as Uint8Array)
  if (f19m.some((x) => x.number === 507)) props.hasTextVariant = true
  return props
}

function countRichImages(data: Uint8Array): number {
  const m = parseWireMessage(data)
  if (!m) return 1
  const inner = m.find((x) => x.number === 501 && x.wire === 2)
  const innerM = inner ? parseWireMessage(inner.value as Uint8Array) : undefined
  return innerM ? 1 : 1
}

export function argbToHex(argb: number): string {
  const rgb = argb & 0xffffff
  return `#${rgb.toString(16).padStart(6, '0').toUpperCase()}`
}

export function findComponent(
  fields: readonly WireField[],
  compType: number
): WireField[] | undefined {
  for (const f of fields) {
    if (f.number !== 505 || f.wire !== 2) continue
    const sub = parseWireMessage(f.value as Uint8Array)
    if (sub?.find((x) => x.number === 502 && x.wire === 0)?.value === compType) return sub
  }
  return undefined
}

export function extractQueueProps(
  fields: readonly WireField[],
  compTypes: readonly number[],
  unknown: string[]
): Record<string, unknown> {
  const props: Record<string, unknown> = {}
  const comp76 = findComponent(fields, 76)
  const f503 = comp76?.find((x) => x.number === 503 && x.wire === 2)
  const f503m = f503 ? parseWireMessage(f503.value as Uint8Array) : undefined
  const f68 = f503m?.find((x) => x.number === 68 && x.wire === 2)
  const f68m = f68 ? parseWireMessage(f68.value as Uint8Array) : undefined
  if (f68m) {
    const align = firstVarint(f68m, 506)
    const insertTail = firstVarint(f68m, 510)
    const timedShow = firstVarint(f68m, 511)
    const maxItems = firstVarint(f68m, 513)
    if (align !== undefined) props.align = align === 1 ? 'center' : align === 2 ? 'right' : `unknown:${align}`
    if (insertTail !== undefined) props.insertAt = 'tail'
    else props.insertAt = 'head'
    if (timedShow !== undefined) props.timedShow = true
    const seconds = f68m.find((x) => x.number === 512 && x.wire === 5)
    if (seconds) props.timedShowSeconds = Buffer.from(seconds.value as Uint8Array).readFloatLE(0)
    if (maxItems !== undefined) props.maxItems = maxItems
    if (f68m.some((x) => x.number === 509)) props.hasFlag509 = true
  } else if (comp76) {
    unknown.push('queue.type76.structure')
  }
  const comp77 = findComponent(fields, 77)
  if (comp77) props.styles = extractStyleEntries(comp77, unknown)
  else unknown.push('queue.type77.missing')
  const comp79 = findComponent(fields, 79)
  if (comp79) props.messages = extractMessageEntries(comp79, unknown)
  else unknown.push('queue.type79.missing')
  if (compTypes.includes(78)) unknown.push('queue.type78.undecoded(只读透传)')
  return props
}

export function extractStyleEntries(comp77: WireField[], unknown: string[]): unknown[] {
  // type77 真实结构（轮53/54 差分闭合）：
  //   f503 → f69(列表) → 条目(f501 重复) → 条目内 f501(名称/引用 49B) → f501(10B) → f4 = 素材组 ID
  const raw = comp77.find((x) => x.number === 503 && x.wire === 2)?.value as Uint8Array | undefined
  if (!raw) {
    unknown.push('queue.type77.empty')
    return []
  }
  const m = parseWireMessage(raw)
  if (!m) {
    unknown.push('queue.type77.packed')
    return []
  }
  const listField = m.find((x) => x.number === 69 && x.wire === 2)
  const listFields = parseWireMessage(listField?.value as Uint8Array)
  const entries = (listFields ?? []).filter((x) => x.wire === 2)
  if (entries.length === 0) {
    // 回退：老样本结构
    return m
      .filter((entry) => entry.wire === 2)
      .map((entry, index) => ({
        index: index + 1,
        refs: collectWireVarints(entry.value as Uint8Array)
      }))
  }
  return entries.map((entry, index) => {
    const fields = parseWireMessage(entry.value as Uint8Array) ?? []
    const nameField = fields.find((x) => x.number === 501 && x.wire === 2)
    const nameMsg = nameField ? parseWireMessage(nameField.value as Uint8Array) : undefined
    const refField = nameMsg?.find((x) => x.number === 501 && x.wire === 2)
    const refMsg = refField ? parseWireMessage(refField.value as Uint8Array) : undefined
    const groupId = refMsg?.find((x) => x.number === 4 && x.wire === 0)?.value
    const styleIndex = fields.find((x) => x.number === 505 && x.wire === 0)?.value
    const texts = collectWireTexts(entry.value as Uint8Array)
    return {
      index: index + 1,
      name: texts[0] ?? `样式_${index + 1}`,
      ...(typeof styleIndex === 'number' ? { styleIndex } : {}),
      ...(typeof groupId === 'number' ? { groupId } : {})
    }
  })
}

export function extractMessageEntries(comp79: WireField[], unknown: string[]): unknown[] {
  const raw = comp79.find((x) => x.number === 503 && x.wire === 2)?.value as Uint8Array | undefined
  if (!raw) return []
  const m = parseWireMessage(raw)
  if (!m) {
    unknown.push('queue.type79.undecoded')
    return []
  }
  // 轮61/62 闭合：type79.f503 → f71(消息项列表) → 条目(f501 重复)；
  // 条目内 f503 varint = 样式序号（1-based），f501 = 名称组件。
  const listField = m.find((x) => x.number === 71 && x.wire === 2)
  const listFields = listField ? parseWireMessage(listField.value as Uint8Array) : undefined
  const entries = (listFields ?? []).filter((x) => x.wire === 2)
  const source = entries.length > 0 ? entries : m.filter((x) => x.wire === 2)
  if (source.length === 0) return []
  return source.map((entry, index) => {
    const texts = collectWireTexts(entry.value as Uint8Array)
    const fields = parseWireMessage(entry.value as Uint8Array)
    const styleIndex = firstVarint(fields, 503)
    return {
      index: index + 1,
      name: texts[0] ?? `消息项_${index + 1}`,
      ...(typeof styleIndex === 'number' && styleIndex >= 1 && styleIndex <= 32
        ? { styleIndex }
        : {})
    }
  })
}

/** 页签 t47 页面项（票10 全解码：comp47.f503.f40 = 页面项列表 + 尾部默认选择 varint）。
 *  页面项 = {f501: 名字容器 {f501:名字,[f504:1=serverEvent]}, f502: 文本配置,
 *  f503: 容器状态块, f504: 控件状态块, f505: 序号, f506:1}；f40 尾部 f502 varint =
 *  默认选择（2^64-1 哨兵=未设，否则 1-based 序号；轮29/30/36/66 证据）。
 *  大值哨兵经共享 readVarint 会失真——默认选择读取用长度判别（≥5B varint=哨兵）。 */
export function extractTabPages(
  fields: readonly WireField[],
  unknown: string[]
): Record<string, unknown> {
  const comp47 = findComponent(fields, 47)
  if (!comp47) {
    unknown.push('tab.t47.missing')
    return { pageCount: 0 }
  }
  const raw = comp47.find((x) => x.number === 503 && x.wire === 2)?.value as Uint8Array | undefined
  if (!raw) return { pageCount: 0 }
  const m = parseWireMessage(raw)
  if (!m) {
    // group 编码区 → fail-closed，仅报未知
    unknown.push('tab.t47.groupEncoded(页名/配置未解码)')
    return { pageCount: unknownPageCount(raw) }
  }
  const f40 = m.find((x) => x.number === 40 && x.wire === 2)
  if (!f40) return { pageCount: 0 }
  const f40m = parseWireMessage(f40.value as Uint8Array)
  if (!f40m) return { pageCount: unknownPageCount(f40.value as Uint8Array) }
  const pageEntries = f40m.filter((x) => x.number === 501 && x.wire === 2)
  const pages = pageEntries.map((entry, index) => {
    const entryFields = parseWireMessage(entry.value as Uint8Array) ?? []
    const nameContainer = entryFields.find((x) => x.number === 501 && x.wire === 2)
    const nameContainerFields = nameContainer ? parseWireMessage(nameContainer.value as Uint8Array) : undefined
    const nameField = nameContainerFields?.find((x) => x.number === 501 && x.wire === 2)
    const serverEvent = nameContainerFields?.some((x) => x.number === 504 && x.wire === 0)
    const ordinal = firstVarint(entryFields, 505)
    return {
      index: typeof ordinal === 'number' && ordinal >= 1 ? ordinal : index + 1,
      name: nameField ? new TextDecoder().decode(nameField.value as Uint8Array) : `页面${index + 1}`,
      ...(serverEvent ? { serverEvent: true } : {})
    }
  })
  // 默认选择 = f40 尾部 f502 varint（哨兵大值=未设；轮66 闭合）。经 wire-safe 读：
  // 哨兵 2^64-1 为 BigInt（>2^53 → safeNum 返回 undefined）；小序号为 number
  const f40Safe = parseSafe(f40.value as Uint8Array)
  const defaultIndex = (() => {
    if (!f40Safe || !f40Safe.some((x) => x.number === 502 && x.wire === 0)) return undefined
    const v = safeNum(f40Safe, 502)
    return v !== undefined && v >= 1 && v <= pages.length ? v : undefined
  })()
  return { pageCount: pages.length, pages, ...(defaultIndex !== undefined ? { defaultIndex } : {}) }
}

function unknownPageCount(raw: Uint8Array): number {
  // group 编码不可解析时的保守估计：按 UTF-8 名字片段数
  const texts = collectWireTexts(raw)
  return texts.filter((t) => t.startsWith('页签') || t.startsWith('页面')).length
}

/** 悬浮页实体 t42 容器引用列表 */
export function extractContainerRefs(fields: readonly WireField[]): number[] {
  const comp42 = findComponent(fields, 42)
  if (!comp42) return []
  const f503 = comp42.find((x) => x.number === 503 && x.wire === 2)
  const f503m = f503 ? parseWireMessage(f503.value as Uint8Array) : undefined
  const f36 = f503m?.find((x) => x.number === 36 && x.wire === 2)
  const f36m = f36 ? parseWireMessage(f36.value as Uint8Array) : undefined
  const f501 = f36m?.find((x) => x.number === 501 && x.wire === 2)
  return f501 ? packedVarints(f501.value as Uint8Array) : []
}

/** 记录自己的 f503 成员列表（layout / 容器 / 素材组） */
export function extractMemberIds(fields: readonly WireField[]): number[] {
  const ids: number[] = []
  const f503 = fields.find((x) => x.number === 503 && x.wire === 2)
  if (f503) {
    try {
      ids.push(...packedVarints(f503.value as Uint8Array))
    } catch {
      // 非 packed 形态：忽略（fail-closed，不猜）
    }
  }
  // 客户端控件容器组：children 在 f505 块的 f503{f73{f501=<child>}}（hl 1891 实测，2026-10-23）
  for (const field of fields) {
    if (field.number !== 505 || field.wire !== 2) continue
    const block = parseWireMessage(field.value as Uint8Array)
    const list = block?.find((f) => f.number === 503 && f.wire === 2)
    if (!list) continue
    const entries = parseWireMessage(list.value as Uint8Array)
    for (const entry of entries ?? []) {
      if (entry.number !== 73 || entry.wire !== 2) continue
      const inner = parseWireMessage(entry.value as Uint8Array)
      const id = inner ? firstVarint(inner, 501) : undefined
      if (id !== undefined) ids.push(id)
    }
  }
  return ids
}

export function parseRoot9(bytes: Uint8Array): ParsedRoot9 {
  const top = parseWireMessage(bytes.slice(20, -4))
  if (!top) throw new Error('[error] malformed GIL payload')
  const root9 = top.find((f) => f.number === 9 && f.wire === 2)
  const section = root9 ? parseWireMessage(root9.value as Uint8Array) : undefined
  if (!section) throw new Error('[error] root9 section missing')
  const indexField = section.find((f) => f.number === 501 && f.wire === 2)
  const indexIds = new Set(indexField ? packedVarints(indexField.value as Uint8Array) : [])
  const records: UiRecordMeta[] = []
  const recordsById = new Map<number, UiRecordMeta>()
  for (const field of section) {
    if (field.number !== 502 || field.wire !== 2) continue
    const raw = field.value as Uint8Array
    const fields = parseWireMessage(raw)
    if (!fields) continue
    const id = firstVarint(fields, 501)
    if (id === undefined) continue
    const parentId = firstVarint(fields, 504) ?? null
    const name = recordNameOf(fields, raw)
    const compTypes = collectCompTypes(fields)
    const familyTypes = collectFamilyTypes(fields)
    const scanVarints = collectWireVarints(raw)
    const parentContext: ParentContext = parentId === null ? 'none' : 'unknown'
    const kind = kindOfRecord(familyTypes, compTypes, name, parentContext, scanVarints)
    const meta: UiRecordMeta = {
      id,
      raw,
      fields,
      compTypes,
      familyTypes,
      kind,
      role: roleOfRecord(kind, fields, parentId),
      name,
      parentId,
      indexed: indexIds.has(id)
    }
    records.push(meta)
    recordsById.set(id, meta)
  }
  return { top, section, records, recordsById, indexIds }
}

/** 读取按钮状态（复用 gil_ui 已闭合读取器） */
export function readButtonStates(bytes: Uint8Array, id: number) {
  return listButtonStates(bytes, id)
}

/** 读取悬浮页形式变量（复用 gil_ui） */
export function readPageVariables(bytes: Uint8Array, id?: number) {
  return listPageVariables(bytes, id)
}

export function kindLabel(kind: UiKind): string {
  return UI_KIND_REGISTRY[kind]?.label ?? kind
}
