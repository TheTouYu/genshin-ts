import {
  applyReplacement,
  buildFile,
  parseMessage,
  readFieldVarint,
  readUint32BE
} from '../../injector/binary.js'
import type { LenField } from '../../injector/types.js'
import { setTransform, type EntityTransform } from '../gil_entities.js'
import {
  emitWireMessage as emit,
  parseWireMessage as parse,
  wireMessage as message
} from './wire.js'

/**
 * GIL 记录级局部 patch 管线（2026-08-07）。
 *
 * 与 `applyEntities`（整 payload 重建）不同：这里只替换目标记录的字节，
 * 其余所有 root 字段原样保留（root 46 等编辑器自维护字段不触碰），
 * 由 `applyReplacement` 自动修复祖先 length 前缀。目标是朝“任意字段局部
 * 写入”逼近：mutate 拿到目标记录 bytes，可任意改，写回粒度 = 记录级。
 *
 * 已闭合规则封装（真实相邻快照证据，见 docs/game-engine-knowledge/）：
 * - 颜色：材质槽 #6{f1=22}.f32 的 f1=1 启用 + f3=0xAARRGGBB；编辑器保存会
 *   把 f5 规范化为 f3 的 RGB 24 位部分（v20→v21 实测：f3 0xFF58D284→0xFFD75FFC
 *   时 f5 0x58D284→0xD75FFC 同步）——因此 patch 必须同写 f5，才能与编辑器
 *   产物逐字节一致。
 * - transform：f6{f1=1}.f11 = {f1: position, f2: rotation, f3: scale}，
 *   f32 度数/坐标、稀疏编码（0 分量省略）、scale 三轴全写。
 */

/** 在 root `rootField` 的 f1 记录中按 ID 定位并局部替换。 */
export function patchGilRecord(
  bytes: Uint8Array,
  rootField: number,
  recordId: number,
  mutate: (record: Uint8Array) => Uint8Array
): Uint8Array {
  const payload = bytes.slice(20, -4)
  const fields: LenField[] = []
  parseMessage(payload, 0, payload.length, 0, 0, 0, 0, 0, 0, 0, fields)
  const target = fields.find(
    (field) =>
      field.depth === 2 &&
      field.p0 === rootField &&
      field.p1 === 1 &&
      readFieldVarint(payload.subarray(field.dataStart, field.dataEnd), 1) === recordId
  )
  if (!target) {
    throw new Error(`[error] record ${recordId} not found in root ${rootField}`)
  }
  const record = payload.subarray(target.dataStart, target.dataEnd)
  const newPayload = applyReplacement(payload, fields, target, mutate(record))
  return buildFile(newPayload, {
    schema: readUint32BE(bytes, 4),
    headTag: readUint32BE(bytes, 8),
    fileType: readUint32BE(bytes, 12),
    tailTag: readUint32BE(bytes, bytes.length - 4)
  })
}

/**
 * 写入实体级自定义颜色（root 5 实体记录）。
 * 与 gil_entities.setMaterialColor 的差异：f5 同步写为 f3 的 RGB 部分
 * （编辑器保存规范化规则，v13/v20-v21 实测），保证产物与编辑器逐字节一致。
 */
export function patchEntityColor(bytes: Uint8Array, entityId: number, argb: number): Uint8Array {
  return patchGilRecord(bytes, 5, entityId, (record) => {
    const fields = parse(record)
    if (!fields) throw new Error('[error] entity record malformed')
    const slot = fields.find(
      (field) =>
        field.wire === 2 &&
        field.number === 6 &&
        parse(field.value as Uint8Array)?.some(
          (child) => child.number === 1 && child.wire === 0 && child.value === 22
        )
    )
    if (!slot) throw new Error('[error] entity has no material slot (cannot set color)')
    const slotFields = message(slot)
    const mat = slotFields.find((field) => field.number === 32 && field.wire === 2)
    if (!mat) throw new Error('[error] material slot missing field 32')
    const rgb = argb & 0xffffff
    const out = message(mat).map((field) => {
      if (field.number === 3) return { ...field, value: argb }
      if (field.number === 5) return { ...field, value: rgb }
      return field
    })
    if (!out.some((field) => field.number === 1)) out.push({ number: 1, wire: 0, value: 1 })
    if (!out.some((field) => field.number === 3)) out.push({ number: 3, wire: 0, value: argb })
    if (!out.some((field) => field.number === 5)) out.push({ number: 5, wire: 0, value: rgb })
    mat.value = emit(out)
    slot.value = emit(slotFields)
    return emit(fields)
  })
}

/** 写入实体 transform（f6{f1=1}.f11），复用 gil_entities.setTransform。 */
export function patchEntityTransform(
  bytes: Uint8Array,
  entityId: number,
  transform: EntityTransform
): Uint8Array {
  return patchGilRecord(bytes, 5, entityId, (record) => setTransform(record, transform))
}
