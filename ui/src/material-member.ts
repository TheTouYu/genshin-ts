/**
 * ui/src/material-member.ts — 素材组成员 add/update 引擎（票10 · 轮15/16 donor 驱动）
 *
 * 范围（DESIGN §3.4 `state material add` + mappings §2；09 R3 remove / R5 clear 已有）：
 *   - addStateMaterialMemberCandidate：给按钮状态（常态/悬停/按下）加素材成员：
 *     · 状态块已有组（轮9 打开状态页自动建的空组等）→ 组 f503 追加 + 成员记录插在
 *       组簇末（轮15：#245 紧随组 #220）；
 *     · 状态块无组（轮16）→ donor 克隆「按下状态素材组」创建形态（646B，f503 含成员）
 *       + t50 状态块素材引用 {f2:1,f3:8,f4:组ID}（+10B）+ 顶层索引尾追加 + 新组插文件尾；
 *     组名按状态改写（默认/悬浮/按下状态素材组——轮8/15/16 实读）。
 *   - updateMaterialMemberCandidate：成员文本/颜色改写（f19.f505/f510；R2 patchTextMember
 *     同款原语；轮9 语义）。
 *
 * 纪律：成员字节只做 remapUiRecordVarints 字节级重映射（图片成员 t38 含 2^64-1 哨兵，
 * 禁止 parse/emit 往返——wire-safe 层仅文本成员 t25 改写需要且其颜色 <2^32 安全）。
 */

import { remapUiRecordVarints } from '../../src/cli/gil_ui.js'
import { emitWireMessage, parseWireMessage, type WireField } from '../../src/cli/static_assembly/wire.js'
import { materialMemberDonor } from './material-member-donors.js'
import { allocateIds, patchTextMember } from './button-materials.js'
import { collectUsedControlIds } from './create.js'
import { parseRoot9 } from './record.js'
import { appendMemberId, encodePacked, insertIntoIndex, insertRecords, ownIdOf, withSection, w0, w2 } from './section-ops.js'

export type MaterialState = 'normal' | 'hover' | 'press'
export type MaterialMemberKind = 'text' | 'image'

const STATE_GROUP_NAMES: Record<MaterialState, string> = {
  normal: '默认状态素材组',
  hover: '悬浮状态素材组',
  press: '按下状态素材组'
}

/** t50 状态块序（0=常态/1=悬停/2=按下；禁用态 f504 无 donor → 调用层 fail-closed） */
const STATE_BLOCK_INDEX: Record<MaterialState, number> = { normal: 0, hover: 1, press: 2 }

/** 读按钮 t50 指定状态块的当前素材组 ID（无引用=undefined） */
export function stateMaterialGroupId(
  buttonFields: readonly WireField[],
  state: MaterialState
): number | undefined {
  const idx = STATE_BLOCK_INDEX[state]
  for (const slot of buttonFields) {
    if (slot.number !== 505 || slot.wire !== 2) continue
    const comp = parseWireMessage(slot.value as Uint8Array)
    if (!comp) continue
    if (comp.find((x) => x.number === 502 && x.wire === 0)?.value !== 50) continue
    const f503 = comp.find((x) => x.number === 503 && x.wire === 2)
    const f503m = f503 ? parseWireMessage(f503.value as Uint8Array) : undefined
    const f43 = f503m?.find((x) => x.number === 43 && x.wire === 2)
    const f43m = f43 ? parseWireMessage(f43.value as Uint8Array) : undefined
    const container = f43m?.find((x) => x.number === 503 && x.wire === 2)
    const containerMsg = container ? parseWireMessage(container.value as Uint8Array) : undefined
    const blockField = containerMsg?.find((x) => x.number === 501 + idx && x.wire === 2)
    if (!blockField) return undefined
    const block = parseWireMessage(blockField.value as Uint8Array)
    const ref = block?.find((x) => x.number === 501 && x.wire === 2)
    if (!ref || (ref.value as Uint8Array).length === 0) return undefined
    const refMsg = parseWireMessage(ref.value as Uint8Array)
    const groupId = refMsg?.find((x) => x.number === 4 && x.wire === 0)?.value
    return typeof groupId === 'number' ? groupId : undefined
  }
  return undefined
}

/** 按钮状态块写入素材引用 {f2:1, f3:8, f4:组ID}（轮16 +10B 形态；已有引用=幂等拒绝） */
function setButtonStateRef(
  buttonRaw: Uint8Array,
  state: MaterialState,
  groupId: number
): Uint8Array {
  const idx = STATE_BLOCK_INDEX[state]
  const m = parseWireMessage(buttonRaw)
  if (!m) throw new Error('[error] 按钮记录解析失败')
  for (const slot of m) {
    if (slot.number !== 505 || slot.wire !== 2) continue
    const comp = parseWireMessage(slot.value as Uint8Array)
    if (!comp) continue
    if (comp.find((x) => x.number === 502 && x.wire === 0)?.value !== 50) continue
    const f503 = comp.find((x) => x.number === 503 && x.wire === 2)
    const f503m = f503 ? parseWireMessage(f503.value as Uint8Array) : undefined
    const f43 = f503m?.find((x) => x.number === 43 && x.wire === 2)
    const f43m = f43 ? parseWireMessage(f43.value as Uint8Array) : undefined
    const container = f43m?.find((x) => x.number === 503 && x.wire === 2)
    const containerMsg = container ? parseWireMessage(container.value as Uint8Array) : undefined
    if (!containerMsg) throw new Error('[error] t50 状态容器缺失')
    const bf = containerMsg.find((x) => x.number === 501 + idx && x.wire === 2)
    if (!bf) throw new Error(`[error] 状态块 f${501 + idx} 缺失`)
    const block = parseWireMessage(bf.value as Uint8Array)!
    const ref = block.find((x) => x.number === 501 && x.wire === 2)
    if (ref && (ref.value as Uint8Array).length > 0) {
      throw new Error(`[error] 状态块已有素材引用（幂等拒绝：先 remove/clear 再重配）`)
    }
    const refBytes = emitWireMessage([w0(2, 1), w0(3, 8), w0(4, groupId)])
    if (ref) ref.value = refBytes
    else block.push(w2(501, refBytes))
    bf.value = emitWireMessage(block)
    container!.value = emitWireMessage(containerMsg)
    f43!.value = emitWireMessage(f43m!)
    f503m!.forEach((x) => {
      if (x.number === 43) x.value = f43!.value
    })
    f503!.value = emitWireMessage(f503m!)
    comp.forEach((x) => {
      if (x.number === 503) x.value = f503!.value
    })
    slot.value = emitWireMessage(comp)
    return emitWireMessage(m)
  }
  throw new Error('[error] 目标不是按钮（无 t50 状态组件）')
}

export interface AddStateMaterialMemberOptions {
  targetId: number
  state: MaterialState
  member: MaterialMemberKind
  /** text 成员：显示文本（缺省=donor 原文） */
  text?: string
  /** text 成员：颜色 #RRGGBB（缺省=donor 原色） */
  color?: string
  /** 显式 ID（重放对拍用）：groupId 仅建组路径需要 */
  ids?: { group?: number; member: number }
  /** 物理插入锚点覆盖（重放对拍用） */
  insertAfterId?: number
}

export interface AddStateMaterialMemberResult {
  bytes: Uint8Array
  groupId: number
  memberId: number
  createdGroup: boolean
}

export function addStateMaterialMemberCandidate(
  sourceBytes: Uint8Array,
  options: AddStateMaterialMemberOptions
): AddStateMaterialMemberResult {
  const parsed = parseRoot9(sourceBytes)
  const target = parsed.recordsById.get(options.targetId)
  if (!target) throw new Error(`[error] 目标控件不存在: ${options.targetId}`)
  if (!target.compTypes.includes(50)) {
    throw new Error(`[error] ${options.targetId} 不是按钮（无 t50 状态组件）`)
  }
  const existingGroup = stateMaterialGroupId(target.fields, options.state)
  const memberDonor = materialMemberDonor(options.member === 'text' ? 'member-text' : 'member-image')
  const groupDonor = materialMemberDonor('group-create')
  // ID 避让集：现役 ID + 全部 donor 自身/父 ID（顺序 remap 在 from/to 集重叠时会自相
  // 覆盖——轮12 态 max+1/max+2 恰撞 donor ID 的实测教训）
  const avoid = collectUsedControlIds(parsed)
  for (const id of [memberDonor.selfId, memberDonor.parentId!, groupDonor.selfId]) avoid.add(id)
  const createdGroup = existingGroup === undefined
  let groupId: number
  let memberId: number
  if (createdGroup) {
    // 建组路径：组+成员尾段连续对（轮16 铁证 246/247；避开 donor ID）
    const pair = allocateIds(avoid, 2)
    groupId = options.ids?.group ?? pair[0]
    memberId = options.ids?.member ?? pair[1]
  } else {
    groupId = existingGroup
    memberId = options.ids?.member ?? allocateIds(avoid, 1)[0]
  }
  // 成员克隆：自身 ID + 父引用（donor 组 → 目标组）；text 成员可选改写文本/颜色
  let memberRaw = remapUiRecordVarints(Buffer.from(memberDonor.hex, 'hex'), {
    [memberDonor.selfId]: memberId,
    [memberDonor.parentId!]: groupId!
  })
  if (options.member === 'text' && (options.text !== undefined || options.color !== undefined)) {
    const afterText = options.text ?? new TextDecoder().decode(donorTextBytes(memberDonor.hex) ?? new Uint8Array())
    const color = options.color !== undefined ? cssColorToArgbLocal(options.color) : donorColorArgb(memberDonor.hex)
    memberRaw = patchTextMember(memberRaw, afterText, color)
  }
  if (options.member === 'image' && options.text !== undefined) {
    throw new Error('[error] image 成员不支持 --text（素材源本票 fail-closed，用 donor 默认官方资源）')
  }

  const bytes = withSection(sourceBytes, (section, sectionParsed) => {
    if (createdGroup) {
      // 新组 = donor 创建形态克隆：先字节 remap（组自身 ID + 内嵌成员引用），后改写
      // f503 = [memberId]（顺序：f503 重写在 remap 之后，避免分配 ID 撞 donor 成员 ID
      // 时的顺序覆盖）；组名按状态改写
      let groupRaw = remapUiRecordVarints(Buffer.from(groupDonor.hex, 'hex'), {
        [groupDonor.selfId]: groupId!
      })
      groupRaw = rewriteGroupMembers(groupRaw, [memberId])
      groupRaw = setRecordNameLocal(groupRaw, STATE_GROUP_NAMES[options.state])
      insertRecords(section, [groupRaw, memberRaw], options.insertAfterId)
      insertIntoIndex(section, groupId!)
      // t50 状态块写素材引用
      const targetField = section.find((f) => ownIdOf(f) === options.targetId)!
      targetField.value = setButtonStateRef(targetField.value as Uint8Array, options.state, groupId!)
    } else {
      // 已有组：f503 追加 + 成员插组簇末（组记录或其最后成员之后）
      appendMemberId(section, groupId!, memberId)
      const group = sectionParsed.recordsById.get(groupId!)
      if (!group) throw new Error(`[error] 状态组不存在: ${groupId}`)
      let anchor = group.id
      for (const r of sectionParsed.records) {
        if (r.parentId === group.id) anchor = r.id
      }
      insertRecords(section, [memberRaw], options.insertAfterId ?? anchor)
    }
  })
  return { bytes, groupId: groupId!, memberId, createdGroup }
}

/** 组记录 f503 成员列表整体改写（组记录字段 = 小 varint + packed，unsafe 层安全） */
function rewriteGroupMembers(recordRaw: Uint8Array, ids: readonly number[]): Uint8Array {
  const m = parseWireMessage(recordRaw)
  if (!m) throw new Error('[error] 组记录解析失败')
  const membersField = m.find((f) => f.number === 503 && f.wire === 2)
  if (!membersField) throw new Error('[error] 组记录缺 f503 成员列表——fail-closed')
  membersField.value = encodePacked(ids)
  return emitWireMessage(m)
}

/** 组记录名改写（t15 → f12.f501 utf8；组名字段为小 varint+utf8，unsafe 层安全） */
function setRecordNameLocal(recordRaw: Uint8Array, name: string): Uint8Array {
  const m = parseWireMessage(recordRaw)
  if (!m) throw new Error('[error] 组记录解析失败')
  const nameBytes = new Uint8Array(Buffer.from(name, 'utf8'))
  for (const f of m) {
    if (f.number !== 505 || f.wire !== 2) continue
    const comp = parseWireMessage(f.value as Uint8Array)
    if (!comp) continue
    if (comp.find((x) => x.number === 502 && x.wire === 0)?.value !== 15) continue
    const f12 = comp.find((x) => x.number === 12 && x.wire === 2)
    const f12m = f12 ? parseWireMessage(f12.value as Uint8Array) : undefined
    const f501 = f12m?.find((x) => x.number === 501 && x.wire === 2)
    if (f501 && f12 && f12m) {
      f501.value = nameBytes
      f12.value = emitWireMessage(f12m)
      f.value = emitWireMessage(comp)
      return emitWireMessage(m)
    }
  }
  throw new Error('[error] 组记录缺 t15 名字组件——fail-closed')
}

/** donor 文本成员的原文（f19.f505.f501） */
function donorTextBytes(hex: string): Uint8Array | undefined {
  const m = parseWireMessage(Buffer.from(hex, 'hex'))
  if (!m) return undefined
  for (const slot of m) {
    if (slot.number !== 505 || slot.wire !== 2) continue
    const comp = parseWireMessage(slot.value as Uint8Array)
    if (!comp) continue
    if (comp.find((x) => x.number === 502 && x.wire === 0)?.value !== 25) continue
    const f503 = comp.find((x) => x.number === 503 && x.wire === 2)
    const f503m = f503 ? parseWireMessage(f503.value as Uint8Array) : undefined
    const f19 = f503m?.find((x) => x.number === 19 && x.wire === 2)
    const f19m = f19 ? parseWireMessage(f19.value as Uint8Array) : undefined
    const f505 = f19m?.find((x) => x.number === 505 && x.wire === 2)
    const f505m = f505 ? parseWireMessage(f505.value as Uint8Array) : undefined
    const f501 = f505m?.find((x) => x.number === 501 && x.wire === 2)
    return f501 ? (f501.value as Uint8Array) : undefined
  }
  return undefined
}

/** donor 文本成员的原色（f19.f510；读数可能负值 → >>>0 归一） */
function donorColorArgb(hex: string): number {
  const m = parseWireMessage(Buffer.from(hex, 'hex'))
  if (!m) throw new Error('[error] donor 解析失败')
  for (const slot of m) {
    if (slot.number !== 505 || slot.wire !== 2) continue
    const comp = parseWireMessage(slot.value as Uint8Array)
    if (!comp) continue
    if (comp.find((x) => x.number === 502 && x.wire === 0)?.value !== 25) continue
    const f503 = comp.find((x) => x.number === 503 && x.wire === 2)
    const f503m = f503 ? parseWireMessage(f503.value as Uint8Array) : undefined
    const f19 = f503m?.find((x) => x.number === 19 && x.wire === 2)
    const f19m = f19 ? parseWireMessage(f19.value as Uint8Array) : undefined
    const f510 = f19m?.find((x) => x.number === 510 && x.wire === 0)
    return typeof f510?.value === 'number' ? f510.value >>> 0 : 0xffffffff
  }
  throw new Error('[error] donor 无 t25 文本组件')
}

function cssColorToArgbLocal(css: string): number {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(css)
  if (!m) throw new Error(`[error] 颜色格式须为 #RRGGBB: ${css}`)
  return (0xff000000 | parseInt(m[1], 16)) >>> 0
}

// ============ 成员文本/颜色 update（轮9 语义；R2 patchTextMember 原语） ============

export interface UpdateMaterialMemberOptions {
  memberId: number
  text?: string
  color?: string
}

export interface UpdateMaterialMemberResult {
  bytes: Uint8Array
  memberId: number
}

export function updateMaterialMemberCandidate(
  sourceBytes: Uint8Array,
  options: UpdateMaterialMemberOptions
): UpdateMaterialMemberResult {
  if (options.text === undefined && options.color === undefined) {
    throw new Error('[error] update 需要至少 --text 或 --color')
  }
  const parsed = parseRoot9(sourceBytes)
  const member = parsed.recordsById.get(options.memberId)
  if (!member) throw new Error(`[error] 素材成员不存在: ${options.memberId}`)
  if (!member.compTypes.includes(25)) {
    throw new Error(`[error] ${options.memberId} 不是文本素材成员（无 t25；图片成员文本 fail-closed）`)
  }
  const memberHex = Buffer.from(member.raw).toString('hex')
  const text =
    options.text ??
    new TextDecoder().decode(donorTextBytes(memberHex) ?? new Uint8Array())
  const color =
    options.color !== undefined ? cssColorToArgbLocal(options.color) : donorColorArgb(memberHex)
  const bytes = withSection(sourceBytes, (section) => {
    const field = section.find((f) => ownIdOf(f) === options.memberId)
    if (!field) throw new Error(`[error] 成员字段未找到: ${options.memberId}`)
    field.value = patchTextMember(field.value as Uint8Array, text, color)
  })
  return { bytes, memberId: options.memberId }
}
