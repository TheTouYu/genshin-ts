/**
 * ui/src/queue.ts — 消息队列样式/消息项/显示配置引擎（票10 · 轮53-62 donor 驱动）
 *
 * 范围（DESIGN §3.5 `queue style/message/props`；09 B1d backlog 闭合）：
 *   - queueStyleAddCandidate：type77.f503.f69 追加样式条目（{f501:素材块{f501:{f2:1,f3:8,
 *     f4:组ID}, f502:{}, f503:pos 对, f504:scale 对, f505:{}}, f505:序号, f506:"样式_N"}）
 *     + type55 素材组+成员创建（复用 material-member donor；轮53 图片/轮54 文本）；
 *   - queueMessageAddCandidate：type79.f503.f71 **前插**消息条目
 *     （{f501:{f501:名字}, f502:{}, f503:序号, f504:1}；序号=max+1；轮61 默认名 消息项_N）；
 *   - queueMessageStyleCandidate：消息条目名字容器内 f502 = 样式序号（轮62）；
 *   - queuePropsCandidate：t76.f503.f68 显示配置（f513 最大显示项/f511+f512 限时显示/
 *     f510 插入位置（存在=尾/删=头）/f506 内容对齐；轮55-58）。
 * f71 尾部 2^64-1 哨兵 → t79 手术一律 wire-safe 层。
 */

import { remapUiRecordVarints } from '../../src/cli/gil_ui.js'
import { queueMemberDonor } from './queue-donors.js'
import { allocateIds, patchTextMember } from './button-materials.js'
import { collectUsedControlIds } from './create.js'
import { parseRoot9 } from './record.js'
import { insertIntoIndex, insertRecords, ownIdOf, withSection } from './section-ops.js'
import { rewriteGroupMembers, setRecordNameLocal } from './material-member.js'
import { emitSafe, parseSafe, safeNum, s0, s2, type SafeField } from './wire-safe.js'

const DEFAULT_STYLE_GROUP_NAME = '默认状态素材组'

function requireQueue(parsed: ReturnType<typeof parseRoot9>, targetId: number) {
  const target = parsed.recordsById.get(targetId)
  if (!target) throw new Error(`[error] 目标控件不存在: ${targetId}`)
  if (!target.compTypes.includes(77)) {
    throw new Error(`[error] ${targetId} 不是消息队列（无 type77 样式组件）`)
  }
  return target
}

/** 定位队列 comp 右侧 f503（安全层）；返回逐层引用（comp 数组内含同一 f503 对象）供回发 */
function queueCompF503(recordFields: SafeField[], compType: number): {
  compSlot: SafeField
  comp: SafeField[]
  f503: SafeField
  f503m: SafeField[]
} {
  for (const f of recordFields) {
    if (f.number !== 505 || f.wire !== 2) continue
    const comp = parseSafe(f.value as Uint8Array)
    if (!comp || safeNum(comp, 502) !== compType) continue
    const f503 = comp.find((x) => x.number === 503 && x.wire === 2)
    const f503m = f503 ? parseSafe(f503.value as Uint8Array) : undefined
    if (!f503 || !f503m) throw new Error(`[error] 队列组件 t${compType} 缺右侧 f503——fail-closed`)
    return { compSlot: f, comp, f503, f503m }
  }
  throw new Error(`[error] 队列缺 t${compType} 组件——fail-closed`)
}

// ============ 1. 样式追加（轮53/54） ============

export interface QueueStyleAddOptions {
  targetId: number
  material: 'text' | 'image'
  text?: string
  color?: string
  fontSize?: number
  /** 显式 ID（重放对拍用）：组+成员连续对 */
  ids?: { group: number; member: number }
  insertAfterId?: number
  /** 顶层索引锚点覆盖（编辑器索引插位非确定——轮16 尾插/轮53 插 253 后；重放按证据传锚） */
  indexAfterId?: number
}

export interface QueueStyleAddResult {
  bytes: Uint8Array
  groupId: number
  memberId: number
  styleIndex: number
  styleName: string
}

export function queueStyleAddCandidate(
  sourceBytes: Uint8Array,
  options: QueueStyleAddOptions
): QueueStyleAddResult {
  const parsed = parseRoot9(sourceBytes)
  requireQueue(parsed, options.targetId)
  const memberDonor = queueMemberDonor(
    options.material === 'text' ? 'queue-member-text' : 'queue-member-image'
  )
  const groupDonor = queueMemberDonor('queue-group')
  const avoid = collectUsedControlIds(parsed)
  for (const id of [memberDonor.selfId, memberDonor.parentId!, groupDonor.selfId]) avoid.add(id)
  const pair = allocateIds(avoid, 2)
  const groupId = options.ids?.group ?? pair[0]
  const memberId = options.ids?.member ?? pair[1]
  // 成员克隆（文本成员可改写文本/颜色/字号）
  let memberRaw = remapUiRecordVarints(Buffer.from(memberDonor.hex, 'hex'), {
    [memberDonor.selfId]: memberId,
    [memberDonor.parentId!]: groupId
  })
  if (options.material === 'text') {
    if (options.text !== undefined || options.color !== undefined) {
      const text = options.text ?? ''
      const color = options.color !== undefined ? cssColorToArgb(options.color) : 0xffffffff
      memberRaw = patchTextMember(memberRaw, text, color)
    }
    if (options.fontSize !== undefined) memberRaw = patchMemberFontSize(memberRaw, options.fontSize)
  }
  let styleIndex = 0
  let styleName = ''
  const bytes = withSection(sourceBytes, (section) => {
    // 1) type77.f503.f69 追加样式条目
    const field = section.find((f) => ownIdOf(f) === options.targetId)
    if (!field) throw new Error(`[error] 队列字段未找到: ${options.targetId}`)
    const recordFields = parseSafe(field.value as Uint8Array)!
    const t77 = queueCompF503(recordFields, 77)
    const f69 = t77.f503m.find((x) => x.number === 69 && x.wire === 2)
    const f69m = f69 ? parseSafe(f69.value as Uint8Array) : undefined
    if (!f69 || !f69m) throw new Error('[error] type77.f503.f69 样式列表缺失——fail-closed')
    // 素材块常量（轮53/54 donor：f503 pos 对 = fixed32 48.0；f504 scale 对 = fixed32 1.0）
    const f32 = (v: number): Uint8Array => {
      const buf = Buffer.alloc(4)
      buf.writeFloatLE(v)
      return new Uint8Array(buf)
    }
    const metaBytes = emitSafe([s0(2, 1), s0(3, 8), s0(4, groupId)])
    const posBytes = emitSafe([
      { number: 501, wire: 5, value: f32(48.0) },
      { number: 502, wire: 5, value: f32(48.0) }
    ])
    // 队列创建自带 1 条空样式占位（轮52：素材块 meta/pos 空、scale 在、名 样式_1）——
    // 首次配置=填充该条目（轮53 +22B）；无空位才追加完整条目（轮54 +69B）
    let filled = false
    for (const entryField of f69m) {
      if (entryField.number !== 501 || entryField.wire !== 2) continue
      const entry = parseSafe(entryField.value as Uint8Array)
      if (!entry) continue
      const mb = entry.find((x) => x.number === 501 && x.wire === 2)
      const mbm = mb ? parseSafe(mb.value as Uint8Array) : undefined
      if (!mb || !mbm) continue
      const meta = mbm.find((x) => x.number === 501 && x.wire === 2)
      const metaEmpty =
        meta === undefined || (meta.value as Uint8Array).length === 0
      if (!metaEmpty) continue
      // 填充：meta = 组引用 + f503 pos 对（f502/f504/f505 保留原态）
      const at501 = mbm.findIndex((x) => x.number === 501 && x.wire === 2)
      if (at501 >= 0) mbm[at501] = s2(501, metaBytes)
      else mbm.push(s2(501, metaBytes))
      const at503 = mbm.findIndex((x) => x.number === 503 && x.wire === 2)
      if (at503 >= 0) mbm[at503] = s2(503, posBytes)
      else mbm.push(s2(503, posBytes))
      mb.value = emitSafe(mbm)
      entryField.value = emitSafe(entry)
      styleIndex = safeNum(entry, 505) ?? 1
      const nameField = entry.find((x) => x.number === 506 && x.wire === 2)
      styleName = nameField
        ? new TextDecoder().decode(nameField.value as Uint8Array)
        : `样式_${styleIndex}`
      filled = true
      break
    }
    if (!filled) {
      const existing = f69m.filter((x) => x.number === 501 && x.wire === 2)
      styleIndex = existing.length + 1
      styleName = `样式_${styleIndex}`
      const materialBlock = emitSafe([
        s2(501, metaBytes),
        s2(502, new Uint8Array(0)),
        s2(503, posBytes),
        s2(504, emitSafe([{ number: 501, wire: 5, value: f32(1.0) }, { number: 502, wire: 5, value: f32(1.0) }])),
        s2(505, new Uint8Array(0))
      ])
      const entry = emitSafe([
        s2(501, materialBlock),
        s0(505, styleIndex),
        s2(506, new Uint8Array(Buffer.from(styleName, 'utf8')))
      ])
      f69m.push(s2(501, entry))
    }
    f69.value = emitSafe(f69m)
    t77.f503.value = emitSafe(t77.f503m)
    t77.compSlot.value = emitSafe(t77.comp)
    field.value = emitSafe(recordFields)
    // 2) 素材组+成员创建（donor 克隆 + 名字 默认状态素材组 + 索引尾追加）
    let groupRaw = remapUiRecordVarints(Buffer.from(groupDonor.hex, 'hex'), {
      [groupDonor.selfId]: groupId
    })
    groupRaw = rewriteGroupMembers(groupRaw, [memberId])
    groupRaw = setRecordNameLocal(groupRaw, DEFAULT_STYLE_GROUP_NAME)
    insertRecords(section, [groupRaw, memberRaw], options.insertAfterId)
    insertIntoIndex(section, groupId, options.indexAfterId)
  })
  return { bytes, groupId, memberId, styleIndex, styleName }
}

/** 文本成员字号改写（f19.f502 varint；安全层——f19 可能含 f62 哨兵） */
function patchMemberFontSize(memberRaw: Uint8Array, fontSize: number): Uint8Array {
  if (!Number.isSafeInteger(fontSize) || fontSize <= 0 || fontSize > 512) {
    throw new Error('[error] --font-size 须为 1..512 整数')
  }
  const m = parseSafe(memberRaw)!
  for (const slot of m) {
    if (slot.number !== 505 || slot.wire !== 2) continue
    const comp = parseSafe(slot.value as Uint8Array)
    if (!comp || safeNum(comp, 502) !== 25) continue
    const f503 = comp.find((x) => x.number === 503 && x.wire === 2)!
    const f503m = parseSafe(f503.value as Uint8Array)!
    const f19 = f503m.find((x) => x.number === 19 && x.wire === 2)!
    const f19m = parseSafe(f19.value as Uint8Array)!
    const f502 = f19m.find((x) => x.number === 502 && x.wire === 0)
    if (f502) f502.value = fontSize
    else f19m.push(s0(502, fontSize))
    f19.value = emitSafe(f19m)
    f503.value = emitSafe(f503m)
    slot.value = emitSafe(comp)
    return emitSafe(m)
  }
  throw new Error('[error] 成员无 t25 文本组件（字号不可写）')
}

// ============ 2. 消息项追加（轮61：前插 + 序号 max+1） ============

export interface QueueMessageAddOptions {
  targetId: number
  /** 缺省 = 消息项_N（N=序号） */
  name?: string
}

export interface QueueMessageAddResult {
  bytes: Uint8Array
  messageIndex: number
  name: string
}

export function queueMessageAddCandidate(
  sourceBytes: Uint8Array,
  options: QueueMessageAddOptions
): QueueMessageAddResult {
  const parsed = parseRoot9(sourceBytes)
  requireQueue(parsed, options.targetId)
  let messageIndex = 0
  let name = ''
  const bytes = withSection(sourceBytes, (section) => {
    const field = section.find((f) => ownIdOf(f) === options.targetId)
    if (!field) throw new Error(`[error] 队列字段未找到: ${options.targetId}`)
    const recordFields = parseSafe(field.value as Uint8Array)!
    const t79 = queueCompF503(recordFields, 79)
    const f71 = t79.f503m.find((x) => x.number === 71 && x.wire === 2)
    const f71m = f71 ? parseSafe(f71.value as Uint8Array) : undefined
    if (!f71 || !f71m) throw new Error('[error] type79.f503.f71 消息列表缺失——fail-closed')
    const entries = f71m.filter((x) => x.number === 501 && x.wire === 2)
    messageIndex =
      Math.max(0, ...entries.map((e) => safeNum(parseSafe(e.value as Uint8Array) ?? [], 503) ?? 0)) + 1
    name = options.name ?? `消息项_${messageIndex}`
    const entry = emitSafe([
      s2(501, emitSafe([s2(501, new Uint8Array(Buffer.from(name, 'utf8')))])),
      s2(502, new Uint8Array(0)),
      s0(503, messageIndex),
      s0(504, 1)
    ])
    // 前插（轮61：消息项_2 在消息项_1 之前）
    const firstAt = f71m.findIndex((x) => x.number === 501 && x.wire === 2)
    f71m.splice(firstAt < 0 ? 0 : firstAt, 0, s2(501, entry))
    f71.value = emitSafe(f71m)
    t79.f503.value = emitSafe(t79.f503m)
    t79.compSlot.value = emitSafe(t79.comp)
    field.value = emitSafe(recordFields)
  })
  return { bytes, messageIndex, name }
}

/** 按 f503 序号定位消息条目（名字容器 + 条目字段） */
function findMessageEntry(
  f71m: SafeField[],
  message: number
): { entryField: SafeField; entry: SafeField[] } {
  for (const f of f71m) {
    if (f.number !== 501 || f.wire !== 2) continue
    const entry = parseSafe(f.value as Uint8Array)
    if (entry && safeNum(entry, 503) === message) return { entryField: f, entry }
  }
  throw new Error(`[error] 消息项 #${message} 不存在（f503 序号未命中）——fail-closed`)
}

// ============ 3. 消息样式（轮62：名字容器内 f502 = 样式序号） ============

export function queueMessageStyleCandidate(
  sourceBytes: Uint8Array,
  options: { targetId: number; message: number; style: number }
): Uint8Array {
  const parsed = parseRoot9(sourceBytes)
  requireQueue(parsed, options.targetId)
  if (options.style < 1) throw new Error('[error] --style 须为正整数（type77 样式序）')
  return withSection(sourceBytes, (section) => {
    const field = section.find((f) => ownIdOf(f) === options.targetId)
    if (!field) throw new Error(`[error] 队列字段未找到: ${options.targetId}`)
    const recordFields = parseSafe(field.value as Uint8Array)!
    const t79 = queueCompF503(recordFields, 79)
    const f71 = t79.f503m.find((x) => x.number === 71 && x.wire === 2)
    const f71m = f71 ? parseSafe(f71.value as Uint8Array) : undefined
    if (!f71 || !f71m) throw new Error('[error] 消息列表缺失——fail-closed')
    const { entryField, entry } = findMessageEntry(f71m, options.message)
    const nameContainerField = entry.find((x) => x.number === 501 && x.wire === 2)!
    const nameContainer = parseSafe(nameContainerField.value as Uint8Array)!
    const styleField = nameContainer.find((x) => x.number === 502 && x.wire === 0)
    if (styleField) styleField.value = options.style
    else nameContainer.push(s0(502, options.style))
    nameContainerField.value = emitSafe(nameContainer)
    entryField.value = emitSafe(entry)
    f71.value = emitSafe(f71m)
    t79.f503.value = emitSafe(t79.f503m)
    t79.compSlot.value = emitSafe(t79.comp)
    field.value = emitSafe(recordFields)
  })
}

// ============ 4. 显示配置（轮55-58：t76.f503.f68） ============

export interface QueuePropsOptions {
  targetId: number
  /** 最大显示项目（f513 varint，默认 5） */
  maxItems?: number
  /** 限时显示开关（f511=1 开；关=删） */
  timedShow?: boolean
  /** 限时秒数（f512 fixed32；timedShow 开时有效，默认 5.0） */
  timedSeconds?: number
  /** 新消息插入位置：false=结尾（f510 存在，默认）/ true=开头（f510 删） */
  insertHead?: boolean
  /** 内容对齐（f506：1=居中；2=右；缺省=左=删字段） */
  align?: 'left' | 'center' | 'right'
}

export function queuePropsCandidate(
  sourceBytes: Uint8Array,
  options: QueuePropsOptions
): Uint8Array {
  const parsed = parseRoot9(sourceBytes)
  requireQueue(parsed, options.targetId)
  return withSection(sourceBytes, (section) => {
    const field = section.find((f) => ownIdOf(f) === options.targetId)
    if (!field) throw new Error(`[error] 队列字段未找到: ${options.targetId}`)
    const recordFields = parseSafe(field.value as Uint8Array)!
    const t76 = queueCompF503(recordFields, 76)
    const f68 = t76.f503m.find((x) => x.number === 68 && x.wire === 2)
    const f68m = f68 ? parseSafe(f68.value as Uint8Array) : undefined
    if (!f68 || !f68m) throw new Error('[error] type76.f503.f68 显示配置缺失——fail-closed')
    const setVarint = (num: number, value: number | undefined, remove = false): void => {
      const at = f68m.findIndex((x) => x.number === num && x.wire === 0)
      if (remove) {
        if (at >= 0) f68m.splice(at, 1)
      } else if (value !== undefined) {
        if (at >= 0) f68m[at].value = value
        else {
          // 升序插入（f68 字段号序：f506<f509<f510<f511<f512<f513…——轮56/58 插位铁证）
          let pos = f68m.findIndex((x) => x.number > num)
          if (pos < 0) pos = f68m.length
          f68m.splice(pos, 0, s0(num, value))
        }
      }
    }
    if (options.maxItems !== undefined) {
      if (!Number.isSafeInteger(options.maxItems) || options.maxItems < 1) {
        throw new Error('[error] --max-items 须为正整数')
      }
      setVarint(513, options.maxItems)
    }
    if (options.timedShow !== undefined) {
      setVarint(511, options.timedShow ? 1 : undefined, !options.timedShow)
      if (options.timedShow && options.timedSeconds !== undefined) {
        const buf = Buffer.alloc(4)
        buf.writeFloatLE(options.timedSeconds)
        const at = f68m.findIndex((x) => x.number === 512 && x.wire === 5)
        const f32bytes = new Uint8Array(buf)
        if (at >= 0) f68m[at].value = f32bytes
        else f68m.push({ number: 512, wire: 5, value: f32bytes })
      }
    }
    if (options.insertHead !== undefined) {
      setVarint(510, options.insertHead ? undefined : 1, options.insertHead)
    }
    if (options.align !== undefined) {
      const code = options.align === 'center' ? 1 : options.align === 'right' ? 2 : undefined
      setVarint(506, code, code === undefined)
    }
    f68.value = emitSafe(f68m)
    t76.f503.value = emitSafe(t76.f503m)
    t76.compSlot.value = emitSafe(t76.comp)
    field.value = emitSafe(recordFields)
  })
}

function cssColorToArgb(css: string): number {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(css)
  if (!m) throw new Error(`[error] 颜色格式须为 #RRGGBB: ${css}`)
  return (0xff000000 | parseInt(m[1], 16)) >>> 0
}
