/**
 * ui/tests/semantic-list.snapshot-assert.ts — 票 04 真实样本回读断言（判别/属性/差异 vs 人工差分结论）
 *
 * 运行：npx tsx ui/tests/semantic-list.snapshot-assert.ts
 * 依赖：.gsts/diff-exp/ui学习/ 快照（本机留存，gitignored）；缺失即 FAIL（本地验收）。
 * 人工差分结论来源：.scratch/ui-command-layer/issues/01-*.md / issues/02-*.md 轮次记录。
 */

import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { loadAnchor, saveAnchor } from '../src/anchor.js'
import { computeDiff } from '../src/diff.js'
import { buildSemanticView } from '../src/tree.js'

const ROOT = path.resolve(import.meta.dirname, '..', '..')
const FIXTURES = path.join(ROOT, '.gsts', 'diff-exp', 'ui学习')

function gil(name: string): Uint8Array {
  const file = path.join(FIXTURES, name)
  assert.ok(fs.existsSync(file), `fixture missing: ${file}`)
  return new Uint8Array(fs.readFileSync(file))
}

function view(name: string) {
  return buildSemanticView(gil(name))
}

function flat(view: ReturnType<typeof buildSemanticView>) {
  return view.flat
}

function findById(view: ReturnType<typeof buildSemanticView>, id: number) {
  const node = flat(view).find((n) => n.id === id)
  assert.ok(node, `node ${id} not found in flat view`)
  return node
}

let passed = 0
function ok(label: string, fn: () => void) {
  fn()
  passed += 1
  console.log(`ok ${passed} - ${label}`)
}

// ---------- 判别 + 属性（人工差分结论：票 01/02 轮次记录） ----------

ok('重启轮4: 默认布局官方自定义按钮 2032 判别=自定义按钮/路径=布局', () => {
  const v = view('1073741909.after-重启4-默认布局自定义按钮-e645aefb.gil')
  const node = findById(v, 1073742032)
  assert.equal(node.kind, 'custom-button')
  assert.equal(node.name, '自定义按钮')
  assert.match(node.path, /^布局:/)
  assert.match(node.path, /默认布局/)
})

ok('重启轮19: 自定义布局官方图文输入框 2079 判别=输入框/路径=布局', () => {
  const v = view('1073741909.after-重启19-图文输入框-a81cbfbf.gil')
  const node = findById(v, 1073742079)
  assert.equal(node.kind, 'input-box')
  assert.match(node.path, /^布局:/)
  assert.match(node.path, /自定义布局/)
})

ok('重启轮26: 悬浮页详情自定义按钮 2089 判别=按钮/父=固有容器', () => {
  const v = view('1073741909.after-重启26-悬浮页加按钮-f0ddb622.gil')
  const node = findById(v, 1073742089)
  assert.equal(node.kind, 'custom-button')
  assert.match(node.path, /悬浮交互页/)
  assert.match(node.path, /固有容器/)
})

ok('重启轮29: 悬浮页详情页签 2097 判别=页签/kind=320001', () => {
  const v = view('1073741909.after-重启29-悬浮页加页签-de3ffb3f.gil')
  const node = findById(v, 1073742097)
  assert.equal(node.kind, 'tab')
  assert.equal(node.props['kindNumber'], 320001)
  assert.match(node.path, /悬浮交互页/)
})

ok('重启轮51: 默认布局官方消息队列 2132 判别=消息队列/路径=布局', () => {
  const v = view('1073741909.after-重启51-消息队列-536528cb.gil')
  const node = findById(v, 1073742132)
  assert.equal(node.kind, 'message-queue')
  assert.match(node.path, /^布局:/)
  assert.match(node.path, /默认布局/)
})

ok('重启轮54: 消息队列样式列表=2（人工: type77 样式一/样式二）', () => {
  const v = view('1073741909.after-重启54-队列样式2-2a260b6c.gil')
  const node = findById(v, 1073742132)
  const styles = node.props['styles'] as Array<Record<string, unknown>> | undefined
  assert.ok(Array.isArray(styles), 'props.styles should be array')
  assert.equal(styles.length, 2)
  assert.equal(
    node.children.filter((c) => c.kind === 'material-group' || c.kind === 'style-group').length,
    2
  )
})

ok('重启轮64: 容器一三大官方控件（文本框2155/图片2156/输入框2157）', () => {
  const v = view('1073741909.after-重启64-容器三控件-e4c92e39.gil')
  assert.equal(findById(v, 1073742155).kind, 'textbox')
  assert.equal(findById(v, 1073742156).kind, 'image')
  assert.equal(findById(v, 1073742157).kind, 'input-box')
  for (const id of [1073742155, 1073742156, 1073742157]) {
    const node = findById(v, id)
    assert.match(node.path, /悬浮交互页/)
    assert.match(node.path, /固有容器/)
  }
})

// ---------- 玩家拖动 diff（人工结论：轮13 等长几何改，仅 2032 位置对替换） ----------

ok('重启轮13 diff: 玩家拖动=仅布局按钮2032几何变化且 playerChanges', () => {
  const before = view('1073741909.after-重启12-同步位置广播-93472167.gil')
  const after = view('1073741909.after-重启13-玩家细排位置-2f8f0205.gil')
  assert.notEqual(before.recordSetHash, after.recordSetHash)
  const diff = computeDiff(
    'restart13-before',
    undefined,
    before.flat,
    after.flat,
    after.sourceSha256,
    before.sourceSha256,
    true
  )
  assert.equal(diff.added.length, 0, `added should be 0: ${diff.added.map((n) => n.id).join(',')}`)
  assert.equal(
    diff.removed.length,
    0,
    `removed should be 0: ${diff.removed.map((n) => n.id).join(',')}`
  )
  assert.equal(
    diff.changed.length,
    1,
    `changed should be 1: ${diff.changed.map((c) => c.id).join(',')}`
  )
  const change = diff.changed[0]
  assert.equal(change.id, 1073742032)
  assert.ok(
    change.fields.some((f) => f.field === 'geometry'),
    'fields should include geometry'
  )
  assert.equal(change.playerChanges, true)
})

// ---------- anchor save/list 往返 + diff --anchor ----------

ok('anchor save/list/load 往返', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ui-anchor-test-'))
  const v = view('1073741909.after-重启4-默认布局自定义按钮-e645aefb.gil')
  const saved = saveAnchor(tmp, {
    label: 'restart4',
    mapId: '1073741909',
    sourceSha256: v.sourceSha256,
    recordSetHash: v.recordSetHash,
    nodes: v.flat,
    tree: v.tree
  })
  assert.ok(fs.existsSync(saved.file))
  const loaded = loadAnchor(tmp, '1073741909', 'restart4')
  assert.equal(loaded.anchor.label, 'restart4')
  assert.equal(loaded.anchor.recordSetHash, v.recordSetHash)
  assert.equal(loaded.anchor.nodes.length, v.flat.length)
})

console.log(`\nPASS ${passed} snapshot assertions`)
