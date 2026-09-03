/**
 * ui/src/section-ops.ts — root9 记录段装配共享助手（票10）
 *
 * 从 floating-page.ts 抽出的通用装配内核（悬浮页/tab/后续素材·队列·同步引擎共用）：
 *   - withSection：root9 section 直接改字段后整文件重建（其余顶层字段透传）
 *   - insertRecords / insertIntoIndex：物理插入与顶层索引插入
 *   - appendMemberId：宿主 f503 packed 成员追加（空宿主按族约定新建 f503）
 *   - clusterEndId / containerClusterRootId：插入位=归属簇物理末端规则（轮24/29/33 闭合）
 * 顶层字段用共享 WireField（无需大值安全层——段级操作只搬运记录字节，不重发嵌套区）。
 */

import { buildFile, encodeVarint, readUint32BE } from '../../src/injector/binary.js'
import { emitWireMessage, parseWireMessage, type WireField } from '../../src/cli/static_assembly/wire.js'
import { packedVarints, parseRoot9 } from './record.js'
import type { ParsedRoot9 } from './record.js'

export function w0(number: number, value: number): WireField {
  return { number, wire: 0, value }
}

export function w2(number: number, value: Uint8Array): WireField {
  return { number, wire: 2, value }
}

export function encodePacked(values: readonly number[]): Uint8Array {
  return Uint8Array.from(values.flatMap((value) => Array.from(encodeVarint(value))))
}

/** root9 记录段的自身 ID（f501 varint；非 502 记录字段返回 undefined） */
export function ownIdOf(field: WireField): number | undefined {
  if (field.number !== 502 || field.wire !== 2) return undefined
  const fields = parseWireMessage(field.value as Uint8Array)
  const id = fields?.find((x) => x.number === 501 && x.wire === 0)?.value
  return typeof id === 'number' ? id : undefined
}

/** 通用装配：直接改 root9 section 字段列表后整文件重建（其余顶层字段透传） */
export function withSection(
  bytes: Uint8Array,
  mutate: (section: WireField[], parsed: ParsedRoot9) => void
): Uint8Array {
  const top = parseWireMessage(bytes.subarray(20, bytes.length - 4))
  if (!top) throw new Error('[error] malformed GIL payload')
  const root9 = top.find((f) => f.number === 9 && f.wire === 2)
  if (!root9) throw new Error('[error] root9 section missing')
  const section = parseWireMessage(root9.value as Uint8Array)
  if (!section) throw new Error('[error] invalid root 9 section')
  mutate(section, parseRoot9(bytes))
  root9.value = emitWireMessage(section)
  return buildFile(emitWireMessage(top), {
    schema: readUint32BE(bytes, 4),
    headTag: readUint32BE(bytes, 8),
    fileType: readUint32BE(bytes, 12),
    tailTag: readUint32BE(bytes, bytes.length - 4)
  })
}

/** 顶层索引（root9 f501 packed）：在 afterId 之后插入 newId（缺省=尾部追加） */
export function insertIntoIndex(section: WireField[], newId: number, afterId?: number): void {
  const indexField = section.find((f) => f.number === 501 && f.wire === 2)
  if (!indexField) throw new Error('[error] root9 顶层索引缺失')
  const ids = packedVarints(indexField.value as Uint8Array)
  if (ids.includes(newId)) throw new Error(`[error] 顶层索引已含 ${newId}`)
  const at = afterId !== undefined ? ids.indexOf(afterId) + 1 : ids.length
  if (afterId !== undefined && at === 0) throw new Error(`[error] 索引锚点不存在: ${afterId}`)
  ids.splice(at, 0, newId)
  indexField.value = encodePacked(ids)
}

/** section 内记录物理插入：在 afterId 之后插入整块（缺省=最后一条记录之后——
 *  section 尾部常驻非记录字段（f503 审计等）保持殿后，轮16 铁证） */
export function insertRecords(
  section: WireField[],
  records: readonly Uint8Array[],
  insertAfterId?: number
): void {
  let at: number
  if (insertAfterId !== undefined) {
    const anchor = section.findIndex((f) => ownIdOf(f) === insertAfterId)
    if (anchor < 0) throw new Error(`[error] 物理插入锚点记录不存在: ${insertAfterId}`)
    at = anchor + 1
  } else {
    at = -1
    for (let i = section.length - 1; i >= 0; i--) {
      if (section[i].number === 502 && section[i].wire === 2) {
        at = i + 1
        break
      }
    }
    if (at < 0) at = section.length
  }
  section.splice(at, 0, ...records.map((value) => ({ number: 502, wire: 2, value })))
}

/** 宿主记录 f503 packed 成员追加（1840 库容器 / 布局 / 容器 / 素材组通用）；
 * 空宿主无 f503 时按族约定新建（f502 槽后、f505 组件前——与容器 donor 字段序一致） */
export function appendMemberId(section: WireField[], ownerId: number, memberId: number): void {
  const ownerField = section.find((f) => ownIdOf(f) === ownerId)
  if (!ownerField) throw new Error(`[error] 宿主记录不存在: ${ownerId}`)
  const owner = parseWireMessage(ownerField.value as Uint8Array)
  if (!owner) throw new Error(`[error] 宿主记录解析失败: ${ownerId}`)
  const members = owner.find((f) => f.number === 503 && f.wire === 2)
  if (members) {
    const ids = packedVarints(members.value as Uint8Array)
    if (ids.includes(memberId)) throw new Error(`[error] 宿主已含成员 ${memberId}`)
    ids.push(memberId)
    members.value = encodePacked(ids)
  } else {
    const ids = [memberId]
    let at = -1
    for (let i = owner.length - 1; i >= 0; i--) {
      if (owner[i].number === 502 && owner[i].wire === 2) {
        at = i + 1
        break
      }
    }
    if (at < 0) {
      at = owner.findIndex((f) => f.number === 505 && f.wire === 2)
    }
    owner.splice(at < 0 ? owner.length : at, 0, w2(503, encodePacked(ids)))
  }
  ownerField.value = emitWireMessage(owner)
}

/**
 * 记录簇物理末端：rootId 子树（父链上溯命中 rootId）在物理序中的最后一条记录 ID。
 * 编辑器把新记录插在归属簇末（轮24：实体=库容器末成员后；轮29：页签=容器簇末；
 * 轮33：新容器=容器簇根末）；无子记录时=自身。簇连续性为编辑器落盘事实。
 */
export function clusterEndId(parsed: ParsedRoot9, rootId: number): number {
  const rootIndex = parsed.records.findIndex((r) => r.id === rootId)
  if (rootIndex < 0) throw new Error(`[error] 簇根记录不存在: ${rootId}`)
  let lastId = rootId
  for (let i = rootIndex; i < parsed.records.length; i++) {
    const record = parsed.records[i]
    let cur: (typeof parsed.records)[number] | undefined = record
    let depth = 0
    while (cur && depth < 64) {
      if (cur.id === rootId) {
        lastId = record.id
        break
      }
      if (cur.parentId === null) break
      cur = parsed.recordsById.get(cur.parentId)
      depth += 1
    }
  }
  return lastId
}

/**
 * 容器簇根：物理序中最后一条 parentless 且 comps 含 11 的非布局记录
 * （系统容器 1840/1841/1842 = comps[15,11] official；悬浮页容器 = comps[11,43]；
 * 轮24 锚=1842、轮33 锚=2084 均命中此规则）。新 parentless 容器插其簇物理末端。
 */
export function containerClusterRootId(parsed: ParsedRoot9): number | undefined {
  let last: number | undefined
  for (const r of parsed.records) {
    if (r.parentId === null && r.compTypes.includes(11) && !r.familyTypes.includes(7)) last = r.id
  }
  return last
}
