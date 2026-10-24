// 造物「多技能」条目编码回归（2026-10-24 用户实测事故）
//
// 事故：`assets:creations skill add` 加第 2 个技能时，把「只有一个技能」的场景照抄了 ——
// 序号字段 f1 硬编码 1，于是两条技能序号都是 1。游戏按序号索引技能，
// `executeSkill(true, 2n)` 找不到 2 号 ⇒ **静默不施放**（日志里 20008 零记录）。
// 用户修好后差分，编辑器真实形态（地图 1073741827，水史莱姆 1082130442）：
//   {1=序号(1 起，每条唯一), 2={1:1,2=技能配置ID}, 3={6:1,7:1(,8:1 仅首条)}, 12=名字}
//   列表头部是新条目
// 本回归锁住两条真实字节（tests/fixtures/creation-skill-multiskill.json）。
//
// 跑法：npx tsx tests/gil_creations_skill_entry_test.ts
import assert from 'node:assert/strict'
import fs from 'node:fs'

import { buildSkillEntry } from '../src/cli/gil_creations.js'

const fixture = JSON.parse(fs.readFileSync('tests/fixtures/creation-skill-multiskill.json', 'utf8')) as {
  entries: Record<string, { configId: number; name: string; hex: string }>
}

// 夹具里存的是「列表子条目」字节 = 0x0a + 长度 + 内层；buildSkillEntry 返回内层
function innerOf(hex: string): string {
  const buf = Buffer.from(hex, 'hex')
  let i = 1
  let len = 0
  let shift = 0
  while (true) {
    const b = buf[i++]
    len |= (b & 0x7f) << shift
    if (!(b & 0x80)) break
    shift += 7
  }
  return buf.subarray(i, i + len).toString('hex')
}

let passed = 0
function check(name: string, fn: () => void): void {
  try {
    fn()
    passed += 1
    console.log(`ok   ${name}`)
  } catch (error) {
    console.error(`FAIL ${name}: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  }
}

check('第 1 条（序号 1，带 f8）与编辑器逐字节一致', () => {
  const bytes = buildSkillEntry({ index: 1, configId: 1191182337, name: '技能_1', cdSeconds: 0, ignorePublicCd: true })
  assert.equal(Buffer.from(bytes).toString('hex'), innerOf(fixture.entries['1'].hex))
})

check('第 2 条（序号 2，无 f8）与编辑器逐字节一致', () => {
  const bytes = buildSkillEntry({ index: 2, configId: 1191182338, name: '技能_2', cdSeconds: 0 })
  assert.equal(Buffer.from(bytes).toString('hex'), innerOf(fixture.entries['2'].hex))
})

check('第 2 条 + 勾选忽略公共冷却（f8）与编辑器逐字节一致', () => {
  const bytes = buildSkillEntry({ index: 2, configId: 1191182338, name: '技能_2', cdSeconds: 0, ignorePublicCd: true })
  assert.equal(Buffer.from(bytes).toString('hex'), innerOf(fixture.entries['2_with_ignore_public_cd'].hex))
})

check('序号必须体现在字节里（写死 1 的回归）', () => {
  const a = buildSkillEntry({ index: 1, configId: 1, name: 'x', cdSeconds: 0 })
  const b = buildSkillEntry({ index: 2, configId: 1, name: 'x', cdSeconds: 0 })
  assert.notEqual(Buffer.from(a).toString('hex'), Buffer.from(b).toString('hex'))
  // 首字段是 f1（tag 0x08）→ 序号 2 = 08 02；写死 1 时会是 08 01
  assert.ok(Buffer.from(b).toString('hex').startsWith('0802'))
  assert.ok(Buffer.from(a).toString('hex').startsWith('0801'))
})

check('名字按 UTF-8 落 f12', () => {
  const bytes = buildSkillEntry({ index: 3, configId: 9, name: '技能_3', cdSeconds: 0 })
  assert.ok(Buffer.from(bytes).includes(Buffer.from('技能_3', 'utf8')))
})

console.log(`\n造物技能条目回归：${passed} 项通过${process.exitCode ? '（有失败）' : ''}`)
