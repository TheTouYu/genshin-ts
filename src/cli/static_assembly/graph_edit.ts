/**
 * 节点图「读-改-写」精准编辑库（2026-08-08）。
 *
 * 全部原语为记录级局部替换：只替换目标 NodeGraph / CompositeDef 记录字节，
 * 其余 root 原样保留（与 static_assembly/patch.ts 同一套 applyReplacement 管线）。
 *
 * 编码规则来源：docs/game-engine-knowledge/node-graphs.md / control-flow.md /
 * data-flow.md / composite-nodes.md（真实相邻快照闭合）；第三方 gia.proto 字段号。
 * 未闭合规则（Variant 自动实例化、实例 nodeIndex 重编号、node 增删、entity 固定值、
 * i2.index 语义等）一律 fail closed，不推测编码。
 *
 * 字段号速查（wire）：
 *   NodeGraph {1:id, 2:name, 3:nodes, 4:compositePins}
 *   GraphNode {1:nodeIndex, 2:genericId, 3:concreteId, 4:pins, 5:x, 6:y}
 *   NodePin   {1:i1, 2:i2, 3:value, 4:type, 5:connects, 7:compositePinIndex}
 *   Index     {1:kind(1=InFlow 2=OutFlow 3=InParam 4=OutParam), 2:index}
 *   NodeConnection {1:id, 2:connect, 3:connect2}   # connect/connect2 双写
 *   CompositeDef {4:id, 100:inflows, 101:outflows, 102:inputs, 103:outputs,
 *                 107:type, 200:name, 201:description, 203:xxx}
 *   ParameterFlow/ControlFlow {1:name, 2:visible, 3:index, 4:type, 8:pinIndex}
 *   VarBase {1:class, 2:alreadySetVal, 4:itemType{1:1,100:{1:VarType}},
 *            101:bId, 102:bInt, 104:bFloat, 105:bString, 106:bEnum, 107:bVector}
 */
import { applyReplacement, buildFile, parseMessage, readUint32BE } from '../../injector/binary.js'
import type { LenField } from '../../injector/types.js'
import { emitWireMessage, parseWireMessage, type WireField } from './wire.js'
import { NODE_PIN_RECORDS } from '../../thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/node_data/node_pin_records.js'

// ---- 常量 ----

export const PIN_KIND = { IN_FLOW: 1, OUT_FLOW: 2, IN_PARAM: 3, OUT_PARAM: 4 } as const

export const VAR_TYPE_NAME: Record<number, string> = {
  0: 'Unk',
  1: 'Ety',
  2: 'Gid',
  3: 'Int',
  4: 'Bol',
  5: 'Flt',
  6: 'Str',
  7: 'GidList',
  8: 'IntList',
  9: 'BolList',
  10: 'FltList',
  11: 'StrList',
  12: 'Vec',
  13: 'EtyList',
  14: 'EnumItem',
  15: 'VecList',
  16: 'LocalVariable',
  17: 'Fct',
  20: 'Cfg',
  21: 'Pfb',
  22: 'CfgList',
  23: 'PfbList',
  24: 'FctList',
  25: 'Struct',
  26: 'StructList',
  27: 'Dict',
  28: 'VariableSnapshot'
}

/** NODE_PIN_RECORDS 输入类型名 → VarType（新建数据 pin 的 type 字段来源）。 */
const INPUT_TYPE: Record<string, number> = {
  Unk: 0,
  Ety: 1,
  Gid: 2,
  Int: 3,
  Bol: 4,
  Flt: 5,
  Str: 6,
  'L<Gid>': 7,
  'L<Int>': 8,
  'L<Bol>': 9,
  'L<Flt>': 10,
  'L<Str>': 11,
  Vec: 12,
  'L<Ety>': 13,
  'L<Vec>': 15,
  EnumItem: 14,
  Fct: 17,
  Cfg: 20,
  Pfb: 21,
  'L<Cfg>': 22,
  'L<Pfb>': 23,
  'L<Fct>': 25
}

// ---- 工具 ----

function float32Bytes(value: number): Uint8Array {
  const b = new Uint8Array(4)
  new DataView(b.buffer).setFloat32(0, value, true)
  return b
}

function textBytes(text: string): Uint8Array {
  return new TextEncoder().encode(text)
}

function intBytes(value: number): Uint8Array {
  return emitWireMessage([{ number: 1, wire: 0, value }])
}

function sub(fields: WireField[]): Uint8Array {
  return emitWireMessage(fields)
}

// ---- 值编码（真实快照闭合：signals.md / node-graphs.md v5-v6）----

/** itemType = {1: classBase(Server=1), 100: ServerType{1: VarType}} */
function itemTypeBytes(type: number): Uint8Array {
  return sub([
    { number: 1, wire: 0, value: 1 },
    { number: 100, wire: 2, value: sub([{ number: 1, wire: 0, value: type }]) }
  ])
}

function varBase(classId: number, type: number, oneof: WireField): Uint8Array {
  return sub([
    { number: 1, wire: 0, value: classId },
    { number: 2, wire: 0, value: 1 },
    { number: 4, wire: 2, value: itemTypeBytes(type) },
    oneof
  ])
}

/**
 * R<T> 泛型 pin 固定值 = ConcreteBase 包装（2026-08-09 param-turn Q3 闭合；
 * 真实快照：run.main n43 Equal-Str / 平滑反弹面y n31/n34 Set-Bol / n50 Set-Flt）。
 * indexOfConcrete = 节点族 reflectMap 中 concreteId 的位置（0 省略）。
 */
export function wrapConcreteValue(inner: Uint8Array, indexOfConcrete: number): Uint8Array {
  const concreteFields: WireField[] = []
  if (indexOfConcrete > 0) concreteFields.push({ number: 1, wire: 0, value: indexOfConcrete })
  concreteFields.push({ number: 2, wire: 2, value: inner })
  return sub([
    { number: 1, wire: 0, value: 10000 },
    { number: 2, wire: 0, value: 1 },
    { number: 110, wire: 2, value: sub(concreteFields) }
  ])
}

/** 变体 concreteId 在节点族 reflectMap 中的位置（R<T> 固定值 indexOfConcrete 来源）。 */
export function reflectConcreteIndex(
  nodeId: number,
  concreteId: number | undefined
): number | undefined {
  const record = RECORDS.find((r) => r.id === nodeId) as
    | { reflectMap?: Array<[number, string]> }
    | undefined
  if (!record?.reflectMap || concreteId === undefined) return undefined
  const i = record.reflectMap.findIndex(([id]) => id === concreteId)
  return i < 0 ? undefined : i
}

/** 节点定义输入类型原名（'R<T>' 等，INPUT_TYPE 未收录的名字）。 */
export function nodeInputTypeName(nodeId: number, shell: number): string | undefined {
  return RECORDS.find((r) => r.id === nodeId)?.inputs?.[shell]
}

/** 固定值编码（字段顺序按真实快照：class, alreadySetVal, itemType, oneof）。 */
export function buildVarValue(type: number, value: string | number): Uint8Array {
  switch (type) {
    case 3: // Int
      return varBase(2, 3, { number: 102, wire: 2, value: intBytes(Number(value)) })
    case 5: // Float
      return varBase(4, 5, {
        number: 104,
        wire: 2,
        value: sub([{ number: 1, wire: 5, value: float32Bytes(Number(value)) }])
      })
    case 6: // String
      return varBase(5, 6, {
        number: 105,
        wire: 2,
        value: sub([{ number: 1, wire: 2, value: textBytes(String(value)) }])
      })
    case 4: // Boolean：true=bEnum{1:1}，false=bEnum 空消息（v6 快照）
      return varBase(6, 4, {
        number: 106,
        wire: 2,
        value: value === 1 || String(value) === 'true'
          ? sub([{ number: 1, wire: 0, value: 1 }])
          : new Uint8Array()
      })
    case 14: // EnumItem：bEnum{1: 枚举数值}（真实快照：Bind 复合 668 InParam[5]/[6]，2026-08-10 闭合）
      return varBase(6, 14, {
        number: 106,
        wire: 2,
        value: sub([{ number: 1, wire: 0, value: Number(value) }])
      })
    case 12: {
      // Vector：bVector{1: Vec{1:x, 2:y, 3:z}}，float32
      const parts = String(value)
        .split(',')
        .map((v) => Number(v.trim()))
      if (parts.length !== 3 || parts.some((v) => Number.isNaN(v))) {
        throw new Error(`[error] vec value must be "x,y,z": ${value}`)
      }
      const vec = sub([
        { number: 1, wire: 5, value: float32Bytes(parts[0]) },
        { number: 2, wire: 5, value: float32Bytes(parts[1]) },
        { number: 3, wire: 5, value: float32Bytes(parts[2]) }
      ])
      return varBase(7, 12, { number: 107, wire: 2, value: sub([{ number: 1, wire: 2, value: vec }]) })
    }
    case 1: // Entity
      throw new Error('[error] entity 固定值编码未闭合（signals.md 待验证）；请用 link 连线')
    case 2: // GUID
    case 20: // Configuration
    case 21: // Prefab
      return varBase(1, type, { number: 101, wire: 2, value: intBytes(Number(value)) })
    default:
      throw new Error(`[error] 暂不支持的固定值类型 VarType=${type}`)
  }
}

/** 解析 CLI 形如 `int:123` / `str:abc` / `vec:1,2,3` 的类型化值。 */
export function parseTypedValue(text: string): { type: number; bytes: Uint8Array } {
  const colon = text.indexOf(':')
  if (colon <= 0) throw new Error(`[error] 值必须带类型前缀，如 int:123 str:abc vec:1,2,3：${text}`)
  const name = text.slice(0, colon)
  const raw = text.slice(colon + 1)
  const type = INPUT_TYPE[name]
  if (type === undefined) throw new Error(`[error] 未知值类型 ${name}（支持 Int/Flt/Str/Bol/Vec/Gid/Pfb/Cfg）`)
  return { type, bytes: buildVarValue(type, raw) }
}

// ---- 结构读取（wire 级）----

export type ConnView = { id: number; kind: number; index?: number }
export type PinView = {
  kind: number
  index: number
  type?: number
  valueText: string
  connects: ConnView[]
  compositePinIndex?: number
}
export type NodeView = {
  index: number
  genericId: number
  concreteId?: number
  x: number
  y: number
  pins: PinView[]
}

function wireVarint(fields: readonly WireField[], number: number): number | undefined {
  const f = fields.find((x) => x.number === number && x.wire === 0)
  return typeof f?.value === 'number' ? f.value : undefined
}

function wireText(fields: readonly WireField[], number: number): string | undefined {
  const f = fields.find((x) => x.number === number && x.wire === 2)
  if (!f) return undefined
  const bytes = f.value as Uint8Array
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return undefined
  }
}

function nodePropertyId(bytes: Uint8Array | undefined): number | undefined {
  if (!bytes) return undefined
  return wireVarint(parseWireMessage(bytes) ?? [], 5)
}

function indexOf(indexBytes: Uint8Array | undefined): { kind: number; index: number } | undefined {
  if (!indexBytes) return undefined
  const fields = parseWireMessage(indexBytes)
  if (!fields) return undefined
  const kind = wireVarint(fields, 1)
  if (kind === undefined) return undefined
  return { kind, index: wireVarint(fields, 2) ?? 0 }
}

/** 解码已闭合类型的固定值（未知/未闭合形态返回 hex 摘要）。 */
export function describeValue(valueBytes: Uint8Array | undefined): string {
  if (!valueBytes) return '未设置'
  const fields = parseWireMessage(valueBytes)
  if (!fields) return `raw:${Buffer.from(valueBytes).toString('hex').slice(0, 40)}`
  const cls = wireVarint(fields, 1)
  const itemType = fields.find((f) => f.number === 4 && f.wire === 2)
  const itemFields = itemType ? parseWireMessage(itemType.value as Uint8Array) : undefined
  const serverType = itemFields?.find((f) => f.number === 100 && f.wire === 2)
  const serverFields = serverType ? parseWireMessage(serverType.value as Uint8Array) : undefined
  const type = serverFields ? wireVarint(serverFields, 1) : undefined
  const typeName = type !== undefined ? (VAR_TYPE_NAME[type] ?? `T${type}`) : ''
  const valueField = fields.find((f) => f.number >= 101 && f.wire === 2)
  let valueText = ''
  if (valueField) {
    const inner = parseWireMessage(valueField.value as Uint8Array)
    const v = inner ? wireVarint(inner, 1) : undefined
    if (valueField.number === 105) valueText = JSON.stringify(wireText(inner ?? [], 1) ?? '')
    else if (valueField.number === 106) valueText = inner && inner.length > 0 ? 'true' : 'false'
    else if (valueField.number === 107) {
      const vec = inner ? parseWireMessage(inner.find((f) => f.number === 1)?.value as Uint8Array) : undefined
      if (vec) {
        const nums = [1, 2, 3].map((n) => {
          const f = vec.find((x) => x.number === n && x.wire === 5)
          if (!f) return 0
    const v = f.value as Uint8Array
    return new DataView(v.buffer, v.byteOffset, v.byteLength).getFloat32(0, true)
        })
        valueText = `(${nums.join(',')})`
      }
    } else if (v !== undefined) valueText = String(v)
  }
  if (cls === undefined && !valueText) return '空'
  const clsName = cls === 10000 ? 'ConcreteBase' : cls === 10002 ? 'ArrayBase' : cls === undefined ? '?' : `C${cls}`
  return valueText ? `${clsName} ${typeName} ${valueText}` : `${clsName}${typeName ? ' ' + typeName : ''}`
}

export function parsePinRecord(bytes: Uint8Array): PinView {
  const fields = parseWireMessage(bytes) ?? []
  const i1 = indexOf(fields.find((f) => f.number === 1)?.value as Uint8Array | undefined)
  const connects = (fields.filter((f) => f.number === 5 && f.wire === 2) ?? [])
    .map((f) => {
      const c = parseWireMessage(f.value as Uint8Array) ?? []
      const id = wireVarint(c, 1)
      const conn = indexOf(c.find((x) => x.number === 2)?.value as Uint8Array | undefined)
      return { id: id ?? 0, kind: conn?.kind ?? 0, index: conn?.index }
    })
    .filter((c) => c.id !== 0 || c.kind !== 0)
  return {
    kind: i1?.kind ?? 0,
    index: i1?.index ?? 0,
    type: wireVarint(fields, 4),
    valueText: describeValue(fields.find((f) => f.number === 3)?.value as Uint8Array | undefined),
    connects,
    compositePinIndex: wireVarint(fields, 7)
  }
}

export function parseNodeRecord(bytes: Uint8Array): NodeView {
  const fields = parseWireMessage(bytes) ?? []
  const pins = (fields.filter((f) => f.number === 4 && f.wire === 2) ?? []).map((f) =>
    parsePinRecord(f.value as Uint8Array)
  )
  const fixed = (n: number): number => {
    const f = fields.find((x) => x.number === n && x.wire === 5)
    if (!f) return 0
    const v = f.value as Uint8Array
    return new DataView(v.buffer, v.byteOffset, v.byteLength).getFloat32(0, true)
  }
  return {
    index: wireVarint(fields, 1) ?? 0,
    genericId: nodePropertyId(fields.find((f) => f.number === 2)?.value as Uint8Array) ?? 0,
    concreteId: nodePropertyId(fields.find((f) => f.number === 3)?.value as Uint8Array),
    x: fixed(5),
    y: fixed(6),
    pins
  }
}

export function parseGraphNodes(blob: Uint8Array): NodeView[] {
  const fields = parseWireMessage(blob) ?? []
  return (fields.filter((f) => f.number === 3 && f.wire === 2) ?? []).map((f) =>
    parseNodeRecord(f.value as Uint8Array)
  )
}

// ---- 定位（root10 容器：section 1=主图 / 2=CompositeDef / 4=复合 impl 图）----

export function locateBlobField(payload: Uint8Array, section: 1 | 2 | 4, id: number): LenField {
  const fields: LenField[] = []
  parseMessage(payload, 0, payload.length, 0, 0, 0, 0, 0, 0, 0, fields)
  for (const field of fields) {
    if (field.depth !== 3 || field.p0 !== 10 || field.p1 !== section || field.p2 !== 1) continue
    if (blobId(payload.subarray(field.dataStart, field.dataEnd), section) === id) return field
  }
  const what = section === 1 ? 'node graph' : section === 2 ? 'composite def' : 'impl graph'
  throw new Error(`[error] ${what} ${id} not found in root 10`)
}

/** 记录 ID：主图/impl 图 = NodeGraph.id.id；复合定义 = def.id.genericId/concreteId.id。 */
export function blobId(blob: Uint8Array, section: 1 | 2 | 4): number | undefined {
  const fields = parseWireMessage(blob)
  if (!fields) return undefined
  if (section === 2) {
    const idMsg = fields.find((f) => f.number === 4 && f.wire === 2)
    const idFields = idMsg ? parseWireMessage(idMsg.value as Uint8Array) : undefined
    for (const sub of [1, 2]) {
      const prop = idFields?.find((f) => f.number === sub && f.wire === 2)
      if (prop) {
        const nodeId = wireVarint(parseWireMessage(prop.value as Uint8Array) ?? [], 5)
        if (nodeId !== undefined) return nodeId
      }
    }
    return undefined
  }
  const idMsg = fields.find((f) => f.number === 1 && f.wire === 2)
  if (!idMsg) return undefined
  return wireVarint(parseWireMessage(idMsg.value as Uint8Array) ?? [], 5)
}

export function blobName(blob: Uint8Array, section: 1 | 2 | 4): string | undefined {
  const fields = parseWireMessage(blob)
  if (!fields) return undefined
  return wireText(fields, section === 2 ? 200 : 2)
}

// ---- 修改原语（GraphNode 记录级：bytes → bytes）----

function pinFields(pin: Uint8Array): WireField[] {
  return parseWireMessage(pin) ?? []
}

function pinIndexWire(kind: number, index?: number): Uint8Array {
  const fields: WireField[] = [{ number: 1, wire: 0, value: kind }]
  if (index !== undefined && index !== 0) fields.push({ number: 2, wire: 0, value: index })
  return sub(fields)
}

/** connects = {1: 对端 nodeIndex, 2: {kind, index?}, 3: 同 2 双写}。 */
function connectWire(id: number, kind: number, index?: number): Uint8Array {
  const ref = pinIndexWire(kind, index)
  return sub([
    { number: 1, wire: 0, value: id },
    { number: 2, wire: 2, value: ref },
    { number: 3, wire: 2, value: ref }
  ])
}

function pinShell(pin: Uint8Array): number {
  const i1 = pinFields(pin).find((f) => f.number === 1 && f.wire === 2)
  const idx = i1 ? indexOf(i1.value as Uint8Array) : undefined
  return idx?.index ?? 0
}

function pinKindOf(pin: Uint8Array): number {
  const i1 = pinFields(pin).find((f) => f.number === 1 && f.wire === 2)
  const idx = i1 ? indexOf(i1.value as Uint8Array) : undefined
  return idx?.kind ?? 0
}

/**
 * pins 数组排序（真实快照闭合）：OutFlow（kind=2）按 ShellIndex 升序在前，
 * InParam（kind=3）按 ShellIndex 升序随后，其余 pin 保持原相对顺序。
 * （node 11 多分支 / 复合实例 node 7 实测；kind=4/5/6 pin 未参与排序，保持原位）
 */
function sortPins(pins: Uint8Array[]): Uint8Array[] {
  const flow = pins.filter((p) => pinKindOf(p) === PIN_KIND.OUT_FLOW).sort((a, b) => pinShell(a) - pinShell(b))
  const param = pins.filter((p) => pinKindOf(p) === PIN_KIND.IN_PARAM).sort((a, b) => pinShell(a) - pinShell(b))
  const rest = pins.filter((p) => {
    const k = pinKindOf(p)
    return k !== PIN_KIND.OUT_FLOW && k !== PIN_KIND.IN_PARAM
  })
  return [...flow, ...param, ...rest]
}

function rebuildNode(node: Uint8Array, pins: Uint8Array[]): Uint8Array {
  const fields = parseWireMessage(node)
  if (!fields) throw new Error('[error] node record unparseable')
  const next: WireField[] = []
  let inserted = false
  for (const f of fields) {
    if (f.number === 4 && f.wire === 2) {
      if (!inserted) {
        for (const pin of sortPins(pins)) next.push({ number: 4, wire: 2, value: pin })
        inserted = true
      }
      continue
    }
    next.push(f)
  }
  if (!inserted) {
    // 原节点无 pin：pins 插在 concreteId(f3) 之后、x(f5) 之前（impl 节点无坐标则尾部）
    const at = next.findIndex((f) => f.number >= 5)
    const pos = at === -1 ? next.length : at
    next.splice(pos, 0, ...sortPins(pins).map((pin) => ({ number: 4, wire: 2, value: pin })))
  }
  return sub(next)
}

function findPin(node: Uint8Array, kind: number, shell: number): { pin: Uint8Array; fields: WireField[] } | undefined {
  const pinField = (parseWireMessage(node) ?? []).find(
    (f) =>
      f.number === 4 &&
      f.wire === 2 &&
      pinKindOf(f.value as Uint8Array) === kind &&
      pinShell(f.value as Uint8Array) === shell
  )
  if (!pinField) return undefined
  return { pin: pinField.value as Uint8Array, fields: pinFields(pinField.value as Uint8Array) }
}

/** 设置节点位置（f5/f6 = float32 fixed32）。 */
export function setNodePos(node: Uint8Array, x: number, y: number): Uint8Array {
  const fields = parseWireMessage(node)
  if (!fields) throw new Error('[error] node record unparseable')
  const next = fields.filter((f) => f.number !== 5 && f.number !== 6)
  next.push({ number: 5, wire: 5, value: float32Bytes(x) })
  next.push({ number: 6, wire: 5, value: float32Bytes(y) })
  return sub(next)
}

/**
 * 设置 InParam 固定值（真实快照 v4→v5 闭合）。
 * - pin 已存在：替换 value(f3)，清空 connects(f5)（值/连线二选一规则）；
 *   保留 i1/i2/type。
 * - pin 不存在：新建 {i1/i2={InParam, shell}, value, type}，按 ShellIndex 升序插入。
 */
export function setParam(
  node: Uint8Array,
  shell: number,
  typed: { type: number; bytes: Uint8Array },
  compositePinIndex?: number
): Uint8Array {
  const existing = findPin(node, PIN_KIND.IN_PARAM, shell)
  if (existing) {
    // 原地替换：value(f3) 换新值、type(f4) 跟随、connects(f5) 清除（值/连线二选一）
    const next = existing.fields.map((f) => {
      if (f.number === 3) return { ...f, value: typed.bytes }
      if (f.number === 4) return { ...f, value: typed.type }
      if (f.number === 5) return undefined
      return f
    }).filter((f): f is WireField => f !== undefined)
    return rebuildNode(
      node,
      pinsOf(node).map((p) => (pinKindOf(p) === PIN_KIND.IN_PARAM && pinShell(p) === shell ? sub(next) : p))
    )
  }
  const pinFields: WireField[] = [
    { number: 1, wire: 2, value: pinIndexWire(PIN_KIND.IN_PARAM, shell) },
    { number: 2, wire: 2, value: pinIndexWire(PIN_KIND.IN_PARAM, shell) },
    { number: 3, wire: 2, value: typed.bytes },
    { number: 4, wire: 0, value: typed.type }
  ]
  if (compositePinIndex !== undefined) pinFields.push({ number: 7, wire: 0, value: compositePinIndex })
  const pin = sub(pinFields)
  return rebuildNode(node, [...pinsOf(node), pin])
}

/** InParam[1]（IntegerList）cases pin 识别（MultiBranch SysCall 3）。 */
function isCasesPin(b: Uint8Array): boolean {
  const f = parseWireMessage(b)
  if (!f) return false
  const i1 = f.find((x) => x.number === 1 && x.wire === 2)
  if (!i1) return false
  const idx = parseWireMessage(i1.value as Uint8Array)!
  return idx.find((x) => x.number === 1)?.value === 3 && (idx.find((x) => x.number === 2)?.value ?? 0) === 1
}

/**
 * 设置 MultiBranch cases 列表（2026-08-09 tab-input-multibranch 真实快照闭合；
 * 2026-08-09 param-turn Q2 扩展 Str 变体：条目模板含 bInt(102)→数值，含 bString(105)→字符串）。
 * 全量替换语义（幂等）：用第一条 entry 作模板，每项只改对应值字段 1
 * （IntBaseValue.int32 val / StringBaseValue.string val 均为字段 1）。空列表无法克隆模板 → fail closed。
 */
export function setCasesList(node: Uint8Array, values: Array<string | number>): Uint8Array {
  const nodeFields = parseWireMessage(node)
  if (!nodeFields) throw new Error('[error] node record unparseable')
  const pinField = nodeFields.find(
    (f) => f.number === 4 && f.wire === 2 && isCasesPin(f.value as Uint8Array)
  )
  if (!pinField) throw new Error('[error] node has no InParam[1] (cases) pin')
  const pin = parseWireMessage(pinField.value as Uint8Array)!
  const vf = pin.find((x) => x.number === 3 && x.wire === 2)
  if (!vf) throw new Error('[error] cases pin has no value')
  const v = parseWireMessage(vf.value as Uint8Array)!
  const l1 = v.find((x) => x.wire === 2 && x.number === 110)
  if (!l1) throw new Error('[error] cases value has no f110')
  const l1m = parseWireMessage(l1.value as Uint8Array)!
  const l2 = l1m.find((x) => x.wire === 2 && x.number === 2)
  if (!l2) throw new Error('[error] f110 has no f2')
  const l2m = parseWireMessage(l2.value as Uint8Array)!
  const arr = l2m.find((x) => x.wire === 2 && x.number === 109)
  if (!arr) throw new Error('[error] ArrayBase has no bArray(109)')
  const entries = parseWireMessage(arr.value as Uint8Array)!
  const entryList = entries.filter((x) => x.wire === 2 && x.number === 1)
  if (entryList.length === 0) throw new Error('[error] cases list empty; cannot clone entry template')
  const template = parseWireMessage(entryList[0].value as Uint8Array)!
  const hasBInt = template.some((x) => x.number === 102 && x.wire === 2)
  const hasBString = template.some((x) => x.number === 105 && x.wire === 2)
  if (!hasBInt && !hasBString) {
    throw new Error('[error] cases entry template has neither bInt(102) nor bString(105)')
  }
  const newEntries = emitWireMessage(
    values.map((val) => ({
      number: 1,
      wire: 2,
      value: emitWireMessage(
        template.map((x) => {
          if (hasBInt && x.number === 102 && x.wire === 2) {
            if (typeof val !== 'number') throw new Error('[error] Int cases need numeric values')
            return { ...x, value: emitWireMessage([{ number: 1, wire: 0, value: val }]) }
          }
          if (hasBString && x.number === 105 && x.wire === 2) {
            if (typeof val !== 'string') throw new Error('[error] Str cases need string values')
            return { ...x, value: emitWireMessage([{ number: 1, wire: 2, value: textBytes(val) }]) }
          }
          return x
        })
      )
    }))
  )
  const newL2 = emitWireMessage(
    l2m.map((x) => (x.number === 109 && x.wire === 2 ? { ...x, value: newEntries } : x))
  )
  const newL1 = emitWireMessage(
    l1m.map((x) => (x.number === 2 && x.wire === 2 ? { ...x, value: newL2 } : x))
  )
  const newV = emitWireMessage(v.map((x) => (x.number === 110 && x.wire === 2 ? { ...x, value: newL1 } : x)))
  const newPin = emitWireMessage(pin.map((x) => (x.number === 3 && x.wire === 2 ? { ...x, value: newV } : x)))
  return emitWireMessage(
    nodeFields.map((f) => (f === pinField ? { number: 4, wire: 2, value: newPin } : f))
  )
}

function pinsOf(node: Uint8Array): Uint8Array[] {
  return (parseWireMessage(node) ?? [])
    .filter((f) => f.number === 4 && f.wire === 2)
    .map((f) => f.value as Uint8Array)
}

/**
 * 数据连线（真实快照 dataflow-case1/2/3/4 闭合）。
 * - 目标 InParam pin 已存在：改写 connects(f5)（替换语义：不新增 pin/connects）；
 *   已有 value 保留（Variant 实例 pin value 与 connects 并存）。
 * - 不存在：新建 {i1/i2={InParam, shell}, type, connects}（无 value），按 ShellIndex 插入。
 *   `type` 由调用方提供（目标定义输入类型；复合实例另有 field7=pinIndex）。
 */
export function linkInParam(
  node: Uint8Array,
  shell: number,
  srcNode: number,
  srcShell: number,
  type: number,
  compositePinIndex?: number
): Uint8Array {
  const existing = findPin(node, PIN_KIND.IN_PARAM, shell)
  if (existing) {
    // 原地替换 connects(f5)；已有 value 保留（Variant 实例 pin 形态）
    const next = existing.fields.map((f) =>
      f.number === 5 ? { ...f, value: connectWire(srcNode, PIN_KIND.OUT_PARAM, srcShell) } : f
    )
    return rebuildNode(
      node,
      pinsOf(node).map((p) => (pinKindOf(p) === PIN_KIND.IN_PARAM && pinShell(p) === shell ? sub(next) : p))
    )
  }
  const fields: WireField[] = [
    { number: 1, wire: 2, value: pinIndexWire(PIN_KIND.IN_PARAM, shell) },
    { number: 2, wire: 2, value: pinIndexWire(PIN_KIND.IN_PARAM, shell) },
    { number: 4, wire: 0, value: type },
    { number: 5, wire: 2, value: connectWire(srcNode, PIN_KIND.OUT_PARAM, srcShell) }
  ]
  if (compositePinIndex !== undefined) fields.push({ number: 7, wire: 0, value: compositePinIndex })
  return rebuildNode(node, [...pinsOf(node), sub(fields)])
}

/**
 * 断数据线（断线行为由目标 pin 形态决定，case17/18/v22 闭合）：
 * - pin 带 value（Variant 自动实例化形态）→ 保留 pin、移除 connects(f5)；
 * - pin 无 value（Fixed 连线新建形态）→ 整 pin 移除。
 */
export function unlinkInParam(node: Uint8Array, shell: number): Uint8Array {
  const existing = findPin(node, PIN_KIND.IN_PARAM, shell)
  if (!existing) throw new Error(`[error] node has no InParam shell ${shell}`)
  const hasValue = existing.fields.some((f) => f.number === 3 && f.wire === 2)
  if (hasValue) {
    const next = existing.fields.filter((f) => f.number !== 5)
    return rebuildNode(node, [sub(next)])
  }
  return rebuildNode(node, pinsOf(node).filter((p) => !(pinKindOf(p) === PIN_KIND.IN_PARAM && pinShell(p) === shell)))
}

/**
 * 控制流连线（control-flow-case1/2/3 闭合）：源侧 OutFlow pin + connects→目标。
 * - pin 已存在：改写 connects（替换语义）；
 * - 不存在：新建 {i1/i2={OutFlow, shell}, connects}，插入 OutFlow 组 ShellIndex 升序位置。
 * 非默认源 OutFlow shell 显式写 index，默认(0)省略；目标 InFlow 非默认时 connects
 * 显式带目标 index（case3），默认省略。
 */
export function addOutFlow(
  node: Uint8Array,
  shell: number,
  dstNode: number,
  dstShell: number,
  compositePinIndex?: number
): Uint8Array {
  const existing = findPin(node, PIN_KIND.OUT_FLOW, shell)
  if (existing) {
    const next = existing.fields.map((f) =>
      f.number === 5 ? { ...f, value: connectWire(dstNode, PIN_KIND.IN_FLOW, dstShell) } : f
    )
    return rebuildNode(
      node,
      pinsOf(node).map((p) => (pinKindOf(p) === PIN_KIND.OUT_FLOW && pinShell(p) === shell ? sub(next) : p))
    )
  }
  const fields: WireField[] = [
    { number: 1, wire: 2, value: pinIndexWire(PIN_KIND.OUT_FLOW, shell) },
    { number: 2, wire: 2, value: pinIndexWire(PIN_KIND.OUT_FLOW, shell) },
    { number: 5, wire: 2, value: connectWire(dstNode, PIN_KIND.IN_FLOW, dstShell) }
  ]
  if (compositePinIndex !== undefined) fields.push({ number: 7, wire: 0, value: compositePinIndex })
  return rebuildNode(node, [...pinsOf(node), sub(fields)])
}

/** 断开源 OutFlow → 目标节点的控制流线。真实快照闭合（flowrm-case1 v53→v54 +
 *  flowrm-case2 v54→v55）：只删 connects 中 f1=targetNode 的整条记录；
 *  断后仍有余线 → pin 保留（i1/i2 与其他 connects 逐字节不变）；断后无余线 →
 *  整条 pin 记录移除（其余 pin 逐字节不变、顺序不变）；目标侧节点不动。 */
export function removeOutFlow(node: Uint8Array, shell: number, targetNode: number): Uint8Array {
  const existing = findPin(node, PIN_KIND.OUT_FLOW, shell)
  if (!existing) throw new Error(`[error] node has no OutFlow shell ${shell}`)
  const connects = existing.fields.filter((f) => f.number === 5 && f.wire === 2)
  const matched = connects.filter((f) => wireVarint(parseWireMessage(f.value as Uint8Array) ?? [], 1) === targetNode)
  if (matched.length === 0) throw new Error(`[error] OutFlow shell ${shell} has no connects to node ${targetNode}`)
  const keep = existing.fields.filter(
    (f) =>
      !(f.number === 5 && f.wire === 2) ||
      wireVarint(parseWireMessage(f.value as Uint8Array) ?? [], 1) !== targetNode
  )
  const next = keep.some((f) => f.number === 5 && f.wire === 2) ? [sub(keep)] : []
  return rebuildNode(
    node,
    pinsOf(node)
      .filter((p) => !(pinKindOf(p) === PIN_KIND.OUT_FLOW && pinShell(p) === shell))
      .concat(next)
  )
}

// ---- 复合定义修改（CompositeDef 记录级）----

function flowListField(kind: number): number {
  return kind === PIN_KIND.IN_FLOW ? 100 : kind === PIN_KIND.OUT_FLOW ? 101 : kind === PIN_KIND.IN_PARAM ? 102 : 103
}

/** 改复合名（composite-case2 闭合：只写 def.name(200)，保持字段号升序原位）。 */
export function renameCompositeDef(blob: Uint8Array, name: string): Uint8Array {
  const fields = parseWireMessage(blob)
  if (!fields) throw new Error('[error] composite def unparseable')
  const nameField = { number: 200, wire: 2, value: textBytes(name) }
  const at = fields.findIndex((f) => f.number === 200)
  if (at !== -1) {
    const next = [...fields]
    next[at] = nameField
    return sub(next)
  }
  const insertAt = fields.findIndex((f) => f.number > 200)
  const next = [...fields]
  next.splice(insertAt === -1 ? next.length : insertAt, 0, nameField)
  return sub(next)
}

/** 改参数流名（composite-case5 闭合：只写对应 flow 的 name(1)）。 */
export function renameParamFlow(blob: Uint8Array, kind: number, shell: number, name: string): Uint8Array {
  const fields = parseWireMessage(blob)
  if (!fields) throw new Error('[error] composite def unparseable')
  const listField = flowListField(kind)
  const next = fields.map((f) => {
    if (f.number !== listField || f.wire !== 2) return f
    const flow = parseWireMessage(f.value as Uint8Array)
    if (!flow) return f
    const idx = indexOf(flow.find((x) => x.number === 3)?.value as Uint8Array | undefined)
    if (!idx || idx.kind !== kind || (idx.index ?? 0) !== shell) return f
    const nameField = { number: 1, wire: 2, value: textBytes(name) }
    const at = flow.findIndex((x) => x.number === 1)
    if (at !== -1) {
      const nextFlow = [...flow]
      nextFlow[at] = nameField
      return { ...f, value: sub(nextFlow) }
    }
    return { ...f, value: sub([nameField, ...flow]) }
  })
  return sub(next)
}

// ---- 复合接口加参数（composite-add-param-case1 v59→v60 闭合）----

/** ParameterFlow 的 type 流。真实规则（case2/3/4/6/7 双样本 CONFIRMED）：
 *  Ety={3:1,4:1}（无 class f1）；Int={1:2,3:3,4:3}；Bol={1:6,3:4,4:4,101:{1:1}}；
 *  Flt={1:4,3:5,4:5}；Str={1:5,3:6,4:6}。f1=class 大类型号、f3=f4=VarType。
 *  Gid/Cfg/Pfb 等无样本 → fail closed。 */
export function paramFlowTypeBytes(varType: number): Uint8Array {
  if (varType === 1) return sub([{ number: 3, wire: 0, value: 1 }, { number: 4, wire: 0, value: 1 }])
  const f1: Record<number, number> = { 3: 2, 4: 6, 5: 4, 6: 5 }
  const base = f1[varType]
  if (base === undefined) throw new Error(`[error] ParameterFlow type ${varType} 无真实样本，拒绝构造`)
  const fields: WireField[] = [
    { number: 1, wire: 0, value: base },
    { number: 3, wire: 0, value: varType },
    { number: 4, wire: 0, value: varType }
  ]
  if (varType === 4) fields.push({ number: 101, wire: 2, value: sub([{ number: 1, wire: 0, value: 1 }]) })
  return sub(fields)
}

/** 复合 def 追加参数流（case1 闭合：插到该 kind 列表末尾，pinIndex = 全局单调递增 max+1）。 */
export function addParamFlow(
  blob: Uint8Array,
  kind: number,
  shell: number,
  name: string,
  varType: number
): Uint8Array {
  const fields = parseWireMessage(blob)
  if (!fields) throw new Error('[error] composite def unparseable')
  const listField = flowListField(kind)
  let maxPi = 0
  for (const f of fields) {
    if (f.wire !== 2 || (f.number !== 100 && f.number !== 101 && f.number !== 102 && f.number !== 103)) continue
    const pi = wireVarint(parseWireMessage(f.value as Uint8Array) ?? [], 8)
    if (pi !== undefined && pi > maxPi) maxPi = pi
  }
  const flow = sub([
    { number: 1, wire: 2, value: textBytes(name) },
    { number: 2, wire: 0, value: 1 },
    { number: 3, wire: 2, value: pinIndexWire(kind, shell) },
    { number: 4, wire: 2, value: paramFlowTypeBytes(varType) },
    { number: 8, wire: 0, value: maxPi + 1 }
  ])
  const next = [...fields]
  let last = -1
  for (let i = 0; i < next.length; i++) if (next[i].number === listField && next[i].wire === 2) last = i
  next.splice(last + 1, 0, { number: listField, wire: 2, value: flow })
  return sub(next)
}

/** compositePin wire（case1/2/6/7/8 同构样本）：{1:{1:kind,2:shell}(outerPin),
 *  2:innerNodeId, 3:{1:innerKind,2:innerShell}(innerPin), 4:同 inner 双写}；
 *  outer/inner 的 index=0（Shell0）省略。inner 引用可未落盘的 pin 身份
 *  （提升输入不要求内部 pin 已落盘；创建复合引用剥落的 OutFlow 身份）。 */
export function compositePinWire(
  outerKind: number,
  outerShell: number,
  innerNode: number,
  innerKind: number,
  innerShell: number
): Uint8Array {
  const outer = [{ number: 1, wire: 0, value: outerKind }]
  if (outerShell > 0) outer.push({ number: 2, wire: 0, value: outerShell })
  const inner = [{ number: 1, wire: 0, value: innerKind }]
  if (innerShell > 0) inner.push({ number: 2, wire: 0, value: innerShell })
  return sub([
    { number: 1, wire: 2, value: sub(outer) },
    { number: 2, wire: 0, value: innerNode },
    { number: 3, wire: 2, value: sub(inner) },
    { number: 4, wire: 2, value: sub(inner) }
  ])
}

/** impl 图 compositePins（NodeGraph.f4）按 (kind, index) 升序插入。真实形态（case1/2/6/7
 *  同构样本）：{1:{1:kind,2:shell}(outerPin), 2:innerNodeId, 3:{1:3,2:innerShell}(innerPin),
 *  4:同 inner 双写}；outer/inner 的 index=0（Shell0）省略。inner kind 固定 InParam(3)
 *  （输入提升）；输出提升未闭合。 */
export function addCompositePin(
  blob: Uint8Array,
  kind: number,
  shell: number,
  innerNode: number,
  innerShell: number
): Uint8Array {
  const fields = parseWireMessage(blob)
  if (!fields) throw new Error('[error] impl graph unparseable')
  const newPin = compositePinWire(kind, shell, innerNode, PIN_KIND.IN_PARAM, innerShell)
  const out: WireField[] = []
  let inserted = false
  for (const f of fields) {
    if (f.number === 4 && f.wire === 2) {
      if (!inserted) {
        const pf = parseWireMessage(f.value as Uint8Array) ?? []
        const outerMsg = pf.find((x) => x.number === 1 && x.wire === 2)
        const outerFields = outerMsg ? (parseWireMessage(outerMsg.value as Uint8Array) ?? []) : []
        const pk = wireVarint(outerFields, 1) ?? 0
        const pi = wireVarint(outerFields, 2) ?? 0
        if (pk > kind || (pk === kind && pi > shell)) {
          out.push({ number: 4, wire: 2, value: newPin })
          inserted = true
        }
      }
    }
    out.push(f)
  }
  if (!inserted) out.push({ number: 4, wire: 2, value: newPin })
  return sub(out)
}

// ---- 复合创建（composite-create-multinode-case8 闭合骨架）----

/** def/impl 记录的 Id 结构（case8 样本）：{1:10000, 2:20000, 3:kind, 5:id}，kind=22001
 *  SysGraph / 21002 CompositeGraph。宿主节点引用的 f2/f3 同构但 f1=10001（nodeRefWire）。 */
function defIdWire(kind: number, id: number): Uint8Array {
  return sub([
    { number: 1, wire: 0, value: 10000 },
    { number: 2, wire: 0, value: 20000 },
    { number: 3, wire: 0, value: kind },
    { number: 5, wire: 0, value: id }
  ])
}

/** CompositeDef 记录（case8 闭合形态）：
 *  {4:{1:Id SysGraph(22001),2:Id SysGraph,4:Id CompositeGraph(21002)}, 101:outflow×n,
 *  107:{1:1000}, 200:name, 203:6}。outflow = {1:name(原出口号), 2:1, 3:{1:2,2:newShell},
 *  4:空, 8:pinIndex}。 */
export function buildCompositeDef(
  defId: number,
  name: string,
  outflows: Array<{ name: string; shell: number; pinIndex: number }>
): Uint8Array {
  const sysId = nodeRefWire(defId, 22001)
  const implId = defIdWire(21002, defId)
  const fields: WireField[] = [
    {
      number: 4,
      wire: 2,
      value: sub([
        { number: 1, wire: 2, value: sysId },
        { number: 2, wire: 2, value: sysId },
        { number: 4, wire: 2, value: implId }
      ])
    }
  ]
  for (const o of outflows) {
    fields.push({
      number: 101,
      wire: 2,
      value: sub([
        { number: 1, wire: 2, value: textBytes(o.name) },
        { number: 2, wire: 0, value: 1 },
        { number: 3, wire: 2, value: pinIndexWire(PIN_KIND.OUT_FLOW, o.shell) },
        { number: 4, wire: 2, value: new Uint8Array(0) },
        { number: 8, wire: 0, value: o.pinIndex }
      ])
    })
  }
  fields.push(
    { number: 107, wire: 2, value: sub([{ number: 1, wire: 0, value: 1000 }]) },
    { number: 200, wire: 2, value: textBytes(name) },
    { number: 203, wire: 0, value: 6 }
  )
  return sub(fields)
}

/** impl 图（CompositeGraph）记录：{1:Id(21002), 3:nodes 升序, 4:compositePins}。 */
export function buildCompositeImplGraph(
  defId: number,
  nodes: Uint8Array[],
  compositePins: Uint8Array[]
): Uint8Array {
  const fields: WireField[] = [{ number: 1, wire: 2, value: defIdWire(21002, defId) }]
  for (const n of nodes) fields.push({ number: 3, wire: 2, value: n })
  for (const p of compositePins) fields.push({ number: 4, wire: 2, value: p })
  return sub(fields)
}

/** def/impl 实例重编号选择器（del-param-case4 / swap-inputs-case8 闭合）：排除原位取最小
 *  空闲、总是移动（原位不复用）。跨轮墓碑（case5 的 3/5）无会话史 → 文档边界，工具取
 *  最小空闲可能低于编辑器。 */
export function chooseMovedIndex(graphBlob: Uint8Array, oldIndex: number): number {
  const used = new Set(parseGraphNodes(graphBlob).map((n) => n.index))
  let i = 1
  while (used.has(i) || i === oldIndex) i++
  return i
}

/** 打包选中节点为复合（case8 双节点骨架闭合；未闭合边界 fail closed / 文档标注）：
 *  ① 锚点节点原位变实例（f2/f3→SysGraph 新 id、坐标=选中中心、数据 pin 清除、
 *     提升 OutFlow pins 承接原出口连线）；其它选中节点删除；
 *  ② 新 def（Id 三元组 + type 1000 + name + field203=6 + outflows name=原出口号、
 *     ShellIndex 重写、pinIndex 连续）；
 *  ③ 新 impl 图（CompositeGraph id 同 def）：选中节点搬入（数据 pin 保留、被提升 OutFlow
 *     剥落、坐标相对化 fround(宿主−中心) 且 (0,0) 省略、节点级旧式 connects 搬进
 *     InParam[0]）；④ compositePins：outer=新 ShellIndex、innerNode=内部节点、
 *     inner=原出口号（可未落盘）。
 *  defId = 0x6000000N 系列最小空闲（扫描 root10 全部 section）。pinIndex 默认 = 全文件
 *  所有 def 全局 max+1 连续分配；有删除史时编辑器取回收池最小，工具无会话史 → 用显式
 *  pinStart 覆盖（重放测试）。
 *  未闭合（文档标注）：锚点选择规则（默认最小 nodeIndex）、锚点自带 OutFlow 提升（无样本）、
 *  数据输入自动注册为复合输入（等用户实验）、root46 一次性注册（INSUFFICIENT 不写）。 */
export function createComposite(
  bytes: Uint8Array,
  graphId: number,
  name: string,
  selected: number[],
  anchor: number,
  pinStart?: number
): Uint8Array {
  const payload = bytes.slice(20, -4)
  const fields: LenField[] = []
  parseMessage(payload, 0, payload.length, 0, 0, 0, 0, 0, 0, 0, fields)
  const graphField = fields.find(
    (f) => f.depth === 3 && f.p0 === 10 && f.p1 === 1 && f.p2 === 1 && blobId(payload.subarray(f.dataStart, f.dataEnd), 1) === graphId
  )
  if (!graphField) throw new Error(`[error] graph ${graphId} not found in root 10`)
  const graphBlobBytes = payload.subarray(graphField.dataStart, graphField.dataEnd)
  const nodes = parseGraphNodes(graphBlobBytes)
  const want = [...new Set(selected)]
  if (want.length === 0) throw new Error('[error] create needs at least one selected node')
  if (!want.includes(anchor)) throw new Error('[error] anchor must be one of the selected nodes')
  const nodeRecs = new Map<number, WireField>()
  for (const f of (parseWireMessage(graphBlobBytes) ?? []).filter((x) => x.number === 3 && x.wire === 2)) {
    const v = parseNodeRecord(f.value as Uint8Array)
    nodeRecs.set(v.index, f)
  }
  for (const idx of want) {
    const rec = nodeRecs.get(idx)
    if (!rec) throw new Error(`[error] node ${idx} not found in graph ${graphId}`)
    if (isCompositeInstance(rec.value as Uint8Array)) {
      throw new Error(`[error] 选中复合实例 n${idx}（打包复合实例未闭合），拒绝`)
    }
  }
  // 收集选中节点 OutFlow pins（nodeIndex, shell 升序）
  type Lift = { node: number; shell: number; connects: ConnView[] }
  const lifts: Lift[] = []
  for (const idx of [...want].sort((a, b) => a - b)) {
    const view = parseNodeRecord(nodeRecs.get(idx)!.value as Uint8Array)
    for (const p of view.pins) {
      if (p.kind !== PIN_KIND.OUT_FLOW) continue
      lifts.push({ node: idx, shell: p.index ?? 0, connects: p.connects })
    }
  }
  lifts.sort((a, b) => a.node - b.node || a.shell - b.shell)
  // defId = 0x6000000N 最小空闲（root10 全部 section）
  const usedIds = new Set<number>()
  for (const f of fields) {
    if (f.depth !== 3 || f.p0 !== 10 || f.p2 !== 1) continue
    const id = blobId(payload.subarray(f.dataStart, f.dataEnd), f.p1 as 1 | 2 | 4)
    if (id !== undefined) usedIds.add(id)
  }
  let defId = 0x60000001
  while (usedIds.has(defId)) defId++
  // pinIndex：显式 pinStart 或全文件全局 max+1；分配时跳过已占用（case8：59 占用 → 57/58/60）
  const usedPi = new Set<number>()
  let maxPi = 0
  for (const f of fields) {
    if (f.depth !== 3 || f.p0 !== 10 || f.p1 !== 2 || f.p2 !== 1) continue
    for (const m of flowMetas(payload.subarray(f.dataStart, f.dataEnd))) {
      if (m.pinIndex === undefined) continue
      usedPi.add(m.pinIndex)
      if (m.pinIndex > maxPi) maxPi = m.pinIndex
    }
  }
  let nextPi = pinStart ?? maxPi + 1
  const outflows = lifts.map((l, i) => {
    while (usedPi.has(nextPi)) nextPi++
    const pi = nextPi
    nextPi++
    return { name: String(l.shell), shell: i, pinIndex: pi }
  })
  // 中心坐标 = fround(均值)；impl 相对化 = fround(宿主 − 中心)
  const f = Math.fround
  const views = want.map((idx) => parseNodeRecord(nodeRecs.get(idx)!.value as Uint8Array))
  const cx = f(views.reduce((s, v) => s + v.x, 0) / views.length)
  const cy = f(views.reduce((s, v) => s + v.y, 0) / views.length)
  const defBlobBytes = buildCompositeDef(defId, name, outflows)
  // impl 节点：数据 pin 保留、OutFlow 剥落、节点级旧式 connects 搬进 InParam[0]、坐标相对化
  const implNodes: WireField[] = []
  for (const idx of want) {
    const rec = nodeRecs.get(idx)!
    const nf = parseWireMessage(rec.value as Uint8Array)!
    const liftedShells = new Set(lifts.filter((l) => l.node === idx).map((l) => l.shell))
    // 先收集节点级旧式 connects（位于 pins 之后的 f5 wire2）
    let legacyConn: Uint8Array | undefined
    for (const x of nf) {
      if (x.number !== 5 || x.wire !== 2) continue
      if (legacyConn !== undefined) throw new Error('[error] 多个节点级 connects 未闭合（单样本），拒绝')
      const conn = parseWireMessage(x.value as Uint8Array) ?? []
      const src = wireVarint(conn, 1)
      const refMsg = conn.find((c) => c.number === 2 && c.wire === 2)
      const ref = refMsg ? indexOf(refMsg.value as Uint8Array) : undefined
      if (src === undefined || !ref || ref.kind !== PIN_KIND.OUT_PARAM) {
        throw new Error('[error] 节点级 connects 形态未闭合，拒绝')
      }
      legacyConn = connectWire(src, ref.kind, ref.index)
    }
    const next: WireField[] = []
    for (const x of nf) {
      if (x.number === 4 && x.wire === 2) {
        const p = x.value as Uint8Array
        if (pinKindOf(p) === PIN_KIND.OUT_FLOW && liftedShells.has(pinShell(p))) continue
        if (pinKindOf(p) === PIN_KIND.IN_PARAM && pinShell(p) === 0 && legacyConn) {
          // 旧式节点级 connects 并入 InParam[0]
          next.push({ ...x, value: sub([...pinFields(p), { number: 5, wire: 2, value: legacyConn }]) })
          legacyConn = undefined
          continue
        }
        next.push(x)
        continue
      }
      if (x.number === 5 && (x.wire === 2 || x.wire === 5)) continue
      if (x.number === 6 && x.wire === 5) continue
      next.push(x)
    }
    if (legacyConn !== undefined) throw new Error('[error] 节点级 connects 无 InParam[0] 承接，未闭合，拒绝')
    const view = parseNodeRecord(rec.value as Uint8Array)
    const rx = f(view.x - cx)
    const ry = f(view.y - cy)
    if (rx !== 0 || ry !== 0) {
      next.push({ number: 5, wire: 5, value: float32Bytes(rx) })
      next.push({ number: 6, wire: 5, value: float32Bytes(ry) })
    }
    implNodes.push({ ...rec, value: sub(next) })
  }
  implNodes.sort((a, b) => parseNodeRecord(a.value as Uint8Array).index - parseNodeRecord(b.value as Uint8Array).index)
  const compositePins = lifts.map((l, i) =>
    compositePinWire(PIN_KIND.OUT_FLOW, i, l.node, PIN_KIND.OUT_FLOW, l.shell)
  )
  const implBlobBytes = buildCompositeImplGraph(defId, implNodes.map((f) => f.value as Uint8Array), compositePins)
  // 宿主图：锚点原位变实例（pins = 全部提升 OutFlow）+ 其它选中节点删除
  const anchorRec = nodeRecs.get(anchor)!
  const hostPins: Uint8Array[] = []
  lifts.forEach((l, i) => {
    const pinFieldsArr: WireField[] = [
      { number: 1, wire: 2, value: pinIndexWire(PIN_KIND.OUT_FLOW, i) },
      { number: 2, wire: 2, value: pinIndexWire(PIN_KIND.OUT_FLOW, i) }
    ]
    for (const c of l.connects) {
      pinFieldsArr.push({ number: 5, wire: 2, value: connectWire(c.id, c.kind, c.index) })
    }
    pinFieldsArr.push({ number: 7, wire: 0, value: outflows[i].pinIndex })
    hostPins.push(sub(pinFieldsArr))
  })
  const anchorFields = parseWireMessage(anchorRec.value as Uint8Array)!
  const hostNext: WireField[] = []
  for (const x of anchorFields) {
    if (x.number === 2 || x.number === 3) continue
    if (x.number === 4 && x.wire === 2) continue
    if (x.number === 5 || x.number === 6) continue
    hostNext.push(x)
  }
  hostNext.push({ number: 2, wire: 2, value: nodeRefWire(defId, 22001) })
  hostNext.push({ number: 3, wire: 2, value: nodeRefWire(defId, 22001) })
  for (const p of hostPins) hostNext.push({ number: 4, wire: 2, value: p })
  hostNext.push({ number: 5, wire: 5, value: float32Bytes(cx) })
  hostNext.push({ number: 6, wire: 5, value: float32Bytes(cy) })
  const newHost = sub(hostNext)
  const hostFields = parseWireMessage(graphBlobBytes)!
  const hostOut: WireField[] = []
  for (const x of hostFields) {
    if (x.number !== 3 || x.wire !== 2) {
      hostOut.push(x)
      continue
    }
    const idx = parseNodeRecord(x.value as Uint8Array).index
    if (idx === anchor) {
      hostOut.push({ ...x, value: newHost })
      continue
    }
    if (want.includes(idx)) continue
    hostOut.push(x)
  }
  let patched = applyReplacement(payload, fields, graphField, sub(hostOut))
  // root10 追加 def + impl 容器记录（各 section 组末尾）
  patched = appendRoot10Record(patched, 2, defBlobBytes)
  patched = appendRoot10Record(patched, 4, implBlobBytes)
  return buildFile(patched, gilHeader(bytes))
}

/** root10 的 section（2=def / 4=impl）组末尾追加容器记录 {1: blob}（case8 样本：新记录在
 *  组末尾；同组记录保持原始顺序）。入参为 payload（不含 20B 头/4B 尾）。 */
function appendRoot10Record(payload: Uint8Array, section: 2 | 4, blob: Uint8Array): Uint8Array {
  const fields: LenField[] = []
  parseMessage(payload, 0, payload.length, 0, 0, 0, 0, 0, 0, 0, fields)
  const top10 = fields.find((f) => f.depth === 1 && f.p0 === 10 && f.p1 === 0)
  if (!top10) throw new Error('[error] root 10 not found')
  const root10 = parseWireMessage(payload.subarray(top10.dataStart, top10.dataEnd))
  if (!root10) throw new Error('[error] root 10 unparseable')
  const record = sub([{ number: 1, wire: 2, value: blob }])
  const out: WireField[] = []
  let inserted = false
  for (const f of root10) {
    if (!inserted && f.number > section) {
      out.push({ number: section, wire: 2, value: record })
      inserted = true
    }
    out.push(f)
  }
  if (!inserted) out.push({ number: section, wire: 2, value: record })
  return applyReplacement(payload, fields, top10, sub(out))
}

// ---- 复合接口删参数（del-param-case4 闭合；case5 跨轮墓碑为文档边界）----

/** def 删除参数流 + 后续 ShellIndex 前移（case4 闭合：删 shell2 后 shell3→2，field3 重写、
 *  name/type/pinIndex 跟随记录）。 */
export function delParamFlow(blob: Uint8Array, kind: number, shell: number): Uint8Array {
  const fields = parseWireMessage(blob)
  if (!fields) throw new Error('[error] composite def unparseable')
  const listField = flowListField(kind)
  let found = false
  const next: WireField[] = []
  for (const f of fields) {
    if (f.number !== listField || f.wire !== 2) {
      next.push(f)
      continue
    }
    const flow = parseWireMessage(f.value as Uint8Array)
    if (!flow) {
      next.push(f)
      continue
    }
    const idx = indexOf(flow.find((x) => x.number === 3)?.value as Uint8Array | undefined)
    if (!idx || idx.kind !== kind) {
      next.push(f)
      continue
    }
    const s = idx.index ?? 0
    if (s === shell) {
      found = true
      continue
    }
    if (s > shell) {
      next.push({
        ...f,
        value: sub(
          flow.map((x) => (x.number === 3 && x.wire === 2 ? { ...x, value: pinIndexWire(kind, s - 1) } : x))
        )
      })
      continue
    }
    next.push(f)
  }
  if (!found) throw new Error(`[error] composite def has no ${kind} flow shell ${shell}`)
  return sub(next)
}

/** impl compositePins：删 outer.shell==shell 的记录（case4/5 样本）；outer.shell>shell 的
 *  outer ShellIndex 前移（推断，无样本，文档标注）。 */
export function delCompositePin(blob: Uint8Array, kind: number, shell: number): Uint8Array {
  const fields = parseWireMessage(blob)
  if (!fields) throw new Error('[error] impl graph unparseable')
  let found = false
  const next: WireField[] = []
  for (const f of fields) {
    if (f.number !== 4 || f.wire !== 2) {
      next.push(f)
      continue
    }
    const pf = parseWireMessage(f.value as Uint8Array) ?? []
    const outerMsg = pf.find((x) => x.number === 1 && x.wire === 2)
    const outerFields = outerMsg ? (parseWireMessage(outerMsg.value as Uint8Array) ?? []) : []
    const pk = wireVarint(outerFields, 1) ?? 0
    const pi = wireVarint(outerFields, 2) ?? 0
    if (pk !== kind) {
      next.push(f)
      continue
    }
    if (pi === shell) {
      found = true
      continue
    }
    if (pi > shell) {
      const outerNext = [{ number: 1, wire: 0, value: kind }]
      if (pi - 1 > 0) outerNext.push({ number: 2, wire: 0, value: pi - 1 })
      next.push({
        ...f,
        value: sub(
          pf.map((x) => (x.number === 1 && x.wire === 2 ? { ...x, value: sub(outerNext) } : x))
        )
      })
      continue
    }
    next.push(f)
  }
  if (!found) throw new Error(`[error] impl graph has no compositePin outer ${kind}[${shell}]`)
  return sub(next)
}

/** 实例节点：删 field7==pinIndex 的该 kind pin（case5 样本）+ shell>N 的该 kind pin
 *  ShellIndex 前移（case4 样本：InParam[3]→[2]，cpi 保持）。 */
export function delInstanceCompositePin(
  node: Uint8Array,
  kind: number,
  shell: number,
  pinIndex: number
): Uint8Array {
  const next: Uint8Array[] = []
  for (const p of pinsOf(node)) {
    if (pinKindOf(p) !== kind) {
      next.push(p)
      continue
    }
    const pf = pinFields(p)
    const cpi = pf.find((f) => f.number === 7 && f.wire === 0)
    if (cpi !== undefined && cpi.value === pinIndex) continue
    const s = pinShell(p)
    if (s > shell) {
      const identity = [{ number: 1, wire: 0, value: kind }]
      if (s - 1 > 0) identity.push({ number: 2, wire: 0, value: s - 1 })
      next.push(
        sub(
          pf.map((f) =>
            (f.number === 1 || f.number === 2) && f.wire === 2 ? { ...f, value: sub(identity) } : f
          )
        )
      )
      continue
    }
    next.push(p)
  }
  return rebuildNode(node, next)
}

// ---- 复合接口换位（swap-inputs-case8 闭合）----

/** def 交换两条参数流：内容（name/type/pinIndex 等）互换位置，field3 的 ShellIndex 重写为
 *  新位置（case8 样本：shell0 变 Str 后 field3 仍为 {1:3}，即身份跟随位置）。 */
export function swapParamFlows(blob: Uint8Array, kind: number, a: number, b: number): Uint8Array {
  const fields = parseWireMessage(blob)
  if (!fields) throw new Error('[error] composite def unparseable')
  const listField = flowListField(kind)
  const flows: Array<{ field: WireField; shell: number }> = []
  for (const f of fields) {
    if (f.number !== listField || f.wire !== 2) continue
    const flow = parseWireMessage(f.value as Uint8Array)
    if (!flow) continue
    const idx = indexOf(flow.find((x) => x.number === 3)?.value as Uint8Array | undefined)
    if (idx && idx.kind === kind) flows.push({ field: f, shell: idx.index ?? 0 })
  }
  const fa = flows.find((x) => x.shell === a)
  const fb = flows.find((x) => x.shell === b)
  if (!fa || !fb) throw new Error(`[error] def flows shell ${a}/${b} not found`)
  const swap = (f: WireField, shell: number): WireField => {
    const flow = parseWireMessage(f.value as Uint8Array)!
    return {
      ...f,
      value: sub(
        flow.map((x) => (x.number === 3 && x.wire === 2 ? { ...x, value: pinIndexWire(kind, shell) } : x))
      )
    }
  }
  return sub(fields.map((f) => (f === fa.field ? swap(fb.field, a) : f === fb.field ? swap(fa.field, b) : f)))
}

/** impl compositePins：outer 位置不动、inner+innerNode 部分互换（case8 样本）。 */
export function swapCompositePinInners(blob: Uint8Array, kind: number, a: number, b: number): Uint8Array {
  const fields = parseWireMessage(blob)
  if (!fields) throw new Error('[error] impl graph unparseable')
  const pins: Array<{ field: WireField; outerShell: number }> = []
  for (const f of fields) {
    if (f.number !== 4 || f.wire !== 2) continue
    const pf = parseWireMessage(f.value as Uint8Array) ?? []
    const outerMsg = pf.find((x) => x.number === 1 && x.wire === 2)
    const outerFields = outerMsg ? (parseWireMessage(outerMsg.value as Uint8Array) ?? []) : []
    if ((wireVarint(outerFields, 1) ?? 0) !== kind) continue
    pins.push({ field: f, outerShell: wireVarint(outerFields, 2) ?? 0 })
  }
  const fa = pins.find((x) => x.outerShell === a)
  const fb = pins.find((x) => x.outerShell === b)
  if (!fa || !fb) throw new Error(`[error] impl compositePins outer ${kind}[${a}]/${b} not found`)
  const split = (f: WireField) => {
    const pf = parseWireMessage(f.value as Uint8Array)!
    return {
      outer: pf.find((x) => x.number === 1),
      rest: pf.filter((x) => x.number !== 1)
    }
  }
  const ra = split(fa.field)
  const rb = split(fb.field)
  const rebuild = (base: WireField, outer: WireField | undefined, rest: WireField[]): WireField =>
    ({ ...base, value: sub(outer ? [outer, ...rest] : rest) })
  return sub(
    fields.map((f): WireField =>
      f === fa.field
        ? rebuild(fa.field, ra.outer, rb.rest)
        : f === fb.field
          ? rebuild(fb.field, rb.outer, ra.rest)
          : f
    )
  )
}

/** 实例节点：该 kind 的 shell a/b 两条 pin 互换位置，i1/i2 的 ShellIndex 重写为新位置
 *  （case8 样本：整 pin 互换 + 身份跟随位置）。 */
export function swapInstancePins(node: Uint8Array, kind: number, a: number, b: number): Uint8Array {
  const pins = pinsOf(node)
  const pa = pins.findIndex((p) => pinKindOf(p) === kind && pinShell(p) === a)
  const pb = pins.findIndex((p) => pinKindOf(p) === kind && pinShell(p) === b)
  if (pa === -1 || pb === -1) throw new Error(`[error] instance has no ${kind} pins shell ${a}/${b}`)
  const rewrite = (p: Uint8Array, shell: number): Uint8Array => {
    const identity = [{ number: 1, wire: 0, value: kind }]
    if (shell > 0) identity.push({ number: 2, wire: 0, value: shell })
    const pf = pinFields(p)
    return sub(
      pf.map((f) =>
        (f.number === 1 || f.number === 2) && f.wire === 2 ? { ...f, value: sub(identity) } : f
      )
    )
  }
  const next = [...pins]
  next[pa] = rewrite(pins[pb], a)
  next[pb] = rewrite(pins[pa], b)
  return rebuildNode(node, next)
}

function rewriteConnects(node: Uint8Array, oldIndex: number, newIndex: number): Uint8Array {
  const nf = parseWireMessage(node)!
  const next = nf.map((f) => {
    if (f.number !== 4 || f.wire !== 2) return f
    const pin = parseWireMessage(f.value as Uint8Array)!
    const pinNext = pin.map((x) => {
      if (x.number !== 5 || x.wire !== 2) return x
      const conn = parseWireMessage(x.value as Uint8Array)!
      if (wireVarint(conn, 1) !== oldIndex) return x
      return {
        ...x,
        value: sub(conn.map((y) => (y.number === 1 && y.wire === 0 ? { ...y, value: newIndex } : y)))
      }
    })
    return { ...f, value: sub(pinNext) }
  })
  return sub(next)
}

/** 实例重编号（case1 闭合）：节点记录 f1 改写 + 记录移到 nodeIndex 升序位置 +
 *  全图源侧 connects 目标 ID 改写，其余逐字节不动。 */
export function renumberGraphNode(blob: Uint8Array, oldIndex: number, newIndex: number): Uint8Array {
  const fields = parseWireMessage(blob)
  if (!fields) throw new Error('[error] graph blob unparseable')
  const out: WireField[] = []
  let moved: WireField | undefined
  for (const f of fields) {
    if (f.number !== 3 || f.wire !== 2) {
      out.push(f)
      continue
    }
    const view = parseNodeRecord(f.value as Uint8Array)
    if (view.index === oldIndex) {
      const nf = parseWireMessage(f.value as Uint8Array)!
      moved = {
        ...f,
        value: sub(nf.map((x) => (x.number === 1 && x.wire === 0 ? { ...x, value: newIndex } : x)))
      }
      continue
    }
    const changed = view.pins.some((p) => p.connects.some((c) => c.id === oldIndex))
    out.push(changed ? { ...f, value: rewriteConnects(f.value as Uint8Array, oldIndex, newIndex) } : f)
  }
  if (!moved) throw new Error(`[error] node ${oldIndex} not found`)
  const result: WireField[] = []
  let inserted = false
  for (const f of out) {
    if (f.number === 3 && f.wire === 2) {
      const idx = parseNodeRecord(f.value as Uint8Array).index
      if (!inserted && idx > newIndex) {
        result.push(moved)
        inserted = true
      }
    }
    result.push(f)
  }
  if (!inserted) result.push(moved)
  return sub(result)
}

/** 复合实例重建分配器（重编号统一假说 9+ 样本细化）：删旧实例后取最小空闲 nodeIndex
 *  （排除自身位置）；最小空闲 == 原位时返回 undefined（原位重建，wire 零变化，case2）。
 *  未闭合边界 fail closed：
 *  - innerNode == 原位（case7 v66→v67 单样本：编辑器排除原位取下一空闲 3→5）→ throw
 *  - 实例零 pins（case3/4 v24-v26：编辑器排除墓碑移动）→ throw
 *  注：编辑器有跨轮墓碑池（删参数轮累积），工具无会话史 → 仅无删除史场景与编辑器一致。 */
export function chooseRebuildIndex(
  graphBlob: Uint8Array,
  oldIndex: number,
  innerNode: number
): number | undefined {
  const nodes = parseGraphNodes(graphBlob)
  const inst = nodes.find((n) => n.index === oldIndex)
  if (!inst) throw new Error(`[error] node ${oldIndex} not found`)
  if (inst.pins.length === 0) {
    throw new Error('[error] 实例零 pins 的提升重编号规则未闭合（case3/4 两样本），拒绝')
  }
  if (innerNode === oldIndex) {
    throw new Error('[error] innerNode 与实例 nodeIndex 冲突的重编号规则未闭合（case7 单样本），拒绝')
  }
  const used = new Set(nodes.map((n) => n.index))
  used.delete(oldIndex)
  let newIndex = 1
  while (used.has(newIndex)) newIndex++
  return newIndex === oldIndex ? undefined : newIndex
}

// ---- 记录级 apply（整文件：payload → 新文件）----

export type GilHeader = { schema: number; headTag: number; fileType: number; tailTag: number }

export function gilHeader(bytes: Uint8Array): GilHeader {
  return {
    schema: readUint32BE(bytes, 4),
    headTag: readUint32BE(bytes, 8),
    fileType: readUint32BE(bytes, 12),
    tailTag: readUint32BE(bytes, bytes.length - 4)
  }
}

/** 替换 root10.section 里 id 对应 blob 的字节，其余 root 原样，祖先长度自动修复。 */
export function patchRecord(bytes: Uint8Array, section: 1 | 2 | 4, id: number, mutate: (blob: Uint8Array) => Uint8Array): Uint8Array {
  const payload = bytes.slice(20, -4)
  const fields: LenField[] = []
  parseMessage(payload, 0, payload.length, 0, 0, 0, 0, 0, 0, 0, fields)
  const target = fields.find(
    (f) => f.depth === 3 && f.p0 === 10 && f.p1 === section && f.p2 === 1 && blobId(payload.subarray(f.dataStart, f.dataEnd), section) === id
  )
  if (!target) {
    const what = section === 1 ? 'node graph' : section === 2 ? 'composite def' : 'impl graph'
    throw new Error(`[error] ${what} ${id} not found in root 10`)
  }
  const blob = payload.subarray(target.dataStart, target.dataEnd)
  const newPayload = applyReplacement(payload, fields, target, mutate(blob))
  return buildFile(newPayload, gilHeader(bytes))
}

/** 复合定义参数列表（读侧：实例 pin 的 type/pinIndex 来源）。 */export type FlowMeta = { kind: number; shell: number; name?: string; type?: number; pinIndex?: number }

export function flowMetas(blob: Uint8Array): FlowMeta[] {
  const fields = parseWireMessage(blob)
  if (!fields) return []
  const out: FlowMeta[] = []
  for (const kind of [1, 2, 3, 4]) {
    const listField = flowListField(kind)
    for (const f of fields.filter((x) => x.number === listField && x.wire === 2)) {
      const flow = parseWireMessage(f.value as Uint8Array)
      if (!flow) continue
      const idx = indexOf(flow.find((x) => x.number === 3)?.value as Uint8Array | undefined)
      if (!idx || idx.kind !== kind) continue
      const typeField = flow.find((x) => x.number === 4 && x.wire === 2)
      const typeFields = typeField ? parseWireMessage(typeField.value as Uint8Array) : undefined
      out.push({
        kind,
        shell: idx.index ?? 0,
        name: wireText(flow, 1),
        type: typeFields ? wireVarint(typeFields, 3) ?? wireVarint(typeFields, 4) : undefined,
        pinIndex: wireVarint(flow, 8)
      })
    }
  }
  return out
}

/** 在 NodeGraph 内按 nodeIndex 定位节点记录并应用修改（整文件级）。 */
export function patchGraphNode(
  bytes: Uint8Array,
  graphId: number,
  nodeIndex: number,
  mutate: (node: Uint8Array) => Uint8Array,
  section: 1 | 4 = 1
): Uint8Array {
  return patchRecord(bytes, section, graphId, (blob) => {
    const fields = parseWireMessage(blob)
    if (!fields) throw new Error('[error] graph blob unparseable')
    let done = false
    const next = fields.map((f) => {
      if (f.number !== 3 || f.wire !== 2) return f
      const node = f.value as Uint8Array
      const view = parseNodeRecord(node)
      if (view.index !== nodeIndex) return f
      done = true
      return { ...f, value: mutate(node) }
    })
    if (!done) throw new Error(`[error] node ${nodeIndex} not found in graph ${graphId}`)
    return sub(next)
  })
}

// ---- 节点新增（node-add-case1 v55→v56 闭合）----

/** 节点引用结构（f2/f3 内部）：{1:10001, 2:20000, 3:kind, 5:id}；普通 SysCall kind=22000，
 *  复合实例 kind=22001（node 11/12/51 实测）。 */
function nodeRefWire(id: number, kind: number): Uint8Array {
  return sub([
    { number: 1, wire: 0, value: 10001 },
    { number: 2, wire: 0, value: 20000 },
    { number: 3, wire: 0, value: kind },
    { number: 5, wire: 0, value: id }
  ])
}

/** 新增节点：nodeIndex = 最小空闲空洞，跳过 exclude（本序列内已删除、编辑器会话墓碑
 *  不复用的号）；无 pin 落盘（node-add-case1/2 闭合：打印字符串等有默认参数的节点
 *  新增也不落盘默认 pin）；记录按 nodeIndex 升序插入，其余记录逐字节保留。
 *  f2/f3：有同 genericId donor 时克隆（含 concreteId/kind）；无 donor 时按 SysCall Fixed
 *  模板构造（genericId=concreteId，kind=22000）。Variant donor（genericId≠concreteId）
 *  与 Variant 新增未闭合，fail closed。坐标默认值(-908,1274)为单样本观察，调用方必须
 *  显式给位置。 */
function insertNodeRecord(fields: WireField[], node: Uint8Array, index: number): Uint8Array {
  const records = fields.filter((f) => f.number === 3 && f.wire === 2)
  const insertAt = records.findIndex((f) => parseNodeRecord(f.value as Uint8Array).index > index)
  const out: WireField[] = []
  let seen = 0
  for (const f of fields) {
    if (f.number === 3 && f.wire === 2) {
      if (seen === insertAt) out.push({ number: 3, wire: 2, value: node })
      seen++
    }
    out.push(f)
  }
  if (insertAt < 0 || seen === insertAt) out.push({ number: 3, wire: 2, value: node })
  return sub(out)
}

/**
 * 注册节点图变量（2026-08-09 tab-input gvar-registered 真实快照闭合）。
 * 仅闭合 Str 类型模板：NodeGraph 追加 f6 graphValues，
 * GraphVariable {f2:name, f3:type=6, f4:VarBase{f1:5, f4:itemType{1:1,100:{1:6}},
 * f105:bString空}, f7:6, f8:6}；exposed/structId 默认省略。
 * 其他类型未验证 → fail closed。
 */
export function addGraphVariable(blob: Uint8Array, name: string, type: number): Uint8Array {
  if (type !== 6) throw new Error('[error] graph variable registration only closed for Str (6) type')
  const fields = parseWireMessage(blob)
  if (!fields) throw new Error('[error] graph blob unparseable')
  const varBase = sub([
    { number: 1, wire: 0, value: 5 },
    {
      number: 4,
      wire: 2,
      value: sub([
        { number: 1, wire: 0, value: 1 },
        { number: 100, wire: 2, value: sub([{ number: 1, wire: 0, value: 6 }]) }
      ])
    },
    { number: 105, wire: 2, value: new Uint8Array(0) }
  ])
  const variable = sub([
    { number: 2, wire: 2, value: new TextEncoder().encode(name) },
    { number: 3, wire: 0, value: 6 },
    { number: 4, wire: 2, value: varBase },
    { number: 7, wire: 0, value: 6 },
    { number: 8, wire: 0, value: 6 }
  ])
  return sub([...fields, { number: 6, wire: 2, value: variable }])
}

export function addGraphNode(blob: Uint8Array, genericId: number, x: number, y: number, exclude?: ReadonlySet<number>): Uint8Array {
  const fields = parseWireMessage(blob)
  if (!fields) throw new Error('[error] graph blob unparseable')
  const records = fields.filter((f) => f.number === 3 && f.wire === 2)
  const views = records.map((f) => parseNodeRecord(f.value as Uint8Array))
  const used = new Set(views.map((v) => v.index))
  let index = 1
  while (used.has(index) || exclude?.has(index)) index++
  const donorView = views.find((v) => v.genericId === genericId)
  if (donorView && donorView.concreteId !== undefined && donorView.concreteId !== genericId) {
    throw new Error('[error] donor is a Variant node; adding Variant nodes not closed')
  }
  let refs: WireField[]
  if (donorView) {
    const donorRec = records.find((f) => parseNodeRecord(f.value as Uint8Array).index === donorView.index)!
    const donorFields = parseWireMessage(donorRec.value as Uint8Array)!
    refs = donorFields.filter((f) => f.number === 2 || f.number === 3).map((f) => ({ ...f }))
  } else {
    refs = [
      { number: 2, wire: 2, value: nodeRefWire(genericId, 22000) },
      { number: 3, wire: 2, value: nodeRefWire(genericId, 22000) }
    ]
  }
  const node = sub([
    { number: 1, wire: 0, value: index },
    ...refs,
    { number: 5, wire: 5, value: float32Bytes(x) },
    { number: 6, wire: 5, value: float32Bytes(y) }
  ])
  return insertNodeRecord(fields, node, index)
}

/**
 * 复制节点（2026-08-09 tab-input case2-6 编辑器复制快照闭合）：
 * 完整克隆源记录（f2/f3/pins 含值/cpi/f6wire2/f9），仅重分配 nodeIndex（最小空闲）
 * 与新 pos（f5/f6 wire5）。与 addGraphNode 不同：带全部 pin（含固定值），
 * 即编辑器「复制粘贴」语义；addGraphNode 是「新建」语义（无 pin 落盘）。
 */
export function copyGraphNode(
  blob: Uint8Array,
  srcIndex: number,
  x: number,
  y: number,
  exclude?: ReadonlySet<number>
): Uint8Array {
  const fields = parseWireMessage(blob)
  if (!fields) throw new Error('[error] graph blob unparseable')
  const records = fields.filter((f) => f.number === 3 && f.wire === 2)
  const views = records.map((f) => parseNodeRecord(f.value as Uint8Array))
  if (!views.some((v) => v.index === srcIndex)) throw new Error(`[error] node ${srcIndex} not found`)
  const used = new Set(views.map((v) => v.index))
  let index = 1
  while (used.has(index) || exclude?.has(index)) index++
  const srcRec = records.find((f) => parseNodeRecord(f.value as Uint8Array).index === srcIndex)!
  const srcFields = parseWireMessage(srcRec.value as Uint8Array)!
  const node = sub(
    srcFields.map((f) => {
      if (f.number === 1) return { number: 1, wire: 0, value: index }
      if (f.number === 5) return { number: 5, wire: 5, value: float32Bytes(x) }
      if (f.number === 6 && f.wire === 5) return { number: 6, wire: 5, value: float32Bytes(y) }
      return f
    })
  )
  return insertNodeRecord(fields, node, index)
}

// ---- 节点删除（node-del-case1 v56→v57 闭合）----

/** 删除节点：从 nodes 数组移除该记录（node-del-case1 闭合：其余记录逐字节不动、
 *  nodeIndex 变回空洞可复用、root4 def 记录不删）。 */
export function delGraphNode(blob: Uint8Array, nodeIndex: number): Uint8Array {
  const fields = parseWireMessage(blob)
  if (!fields) throw new Error('[error] graph blob unparseable')
  const records = fields.filter((f) => f.number === 3 && f.wire === 2)
  if (!records.some((f) => parseNodeRecord(f.value as Uint8Array).index === nodeIndex)) {
    throw new Error(`[error] node ${nodeIndex} not found`)
  }
  const out: WireField[] = []
  for (const f of fields) {
    if (f.number === 3 && f.wire === 2 && parseNodeRecord(f.value as Uint8Array).index === nodeIndex) continue
    out.push(f)
  }
  return sub(out)
}

/** 清空图全部节点（2026-08-09 turn-ctl 复盘：替代自写 clear-param-turn.ts 循环 delGraphNode）。
 *  保留图记录/变量/挂载，仅移除所有 nodes 记录。 */
export function clearGraphNodes(blob: Uint8Array): Uint8Array {
  const fields = parseWireMessage(blob)
  if (!fields) throw new Error('[error] graph blob unparseable')
  return sub(fields.filter((f) => !(f.number === 3 && f.wire === 2)))
}

/**
 * 跨图批量复制节点（2026-08-09 turn-ctl 实战验证后正式化，替代自写 copyFromSrc+remapAll）：
 * 从 srcBlob 提取 srcIndexes 列表的节点记录（含全部 pin 值），插入 dstBlob：
 * - 新索引：从 1 起分配（跳过 dst 已用）
 * - 位置：保持源图内相对布局，平移使列表左上角落在 (x,y)（勿堆同点/横排）
 * - 连线：pin connects 里引用列表内节点的旧索引 → 新索引；
 *   引用列表外节点 → fail closed 抛错（提示把目标节点加入列表，避免悬空）
 */
export function copyGraphNodesFromBlob(
  dstBlob: Uint8Array,
  srcBlob: Uint8Array,
  srcIndexes: readonly number[],
  x: number,
  y: number
): Uint8Array {
  const srcFields = parseWireMessage(srcBlob)
  if (!srcFields) throw new Error('[error] src graph blob unparseable')
  const srcRecs = srcFields.filter((f) => f.number === 3 && f.wire === 2)
  const srcViews = srcRecs.map((f) => parseNodeRecord(f.value as Uint8Array))
  const want = new Set(srcIndexes)
  const missing = [...want].filter((i) => !srcViews.some((v) => v.index === i))
  if (missing.length) throw new Error(`[error] src nodes not found: ${missing.join(',')}`)

  // 新索引分配（保持 srcIndexes 顺序，最小空闲）
  const dstFields = parseWireMessage(dstBlob)
  if (!dstFields) throw new Error('[error] dst graph blob unparseable')
  const used = new Set(
    dstFields.filter((f) => f.number === 3 && f.wire === 2).map((f) => parseNodeRecord(f.value as Uint8Array).index)
  )
  const assigned = new Map<number, number>()
  let index = 1
  for (const s of srcIndexes) {
    while (used.has(index)) index++
    assigned.set(s, index)
    used.add(index)
  }

  // 相对布局平移：列表内 minX/minY → (x, y)
  const posOf = (f: WireField): { px: number; py: number } => {
    const nf = parseWireMessage(f.value as Uint8Array)!
    const pxField = nf.find((g) => g.number === 5 && g.wire === 5)
    const pyField = nf.find((g) => g.number === 6 && g.wire === 5)
    const f32 = (field: { value: number | Uint8Array } | undefined) => {
      if (!field) return 0
      const buf = field.value as Uint8Array
      return new DataView(buf.buffer, buf.byteOffset, buf.byteLength).getFloat32(0, true)
    }
    return { px: f32(pxField), py: f32(pyField) }
  }
  const srcPos = srcRecs.filter((f) => want.has(parseNodeRecord(f.value as Uint8Array).index)).map(posOf)
  const minX = Math.min(...srcPos.map((p) => p.px))
  const minY = Math.min(...srcPos.map((p) => p.py))

  // 复制 + remap 连线
  const remapIndex = (id: number): number | undefined => assigned.get(id)
  const nodeOf = (srcIndex: number): Uint8Array => {
    const rec = srcRecs.find((f) => parseNodeRecord(f.value as Uint8Array).index === srcIndex)!
    const nf = parseWireMessage(rec.value as Uint8Array)!
    const newIndex = assigned.get(srcIndex)!
    const out: WireField[] = []
    for (const g of nf) {
      if (g.number === 1) {
        out.push({ number: 1, wire: 0, value: newIndex })
      } else if (g.number === 5) {
        out.push({ number: 5, wire: 5, value: float32Bytes(x + (posOf(rec).px - minX)) })
      } else if (g.number === 6 && g.wire === 5) {
        out.push({ number: 6, wire: 5, value: float32Bytes(y + (posOf(rec).py - minY)) })
      } else if (g.number === 4 && g.wire === 2) {
        // pins：remap connects 目标索引
        const pin = parseWireMessage(g.value as Uint8Array)!
        const pinNext = pin.map((p) => {
          if (p.number !== 5 || p.wire !== 2) return p
          const conn = parseWireMessage(p.value as Uint8Array)!
          const idField = conn.find((c) => c.number === 1 && c.wire === 0)
          if (!idField || typeof idField.value !== 'number') return p
          const mapped = remapIndex(idField.value)
          if (mapped === undefined) {
            throw new Error(
              `[error] node ${srcIndex} pin connects -> src node ${idField.value} not in copy list ` +
                `(${srcIndexes.join(',')}); add it or break the link first`
            )
          }
          return {
            ...p,
            value: emitWireMessage(
              conn.map((c) => (c.number === 1 && c.wire === 0 ? { ...c, value: mapped } : c))
            )
          }
        })
        out.push({ ...g, value: emitWireMessage(pinNext) })
      } else {
        out.push(g)
      }
    }
    return emitWireMessage(out)
  }
  let result = dstBlob
  for (const s of srcIndexes) result = insertNodeRecord(parseWireMessage(result)!, nodeOf(s), assigned.get(s)!)
  return result
}

// ---- 节点定义查询（新建数据 pin 的 type 来源 / 读侧名称）----

const RECORDS = NODE_PIN_RECORDS as Array<{ id: number; name?: string; inputs?: string[] }>

/** 目标定义输入类型（link 新建 pin 时 type 字段的权威来源，data-flow 闭合规则）。 */
export function nodeInputType(nodeId: number, shell: number): number | undefined {
  const name = RECORDS.find((r) => r.id === nodeId)?.inputs?.[shell]
  return name === undefined ? undefined : INPUT_TYPE[name]
}

export function nodeName(nodeId: number): string | undefined {
  return RECORDS.find((r) => r.id === nodeId)?.name
}

/** 节点是否是复合实例（SysGraph 22001）。 */
export function isCompositeInstance(node: Uint8Array): boolean {
  const fields = parseWireMessage(node)
  if (!fields) return false
  const prop = fields.find((f) => f.number === 2 && f.wire === 2)
  if (!prop) return false
  return wireVarint(parseWireMessage(prop.value as Uint8Array) ?? [], 3) === 22001
}

// ---- 读侧清单（CLI read/list 用）----

export type BlobEntry = { id: number; name?: string; nodeCount: number }

function payloadBlobs(payload: Uint8Array, section: 1 | 2 | 4): Array<{ id: number; name?: string; nodeCount: number }> {
  const fields: LenField[] = []
  parseMessage(payload, 0, payload.length, 0, 0, 0, 0, 0, 0, 0, fields)
  const out: BlobEntry[] = []
  for (const f of fields) {
    if (f.depth !== 3 || f.p0 !== 10 || f.p1 !== section || f.p2 !== 1) continue
    const blob = payload.subarray(f.dataStart, f.dataEnd)
    const id = blobId(blob, section)
    if (id === undefined) continue
    out.push({ id, name: blobName(blob, section), nodeCount: section === 2 ? 0 : parseGraphNodes(blob).length })
  }
  return out
}

/** root10 主图（section 1）+ 复合 impl 图（section 4）清单。 */
export function listGraphs(bytes: Uint8Array): BlobEntry[] {
  const payload = bytes.slice(20, -4)
  return [...payloadBlobs(payload, 1), ...payloadBlobs(payload, 4)]
}

/** root10 CompositeDef（section 2）清单。 */
export function listCompositeDefs(bytes: Uint8Array): BlobEntry[] {
  return payloadBlobs(bytes.slice(20, -4), 2)
}

/** 按 id 或名称找图（主图优先，fallback impl 图）。 */
export function resolveGraphId(bytes: Uint8Array, ref: string): number {
  const id = Number(ref)
  const graphs = listGraphs(bytes)
  if (!Number.isNaN(id)) {
    const byId = graphs.find((g) => g.id === id)
    if (byId) return id
  }
  const byName = graphs.filter((g) => g.name === ref)
  if (byName.length === 1) return byName[0].id
  if (byName.length > 1) throw new Error(`[error] 图名 ${ref} 有 ${byName.length} 个（主图/impl 图同名），请用图 ID`)
  throw new Error(`[error] 找不到图 ${ref}`)
}

/** 按 id 或名称找复合定义。 */
export function resolveDefId(bytes: Uint8Array, ref: string): number {
  const id = Number(ref)
  const defs = listCompositeDefs(bytes)
  if (!Number.isNaN(id)) {
    const byId = defs.find((d) => d.id === id)
    if (byId) return id
  }
  const byName = defs.filter((d) => d.name === ref)
  if (byName.length === 1) return byName[0].id
  if (byName.length > 1) throw new Error(`[error] 复合名 ${ref} 有 ${byName.length} 个，请用定义 ID`)
  throw new Error(`[error] 找不到复合定义 ${ref}`)
}

/** 主图（section 1）找不到时回退 impl 图（section 4），返回所在 section。 */
export function locateGraphField(
  payload: Uint8Array,
  graphId: number
): { field: LenField; section: 1 | 4 } {
  try {
    return { field: locateBlobField(payload, 1, graphId), section: 1 }
  } catch {
    return { field: locateBlobField(payload, 4, graphId), section: 4 }
  }
}
