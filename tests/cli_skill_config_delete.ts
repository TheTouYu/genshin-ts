// 技能配置删除（`assets:skill-config delete`）回归：纯内存，不碰真实地图
//
// 判据：
//   ① 删掉的只有目标那条：另一条配置仍在 list 里
//   ② root5 仍引用该 id 时默认拒绝（fail-closed），加 force 才放行
//   ③ 不存在的 id 报错而不是静默成功
import assert from 'node:assert/strict'

import { buildSkillConfig, deleteSkillConfig, listSkillConfigs } from '../src/cli/assets_skill_config.js'
import { emitWireMessage, parseWireMessage } from '../src/cli/static_assembly/wire.js'

const A = 1228931074
const B = 1228931075

function seed(): Uint8Array {
  // buildSkillConfig 会往 root6 的 folderId=61（自定义造物模板）文件夹登记条目 ⇒ 先造该骨架
  const folderRecord = emitWireMessage([
    { number: 1, wire: 0, value: 61 },
    { number: 3, wire: 2, value: emitWireMessage([]) }
  ])
  let payload = emitWireMessage([
    { number: 6, wire: 2, value: emitWireMessage([{ number: 1, wire: 2, value: folderRecord }]) }
  ])
  payload = buildSkillConfig(payload, {
    id: A,
    name: '要删的技能',
    template: 'creation',
    skillType: 'instant',
    graphIds: [1082130436]
  })
  payload = buildSkillConfig(payload, {
    id: B,
    name: '保留的技能',
    template: 'creation',
    skillType: 'instant',
    graphIds: [1082130436]
  })
  return payload
}

let passed = 0
function ok(name: string): void {
  passed += 1
  console.log(`  PASS ${name}`)
}

const base = seed()
const before = listSkillConfigs(base)
assert.equal(before.length, 2, 'seed 应产生 2 条配置')
ok('seed 产生 2 条配置')

// ① 正常删除
const del = deleteSkillConfig(base, A)
assert.equal(del.removed, 1)
assert.equal(del.refs, 0)
const after = listSkillConfigs(del.payload)
assert.equal(after.length, 1, '删后应只剩 1 条')
assert.equal(after[0].id, B, '剩下的是 B')
ok('删除目标后只剩另一条（A→B 未误删）')

// ② root5 引用闸门：伪造一条引用（root5 里放一个 varint = A）
const withRef = (() => {
  // 在 base payload 尾部追加 root5 {f1={f2:A}}，模拟实体技能条目引用
  const top = parseWireMessage(base) ?? []
  const entry = emitWireMessage([{ number: 2, wire: 0, value: A }])
  const root5 = emitWireMessage([{ number: 1, wire: 2, value: entry }])
  return emitWireMessage([...top, { number: 5, wire: 2, value: root5 }])
})()
let refused = false
try {
  deleteSkillConfig(withRef, A)
} catch (error) {
  refused = String(error instanceof Error ? error.message : error).includes('still referenced')
}
assert.equal(refused, true, '被 root5 引用时必须拒绝')
ok('root5 仍引用 ⇒ 默认拒绝')

const forced = deleteSkillConfig(withRef, A, { force: true })
assert.equal(forced.removed, 1)
assert.ok(forced.refs > 0, 'force 路径也要报引用数')
ok('--force 放行并报引用数')

// ③ 不存在
let missing = false
try {
  deleteSkillConfig(base, 1999999999)
} catch (error) {
  missing = String(error instanceof Error ? error.message : error).includes('not found')
}
assert.equal(missing, true, '不存在的 id 必须报错')
ok('不存在的 id 报 not found')

console.log(`\nALL PASS (${passed} checks)`)
