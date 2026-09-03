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

export interface RemoveMaterialMemberResult {
  bytes: Uint8Array
  groupMemberIds: number[]
  removed: boolean
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
