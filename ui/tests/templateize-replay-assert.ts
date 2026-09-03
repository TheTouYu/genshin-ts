/**
 * ui/tests/templateize-replay-assert.ts — 「保存为模板/实例化」字节级重放断言（票05 波2）
 *
 * 运行：npx tsx ui/tests/templateize-replay-assert.ts
 * 依赖：本地快照 .gsts/diff-exp/ui学习/（缺 SKIP）+ templateize-slots.ts 已生成
 *       （先跑 npx tsx ui/tests/gen-templateize-slots.ts）。
 *
 * 对拍组（root9 与编辑器样本逐字节相等；root46 保存审计=预期差异）：
 *   A 轮4→轮5  自定义按钮官方单条→模板（template 2033 + 原 2032 升格 instance）
 *   B 轮5→轮6  模板→库详情实例（instance 2034 挂 1840 + f503 + f14 backref 追加）
 *   C 轮22→轮23 图文输入框三合一（template 2080 + 布局实例 2079 升格 + 自动库实例 2081 +
 *               family 深链 505.503.19.62.501:1 重指向）
 */

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

import {
  createTemplateCandidate,
  instantiateToLibrary
} from '../src/templateize.js'
import { parseWireMessage } from '../../src/cli/static_assembly/wire.js'

const ROOT = path.resolve(import.meta.dirname, '..', '..')
const FIXTURES = path.join(ROOT, '.gsts', 'diff-exp', 'ui学习')

if (!fs.existsSync(FIXTURES)) {
  console.log('SKIP: .gsts/diff-exp/ui学习/ 不存在（本地快照核验需真实差分留存）')
  process.exit(0)
}

function load(file: string): Uint8Array {
  return new Uint8Array(fs.readFileSync(path.join(FIXTURES, file)))
}

/**
 * root9 逐字节相等；其余顶层字段等值；field 46（保存审计）仅等长校验。
 */
function assertReplayEquals(candidate: Uint8Array, editor: Uint8Array, label: string): void {
  const parse = (bytes: Uint8Array) => parseWireMessage(bytes.subarray(20, bytes.length - 4))!
  const a = parse(candidate)
  const b = parse(editor)
  const nums = [...new Set([...a.map((f) => f.number), ...b.map((f) => f.number)])].sort((x, y) => x - y)
  const sameValue = (x: (typeof a)[number], y: (typeof b)[number]) =>
    x.wire === y.wire &&
    (typeof x.value === 'number'
      ? x.value === y.value
      : Buffer.from(x.value as Uint8Array).equals(Buffer.from(y.value as Uint8Array)))
  for (const num of nums) {
    const av = a.find((f) => f.number === num)
    const bv = b.find((f) => f.number === num)
    assert.ok(av && bv, `${label}: 顶层字段 ${num} 仅一侧存在`)
    if (num === 46) {
      assert.equal(
        (av.value as Uint8Array).length,
        (bv.value as Uint8Array).length,
        `${label}: root46 长度不一致`
      )
      continue
    }
    assert.equal(sameValue(av, bv), true, `${label}: 顶层字段 ${num} 不一致`)
  }
}

let passed = 0
function ok(label: string, fn: () => void): void {
  fn()
  passed += 1
  console.log(`ok ${passed} - ${label}`)
}

const R4_AFTER = '1073741909.after-重启4-默认布局自定义按钮-e645aefb.gil'
const R5_AFTER = '1073741909.after-重启5-按钮保存为模板-7e62741d.gil'
const R6_AFTER = '1073741909.after-重启6-模板保存入库-cb6c78ae.gil'
const R22_AFTER = '1073741909.after-重启22-换图片资源-a4dd24b2.gil'
const R23_AFTER = '1073741909.after-重启23-输入框存模板-2ac5a0b8.gil'

ok('模板化重放: 按钮官方单条→模板（轮4→轮5；root9 全等）', () => {
  const result = createTemplateCandidate(load(R4_AFTER), {
    targetId: 1073742032,
    autoLibrary: false
  })
  assert.equal(result.templateId, 1073742033)
  assert.equal(result.instanceId, 1073742032)
  assertReplayEquals(result.bytes, load(R5_AFTER), '按钮模板化 轮4→5')
})

ok('实例化重放: 模板→库详情实例（轮5→轮6；root9 全等）', () => {
  const result = instantiateToLibrary(load(R5_AFTER), { templateId: 1073742033 })
  assert.equal(result.instanceId, 1073742034)
  assertReplayEquals(result.bytes, load(R6_AFTER), '库实例化 轮5→6')
})

ok('模板化重放: 图文输入框三合一含自动库实例（轮22→轮23；root9 全等）', () => {
  const result = createTemplateCandidate(load(R22_AFTER), {
    targetId: 1073742079,
    autoLibrary: true
  })
  assert.equal(result.templateId, 1073742080)
  assert.equal(result.libraryInstanceId, 1073742081)
  assertReplayEquals(result.bytes, load(R23_AFTER), '输入框三合一 轮22→23')
})

ok('fail-closed: 非官方单条不可模板化（实例/模板拒绝）', () => {
  assert.throws(
    () => createTemplateCandidate(load(R5_AFTER), { targetId: 1073742032, autoLibrary: false }),
    /非官方单条/
  )
})

ok('fail-closed: 无 subtype 变体样本的 kind 拒绝（消息队列模板化待轮63 差分）', () => {
  // 轮51 快照含官方消息队列（kind=message-queue）——其模板化（轮63 含样式树克隆）未实现，须显式拒绝
  assert.throws(
    () =>
      createTemplateCandidate(load('1073741909.after-重启51-消息队列-536528cb.gil'), {
        targetId: 1073742132,
        autoLibrary: true
      }),
    /模板化未支持 kind=message-queue/
  )
})

console.log(`PASS ${passed} templateize-replay assertions`)
