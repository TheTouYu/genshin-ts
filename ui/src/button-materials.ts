/**
 * ui/src/button-materials.ts — 给自定义按钮装配三态文字素材（票09 R2）
 *
 * 语义：目标 = 默认布局中的 custom-button 官方单条（四态骨架在、素材空）。
 * 装配：为 常态/悬停/按下 三态各克隆一个"状态素材组"（type55 组 + 组内官方文本框成员），
 * 把按钮 t50 状态块 1-3 的素材引用指向新组，并按用户验收方案设文字颜色与缩放：
 *   常态 白字/1.0，悬停 黄字/1.1，按下 灰字/0.9（悬停缩放 1.1 与按下 0.9 为编辑器真实样本字节，
 *   颜色值沿用样本常态白/悬停黄，按下灰 0xFF808080 为参数语义写入同一 f510 字段）。
 * 全部新字节形状来自真实样本（重启8 常态组 2041/重启28 悬浮组 2044，见 button-material-donors.ts），
 * 只替换文本内容与颜色、重映射 ID/引用/成员列表/顶层索引——不手拼未知子结构（fail-closed）。
 *
 * 本模块是纯函数：输入完整 GIL bytes → 输出候选完整 bytes，不读盘不写盘。
 */
import { buildFile, encodeVarint, readUint32BE } from '../../src/injector/binary.js'
import { remapUiRecordVarints } from '../../src/cli/gil_ui.js'
import { emitWireMessage, parseWireMessage, type WireField } from '../../src/cli/static_assembly/wire.js'
import { packedVarints, parseRoot9 } from './record.js'
import { BUTTON_MATERIAL_DONORS } from './button-material-donors.js'

export interface ButtonMaterialOptions {
  targetId: number
  /** 按钮文字标签（三态共用） */
  label: string
}

export interface ButtonMaterialResult {
  bytes: Uint8Array
  newIds: { group: number[]; member: number[] }
  stateGroupIds: [number, number, number]
}

// 颜色 = f510 varint ARGB（与编辑器文字色同字段；常态/悬停取真实样本值，按下灰为参数语义）
const COLOR_NORMAL = 0xffffffff // 样本 2042 f510（白）
const COLOR_HOVER = 0xffb4cd23 // 样本 2069 f510（≈黄，-4906205>>>0）
const COLOR_PRESS = 0xff808080 // 按下灰（用户方案；机制同字段，色值参数化）
// 缩放 = 状态块 f504 fixed32 对（真实样本字节：1.1f cdcc8c3f / 0.9f 6666663f）
const SCALE_NORMAL = 1.0
const SCALE_HOVER = 1.1
const SCALE_PRESS = 0.9

function hexToBytes(h: string): Uint8Array {
  const b = Buffer.from(h, 'hex')
  return new Uint8Array(b.buffer, b.byteOffset, b.byteLength)
}

function donorSet(key: 'normal' | 'hover') {
  const set = BUTTON_MATERIAL_DONORS.find((s) => s.key === key)
  if (!set) throw new Error(`[error] button material donor ${key} 缺失（先跑 ui/tests/extract-button-material-donors.ts）`)
  return set
}

function usedIdSet(parsed: ReturnType<typeof parseRoot9>): Set<number> {
  const used = new Set<number>()
  for (const r of parsed.records) used.add(r.id)
  for (const id of parsed.indexIds) used.add(id)
  return used
}

/** 连续分配 n 个未占用 ID（尾部接续；本票地图无编辑器空洞，与 create 分配器同向）。
 *  票10 起导出复用：素材成员/组 ID 分配（组+成员连续对 = 轮16 编辑器形态） */
export function allocateIds(used: Set<number>, n: number): number[] {
  const out: number[] = []
  let cursor = Math.max(1073741840, ...used) + 1
  while (out.length < n) {
    if (!used.has(cursor)) {
      used.add(cursor)
      out.push(cursor)
    }
    cursor++
  }
  return out
}

function w0(number: number, value: number): WireField {
  return { number, wire: 0, value }
}
function w2(number: number, value: Uint8Array): WireField {
  return { number, wire: 2, value }
}
function f32pair(x: number, y: number): Uint8Array {
  const bx = Buffer.alloc(4)
  bx.writeFloatLE(x, 0)
  const by = Buffer.alloc(4)
  by.writeFloatLE(y, 0)
  return emitWireMessage([
    { number: 501, wire: 5, value: new Uint8Array(bx) },
    { number: 502, wire: 5, value: new Uint8Array(by) }
  ])
}

/** 素材成员 = 内联官方文本框控件：把 t25 组件 f19 里的文本(f505)与颜色(f510) 改写
 *  （票10 起导出复用：素材成员 update 命令与 add 命令共用同一改写原语） */
export function patchTextMember(raw: Uint8Array, text: string, color: number): Uint8Array {
  const m = parseWireMessage(raw)
  if (!m) throw new Error('[error] member record parse failed')
  let hit = false
  for (const slot of m) {
    if (slot.number !== 505 || slot.wire !== 2) continue
    const comp = parseWireMessage(slot.value as Uint8Array)
    if (!comp) continue
    const compType = comp.find((x) => x.number === 502 && x.wire === 0)?.value
    if (compType !== 25) continue // t25 文本框配置
    const f503 = comp.find((x) => x.number === 503 && x.wire === 2)
    if (!f503) throw new Error('[error] t25 组件缺 f503 容器')
    const c503 = parseWireMessage(f503.value as Uint8Array)
    if (!c503) throw new Error('[error] t25 f503 解析失败')
    const f19f = c503.find((x) => x.number === 19 && x.wire === 2)
    if (!f19f) throw new Error('[error] t25 缺 f19 文本配置容器')
    const f19 = parseWireMessage(f19f.value as Uint8Array)
    if (!f19) throw new Error('[error] f19 解析失败')
    const textBytes = Buffer.from(text, 'utf8')
    const f505 = f19.find((x) => x.number === 505 && x.wire === 2)
    if (f505) {
      f505.value = emitWireMessage([w2(501, new Uint8Array(textBytes))])
    } else {
      f19.push(w2(505, emitWireMessage([w2(501, new Uint8Array(textBytes))])))
    }
    const f510 = f19.find((x) => x.number === 510 && x.wire === 0)
    if (f510) {
      f510.value = color >>> 0
    } else {
      f19.push(w0(510, color >>> 0))
    }
    f19f.value = emitWireMessage(f19)
    c503.forEach((x) => {
      if (x.number === 19) x.value = f19f.value
    })
    f503.value = emitWireMessage(c503)
    comp.forEach((x) => {
      if (x.number === 503) x.value = f503.value
    })
    slot.value = emitWireMessage(comp)
    hit = true
    break
  }
  if (!hit) throw new Error('[error] 成员记录无 t25 文本框组件（不是文字素材？）')
  return emitWireMessage(m)
}

/** 生成状态素材引用消息 {2:1, 3:8, 4:组ID}（编辑器样本形态） */
function materialRef(groupId: number): Uint8Array {
  return emitWireMessage([w0(2, 1), w0(3, 8), w0(4, groupId)])
}

/**
 * 改按钮 t50 状态块：第 idx 块（0 常态/1 悬停/2 按下）设素材引用与缩放。
 * 状态容器为打包式：f43.f503(field503) 内 msg 的 501..504 号字段 = 4 个块。
 */
function setButtonState(
  recordRaw: Uint8Array,
  states: Array<{ idx: number; groupId: number; scale: number }>
): Uint8Array {
  const m = parseWireMessage(recordRaw)
  if (!m) throw new Error('[error] button record parse failed')
  let hit = false
  for (const slot of m) {
    if (slot.number !== 505 || slot.wire !== 2) continue
    const comp = parseWireMessage(slot.value as Uint8Array)
    if (!comp) continue
    const compType = comp.find((x) => x.number === 502 && x.wire === 0)?.value
    if (compType !== 50) continue // t50 状态
    const f503 = comp.find((x) => x.number === 503 && x.wire === 2)
    const f503m = f503 ? parseWireMessage(f503.value as Uint8Array) : undefined
    const f43 = f503m?.find((x) => x.number === 43 && x.wire === 2)
    const f43m = f43 ? parseWireMessage(f43.value as Uint8Array) : undefined
    const container = f43m?.find((x) => x.number === 503 && x.wire === 2)
    const containerMsg = container ? parseWireMessage(container.value as Uint8Array) : undefined
    if (!containerMsg) throw new Error('[error] t50 f43 状态容器缺失')
    // 按块序号改 field 501+idx（打包式：f43.f503 内 msg 的 501..504 = 4 个块）
    for (const s of states) {
      const bf = containerMsg.find((x) => x.number === 501 + s.idx)
      if (!bf || bf.wire !== 2) throw new Error(`[error] 状态块 f${501 + s.idx} 缺失`)
      const block = parseWireMessage(bf.value as Uint8Array)
      if (!block) throw new Error('[error] 状态块解析失败')
      const ref = block.find((x) => x.number === 501 && x.wire === 2)
      if (ref && (ref.value as Uint8Array).length > 0) {
        throw new Error(`[error] 状态块 ${s.idx} 已有素材（幂等拒绝：先回滚再重配）`)
      }
      if (ref) ref.value = materialRef(s.groupId)
      else block.push(w2(501, materialRef(s.groupId)))
      const scale = block.find((x) => x.number === 504 && x.wire === 2)
      if (scale) scale.value = f32pair(s.scale, s.scale)
      else block.push(w2(504, f32pair(s.scale, s.scale)))
      bf.value = emitWireMessage(block)
    }
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
    hit = true
    break
  }
  if (!hit) throw new Error('[error] 目标不是 custom-button（无 t50 状态组件）')
  return emitWireMessage(m)
}

/** 克隆一组素材（组 + 成员），重映射 ID/引用并改文字/颜色 */
function cloneStateSet(
  donorKey: 'normal' | 'hover',
  label: string,
  color: number,
  oldToNew: Record<number, number>,
  textMemberOldId: number
): { groupRaw: Uint8Array; memberRaws: Uint8Array[]; groupNewId: number } {
  const set = donorSet(donorKey)
  const groupNewId = oldToNew[set.group.id]
  if (groupNewId === undefined) throw new Error('[error] group new id missing')
  const groupRaw = remapUiRecordVarints(hexToBytes(set.group.rawHex), oldToNew)
  const memberRaws: Uint8Array[] = []
  for (const mem of set.members) {
    let raw = remapUiRecordVarints(hexToBytes(mem.rawHex), oldToNew)
    if (mem.id === textMemberOldId) raw = patchTextMember(raw, label, color)
    memberRaws.push(raw)
  }
  return { groupRaw, memberRaws, groupNewId }
}

export function buildButtonMaterialCandidate(
  sourceBytes: Uint8Array,
  options: ButtonMaterialOptions
): ButtonMaterialResult {
  const { targetId, label } = options
  if (!label) throw new Error('[error] label 不能为空')
  const parsed = parseRoot9(sourceBytes)
  const target = parsed.recordsById.get(targetId)
  if (!target) throw new Error(`[error] 目标控件 ${targetId} 不存在`)

  const normalSet = donorSet('normal')
  const hoverSet = donorSet('hover')
  const normalTextMember = normalSet.members.find((x) => x.kind === 'textbox')
  const hoverTextMember = hoverSet.members.find((x) => x.kind === 'textbox')
  if (!normalTextMember || !hoverTextMember)
    throw new Error('[error] donor 成员缺文本框（textbox kind）')

  // 分配新 ID：3 组 + 2(常态成员) + 1(悬停成员) + 1(按下成员)
  const used = usedIdSet(parsed)
  const ids = allocateIds(used, 6)
  const [gN, gH, gP, mN1, mN2, mH] = ids
  const [mP] = allocateIds(used, 1)

  const normalOldToNew: Record<number, number> = {
    [normalSet.group.id]: gN,
    [normalSet.members[0].id]: mN1,
    [normalSet.members[1].id]: mN2
  }
  const normal = cloneStateSet('normal', label, COLOR_NORMAL, normalOldToNew, normalTextMember.id)
  const hoverOldToNew: Record<number, number> = {
    [hoverSet.group.id]: gH,
    [hoverSet.members[0].id]: mH
  }
  const hover = cloneStateSet('hover', label, COLOR_HOVER, hoverOldToNew, hoverTextMember.id)
  // 按下组 = 悬停组结构克隆（单文本框成员，灰字）
  const pressOldToNew: Record<number, number> = {
    [hoverSet.group.id]: gP,
    [hoverSet.members[0].id]: mP
  }
  const press = cloneStateSet('hover', label, COLOR_PRESS, pressOldToNew, hoverTextMember.id)

  // 改按钮三态状态块
  const newButtonRaw = setButtonState(target.raw, [
    { idx: 0, groupId: gN, scale: SCALE_NORMAL },
    { idx: 1, groupId: gH, scale: SCALE_HOVER },
    { idx: 2, groupId: gP, scale: SCALE_PRESS }
  ])

  // 整文件装配：替换按钮记录 + 组/成员追加段尾 + 顶层索引追加组 ID
  const top = parseWireMessage(sourceBytes.subarray(20, sourceBytes.length - 4))
  if (!top) throw new Error('[error] malformed GIL payload')
  const root9 = top.find((f) => f.number === 9 && f.wire === 2)
  if (!root9) throw new Error('[error] root9 missing')
  const section = parseWireMessage(root9.value as Uint8Array)
  if (!section) throw new Error('[error] root9 section parse failed')

  const targetField = section.find(
    (f) =>
      f.number === 502 &&
      f.wire === 2 &&
      parseWireMessage(f.value as Uint8Array)?.find((x) => x.number === 501 && x.wire === 0)?.value === targetId
  )
  if (!targetField) throw new Error('[error] 目标记录未找到（段级）')
  targetField.value = newButtonRaw

  const appendFields: WireField[] = []
  for (const g of [normal, hover, press]) {
    appendFields.push(w2(502, g.groupRaw))
    for (const mr of g.memberRaws) appendFields.push(w2(502, mr))
  }
  section.push(...appendFields)

  const indexField = section.find((f) => f.number === 501 && f.wire === 2)
  if (!indexField) throw new Error('[error] root9 顶层索引缺失')
  const indexIds = packedVarints(indexField.value as Uint8Array)
  for (const g of [gN, gH, gP]) {
    if (!indexIds.includes(g)) indexIds.push(g)
  }
  // 顶层索引 = packed varints（root9 f501 原始字节），无外层字段包裹
  indexField.value = Uint8Array.from(indexIds.flatMap((id) => Array.from(encodeVarint(id))))

  root9.value = emitWireMessage(section)
  const bytes = buildFile(emitWireMessage(top), {
    schema: readUint32BE(sourceBytes, 4),
    headTag: readUint32BE(sourceBytes, 8),
    fileType: readUint32BE(sourceBytes, 12),
    tailTag: readUint32BE(sourceBytes, sourceBytes.length - 4)
  })
  return {
    bytes,
    newIds: {
      group: [gN, gH, gP],
      member: [mN1, mN2, mH, mP]
    },
    stateGroupIds: [gN, gH, gP]
  }
}
