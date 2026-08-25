/*
 * 素材库注入：模板提取与记录重建
 *
 * 从实验快照（用户手工在编辑器创建的素材组）提取四条记录模板
 * （顶层容器 / 分类副本容器 / 顶层组 / 分类副本组），注入新资产时
 * 以模板字段树为骨架做定点替换后重编码。所有编码规则来自真实
 * .gil 差分闭合（本会话 9 项 + 形状/槽位补充）：
 *
 *   - 容器（顶层）：501 ID + 502{11 自引用}+502{12 类型19}+502{14 分类副本}
 *     +502{16 布局} + 503 组ID列表 + 505{12 名字}+505{11 载体}+505{14 类型引用}
 *     +505{46 布局}
 *   - 容器（分类副本）：502{16}+502{11}+502{12 类型19}+502{13 顶层容器}
 *     +503 组列表 + 504 父分类(1841) + 505×4（同顶层）
 *   - 组（顶层）：501 ID + 502{11}+502{12 类型20} + 504 容器ID + 505{12 名字}
 *     +505{14} + 505{11 载体} + 505{31 形状+颜色}
 *   - 组（分类副本）：同顶层，504 指向分类容器
 *   - 图元槽（实）：501{502{501缩放 502锚点 503中心 504位置 505尺寸 506 508旋转}}，
 *     第一个无 seq，后续 seq=1,2,3；508 内旋转子字段号是 3
 *   - 图元槽（空）：同实槽但 504 只有 y（无 x）、508 为空
 *   - 形状：505{31:0B 501:21 502:38 503{31{2 类型码 3{501:-1} 4 ARGB 6:0B 10:0B}
 *     501:22 502:38 503:1 504{2:1 3:8 4 组ID}}}
 *   - 对端链接：顶层容器 502{14{501:w2(裸 varint 分类ID)}}，
 *     分类容器 502{13{501:w2(裸 varint 顶层ID)}}（w2 包裸 varint 怪癖，照抄）
 */

import fs from 'node:fs'
import { parseWireMessage, emitWireMessage } from './wire.js'
import { encodeVarint } from '../../injector/binary.js'
import type { WireField } from './wire.js'

/** 在消息字段列表中取第一个指定编号的字段 */
function field(fields: WireField[], number: number): WireField | undefined {
  return fields.find((x) => x.number === number)
}

/** 解析 w2 字段为消息（不可解析返回 undefined） */
function msg(f: WireField | undefined): WireField[] | undefined {
  if (!f || f.wire !== 2) return undefined
  return parseWireMessage(f.value as Uint8Array)
}

/** 替换消息内指定编号的 varint 字段 */
function setVarint(fields: WireField[], number: number, value: number): boolean {
  for (const f of fields) {
    if (f.number === number && f.wire === 0) {
      f.value = value
      return true
    }
  }
  return false
}

/** 替换消息内指定编号的 w2 字段内容 */
function setBytes(fields: WireField[], number: number, value: Uint8Array): boolean {
  for (const f of fields) {
    if (f.number === number && f.wire === 2) {
      f.value = value
      return true
    }
  }
  return false
}

/** 替换消息内指定编号的 fixed32 (wire5) 字段内容 */
function setFixed32(fields: WireField[], number: number, value: Uint8Array): boolean {
  for (const f of fields) {
    if (f.number === number && (f.wire === 5 || f.wire === 1)) {
      f.value = value
      return true
    }
  }
  return false
}

function f32(bytes: Uint8Array): number {
  return new DataView(bytes.buffer, bytes.byteOffset, 4).getFloat32(0, true)
}

function f32bytes(value: number): Uint8Array {
  const out = new Uint8Array(4)
  new DataView(out.buffer).setFloat32(0, value, true)
  return out
}

/** 记录类型 */
export interface LibraryTemplate {
  container: Uint8Array
  containerCopy: Uint8Array
  group: Uint8Array
  groupCopy: Uint8Array
  /** 组载体 12 里的实图元槽（原始字节，第一个无 seq） */
  primSlots: Uint8Array[]
  /** 容器载体 12 里的空图元槽 */
  emptySlots: Uint8Array[]
  containerId: number
  /** 分类容器 ID（顶层容器的 502{14} 对端） */
  copyId: number
  groupId: number
}

// 内置素材库模板（2026-08-23 从证据快照 1073741907.before-ui-image-ref.gil 提取）
// 用于空素材库自举：extractTemplate 找不到容器时返回此模板，让 library-inject 能注入第一个素材
// 字节 100% 来自真实编辑器创建的 guide-tap 素材（容器+分类副本+组+图元槽）
const BUILTIN_CONTAINER =
  'a81fe780808004b21f0f5a07a81fe780808004a81f01b01f05b21f0b6203a81f13a81f02b01f06b21f107208aa1f05e880808004a81f04b01f04b21f2a8201055a00a81f01a81f06b01f37ba1f19f20200a81f27b01f37b81f01c21f0a1001180820e780808004ba1f28e980808004eb80808004ed80808004ef80808004f180808004f380808004f580808004f780808004ca1f14620caa1f0967756964652d746170a81f02b01f0fca1fbc035a056200a81f02a81f01b01f0cba1fab036a9203628c03aa1f5db21f5aaa1f0f0d0000803f150000803f1d0000803fb21f0cad1f0000003fb51f0000003fba1f0cad1f0000003fb51f0000003fc21f06b51f545555b8ca1f0cad1f379a3a43b51f76345f43d21f0cad1f0000003fb51f0000003fe21f00aa1f60a81f01b21f5aaa1f0f0d0000803f150000803f1d0000803fb21f0cad1f0000003fb51f0000003fba1f0cad1f0000003fb51f0000003fc21f06b51f545555b8ca1f0cad1f379a3a43b51f76345f43d21f0cad1f0000003fb51f0000003fe21f00aa1f60a81f02b21f5aaa1f0f0d0000803f150000803f1d0000803fb21f0cad1f0000003fb51f0000003fba1f0cad1f0000003fb51f0000003fc21f06b51f545555b8ca1f0cad1f379a3a43b51f76345f43d21f0cad1f0000003fb51f0000003fe21f00aa1f60a81f03b21f5aaa1f0f0d0000803f150000803f1d0000803fb21f0cad1f0000003fb51f0000003fba1f0cad1f0000003fb51f0000003fc21f06b51f545555b8ca1f0cad1f379a3a43b51f76345f43d21f0cad1f0000003fb51f0000003fe21f00c01f01a81f02a81f04b01f0cb81f01c21f0a1001180820e780808004ca1f2d72057a00a81f05a81f04b01f17ba1f1d72057a00a81f05a81f05b01f17b81f01c21f0a1001180820e780808004ca1f37f20200a81f26b01f38ba1f2bfa02120a00120cad1f00004842b51f000048421802a81f28b01f38b81f01c21f0a1001180820e780808004'
const BUILTIN_CONTAINER_COPY =
  'a81fe880808004b21f2a8201055a00a81f01a81f06b01f37ba1f19f20200a81f27b01f37b81f01c21f0a1001180820e880808004b21f0f5a07a81fe880808004a81f01b01f05b21f0b6203a81f13a81f02b01f06b21f0f6a07a81fe780808004a81f03b01f03ba1f28ea80808004ec80808004ee80808004f080808004f280808004f480808004f680808004f880808004c01f9180808004ca1f14620caa1f0967756964652d746170a81f02b01f0fca1fbc035a056200a81f02a81f01b01f0cba1fab036a9203628c03aa1f5db21f5aaa1f0f0d0000803f150000803f1d0000803fb21f0cad1f0000003fb51f0000003fba1f0cad1f0000003fb51f0000003fc21f06b51f545555b8ca1f0cad1f379a3a43b51f76345f43d21f0cad1f0000003fb51f0000003fe21f00aa1f60a81f01b21f5aaa1f0f0d0000803f150000803f1d0000803fb21f0cad1f0000003fb51f0000003fba1f0cad1f0000003fb51f0000003fc21f06b51f545555b8ca1f0cad1f379a3a43b51f76345f43d21f0cad1f0000003fb51f0000003fe21f00aa1f60a81f02b21f5aaa1f0f0d0000803f150000803f1d0000803fb21f0cad1f0000003fb51f0000003fba1f0cad1f0000003fb51f0000003fc21f06b51f545555b8ca1f0cad1f379a3a43b51f76345f43d21f0cad1f0000003fb51f0000003fe21f00aa1f60a81f03b21f5aaa1f0f0d0000803f150000803f1d0000803fb21f0cad1f0000003fb51f0000003fba1f0cad1f0000003fb51f0000003fc21f06b51f545555b8ca1f0cad1f379a3a43b51f76345f43d21f0cad1f0000003fb51f0000003fe21f00c01f01a81f02a81f04b01f0cb81f01c21f0a1001180820e880808004ca1f2d72057a00a81f05a81f04b01f17ba1f1d72057a00a81f05a81f05b01f17b81f01c21f0a1001180820e880808004ca1f37f20200a81f26b01f38ba1f2bfa02120a00120cad1f00004842b51f000048421802a81f28b01f38b81f01c21f0a1001180820e880808004'
const BUILTIN_GROUP =
  'a81ff780808004b21f0f5a07a81ff780808004a81f01b01f05b21f0b6203a81f14a81f02b01f06c01fe780808004ca1f116209aa1f06e59bbee78987a81f02b01f0fca1f2d72057a00a81f05a81f04b01f17ba1f1d72057a00a81f05a81f05b01f17b81f01c21f0a1001180820f780808004ca1fd3035a056200a81f02a81f01b01f0cba1fc2036aa90362a303aa1f62b21f5faa1f0f0d0000803f150000803f1d0000803fb21f0cad1f9a99ff3eb51f0000003fba1f0cad1f0000003fb51f0000003fc21f06ad1f0000b042ca1f0cad1f0000c041b51f0000c041d21f0cad1f0000003fb51f0000003fe21f051d0000b4c2aa1f65a81f01b21f5faa1f0f0d0000803f150000803f1d0000803fb21f0cad1f9a99ff3eb51f0000003fba1f0cad1f0000003fb51f0000003fc21f06ad1f0000b042ca1f0cad1f0000c041b51f0000c041d21f0cad1f0000003fb51f0000003fe21f051d0000b4c2aa1f65a81f02b21f5faa1f0f0d0000803f150000803f1d0000803fb21f0cad1f9a99ff3eb51f0000003fba1f0cad1f0000003fb51f0000003fc21f06ad1f0000b042ca1f0cad1f0000c041b51f0000c041d21f0cad1f0000003fb51f0000003fe21f051d0000b4c2aa1f65a81f03b21f5faa1f0f0d0000803f150000803f1d0000803fb21f0cad1f9a99ff3eb51f0000003fba1f0cad1f0000003fb51f0000003fc21f06ad1f0000b042ca1f0cad1f0000c041b51f0000c041d21f0cad1f0000003fb51f0000003fe21f051d0000b4c2b01f09c01f01a81f02a81f04b01f0cb81f01c21f0a1001180820f780808004ca1f41fa0100a81f15b01f26ba1f35fa011c10a38d061a0ca81fffffffffffffffffff01208bbcd6ff0f32005200a81f16b01f26b81f01c21f0a1001180820f780808004'
const BUILTIN_GROUP_COPY =
  'a81ff880808004b21f0f5a07a81ff880808004a81f01b01f05b21f0b6203a81f14a81f02b01f06c01fe880808004ca1f116209aa1f06e59bbee78987a81f02b01f0fca1f2d72057a00a81f05a81f04b01f17ba1f1d72057a00a81f05a81f05b01f17b81f01c21f0a1001180820f880808004ca1fd3035a056200a81f02a81f01b01f0cba1fc2036aa90362a303aa1f62b21f5faa1f0f0d0000803f150000803f1d0000803fb21f0cad1f9a99ff3eb51f0000003fba1f0cad1f0000003fb51f0000003fc21f06ad1f0000b042ca1f0cad1f0000c041b51f0000c041d21f0cad1f0000003fb51f0000003fe21f051d0000b4c2aa1f65a81f01b21f5faa1f0f0d0000803f150000803f1d0000803fb21f0cad1f9a99ff3eb51f0000003fba1f0cad1f0000003fb51f0000003fc21f06ad1f0000b042ca1f0cad1f0000c041b51f0000c041d21f0cad1f0000003fb51f0000003fe21f051d0000b4c2aa1f65a81f02b21f5faa1f0f0d0000803f150000803f1d0000803fb21f0cad1f9a99ff3eb51f0000003fba1f0cad1f0000003fb51f0000003fc21f06ad1f0000b042ca1f0cad1f0000c041b51f0000c041d21f0cad1f0000003fb51f0000003fe21f051d0000b4c2aa1f65a81f03b21f5faa1f0f0d0000803f150000803f1d0000803fb21f0cad1f9a99ff3eb51f0000003fba1f0cad1f0000003fb51f0000003fc21f06ad1f0000b042ca1f0cad1f0000c041b51f0000c041d21f0cad1f0000003fb51f0000003fe21f051d0000b4c2b01f09c01f01a81f02a81f04b01f0cb81f01c21f0a1001180820f880808004ca1f41fa0100a81f15b01f26ba1f35fa011c10a38d061a0ca81fffffffffffffffffff01208bbcd6ff0f32005200a81f16b01f26b81f01c21f0a1001180820f880808004'
const BUILTIN_PRIM_SLOTS = [
  'b21f5faa1f0f0d0000803f150000803f1d0000803fb21f0cad1f9a99ff3eb51f0000003fba1f0cad1f0000003fb51f0000003fc21f06ad1f0000b042ca1f0cad1f0000c041b51f0000c041d21f0cad1f0000003fb51f0000003fe21f051d0000b4c2',
  'a81f01b21f5faa1f0f0d0000803f150000803f1d0000803fb21f0cad1f9a99ff3eb51f0000003fba1f0cad1f0000003fb51f0000003fc21f06ad1f0000b042ca1f0cad1f0000c041b51f0000c041d21f0cad1f0000003fb51f0000003fe21f051d0000b4c2',
  'a81f02b21f5faa1f0f0d0000803f150000803f1d0000803fb21f0cad1f9a99ff3eb51f0000003fba1f0cad1f0000003fb51f0000003fc21f06ad1f0000b042ca1f0cad1f0000c041b51f0000c041d21f0cad1f0000003fb51f0000003fe21f051d0000b4c2',
  'a81f03b21f5faa1f0f0d0000803f150000803f1d0000803fb21f0cad1f9a99ff3eb51f0000003fba1f0cad1f0000003fb51f0000003fc21f06ad1f0000b042ca1f0cad1f0000c041b51f0000c041d21f0cad1f0000003fb51f0000003fe21f051d0000b4c2',
]
const BUILTIN_EMPTY_SLOTS = [
  'b21f5aaa1f0f0d0000803f150000803f1d0000803fb21f0cad1f0000003fb51f0000003fba1f0cad1f0000003fb51f0000003fc21f06b51f545555b8ca1f0cad1f379a3a43b51f76345f43d21f0cad1f0000003fb51f0000003fe21f00',
  'a81f01b21f5aaa1f0f0d0000803f150000803f1d0000803fb21f0cad1f0000003fb51f0000003fba1f0cad1f0000003fb51f0000003fc21f06b51f545555b8ca1f0cad1f379a3a43b51f76345f43d21f0cad1f0000003fb51f0000003fe21f00',
  'a81f02b21f5aaa1f0f0d0000803f150000803f1d0000803fb21f0cad1f0000003fb51f0000003fba1f0cad1f0000003fb51f0000003fc21f06b51f545555b8ca1f0cad1f379a3a43b51f76345f43d21f0cad1f0000003fb51f0000003fe21f00',
  'a81f03b21f5aaa1f0f0d0000803f150000803f1d0000803fb21f0cad1f0000003fb51f0000003fba1f0cad1f0000003fb51f0000003fc21f06b51f545555b8ca1f0cad1f379a3a43b51f76345f43d21f0cad1f0000003fb51f0000003fe21f00',
]

/** 内置素材库模板（空素材库自举） */
export function builtinLibraryTemplate(): LibraryTemplate {
  return {
    container: Buffer.from(BUILTIN_CONTAINER, 'hex'),
    containerCopy: Buffer.from(BUILTIN_CONTAINER_COPY, 'hex'),
    group: Buffer.from(BUILTIN_GROUP, 'hex'),
    groupCopy: Buffer.from(BUILTIN_GROUP_COPY, 'hex'),
    primSlots: BUILTIN_PRIM_SLOTS.map((s) => Buffer.from(s, 'hex')),
    emptySlots: BUILTIN_EMPTY_SLOTS.map((s) => Buffer.from(s, 'hex')),
    containerId: 0,
    copyId: 0,
    groupId: 0,
  }
}

/** 从快照 .gil 提取四条模板记录（素材段最后一个容器及其分类副本） */
export function extractTemplate(gilPath: string): LibraryTemplate {
  const bytes = new Uint8Array(fs.readFileSync(gilPath))
  const top = parseWireMessage(bytes.slice(20, -4))
  if (!top) throw new Error('顶层解析失败')
  const root9 = top.find((f) => f.number === 9 && f.wire === 2)
  if (!root9) throw new Error('root9 素材段缺失')
  const sec = parseWireMessage(root9.value as Uint8Array)
  if (!sec) throw new Error('素材段解析失败')

  const recs: Map<number, Uint8Array> = new Map()
  const ids: number[] = []
  for (const f of sec) {
    if (f.number !== 502 || f.wire !== 2) continue
    const m = parseWireMessage(f.value as Uint8Array)
    if (!m) continue
    const id = m.find((x) => x.number === 501 && x.wire === 0)?.value as number | undefined
    if (id === undefined) continue
    recs.set(id, f.value as Uint8Array)
    ids.push(id)
  }
  // 容器 = 有 503 组列表 + 含 14 链接（顶层容器特征；分类副本含 13 无 14）；
  // ID 单调递增分配，取最大者为最新（实验容器）
  const containerId = Math.max(...ids.filter((id) => {
    const m = parseWireMessage(recs.get(id)!)
    if (!m?.find((x) => x.number === 503 && x.wire === 2)) return false
    // 检查是否有 502{14{...}} 顶层容器链接
    return m.some((f) => {
      if (f.number !== 502 || f.wire !== 2) return false
      const im = parseWireMessage(f.value as Uint8Array)
      return !!im?.some((l) => l.number === 14 && l.wire === 2)
    })
  }))
  if (!Number.isFinite(containerId)) return builtinLibraryTemplate()
  const container = recs.get(containerId)!
  const cm = parseWireMessage(container)!

  // 分类副本：502{14{501:w2(裸 varint)}} 或 502{13{501:w2(裸 varint)}}
  let copyId = -1
  for (const f of cm) {
    if (f.number !== 502 || f.wire !== 2) continue
    const inner = msg(f)
    if (!inner) continue
    for (const link of inner) {
      if (link.number !== 13 && link.number !== 14) continue
      const lm = msg(link)
      if (!lm) continue
      const inner501 = field(lm, 501)
      if (inner501?.wire === 2) {
        // w2 包裸 varint（顶层容器 14 链接的怪癖，照抄）
        const raw = inner501.value as Uint8Array
        let acc = 0
        let shift = 0
        for (const b of raw) {
          acc |= (b & 0x7f) << shift
          if (!(b & 0x80)) break
          shift += 7
        }
        copyId = acc
      } else if (inner501?.wire === 0) {
        // w0 裸 varint（分类副本 13 链接）
        copyId = inner501.value as number
      }
    }
  }
  if (copyId < 0) throw new Error('容器对端链接缺失')
  const containerCopy = recs.get(copyId)
  if (!containerCopy) throw new Error(`分类副本 ${copyId} 缺失`)

  // 组列表：容器 503 = varint 列表
  const g503 = field(cm, 503)
  if (!g503 || g503.wire !== 2) throw new Error('容器 503 组列表缺失')
  const gids: number[] = []
  {
    const raw = g503.value as Uint8Array
    let acc = 0
    let shift = 0
    for (const b of raw) {
      acc |= (b & 0x7f) << shift
      if (b & 0x80) shift += 7
      else {
        gids.push(acc)
        acc = 0
        shift = 0
      }
    }
  }
  const groupId = gids[gids.length - 1]
  if (groupId === undefined) throw new Error('容器无组')
  const group = recs.get(groupId)!
  // 分类组 = 分类容器 503 最后一个
  const ccm = parseWireMessage(containerCopy)!
  const cg503 = field(ccm, 503)
  let copyGroupId = -1
  if (cg503 && cg503.wire === 2) {
    const raw = cg503.value as Uint8Array
    let acc = 0
    let shift = 0
    const list: number[] = []
    for (const b of raw) {
      acc |= (b & 0x7f) << shift
      if (b & 0x80) shift += 7
      else {
        list.push(acc)
        acc = 0
        shift = 0
      }
    }
    copyGroupId = list[list.length - 1] ?? -1
  }
  const groupCopy = copyGroupId > 0 ? recs.get(copyGroupId) : undefined
  if (!groupCopy) throw new Error(`分类组 ${copyGroupId} 缺失`)

  // 提取图元槽：组记录 → 实槽（505{11} 载体），容器记录 → 空槽（同结构，槽内 508 为空）
  const carrierSlots = (rec: Uint8Array): Uint8Array[] => {
    const m = parseWireMessage(rec)!
    for (const f of m) {
      if (f.number !== 505 || f.wire !== 2) continue
      const sm = msg(f)
      if (!sm?.find((x) => x.number === 11 && x.wire === 2)) continue
      const f503 = field(sm, 503)
      const f503m = msg(f503)
      const f13 = f503m && field(f503m, 13)
      const f13m = msg(f13)
      const f12 = f13m && field(f13m, 12)
      const f12m = msg(f12)
      if (!f12m) continue
      const slots = f12m.filter((x) => x.number === 501 && x.wire === 2)
      if (slots.length > 0) return slots.map((s) => s.value as Uint8Array)
    }
    return []
  }
  const primSlots = carrierSlots(group)
  if (primSlots.length === 0) throw new Error('组载体无图元槽')
  const emptySlots = carrierSlots(container)
  if (emptySlots.length === 0) throw new Error('容器载体无空槽')

  return {
    container,
    containerCopy,
    group,
    groupCopy,
    primSlots,
    emptySlots,
    containerId,
    copyId,
    groupId,
  }
}

/** 替换图元槽 502 数据块内的 float（504 位置 / 505 尺寸 / 508 旋转，子字段为 wire5 fixed32） */
export function setPrimFloat(
  slot: Uint8Array,
  pos: { x: number; y: number },
  size: { w: number; h: number },
  rotate: number,
): Uint8Array {
  const sm = parseWireMessage(slot)
  if (!sm) throw new Error('图元槽解析失败')
  const data = msg(field(sm, 502))
  if (!data) throw new Error('图元槽 502 缺失')
  const p504 = msg(field(data, 504))
  if (!p504) throw new Error('图元槽 504 缺失')
  setFixed32Force(p504, 501, f32bytes(pos.x))
  setFixed32Force(p504, 502, f32bytes(pos.y))
  const p505 = msg(field(data, 505))
  if (!p505) throw new Error('图元槽 505 缺失')
  setFixed32Force(p505, 501, f32bytes(size.w))
  setFixed32Force(p505, 502, f32bytes(size.h))
  const p508 = msg(field(data, 508))
  if (!p508) throw new Error('图元槽 508 缺失')
  setFixed32Force(p508, 3, f32bytes(rotate))
  setBytes(data, 504, emitWireMessage(p504))
  setBytes(data, 505, emitWireMessage(p505))
  setBytes(data, 508, emitWireMessage(p508))
  setBytes(sm, 502, emitWireMessage(data))
  return emitWireMessage(sm)
}

/** 设置 fixed32 子字段；字段缺失时 push（容忍「半空槽」如 guide-tap 某图元槽 504 缺 y） */
function setFixed32Force(fields: WireField[], number: number, value: Uint8Array): void {
  if (!setFixed32(fields, number, value)) {
    fields.push({ number, wire: 5, value })
  }
}

/** 给槽设置 seq（第 0 槽无 seq；后续槽 501:w0=i，缺失时插入） */
export function setPrimSeq(slot: Uint8Array, seq: number): Uint8Array {
  if (seq === 0) return slot
  const sm = parseWireMessage(slot)
  if (!sm) throw new Error('图元槽解析失败')
  if (setVarint(sm, 501, seq)) return emitWireMessage(sm)
  sm.unshift({ number: 501, wire: 0, value: seq })
  return emitWireMessage(sm)
}

/** 组记录重建：ID / 容器引用 / 名字 / 图元槽 / 形状与颜色 */
export function buildGroupRecord(
  group: Uint8Array,
  id: number,
  containerId: number,
  name: string,
  slots: Uint8Array[],
  shapeType: number,
  color: number,
): Uint8Array {
  const m = parseWireMessage(group)
  if (!m) throw new Error('组记录解析失败')
  setVarint(m, 501, id)
  setVarint(m, 504, containerId)
  // 502{11{501:自引用}}
  for (const f of m) {
    if (f.number !== 502 || f.wire !== 2) continue
    const im = msg(f)
    if (!im) continue
    const ref = field(im, 11)
    const rm = msg(ref)
    if (rm && setVarint(rm, 501, id)) {
      setBytes(im, 11, emitWireMessage(rm))
      f.value = emitWireMessage(im)
    }
  }
  for (const f of m) {
    if (f.number !== 505 || f.wire !== 2) continue
    const sm = msg(f)
    if (!sm) continue
    // 名字 505{12{501:"..."}}
    const t12 = msg(field(sm, 12))
    if (t12) {
      const s = field(t12, 501)
      if (s?.wire === 2) {
        s.value = new TextEncoder().encode(name)
        setBytes(sm, 12, emitWireMessage(t12))
        f.value = emitWireMessage(sm)
        continue
      }
    }
    // 载体 505{11{...503{13{12{槽}}}}}：替换槽列表 + 504{4: refId}
    if (sm.find((x) => x.number === 11 && x.wire === 2)) {
      const f503 = field(sm, 503)
      const f503m = msg(f503)
      const f13 = f503m && field(f503m, 13)
      const f13m = msg(f13)
      const f12 = f13m && field(f13m, 12)
      const f12m = msg(f12)
      if (f12m) {
        const tail = f12m.filter((x) => !(x.number === 501 && x.wire === 2))
        const slotFields = slots.map((s) => ({ number: 501, wire: 2, value: s }))
        setBytes(f13m!, 12, emitWireMessage([...slotFields, ...tail]))
        setBytes(f503m!, 13, emitWireMessage(f13m!))
        const s504 = field(f503m!, 504)
        const s504m = msg(s504)
        if (s504m && setVarint(s504m, 4, id)) setBytes(f503m!, 504, emitWireMessage(s504m))
        setBytes(sm, 503, emitWireMessage(f503m!))
        f.value = emitWireMessage(sm)
        continue
      }
    }
    // 形状 505{31:0B 501 502 503{31{2 4} 504{4:refId}}}
    if (sm.find((x) => x.number === 31 && x.wire === 2)) {
      const f503 = field(sm, 503)
      const f503m = msg(f503)
      const g31 = f503m && field(f503m, 31)
      const g31m = msg(g31)
      if (g31m) {
        setVarint(g31m, 2, shapeType)
        setVarint(g31m, 4, color)
        setBytes(f503m!, 31, emitWireMessage(g31m))
        const s504 = field(f503m!, 504)
        const s504m = msg(s504)
        if (s504m && setVarint(s504m, 4, id)) setBytes(f503m!, 504, emitWireMessage(s504m))
        setBytes(sm, 503, emitWireMessage(f503m!))
        f.value = emitWireMessage(sm)
        continue
      }
    }
    // 类型引用 505{14{...503{504{4:refId}}}}：只改内嵌 504
    const f503 = field(sm, 503)
    const f503m = msg(f503)
    if (f503m) {
      const s504 = field(f503m, 504)
      const s504m = msg(s504)
      if (s504m && setVarint(s504m, 4, id)) {
        setBytes(f503m, 504, emitWireMessage(s504m))
        setBytes(sm, 503, emitWireMessage(f503m))
        f.value = emitWireMessage(sm)
      }
    }
  }
  return emitWireMessage(m)
}

/** 容器记录重建：ID / 对端链接 / 组列表 / 名字 / 载体空槽 / 内嵌 504 引用 */
export function buildContainerRecord(
  container: Uint8Array,
  id: number,
  copyId: number,
  groupIds: number[],
  name: string,
  isCopy: boolean,
): Uint8Array {
  const m = parseWireMessage(container)
  if (!m) throw new Error('容器记录解析失败')
  setVarint(m, 501, id)
  // 502{11{501:自引用}} 与 502{14/13{501:w2(裸 varint 对端)}}
  for (const f of m) {
    if (f.number !== 502 || f.wire !== 2) continue
    const im = msg(f)
    if (!im) continue
    const ref = field(im, 11)
    const rm = msg(ref)
    if (rm && setVarint(rm, 501, id)) {
      setBytes(im, 11, emitWireMessage(rm))
      f.value = emitWireMessage(im)
      continue
    }
    for (const link of im) {
      if ((link.number === 13 || link.number === 14) && link.wire === 2) {
        const lm = msg(link)
        const inner501 = lm && field(lm, 501)
        if (inner501?.wire === 2) {
          // 顶层容器 14 的怪癖：501 是 w2 包裸 varint
          inner501.value = encodeVarint(copyId)
          link.value = emitWireMessage(lm!)
          f.value = emitWireMessage(im)
        } else if (inner501?.wire === 0) {
          // 分类容器 13 的 501 是普通 w0 varint
          inner501.value = copyId
          link.value = emitWireMessage(lm!)
          f.value = emitWireMessage(im)
        }
      }
    }
    // 502(42B) 内嵌 503{... 504{2:1, 3:8, 4:自身ID}}
    const im503 = msg(field(im, 503))
    if (im503) {
      const s504 = field(im503, 504)
      const s504m = msg(s504)
      if (s504m && setVarint(s504m, 4, id)) {
        setBytes(im503, 504, emitWireMessage(s504m))
        setBytes(im, 503, emitWireMessage(im503))
        f.value = emitWireMessage(im)
      }
    }
  }
  // 503 组列表
  const g503 = field(m, 503)
  if (g503?.wire === 2) {
    const parts: Uint8Array[] = []
    for (const g of groupIds) parts.push(encodeVarint(g))
    g503.value = Buffer.concat(parts.map((p) => Buffer.from(p)))
  }
  // 名字与内嵌引用（505 系列）
  for (const f of m) {
    if (f.number !== 505 || f.wire !== 2) continue
    const sm = msg(f)
    if (!sm) continue
    const t12 = msg(field(sm, 12))
    if (t12) {
      const s = field(t12, 501)
      if (s?.wire === 2) {
        s.value = new TextEncoder().encode(name)
        setBytes(sm, 12, emitWireMessage(t12))
        f.value = emitWireMessage(sm)
        continue
      }
    }
    const f503 = field(sm, 503)
    const f503m = msg(f503)
    if (f503m) {
      const s504 = field(f503m, 504)
      const s504m = msg(s504)
      if (s504m && setVarint(s504m, 4, id)) {
        setBytes(f503m, 504, emitWireMessage(s504m))
        setBytes(sm, 503, emitWireMessage(f503m))
        f.value = emitWireMessage(sm)
      }
    }
  }
  // 分类副本：容器级 504 = 父分类（模板值 1841，保留不动）；顶层无 504
  void isCopy
  return emitWireMessage(m)
}
