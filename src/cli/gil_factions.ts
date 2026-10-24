import { buildFile, readUint32BE } from '../injector/binary.js'
import { emitWireMessage, parseWireMessage, type WireField } from './static_assembly/wire.js'

/**
 * 阵营（Faction）资产读写。
 *
 * 规则来源（2026-10-24 五次相邻快照差分 + 用户编辑器操作，地图 1073741827）：
 *   - 官方口径：`docs/ui-tutorial/official-guide-concepts.md` §阵营（1637–1700）——
 *     阵营在关卡设置「阵营」页签发定义；**阵营值 0 = 默认**（按该实体类型的默认阵营对象分配）；
 *     阵营关系单向敌对/友善。
 *   - 赋值 wire：记录（root5 场景实体 / root8 元件页面实例）的**基础信息区块** `f6` 里
 *     `f1=6` 那个槽 → `f16{f1=<阵营值 varint>}`；**值为 0 时 `f16` 为空 message（len=0）**。
 *     空槽字节 = `08 06 82 01 00`（5 B），设成阵营 id 后 7 B。
 *   - 阵营表：`root11.f2` → 重复 `f1` = 条目
 *     `{ f1=名字, f2=阵营id, f3=图标名, f4=包含的玩家 id 列表, f11=默认阵营对象(候选), f13=敌对目标(候选) }`。
 *   - `root4` 元件定义本体**没有**阵营槽——定义页里改的阵营落在 root8 页面实例。
 *
 * ⚠️ 三个命名空间别混（同一字段号 f6 语义不同）：
 *   root4 造物定义 f6 = 能力/特化槽（80 决策图 / 81 技能管理 / 82 自主逻辑）；
 *   root5 实体 / root8 页面实例 f6 = 基础信息区块（1 变换 / 6 阵营 / 22 材质）；
 *   所有记录的 f7 = 组件槽（码 6 = 特效播放，见 components.md）。
 *   场景实体还有 f5 = 能力槽镜像（从定义 f6 抄来）——**f5 不是基础信息**。
 *
 * 未闭合（fail closed，不做推断性写入）：`f11`（默认阵营对象）与 `f13`（敌对目标列表）
 * 目前是**强推断**（本图三阵营的取值与官方默认配置自洽），尚未用单变化差分确认。
 */

/** 阵营所在的容器字段号（基础信息区块；实体与页面实例一致）。 */
export const FACTION_BLOCK_FIELD = 6
/** 基础信息区块里的阵营块码。 */
export const FACTION_SLOT_CODE = 6
/** 块码 + 10 = 配置字段号（16）。 */
export const FACTION_VALUE_FIELD = FACTION_SLOT_CODE + 10
/** 关卡阵营表所在 root。 */
export const LEVEL_FACTION_ROOT = 11

export type FactionEntry = {
  id: number
  name: string
  icon: string
  /** 包含的玩家 id（本图 1..8）。 */
  players: number[]
  /** 候选：默认阵营对象类型（0=玩家 / 1=物件 / 2=造物），未差分确认。 */
  defaultObjectType?: number
  /** 候选：该阵营敌对的目标阵营 id 列表（单向），未差分确认。 */
  hostileTo: number[]
  /** 条目原始字节长度（诊断用）。 */
  bytes: number
}

export type FactionLayer = 'entity' | 'instance'

export type FactionAssignment = {
  layer: FactionLayer
  recordId: number
  defId?: number
  name: string
  faction: number
  factionName: string | null
}

export type FactionReadResult = FactionAssignment & { slotBytesHex: string }

export type FactionWriteResult = {
  bytes: Uint8Array
  layer: FactionLayer
  recordId: number
  name: string
  previous: number
  next: number
}

type Parsed = WireField[] | undefined

function parse(data: Uint8Array): Parsed {
  return parseWireMessage(data)
}

function emit(fields: readonly WireField[]): Uint8Array {
  return emitWireMessage(fields)
}

function topOf(bytes: Uint8Array): WireField[] {
  const top = parse(bytes.slice(20, -4))
  if (!top) throw new Error('[error] malformed GIL payload')
  return top
}

function rebuild(bytes: Uint8Array, top: readonly WireField[]): Uint8Array {
  return buildFile(emit(top), {
    schema: readUint32BE(bytes, 4),
    headTag: readUint32BE(bytes, 8),
    fileType: readUint32BE(bytes, 12),
    tailTag: readUint32BE(bytes, bytes.length - 4)
  })
}

function sectionOf(top: readonly WireField[], rootNo: number): WireField | undefined {
  return top.find((f) => f.number === rootNo && f.wire === 2)
}

function recordsOf(top: readonly WireField[], rootNo: number): Uint8Array[] {
  const section = sectionOf(top, rootNo)
  if (!section || !(section.value instanceof Uint8Array)) return []
  const fields = parse(section.value)
  if (!fields) return []
  return fields.filter((f) => f.number === 1 && f.wire === 2).map((f) => f.value as Uint8Array)
}

function recordId(record: Uint8Array): number {
  const first = parse(record)?.[0]
  return first && first.number === 1 && first.wire === 0 ? (first.value as number) : -1
}

function varintOf(fields: readonly WireField[] | undefined, no: number): number | undefined {
  const hit = fields?.find((f) => f.number === no && f.wire === 0)
  return hit ? (hit.value as number) : undefined
}

function textOf(fields: readonly WireField[] | undefined, no: number): string {
  const hit = fields?.find((f) => f.number === no && f.wire === 2)
  if (!hit || !(hit.value instanceof Uint8Array)) return ''
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(hit.value)
  } catch {
    return ''
  }
}

/** `f4`/`f11`/`f13` 这类"字节即列表"的字段：先按 packed varint 解，失败就按字节取值。 */
function byteListOf(fields: readonly WireField[] | undefined, no: number): number[] {
  const hit = fields?.find((f) => f.number === no && f.wire === 2)
  if (!hit || !(hit.value instanceof Uint8Array)) return []
  const raw = hit.value
  if (raw.length === 0) return []
  const packed = parse(raw)
  if (packed && packed.length > 0 && packed.every((f) => f.wire === 0)) {
    return packed.map((f) => f.value as number)
  }
  return Array.from(raw)
}

/** 元件/实体名字槽（`f5` 的码 1 条目 → `f11.f1` 文本）。 */
function nameOf(record: Uint8Array, slotField: number): string {
  const fields = parse(record)
  const entry = fields?.find((f) => {
    if (f.number !== slotField || f.wire !== 2) return false
    return parse(f.value as Uint8Array)?.some((x) => x.number === 1 && x.wire === 0 && x.value === 1)
  })
  if (!entry) return ''
  const inner = parse(entry.value as Uint8Array)?.find((f) => f.number === 11 && f.wire === 2)
  if (!inner) return ''
  return textOf(parse(inner.value as Uint8Array), 1)
}

function defIdOf(record: Uint8Array): number | undefined {
  const ref = parse(record)?.find((f) => f.number === 2 && f.wire === 2)
  if (!ref) return undefined
  return varintOf(parse(ref.value as Uint8Array), 1)
}

/** 读关卡阵营表（`root11.f2` 的条目）。 */
export function readFactionTable(bytes: Uint8Array): FactionEntry[] {
  const section = sectionOf(topOf(bytes), LEVEL_FACTION_ROOT)
  if (!section || !(section.value instanceof Uint8Array)) return []
  const tableBlob = parse(section.value)?.find((f) => f.number === 2 && f.wire === 2)
  if (!tableBlob || !(tableBlob.value instanceof Uint8Array)) return []
  const entries = (parse(tableBlob.value) ?? []).filter((f) => f.number === 1 && f.wire === 2)
  return entries.map((entry) => {
    const raw = entry.value as Uint8Array
    const fields = parse(raw)
    const defaultType = byteListOf(fields, 11)
    return {
      id: varintOf(fields, 2) ?? -1,
      name: textOf(fields, 1),
      icon: textOf(fields, 3),
      players: byteListOf(fields, 4),
      defaultObjectType: defaultType.length > 0 ? defaultType[0] : undefined,
      hostileTo: byteListOf(fields, 13),
      bytes: raw.length
    } as FactionEntry
  })
}

function factionSlotOf(record: Uint8Array): WireField | undefined {
  const fields = parse(record)
  return fields?.find((f) => {
    if (f.number !== FACTION_BLOCK_FIELD || f.wire !== 2) return false
    const sub = parse(f.value as Uint8Array)
    return sub?.some((x) => x.number === 1 && x.wire === 0 && x.value === FACTION_SLOT_CODE)
  })
}

/** 从基础信息区块读阵营值；无该槽返回 undefined（如关卡实体）。 */
export function readFactionValue(record: Uint8Array): number | undefined {
  const slot = factionSlotOf(record)
  if (!slot) return undefined
  const payload = parse(slot.value as Uint8Array)
  const valueBlock = payload?.find((f) => f.number === FACTION_VALUE_FIELD && f.wire === 2)
  if (!valueBlock) return 0
  const inner = parse(valueBlock.value as Uint8Array)
  return varintOf(inner, 1) ?? 0
}

function slotHexOf(record: Uint8Array): string {
  const slot = factionSlotOf(record)
  return slot ? Buffer.from(slot.value as Uint8Array).toString('hex') : ''
}

/** 写回阵营值：0 = 默认（写空 message，与编辑器一致）。 */
export function writeFactionValue(record: Uint8Array, faction: number): Uint8Array {
  const fields = parse(record)
  if (!fields) throw new Error('[error] malformed record')
  const slot = fields.find((f) => {
    if (f.number !== FACTION_BLOCK_FIELD || f.wire !== 2) return false
    const sub = parse(f.value as Uint8Array)
    return sub?.some((x) => x.number === 1 && x.wire === 0 && x.value === FACTION_SLOT_CODE)
  })
  if (!slot) {
    throw new Error(
      `[error] 记录 ${recordId(record)} 没有基础信息区块的阵营槽（f${FACTION_BLOCK_FIELD} code ${FACTION_SLOT_CODE}）；` +
        '关卡实体等系统实体没有该槽，元件定义本体也没有（定义页的阵营在 root8 页面实例）'
    )
  }
  const payload = parse(slot.value as Uint8Array)
  if (!payload) throw new Error(`[error] malformed faction slot on record ${recordId(record)}`)
  const kept = payload.filter((f) => f.number !== FACTION_VALUE_FIELD)
  // 编辑器形态：值 0 也**保留** f16，只是空 message（`82 01 00`）；不能整个省略。
  kept.push({
    number: FACTION_VALUE_FIELD,
    wire: 2,
    value: faction === 0 ? new Uint8Array(0) : emit([{ number: 1, wire: 0, value: faction }])
  })
  slot.value = emit(kept)
  return emit(fields)
}

/**
 * 该 id 是否同时是 **root4 元件定义**。地图里 root4 / root8 / root5 的 id 段会重叠
 * （2026-10-24 实测：`1082130434` 既是水史莱姆的 root4 定义，又是另一个造物的 root8 页面实例）。
 * 用户拿定义 id 来查/改阵营时，如果不拦住，会静默写给**另一个对象**。
 */
function isAlsoDefinitionId(top: readonly WireField[], targetId: number): boolean {
  return recordsOf(top, 4).some((r) => recordId(r) === targetId)
}

function ambiguityError(targetId: number, layer: FactionLayer): Error {
  return new Error(
    `[error] id ${targetId} 同时是 root4 元件定义（定义本体没有阵营槽），而 root${rootOfLayer(layer)} 里还有一条同号记录` +
      `（那是**另一个对象**的${layer === 'entity' ? '场景实体' : '元件页面实例'}）。` +
      `确认要操作它请显式加 --layer ${layer}；要改元件定义页的阵营请用该定义的页面实例 id。`
  )
}

function layersToSearch(layer?: FactionLayer): FactionLayer[] {
  return layer ? [layer] : ['entity', 'instance']
}

function rootOfLayer(layer: FactionLayer): number {
  return layer === 'entity' ? 5 : 8
}

function nameSlotFieldOf(layer: FactionLayer): number {
  // 实体与页面实例的名字槽都在 f5 的码 1 条目里（f5 是能力槽镜像 / 实例槽容器）。
  return layer === 'entity' ? 5 : 5
}

export function readFaction(
  bytes: Uint8Array,
  params: { targetId: number; layer?: FactionLayer }
): FactionReadResult {
  const top = topOf(bytes)
  for (const layer of layersToSearch(params.layer)) {
    const record = recordsOf(top, rootOfLayer(layer)).find((r) => recordId(r) === params.targetId)
    if (!record) continue
    if (!params.layer && isAlsoDefinitionId(top, params.targetId)) {
      throw ambiguityError(params.targetId, layer)
    }
    const value = readFactionValue(record)
    const table = readFactionTable(bytes)
    return {
      layer,
      recordId: params.targetId,
      defId: defIdOf(record),
      name: nameOf(record, nameSlotFieldOf(layer)),
      faction: value ?? -1,
      factionName: value !== undefined ? (table.find((f) => f.id === value)?.name ?? null) : null,
      slotBytesHex: slotHexOf(record)
    }
  }
  throw new Error(
    `[error] 没有找到记录 ${params.targetId}（root5 场景实体 / root8 元件页面实例）；` +
      '元件定义本体 root4 不保存阵营'
  )
}

/** 列出所有带阵营槽的记录（实体 + 页面实例），用于盘点。 */
export function listFactionAssignments(bytes: Uint8Array): FactionAssignment[] {
  const top = topOf(bytes)
  const table = readFactionTable(bytes)
  const out: FactionAssignment[] = []
  for (const layer of ['entity', 'instance'] as FactionLayer[]) {
    for (const record of recordsOf(top, rootOfLayer(layer))) {
      const value = readFactionValue(record)
      if (value === undefined) continue
      out.push({
        layer,
        recordId: recordId(record),
        defId: defIdOf(record),
        name: nameOf(record, nameSlotFieldOf(layer)),
        faction: value,
        factionName: table.find((f) => f.id === value)?.name ?? null
      })
    }
  }
  return out
}

/** 把阵营值写进目标记录，返回重编码后的整文件字节。 */
export function writeFaction(
  bytes: Uint8Array,
  params: { targetId: number; faction: number; layer?: FactionLayer }
): FactionWriteResult {
  const top = topOf(bytes)
  const table = readFactionTable(bytes)
  if (params.faction !== 0 && !table.some((f) => f.id === params.faction)) {
    const known = table.map((f) => `${f.id}=${f.name}`).join(' / ') || '(空)'
    throw new Error(`[error] 阵营 ${params.faction} 不在关卡阵营表里（可用：0=默认 / ${known}）`)
  }
  for (const layer of layersToSearch(params.layer)) {
    const section = sectionOf(top, rootOfLayer(layer))
    if (!section || !(section.value instanceof Uint8Array)) continue
    const secFields = parse(section.value)
    if (!secFields) throw new Error('[error] malformed root section')
    const idx = secFields.findIndex((f) => f.number === 1 && f.wire === 2 && recordId(f.value as Uint8Array) === params.targetId)
    if (idx < 0) continue
    if (!params.layer && isAlsoDefinitionId(top, params.targetId)) {
      throw ambiguityError(params.targetId, layer)
    }
    const record = secFields[idx].value as Uint8Array
    const previous = readFactionValue(record)
    if (previous === undefined) {
      throw new Error(`[error] 记录 ${params.targetId} 没有阵营槽（系统实体或元件定义本体）`)
    }
    const nextRecord = writeFactionValue(record, params.faction)
    secFields[idx].value = nextRecord
    section.value = emit(secFields)
    return {
      bytes: rebuild(bytes, top),
      layer,
      recordId: params.targetId,
      name: nameOf(nextRecord, nameSlotFieldOf(layer)),
      previous,
      next: params.faction
    }
  }
  throw new Error(
    `[error] 没有找到记录 ${params.targetId}（root5 场景实体 / root8 元件页面实例）；` +
      '元件定义本体 root4 不保存阵营，定义页的阵营改写请用 --layer instance 指定页面实例 id'
  )
}
