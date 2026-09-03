/**
 * ui/tests/edit-replay-assert.ts — 票06 定点编辑字节级对拍（补充2 S11-17 + 编码性质）
 * 运行：npx tsx ui/tests/edit-replay-assert.ts（ui补充 快照缺失则 SKIP）
 * 对照口径：root9 与编辑器样本逐字节相等；root46 仅等长（编辑器保存审计段预期差异）。
 */

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

import { updateUiControl } from '../../src/cli/gil_ui.js'
import { parseWireMessage } from '../../src/cli/static_assembly/wire.js'

const ROOT = path.resolve(import.meta.dirname, '..', '..')
const SUPP = path.join(ROOT, '.gsts', 'diff-exp', 'ui补充')
if (!fs.existsSync(SUPP)) {
  console.log('SKIP: ui补充 快照目录缺失')
  process.exit(0)
}
const load = (f: string): Uint8Array => new Uint8Array(fs.readFileSync(path.join(SUPP, f)))

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

const S11 = '1073741909.after-补充2-第11步-输入框左对齐-be6241a7.gil'
const S12 = '1073741909.after-补充2-第12步-输入框右对齐-4abfd5b2.gil'
const S13 = '1073741909.after-补充2-第13步-标题右对齐-171c9098.gil'
const S14 = '1073741909.after-补充2-第14步-字号12-9e33bdb7.gil'
const S15 = '1073741909.after-补充2-第15步-字号512-736aadd1.gil'
const S16 = '1073741909.after-补充2-第16步-队列内容右对齐-9a604608.gil'
const S17 = '1073741909.after-补充2-第17步-队列内容左对齐-fab8b91d.gil'
const INPUT = 1073742079
const QUEUE = 1073742132

ok('编辑重放: 输入框对齐=右（S11→apply→S12 root9 全等）', () => {
  const r = updateUiControl(load(S11), INPUT, { textStyle: { align: 'right' } })
  assertTopEquals(r.bytes, load(S12), 'align right S11→S12')
})

ok('编辑重放: 输入框对齐=左移除字段（S12→apply→S11 root9 全等）', () => {
  const r = updateUiControl(load(S12), INPUT, { textStyle: { align: 'left' } })
  assertTopEquals(r.bytes, load(S11), 'align left S12→S11')
})

ok('编辑重放: 输入框字号=12（S13→apply→S14 root9 全等）', () => {
  const r = updateUiControl(load(S13), INPUT, { textStyle: { fontSize: 12 } })
  assertTopEquals(r.bytes, load(S14), 'fontSize 12 S13→S14')
})

ok('编辑重放: 输入框字号=512 非等长 varint（S14→apply→S15 root9 全等）', () => {
  const r = updateUiControl(load(S14), INPUT, { textStyle: { fontSize: 512 } })
  assertTopEquals(r.bytes, load(S15), 'fontSize 512 S14→S15')
})

ok('编辑重放: 队列内容对齐=右 f68.f506（S17→apply→S16 root9 全等）', () => {
  const r = updateUiControl(load(S17), QUEUE, { textStyle: { align: 'right' } })
  assertTopEquals(r.bytes, load(S16), 'queue align right S17→S16')
})

ok('编辑重放: 队列内容对齐=左移除字段（S16→apply→S17 root9 全等）', () => {
  const r = updateUiControl(load(S16), QUEUE, { textStyle: { align: 'left' } })
  assertTopEquals(r.bytes, load(S17), 'queue align left S16→S17')
})

ok('编码性质: 文字颜色 #FFFFFF 幂等（2155 已白，重设后记录不变）', () => {
  const base = load(S13)
  const r = updateUiControl(base, 1073742155, { textStyle: { color: '#FFFFFF' } })
  // 目标记录字节不变（其余文件结构不变）
  const rec = (b: Uint8Array): Uint8Array => {
    const top = parseWireMessage(b.subarray(20, b.length - 4))!
    const sec = parseWireMessage(top.find((f) => f.number === 9)!.value as Uint8Array)!
    const field = sec.find((f) => f.number === 502 && f.wire === 2)!
    const inner = parseWireMessage(field.value as Uint8Array)!
    const id = inner.find((x) => x.number === 501 && x.wire === 0)?.value
    return id === 1073742155 ? (field.value as Uint8Array) : new Uint8Array(0)
  }
  assert.equal(Buffer.from(rec(r.bytes)).equals(Buffer.from(rec(base))), true, '白字重设应幂等')
})

ok('fail-closed: 队列记录不支持字号（f19 缺失走 f68 报错）', () => {
  assert.throws(() => updateUiControl(load(S17), QUEUE, { textStyle: { fontSize: 12 } }), /字号/)
})

ok('fail-closed: 字号越界（513）拒绝', () => {
  assert.throws(() => updateUiControl(load(S13), INPUT, { textStyle: { fontSize: 513 } }), /1\.\.512/)
})

console.log(`PASS ${passed} edit-replay assertions`)
