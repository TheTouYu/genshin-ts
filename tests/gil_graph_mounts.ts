import assert from 'node:assert/strict'

import {
  attachMountedGraph,
  detachMountedGraph,
  graphCatalog,
  graphExists,
  instanceReferencesDef,
  listDefMounts,
  listEntityMounts,
  mountGraphToDef,
  mountGraphToEntity,
  readMountedGraphs,
  setMountedGraphs
} from '../src/cli/gil_graph_mounts.js'
import { emitWireMessage as emit, parseWireMessage } from '../src/cli/static_assembly/wire.js'
import { buildFile } from '../src/injector/binary.js'
import {
  c1_def_1077936183,
  c1_ent_1077936180,
  c1_inst_1077936187,
  c2_def_1077936183,
  c2_ent_1077936180,
  c2_inst_1077936187,
  c3_def_1077936183,
  c4_ent_1077936180
} from './fixtures/mount_records.js'

// 挂载选题（mount-case1/2/3/4）真实编辑器快照同构重放：
// - c1 = 新建元件 + 挂载 1828（def 558B / 实例 585B）
// - c2 = 解除挂载（def 541B / 实例 568B，type3 空槽 08036a00）
// - c3 = 挂载两图 1829+1830（def 575B / 实例 602B）
// - c4 = 场景实体 1077936180（def 1077936176 的实体）从 {1826} 追加 1844（615B）
// 工具输出必须与真实快照记录逐字节一致。

const DEF_SLOT = 7 // root4 元件定义槽字段
const INST_SLOT = 6 // root8 实例槽字段
const ENT_SLOT = 6 // root5 场景实体槽字段

function recordBytes(hex: string): Uint8Array {
  return Uint8Array.from(Buffer.from(hex, 'hex'))
}

/** 迷你地图：root4 一条 def + root8 一条实例 + root5 一条实体 + root10 一个图容器。 */
function miniMap(
  def: Uint8Array | undefined,
  inst: Uint8Array | undefined,
  ent: Uint8Array | undefined,
  graphs: readonly number[],
  extraInsts: Uint8Array[] = []
): Uint8Array {
  const graphRecords = graphs.map((gid) => {
    const id = emit([
      { number: 1, wire: 0, value: 10000 },
      { number: 2, wire: 0, value: 20000 },
      { number: 3, wire: 0, value: 21001 },
      { number: 5, wire: 0, value: gid }
    ])
    const nodeGraph = emit([
      { number: 1, wire: 2, value: id },
      { number: 2, wire: 2, value: new TextEncoder().encode(`graph-${gid}`) }
    ])
    return { number: 1, wire: 2, value: emit([{ number: 1, wire: 2, value: nodeGraph }]) }
  })
  return buildFile(
    emit([
      ...(def ? [{ number: 4, wire: 2, value: emit([{ number: 1, wire: 2, value: def }]) }] : []),
      ...(inst
        ? [
            {
              number: 8,
              wire: 2,
              value: emit([
                { number: 1, wire: 2, value: inst },
                ...extraInsts.map((record) => ({ number: 1, wire: 2, value: record }))
              ])
            }
          ]
        : []),
      ...(ent ? [{ number: 5, wire: 2, value: emit([{ number: 1, wire: 2, value: ent }]) }] : []),
      { number: 10, wire: 2, value: emit(graphRecords) }
    ]),
    { schema: 1, headTag: 1, fileType: 1, tailTag: 1 }
  )
}

function hexOf(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('hex')
}

// ---- 真实同构重放：attach/detach 必须逐字节等于编辑器快照 ----

// c2（空槽）→ attach 1828 → 必须等于 c1（558B）
{
  assert.equal(readMountedGraphs(recordBytes(c2_def_1077936183), DEF_SLOT).length, 0)
  const mutated = setMountedGraphs(recordBytes(c2_def_1077936183), DEF_SLOT, [1073741828])
  assert.equal(hexOf(mutated), c1_def_1077936183)
}

// c2 实例 → attach 1828 → 必须等于 c1 实例（585B）
{
  const mutated = setMountedGraphs(recordBytes(c2_inst_1077936187), INST_SLOT, [1073741828])
  assert.equal(hexOf(mutated), c1_inst_1077936187)
}

// c2 def → 一次挂两图 [1073741829, 1073741830] → 必须等于 c3 def（575B，f13 两条）
{
  const mutated = setMountedGraphs(recordBytes(c2_def_1077936183), DEF_SLOT, [1073741829, 1073741830])
  assert.equal(hexOf(mutated), c3_def_1077936183)
  assert.deepEqual(readMountedGraphs(mutated, DEF_SLOT), [1073741829, 1073741830])
}

// c1 def → detach 1828 → 必须等于 c2 def（541B 空槽）
{
  const mutated = setMountedGraphs(recordBytes(c1_def_1077936183), DEF_SLOT, [])
  assert.equal(hexOf(mutated), c2_def_1077936183)
  assert.deepEqual(readMountedGraphs(mutated, DEF_SLOT), [])
}

// c1 实例 → detach 1828 → 必须等于 c2 实例
{
  const mutated = setMountedGraphs(recordBytes(c1_inst_1077936187), INST_SLOT, [])
  assert.equal(hexOf(mutated), c2_inst_1077936187)
}

// c3 def → detach 1830 → 只剩 [1829]（单图形态，GID=1829）
{
  const mutated = setMountedGraphs(recordBytes(c3_def_1077936183), DEF_SLOT, [1073741829])
  assert.deepEqual(readMountedGraphs(mutated, DEF_SLOT), [1073741829])
  assert.equal(hexOf(mutated).length / 2, 558) // 单图 = 558B（同 c1 结构）
}

// c4 场景实体：before 实体（598B, {1826}）→ attach 1844 → 必须等于 c4 实体（615B）
{
  const mutated = setMountedGraphs(recordBytes(c2_ent_1077936180), ENT_SLOT, [1073741826, 1073741844])
  assert.equal(hexOf(mutated), c4_ent_1077936180)
  assert.deepEqual(readMountedGraphs(mutated, ENT_SLOT), [1073741826, 1073741844])
}

// c4 场景实体 → detach 1844 → 回到 {1826}（c4 before 实体形态）
{
  const mutated = setMountedGraphs(recordBytes(c4_ent_1077936180), ENT_SLOT, [1073741826])
  assert.equal(hexOf(mutated), c2_ent_1077936180)
}

// ---- 盘点：graphCatalog / listDefMounts / listEntityMounts ----

{
  const map = miniMap(
    recordBytes(c1_def_1077936183),
    recordBytes(c1_inst_1077936187),
    recordBytes(c4_ent_1077936180),
    [1073741826, 1073741844, 1073741828]
  )
  const catalog = graphCatalog(map)
  assert.deepEqual(
    catalog.map((g) => g.id),
    [1073741826, 1073741844, 1073741828]
  )
  assert.equal(catalog[0].name, 'graph-1073741826')
  assert.deepEqual(listDefMounts(map), [{ id: 1077936183, graphs: [1073741828] }])
  assert.deepEqual(listEntityMounts(map), [{ id: 1077936180, graphs: [1073741826, 1073741844] }])
}

// ---- 幂等 ----

{
  const base = recordBytes(c1_def_1077936183)
  const again = setMountedGraphs(base, DEF_SLOT, [1073741828])
  assert.equal(hexOf(again), hexOf(base))
  const detachTwice = setMountedGraphs(recordBytes(c2_def_1077936183), DEF_SLOT, [])
  assert.equal(hexOf(detachTwice), c2_def_1077936183)
}

// ---- attach/detach 整文件路径（含 root 定位） ----

{
  const map = miniMap(recordBytes(c2_def_1077936183), recordBytes(c2_inst_1077936187), undefined, [1073741828])
  const attached = mountGraphToDef(map, 1077936183, 1073741828, true)
  assert.equal(hexOf(attached).length > hexOf(map).length, true)
}

// ---- graphExists / instanceReferencesDef ----

{
  const map = miniMap(recordBytes(c2_def_1077936183), recordBytes(c2_inst_1077936187), undefined, [1073741828, 1073741844])
  assert.equal(graphExists(map, 1073741828), true)
  assert.equal(graphExists(map, 1073741844), true)
  assert.equal(graphExists(map, 9999), false)
  assert.equal(instanceReferencesDef(recordBytes(c2_inst_1077936187), 1077936183), true)
  assert.equal(instanceReferencesDef(recordBytes(c2_inst_1077936187), 1077936182), false)
}

// ---- def 挂载双写 root4 + root8 ----

{
  const map = miniMap(recordBytes(c2_def_1077936183), recordBytes(c2_inst_1077936187), undefined, [1073741828])
  const attached = mountGraphToDef(map, 1077936183, 1073741828, true)
  // 回读 root4 def 记录 = c1 def；root8 实例记录 = c1 实例
  const root = parseWireMessage(attached.slice(20, -4))!
  const fields = root
  const defRecord = fields
    .filter((f) => f.number === 4 && f.wire === 2)
    .flatMap((f) => parseWireMessage(f.value as Uint8Array) ?? [])
    .find((f) => f.number === 1 && f.wire === 2)!
  const instRecord = fields
    .filter((f) => f.number === 8 && f.wire === 2)
    .flatMap((f) => parseWireMessage(f.value as Uint8Array) ?? [])
    .find((f) => f.number === 1 && f.wire === 2)!
  assert.equal(hexOf(defRecord.value as Uint8Array), c1_def_1077936183)
  assert.equal(hexOf(instRecord.value as Uint8Array), c1_inst_1077936187)
  // detach 回 c2
  const detached = mountGraphToDef(attached, 1077936183, 1073741828, false)
  const root2 = parseWireMessage(detached.slice(20, -4))!
  const defRecord2 = root2
    .filter((f) => f.number === 4 && f.wire === 2)
    .flatMap((f) => parseWireMessage(f.value as Uint8Array) ?? [])
    .find((f) => f.number === 1 && f.wire === 2)!
  const instRecord2 = root2
    .filter((f) => f.number === 8 && f.wire === 2)
    .flatMap((f) => parseWireMessage(f.value as Uint8Array) ?? [])
    .find((f) => f.number === 1 && f.wire === 2)!
  assert.equal(hexOf(defRecord2.value as Uint8Array), c2_def_1077936183)
  assert.equal(hexOf(instRecord2.value as Uint8Array), c2_inst_1077936187)
}

// ---- 场景实体整文件路径 ----

{
  const map = miniMap(undefined, undefined, recordBytes(c2_ent_1077936180), [1844])
  const attached = mountGraphToEntity(map, 1077936180, 1073741844, true)
  const root = parseWireMessage(attached.slice(20, -4))!
  const entRecord = root
    .filter((f) => f.number === 5 && f.wire === 2)
    .flatMap((f) => parseWireMessage(f.value as Uint8Array) ?? [])
    .find((f) => f.number === 1 && f.wire === 2)!
  assert.equal(hexOf(entRecord.value as Uint8Array), c4_ent_1077936180)
  const detached = mountGraphToEntity(attached, 1077936180, 1073741844, false)
  const root2 = parseWireMessage(detached.slice(20, -4))!
  const entRecord2 = root2
    .filter((f) => f.number === 5 && f.wire === 2)
    .flatMap((f) => parseWireMessage(f.value as Uint8Array) ?? [])
    .find((f) => f.number === 1 && f.wire === 2)!
  assert.equal(hexOf(entRecord2.value as Uint8Array), c2_ent_1077936180)
}

// ---- def 多实例同步：root8 同一 def 的多条实例记录应全部双写 ----

{
  // 第二条实例 = c2_inst 的字节副本（同 def 1077936183，不同实例 ID 不影响匹配）
  const map = miniMap(
    recordBytes(c2_def_1077936183),
    recordBytes(c2_inst_1077936187),
    undefined,
    [1073741828],
    [recordBytes(c2_inst_1077936187)]
  )
  const attached = mountGraphToDef(map, 1077936183, 1073741828, true)
  const root = parseWireMessage(attached.slice(20, -4))!
  const insts = root
    .filter((f) => f.number === 8 && f.wire === 2)
    .flatMap((f) => parseWireMessage(f.value as Uint8Array) ?? [])
    .filter((f) => f.number === 1 && f.wire === 2)
    .map((f) => f.value as Uint8Array)
  assert.equal(insts.length, 2)
  // 两条实例都已挂上 1828（= c1 实例形态），且顺序保持
  assert.equal(hexOf(insts[0]), c1_inst_1077936187)
  assert.equal(hexOf(insts[1]), c1_inst_1077936187)
  const detached = mountGraphToDef(attached, 1077936183, 1073741828, false)
  const root2 = parseWireMessage(detached.slice(20, -4))!
  const insts2 = root2
    .filter((f) => f.number === 8 && f.wire === 2)
    .flatMap((f) => parseWireMessage(f.value as Uint8Array) ?? [])
    .filter((f) => f.number === 1 && f.wire === 2)
    .map((f) => f.value as Uint8Array)
  assert.equal(hexOf(insts2[0]), c2_inst_1077936187)
  assert.equal(hexOf(insts2[1]), c2_inst_1077936187)
}

// ---- def 无实例：root8 无引用记录时只写 root4，不报错 ----

{
  const map = miniMap(recordBytes(c2_def_1077936183), undefined, undefined, [1073741828])
  const attached = mountGraphToDef(map, 1077936183, 1073741828, true)
  const root = parseWireMessage(attached.slice(20, -4))!
  const defRecord = root
    .filter((f) => f.number === 4 && f.wire === 2)
    .flatMap((f) => parseWireMessage(f.value as Uint8Array) ?? [])
    .find((f) => f.number === 1 && f.wire === 2)!
  assert.equal(hexOf(defRecord.value as Uint8Array), c1_def_1077936183)
  // 不存在 def 时应报错
  assert.throws(
    () => mountGraphToDef(map, 1077936182, 1073741828, true),
    /not found in root 4/
  )
}

// ---- 空槽与无槽防御 ----

{
  const empty = setMountedGraphs(recordBytes(c2_def_1077936183), DEF_SLOT, [])
  // 空槽形态：type3 槽 = {1:3, 13:空}（08036a00）
  assert.equal(hexOf(empty).includes('08036a00'), true)
  // 无 type3 槽的记录应报错
  const bare = emit([{ number: 1, wire: 0, value: 1 }, { number: 2, wire: 0, value: 2 }])
  assert.throws(() => setMountedGraphs(bare, 7, [1073741828]), /no type 3/)
}

console.log('PASS mount record isomorphism (def/inst/entity attach+detach)')
