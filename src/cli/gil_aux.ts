import { buildFile, readUint32BE } from '../injector/binary.js'
import {
  emitWireMessage as emit,
  parseWireMessage as parse,
  type WireField
} from './static_assembly/wire.js'

/**
 * 装饰物（root 27 aux）挂载支持。
 *
 * 2026-08-20 真实样本闭合的规律（after-user-aux-both.gil / after-user-aux3.gil）：
 * - root 27 顶层字段 = 多条 aux：f1 字段 = definition-side（f3=1、f11 空）、
 *   f2 字段 = instance-side（f12={1:defAuxID} 回链）
 * - 每条 aux = {f1:ID、f2:装饰物资源ID、f4×3（槽1 名字/槽40 配置/槽111）、
 *   f5×4（槽1 变换/槽5/槽2/槽22 材质）、f11 或 f12}
 * - 挂载 = 宿主 f5 槽40.f50 的 f501 packed 引用列表：元件定义挂 def-side aux、
 *   页面模型/场景实体挂各自 inst-side aux
 * - 静态装饰物（20001008）只有 inst 无 def 且 f12 空（资源性质差异，wire 无标记）
 *
 * 模板字节来自样本：def 1073741829（长方体装饰物）、inst 1073741828（回链 1073741829）。
 */

const AUX_DEF_TEMPLATE =
  '08858080800410a9f3e2041801221108015a0d0a0be8a385e9a5b0e789a95f32220c0828920307b01f97808082042205086fea05002a1908015a150a0012001a0f0d0000803f150000803f1d0000803f2a0808057a04080110012a04080262002a18081682021318ffffffff0f250000c84228ffffff0730ac345a00'
const AUX_INST_TEMPLATE =
  '08848080800410a9f3e204221108015a0d0a0be8a385e9a5b0e789a95f32220c0828920307b01fa1808082042205086fea05002a1908015a150a0012001a0f0d0000803f150000803f1d0000803f2a0808057a04080110012a04080262002a18081682021318ffffffff0f250000c84228ffffff0730ac346206088580808004'

// 模板占位（唯一出现，可安全替换）：
// DEF f1=1073741829、f2=10009001、f4 槽40 宿主引用 1077936151（球体定义）；
// INST f1=1073741828、f2=10009001、f4 槽40 宿主引用 1077936161（球体模型）、f12 回链 1073741829
const TEMPLATE_DEF_ID = 1073741829
const TEMPLATE_INST_ID = 1073741828
const TEMPLATE_RESOURCE_ID = 10009001
const TEMPLATE_HOST_DEF_ID = 1077936151
const TEMPLATE_HOST_INST_ID = 1077936161

const TEXT = new TextEncoder()

function replaceVarint(data: Uint8Array, oldValue: number, newValue: number): Uint8Array {
  const fields = parse(data)
  if (!fields) return data
  return emit(
    fields.map((field) => {
      if (field.wire === 0 && field.value === oldValue) return { ...field, value: newValue }
      if (field.wire !== 2 || field.number === 501) return field
      const nested = replaceVarint(field.value as Uint8Array, oldValue, newValue)
      return Buffer.from(nested).equals(Buffer.from(field.value as Uint8Array))
        ? field
        : { ...field, value: nested }
    })
  )
}

/** 替换名字槽（f4 槽1 → f11.f1，与 official_prefabs replaceName 同构）。 */
function replaceName(data: Uint8Array, name: string): Uint8Array {
  const fields = parse(data)
  if (!fields) throw new Error('[error] malformed aux template')
  const owner = fields.find(
    (field) =>
      field.wire === 2 &&
      field.number === 4 &&
      parse(field.value as Uint8Array)?.some(
        (child) => child.number === 1 && child.wire === 0 && child.value === 1
      )
  )
  if (!owner) throw new Error('[error] aux name slot not found')
  const ownerFields = parse(owner.value as Uint8Array)
  if (!ownerFields) throw new Error('[error] malformed aux name slot')
  const f11 = ownerFields.find((field) => field.number === 11 && field.wire === 2)
  if (!f11) throw new Error('[error] aux name field 11 not found')
  const f11Fields = parse(f11.value as Uint8Array)
  if (!f11Fields) throw new Error('[error] malformed aux name field 11')
  const nameField = f11Fields.find((field) => field.number === 1 && field.wire === 2)
  if (!nameField) throw new Error('[error] aux name field 11.1 not found')
  nameField.value = TEXT.encode(name)
  f11.value = emit(f11Fields)
  owner.value = emit(ownerFields)
  return emit(fields)
}

/** root27 下一个空闲 aux ID（≥1073741825，跨 f1/f2 字段去重）。 */
function nextAuxId(top: readonly WireField[]): number {
  const root27 = top.find((f) => f.number === 27 && f.wire === 2)
  const used = new Set<number>()
  if (root27) {
    for (const f of parse(root27.value as Uint8Array) ?? []) {
      if (f.wire !== 2) continue
      const rec = parse(f.value as Uint8Array)
      const id = rec?.find((x) => x.number === 1 && x.wire === 0)?.value
      if (typeof id === 'number') used.add(id)
    }
  }
  let id = 1073741825
  while (used.has(id)) id++
  return id
}

/**
 * 给宿主挂装饰物：生成 aux 记录并追加宿主 f501 引用。
 * 宿主为元件定义（root4）时挂 def-side + inst-side；实体/页面模型挂 inst-side。
 * 返回新 GIL 与生成的 aux ID。
 */
export function attachAuxiliary(
  bytes: Uint8Array,
  params: { hostId: number; resourceId: number; name?: string }
): { bytes: Uint8Array; hostId: number; auxIds: readonly number[] } {
  const top = parse(bytes.slice(20, -4))
  if (!top) throw new Error('[error] malformed GIL payload')
  const name = params.name || `装饰物_${params.resourceId}`

  // 定位宿主：root5 实体 / root4 定义 / root8 页面模型（按 ID）
  const host = { field: undefined as WireField | undefined, root: undefined as WireField | undefined, rootNo: 0, section: [] as WireField[] }
  for (const [rootNo] of [[5], [4], [8]] as const) {
    const root = top.find((f) => f.number === rootNo && f.wire === 2)
    if (!root) continue
    const section = parse(root.value as Uint8Array) ?? []
    const found = section.find((f) => {
      if (f.number !== 1 || f.wire !== 2) return false
      return (
        parse(f.value as Uint8Array)?.find(
          (x) => x.number === 1 && x.wire === 0 && x.value === params.hostId
        ) !== undefined
      )
    })
    if (found) {
      host.field = found
      host.root = root
      host.rootNo = rootNo
      host.section = section
      break
    }
  }
  if (!host.field) throw new Error(`[error] host not found: ${params.hostId}`)

  const isDefinition = host.rootNo === 4
  const auxIds: number[] = []
  let root27 = top.find((f) => f.number === 27 && f.wire === 2)
  if (!root27) {
    root27 = { number: 27, wire: 2, value: emit([]) }
    top.push(root27)
  }
  const auxFields = parse(root27.value as Uint8Array)
  if (!auxFields) throw new Error('[error] invalid root 27 section')

  // def-side aux（仅定义宿主；实体/模型只挂 inst）
  let defAuxId: number | undefined
  if (isDefinition) {
    defAuxId = nextAuxId(top)
    auxIds.push(defAuxId)
    let rec = replaceVarint(
      Uint8Array.from(Buffer.from(AUX_DEF_TEMPLATE, 'hex')),
      TEMPLATE_DEF_ID,
      defAuxId
    )
    rec = replaceVarint(rec, TEMPLATE_RESOURCE_ID, params.resourceId)
    rec = replaceVarint(rec, TEMPLATE_HOST_DEF_ID, params.hostId)
    rec = replaceName(rec, name)
    auxFields.push({ number: 1, wire: 2, value: rec })
    root27.value = emit(auxFields)
  }

  // inst-side aux（实体/模型/定义都挂；f12 回链 def，无 def 时为空消息）
  const instAuxId = nextAuxId(top)
  auxIds.push(instAuxId)
  let instRec = replaceVarint(
    Uint8Array.from(Buffer.from(AUX_INST_TEMPLATE, 'hex')),
    TEMPLATE_INST_ID,
    instAuxId
  )
  instRec = replaceVarint(instRec, TEMPLATE_RESOURCE_ID, params.resourceId)
  instRec = replaceVarint(instRec, TEMPLATE_HOST_INST_ID, params.hostId)
  if (defAuxId !== undefined) {
    instRec = replaceVarint(instRec, TEMPLATE_DEF_ID, defAuxId)
  } else {
    // 无定义宿主：f12 替换为空消息（静态装饰物样本 f12=len0）
    const instFields = parse(instRec)
    if (!instFields) throw new Error('[error] malformed inst aux template')
    instRec = emit(
      instFields.map((field) =>
        field.number === 12 && field.wire === 2 ? { ...field, value: emit([]) } : field
      )
    )
  }
  instRec = replaceName(instRec, name)
  auxFields.push({ number: 2, wire: 2, value: instRec })
  root27.value = emit(auxFields)

  // 宿主 f5/f6 槽40.f50.f501 packed 引用追加：定义宿主挂 def aux、实体/模型挂 inst aux
  // （2026-08-20 用户样本 after-prefab-with-aux：定义 1077936186 f501=[defAux]、
  //   模型 1077936182 f501=[instAux 回链 defAux]）
  const hostRec = parse(host.field.value as Uint8Array)
  if (!hostRec) throw new Error('[error] malformed host record')
  const ownerNo = host.rootNo === 4 ? 6 : 5
  const slot40 = hostRec.find(
    (f) => f.wire === 2 && f.number === ownerNo &&
      parse(f.value as Uint8Array)?.find((x) => x.number === 1 && x.wire === 0)?.value === 40
  )
  if (!slot40) throw new Error(`[error] host ${params.hostId} has no f${ownerNo} slot 40`)
  const slot40Fields = parse(slot40.value as Uint8Array)
  if (!slot40Fields) throw new Error('[error] malformed host slot 40')
  let f50 = slot40Fields.find((f) => f.number === 50 && f.wire === 2)
  if (!f50) {
    f50 = { number: 50, wire: 2, value: emit([]) }
    slot40Fields.push(f50)
  }
  const f50Fields = parse(f50.value as Uint8Array) ?? []
  let f501 = f50Fields.find((f) => f.number === 501 && f.wire === 2)
  const existing: number[] = []
  if (f501) {
    const packed = f501.value as Uint8Array
    let val = 0
    let shift = 0
    for (const byte of packed) {
      val |= (byte & 0x7f) << shift
      if (!(byte & 0x80)) {
        existing.push(val)
        val = 0
        shift = 0
      } else shift += 7
    }
  } else {
    f501 = { number: 501, wire: 2, value: Uint8Array.from([]) }
    f50Fields.push(f501)
  }
  const referencedAuxId = isDefinition ? defAuxId! : instAuxId
  f501.value = Uint8Array.from(encodeVarints([...existing, referencedAuxId]))
  f50.value = emit(f50Fields)
  slot40.value = emit(slot40Fields)
  host.field.value = emit(hostRec)
  if (host.root) host.root.value = emit(host.section)

  return {
    bytes: buildFile(emit(top), {
      schema: readUint32BE(bytes, 4),
      headTag: readUint32BE(bytes, 8),
      fileType: readUint32BE(bytes, 12),
      tailTag: readUint32BE(bytes, bytes.length - 4)
    }),
    hostId: params.hostId,
    auxIds
  }
}

function encodeVarints(values: readonly number[]): number[] {
  const out: number[] = []
  for (const value of values) {
    let v = value
    while (v >= 0x80) {
      out.push((v & 0x7f) | 0x80)
      v = Math.floor(v / 128)
    }
    out.push(v)
  }
  return out
}
