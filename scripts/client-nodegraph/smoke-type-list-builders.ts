/**
 * Type list builder smoke: 获取实体类型列表 / 获取射线筛选类型列表 的
 * 隐藏引脚编码（pin0 数量 + pin1..10 枚举槽）。覆盖字面量、零参默认、
 * 连线槽三种形态，IR -> GIA -> decode 后逐引脚断言与语料一致
 * （数量=默认值时 alreadySetVal=false，见 client_graph.ts applyTypeListBuilder）。
 */
import assert from 'node:assert'
import fs from 'node:fs'

import { irToGia } from '../../src/compiler/ir_to_gia_transform/index.js'
import { RayFilterType } from '../../src/definitions/client_enums.js'
import { EntityType, TargetType } from '../../src/definitions/enum.js'
import { buildClientGraphRegistriesIRDocuments, g } from '../../src/runtime/core.js'
import { decode_gia_file } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'

const PROTO_PATH =
  'src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto'
const OUT_FILE = 'tests/client_generated/smoke_type_list_builders.gia'

g.characterSkill({ id: 1082130440, name: 'TypeListBuilders' }).on('start', (_evt, f) => {
  const self = f.getSelfEntity()
  // 字面量 x2：count=2（≠默认1 -> set）、槽1/2 = 1402/1403
  const entityTypes = f.getEntityTypeList([EntityType.Object, EntityType.Player])
  // 零参：全引脚保持编辑器默认（count=1 unset，语料 获取实体类型列表.gia 同形）
  const defaultTypes = f.getEntityTypeList()
  // 混合：槽1 字面量 1401、槽2 连线（语料 获取实体的类型_连线 同形）
  const mixedTypes = f.getEntityTypeList([EntityType.Stage, f.getEntitySType(self)])
  // 射线筛选字面量 x2：count=2（≠默认0 -> set）、槽1/2 = 2601/2602
  const rayFilters = f.getRayFilterTypeList([RayFilterType.Hurtbox, RayFilterType.Scene])
  // 零参：count 保持默认 0 unset（语料 获取射线筛选类型列表.gia 同形）
  const defaultRayFilters = f.getRayFilterTypeList()

  const ray1 = f.getRayDetectionResult(
    self, [0, 0, 0], [0, 0, 1], 10, TargetType.None, entityTypes, rayFilters
  )
  const ray2 = f.getRayDetectionResult(
    self, [0, 0, 0], [0, 0, 1], 10, TargetType.None, defaultTypes, defaultRayFilters
  )
  const ray3 = f.getRayDetectionResult(
    self, [0, 0, 0], [0, 0, 1], 10, TargetType.None, mixedTypes, rayFilters
  )
  f.doubleBranch(
    f.equal(ray1.onHitLocation, [0, 0, 0]),
    () => f.forceExitAimingState(),
    () =>
      f.doubleBranch(
        f.equal(ray2.onHitLocation, [0, 0, 0]),
        () => f.forceExitAimingState(),
        () =>
          f.doubleBranch(
            f.equal(ray3.onHitLocation, [0, 0, 0]),
            () => f.forceExitAimingState(),
            () => f.forceExitAimingState()
          )
      )
  )
})

const doc = buildClientGraphRegistriesIRDocuments().find((d) =>
  d.graph.name?.includes('TypeListBuilders')
)!
const bytes = irToGia(doc, { protoPath: PROTO_PATH })
fs.writeFileSync(OUT_FILE, bytes)
const decoded = decode_gia_file(OUT_FILE, undefined, true)
const nodes = decoded.graph.graph?.inner.graph?.nodes ?? []

type SlotExpect = {
  index: number
  /** bInt（count 槽）或 bEnum（枚举槽）载荷 */
  int?: number
  enum?: number
  set: boolean
  wired?: boolean
}

function checkBuilder(label: string, gid: number, nth: number, slots: SlotExpect[]) {
  const node = nodes.filter((n: any) => Number(n.genericId?.nodeId) === gid)[nth]
  assert.ok(node, `${label}: node gid=${gid}#${nth} missing`)
  assert.strictEqual(Number(node.concreteId?.nodeId), 1031, `${label}: concreteId`)
  for (const exp of slots) {
    const pin = (node.pins ?? []).find(
      (p: any) => Number(p.i1?.kind) === 3 && Number(p.i1?.index) === exp.index
    )
    assert.ok(pin, `${label}: pin k3#${exp.index} missing`)
    const v = pin.value ?? {}
    if (exp.int !== undefined) {
      assert.strictEqual(Number(v.bInt?.val ?? 0), exp.int, `${label}: pin #${exp.index} int`)
    }
    if (exp.enum !== undefined) {
      assert.strictEqual(Number(v.bEnum?.val ?? 0), exp.enum, `${label}: pin #${exp.index} enum`)
    }
    assert.strictEqual(Boolean(v.alreadySetVal), exp.set, `${label}: pin #${exp.index} set`)
    if (exp.wired !== undefined) {
      assert.strictEqual(
        (pin.connects ?? []).length > 0,
        exp.wired,
        `${label}: pin #${exp.index} wired`
      )
    }
  }
  const outPin = (node.pins ?? []).find((p: any) => Number(p.i1?.kind) === 4)
  assert.strictEqual(Number(outPin?.type ?? 0), 17, `${label}: out pin t17`)
  console.log(`[ok] ${label}: ${slots.length} slots verified`)
}

// 实体类型列表（gid 200050，按 IR 声明顺序）
checkBuilder('entity literal x2', 200050, 0, [
  { index: 0, int: 2, set: true },
  { index: 1, enum: 1402, set: true },
  { index: 2, enum: 1403, set: true },
  { index: 3, enum: 0, set: false },
  { index: 10, enum: 0, set: false }
])
checkBuilder('entity default (no args)', 200050, 1, [
  { index: 0, int: 1, set: false },
  { index: 1, enum: 0, set: false },
  { index: 10, enum: 0, set: false }
])
checkBuilder('entity literal + wired', 200050, 2, [
  { index: 0, int: 2, set: true },
  { index: 1, enum: 1401, set: true, wired: false },
  { index: 2, enum: 0, set: false, wired: true },
  { index: 3, enum: 0, set: false, wired: false }
])
// 射线筛选类型列表（gid 200110）
checkBuilder('ray filter literal x2', 200110, 0, [
  { index: 0, int: 2, set: true },
  { index: 1, enum: 2601, set: true },
  { index: 2, enum: 2602, set: true },
  { index: 3, enum: 0, set: false }
])
checkBuilder('ray filter default (no args)', 200110, 1, [
  { index: 0, int: 0, set: false },
  { index: 1, enum: 0, set: false },
  { index: 10, enum: 0, set: false }
])

fs.rmSync(OUT_FILE, { force: true })
console.log('[ok] type list builder encoding verified (entity + ray filter)')
