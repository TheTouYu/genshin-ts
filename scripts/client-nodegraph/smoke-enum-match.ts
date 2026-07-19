/**
 * 枚举匹配 IOC 冒烟：构建 character_skill / creation_status 两族图，
 * IR -> GIA -> decode 后断言双枚举引脚的 indexOfConcrete
 * 等于枚举类在编辑器下拉中的行号（census 表见 client_enum_values.ts
 * ENUM_MATCH_ROWS_BY_GENERIC_ID），覆盖 客户端专属类 / 连线 / 服务器类 /
 * 拆分行（状态添加结果 14/15、类型转换 7/34、目标类型 24/39）
 * 及两族各自不同的第 42 行。
 */

import assert from 'node:assert'
import fs from 'node:fs'

import { irToGia } from '../../src/compiler/ir_to_gia_transform/index.js'
import {
  PreAimingEndReason,
  ScanStatus,
  TacticType,
  TargetTypeForCameraOrientationNode,
  TypeConversionSame
} from '../../src/definitions/client_enums.js'
import { TargetType, TypeConversion, UnitStatusAdditionResult } from '../../src/definitions/enum.js'
import { buildClientGraphRegistriesIRDocuments, g } from '../../src/runtime/core.js'
import { decode_gia_file } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'
import type {
  GraphNode,
  NodePin
} from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto.js'

const PROTO_PATH =
  'src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto'
const OUT_FILE = 'tests/client_generated/smoke_enum_match.gia'
const STATUS_OUT_FILE = 'tests/client_generated/smoke_enum_match_status.gia'

g.characterSkill({ id: 1082130441, name: 'EnumMatch' }).on('start', (_evt, f) => {
  const self = f.getSelfEntity()
  // 1) 客户端专属类字面量对（扫描状态，census 行 40）
  const m1 = f.enumerationMatch(ScanStatus.CandidateTarget, ScanStatus.UnusableTarget)
  // 2) 连线 + 字面量（连线由 conn.enum 类名定行）
  const m2 = f.enumerationMatch(f.getEntitySScanStatus(self), ScanStatus.ConditionNotMet)
  // 3/4) 类型转换的完整行 7 与相同值集合的独立行 34
  const m3 = f.enumerationMatch(TypeConversion.IntegerToBoolean, TypeConversion.IntegerToString)
  const m4 = f.enumerationMatch(
    TypeConversionSame.IntegerToBoolean,
    TypeConversionSame.IntegerToString
  )
  // 5/6) 完整目标类型行 24 与镜头朝向节点专用子集行 39
  const m5 = f.enumerationMatch(TargetType.None, TargetType.AlliedFaction)
  const m6 = f.enumerationMatch(
    TargetTypeForCameraOrientationNode.None,
    TargetTypeForCameraOrientationNode.AlliedFaction
  )
  // 7/8) 状态添加结果拆成 14（失败半）/ 15（成功半）两行，按值精确定行
  const m7 = f.enumerationMatch(
    UnitStatusAdditionResult.FailedUnexpectedError,
    UnitStatusAdditionResult.FailedUnableToAddAdditionalStack
  )
  const m8 = f.enumerationMatch(
    UnitStatusAdditionResult.SuccessNewStatusApplied,
    UnitStatusAdditionResult.SuccessSlotStacking
  )
  // 9) 角色/造物技能族专属第 42 行
  const m9 = f.enumerationMatch(PreAimingEndReason.Completed, PreAimingEndReason.Cancelled)
  const consume = (matches: boolean[]) => {
    const [head, ...rest] = matches
    if (head === undefined) return
    f.doubleBranch(
      head,
      () => f.forceExitAimingState(),
      () => consume(rest)
    )
  }
  consume([m1, m2, m3, m4, m5, m6, m7, m8, m9])
})

g.creationStatus({ id: 1082130442, name: 'EnumMatchStatus' }).on('start1', (_evt, f) => {
  // 状态族第 34 行缺少 807，但其余类型转换值仍可用
  const typeConversionMatches = f.enumerationMatch(
    TypeConversionSame.IntegerToBoolean,
    TypeConversionSame.Vector3ToString
  )
  // 状态族专属第 42 行
  const tacticMatches = f.enumerationMatch(TacticType.StayMotionless, TacticType.GroundPursuit)
  f.doubleBranch(
    typeConversionMatches,
    () =>
      f.doubleBranch(
        tacticMatches,
        () => f.continueExecutingPreviousFrameBehavior(),
        () => f.continueExecutingPreviousFrameBehavior()
      ),
    () => f.continueExecutingPreviousFrameBehavior()
  )
})

const documents = buildClientGraphRegistriesIRDocuments()
const doc = documents.find(
  (d) => d.graph.name?.includes('EnumMatch') && !d.graph.name.includes('EnumMatchStatus')
)!
const bytes = irToGia(doc, { protoPath: PROTO_PATH })
fs.writeFileSync(OUT_FILE, bytes)
const decoded = decode_gia_file(OUT_FILE, undefined, true)
const nodes = decoded.graph.graph?.inner.graph?.nodes ?? []
const statusDoc = documents.find((d) => d.graph.name?.includes('EnumMatchStatus'))!

function assertFamilyRejects(
  document: typeof doc,
  values: [string, string],
  expectedMessage: RegExp
) {
  const forged = globalThis.structuredClone(document)
  const matchNode = forged.nodes?.find((node) => node.type === 'enumeration_match')
  assert.ok(matchNode?.args)
  for (const [index, value] of values.entries()) {
    const argument = matchNode.args[index]
    assert.ok(argument && argument.type === 'enum')
    argument.value = value
  }
  assert.throws(
    () => irToGia(forged, { protoPath: PROTO_PATH }),
    expectedMessage
  )
}

assertFamilyRejects(
  doc,
  ['tactic_type_stay_motionless', 'tactic_type_ground_pursuit'],
  /character_skill\.enumeration_match.*unavailable in this graph family/
)
assertFamilyRejects(
  statusDoc,
  ['pre_aiming_end_reason_completed', 'pre_aiming_end_reason_cancelled'],
  /creation_status\.enumeration_match.*unavailable in this graph family/
)
assertFamilyRejects(
  statusDoc,
  [
    'type_conversion_same_floating_point_to_integer',
    'type_conversion_same_integer_to_boolean'
  ],
  /creation_status\.enumeration_match.*not selectable in this node/
)

fs.writeFileSync(STATUS_OUT_FILE, irToGia(statusDoc, { protoPath: PROTO_PATH }))
const statusDecoded = decode_gia_file(STATUS_OUT_FILE, undefined, true)
const statusNodes = statusDecoded.graph.graph?.inner.graph?.nodes ?? []

type PinExpect = {
  index: number
  ioc: number
  innerSet: boolean
  /** 字面量引脚的 bEnum 载荷 */
  enumVal?: number
}

const matchNodes = nodes.filter((node) => Number(node.genericId?.nodeId) === 200005)
assert.strictEqual(
  matchNodes.length,
  9,
  `expects 9 enumeration_match nodes, got ${matchNodes.length}`
)

function checkMatch(
  label: string,
  nth: number,
  pins: PinExpect[],
  sourceNodes: GraphNode[] = matchNodes
) {
  const node = sourceNodes[nth]
  assert.ok(node, `${label}: node #${nth} missing`)
  assert.strictEqual(Number(node.concreteId?.nodeId), 10, `${label}: concreteId`)
  for (const exp of pins) {
    const pin: NodePin | undefined = (node.pins ?? []).find(
      (candidate) => Number(candidate.i1.kind) === 3 && Number(candidate.i1.index) === exp.index
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
checkMatch('TypeConversionSame (row 34)', 3, [
  { index: 0, ioc: 34, innerSet: true, enumVal: 800 },
  { index: 1, ioc: 34, innerSet: true, enumVal: 802 }
])
checkMatch('TargetType (row 24 of 24/39)', 4, [
  { index: 0, ioc: 24, innerSet: true, enumVal: 2000 },
  { index: 1, ioc: 24, innerSet: true, enumVal: 2001 }
])
checkMatch('TargetTypeForCameraOrientationNode (row 39)', 5, [
  { index: 0, ioc: 39, innerSet: true, enumVal: 2000 },
  { index: 1, ioc: 39, innerSet: true, enumVal: 2001 }
])
checkMatch('UnitStatusAdditionResult failed half (row 14)', 6, [
  { index: 0, ioc: 14, innerSet: true, enumVal: 1500 },
  { index: 1, ioc: 14, innerSet: true, enumVal: 1503 }
])
checkMatch('UnitStatusAdditionResult success half (row 15)', 7, [
  { index: 0, ioc: 15, innerSet: true, enumVal: 1504 },
  { index: 1, ioc: 15, innerSet: true, enumVal: 1505 }
])
checkMatch('PreAimingEndReason (character family row 42)', 8, [
  { index: 0, ioc: 42, innerSet: true, enumVal: 6801 },
  { index: 1, ioc: 42, innerSet: true, enumVal: 6802 }
])

const statusMatchNodes = statusNodes.filter((node) => Number(node.genericId?.nodeId) === 200178)
assert.strictEqual(statusMatchNodes.length, 2)
checkMatch(
  'TypeConversionSame (status row 34 subset)',
  0,
  [
    { index: 0, ioc: 34, innerSet: true, enumVal: 800 },
    { index: 1, ioc: 34, innerSet: true, enumVal: 809 }
  ],
  statusMatchNodes
)
checkMatch(
  'TacticType (status family row 42)',
  1,
  [
    { index: 0, ioc: 42, innerSet: true, enumVal: 6200 },
    { index: 1, ioc: 42, innerSet: true, enumVal: 6205 }
  ],
  statusMatchNodes
)

fs.rmSync(OUT_FILE, { force: true })
fs.rmSync(STATUS_OUT_FILE, { force: true })
console.log('[ok] enumeration_match IOC encoding verified across both client families (11 nodes)')
