import {
  applyReplacement,
  buildFile,
  encodeVarint,
  parseMessage,
  readFieldVarint,
  readUint32BE
} from '../../injector/binary.js'
import type { LenField } from '../../injector/types.js'
import {
  readEntityAuxIds,
  readTransform,
  setTransform,
  type EntityTransform
} from '../gil_entities.js'
import {
  emitWireMessage as emit,
  parseWireMessage as parse,
  wireMessage as message,
  type WireField
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

/** 在 root `rootField` 的 `sectionField` 记录容器中按 ID 定位并局部替换。
 *
 * `match` 可选：覆盖默认的“记录 f1 = recordId”匹配（如 root8 实例需按
 * f2.f1=defID 引用匹配时传入自定义匹配器）。 */
export function patchGilRecord(
  bytes: Uint8Array,
  rootField: number,
  recordId: number,
  mutate: (record: Uint8Array) => Uint8Array,
  sectionField = 1,
  match?: (record: Uint8Array) => boolean
): Uint8Array {
  const payload = bytes.slice(20, -4)
  const fields: LenField[] = []
  parseMessage(payload, 0, payload.length, 0, 0, 0, 0, 0, 0, 0, fields)
  const matches = (record: Uint8Array) =>
    match ? match(record) : readFieldVarint(record, 1) === recordId
  const target = fields.find(
    (field) =>
      field.depth === 2 &&
      field.p0 === rootField &&
      field.p1 === sectionField &&
      matches(payload.subarray(field.dataStart, field.dataEnd))
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

/** 替换整个 root 字段的 message（如 root 27 append 新 aux 记录）。 */
function patchRootField(
  bytes: Uint8Array,
  rootField: number,
  mutate: (root: Uint8Array) => Uint8Array
): Uint8Array {
  const payload = bytes.slice(20, -4)
  const fields: LenField[] = []
  parseMessage(payload, 0, payload.length, 0, 0, 0, 0, 0, 0, 0, fields)
  const target = fields.find((field) => field.depth === 1 && field.p0 === rootField)
  if (!target) throw new Error(`[error] root ${rootField} not found`)
  const newPayload = applyReplacement(payload, fields, target, mutate(payload.subarray(target.dataStart, target.dataEnd)))
  return buildFile(newPayload, {
    schema: readUint32BE(bytes, 4),
    headTag: readUint32BE(bytes, 8),
    fileType: readUint32BE(bytes, 12),
    tailTag: readUint32BE(bytes, bytes.length - 4)
  })
}

// ---- 装饰物（aux）编码（v21 编辑器产物同构，见 docs/game-engine-knowledge/gil-structure-semantics.md）----

/** 实例侧 aux 记录所在 root 27 的子字段号（root27 > f2）。 */
const AUX_SECTION = 2
/** 官方长方体贴片资源。 */
export const AUX_CUBOID_RESOURCE = 10009001

const TEXT = new TextEncoder()

function float32(value: number): Uint8Array {
  const b = new Uint8Array(4)
  new DataView(b.buffer).setFloat32(0, value, true)
  return b
}

/** {f1,f2,f3} f32 三元组；sparse=true 时 0 分量省略（编辑器稀疏编码）。 */
function vectorMessage(values: readonly number[], sparse: boolean): Uint8Array {
  return emit(
    values.flatMap((value, index) =>
      sparse && value === 0 ? [] : [{ number: index + 1, wire: 5, value: float32(value) }]
    )
  )
}

function varintBytes(values: readonly number[]): Uint8Array {
  return Uint8Array.from(values.flatMap((value) => Array.from(encodeVarint(value))))
}

/** 材质槽 f32（v13/v21 编辑器规范）：f1=1 + f3=0xAARRGGBB + f4=100.0 + f5=RGB + f6=6700。 */
function material(argb: number): Uint8Array {
  return emit([
    { number: 1, wire: 0, value: 1 },
    { number: 3, wire: 0, value: argb },
    { number: 4, wire: 5, value: float32(100) },
    { number: 5, wire: 0, value: argb & 0xffffff },
    { number: 6, wire: 0, value: 6700 }
  ])
}

/**
 * 生成一条实例侧 aux 记录（装饰物），字段结构与 v21 编辑器产物同构：
 * f1=auxID / f2=资源 / f4{t=1 名称,t=40 挂接{f502:ownerID},t=111 占位} /
 * f5{t=1 transform,t=5,t=2,t=22 材质} / f12=空。
 */
export type AuxSpec = {
  id: number
  ownerId: number
  name: string
  resource?: number
  color: number // 0xAARRGGBB
  position: readonly [number, number, number]
  rotation: readonly [number, number, number]
  scale: readonly [number, number, number]
}

export function buildAuxRecord(spec: AuxSpec): Uint8Array {
  const { id, ownerId, name, color, position, rotation, scale } = spec
  const resource = spec.resource ?? AUX_CUBOID_RESOURCE
  return emit([
    { number: 1, wire: 0, value: id },
    { number: 2, wire: 0, value: resource },
    {
      number: 4,
      wire: 2,
      value: emit([
        { number: 1, wire: 0, value: 1 },
        { number: 11, wire: 2, value: emit([{ number: 1, wire: 2, value: TEXT.encode(name) }]) }
      ])
    },
    {
      number: 4,
      wire: 2,
      value: emit([
        { number: 1, wire: 0, value: 40 },
        { number: 50, wire: 2, value: emit([{ number: 502, wire: 0, value: ownerId }]) }
      ])
    },
    {
      number: 4,
      wire: 2,
      value: emit([
        { number: 1, wire: 0, value: 111 },
        { number: 93, wire: 2, value: new Uint8Array() }
      ])
    },
    {
      number: 5,
      wire: 2,
      value: emit([
        { number: 1, wire: 0, value: 1 },
        {
          number: 11,
          wire: 2,
          value: emit([
            { number: 1, wire: 2, value: vectorMessage(position, true) },
            { number: 2, wire: 2, value: vectorMessage(rotation, true) },
            { number: 3, wire: 2, value: vectorMessage(scale, false) }
          ])
        }
      ])
    },
    {
      number: 5,
      wire: 2,
      value: emit([
        { number: 1, wire: 0, value: 5 },
        { number: 15, wire: 2, value: emit([{ number: 1, wire: 0, value: 1 }, { number: 2, wire: 0, value: 1 }]) }
      ])
    },
    {
      number: 5,
      wire: 2,
      value: emit([
        { number: 1, wire: 0, value: 2 },
        { number: 12, wire: 2, value: new Uint8Array() }
      ])
    },
    {
      number: 5,
      wire: 2,
      value: emit([
        { number: 1, wire: 0, value: 22 },
        { number: 32, wire: 2, value: material(color) }
      ])
    },
    { number: 12, wire: 2, value: new Uint8Array() }
  ])
}

/** 新建 aux 记录（append 到 root 27 f2）。 */
export function createAuxRecord(bytes: Uint8Array, record: Uint8Array): Uint8Array {
  return patchRootField(bytes, 27, (root) => {
    const fields = parse(root) ?? []
    fields.push({ number: AUX_SECTION, wire: 2, value: record })
    return emit(fields)
  })
}

/** 写实体 f5{t=40} 槽的 f501 列表（槽不存在则新建）。 */
function setEntityAuxIds(record: Uint8Array, ids: number[]): Uint8Array {
  const fields = parse(record)
  if (!fields) throw new Error('[error] entity record malformed')
  // 编辑器规范化：空挂接列表清空为 f50=空 message（槽保留），不写空 f501
  const f50Value = ids.length === 0 ? new Uint8Array() : emit([{ number: 501, wire: 2, value: varintBytes(ids) }])
  const slotIndex = fields.findIndex(
    (field) =>
      field.wire === 2 &&
      field.number === 5 &&
      parse(field.value as Uint8Array)?.some((c) => c.number === 1 && c.wire === 0 && c.value === 40)
  )
  if (slotIndex >= 0) {
    const slotFields = message(fields[slotIndex])
    const f50 = slotFields.find((c) => c.number === 50 && c.wire === 2)
    if (f50) f50.value = f50Value
    else slotFields.push({ number: 50, wire: 2, value: f50Value })
    fields[slotIndex] = { ...fields[slotIndex], value: emit(slotFields) }
  } else {
    fields.push({
      number: 5,
      wire: 2,
      value: emit([
        { number: 1, wire: 0, value: 40 },
        { number: 50, wire: 2, value: f50Value }
      ])
    })
  }
  return emit(fields)
}

/** 写 aux f4{t=40} 槽的 f502 ownerID（槽不存在则新建）。 */
function setAuxOwner(record: Uint8Array, ownerId: number): Uint8Array {
  const fields = parse(record)
  if (!fields) throw new Error('[error] aux record malformed')
  const f50Value = emit([{ number: 502, wire: 0, value: ownerId }])
  const slotIndex = fields.findIndex(
    (field) =>
      field.wire === 2 &&
      field.number === 4 &&
      parse(field.value as Uint8Array)?.some((c) => c.number === 1 && c.wire === 0 && c.value === 40)
  )
  if (slotIndex >= 0) {
    const slotFields = message(fields[slotIndex])
    const f50 = slotFields.find((c) => c.number === 50 && c.wire === 2)
    if (f50) f50.value = f50Value
    else slotFields.push({ number: 50, wire: 2, value: f50Value })
    fields[slotIndex] = { ...fields[slotIndex], value: emit(slotFields) }
  } else {
    fields.push({
      number: 4,
      wire: 2,
      value: emit([
        { number: 1, wire: 0, value: 40 },
        { number: 50, wire: 2, value: f50Value }
      ])
    })
  }
  return emit(fields)
}

/** 移除 aux 的 f4{t=40} 槽（detach 逆操作；无真实编辑器样本，见文档 INSUFFICIENT）。 */
function clearAuxOwner(record: Uint8Array): Uint8Array {
  const fields = parse(record)
  if (!fields) throw new Error('[error] aux record malformed')
  return emit(
    fields.filter(
      (field) =>
        !(
          field.wire === 2 &&
          field.number === 4 &&
          parse(field.value as Uint8Array)?.some((c) => c.number === 1 && c.wire === 0 && c.value === 40)
        )
    )
  )
}

/**
 * 挂载装饰物（双向引用）：实体 f5{t=40}.f50.f501 追加 auxId；
 * aux f4{t=40}.f50.f502 = entityId。幂等（已挂载则原样返回）。
 */
export function attachAux(bytes: Uint8Array, entityId: number, auxId: number): Uint8Array {
  bytes = patchGilRecord(bytes, 5, entityId, (record) => {
    const ids = readEntityAuxIds(record)
    return ids.includes(auxId) ? record : setEntityAuxIds(record, [...ids, auxId])
  })
  return patchGilRecord(bytes, 27, auxId, (record) => setAuxOwner(record, entityId), AUX_SECTION)
}

/**
 * 解除挂载（attach 逆操作）：实体 f501 列表移除 auxId（空列表清空为编辑器形态
 * f50=空 message，槽保留）；aux 侧移除 f4{t=40} 槽。
 */
export function detachAux(bytes: Uint8Array, entityId: number, auxId: number): Uint8Array {
  bytes = patchGilRecord(bytes, 5, entityId, (record) => {
    const ids = readEntityAuxIds(record)
    if (!ids.includes(auxId)) return record
    const rest = ids.filter((id) => id !== auxId)
    return setEntityAuxIds(record, rest)
  })
  return patchGilRecord(bytes, 27, auxId, clearAuxOwner, AUX_SECTION)
}

/** 写材质槽（槽定位 number 可参数化：实体 f6 / aux f5），f5 同步为 f3 的 RGB 部分。 */
function setMaterialColor(record: Uint8Array, argb: number, slotNumber: number): Uint8Array {
  const fields = parse(record)
  if (!fields) throw new Error('[error] record malformed')
  const slot = fields.find(
    (field) =>
      field.wire === 2 &&
      field.number === slotNumber &&
      parse(field.value as Uint8Array)?.some(
        (child) => child.number === 1 && child.wire === 0 && child.value === 22
      )
  )
  if (!slot) throw new Error('[error] record has no material slot (cannot set color)')
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
}

/** 写入实体级自定义颜色（root 5 实体记录，材质槽 #6）。 */
export function patchEntityColor(bytes: Uint8Array, entityId: number, argb: number): Uint8Array {
  return patchGilRecord(bytes, 5, entityId, (record) => setMaterialColor(record, argb, 6))
}

/** 写入 aux 自定义颜色（root 27 记录，材质槽 #5）。 */
export function patchAuxColor(bytes: Uint8Array, auxId: number, argb: number): Uint8Array {
  return patchGilRecord(bytes, 27, auxId, (record) => setMaterialColor(record, argb, 5), AUX_SECTION)
}

/** 写入实体 transform（f6{f1=1}.f11）。 */
export function patchEntityTransform(
  bytes: Uint8Array,
  entityId: number,
  transform: EntityTransform
): Uint8Array {
  return patchGilRecord(bytes, 5, entityId, (record) => setTransform(record, transform))
}

/** 写入 aux transform（f5{t=1}.f11）。 */
export function patchAuxTransform(
  bytes: Uint8Array,
  auxId: number,
  transform: EntityTransform
): Uint8Array {
  return patchGilRecord(
    bytes,
    27,
    auxId,
    (record) => setTransform(record, transform, 5),
    AUX_SECTION
  )
}

/** 读 aux transform（无槽 → 默认值）。 */
export function readAuxTransform(bytes: Uint8Array, auxId: number): EntityTransform {
  const payload = bytes.slice(20, -4)
  const fields: LenField[] = []
  parseMessage(payload, 0, payload.length, 0, 0, 0, 0, 0, 0, 0, fields)
  const target = fields.find(
    (field) =>
      field.depth === 2 &&
      field.p0 === 27 &&
      field.p1 === AUX_SECTION &&
      readFieldVarint(payload.subarray(field.dataStart, field.dataEnd), 1) === auxId
  )
  if (!target) throw new Error(`[error] aux ${auxId} not found in root 27`)
  return readTransform(payload.subarray(target.dataStart, target.dataEnd), 5)
}
