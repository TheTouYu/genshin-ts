/**
 * ui/tests/delete-replay-assert.ts — 票07 删除字节级对拍（轮65 容器成员 + 轮14 布局按钮+私有树）
 * 运行：npx tsx ui/tests/delete-replay-assert.ts
 */

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

import { deleteUiControl } from '../../src/cli/gil_ui.js'
import { parseWireMessage } from '../../src/cli/static_assembly/wire.js'

const ROOT = path.resolve(import.meta.dirname, '..', '..')
const UILEARN = path.join(ROOT, '.gsts', 'diff-exp', 'ui学习')
if (!fs.existsSync(UILEARN)) {
  console.log('SKIP: ui学习 快照目录缺失')
  process.exit(0)
}
const load = (f: string): Uint8Array => new Uint8Array(fs.readFileSync(path.join(UILEARN, f)))

function assertTopEquals(candidate: Uint8Array, editor: Uint8Array, label: string): void {
  const parse = (b: Uint8Array) => parseWireMessage(b.subarray(20, b.length - 4))!
  const a = parse(candidate)
  const b = parse(editor)
  const nums = [...new Set([...a.map((f) => f.number), ...b.map((f) => f.number)])].sort((x, y) => x - y)
  for (const n of nums) {
    const av = a.find((f) => f.number === n)
    const bv = b.find((f) => f.number === n)
    assert.ok(av && bv, `${label}: 顶层字段 ${n} 仅一侧存在`)
    if (n === 46) {
      assert.equal(
        (av.value as Uint8Array).length,
        (bv.value as Uint8Array).length,
        `${label}: root46 长度不一致`
      )
      continue
    }
    const eq =
      typeof av.value === 'number'
        ? av.value === bv.value
        : Buffer.from(av.value as Uint8Array).equals(Buffer.from(bv.value as Uint8Array))
    assert.equal(eq, true, `${label}: 顶层字段 ${n} 不一致`)
  }
}

let passed = 0
function ok(label: string, fn: () => void): void {
  fn()
  passed += 1
  console.log(`ok ${passed} - ${label}`)
}

ok('删除重放: 容器成员文本框（轮64→轮65；root9 全等）', () => {
  const r = deleteUiControl(load('1073741909.after-重启64-容器三控件-e4c92e39.gil'), 1073742155)
  assert.deepEqual(r.removedIds, [1073742155])
  assert.ok(r.changed.some((c) => c.startsWith('host-members:')))
  assertTopEquals(
    r.bytes,
    load('1073741909.after-重启65-删文本框-da17641a.gil'),
    'delete textbox 64→65'
  )
})

ok('删除重放: 布局按钮实例+私有素材树（轮13→轮14；root9 全等）', () => {
  const r = deleteUiControl(load('1073741909.after-重启13-玩家细排位置-2f8f0205.gil'), 1073742032)
  assert.deepEqual(
    r.removedIds.slice().sort(),
    [1073742032, 1073742065, 1073742066, 1073742067, 1073742068].sort()
  )
  assert.ok(r.changed.some((c) => c.startsWith('template-backref:')))
  assertTopEquals(
    r.bytes,
    load('1073741909.after-重启14-删除布局按钮-4d848f3f.gil'),
    'delete button tree 13→14'
  )
})

ok('fail-closed: 无宿主记录（模板/布局）删除拒绝', () => {
  assert.throws(
    () =>
      deleteUiControl(
        load('1073741909.after-重启14-删除布局按钮-4d848f3f.gil'),
        1073742033
      ),
    /无宿主/
  )
})

console.log(`PASS ${passed} delete-replay assertions`)
