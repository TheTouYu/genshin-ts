// 结构体（Structure）资产读写 —— 地图级资产，注册在 root6 folder 记录，定义在 root10 的 f6。
//
// 权威文档：docs/game-engine-knowledge/struct-assets.md
//   · 基础结构体   folderId 29 / typeValue 4100
//   · 局内存档结构体 folderId 33 / typeValue 4600（f1 块多一个 f2=2）
//   · 结构体 id 与自定义元件共用 1077936129+ 段，逐个 +1
//   · 成员 = { f1{类型} f3{默认值} f5/f501=名 f502=类型码 f503=序号 }
//   · 默认值字段号 = 类型码 + 10（跨 12 种类型已验证）
//   · 建结构体会**整表改写**既有记录（f503 递增），并向地图**物化 9 条节点族记录**

import { parseWireMessage, printableWireText, emitWireMessage, type WireField } from './static_assembly/wire.js'
import { readVarint, encodeVarint } from '../injector/binary.js'

export const STRUCT_FOLDER_BASIC = 29
export const STRUCT_FOLDER_ARCHIVED = 33
export const STRUCT_TYPE_VALUE_BASIC = 4100
export const STRUCT_TYPE_VALUE_ARCHIVED = 4600

/** 结构体 id 与自定义元件共用此区段起点（0x40400001） */
export const STRUCT_ID_START = 1077936129

/** 局内存档结构体在 f1 主块里的标记（基础结构体无此字段） */
const ARCHIVED_MARKER = 2

/** 结构体类型码（变量类型空间里的 25 / 26） */
export const TYPE_CODE_STRUCT = 25
export const TYPE_CODE_STRUCT_LIST = 26

export type StructMember = {
  name: string
  typeCode: number
  /** 成员序号，从 1 起 */
  order: number
  /** 引用的结构体 id（仅 struct / struct_list 成员有） */
  refStructId?: number
  /** struct_list 成员的默认元素个数 */
  listLength?: number
}

export type StructDef = {
  id: number
  name: string
  archived: boolean
  members: StructMember[]
  /** f503 —— 编辑器整表改写的计数（2026-09-16：= 2 + 该记录被改写次数） */
  rewriteCounter: number
  /** 顶层记录，写回时原样保留未触碰字段 */
  raw: Uint8Array
}

export type StructFolderEntry = {
  folderId: number
  typeValue: number
  structId: number
  /** 条目所在页签字段号：3 = "未分类页签"（编辑器新建路径）；2.f4 = "导入资产" */
  tabField: number
  /** 顶层字段号（folder 记录挂在 root6 的第几号字段下） */
  topField: number
}

export type StructIndex = {
  defs: StructDef[]
  entries: StructFolderEntry[]
}

function varintOf(fields: readonly WireField[], number: number): number | undefined {
  const f = fields.find((x) => x.number === number && x.wire === 0)
  return typeof f?.value === 'number' ? f.value : undefined
}

function textOf(fields: readonly WireField[], number: number): string | undefined {
  const f = fields.find((x) => x.number === number && x.wire === 2)
  return f ? printableWireText(f.value as Uint8Array) : undefined
}

export function readRootFields(bytes: Uint8Array): WireField[] {
  const root = parseWireMessage(bytes.slice(20, -4))
  if (!root) throw new Error('[error] malformed GIL payload')
  return root
}

export function rootContainer(root: readonly WireField[], number: number): WireField[] | undefined {
  const f = root.find((x) => x.number === number && x.wire === 2)
  return f ? parseWireMessage(f.value as Uint8Array) : undefined
}

/** 结构体定义记录位于 root10 的 f6（一个结构体一条，编辑器从不复用 id） */
export function readStructDefs(bytes: Uint8Array): StructDef[] {
  const root = readRootFields(bytes)
  const root10 = rootContainer(root, 10)
  if (!root10) return []
  const out: StructDef[] = []
  for (const rec of root10.filter((f) => f.number === 6 && f.wire === 2)) {
    const raw = rec.value as Uint8Array
    const top = parseWireMessage(raw)
    if (!top) continue
    const f1 = top.find((f) => f.number === 1 && f.wire === 2)
    if (!f1) continue
    const main = parseWireMessage(f1.value as Uint8Array)
    if (!main) continue
    const id = varintOf(main, 1)
    const name = textOf(main, 501)
    if (id === undefined || name === undefined) continue
    out.push({
      id,
      name,
      archived: varintOf(main, 2) === ARCHIVED_MARKER,
      members: readMembers(main),
      rewriteCounter: varintOf(main, 503) ?? 0,
      raw
    })
  }
  return out.sort((a, b) => a.id - b.id)
}

function readMembers(main: readonly WireField[]): StructMember[] {
  const members: StructMember[] = []
  for (const f of main.filter((x) => x.number === 3 && x.wire === 2)) {
    const m = parseWireMessage(f.value as Uint8Array)
    if (!m) continue
    const name = textOf(m, 501) ?? textOf(m, 5)
    const typeCode = varintOf(m, 502)
    if (name === undefined || typeCode === undefined) continue
    const member: StructMember = {
      name,
      typeCode,
      order: varintOf(m, 503) ?? members.length + 1
    }
    // 引用信息在 f1.f2（struct / struct_list 成员）与 f3 的默认值展开里
    const f1 = m.find((x) => x.number === 1 && x.wire === 2)
    const typeMsg = f1 ? parseWireMessage(f1.value as Uint8Array) : undefined
    const refMsg = typeMsg?.find((x) => x.number === 2 && x.wire === 2)
    if (refMsg) {
      const ref = parseWireMessage(refMsg.value as Uint8Array)
      const refId = ref ? varintOf(ref, 2) : undefined
      if (refId !== undefined) member.refStructId = refId
    }
    const defMsg = m.find((x) => x.number === 3 && x.wire === 2)
    const def = defMsg ? parseWireMessage(defMsg.value as Uint8Array) : undefined
    const defField = def?.find((x) => x.number === typeCode + 10 && x.wire === 2)
    if (defField && typeCode === TYPE_CODE_STRUCT_LIST) {
      const list = parseWireMessage(defField.value as Uint8Array)
      if (list) {
        member.listLength = list.filter((x) => x.number === 1).length
        const tail = varintOf(list, 501)
        if (tail !== undefined && member.refStructId === undefined) member.refStructId = tail
      }
    }
    members.push(member)
  }
  return members.sort((a, b) => a.order - b.order)
}

/** 结构体在 root6 的 folder 注册（f5 = { f1: typeValue, f2: structId }） */
export function readStructFolderEntries(bytes: Uint8Array): StructFolderEntry[] {
  const root = readRootFields(bytes)
  const root6 = rootContainer(root, 6)
  if (!root6) return []
  const out: StructFolderEntry[] = []
  const wanted = new Set([STRUCT_FOLDER_BASIC, STRUCT_FOLDER_ARCHIVED])
  for (const rec of root6.filter((f) => f.number === 1 && f.wire === 2)) {
    const inner = parseWireMessage(rec.value as Uint8Array)
    if (!inner) continue
    const folderId = varintOf(inner, 1)
    if (folderId === undefined || !wanted.has(folderId)) continue
    // f3 = "未分类页签"（编辑器新建路径）；f2.f4 = "导入资产"（导入路径）
    const scan = (fields: readonly WireField[], topField: number): void => {
      const tab = fields.find((f) => f.number === 3 && f.wire === 2)
      const tabMsg = tab ? parseWireMessage(tab.value as Uint8Array) : undefined
      for (const e of tabMsg ?? []) {
        if (e.number !== 5 || e.wire !== 2) continue
        const entry = parseWireMessage(e.value as Uint8Array)
        const typeValue = entry ? varintOf(entry, 1) : undefined
        const structId = entry ? varintOf(entry, 2) : undefined
        if (typeValue === undefined || structId === undefined) continue
        out.push({ folderId, typeValue, structId, tabField: 3, topField })
      }
    }
    scan(inner, 1)
    const f2 = inner.find((f) => f.number === 2 && f.wire === 2)
    const f2Msg = f2 ? parseWireMessage(f2.value as Uint8Array) : undefined
    const f4 = f2Msg?.find((f) => f.number === 4 && f.wire === 2)
    if (f4) scan([{ number: 3, wire: 2, value: f4.value as Uint8Array }], 2)
  }
  return out
}

export async function readStructIndex(bytes: Uint8Array): Promise<StructIndex> {
  return { defs: readStructDefs(bytes), entries: readStructFolderEntries(bytes) }
}

/** 下一个可用结构体 id（与既有定义取 max + 1，空则区段起点） */
export function nextStructId(defs: readonly StructDef[]): number {
  const ids = defs.map((d) => d.id).filter((id) => id >= STRUCT_ID_START)
  return ids.length ? Math.max(...ids) + 1 : STRUCT_ID_START
}

export { varintOf as structVarintOf, textOf as structTextOf, emitWireMessage, encodeVarint, readVarint }

// ───────────────────────── 写回：新建结构体 ─────────────────────────

/** 空 message（proto3 里「字段存在但内容为空」与「字段省略」语义不同，编辑器写的是前者） */
const EMPTY_MSG = new Uint8Array(0)

/**
 * 成员的三个块（与编辑器产物逐字节同构）：
 *   f1 = { 1: 类型码, 2: <引用包裹 或 空> }
 *   f3 = { 1: 类型码, 2: <与 f1 同形的类型包裹>, <类型码+10>: 默认值 }
 */
function buildMemberFields(m: { name: string; typeCode: number; order: number }, refId?: number): WireField[] {
  const t = m.typeCode
  const refInner =
    refId !== undefined
      ? emitWireMessage([{ number: 1, wire: 0, value: 1 }, { number: 2, wire: 0, value: refId }])
      : EMPTY_MSG
  const typeBytes = emitWireMessage([
    { number: 1, wire: 0, value: t },
    { number: 2, wire: 2, value: refInner }
  ])
  const f3 = emitWireMessage([
    { number: 1, wire: 0, value: t },
    { number: 2, wire: 2, value: typeBytes },
    { number: t + 10, wire: 2, value: EMPTY_MSG }
  ])
  const nameBytes = Buffer.from(m.name, 'utf8')
  return [
    { number: 1, wire: 2, value: typeBytes },
    { number: 3, wire: 2, value: f3 },
    { number: 5, wire: 2, value: nameBytes },
    { number: 501, wire: 2, value: nameBytes },
    { number: 502, wire: 0, value: t },
    { number: 503, wire: 0, value: m.order }
  ]
}

export type NewStructMember = { name: string; typeCode: number; refStructId?: number }

/** 构造 root10 `f6` 里的一条结构体记录：{ 1:DefBlock 2:镜像 3:改写计数 4:成员数 5:1 } */
export function buildStructDefRecord(
  id: number,
  name: string,
  members: readonly NewStructMember[],
  rewriteCounter: number
): Uint8Array {
  for (const m of members) {
    if (m.typeCode === TYPE_CODE_STRUCT || m.typeCode === TYPE_CODE_STRUCT_LIST) {
      throw new Error(
        `[error] 成员 "${m.name}" 是 ${m.typeCode === TYPE_CODE_STRUCT ? '结构体' : '结构体列表'}，` +
          '其默认值需要把被引用结构体的成员逐个展开（深度递归，字节模板尚未闭合）。' +
          '先支持标量/列表成员；结构体成员的默认值展开待补差分后开放。'
      )
    }
  }
  const memberFields = members.map((m, i) => ({
    number: 3,
    wire: 2 as const,
    value: emitWireMessage(buildMemberFields({ name: m.name, typeCode: m.typeCode, order: i + 1 }, m.refStructId))
  }))
  const block = emitWireMessage([
    { number: 1, wire: 0, value: id },
    ...memberFields,
    { number: 501, wire: 2, value: Buffer.from(name, 'utf8') },
    { number: 502, wire: 0, value: 1 },
    { number: 503, wire: 0, value: rewriteCounter }
  ])
  return emitWireMessage([
    { number: 1, wire: 2, value: block },
    { number: 2, wire: 2, value: block },
    { number: 3, wire: 0, value: rewriteCounter },
    { number: 4, wire: 0, value: members.length },
    { number: 5, wire: 0, value: 1 }
  ])
}

/** 把 root 的某个容器字段替换为新的字节（保持其它字段与顺序不变） */
function withContainer(root: readonly WireField[], number: number, newBytes: Uint8Array): Uint8Array {
  let done = false
  const next = root.map((f) => {
    if (!done && f.number === number && f.wire === 2) {
      done = true
      return { number: f.number, wire: 2 as const, value: newBytes }
    }
    return f
  })
  if (!done) next.push({ number, wire: 2, value: newBytes })
  return emitWireMessage(next)
}

export type AppendResult = { payload: Uint8Array; changed: string[] }

/**
 * 新建一个基础/存档结构体：三条改动一次完成。
 *  ① root10.f6 追加一条定义记录（f1 与 f2 为等长镜像）
 *  ② 既有结构体的改写计数 +1（编辑器整表改写语义，C11/C-D69）
 *  ③ root6 的对应 folder 记录（f1=29 基础 / 33 存档）在其 f3「未分类页签」下追加 f5 条目
 */
export function appendStruct(payload: Uint8Array, opts: {
  id: number
  name: string
  members: readonly NewStructMember[]
  archived: boolean
}): AppendResult {
  const root = parseWireMessage(payload)
  if (!root) throw new Error('[error] malformed GIL payload')
  const changed: string[] = []

  // ① root10：每个结构体 = 一个独立的 f6 字段，字段内容 = { 1:DefBlock 2:镜像 3:计数 4:成员数 5:1 }
  //    （既有结构体要整表改写：其 f6 字段内容的 f3 与 DefBlock.f503 各 +1）
  const r10 = rootContainer(root, 10)
  if (!r10) throw new Error('[error] 地图缺少 root10（节点图容器），无法登记结构体')
  const bumpBlock = (bytes: Uint8Array): Uint8Array => {
    const blk = parseWireMessage(bytes) ?? []
    return emitWireMessage(
      blk.map((y) => (y.number === 503 && y.wire === 0 ? { number: 503, wire: 0 as const, value: (y.value as number) + 1 } : y))
    )
  }
  let existing = 0
  const rewritten = r10.map((f) => {
    if (f.number !== 6 || f.wire !== 2) return f
    const content = parseWireMessage(f.value as Uint8Array)
    if (!content) return f
    existing += 1
    const next = content.map((x) => {
      if (x.number === 3 && x.wire === 0) return { number: 3, wire: 0 as const, value: (x.value as number) + 1 }
      if ((x.number === 1 || x.number === 2) && x.wire === 2) {
        return { number: x.number, wire: 2 as const, value: bumpBlock(x.value as Uint8Array) }
      }
      return x
    })
    return { number: 6, wire: 2 as const, value: emitWireMessage(next) }
  })
  // 新建的记录：f503 写 2（编辑器语义 = 2 + 之后创建数，新建时为 2）
  const newRecord = buildStructDefRecord(opts.id, opts.name, opts.members, 2)
  const r10Bytes = emitWireMessage([...rewritten, { number: 6, wire: 2 as const, value: newRecord }])
  let nextPayload = withContainer(root, 10, r10Bytes)
  changed.push(`root10 追加结构体 [${opts.id}] "${opts.name}"（${opts.members.length} 成员）`)
  if (existing > 0) changed.push(`既有 ${existing} 条结构体的改写计数 +1`)

  // ③ root6 folder 条目
  const folderId = opts.archived ? STRUCT_FOLDER_ARCHIVED : STRUCT_FOLDER_BASIC
  const typeValue = opts.archived ? STRUCT_TYPE_VALUE_ARCHIVED : STRUCT_TYPE_VALUE_BASIC
  const root6 = rootContainer(parseWireMessage(nextPayload)!, 6)
  if (!root6) throw new Error('[error] 地图缺少 root6（资产目录），无法登记结构体')
  let appended = false
  const recs = root6.map((rec) => {
    if (rec.number !== 1 || rec.wire !== 2) return rec
    const inner = parseWireMessage(rec.value as Uint8Array)
    if (!inner || varintOf(inner, 1) !== folderId) return rec
    const entry = emitWireMessage([{ number: 1, wire: 0, value: typeValue }, { number: 2, wire: 0, value: opts.id }])
    const mapped = inner.map((f) => {
      if (f.number === 3 && f.wire === 2) {
        const tab = parseWireMessage(f.value as Uint8Array) ?? []
        appended = true
        return { number: 3, wire: 2 as const, value: emitWireMessage([...tab, { number: 5, wire: 2, value: entry }]) }
      }
      return f
    })
    return { number: 1, wire: 2 as const, value: emitWireMessage(mapped) }
  })
  if (!appended) {
    throw new Error(
      `[error] root6 里没有 folderId=${folderId} 的记录（地图骨架缺该 folder）。` +
        '已知 folder 记录由地图骨架提供；缺失时不擅自新建字节，请先用编辑器在本图建一个同类结构体再重试。'
    )
  }
  nextPayload = withContainer(parseWireMessage(nextPayload)!, 6, emitWireMessage(recs))
  changed.push(`root6 folder ${folderId} 追加条目 { typeValue=${typeValue}, structId=${opts.id} }`)

  return { payload: nextPayload, changed }
}

/** GIL 文件重建：20B 头 + 载荷 + 4B 尾（与 gil_custom_variables.rebuildGilFileFromSource 同构） */
export function rebuildGil(source: Uint8Array, newPayload: Uint8Array): Uint8Array {
  const out = Buffer.alloc(newPayload.length + 24)
  Buffer.from(source).copy(out, 0, 0, 20)
  new DataView(out.buffer, out.byteOffset, out.byteLength).setUint32(0, newPayload.length + 20, false)
  new DataView(out.buffer, out.byteOffset, out.byteLength).setUint32(16, newPayload.length, false)
  Buffer.from(newPayload).copy(out, 20)
  Buffer.from(source).copy(out, out.length - 4, source.length - 4)
  return out
}
