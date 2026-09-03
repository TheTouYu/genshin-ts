/**
 * ui/src/material-groups.ts — 素材组（type55）成员单独编辑（票09 R3 起步：删除成员）
 *
 * 场景：按钮状态素材组内混入多余成员（如图片），需单独删除而保留其余成员。
 * 语义：删除组 f503 packed 成员列表中的 memberId，并物理移除对应 502 记录；
 *       成员不属顶层索引（indexed=false），顶层索引无需改动。
 * 纯函数：bytes → 候选 bytes；不读盘不写盘。
 */
import { buildFile, encodeVarint, readUint32BE } from '../../src/injector/binary.js'
import { emitWireMessage, parseWireMessage, type WireField } from '../../src/cli/static_assembly/wire.js'
import { packedVarints, parseRoot9 } from './record.js'

export interface RemoveMaterialMemberOptions {
  groupId: number
  memberId: number
}

export interface ClearButtonStateRefsOptions {
  targetId: number
}

export interface RemoveMaterialMemberResult {
  bytes: Uint8Array
  groupMemberIds: number[]
  removed: boolean
}

export interface ClearButtonStateRefsResult {
  bytes: Uint8Array
  cleared: number
}

function recordIdOf(raw: Uint8Array): number | undefined {
  return parseWireMessage(raw)?.find((x) => x.number === 501 && x.wire === 0)?.value as number | undefined
}

export function removeMaterialGroupMember(
  sourceBytes: Uint8Array,
  options: RemoveMaterialMemberOptions
): RemoveMaterialMemberResult {
  const { groupId, memberId } = options
  const parsed = parseRoot9(sourceBytes)
  const group = parsed.recordsById.get(groupId)
  if (!group) throw new Error(`[error] 素材组 ${groupId} 不存在`)
  if (group.parentId !== null) throw new Error(`[error] ${groupId} 不是顶层素材组`)
  const member = parsed.recordsById.get(memberId)
  if (!member) throw new Error(`[error] 成员 ${memberId} 不存在`)
  if (member.parentId !== groupId)
    throw new Error(`[error] 成员 ${memberId} 不属于组 ${groupId}`)

  // 组 f503 packed 成员列表去掉 memberId
  const groupFields = parseWireMessage(group.raw)
  if (!groupFields) throw new Error('[error] 组记录解析失败')
  const memberList = groupFields.find((x) => x.number === 503 && x.wire === 2)
  if (!memberList) throw new Error('[error] 组记录缺 f503 成员列表')
  const ids = packedVarints(memberList.value as Uint8Array)
  const at = ids.indexOf(memberId)
  if (at < 0) throw new Error(`[error] 组 ${groupId} 成员列表不含 ${memberId}`)
  ids.splice(at, 1)
  memberList.value = Uint8Array.from(ids.flatMap((id) => Array.from(encodeVarint(id))))
  const newGroupRaw = emitWireMessage(groupFields)

  // 整文件装配：替换组记录字段、物理移除成员记录字段
  const top = parseWireMessage(sourceBytes.subarray(20, sourceBytes.length - 4))
  if (!top) throw new Error('[error] malformed GIL payload')
  const root9 = top.find((f) => f.number === 9 && f.wire === 2)
  if (!root9) throw new Error('[error] root9 missing')
  const section = parseWireMessage(root9.value as Uint8Array)
  if (!section) throw new Error('[error] root9 section parse failed')

  let replacedGroup = false
  for (let i = 0; i < section.length; i++) {
    const f = section[i]
    if (f.number !== 502 || f.wire !== 2) continue
    const id = recordIdOf(f.value as Uint8Array)
    if (id === groupId) {
      f.value = newGroupRaw
      replacedGroup = true
    } else if (id === memberId) {
      section.splice(i, 1)
      i--
    }
  }
  if (!replacedGroup) throw new Error(`[error] 组记录字段未找到 ${groupId}`)

  root9.value = emitWireMessage(section)
  const bytes = buildFile(emitWireMessage(top), {
    schema: readUint32BE(sourceBytes, 4),
    headTag: readUint32BE(sourceBytes, 8),
    fileType: readUint32BE(sourceBytes, 12),
    tailTag: readUint32BE(sourceBytes, sourceBytes.length - 4)
  })
  return { bytes, groupMemberIds: ids, removed: true }
}

/**
 * 清空按钮（t50）三态素材引用（回到"空素材模板"合法态）——R5：删除实例后，
 * 模板若与实例共享过素材组会产生悬空引用，按编辑器语义模板在「同步到模板」前本就无素材，
 * 故清空引用即恢复合法态。保留块尺寸/缩放。
 */
export function clearButtonStateRefs(
  sourceBytes: Uint8Array,
  options: ClearButtonStateRefsOptions
): ClearButtonStateRefsResult {
  const { targetId } = options
  const parsed = parseRoot9(sourceBytes)
  const target = parsed.recordsById.get(targetId)
  if (!target) throw new Error(`[error] 目标控件 ${targetId} 不存在`)

  const m = parseWireMessage(target.raw)
  if (!m) throw new Error('[error] record parse failed')
  let hit = false
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
    let cleared = 0
    for (const k of [501, 502, 503]) {
      const bf = containerMsg.find((x) => x.number === k && x.wire === 2)
      if (!bf) continue
      const block = parseWireMessage(bf.value as Uint8Array)
      if (!block) continue
      const ref = block.find((x) => x.number === 501 && x.wire === 2)
      if (ref && (ref.value as Uint8Array).length > 0) {
        ref.value = new Uint8Array(0) // 空引用 = 无素材（与编辑器空素材块一致）
        cleared++
        bf.value = emitWireMessage(block)
      }
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
    const newRaw = emitWireMessage(m)

    const top = parseWireMessage(sourceBytes.subarray(20, sourceBytes.length - 4))
    if (!top) throw new Error('[error] malformed GIL payload')
    const root9 = top.find((f) => f.number === 9 && f.wire === 2)
    if (!root9) throw new Error('[error] root9 missing')
    const section = parseWireMessage(root9.value as Uint8Array)
    if (!section) throw new Error('[error] root9 section parse failed')
    const targetField = section.find(
      (f) => f.number === 502 && f.wire === 2 && recordIdOf(f.value as Uint8Array) === targetId
    )
    if (!targetField) throw new Error('[error] target field not found')
    targetField.value = newRaw
    root9.value = emitWireMessage(section)
    const bytes = buildFile(emitWireMessage(top), {
      schema: readUint32BE(sourceBytes, 4),
      headTag: readUint32BE(sourceBytes, 8),
      fileType: readUint32BE(sourceBytes, 12),
      tailTag: readUint32BE(sourceBytes, sourceBytes.length - 4)
    })
    return { bytes, cleared }
  }
  if (!hit) throw new Error('[error] 目标不是 custom-button（无 t50）')
  throw new Error('[error] unreachable')
}
