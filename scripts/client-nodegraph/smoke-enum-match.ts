/**
 * 枚举匹配 IOC 冒烟：构建含 6 个 enumeration_match（gid 200005 / cid 10）的
 * character_skill 图，IR -> GIA -> decode 后断言双枚举引脚的 indexOfConcrete
 * 等于枚举类在编辑器下拉中的行号（census 表见 client_enum_values.ts
 * ENUM_MATCH_ROWS_BY_CLASS），覆盖 客户端专属类 / 连线 / 服务器类 /
 * 同类多行（类型转换 7、状态添加结果 14/15）场景。
 */
import assert from 'node:assert'
import fs from 'node:fs'

import { irToGia } from '../../src/compiler/ir_to_gia_transform/index.js'
import { ScanStatus } from '../../src/definitions/client_enums.js'
import { TargetType, TypeConversion, UnitStatusAdditionResult } from '../../src/definitions/enum.js'
import { buildClientGraphRegistriesIRDocuments, g } from '../../src/runtime/core.js'
import { decode_gia_file } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'

const PROTO_PATH =
  'src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto'
const OUT_FILE = 'tests/client_generated/smoke_enum_match.gia'

g.characterSkill({ id: 1082130441, name: 'EnumMatch' }).on('start', (_evt, f) => {
  const self = f.getSelfEntity()
  // 1) 客户端专属类字面量对（扫描状态，census 行 40）
  const m1 = f.enumerationMatch(ScanStatus.CandidateTarget, ScanStatus.UnusableTarget)
  // 2) 连线 + 字面量（连线由 conn.enum 类名定行）
  const m2 = f.enumerationMatch(f.getEntitySScanStatus(self), ScanStatus.ConditionNotMet)
  // 3) 服务器类字面量对（类型转换有 7/34 两行，值 800/802 均命中首行 7）
  const m3 = f.enumerationMatch(TypeConversion.IntegerToBoolean, TypeConversion.IntegerToString)
  // 4) 目标类型（2000 系有 24/39 两行，取全集行 24）
  const m4 = f.enumerationMatch(TargetType.None, TargetType.AlliedFaction)
  // 5/6) 状态添加结果拆成 14（失败半）/ 15（成功半）两行，按值精确定行
  const m5 = f.enumerationMatch(
    UnitStatusAdditionResult.FailedUnexpectedError,
    UnitStatusAdditionResult.FailedUnableToAddAdditionalStack
  )
  const m6 = f.enumerationMatch(
    UnitStatusAdditionResult.SuccessNewStatusApplied,
    UnitStatusAdditionResult.SuccessSlotStacking
  )
  const consume = (matches: boolean[]) => {
    const [head, ...rest] = matches
    if (head === undefined) return
    f.doubleBranch(
      head,
      () => f.forceExitAimingState(),
      () => consume(rest)
    )
  }
  consume([m1, m2, m3, m4, m5, m6])
})

const doc = buildClientGraphRegistriesIRDocuments().find((d) => d.graph.name?.includes('EnumMatch'))!
const bytes = irToGia(doc, { protoPath: PROTO_PATH })
fs.writeFileSync(OUT_FILE, bytes)
const decoded = decode_gia_file(OUT_FILE, undefined, true)
const nodes = decoded.graph.graph?.inner.graph?.nodes ?? []

type PinExpect = {
  index: number
  ioc: number
  innerSet: boolean
  /** 字面量引脚的 bEnum 载荷 */
  enumVal?: number
}

const matchNodes = nodes.filter((n: any) => Number(n.genericId?.nodeId) === 200005)
assert.strictEqual(matchNodes.length, 6, `expects 6 enumeration_match nodes, got ${matchNodes.length}`)

function checkMatch(label: string, nth: number, pins: PinExpect[]) {
  const node: any = matchNodes[nth]
  assert.strictEqual(Number(node.concreteId?.nodeId), 10, `${label}: concreteId`)
  for (const exp of pins) {
    const pin = (node.pins ?? []).find(
      (p: any) => Number(p.i1?.kind) === 3 && Number(p.i1?.index) === exp.index
    )
    assert.ok(pin, `${label}: pin k3#${exp.index} missing`)
    assert.strictEqual(Number(pin.type ?? 0), 13, `${label}: pin k3#${exp.index} type`)
    assert.strictEqual(
      Number(pin.value?.bConcreteValue?.indexOfConcrete),
      exp.ioc,
      `${label}: pin k3#${exp.index} ioc`
    )
    assert.strictEqual(
      Boolean(pin.value?.bConcreteValue?.value?.alreadySetVal),
      exp.innerSet,
      `${label}: pin k3#${exp.index} innerSet`
    )
    if (exp.enumVal !== undefined) {
      assert.strictEqual(
        Number(pin.value?.bConcreteValue?.value?.bEnum?.val),
        exp.enumVal,
        `${label}: pin k3#${exp.index} enum payload`
      )
    }
  }
  console.log(`[ok] ${label}: ioc=${pins[0].ioc}, ${pins.length} pins verified`)
}

// 语料对照：枚举普查_角色技能_全量排列（字面量带类 ioc）与 *_连线（连线保持类 ioc、内部 unset）
checkMatch('ScanStatus literal pair', 0, [
  { index: 0, ioc: 40, innerSet: true, enumVal: 5002 },
  { index: 1, ioc: 40, innerSet: true, enumVal: 5000 }
])
checkMatch('ScanStatus wired + literal', 1, [
  { index: 0, ioc: 40, innerSet: false },
  { index: 1, ioc: 40, innerSet: true, enumVal: 5003 }
])
checkMatch('TypeConversion (row 7 of 7/34)', 2, [
  { index: 0, ioc: 7, innerSet: true, enumVal: 800 },
  { index: 1, ioc: 7, innerSet: true, enumVal: 802 }
])
checkMatch('TargetType (row 24 of 24/39)', 3, [
  { index: 0, ioc: 24, innerSet: true, enumVal: 2000 },
  { index: 1, ioc: 24, innerSet: true, enumVal: 2001 }
])
checkMatch('UnitStatusAdditionResult failed half (row 14)', 4, [
  { index: 0, ioc: 14, innerSet: true, enumVal: 1500 },
  { index: 1, ioc: 14, innerSet: true, enumVal: 1503 }
])
checkMatch('UnitStatusAdditionResult success half (row 15)', 5, [
  { index: 0, ioc: 15, innerSet: true, enumVal: 1504 },
  { index: 1, ioc: 15, innerSet: true, enumVal: 1505 }
])

fs.rmSync(OUT_FILE, { force: true })
console.log('[ok] enumeration_match ioc encoding verified (6 nodes)')
