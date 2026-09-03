/**
 * ui/src/templateize.ts — 「保存为模板 / 实例化」候选核心（票 05 波 2，样本驱动）
 *
 * 差分真值（references/ui-controls.md + 80 快照对）：
 * - 官方单条→模板（按钮族 轮4→5）：新 template = 官方内容副本（去 f504=parent None）+
 *   官方槽保留 + subtype6 槽 + type4 槽（f14 backref=[原记录]）；原记录原地升格 instance
 *   （追加 subtype6 槽 + type3 槽 f13=模板）；模板插记录流最前 + 顶层索引头部；
 * - 库实例化（轮5→6）：新 instance = 升级实例内容完整副本（f504=库容器 1840）；插 1840 之后；
 *   容器 f503 追加；模板 f14 backref 追加；
 * - 输入框三合一（轮22→23）：templateize + 自动库实例（同一命令链，ID 尾段连续）。
 * 槽字节常量取自真实样本（templateize-slots.ts，生成物勿手改）。
 */

import { buildFile, encodeVarint, readUint32BE } from '../../src/injector/binary.js'
import {
  emitWireMessage,
  parseWireMessage,
  type WireField
} from '../../src/cli/static_assembly/wire.js'
import { remapUiRecordVarints, setUiControlName } from '../../src/cli/gil_ui.js'
import { TPL_SLOTS } from './templateize-slots.js'
import { LIBRARY_CONTAINER_ID, firstVarint, packedVarints, parseRoot9 } from './record.js'
import { collectUsedControlIds } from './create.js'

/** 把「整字段字节」（key+len+payload）还原成 payload（插入时由 emit 重写 key/len） */
function slotPayload(fullFieldHex: string): Uint8Array {
  const data = Buffer.from(fullFieldHex, 'hex')
  let o = 0
  let key = 0
  let shift = 0
  while (o < data.length) {
    const b = data[o++]
    key |= (b & 0x7f) << shift
    if (b < 0x80) break
    shift += 7
  }
  void key
  let len = 0
  shift = 0
  while (o < data.length) {
    const b = data[o++]
    len |= (b & 0x7f) << shift
    if (b < 0x80) break
    shift += 7
  }
  return data.subarray(o, o + len)
}

function encodePackedVarints(values: readonly number[]): Uint8Array {
  return Uint8Array.from(values.flatMap((value) => Array.from(encodeVarint(value))))
}

function recordIdOf(raw: Uint8Array): number | undefined {
  return firstVarint(parseWireMessage(raw) ?? [], 501)
}

function parentIdOf(raw: Uint8Array): number | undefined {
  return firstVarint(parseWireMessage(raw) ?? [], 504)
}

function ownIdOf(field: WireField): number | undefined {
  if (field.number !== 502 || field.wire !== 2) return undefined
  return recordIdOf(field.value as Uint8Array)
}

function recordHasSlotType(raw: Uint8Array, typeCode: number): boolean {
  const fields = parseWireMessage(raw)
  if (!fields) return false
  return fields.some(
    (f) =>
      f.number === 502 &&
      f.wire === 2 &&
      (parseWireMessage(f.value as Uint8Array) ?? []).some(
        (x) => x.number === 502 && x.wire === 0 && x.value === typeCode
      )
  )
}

/** 记录字段数组 → 重设 f501 / 去 f504 / 在最后 f502 槽之后追加槽 payload */
function spliceRecordSlots(
  raw: Uint8Array,
  opts: { selfId?: number; dropParent?: boolean; slots?: Uint8Array[] }
): Uint8Array {
  const fields = parseWireMessage(raw)
  if (!fields) throw new Error('[error] 记录解析失败')
  const out: WireField[] = []
  let lastSlot = -1
  for (const field of fields) {
    if (opts.dropParent && field.number === 504 && field.wire === 0) continue
    if (opts.selfId !== undefined && field.number === 501 && field.wire === 0) {
      out.push({ ...field, value: opts.selfId })
      continue
    }
    out.push(field)
    if (field.number === 502 && field.wire === 2) lastSlot = out.length - 1
  }
  if (opts.slots) {
    const at = lastSlot < 0 ? Math.max(1, out.length) : lastSlot + 1
    const insert: WireField[] = opts.slots.map((payload) => ({
      number: 502,
      wire: 2,
      value: payload
    }))
    out.splice(at, 0, ...insert)
  }
  return emitWireMessage(out)
}

/** 记录字段数组 → 重设 f501 并去掉 f504（模板 parent=None） */
function dropParentAndSetId(raw: Uint8Array, selfId: number): Uint8Array {
  return spliceRecordSlots(raw, { selfId, dropParent: true })
}

/** subtype6 槽序数：家族标识（同模板家族内模板/实例共享；官方首次模板化=文件可见最大+1；实例源再存=继承源家族）。 */
function readSubtypeOrdinal(raw: Uint8Array): number | undefined {
  const fields = parseWireMessage(raw)
  if (!fields) return undefined
  for (const f of fields) {
    if (f.number !== 502 || f.wire !== 2) continue
    const slot = parseWireMessage(f.value as Uint8Array)
    if (!slot?.some((x) => x.number === 502 && x.wire === 0 && x.value === 6)) continue
    const f12 = slot.find((x) => x.number === 12 && x.wire === 2)
    if (!f12) continue
    const m12 = parseWireMessage(f12.value as Uint8Array)
    return m12?.find((x) => x.wire === 0)?.value as number | undefined
  }
  return undefined
}

function subtypeSlotPayload(ordinal: number): Uint8Array {
  return emitWireMessage([
    { number: 12, wire: 2, value: emitWireMessage([{ number: 501, wire: 0, value: ordinal }]) },
    { number: 501, wire: 0, value: 2 },
    { number: 502, wire: 0, value: 6 }
  ])
}

function maxVisibleFamilyOrdinal(bytes: Uint8Array): number {
  const parsed = parseRoot9(bytes)
  let max = 0
  for (const r of parsed.records) {
    const ord = readSubtypeOrdinal(r.raw)
    if (ord !== undefined && ord > max) max = ord
  }
  return max
}

/** 组件（f505 内容区，跳过 f501/f502 家族槽）内首个等于 from 的 varint → to（输入框族深链样本） */
function replaceFirstVarInComps(raw: Uint8Array, from: number, to: number): Uint8Array {
  const fields = parseWireMessage(raw)
  if (!fields) throw new Error('[error] 记录解析失败')
  let done = false
  const walk = (list: WireField[]): boolean => {
    for (const field of list) {
      if (field.wire === 0 && field.value === from) {
        field.value = to
        return true
      }
      if (field.wire === 2) {
        const sub = parseWireMessage(field.value as Uint8Array)
        if (!sub) continue
        if (walk(sub)) {
          field.value = emitWireMessage(sub)
          return true
        }
      }
    }
    return false
  }
  const out = fields.map((field) => {
    if (done) return field
    if (field.number !== 505 || field.wire !== 2) return field
    const sub = parseWireMessage(field.value as Uint8Array)
    if (!sub) return field
    if (walk(sub)) {
      done = true
      return { ...field, value: emitWireMessage(sub) }
    }
    return field
  })
  return emitWireMessage(out)
}

/** 输入框族深链定点（轮23 实证路径 505.503.19.62.501:1——末端= f62 内 f501 msg 的字段1 varint） */
export function replaceInputDeepLink(raw: Uint8Array, to: number): Uint8Array {
  const fields = parseWireMessage(raw)
  if (!fields) throw new Error('[error] 记录解析失败')
  let done = false
  const out = fields.map((field) => {
    if (done || field.number !== 505 || field.wire !== 2) return field
    const f505 = parseWireMessage(field.value as Uint8Array)
    if (!f505) return field
    const f503 = f505.find((f) => f.number === 503 && f.wire === 2)
    const f503msg = f503 ? parseWireMessage(f503.value as Uint8Array) : undefined
    const f19 = f503msg?.find((f) => f.number === 19 && f.wire === 2)
    const f19msg = f19 ? parseWireMessage(f19.value as Uint8Array) : undefined
    const f62 = f19msg?.find((f) => f.number === 62 && f.wire === 2)
    const f62msg = f62 ? parseWireMessage(f62.value as Uint8Array) : undefined
    const f501 = f62msg?.find((f) => f.number === 501 && f.wire === 2)
    const f501msg = f501 ? parseWireMessage(f501.value as Uint8Array) : undefined
    const target = f501msg?.find((f) => f.number === 1 && f.wire === 0)
    if (!f503 || !f19 || !f62 || !f501 || !f501msg || !target) return field
    target.value = to
    f501.value = emitWireMessage(f501msg)
    f62.value = emitWireMessage(f62msg!)
    f19.value = emitWireMessage(f19msg!)
    f503.value = emitWireMessage(f503msg!)
    done = true
    return { ...field, value: emitWireMessage(f505) }
  })
  if (!done) throw new Error('[error] 输入框深链 505.503.19.62.501:1 未命中')
  return emitWireMessage(out)
}

/** 模板记录：官方内容副本去 f504 + 全记录旧自引用→模板 ID + subtype + type4（f14=[实例ID]）。
 * 顺序关键：先重映射内容（含组件内自引用），后插入 type4——backref 指向实例不受影响。 */
function buildTemplateRecord(
  officialRaw: Uint8Array,
  templateId: number,
  instanceId: number,
  subtypePayload: Uint8Array
): Uint8Array {
  const oldSelf = recordIdOf(officialRaw)
  if (oldSelf === undefined) throw new Error('[error] 官方记录缺 f501')
  let record = dropParentAndSetId(officialRaw, templateId)
  record = remapUiRecordVarints(record, { [oldSelf]: templateId })
  const type4 = remapUiRecordVarints(slotPayload(TPL_SLOTS.TYPE4_SINGLE), {
    1073742032: instanceId
  })
  return spliceRecordSlots(record, {
    slots: [subtypePayload, type4]
  })
}

/** 实例升级：官方记录追加 subtype + type3（f13=templateId） */
function upgradeToInstance(officialRaw: Uint8Array, templateId: number, subtypePayload: Uint8Array): Uint8Array {
  const type3 = remapUiRecordVarints(slotPayload(TPL_SLOTS.TYPE3_SINGLE), {
    1073742033: templateId
  })
  return spliceRecordSlots(officialRaw, {
    slots: [subtypePayload, type3]
  })
}

/** 库实例：升级实例内容完整副本 → 新 ID + f504=1840 */
function toLibraryInstance(instanceRaw: Uint8Array, newId: number): Uint8Array {
  const selfId = recordIdOf(instanceRaw)
  const parentId = parentIdOf(instanceRaw)
  if (selfId === undefined || parentId === undefined) {
    throw new Error('[error] 实例记录缺 f501/f504')
  }
  return remapUiRecordVarints(instanceRaw, {
    [selfId]: newId,
    [parentId]: LIBRARY_CONTAINER_ID
  })
}

function rebuildRoot9(bytes: Uint8Array, mutate: (section: WireField[]) => void): Uint8Array {
  const top = parseWireMessage(bytes.subarray(20, bytes.length - 4))
  if (!top) throw new Error('[error] malformed GIL payload')
  const root9 = top.find((f) => f.number === 9 && f.wire === 2)
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

/** 库容器成员记录簇末尾（1840 后连续 parent=1840 的记录之后；空簇=紧贴 1840） */
function libraryInsertIndex(section: WireField[]): number {
  const libIndex = section.findIndex((f) => ownIdOf(f) === LIBRARY_CONTAINER_ID)
  if (libIndex < 0) throw new Error('[error] 控件组库容器 1840 缺失')
  let at = libIndex + 1
  for (let i = at; i < section.length; i++) {
    const f = section[i]
    if (f.number !== 502 || f.wire !== 2) break
    const msg = parseWireMessage(f.value as Uint8Array)
    const parent = msg?.find((x) => x.number === 504 && x.wire === 0)?.value
    if (parent !== LIBRARY_CONTAINER_ID) break
    at = i + 1
  }
  return at
}

function appendToContainerMembers(section: WireField[], containerId: number, memberId: number): void {
  const idx = section.findIndex((f) => ownIdOf(f) === containerId)
  if (idx < 0) throw new Error(`[error] 容器记录缺失: ${containerId}`)
  const field = section[idx]
  const msg = parseWireMessage(field.value as Uint8Array)
  if (!msg) throw new Error(`[error] 容器解析失败: ${containerId}`)
  const members = msg.find((f) => f.number === 503 && f.wire === 2)
  if (members) {
    const list = packedVarints(members.value as Uint8Array)
    if (!list.includes(memberId)) list.push(memberId)
    members.value = encodePackedVarints(list)
  } else {
    // 空容器无 f503 字段（轮3 删空后 1840 形态）：编辑器新建该字段——插在最后 f502 槽之后
    const newField: WireField = {
      number: 503,
      wire: 2,
      value: encodePackedVarints([memberId])
    }
    let lastSlot = -1
    for (let i = 0; i < msg.length; i++) {
      if (msg[i].number === 502 && msg[i].wire === 2) lastSlot = i
    }
    msg.splice(lastSlot + 1, 0, newField)
  }
  field.value = emitWireMessage(msg)
}

function tailIds(bytes: Uint8Array, count: number): number[] {
  const parsed = parseRoot9(bytes)
  const used = collectUsedControlIds(parsed)
  const start = used.size === 0 ? 1073741843 : Math.max(...used) + 1
  const ids: number[] = []
  for (let i = 0; i < count; i++) {
    const id = start + i
    if (used.has(id)) throw new Error(`[error] 模板 ID 段冲突: ${id}`)
    ids.push(id)
  }
  return ids
}

export interface TemplateizeOptions {
  /** 官方单条目标记录 ID */
  targetId: number
  /** 三合一：自动建库实例（输入框=轮23 是；按钮=轮5 否） */
  autoLibrary: boolean
  /** 钉新模板 ID（重放样本用：编辑器计数器可能有删除造成的空洞，无法从文件推导） */
  templateId?: number
}

/** ID 分配：默认尾段连续；钉 ID 时按钉值起连续（校验不冲突） */
function allocateIds(bytes: Uint8Array, count: number, pin?: number): number[] {
  if (pin !== undefined) {
    const parsed = parseRoot9(bytes)
    const used = new Set(parsed.records.map((r) => r.id))
    const ids: number[] = []
    for (let i = 0; i < count; i++) {
      const id = pin + i
      if (used.has(id)) throw new Error(`[error] 钉 ID 冲突: ${id}`)
      ids.push(id)
    }
    return ids
  }
  return tailIds(bytes, count)
}

export interface TemplateizeResult {
  bytes: Uint8Array
  templateId: number
  /** 原记录（升格 instance）ID */
  instanceId: number
  /** autoLibrary=true 时新建库实例 ID */
  libraryInstanceId?: number
}

/** 队列组克隆槽序归一化（轮63 实证：克隆组两个 f502 槽按 payload 长度升序 [15,45]，旧组为 [45,15]） */
function normalizeGroupSlots(raw: Uint8Array): Uint8Array {
  const fields = parseWireMessage(raw)
  if (!fields) throw new Error('[error] 组记录解析失败')
  const slotIndexes: number[] = []
  fields.forEach((f, i) => {
    if (f.number === 502 && f.wire === 2) slotIndexes.push(i)
  })
  if (slotIndexes.length < 2) return raw
  const slots = slotIndexes
    .map((i) => fields[i])
    .sort((a, b) => (a.value as Uint8Array).length - (b.value as Uint8Array).length)
  const out = fields.filter((_, i) => !slotIndexes.includes(i))
  out.splice(Math.min(...slotIndexes), 0, ...slots)
  return emitWireMessage(out)
}

/** 队列/实例内容里样式组引用收集（路径 505→503→69 子树内 field4 varint，多次出现全收） */
function collectQueueStyleRefs(raw: Uint8Array): number[] {
  const fields = parseWireMessage(raw)
  if (!fields) return []
  const out: number[] = []
  const collect = (list: WireField[]): void => {
    for (const f of list) {
      if (f.wire === 0 && f.number === 4) out.push(f.value as number)
      if (f.wire === 2) {
        const sub = parseWireMessage(f.value as Uint8Array)
        if (sub) collect(sub)
      }
    }
  }
  for (const f505 of fields) {
    if (f505.number !== 505 || f505.wire !== 2) continue
    const m505 = parseWireMessage(f505.value as Uint8Array)
    if (!m505) continue
    for (const f503 of m505.filter((f) => f.number === 503 && f.wire === 2)) {
      const m503 = parseWireMessage(f503.value as Uint8Array)
      if (!m503) continue
      for (const f69 of m503.filter((f) => f.number === 69 && f.wire === 2)) {
        const m69 = parseWireMessage(f69.value as Uint8Array)
        if (m69) collect(m69)
      }
    }
  }
  return out
}

export interface TemplateizeTargetInfo {
  kind: string
  role: 'official' | 'instance' | 'template' | 'none'
  queueStyleCount: number
}

/** CLI 用：目标角色与队列样式数探测（fail-closed 依据） */
export function templateizeTargetInfo(bytes: Uint8Array, targetId: number): TemplateizeTargetInfo {
  const parsed = parseRoot9(bytes)
  const target = parsed.recordsById.get(targetId)
  if (!target) throw new Error(`[error] 官方控件不存在: ${targetId}`)
  const has3 = recordHasSlotType(target.raw, 3)
  const has4 = recordHasSlotType(target.raw, 4)
  const has5 = recordHasSlotType(target.raw, 5)
  const role: TemplateizeTargetInfo['role'] =
    has3 && !has4 ? 'instance' : has4 ? 'template' : has5 ? 'official' : 'none'
  return {
    kind: target.kind,
    role,
    queueStyleCount: target.kind === 'message-queue' ? collectQueueStyleRefs(target.raw).length : 0
  }
}

/**
 * 队列族三合一（轮62→63 单样本 OBSERVED）：模板 + 布局实例升格 + 库实例 + **三侧私有样式树
 * 克隆**（布局/模板/库各一套） + 旧树物理删除 + 内部引用重映射（内容深链 505.503.69…:4）。
 * ⚠️ 单样本登记：ID 分配含 4 个幻影号（2138-2141，编辑器内部动作痕迹）——按样本复刻，
 * 待第二轮样本复核（见 issue open-items）。
 */
function queueTemplateizeCandidate(bytes: Uint8Array, targetId: number): TemplateizeResult {
  const parsed = parseRoot9(bytes)
  const target = parsed.recordsById.get(targetId)
  if (!target) throw new Error(`[error] 目标记录不存在: ${targetId}`)
  // 旧私有样式组：内容路径 505.503.69 子树内 field4 两次出现（image 组在前、text 组在后，由成员判别）
  const styleRefs = collectQueueStyleRefs(target.raw)
  if (styleRefs.length !== 2) {
    throw new Error(`[error] 队列样式组引用解析失败（${styleRefs.length} 个，期望 2）——样本外形态 fail-closed`)
  }
  // 角色判别：成员 kind=image/textbox
  const roleOf = (gid: number): 'image' | 'textbox' => {
    const member = parsed.records.find((r) => r.parentId === gid)
    if (!member) throw new Error(`[error] 样式组 ${gid} 无成员`)
    if (member.kind === 'image' || member.kind === 'textbox') return member.kind
    throw new Error(`[error] 样式组 ${gid} 成员 kind=${member.kind}（样本外）`)
  }
  const oldImage = roleOf(styleRefs[0]) === 'image' ? styleRefs[0] : styleRefs[1]
  const oldText = oldImage === styleRefs[0] ? styleRefs[1] : styleRefs[0]
  const oldGroups = [oldImage, oldText]
  const oldMembers = oldGroups.map((g) => {
    const members = parsed.records.filter((r) => r.parentId === g)
    if (members.length !== 1) throw new Error(`[error] 样式组 ${g} 成员数=${members.length}（样本外）`)
    return members[0].id
  })
  // ID 分配：T + 幻影4 + L + 三侧树（每侧 Gimg,Mimg,Gtxt,Mtxt）——18 连续（轮63 实证）
  const run = tailIds(bytes, 18)
  const templateId = run[0]
  const libraryId = run[5]
  const pools: Array<{ gImg: number; mImg: number; gTxt: number; mTxt: number }> = [
    { gImg: run[6], mImg: run[7], gTxt: run[8], mTxt: run[9] }, // lib 侧（2143-2146）
    { gImg: run[10], mImg: run[11], gTxt: run[12], mTxt: run[13] }, // tpl 侧（2147-2150）
    { gImg: run[14], mImg: run[15], gTxt: run[16], mTxt: run[17] } // 布局侧（2151-2154）
  ]
  const oldSelf = targetId
  const oldParentRaw = parsed.recordsById.get(targetId)!.parentId
  if (oldParentRaw == null) throw new Error('[error] 官方队列缺 f504 父引用')
  const oldParent: number = oldParentRaw
  const type3Payload = remapUiRecordVarints(slotPayload(TPL_SLOTS.TYPE3_SINGLE), {
    1073742033: templateId
  })
  const subtype = subtypeSlotPayload(maxVisibleFamilyOrdinal(bytes) + 1)
  const type4Queue = remapUiRecordVarints(slotPayload(TPL_SLOTS.TYPE4_QUEUE_DOUBLE), {
    1073742132: targetId,
    1073742142: libraryId
  })
  const sideRefs = (raw: Uint8Array, pool: (typeof pools)[number]): Uint8Array =>
    remapUiRecordVarints(raw, { [oldImage]: pool.gImg, [oldText]: pool.gTxt })
  // 升级实例（布局侧 2132）：槽 + 样式引用→布局池
  const upgraded = sideRefs(
    spliceRecordSlots(target.raw, { slots: [subtype, type3Payload] }),
    pools[2]
  )
  // 模板（2137）：去 f504/自引用→T + subtype v3 + 队列双引用 + 样式引用→模板池
  const tplBody = remapUiRecordVarints(dropParentAndSetId(target.raw, templateId), {
    [oldSelf]: templateId
  })
  const tplRecord = sideRefs(
    spliceRecordSlots(tplBody, { slots: [subtype, type4Queue] }),
    pools[1]
  )
  // 库实例（2142）：官方内容副本，f504=1840/自引用→L + subtype+type3 + 样式引用→库池
  const libRaw = remapUiRecordVarints(target.raw, {
    [oldSelf]: libraryId,
    [oldParent]: LIBRARY_CONTAINER_ID
  })
  const libRecord = sideRefs(
    spliceRecordSlots(libRaw, { slots: [subtype, type3Payload] }),
    pools[0]
  )
  // 树克隆
  const cloneTree = (pool: (typeof pools)[number]): Uint8Array[] => {
    const out: Uint8Array[] = []
    for (let i = 0; i < 2; i++) {
      const gNew = i === 0 ? pool.gImg : pool.gTxt
      const mNew = i === 0 ? pool.mImg : pool.mTxt
      const gOld = oldGroups[i]
      const mOld = oldMembers[i]
      const g = parsed.recordsById.get(gOld)!
      const m = parsed.recordsById.get(mOld)!
      out.push(
        remapUiRecordVarints(normalizeGroupSlots(g.raw), { [gOld]: gNew, [mOld]: mNew })
      )
      out.push(remapUiRecordVarints(m.raw, { [mOld]: mNew, [gOld]: gNew }))
    }
    return out
  }
  const oldTreeIds = new Set([...oldGroups, ...oldMembers])
  // 轮63 物理序：L、模板侧树、布局侧树、库侧树（orderB: 2142,2147-50,2151-54,2143-46）
  const block: Uint8Array[] = [
    libRecord,
    ...cloneTree(pools[1]),
    ...cloneTree(pools[2]),
    ...cloneTree(pools[0])
  ]

  const out = rebuildRoot9(bytes, (section) => {
    const outFields: WireField[] = []
    for (let i = 0; i < section.length; i++) {
      const field = section[i]
      if (field.number !== 502 || field.wire !== 2) {
        outFields.push(field)
        continue
      }
      const id = recordIdOf(field.value as Uint8Array)
      if (id === undefined) {
        outFields.push(field)
        continue
      }
      if (oldTreeIds.has(id)) continue // 旧树物理删除
      if (id === targetId) {
        outFields.push({ number: 502, wire: 2, value: upgraded })
        for (const raw of block) outFields.push({ number: 502, wire: 2, value: raw })
        continue
      }
      outFields.push(field)
    }
    // 模板插「模板簇」末尾：从首个 502 记录起连续 type4 模板之后（轮5 无前置→0；轮23/63 有前置→其后）
    let clusterStart = outFields.findIndex((f) => f.number === 502 && f.wire === 2)
    if (clusterStart < 0) clusterStart = outFields.length
    let insertAt = clusterStart
    for (let i = clusterStart; i < outFields.length; i++) {
      const f = outFields[i]
      if (f.number !== 502 || f.wire !== 2) break
      if (recordHasSlotType(f.value as Uint8Array, 4)) insertAt = i + 1
      else break
    }
    outFields.splice(insertAt, 0, { number: 502, wire: 2, value: tplRecord })
    appendToContainerMembers(outFields, LIBRARY_CONTAINER_ID, libraryId)
    // 顶层索引重建：parentless（无 f504）记录按最终物理序（轮63 证据：组/模板/容器随物理序）
    const indexIds2: number[] = []
    for (const f of outFields) {
      if (f.number !== 502 || f.wire !== 2) continue
      const raw = f.value as Uint8Array
      if (parentIdOf(raw) === undefined) {
        const id2 = recordIdOf(raw)
        if (id2 !== undefined) indexIds2.push(id2)
      }
    }
    const indexField = outFields.find((f) => f.number === 501 && f.wire === 2)
    if (!indexField) throw new Error('[error] 顶层索引缺失')
    indexField.value = encodePackedVarints(indexIds2)
    section.length = 0
    section.push(...outFields)
  })
  return { bytes: out, templateId, instanceId: targetId, libraryInstanceId: libraryId }
}

/** 槽内嵌套 id 改写：找 marker=typeCode 的 f502 槽 → 槽 payload 内 field=msgFieldNum 的 msg → 首个 wire0 varint 替换 */
function setSlotNestedId(raw: Uint8Array, typeCode: number, msgFieldNum: number, newId: number): Uint8Array {
  const fields = parseWireMessage(raw)
  if (!fields) throw new Error('[error] 记录解析失败')
  let done = false
  const out = fields.map((field) => {
    if (done || field.number !== 502 || field.wire !== 2) return field
    const slot = parseWireMessage(field.value as Uint8Array)
    if (
      !slot?.some((x) => x.number === 502 && x.wire === 0 && x.value === typeCode)
    ) {
      return field
    }
    const msgField = slot.find((x) => x.number === msgFieldNum && x.wire === 2)
    if (!msgField) return field
    const msg = parseWireMessage(msgField.value as Uint8Array)
    if (!msg) return field
    const link = msg.find((x) => x.wire === 0)
    if (!link) return field
    link.value = newId
    msgField.value = emitWireMessage(msg)
    field.value = emitWireMessage(slot)
    done = true
    return field
  })
  if (!done) throw new Error(`[error] type${typeCode} 槽嵌套 id 未命中`)
  return emitWireMessage(out)
}

/** 模板 type4 槽的 f14 实例列表整体改写（空列表=f14 空 msg 保留，样本 补充2-6） */
function setTemplateInstanceList(raw: Uint8Array, instanceIds: number[]): Uint8Array {
  const fields = parseWireMessage(raw)
  if (!fields) throw new Error('[error] 记录解析失败')
  let done = false
  const out = fields.map((field) => {
    if (done || field.number !== 502 || field.wire !== 2) return field
    const slot = parseWireMessage(field.value as Uint8Array)
    if (!slot?.some((x) => x.number === 502 && x.wire === 0 && x.value === 4)) return field
    const f14 = slot.find((x) => x.number === 14 && x.wire === 2)
    if (!f14) return field
    f14.value =
      instanceIds.length === 0
        ? new Uint8Array(0)
        : emitWireMessage([{ number: 501, wire: 2, value: encodePackedVarints(instanceIds) }])
    field.value = emitWireMessage(slot)
    done = true
    return field
  })
  if (!done) throw new Error('[error] type4 槽缺失')
  return emitWireMessage(out)
}

/** 从实例记录构造模板记录：去 f504/自引用→模板ID + type3 槽换 type4（f14=[实例]） + 样式引用→克隆组 */
function buildTemplateFromInstance(
  instanceRaw: Uint8Array,
  templateId: number,
  sourceId: number,
  styleMap: Map<number, number>
): Uint8Array {
  const oldSelf = recordIdOf(instanceRaw)
  if (oldSelf === undefined) throw new Error('[error] 实例记录缺 f501')
  let record = dropParentAndSetId(instanceRaw, templateId)
  record = remapUiRecordVarints(record, { [oldSelf]: templateId })
  const type4 = remapUiRecordVarints(slotPayload(TPL_SLOTS.TYPE4_SINGLE), {
    1073742032: sourceId
  })
  record = replaceSlotPayload(record, 3, type4)
  const styleRemap: Record<number, number> = {}
  for (const [g, gNew] of styleMap) styleRemap[g] = gNew
  return remapUiRecordVarints(record, styleRemap)
}

export interface InstanceTemplateizeOptions {
  targetId: number
}

/**
 * 实例源「保存为模板」（样本 补充2-第6/10 步；kind=message-queue 已采样，其余 fail-closed）：
 * 新建模板（type4 f14=[实例]）+ 模板侧整树克隆（若有样式组）+ 实例 f13 重绑新模板 +
 * 所有旧模板 f14 移除该实例（空列表清空）+ 模板插模板簇末 + 克隆树插「模板树区域末」+
 * 索引=parentless 物理序重建。无库实例、源实例树保留、无删除。
 */
export function createInstanceTemplateCandidate(
  bytes: Uint8Array,
  targetId: number,
  pinTemplateId?: number
): TemplateizeResult {
  const parsed = parseRoot9(bytes)
  const target = parsed.recordsById.get(targetId)
  if (!target) throw new Error(`[error] 目标记录不存在: ${targetId}`)
  if (target.kind !== 'message-queue') {
    throw new Error(
      `[error] 实例源模板化仅 message-queue 有样本（补充2-6/10）；kind=${target.kind} fail-closed`
    )
  }
  // 样式组及其成员（成员按物理序）
  const refs = collectQueueStyleRefs(target.raw)
  interface TreeItem { group: number; members: number[] }
  const trees: TreeItem[] = refs.map((g) => ({
    group: g,
    members: parsed.records.filter((r) => r.parentId === g).map((r) => r.id)
  }))
  const cloneCount = trees.reduce((n, t) => n + 1 + t.members.length, 0)
  const ids = allocateIds(bytes, 1 + cloneCount, pinTemplateId)
  const templateId = ids[0]
  let next = 1
  const styleMap = new Map<number, number>()
  const clones: Uint8Array[] = []
  for (const t of trees) {
    const gOld = t.group
    const gNew = ids[next++]
    const g = parsed.recordsById.get(gOld)
    if (!g) throw new Error(`[error] 样式组缺失 ${gOld}`)
    const memberMap: Record<number, number> = {}
    for (const mOld of t.members) {
      memberMap[mOld] = ids[next++]
    }
    clones.push(remapUiRecordVarints(normalizeGroupSlots(g.raw), { [gOld]: gNew, ...memberMap }))
    styleMap.set(gOld, gNew)
    for (const mOld of t.members) {
      const m = parsed.recordsById.get(mOld)
      if (!m) throw new Error(`[error] 成员缺失 ${mOld}`)
      clones.push(remapUiRecordVarints(m.raw, { [mOld]: memberMap[mOld], [gOld]: gNew }))
    }
  }
  let templateRecord = buildTemplateFromInstance(target.raw, templateId, targetId, styleMap)
  let reboundInstance = setSlotNestedId(target.raw, 3, 13, templateId)
  // 实例源每次再存：实例与新模板同取「原名_1」（补充2-第6/10 步：_1→_1_1→_1_1_1）
  const newName = `${target.name}_1`
  templateRecord = setUiControlName(templateRecord, newName)
  reboundInstance = setUiControlName(reboundInstance, newName)
  // 旧模板 f14 移除本实例
  const templateIds: number[] = []
  for (const r of parsed.records) {
    if (recordHasSlotType(r.raw, 4) && r.id !== templateId) templateIds.push(r.id)
  }
  const out = rebuildRoot9(bytes, (section) => {
    const outFields: WireField[] = []
    const updates = new Map<number, Uint8Array>()
    for (const tplId of templateIds) {
      const tpl = parsed.recordsById.get(tplId)!
      const slotMsg = findSlotPayload(tpl.raw, 4)
      const f14 = slotMsg ? parseWireMessage(slotMsg)?.find((x) => x.number === 14 && x.wire === 2) : undefined
      const f14msg = f14 ? parseWireMessage(f14.value as Uint8Array) : undefined
      const packedField = f14msg?.find((x) => x.number === 501 && x.wire === 2)
      const list = packedField ? packedVarints(packedField.value as Uint8Array) : []
      if (list.includes(targetId)) {
        updates.set(tplId, setTemplateInstanceList(tpl.raw, list.filter((x) => x !== targetId)))
      }
    }
    const templateTreeIds = new Set<number>()
    for (const tplId of templateIds) {
      const tpl = parsed.recordsById.get(tplId)!
      for (const g of collectQueueStyleRefs(tpl.raw)) {
        templateTreeIds.add(g)
        for (const r of parsed.records) if (r.parentId === g) templateTreeIds.add(r.id)
      }
    }
    // 建 outFields：替换实例字段/旧模板字段，跳过被替换记录的旧引用
    let lastTemplateTreePos = -1
    let pos = 0
    for (const field of section) {
      if (field.number !== 502 || field.wire !== 2) {
        outFields.push(field)
        pos++
        continue
      }
      const id = recordIdOf(field.value as Uint8Array)
      if (id === undefined) {
        outFields.push(field)
        pos++
        continue
      }
      const upd = updates.get(id)
      if (upd !== undefined) {
        outFields.push({ number: 502, wire: 2, value: upd })
        pos++
        continue
      }
      if (id === targetId) {
        outFields.push({ number: 502, wire: 2, value: reboundInstance })
        pos++
        continue
      }
      outFields.push(field)
      if (templateTreeIds.has(id)) lastTemplateTreePos = pos
      pos++
    }
    // 模板插模板簇末
    let clusterStart = outFields.findIndex((f) => f.number === 502 && f.wire === 2)
    if (clusterStart < 0) clusterStart = outFields.length
    let insertAt = clusterStart
    for (let i = clusterStart; i < outFields.length; i++) {
      const f = outFields[i]
      if (f.number !== 502 || f.wire !== 2) break
      if (recordHasSlotType(f.value as Uint8Array, 4)) insertAt = i + 1
      else break
    }
    outFields.splice(insertAt, 0, { number: 502, wire: 2, value: templateRecord })
    if (clones.length > 0) {
      // 模板已插簇首（索引整体 +1）：重扫一遍按最终索引定模板树区域末尾
      let treeEnd = -1
      for (let i = clusterStart; i < outFields.length; i++) {
        const f = outFields[i]
        if (f.number !== 502 || f.wire !== 2) continue
        const id = recordIdOf(f.value as Uint8Array)
        if (id !== undefined && templateTreeIds.has(id)) treeEnd = i + 1
      }
      if (treeEnd < 0) treeEnd = insertAt + 1
      const cloneFields: WireField[] = clones.map((value) => ({ number: 502, wire: 2, value }))
      outFields.splice(treeEnd, 0, ...cloneFields)
    }
    // 索引=parentless 物理序
    const indexIds2: number[] = []
    for (const f of outFields) {
      if (f.number !== 502 || f.wire !== 2) continue
      const raw = f.value as Uint8Array
      if (parentIdOf(raw) === undefined) {
        const id2 = recordIdOf(raw)
        if (id2 !== undefined) indexIds2.push(id2)
      }
    }
    const indexField = outFields.find((f) => f.number === 501 && f.wire === 2)
    if (!indexField) throw new Error('[error] 顶层索引缺失')
    indexField.value = encodePackedVarints(indexIds2)
    section.length = 0
    section.push(...outFields)
  })
  return { bytes: out, templateId, instanceId: targetId }
}

/**
 * 官方单条 → 模板（可选自动库实例）。只读候选。
 * 分派：实例源（type3）→ createInstanceTemplateCandidate；官方×无样式（消息队列）→ 通用
 * 单条路径（模板+升格）；官方×带样式（消息队列，round63 三合一）→ queueTemplateizeCandidate
 * （记录级已闭合；物理插入位单样本，CLI 未开放）。
 */
export function createTemplateCandidate(
  bytes: Uint8Array,
  options: TemplateizeOptions
): TemplateizeResult {
  const parsed = parseRoot9(bytes)
  const target = parsed.recordsById.get(options.targetId)
  if (!target) throw new Error(`[error] 目标记录不存在: ${options.targetId}`)
  // 实例源（type3 槽）：新增模板 + 重绑 + 旧模板 f14 清实例 + （实例带样式树时）模板侧整树克隆
  if (recordHasSlotType(target.raw, 3) && !recordHasSlotType(target.raw, 4)) {
    if (options.autoLibrary) {
      throw new Error('[error] 实例源「保存为模板」无库实例（样本补充2-6/10）；勿设 autoLibrary')
    }
    return createInstanceTemplateCandidate(bytes, options.targetId, options.templateId)
  }
  if (!recordHasSlotType(target.raw, 5) || recordHasSlotType(target.raw, 3) || recordHasSlotType(target.raw, 4)) {
    throw new Error(
      `[error] 目标 ${options.targetId} 非官方单条（须仅含 type5 槽，实例/模板带 type3/type4 槽）——模板化起点须为官方单条`
    )
  }
  if (target.kind === 'message-queue') {
    const refs = collectQueueStyleRefs(target.raw)
    if (refs.length === 0) {
      if (options.autoLibrary) {
        throw new Error('[error] 官方无样式队列模板化=模板+升格（样本补充2-第2步），无库实例——勿设 autoLibrary')
      }
      // 落入下方通用官方路径（subtype v3 自动按 kind 选）
    } else {
      if (!options.autoLibrary) {
        throw new Error('[error] 队列带样式模板化样本=三合一（轮63）须 autoLibrary=true；物理插入位仍单样本待复刻')
      }
      return queueTemplateizeCandidate(bytes, options.targetId)
    }
  }
  const ids = allocateIds(bytes, options.autoLibrary ? 2 : 1, options.templateId)
  const templateId = ids[0]
  const subtypePayload = subtypeSlotPayload(maxVisibleFamilyOrdinal(bytes) + 1)

  let templateRecord = buildTemplateRecord(target.raw, templateId, options.targetId, subtypePayload)
  let upgradedInstance = upgradeToInstance(target.raw, templateId, subtypePayload)
  if (target.kind === 'message-queue') {
    // 队列升格实例成为运行时实例后与同名既有队列避让（补充2-第2步：消息队列→消息队列_1）
    const duplicateName = parsed.records.some(
      (r) => r.id !== options.targetId && r.kind === 'message-queue' && r.name === target.name
    )
    if (duplicateName) {
      const newName = `${target.name}_1`
      upgradedInstance = setUiControlName(upgradedInstance, newName)
      templateRecord = setUiControlName(templateRecord, newName)
    }
  }
  if (options.autoLibrary && target.kind === 'input-box') {
    // 输入框族三合一深链（轮23 实证路径 505.503.19.62.501）：实例→模板；模板→自动库实例
    const libraryId = ids[1]
    upgradedInstance = replaceInputDeepLink(upgradedInstance, templateId)
    templateRecord = replaceInputDeepLink(templateRecord, libraryId)
  }

  let out = rebuildRoot9(bytes, (section) => {
    const targetIndex = section.findIndex((f) => ownIdOf(f) === options.targetId)
    if (targetIndex < 0) throw new Error(`[error] 目标记录字段缺失: ${options.targetId}`)
    section[targetIndex] = { number: 502, wire: 2, value: upgradedInstance }
    // 模板插到「模板簇末尾」：从首个 502 记录起，连续 type4 模板之后（轮5 无前置→0；轮23 前置 2033→其后）
    const firstRecord = section.findIndex((f) => f.number === 502 && f.wire === 2)
    let insertAt = firstRecord
    for (let i = firstRecord; i < section.length; i++) {
      const f = section[i]
      if (f.number !== 502 || f.wire !== 2) break
      const raw = f.value as Uint8Array
      const isTemplate =
        recordIdOf(raw) !== options.targetId &&
        recordHasSlotType(raw, 4) === true
      if (!isTemplate) break
      insertAt = i + 1
    }
    section.splice(insertAt, 0, { number: 502, wire: 2, value: templateRecord })
    // 顶层索引：插到索引头「连续模板簇」之后（轮5 无前置→头部；轮23 前置 2033→其后）
    const indexField = section.find((f) => f.number === 501 && f.wire === 2)
    if (!indexField) throw new Error('[error] 顶层索引缺失')
    const indexIds = packedVarints(indexField.value as Uint8Array)
    if (!indexIds.includes(templateId)) {
      let indexAt = 0
      for (let i = 0; i < indexIds.length; i++) {
        const idRec = parsed.recordsById.get(indexIds[i])
        if (idRec && recordHasSlotType(idRec.raw, 4)) indexAt = i + 1
        else break
      }
      indexIds.splice(indexAt, 0, templateId)
      indexField.value = encodePackedVarints(indexIds)
    }
  })

  if (options.autoLibrary) {
    const libraryId = ids[1]
    const instanceRaw = toLibraryInstance(upgradedInstance, libraryId)
    out = rebuildRoot9(out, (section) => {
      const at = libraryInsertIndex(section)
      section.splice(at, 0, { number: 502, wire: 2, value: instanceRaw })
      appendToContainerMembers(section, LIBRARY_CONTAINER_ID, libraryId)
      const tplIndex = section.findIndex((f) => ownIdOf(f) === templateId)
      if (tplIndex < 0) throw new Error('[error] 模板记录缺失')
      const tplField = section[tplIndex]
      const doublePayload = remapUiRecordVarints(slotPayload(TPL_SLOTS.TYPE4_DOUBLE), {
        1073742032: options.targetId,
        1073742034: libraryId
      })
      tplField.value = replaceSlotPayload(
        tplField.value as Uint8Array,
        4,
        doublePayload
      )
    })
  }

  return {
    bytes: out,
    templateId,
    instanceId: options.targetId,
    ...(options.autoLibrary ? { libraryInstanceId: ids[1] } : {})
  }
}

export interface InstantiateToLibraryOptions {
  /** 模板记录 ID（其 f14 backref 首项 = 源实例） */
  templateId: number
}

/**
 * 模板 → 库详情实例（轮5→6）。只读候选。
 */
export function instantiateToLibrary(
  bytes: Uint8Array,
  options: InstantiateToLibraryOptions
): { bytes: Uint8Array; instanceId: number; templateId: number } {
  const parsed = parseRoot9(bytes)
  const tpl = parsed.recordsById.get(options.templateId)
  if (!tpl) throw new Error(`[error] 模板记录不存在: ${options.templateId}`)
  if (!recordHasSlotType(tpl.raw, 4)) {
    throw new Error(`[error] ${options.templateId} 缺 type4 槽——非模板`)
  }
  // 源实例 = 模板 type4 槽内 f14 嵌套 msg 的 f501 packed backref 首项
  const f14 = findSlotPayload(tpl.raw, 4)
  if (!f14) throw new Error('[error] 模板 type4 槽缺失')
  const slotMsg = parseWireMessage(f14)
  const refMsgField = slotMsg?.find((f) => f.number === 14 && f.wire === 2)
  const refInner = refMsgField ? parseWireMessage(refMsgField.value as Uint8Array) : undefined
  const packedField = refInner?.find((f) => f.number === 501 && f.wire === 2)
  if (!packedField) throw new Error('[error] type4 槽缺 f14.f501 packed backref')
  const backrefs = packedVarints(packedField.value as Uint8Array)
  if (backrefs.length === 0) throw new Error('[error] 模板 backref 为空')
  const sourceId = backrefs[0]
  const source = parsed.recordsById.get(sourceId)
  if (!source) throw new Error(`[error] 源实例缺失: ${sourceId}`)

  const [instanceId] = tailIds(bytes, 1)
  const instanceRaw = toLibraryInstance(source.raw, instanceId)
  const templateId = options.templateId

  const out = rebuildRoot9(bytes, (section) => {
    const at = libraryInsertIndex(section)
    section.splice(at, 0, { number: 502, wire: 2, value: instanceRaw })
    appendToContainerMembers(section, LIBRARY_CONTAINER_ID, instanceId)
    const tplIndex = section.findIndex((f) => ownIdOf(f) === templateId)
    if (tplIndex < 0) throw new Error('[error] 模板记录缺失')
    const tplField = section[tplIndex]
    const doublePayload = remapUiRecordVarints(slotPayload(TPL_SLOTS.TYPE4_DOUBLE), {
      1073742032: sourceId,
      1073742034: instanceId
    })
    tplField.value = replaceSlotPayload(tplField.value as Uint8Array, 4, doublePayload)
  })

  return { bytes: out, instanceId, templateId }
}

function findSlotPayload(raw: Uint8Array, typeCode: number): Uint8Array | undefined {
  const fields = parseWireMessage(raw)
  if (!fields) return undefined
  for (const f of fields) {
    if (f.number !== 502 || f.wire !== 2) continue
    const inner = parseWireMessage(f.value as Uint8Array)
    if (
      inner?.some((x) => x.number === 502 && x.wire === 0 && x.value === typeCode)
    ) {
      return f.value as Uint8Array
    }
  }
  return undefined
}

function replaceSlotPayload(raw: Uint8Array, typeCode: number, newPayload: Uint8Array): Uint8Array {
  const fields = parseWireMessage(raw)
  if (!fields) throw new Error('[error] 记录解析失败')
  let replaced = false
  const out = fields.map((field) => {
    if (replaced || field.number !== 502 || field.wire !== 2) return field
    const inner = parseWireMessage(field.value as Uint8Array)
    if (
      !inner?.some((x) => x.number === 502 && x.wire === 0 && x.value === typeCode)
    ) {
      return field
    }
    replaced = true
    return { ...field, value: newPayload }
  })
  if (!replaced) throw new Error(`[error] 记录缺少 type${typeCode} 槽`)
  return emitWireMessage(out)
}
