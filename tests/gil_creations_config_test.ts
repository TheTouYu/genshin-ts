import assert from 'node:assert/strict'

import { buildFile } from '../src/injector/binary.js'
import { emitWireMessage as emit, parseWireMessage as parse } from '../src/cli/static_assembly/wire.js'
import {
  CREATION_SLOT_DECISION,
  CREATION_SLOT_SKILLS,
  readCreationConfig,
  updateCreationConfig
} from '../src/cli/gil_creations.js'

/**
 * 造物配置读写回归（2026-10-23，地图 1073741827 相邻快照差分 v8→v10）。
 *
 * 判据不是「回读自洽」，而是**与编辑器产物逐字节相等**：
 *   · 空技能槽 + 编辑器默认 CD      = `08518205090a0712050d0000803f`
 *   · 加一条技能（绑配置 + CD0 + 忽略公共冷却）= `0851820529…6208 e68a80e883bd5f 31 1205 0d0000803f`
 *   · 决策图槽未绑                  = `0850fa04090a070801a81fa79c01`
 *   · 决策图槽绑 1082130435         = `0850fa040f0a0d0801108380808404a81fa79c01`
 * 字节来源：用户编辑器真实产出（快照 v8/v10 的 root5 实体 1082130435/1082130436）。
 */

const ENTITY_ID = 1082130435
const DEF_ID = 1082130433
const BASE_RES = 30007001
const SKILL_CONFIG_ID = 1191182337
const DECISION_GRAPH_ID = 1082130435

const SLOT_DECISION_EMPTY = '0850fa04090a070801a81fa79c01'
const SLOT_DECISION_BOUND = '0850fa040f0a0d0801108380808404a81fa79c01'
const SLOT_SKILLS_EMPTY = '08518205090a0712050d0000803f'
const SLOT_SKILLS_CONFIGURED =
  '08518205290a270a1e08011208080110818080b8041a063001380140016208e68a80e883bd5f3112050d0000803f'

const hex = (text: string): Uint8Array => new Uint8Array(Buffer.from(text, 'hex'))
const toHex = (bytes: Uint8Array): string => Buffer.from(bytes).toString('hex')

function buildMap(): Uint8Array {
  const record = emit([
    { number: 1, wire: 0, value: ENTITY_ID },
    { number: 2, wire: 2, value: emit([{ number: 1, wire: 0, value: DEF_ID }]) },
    { number: 5, wire: 2, value: hex(SLOT_DECISION_EMPTY) },
    { number: 5, wire: 2, value: hex(SLOT_SKILLS_EMPTY) },
    { number: 8, wire: 0, value: BASE_RES }
  ])
  const root5 = emit([{ number: 1, wire: 2, value: record }])
  const payload = emit([{ number: 5, wire: 2, value: root5 }])
  return buildFile(payload, { schema: 1, headTag: 1, fileType: 1, tailTag: 1 })
}

/** 从结果文件里取出目标实体的某个槽载荷原始字节。 */
function slotBytes(mapBytes: Uint8Array, code: number): string {
  const top = parse(mapBytes.slice(20, -4))
  const section = top?.find((f) => f.number === 5 && f.wire === 2)
  assert.ok(section, 'root5 section 缺失')
  for (const field of parse(section.value as Uint8Array) ?? []) {
    if (field.number !== 1 || field.wire !== 2) continue
    const record = parse(field.value as Uint8Array)
    if (!record) continue
    const id = record.find((f) => f.number === 1 && f.wire === 0)?.value
    if (id !== ENTITY_ID) continue
    for (const slot of record) {
      if (slot.number !== 5 || slot.wire !== 2) continue
      const fields = parse(slot.value as Uint8Array) ?? []
      const codeField = fields.find((f) => f.number === 1 && f.wire === 0)?.value
      if (codeField === code) return toHex(slot.value as Uint8Array)
    }
  }
  throw new Error(`slot ${code} not found`)
}

// ① 读侧：未配置的造物实体
const base = buildMap()
const view = readCreationConfig(base, { targetId: ENTITY_ID })
assert.equal(view.layer, 'entity')
assert.equal(view.base, BASE_RES, '实体基板应取记录尾 f8')
assert.equal(view.publicCooldown, 1, '公共冷却应解出 1.0')
assert.equal(view.decisionGraphId, undefined, '未绑定时不应有决策图')
assert.equal(view.decisionTypeMark, 20007, '决策图槽的类型标记应为 20007')
assert.equal(view.skills.length, 0, '未配置时技能条目应为 0')
console.log('[ok] readCreationConfig：未配置态（决策图空 / 技能 0 条 / 公共冷却 1）')

// ② 写侧：新增技能条目（绑配置 + CD 0 + 忽略公共冷却）→ 必须与编辑器字节相等
const added = updateCreationConfig(base, {
  targetId: ENTITY_ID,
  update: {
    kind: 'add-skill',
    name: '技能_1',
    configId: SKILL_CONFIG_ID,
    cdSeconds: 0,
    ignorePublicCd: true
  }
})
assert.equal(
  slotBytes(added.bytes, CREATION_SLOT_SKILLS),
  SLOT_SKILLS_CONFIGURED,
  '新增技能槽字节应与编辑器产物一致'
)
const afterAdd = readCreationConfig(added.bytes, { targetId: ENTITY_ID })
assert.equal(afterAdd.skills.length, 1)
assert.equal(afterAdd.skills[0].configId, SKILL_CONFIG_ID)
assert.deepEqual(afterAdd.skills[0].cd, [], 'CD 0 s 时四个 f32 应整组缺省')
assert.equal(afterAdd.skills[0].ignorePublicCd, true)
console.log('[ok] skill add：槽字节 = 编辑器产物（46 B 逐字节相等）')

// ③ 写侧：先加未绑定条目、再绑定 → 同样必须字节相等（两步路径）
const unbound = updateCreationConfig(base, {
  targetId: ENTITY_ID,
  update: { kind: 'add-skill', name: '技能_1' }
})
assert.equal(
  readCreationConfig(unbound.bytes, { targetId: ENTITY_ID }).skills[0].configId,
  undefined,
  '未给 --skill-config 时条目应为未绑定'
)
const bound = updateCreationConfig(unbound.bytes, {
  targetId: ENTITY_ID,
  update: { kind: 'bind-skill', index: 1, configId: SKILL_CONFIG_ID, cdSeconds: 0, ignorePublicCd: true }
})
assert.equal(slotBytes(bound.bytes, CREATION_SLOT_SKILLS), SLOT_SKILLS_CONFIGURED)
console.log('[ok] skill bind：add→bind 两步结果与一步结果字节相等')

// ④ 写侧：绑决策图 → 槽字节与编辑器产物相等
const decided = updateCreationConfig(base, {
  targetId: ENTITY_ID,
  update: { kind: 'bind-decision', graphId: DECISION_GRAPH_ID }
})
assert.equal(slotBytes(decided.bytes, CREATION_SLOT_DECISION), SLOT_DECISION_BOUND)
assert.equal(readCreationConfig(decided.bytes, { targetId: ENTITY_ID }).decisionGraphId, DECISION_GRAPH_ID)
console.log('[ok] decision bind：槽字节 = 编辑器产物（17 B 逐字节相等）')

// ⑤ fail closed：类型标记不是 20007 的决策槽必须拒绝
const wrongMark = emit([
  { number: 1, wire: 0, value: ENTITY_ID },
  { number: 5, wire: 2, value: hex('0850fa04090a070801a81fa79c02') }, // f501 = 20008（错类型）
  { number: 5, wire: 2, value: hex(SLOT_SKILLS_EMPTY) }
])
const wrongRoot5 = emit([{ number: 1, wire: 2, value: wrongMark }])
const wrongMap = buildFile(emit([{ number: 5, wire: 2, value: wrongRoot5 }]), {
  schema: 1,
  headTag: 1,
  fileType: 1,
  tailTag: 1
})
assert.throws(
  () => updateCreationConfig(wrongMap, { targetId: ENTITY_ID, update: { kind: 'bind-decision', graphId: 1 } }),
  /类型标记不是 20007/,
  '非 20007 决策槽应 fail closed'
)
console.log('[ok] 决策槽类型标记校验：非 20007 拒绝')

// ⑥ fail closed：未知 CD 值（字段语义未闭合）拒绝，不猜字节
assert.throws(
  () =>
    updateCreationConfig(base, {
      targetId: ENTITY_ID,
      update: { kind: 'add-skill', name: '技能_x', cdSeconds: 2.5 }
    }),
  /只支持 --cd 0/,
  '非 0 的 CD 值应 fail closed'
)
console.log('[ok] 未知 CD 值 fail closed')

console.log('gil_creations config: ALL PASS')
