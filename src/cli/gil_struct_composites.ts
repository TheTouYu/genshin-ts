/**
 * 结构体的「物化节点族」生成器。
 *
 * 背景（2026-09-26 实测，见 `.scratch/editor-incremental-evidence/2026-09-16-struct16/FINDINGS.md` C63–C69）：
 * 编辑器在创建一个结构体时，除了写定义记录，还会往 root10 物化 **9 条复合定义**
 * （拼装×4 + 拆分×4 + 修改×1，四个图类型各一套拼装/拆分，修改只有服务端图一份）。
 *
 * **缺少这 9 条时，结构体在编辑器节点图里「选不中 / 加载不出来」** ——
 * 因为节点实例是 `{genericId: <CompositeDef id>, concreteId: 同}`，靠 def id 找定义。
 * 我方 CLI 原先只写定义记录，产出的是"半成品"（资产列表可见、节点图不可用）。
 *
 * 全部编码均从真实地图 `1073741918` 的 **8 个结构体 × 9 条 = 72 条**编辑器产物反推，
 * 并由 N=1 / N=2 / N=17 三种规模交叉验证。
 */

import { emitWireMessage, parseWireMessage, type WireField } from './static_assembly/wire.js'
import type { StructMember } from './gil_structs.js'

/** 物化覆盖的四个图类型，顺序固定（编辑器产物实测） */
export const MATERIALIZE_GRAPH_TYPES = [20000, 20001, 20002, 20007] as const

/** `107.f1` 操作码 */
export const STRUCT_OP_ASSEMBLE = 1003
export const STRUCT_OP_SPLIT = 1004
export const STRUCT_OP_MODIFY = 1005

/** `107` 里引用结构体的字段号（拼装 / 拆分 / 修改 各不同） */
const OP_REF_FIELD: Record<number, number> = {
  [STRUCT_OP_ASSEMBLE]: 104,
  [STRUCT_OP_SPLIT]: 105,
  [STRUCT_OP_MODIFY]: 106
}

/**
 * **双类型码空间**：同一成员类型在服务端图（20000）与其余三类图里用不同的 VarType 码。
 * 表见 `docs/game-engine-knowledge/struct-assets.md`。
 */
const SERVER_CODES: Record<number, number> = {
  1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9, 10: 10, 11: 11,
  12: 12, 13: 13, 15: 15, 17: 17, 20: 20, 21: 21
}
const CLIENT_CODES: Record<number, number> = {
  1: 1, 2: 14, 3: 3, 4: 5, 5: 7, 6: 9, 7: 15, 8: 4, 9: 6, 10: 8, 11: 10,
  12: 11, 13: 2, 15: 12, 17: 16, 20: 18, 21: 19,
  25: 22, // struct：服务端 25 → 其余三类图 22（实测 def 1610612831）
  26: 23, // struct_list：同上 +1（实测 def 1610612740 系列）
  27: 24, // dict：服务端 27 → 其余三类图 24（实测结构体_3 1077936139）
  // 以下三种客户端码实测于结构体_2 (1077936138) 的 20001 拆分 def：
  22: 20, // config_list
  23: 21, // prefab_list
  24: 25 // faction_list（0x19 = 25；我第一次读成了 19 —— 十六进制/十进制看串）
  // 注：与 id 类标量并非简单偏移（config_id 20→18、prefab_id 21→19 是 −2，
  //     而 faction 17→16 是 −1、faction_list 24→19 是 −5）→ 只能逐项实测
}

/** `f4.f1`：引脚类型档。**四类图相同**；entity 省略、列表统一 10002。 */
function pinTypeSlot(varTypeCode: number): number | undefined {
  if (varTypeCode === 1) return undefined // entity：字段省略
  if ([7, 8, 9, 10, 11, 13, 15, 22, 23, 24, 26].includes(varTypeCode)) return 10002 // 各类列表
  if ([2, 17, 20, 21].includes(varTypeCode)) return 1
  if (varTypeCode === 3) return 2
  if (varTypeCode === 5) return 4
  if (varTypeCode === 6) return 5
  if (varTypeCode === 4) return 6
  if (varTypeCode === 12) return 7
  if (varTypeCode === 25) return 10001 // struct 引用
  if (varTypeCode === 27) return 10003 // dict（实测 def 1610612846 引脚 22）
  return undefined
}

type PinKind = 'in' | 'out' | 'flowIn' | 'flowOut'

export type GenPin = {
  kind: PinKind
  name: string
  /** VarType 码（已按图类型换过空间）；undefined 表示该引脚无类型（如"修改对象"） */
  typeCode?: number
  /** struct / struct_list 成员引用的结构体 id */
  refStructId?: number
  /** index 字段的序号（同一 kind 内从 1 起，除修改 def 外第一个省略） */
  indexSeq?: number
  /** 强制写出 index 的序号（修改 def 的成员引脚即使 =1 也写） */
  forceIndexSeq?: boolean
  /** `f5` 的值（实测：修改 def 各引脚 13/14/15/16；拼装/拆分的结构体引脚 13；其余无） */
  f5Value?: number
  /** dict 成员的键/值类型码（来自定义记录 f1.f2.f502/f503） */
  keyTypeCode?: number
  valueTypeCode?: number
}

/** 列表类型 → 元素类型码 */
const LIST_ELEMENT: Record<number, number> = {
  7: 2, 8: 3, 9: 4, 10: 5, 11: 6, 13: 1, 15: 12, 22: 20, 23: 21, 24: 17, 26: 25
}

/**
 * 递归构造引脚类型描述符 `f4`（2026-09-26 实测全表，见 FINDINGS C69）：
 *
 * ```
 * descriptor(t) = { 1: <slot(t)>, 3: <code(t)>, 4: <code(t)>,
 *                   101: {1:1}                     ← 仅 bool
 *                   102: {1: descriptor(元素类型)}   ← 仅列表
 *                   104: {2: <structId>}            ← 仅 struct / struct_list
 *                 }
 * ```
 * 注意：`3`/`4` 用**映射后**（按图类型）的类型码；递归进去的元素类型同样映射。
 * entity 不写 `f1`。
 */
function descriptor(
  varTypeCode: number,
  slot: number | undefined,
  mappedCode: number,
  refStructId: number | undefined,
  graphType: number,
  depth = 0,
  keyTypeCode?: number,
  valueTypeCode?: number
): WireField[] {
  const out: WireField[] = []
  if (slot !== undefined) out.push({ number: 1, wire: 0, value: slot })
  out.push({ number: 3, wire: 0, value: mappedCode })
  out.push({ number: 4, wire: 0, value: mappedCode })
  if (varTypeCode === 4) {
    // bool 独有的 101 字段：服务端图 {1:1}，其余三类图 {1:200001}（实测全表）
    out.push({
      number: 101,
      wire: 2,
      value: emitWireMessage([{ number: 1, wire: 0, value: graphType === 20000 ? 1 : 200001 }])
    })
  }
  if (varTypeCode === 27) {
    // dict：`105 = {3:<键类型>, 4:<值类型>, 6:1, 7:<图族 1|2>}`（实测三样本，C71b）
    const codes2 = graphType === 20000 ? SERVER_CODES : CLIENT_CODES
    out.push({
      number: 105,
      wire: 2,
      value: emitWireMessage([
        { number: 3, wire: 0, value: codes2[keyTypeCode ?? 6] ?? keyTypeCode ?? 6 },
        { number: 4, wire: 0, value: codes2[valueTypeCode ?? 6] ?? valueTypeCode ?? 6 },
        { number: 6, wire: 0, value: 1 },
        { number: 7, wire: 0, value: graphType === 20000 ? 1 : 2 }
      ])
    })
    return out
  }
  if (varTypeCode === 25) {
    // struct：104 在**顶层**
    if (refStructId !== undefined) {
      out.push({
        number: 104,
        wire: 2,
        value: emitWireMessage([{ number: 2, wire: 0, value: refStructId }])
      })
    }
  } else if (LIST_ELEMENT[varTypeCode] !== undefined) {
    // 列表（含 struct_list 26）：元素描述符嵌在 102 里；
    // **struct_list 的 104 要跟着元素走**（实测 def 1610612737 引脚 3），不能放顶层
    const el = LIST_ELEMENT[varTypeCode]
    const codes = graphType === 20000 ? SERVER_CODES : CLIENT_CODES
    const elRef = varTypeCode === 26 ? refStructId : undefined
    out.push({
      number: 102,
      wire: 2,
      value: emitWireMessage([
        {
          number: 1,
          wire: 2,
          value: emitWireMessage(descriptor(el, pinTypeSlot(el), codes[el] ?? el, elRef, graphType, depth + 1))
        }
      ])
    })
  }
  return out
}

function pinField(pin: GenPin, pinIndex: number, graphType: number): WireField[] {
  const fields: WireField[] = [{ number: 1, wire: 2, value: new TextEncoder().encode(pin.name) }]
  if (pin.kind === 'in' || pin.kind === 'out') fields.push({ number: 2, wire: 0, value: 1 })
  // index：{1: kind}，输入 kind=3 / 输出 kind=4；flowIn=1 / flowOut=2；第一个省略序号
  const idxKind = pin.kind === 'in' ? 3 : pin.kind === 'out' ? 4 : pin.kind === 'flowIn' ? 1 : 2
  const idx: WireField[] = [{ number: 1, wire: 0, value: idxKind }]
  if (pin.indexSeq !== undefined) {
    // 两族 def 的序号基准不同（实测）：
    //   拼装/拆分：第 n 个引脚写 n-1，第一个省略
    //   修改：成员引脚写 2i+1 / 2i+2，**从 1 起且不省略**
    if (pin.forceIndexSeq === true) {
      idx.push({ number: 2, wire: 0, value: pin.indexSeq })
    } else if (pin.indexSeq > 1) {
      idx.push({ number: 2, wire: 0, value: pin.indexSeq - 1 })
    }
  }
  fields.push({ number: 3, wire: 2, value: emitWireMessage(idx) })
  if (pin.typeCode === undefined) {
    fields.push({ number: 4, wire: 2, value: new Uint8Array(0) })
  } else {
    const codes = graphType === 20000 ? SERVER_CODES : CLIENT_CODES
    const mapped = codes[pin.typeCode] ?? pin.typeCode
    fields.push({
      number: 4,
      wire: 2,
      // 注意：f4.f1（引脚类型档）按**原始**类型码查表，f4.f3/f4.f4 用**映射后**的类型码
      value: emitWireMessage(
        descriptor(pin.typeCode, pinTypeSlot(pin.typeCode), mapped, pin.refStructId, graphType, 0, pin.keyTypeCode, pin.valueTypeCode)
      )
    })
    // 注：int 等原始类型引脚**没有 f5**；只有结构体类型引脚才有（实测 {1:13}）
    // 注意：**成员引脚没有 f5**，哪怕它的类型是 struct（实测 def 1610612737 引脚 2）。
    // f5 只出现在「代表整个结构体」的引脚上（拼装输出 / 拆分输入 / 修改的三个位置）。
    const f5 = pin.f5Value
    if (f5 !== undefined) {
      fields.push({ number: 5, wire: 2, value: emitWireMessage([{ number: 1, wire: 0, value: f5 }]) })
    }
  }
  fields.push({ number: 8, wire: 0, value: pinIndex })
  return fields
}

function idField(defId: number, graphType: number, isConcrete: boolean, op: number): WireField[] {
  const fields: WireField[] = [
    { number: 1, wire: 0, value: 10001 },
    { number: 2, wire: 0, value: graphType }
  ]
  if (!isConcrete || graphType === 20000) {
    fields.push({ number: 3, wire: 0, value: 22001 })
    fields.push({ number: 5, wire: 0, value: defId })
  } else {
    fields.push({ number: 3, wire: 0, value: 22000 })
    // 非服务端图的 concreteId 用常量：拼装 1060 / 拆分 1061（实测）
    fields.push({ number: 5, wire: 0, value: op === STRUCT_OP_ASSEMBLE ? 1060 : 1061 })
  }
  return fields
}

export type GeneratedComposite = {
  /** 该 def 的 id */
  defId: number
  graphType: number
  op: number
  name: string
  /** root10 上新加的 `f2` 字段内容（即 `{1: <CompositeDef>}`） */
  bytes: Uint8Array
}

/**
 * 生成一个结构体的 9 条物化定义。
 *
 * @param members     成员（按创建序；`order` 从 1 起）
 * @param structId    结构体 id
 * @param baseDefId   第一条 def 的 id（后续连续 +1）
 * @param basePinIndex 第一条引脚 pinIndex（= 现存所有复合 def 的全局最大 pinIndex + 1）
 */
export function buildStructComposites(
  structName: string,
  members: readonly StructMember[],
  structId: number,
  baseDefId: number,
  basePinIndex: number
): GeneratedComposite[] {
  const out: GeneratedComposite[] = []
  let defId = baseDefId
  let pin = basePinIndex

  const emitOne = (
    op: number,
    graphType: number,
    name: string,
    pins: (pinIndex: number) => WireField[]
  ): void => {
    const id = defId++
    const idMsg = emitWireMessage([
      { number: 1, wire: 2, value: emitWireMessage(idField(id, graphType, false, op)) },
      { number: 2, wire: 2, value: emitWireMessage(idField(id, graphType, true, op)) },
      { number: 4, wire: 2, value: new Uint8Array(0) }
    ])
    const body: WireField[] = [{ number: 4, wire: 2, value: idMsg }]
    for (const p of pins(pin)) body.push({ number: p.number, wire: 2, value: p.value as Uint8Array })
    body.push({
      number: 107,
      wire: 2,
      value: emitWireMessage([
        { number: 1, wire: 0, value: op },
        {
          number: OP_REF_FIELD[op],
          wire: 2,
          value: emitWireMessage([{ number: 1, wire: 0, value: structId }])
        }
      ])
    })
    // 每条 def 都带 f200(名) / f203 / f204（实测：拼装/拆分 5,4；修改 1,3）
    if (op === STRUCT_OP_MODIFY) {
      body.push({ number: 200, wire: 2, value: new TextEncoder().encode('修改结构体') })
      body.push({ number: 203, wire: 0, value: 1 })
      body.push({ number: 204, wire: 0, value: 3 })
    } else {
      body.push({
        number: 200,
        wire: 2,
        value: new TextEncoder().encode(op === STRUCT_OP_ASSEMBLE ? '拼装结构体' : '拆分结构体')
      })
      body.push({ number: 203, wire: 0, value: 5 })
      body.push({ number: 204, wire: 0, value: 4 })
    }
    const def = emitWireMessage(body)
    // root10.f2 的内容是 `{ 1: <CompositeDef> }` —— 外面还有一层包装
    const wrapped = emitWireMessage([{ number: 1, wire: 2, value: def }])
    out.push({ defId: id, graphType, op, name, bytes: wrapped })
  }

  // 拼装 / 拆分：四个图类型各一套；引脚 pinIndex 连续推进
  const assemble = (graphType: number): void => {
    const idxs: number[] = []
    for (let i = 0; i < members.length + 1; i++) idxs.push(pin++)
    emitOne(STRUCT_OP_ASSEMBLE, graphType, '拼装结构体', () =>
      members
        .map((m, i) => ({
          number: 102,
          value: emitWireMessage(
            pinField(
              { kind: 'in', name: m.name, typeCode: m.typeCode, refStructId: m.refStructId, keyTypeCode: m.keyTypeCode, valueTypeCode: m.valueTypeCode, indexSeq: i + 1 },
              idxs[i],
              graphType
            )
          )
        }))
        .concat([
          {
            number: 103,
            value: emitWireMessage(
              pinField(
                { kind: 'out', name: structName, typeCode: 25, refStructId: structId, indexSeq: 1, f5Value: 13 },
                idxs[members.length],
                graphType
              )
            )
          }
        ]) as WireField[])
  }
  const split = (graphType: number): void => {
    const idxs: number[] = []
    for (let i = 0; i < members.length + 1; i++) idxs.push(pin++)
    emitOne(STRUCT_OP_SPLIT, graphType, '拆分结构体', () =>
      [
        {
          number: 102,
          value: emitWireMessage(
            pinField({ kind: 'in', name: structName, typeCode: 25, refStructId: structId, indexSeq: 1, f5Value: 13 }, idxs[0], graphType)
          )
        }
      ].concat(
        members.map((m, i) => ({
          number: 103,
          value: emitWireMessage(
            pinField(
              { kind: 'out', name: m.name, typeCode: m.typeCode, refStructId: m.refStructId, keyTypeCode: m.keyTypeCode, valueTypeCode: m.valueTypeCode, indexSeq: i + 1 },
              idxs[i + 1],
              graphType
            )
          )
        }))
      ) as WireField[])
  }

  for (const gt of MATERIALIZE_GRAPH_TYPES) {
    assemble(gt)
    split(gt)
    // 修改只有服务端图一份，紧跟 20000 的拼装/拆分之后
    if (gt === 20000) {
      const idxs: number[] = []
      for (let i = 0; i < 4 + 2 * members.length; i++) idxs.push(pin++)
      emitOne(STRUCT_OP_MODIFY, gt, '修改结构体', () => {
        const body: WireField[] = [
          { number: 100, wire: 2, value: emitWireMessage([{ number: 2, wire: 0, value: 1 }, { number: 3, wire: 2, value: emitWireMessage([{ number: 1, wire: 0, value: 1 }]) }, { number: 4, wire: 2, value: new Uint8Array(0) }, { number: 8, wire: 0, value: idxs[0] }]) },
          { number: 101, wire: 2, value: emitWireMessage([{ number: 2, wire: 0, value: 1 }, { number: 3, wire: 2, value: emitWireMessage([{ number: 1, wire: 0, value: 2 }]) }, { number: 4, wire: 2, value: new Uint8Array(0) }, { number: 8, wire: 0, value: idxs[1] }]) },
          {
            number: 102,
            wire: 2,
            value: emitWireMessage(pinField({ kind: 'in', name: structName, typeCode: 25, refStructId: structId, indexSeq: 1, f5Value: 13 }, idxs[2], gt))
          },
          {
            number: 102,
            wire: 2,
            value: emitWireMessage([
              { number: 1, wire: 2, value: new TextEncoder().encode('修改对象') },
              { number: 4, wire: 2, value: new Uint8Array(0) },
              { number: 5, wire: 2, value: emitWireMessage([{ number: 1, wire: 0, value: 16 }]) },
              { number: 8, wire: 0, value: idxs[3] }
            ])
          }
        ] as WireField[]
        members.forEach((m, i) => {
          body.push({
            number: 102,
            wire: 2,
            value: emitWireMessage(
              pinField({ kind: 'in', name: m.name, typeCode: m.typeCode, refStructId: m.refStructId, keyTypeCode: m.keyTypeCode, valueTypeCode: m.valueTypeCode, indexSeq: 2 * i + 1, forceIndexSeq: true, f5Value: 15 }, idxs[4 + 2 * i], gt)
            )
          })
          body.push({
            number: 102,
            wire: 2,
            value: emitWireMessage([
              { number: 1, wire: 2, value: new TextEncoder().encode(`是否设置_${m.name}`) },
              { number: 2, wire: 0, value: 1 },
              { number: 3, wire: 2, value: emitWireMessage([{ number: 1, wire: 0, value: 3 }, { number: 2, wire: 0, value: 2 * i + 2 }]) },
              { number: 4, wire: 2, value: emitWireMessage([{ number: 1, wire: 0, value: 6 }, { number: 4, wire: 0, value: 4 }, { number: 101, wire: 2, value: emitWireMessage([{ number: 1, wire: 0, value: 1 }]) }]) },
              { number: 5, wire: 2, value: emitWireMessage([{ number: 1, wire: 0, value: 14 }]) },
              { number: 8, wire: 0, value: idxs[5 + 2 * i] }
            ])
          })
        })
        return body
      })
    }
  }
  return out
}


/** 扫描现有复合定义，取 def id 与 pinIndex 的全局最大值（新建结构体从这里往后分配） */
export function readCompositeExtremes(payload: Uint8Array): { maxDefId: number; maxPinIndex: number } {
  const root = parseWireMessage(payload)
  if (!root) throw new Error('[error] malformed GIL payload')
  const r10 = root.find((f) => f.number === 10 && f.wire === 2)
  if (!r10) return { maxDefId: 0, maxPinIndex: 0 }
  const inner = parseWireMessage(r10.value as Uint8Array) ?? []
  let maxDefId = 0
  let maxPinIndex = 0
  for (const f of inner) {
    if (f.number !== 2 || f.wire !== 2) continue
    const def = parseWireMessage(f.value as Uint8Array) ?? []
    const one = def.find((x) => x.number === 1 && x.wire === 2)
    const body = one ? parseWireMessage(one.value as Uint8Array) : undefined
    if (!body) continue
    const idm = body.find((x) => x.number === 4 && x.wire === 2)
    if (idm) {
      const idMsg = parseWireMessage(idm.value as Uint8Array) ?? []
      const g1 = idMsg.find((x) => x.number === 1 && x.wire === 2)
      const g = g1 ? parseWireMessage(g1.value as Uint8Array) : undefined
      const v = g?.find((x) => x.number === 5 && x.wire === 0)?.value
      if (typeof v === 'number' && v > maxDefId) maxDefId = v
    }
    for (const pin of body) {
      if (![100, 101, 102, 103].includes(pin.number) || pin.wire !== 2) continue
      const pm = parseWireMessage(pin.value as Uint8Array) ?? []
      const idx = pm.find((x) => x.number === 8 && x.wire === 0)?.value
      if (typeof idx === 'number' && idx > maxPinIndex) maxPinIndex = idx
    }
  }
  return { maxDefId, maxPinIndex }
}
