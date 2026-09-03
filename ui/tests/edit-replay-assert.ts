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
import { extractGeometry, extractTextConfig, parseRoot9 } from '../src/record.js'

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

// 轮19→20：输入框文本内容（f505 缺失→插入）与文字颜色同参重放
const UILEARN = path.join(ROOT, '.gsts', 'diff-exp', 'ui学习')
if (fs.existsSync(UILEARN)) {
  const loadU = (f: string): Uint8Array =>
    new Uint8Array(fs.readFileSync(path.join(UILEARN, f)))
  ok('编辑重放: 输入框文本+颜色（轮19→轮20；root9 全等；field45 颜色历史=预期差异登记）', () => {
    const r = updateUiControl(
      loadU('1073741909.after-重启19-图文输入框-a81cbfbf.gil'),
      INPUT,
      { content: '这是文字', textStyle: { color: '#386A3F' } }
    )
    const edit = loadU('1073741909.after-重启20-输入框文字颜色-e805d0cc.gil')
    // root9 全等 + root46 等长
    const parseTop = (b: Uint8Array) => parseWireMessage(b.subarray(20, b.length - 4))!
    const a = parseTop(r.bytes)
    const b = parseTop(edit)
    for (const n of [9, 46]) {
      const av = a.find((f) => f.number === n)
      const bv = b.find((f) => f.number === n)
      assert.ok(av && bv, `field ${n} missing`)
      if (n === 46) {
        assert.equal(
          (av.value as Uint8Array).length,
          (bv.value as Uint8Array).length,
          'root46 len'
        )
        continue
      }
      assert.equal(
        Buffer.from(av.value as Uint8Array).equals(Buffer.from(bv.value as Uint8Array)),
        true,
        'root9 应全等'
      )
    }
    // field45 颜色历史：编辑器把 {新色,?} 条目(10B)置顶并重写长度前缀（open-item，单样本）
    // 断言：长度 +10，且候选旧内容整体作为编辑器后缀保留（12 偏移之后逐字节相等）
    const fa = a.find((f) => f.number === 45)!.value as Uint8Array
    const fb = b.find((f) => f.number === 45)!.value as Uint8Array
    assert.equal(fb.length - fa.length, 10, '颜色历史 +10B')
    assert.equal(
      Buffer.from(fb.subarray(22)).equals(Buffer.from(fa.subarray(12))),
      true,
      'field45 旧内容后缀完整保留'
    )
  })
} else {
  console.log('skip 1 - ui学习 快照目录缺失')
}

if (fs.existsSync(UILEARN)) {
  const loadU = (f: string): Uint8Array =>
    new Uint8Array(fs.readFileSync(path.join(UILEARN, f)))
  ok('编辑重放: 位置移动（轮17→轮18；root9 全等；t12 等长路径）', () => {
    const before = loadU('1073741909.after-重启17-同步三态树-0a5ebfa7.gil')
    const after = loadU('1073741909.after-重启18-右下角位置-2bed515e.gil')
    const geo = extractGeometry(parseRoot9(after).recordsById.get(1073742034)!.fields, [])
    assert.ok(geo?.position, 'after 需有 position')
    const r = updateUiControl(before, 1073742034, { position: geo!.position })
    assertTopEquals(r.bytes, after, 'move 轮17→18')
  })

  ok('字段保留: 几何编辑后文本/样式配置不变（动态 textbox；t12 只动几何）', () => {
    const before = loadU('1073741909.after-重启19-图文输入框-a81cbfbf.gil')
    const parsed = parseRoot9(before)
    const textbox = parsed.records.find((r) => r.kind === 'textbox' && extractGeometry(r.fields, []))
    assert.ok(textbox, '需存在 textbox')
    const r = updateUiControl(before, textbox!.id, { position: [500, 500] })
    const textOf = (b: Uint8Array) =>
      JSON.stringify(extractTextConfig(parseRoot9(b).recordsById.get(textbox!.id)!.fields, []))
    assert.equal(textOf(r.bytes), textOf(before), '文本配置应保持不变')
  })
} else {
  console.log('skip 1 - ui学习 快照目录缺失')
}

console.log(`PASS ${passed} edit-replay assertions`)
