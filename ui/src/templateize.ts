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
import { remapUiRecordVarints } from '../../src/cli/gil_ui.js'
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

/** subtype6 槽按家族取真实样本变体（按钮 v1 / 输入框 v2 / 队列 v3=0x0a；其余无样本 fail-closed） */
function subtypeSlotByKind(kind: string): Uint8Array {
  if (kind === 'input-box') return slotPayload(TPL_SLOTS.SUBTYPE_V2)
  if (kind === 'message-queue') return slotPayload(TPL_SLOTS.SUBTYPE_V3)
  if (kind === 'custom-button') return slotPayload(TPL_SLOTS.SUBTYPE)
  throw new Error(
    `[error] 模板化未支持 kind=${kind} 的 subtype 槽变体（仅按钮/输入框/队列有样本；其余 fail-closed）`
  )
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
  kind: string
): Uint8Array {
  const oldSelf = recordIdOf(officialRaw)
  if (oldSelf === undefined) throw new Error('[error] 官方记录缺 f501')
  let record = dropParentAndSetId(officialRaw, templateId)
  record = remapUiRecordVarints(record, { [oldSelf]: templateId })
  const type4 = remapUiRecordVarints(slotPayload(TPL_SLOTS.TYPE4_SINGLE), {
    1073742032: instanceId
  })
  return spliceRecordSlots(record, {
    slots: [subtypeSlotByKind(kind), type4]
  })
}

/** 实例升级：官方记录追加 subtype + type3（f13=templateId） */
function upgradeToInstance(officialRaw: Uint8Array, templateId: number, kind: string): Uint8Array {
  const type3 = remapUiRecordVarints(slotPayload(TPL_SLOTS.TYPE3_SINGLE), {
    1073742033: templateId
  })
  return spliceRecordSlots(officialRaw, {
    slots: [subtypeSlotByKind(kind), type3]
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
  const fields = parseWireMessage(target.raw)
  if (!fields) throw new Error('[error] 队列记录解析失败')
  const f505s = fields.filter((f) => f.number === 505 && f.wire === 2)
  const styleRefs: number[] = []
  for (const f505 of f505s) {
    const m505 = parseWireMessage(f505.value as Uint8Array)
    if (!m505) continue
    const f503s = m505.filter((f) => f.number === 503 && f.wire === 2)
    for (const f503 of f503s) {
      const m503 = parseWireMessage(f503.value as Uint8Array)
      if (!m503) continue
      const f69s = m503.filter((f) => f.number === 69 && f.wire === 2)
      const collect = (list: WireField[]): void => {
        for (const f of list) {
          if (f.wire === 0 && f.number === 4) styleRefs.push(f.value as number)
          if (f.wire === 2) {
            const sub = parseWireMessage(f.value as Uint8Array)
            if (sub) collect(sub)
          }
        }
      }
      for (const f69 of f69s) {
        const m69 = parseWireMessage(f69.value as Uint8Array)
        if (m69) collect(m69)
      }
    }
  }
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
  const subtype = subtypeSlotByKind('message-queue')
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

/**
 * 官方单条 → 模板（可选自动库实例）。只读候选。
 */
export function createTemplateCandidate(
  bytes: Uint8Array,
  options: TemplateizeOptions
): TemplateizeResult {
  const parsed = parseRoot9(bytes)
  const target = parsed.recordsById.get(options.targetId)
  if (!target) throw new Error(`[error] 目标记录不存在: ${options.targetId}`)
  if (!recordHasSlotType(target.raw, 5) || recordHasSlotType(target.raw, 3) || recordHasSlotType(target.raw, 4)) {
    throw new Error(
      `[error] 目标 ${options.targetId} 非官方单条（须仅含 type5 槽，实例/模板带 type3/type4 槽）——模板化起点须为官方单条`
    )
  }
  if (target.kind === 'message-queue') {
    if (!options.autoLibrary) {
      throw new Error('[error] 队列族模板化样本=三合一（轮63），须 autoLibrary=true')
    }
    return queueTemplateizeCandidate(bytes, options.targetId)
  }
  const ids = tailIds(bytes, options.autoLibrary ? 2 : 1)
  const templateId = ids[0]

  let templateRecord = buildTemplateRecord(target.raw, templateId, options.targetId, target.kind)
  let upgradedInstance = upgradeToInstance(target.raw, templateId, target.kind)
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
