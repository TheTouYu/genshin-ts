import assert from 'node:assert/strict'
import fs from 'node:fs'

import { buildFile } from '../src/injector/binary.js'
import { emitWireMessage as emit, parseWireMessage as parse, type WireField } from '../src/cli/static_assembly/wire.js'
import {
  listFactionAssignments,
  readFaction,
  readFactionTable,
  readFactionValue,
  writeFaction,
  writeFactionValue
} from '../src/cli/gil_factions.js'

/**
 * 阵营（阵营槽 + 关卡阵营表）读写回归（2026-10-24，地图 1073741827 相邻快照 v0→v4）。
 *
 * 判据不是「回读自洽」，而是**与编辑器产物逐字节相等**：下面这些十六进制取自用户编辑器真实产出
 * （.scratch/editor-incremental-evidence/2026-10-24-fb-diff-1725 的 v0..v4 快照）：
 *   · 默认阵营（f16 空 message）   = `0806820100`            （5 B）
 *   · 阵营 1 / 2 / 3               = `08068201020801` / `…02` / `…03`（7 B）
 *   · 关卡阵营表（root11.f2 载荷）  = TABLE_HEX（3 个阵营，含名字/图标/玩家列表/敌对候选）
 *
 * 若本机保留着实验快照，额外跑一遍**整记录字节相等**的差分回归（v0↔v1↔v2 可逆、v2→v3 定义页、v3→v4 实体）：
 * 快照缺失时跳过（不伪造证据）。
 */

const SLOT_DEFAULT = '0806820100'
const SLOT_1 = '08068201020801'
const SLOT_2 = '08068201020802'
const SLOT_3 = '08068201020803'

const TABLE_HEX =
  '0a400a12e5889de5a78be78ea9e5aeb6e998b5e890a510011a1755495f4d61726b506c617965725f4661' +
  '6374696f6e5f30220801020304050607085a01006a0202030a360a12e5889de5a78be789a9e4bbb6e998b5' +
  'e890a510021a1755495f4d61726b506c617965725f46616374696f6e5f315a01016a0201030a360a12e588' +
  '9de5a78be980a0e789a9e998b5e890a510031a1755495f4d61726b506c617965725f46616374696f6e5f32' +
  '5a01026a020102'

const ENTITY_ID = 1082130442
const DEF_ID = 1082130434
const INSTANCE_ID = 1082130437

const hex = (text: string): Uint8Array => new Uint8Array(Buffer.from(text, 'hex'))
const toHex = (bytes: Uint8Array): string => Buffer.from(bytes).toString('hex')

/** 造一条带阵营槽的记录（其余字段按编辑器形态最小化：id + 定义引用 + f6 阵营槽）。 */
function recordWithSlot(id: number, defId: number, slotHex: string): Uint8Array {
  return emit([
    { number: 1, wire: 0, value: id },
    { number: 2, wire: 2, value: emit([{ number: 1, wire: 0, value: defId }]) },
    { number: 6, wire: 2, value: hex(slotHex) }
  ])
}

function rootSection(rootNo: number, records: readonly Uint8Array[]): WireField {
  return sectionFromFields(
    rootNo,
    records.map((r) => ({ number: 1, wire: 2, value: r }))
  )
}

function sectionFromFields(rootNo: number, fields: readonly WireField[]): WireField {
  return { number: rootNo, wire: 2, value: emit(fields) }
}

function buildMap(parts: {
  entity?: Uint8Array
  instance?: Uint8Array
  def?: Uint8Array
  table?: string
}): Uint8Array {
  const roots: WireField[] = []
  if (parts.def) roots.push(rootSection(4, [parts.def]))
  if (parts.entity) roots.push(rootSection(5, [parts.entity]))
  if (parts.instance) roots.push(rootSection(8, [parts.instance]))
  roots.push(sectionFromFields(11, [{ number: 2, wire: 2, value: hex(parts.table ?? TABLE_HEX) }]))
  return buildFile(emit(roots), { schema: 1, headTag: 0, fileType: 0, tailTag: 0 })
}

// ---- 1. 槽值读取：四份编辑器字节 → 0/1/2/3 ----
for (const [slotHex, expected] of [
  [SLOT_DEFAULT, 0],
  [SLOT_1, 1],
  [SLOT_2, 2],
  [SLOT_3, 3]
] as const) {
  const record = recordWithSlot(ENTITY_ID, DEF_ID, slotHex)
  assert.equal(readFactionValue(record), expected, `槽 ${slotHex} 应读成 ${expected}`)
}

// ---- 2. 槽写入：结果必须与编辑器产出的槽字节逐字节相等 ----
for (const [value, slotHex] of [
  [0, SLOT_DEFAULT],
  [1, SLOT_1],
  [2, SLOT_2],
  [3, SLOT_3]
] as const) {
  const record = recordWithSlot(ENTITY_ID, DEF_ID, value === 0 ? SLOT_2 : SLOT_DEFAULT)
  const written = writeFactionValue(record, value)
  const slot = parse(written)!.find((f) => f.number === 6 && f.wire === 2)!
  assert.equal(toHex(slot.value as Uint8Array), slotHex, `写 ${value} 应产出 ${slotHex}`)
  assert.equal(readFactionValue(written), value)
}

// ---- 3. 可逆：写 2 再写回 1 == 原始记录字节 ----
{
  const original = recordWithSlot(ENTITY_ID, DEF_ID, SLOT_1)
  const once = writeFactionValue(original, 2)
  const back = writeFactionValue(once, 1)
  assert.equal(toHex(back), toHex(original), '阵营 1→2→1 必须逐字节还原')
}

// ---- 4. 关卡阵营表：真实编辑器字节 → 3 条阵营 ----
{
  const map = buildMap({})
  const table = readFactionTable(map)
  assert.equal(table.length, 3)
  assert.deepEqual(
    table.map((f) => [f.id, f.name, f.icon]),
    [
      [1, '初始玩家阵营', 'UI_MarkPlayer_Faction_0'],
      [2, '初始物件阵营', 'UI_MarkPlayer_Faction_1'],
      [3, '初始造物阵营', 'UI_MarkPlayer_Faction_2']
    ]
  )
  assert.deepEqual(table[0].players, [1, 2, 3, 4, 5, 6, 7, 8], '包含的玩家 = 1..8')
  assert.deepEqual(
    table.map((f) => f.hostileTo),
    [
      [2, 3],
      [1, 3],
      [1, 2]
    ],
    '敌对候选列表（单向）'
  )
  assert.deepEqual(
    table.map((f) => f.defaultObjectType),
    [0, 1, 2],
    '默认阵营对象候选：玩家/物件/造物'
  )
}

// ---- 5. 整文件写入 + 分层定位（entity / instance） ----
{
  const map = buildMap({
    entity: recordWithSlot(ENTITY_ID, DEF_ID, SLOT_DEFAULT),
    instance: recordWithSlot(INSTANCE_ID, DEF_ID, SLOT_DEFAULT)
  })
  const entityWrite = writeFaction(map, { targetId: ENTITY_ID, faction: 3 })
  assert.equal(entityWrite.layer, 'entity')
  assert.equal(entityWrite.previous, 0)
  assert.equal(readFaction(entityWrite.bytes, { targetId: ENTITY_ID }).faction, 3)
  assert.equal(readFaction(entityWrite.bytes, { targetId: INSTANCE_ID }).faction, 0, '不应波及页面实例')

  const instanceWrite = writeFaction(map, { targetId: INSTANCE_ID, faction: 2 })
  assert.equal(instanceWrite.layer, 'instance')
  assert.equal(readFaction(instanceWrite.bytes, { targetId: INSTANCE_ID }).faction, 2)

  // 未知阵营 id → fail closed
  assert.throws(() => writeFaction(map, { targetId: ENTITY_ID, faction: 9 }), /不在关卡阵营表/)

  // 全量盘点
  const assignments = listFactionAssignments(entityWrite.bytes)
  assert.equal(assignments.length, 2)
  assert.deepEqual(
    assignments.map((a) => [a.layer, a.recordId, a.faction]),
    [
      ['entity', ENTITY_ID, 3],
      ['instance', INSTANCE_ID, 0]
    ]
  )
}

// ---- 5b. id 段重叠闸门：同号既是 root4 定义、又出现在 root8 时必须显式 --layer ----
{
  // 真实地图实测形态：root8 记录 1082130434（打手丘丘人页面实例）与 root4 水史莱姆定义同号
  const defRecord = emit([
    { number: 1, wire: 0, value: INSTANCE_ID },
    { number: 2, wire: 0, value: 30007006 }
  ])
  const map = buildMap({
    def: defRecord,
    instance: recordWithSlot(INSTANCE_ID, DEF_ID, SLOT_DEFAULT)
  })
  assert.throws(
    () => readFaction(map, { targetId: INSTANCE_ID }),
    /同时是 root4 元件定义/,
    '同号歧义必须 fail closed，不能静默返回另一个对象'
  )
  assert.throws(() => writeFaction(map, { targetId: INSTANCE_ID, faction: 2 }), /同时是 root4 元件定义/)
  // 显式指定层后放行
  assert.equal(readFaction(map, { targetId: INSTANCE_ID, layer: 'instance' }).layer, 'instance')
  assert.equal(writeFaction(map, { targetId: INSTANCE_ID, faction: 2, layer: 'instance' }).layer, 'instance')
}

// ---- 6. 本机有实验快照时：整记录字节与编辑器产物相等 ----
{
  const dir = '.scratch/editor-incremental-evidence/2026-10-24-fb-diff-1725'
  // v0 = 改前基线（差分工具锁定在 before/），v1..v4 = 四次保存快照
  const snaps = [
    'before/1073741827.gil',
    'raw/slime-faction-v1.gil',
    'slime-faction-v2.gil',
    'slime-def-faction-3.gil',
    'slime-v4.gil'
  ]
  const present = snaps.every((f) => fs.existsSync(`${dir}/${f}`))
  if (!present) {
    console.log('SKIP 整记录字节回归（本机无 2026-10-24 阵营实验快照）')
  } else {
    const load = (f: string) => new Uint8Array(fs.readFileSync(`${dir}/${f}`))
    const [v0, v1, v2, v3, v4] = snaps.map(load)
    const recordOf = (bytes: Uint8Array, rootNo: number, id: number): string => {
      const top = parse(bytes.slice(20, -4))!
      const section = top.find((f) => f.number === rootNo && f.wire === 2)!
      const records = (parse(section.value as Uint8Array) ?? []).filter((f) => f.number === 1 && f.wire === 2)
      const hit = records.find((f) => (parse((f.value as Uint8Array)) ?? [])[0]?.value === id)!
      return toHex(hit.value as Uint8Array)
    }
    // 实体 v0(1) → v1(2) → v2(1)
    assert.equal(recordOf(writeFaction(v0, { targetId: ENTITY_ID, faction: 2 }).bytes, 5, ENTITY_ID), recordOf(v1, 5, ENTITY_ID), 'v0 → 阵营 2 应等于编辑器 v1 记录')
    assert.equal(recordOf(writeFaction(v1, { targetId: ENTITY_ID, faction: 1 }).bytes, 5, ENTITY_ID), recordOf(v0, 5, ENTITY_ID), 'v1 → 阵营 1 应等于编辑器 v0 记录')
    // 定义页页面实例 v2(空) → 3 等于编辑器 v3
    assert.equal(
      recordOf(writeFaction(v2, { targetId: INSTANCE_ID, faction: 3 }).bytes, 8, INSTANCE_ID),
      recordOf(v3, 8, INSTANCE_ID),
      'v2 → 页面实例阵营 3 应等于编辑器 v3 记录'
    )
    // 实体 v3(1) → 0 等于编辑器 v4
    assert.equal(
      recordOf(writeFaction(v3, { targetId: ENTITY_ID, faction: 0 }).bytes, 5, ENTITY_ID),
      recordOf(v4, 5, ENTITY_ID),
      'v3 → 实体阵营默认应等于编辑器 v4 记录'
    )
    console.log('PASS 整记录字节回归 4/4（与编辑器产物逐字节相等）')
  }
}

console.log('PASS gil_factions 回归全部通过')
