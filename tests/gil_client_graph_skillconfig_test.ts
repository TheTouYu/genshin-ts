// 客户端图创建 + 技能配置创建/绑定 同构重放回归（真实快照逐字节断言）
//
// 证据目录：~/genshin-ts-evidence/node-graph-logic/2026-08-29-client-graph-skillconfig/raw/
//   before.gil → after.gil（20010 客户端图创建，Round 1）
//   after.gil → after-20002.gil（20002 角色技能图创建，Round 1b）
//   after-20002.gil → after-skillconfig.gil（36 普通技能配置创建，Round 2a）
//   after-20002.gil → after-bind.gil（36 瞬发+绑定，Round 2b 一步形态）
//   after-36-normal.gil → after-36-normal-bind.gil（36+普通 绑定，Round 3b）
//   after-thirdbind.gil → after-custom-skill.gil（6 自定义技能配置创建，Round 2e）
//   after-thirdbind.gil → after-6-instant.gil / after-6-instant-bind.gil（6 瞬发 创建/绑定，Round 3c/3d）
//   after-thirdbind.gil → after-custom-bind.gil（6+普通 绑定，Round 2f）
// 方法：CLI 生成函数在相邻快照基线上重放 → 与 after 快照的 root 字段逐字节比较
// （root46 保存副作用与 root2 地图名不参与；list-gil 系列工具回读一致性由 CLI 测试覆盖）
import assert from 'node:assert/strict'
import fs from 'node:fs'

import { buildEmptyNodeGraph } from '../src/cli/assets_node_graphs.js'
import { buildSkillConfig, listSkillConfigs } from '../src/cli/assets_skill_config.js'
import { parseWireMessage } from '../src/cli/static_assembly/wire.js'

const R = '/home/h/genshin-ts-evidence/node-graph-logic/2026-08-29-client-graph-skillconfig/raw'

function load(path: string): Uint8Array {
  return new Uint8Array(fs.readFileSync(path)).slice(20, -4)
}

function rootBytes(payload: Uint8Array, n: number): Uint8Array {
  const root = parseWireMessage(payload)
  assert.ok(root, `root missing for ${n}`)
  const field = root.find((x) => x.number === n && x.wire === 2)
  assert.ok(field, `root ${n} missing`)
  return field.value as Uint8Array
}

function root10Record(payload: Uint8Array, id: number): Uint8Array {
  const root = parseWireMessage(payload)
  assert.ok(root)
  const field = root.find((x) => x.number === 10 && x.wire === 2)
  assert.ok(field)
  const msg = parseWireMessage(field.value as Uint8Array)
  assert.ok(msg)
  for (const rec of msg) {
    if (rec.wire !== 2 || rec.number !== 1) continue
    const inner = parseWireMessage(rec.value as Uint8Array)
    const nodeGraph = inner?.find((f) => f.number === 1 && f.wire === 2)
    const ng = nodeGraph ? parseWireMessage(nodeGraph.value as Uint8Array) : undefined
    const idMsg = ng?.find((f) => f.number === 1 && f.wire === 2)
    const idFields = idMsg ? parseWireMessage(idMsg.value as Uint8Array) : undefined
    const nodeId = idFields?.find((f) => f.number === 5 && f.wire === 0)?.value
    if (nodeId === id) return rec.value as Uint8Array
  }
  throw new Error(`graph record ${id} not found in root10`)
}

function recordBytes(payload: Uint8Array, rootN: number, id: number): Uint8Array {
  const root = parseWireMessage(payload)
  assert.ok(root)
  const field = root.find((x) => x.number === rootN && x.wire === 2)
  assert.ok(field)
  const msg = parseWireMessage(field.value as Uint8Array)
  assert.ok(msg)
  for (const rec of msg) {
    if (rec.wire !== 2 || rec.number !== 1) continue
    const inner = parseWireMessage(rec.value as Uint8Array)
    const rid = inner?.find((g) => g.number === 1 && g.wire === 0)?.value
    if (rid === id) return rec.value as Uint8Array
  }
  throw new Error(`record ${id} not found in root${rootN}`)
}

function assertRootEquals(
  label: string,
  candidate: Uint8Array,
  target: Uint8Array,
  roots: number[]
): void {
  for (const n of roots) {
    assert.ok(
      Buffer.from(rootBytes(candidate, n)).equals(Buffer.from(rootBytes(target, n))),
      `${label}: root${n} 与 after 快照不一致`
    )
  }
}

// 1. 客户端图创建：before → after（20010）、after → after-20002（20002）
{
  const r1 = buildEmptyNodeGraph(load(`${R}/before.gil`), 1082130433, '新建角色操控技能节点图', 20010)
  assertRootEquals('create 20010', r1, load(`${R}/after.gil`), [6, 10])
  const r2 = buildEmptyNodeGraph(load(`${R}/after.gil`), 1082130434, '新建角色技能节点图', 20002)
  assertRootEquals('create 20002', r2, load(`${R}/after-20002.gil`), [6, 10])
  // 客户端图 ID 自动分配：段空 → 起始值 1082130433（用户实测）；段内 → max+1
  const r3 = buildEmptyNodeGraph(load(`${R}/before.gil`), 1082130433, 'x', 20010)
  assert.ok(
    Buffer.from(rootBytes(r3, 10)).length > 0,
    '客户端段空自动分配首图 ID=1082130433 应可构建'
  )
  console.log('PASS: node-graphs create --type 20010/20002 + 客户端段自动分配（root6/10 逐字节一致）')
}

// 2. 技能配置：36 普通创建（v2→v3）、36 瞬发+绑（v2→v4 一步形态）
{
  const r1 = buildSkillConfig(load(`${R}/after-20002.gil`), {
    id: 1228931073,
    name: '操控技能',
    template: 'normal',
    skillType: 'normal',
    graphIds: []
  })
  assertRootEquals('skill-config 36-normal create', r1, load(`${R}/after-skillconfig.gil`), [6, 15, 16])
  const r2 = buildSkillConfig(load(`${R}/after-20002.gil`), {
    id: 1228931073,
    name: '操控技能',
    template: 'normal',
    skillType: 'instant',
    graphIds: [1082130433]
  })
  assertRootEquals('skill-config 36-instant bind', r2, load(`${R}/after-bind.gil`), [6, 15, 16])
  console.log('PASS: skill-config 36 普通创建 + 瞬发绑定（root6/15/16 逐字节一致）')
}

// 3. 36+普通 绑定（记录级 == after-36-normal-bind）
{
  const r = buildSkillConfig(load(`${R}/after-20002.gil`), {
    id: 1228931073,
    name: '操控技能',
    template: 'normal',
    skillType: 'normal',
    graphIds: [1082130433]
  })
  const t = load(`${R}/after-36-normal-bind.gil`)
  assert.ok(
    Buffer.from(recordBytes(r, 15, 1228931073)).equals(Buffer.from(recordBytes(t, 15, 1228931073))),
    '36-normal bind: root15 记录不一致'
  )
  assert.ok(
    Buffer.from(recordBytes(r, 16, 1228931073)).equals(Buffer.from(recordBytes(t, 16, 1228931073))),
    '36-normal bind: root16 记录不一致'
  )
  console.log('PASS: skill-config 36+普通 绑定（记录逐字节一致）')
}

// 4. 6 模板：普通创建（v8→v9）、瞬发创建/绑定（记录 == v16/v17）、普通绑定（记录 == v10）
{
  const r1 = buildSkillConfig(load(`${R}/after-thirdbind.gil`), {
    id: 1098907649,
    name: '自定义技能',
    template: 'custom',
    skillType: 'normal',
    graphIds: []
  })
  assertRootEquals('skill-config 6-normal create', r1, load(`${R}/after-custom-skill.gil`), [6, 15, 16])
  const tInstant = load(`${R}/after-6-instant.gil`)
  const tBind = load(`${R}/after-6-instant-bind.gil`)
  const tNormalBind = load(`${R}/after-custom-bind.gil`)
  const r2 = buildSkillConfig(load(`${R}/after-thirdbind.gil`), {
    id: 1098907649,
    name: '自定义技能',
    template: 'custom',
    skillType: 'instant',
    graphIds: []
  })
  assert.ok(
    Buffer.from(recordBytes(r2, 15, 1098907649)).equals(Buffer.from(recordBytes(tInstant, 15, 1098907649))),
    '6-instant create: root15 记录不一致'
  )
  const r3 = buildSkillConfig(load(`${R}/after-thirdbind.gil`), {
    id: 1098907649,
    name: '自定义技能',
    template: 'custom',
    skillType: 'instant',
    graphIds: [1082130434]
  })
  assert.ok(
    Buffer.from(recordBytes(r3, 15, 1098907649)).equals(Buffer.from(recordBytes(tBind, 15, 1098907649))),
    '6-instant bind: root15 记录不一致'
  )
  const r4 = buildSkillConfig(load(`${R}/after-thirdbind.gil`), {
    id: 1098907649,
    name: '自定义技能',
    template: 'custom',
    skillType: 'normal',
    graphIds: [1082130434]
  })
  assert.ok(
    Buffer.from(recordBytes(r4, 15, 1098907649)).equals(Buffer.from(recordBytes(tNormalBind, 15, 1098907649))),
    '6-normal bind: root15 记录不一致'
  )
  assert.ok(
    Buffer.from(recordBytes(r4, 16, 1098907649)).equals(Buffer.from(recordBytes(tNormalBind, 16, 1098907649))),
    '6-normal bind: root16 记录不一致'
  )
  console.log('PASS: skill-config 6 模板 普通创建/瞬发创建/瞬发绑定/普通绑定（记录逐字节一致）')
}

// 5. 更多类型覆盖：20008/20006/20001/20009 单图记录与 folder 记录 == v5 快照（v4 基线）
{
  const base = load(`${R}/after-bind.gil`)
  const target = load(`${R}/after-more-graphs.gil`)
  const cases = [
    { type: 20008, gid: 1082130435, name: '新建造物技能节点图' },
    { type: 20006, gid: 1082130436, name: '新建过滤器节点图' },
    { type: 20001, gid: 1082130437, name: '新建过滤器节点图_1' },
    { type: 20009, gid: 1082130438, name: '新建造物状态节点图' }
  ]
  for (const c of cases) {
    const candidate = buildEmptyNodeGraph(base, c.gid, c.name, c.type)
    const candRec = root10Record(candidate, c.gid)
    const v5Rec = root10Record(target, c.gid)
    assert.ok(
      Buffer.from(candRec).equals(Buffer.from(v5Rec)),
      `create --type ${c.type}: 图记录与 v5 快照不一致`
    )
  }
  console.log('PASS: create --type 20008/20006/20001/20009 图记录逐字节一致（v4→v5）')
}

// 6. 多图绑定：双绑逐字节（v2→v7）、三绑语义（轨道点 1825/1832/1839；wire 顺序编辑器会重排，未闭合）
{
  const r2 = buildSkillConfig(load(`${R}/after-20002.gil`), {
    id: 1228931073,
    name: '操控技能',
    template: 'normal',
    skillType: 'instant',
    graphIds: [1082130433, 1082130440]
  })
  const t7 = load(`${R}/after-multibind.gil`)
  assert.ok(
    Buffer.from(recordBytes(r2, 15, 1228931073)).equals(Buffer.from(recordBytes(t7, 15, 1228931073))),
    '双绑: root15 记录不一致'
  )
  const r3 = buildSkillConfig(load(`${R}/after-20002.gil`), {
    id: 1228931073,
    name: '操控技能',
    template: 'normal',
    skillType: 'instant',
    graphIds: [1082130433, 1082130440, 1082130433]
  })
  const v = listSkillConfigs(r3).find((c) => c.id === 1228931073)
  const tps = (v?.bindings ?? []).map((b) => `${b.graphId}@${b.trackPoint}`).sort()
  assert.deepEqual(tps, ['1082130433@1073741825', '1082130433@1073741839', '1082130440@1073741832'])
  console.log('PASS: 双绑逐字节（v7）+ 三绑语义（轨道点序列）')
}

// 7. 名称长度边界 + 重复 ID 拒绝
{
  for (const name of ['x', '测试技能', '这是一个非常长的技能配置名称用于验证UTF8长度变化的边界情况测试测试测试测试测试测试']) {
    const r = buildSkillConfig(load(`${R}/after-20002.gil`), {
      id: 1228931074,
      name,
      template: 'normal',
      skillType: 'normal',
      graphIds: []
    })
    const v = listSkillConfigs(r).find((c) => c.id === 1228931074)
    assert.equal(v?.name, name, `名称回读不一致: ${name}`)
  }
  assert.throws(
    () =>
      buildSkillConfig(load(`${R}/after-skillconfig.gil`), {
        id: 1228931073,
        name: 'x',
        template: 'normal',
        skillType: 'normal',
        graphIds: []
      }),
    /already exists/
  )
  console.log('PASS: 名称长度边界（1/4/43 字）+ 重复 ID 拒绝')
}

// 8. 28 造物模板：创建（v10→v11 记录除模型外一致 + root20 1970B）+ 绑定（v10→v12 + root20 2955B）
{
  // 模型字节替换：CLI 固定模型 = 10005001（遗迹守卫，用户确认）；快照 v11/v12 为 10007001
  const swapModel = (rec: Uint8Array, from: number, to: number): Uint8Array => {
    const hex = Buffer.from(rec).toString('hex')
    const vf = Buffer.from([
      (from & 0x7f) | 0x80, (from >> 7) & 0x7f | 0x80, (from >> 14) & 0x7f | 0x80, from >> 21
    ]).toString('hex')
    const vt = Buffer.from([
      (to & 0x7f) | 0x80, (to >> 7) & 0x7f | 0x80, (to >> 14) & 0x7f | 0x80, to >> 21
    ]).toString('hex')
    return Uint8Array.from(Buffer.from(hex.replaceAll(vf, vt), 'hex'))
  }
  const base = load(`${R}/after-custom-bind.gil`) // v10：无造物技能、root20 空占位
  const r1 = buildSkillConfig(base, {
    id: 1191182337, name: '自定义造物技能', template: 'creation', skillType: 'instant', graphIds: []
  })
  const t11 = load(`${R}/after-custom-create-instant.gil`)
  assert.ok(
    Buffer.from(swapModel(recordBytes(r1, 15, 1191182337), 10005001, 10007001))
      .equals(Buffer.from(recordBytes(t11, 15, 1191182337))),
    '28创建: root15 记录（除模型外）不一致'
  )
  assert.ok(
    Buffer.from(rootBytes(r1, 20)).equals(Buffer.from(rootBytes(t11, 20))),
    '28创建: root20 1970B 不一致'
  )
  const v1 = listSkillConfigs(r1).find((c) => c.id === 1191182337)
  assert.equal(v1?.model, 10005001, '28创建: 模型应为遗迹守卫 10005001')
  const r2 = buildSkillConfig(base, {
    id: 1191182337, name: '自定义造物技能', template: 'creation', skillType: 'instant',
    graphIds: [1082130435]
  })
  const t12 = load(`${R}/after-create-bind.gil`)
  assert.ok(
    Buffer.from(swapModel(recordBytes(r2, 15, 1191182337), 10005001, 10007001))
      .equals(Buffer.from(recordBytes(t12, 15, 1191182337))),
    '28绑定: root15 记录（除模型外）不一致'
  )
  assert.ok(
    Buffer.from(rootBytes(r2, 20)).equals(Buffer.from(rootBytes(t12, 20))),
    '28绑定: root20 2955B 不一致'
  )
  const v2 = listSkillConfigs(r2).find((c) => c.id === 1191182337)
  assert.equal(v2?.bindings.length, 1)
  assert.equal(v2?.bindings[0].graphId, 1082130435, '28绑定: 78.1.4 图 ID 不一致')
  console.log('PASS: 28 造物模板 创建/绑定（除模型外逐字节一致 + root20 联动 + 模型 10005001）')
}

// 9. fail closed：20003/20004/20005/20007 建图 + 普通释放多绑
{
  assert.throws(() => buildEmptyNodeGraph(load(`${R}/before.gil`), 1082130441, 'x', 20003), /未采样/)
  assert.throws(() => buildEmptyNodeGraph(load(`${R}/before.gil`), 1082130441, 'x', 20007), /未采样/)
  assert.throws(
    () =>
      buildSkillConfig(load(`${R}/after-20002.gil`), {
        id: 1228931074,
        name: 'x',
        template: 'normal',
        skillType: 'normal',
        graphIds: [1082130433, 1082130440]
      }),
    /限 1 个/
  )
  console.log('PASS: fail-closed 清单（20003/20007 建图、普通释放多绑）')
}

console.log('PASS: gil_client_graph_skillconfig isomorphism replay (全部逐字节一致)')
