// sim:import 三链路覆盖分析（2026-10-29）：能力 / 目标图已有 / 脚本 GUID 漂移。
//
// 为什么要有这个测试：2026-10-29 实测过「结构全对、编辑器零报错、运行时界面空白」——
// 第三条链路（脚本 GUID ↔ 模板 ID）只有运行时日志能证伪，静态只能靠这里的两栏对比提前喊。
// 场景取自地图 1073741846 的真实差分快照（evidence/2026-10-29-server-control-group/raw/）：
//   r3 = 导入前（有容器、无模板）→ 模板栏应为空
//   r6 = 导入后（模板落在 1073741867/68/69）→ 模板栏应指向它们
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

import {
  UI_ID_BASE,
  analyzeCoverage,
  analyzeScriptDrift,
  decodeGia,
  extractTemplateEntries,
  extractUiGuids,
  findInTarget,
  nameMatches,
  readTarget
} from '../src/cli/sim_import.js'

// ── 1) 名字匹配：编辑器重名去重会加 _1/_2 后缀（实测 客户端控件容器 → 客户端控件容器_1）
assert.equal(nameMatches('客户端控件容器_1', '客户端控件容器'), true, 'suffix dedup')
assert.equal(nameMatches('prim', 'prim'), true, 'exact')
assert.equal(nameMatches('prim_2', 'prim'), true, 'suffix dedup 2')
assert.equal(nameMatches('label', 'prim'), false, 'different names')
assert.equal(nameMatches('客户端控件容器', ''), false, 'empty gia name never matches')
assert.equal(nameMatches('x_1_y', 'x'), false, 'suffix must be trailing _<digits>')

// ── 2) UI 段 GUID 提取：只收 [UI_ID_BASE, UI_ID_BASE+4096) 区间
const guids = extractUiGuids(
  ['local a = 1073742105', 'local b = 12345', 'local c = 9999999999', 'local d = 1073742150'].join('\n')
)
assert.deepEqual(guids, [1073742105, 1073742150], 'band filter keeps UI ids only')
assert.ok(guids.every((g) => g >= UI_ID_BASE && g < UI_ID_BASE + 4096))

// ── 3) 模板声明解析：T.tpl = { prim = …, label = …, hit = … }
const entries = extractTemplateEntries(
  "T.tpl = { prim = 1073742105, label = 1073742106, hit = 1073742107 }\nlocal other = { x = 1 }"
)
assert.equal(entries.length, 3, 'one entry per template key')
assert.deepEqual(
  entries.map((e) => e.key),
  ['prim', 'label', 'hit']
)

// ── 4) analyzeScriptDrift：漂移 + 重映射建议（合成数据，不依赖证据文件）
const fakeRecords = [
  { id: 500, name: 'prim', familyTypes: [4], kind: 'client-image' },
  { id: 501, name: 'label', familyTypes: [4], kind: 'client-textbox' },
  { id: 502, name: 'hit', familyTypes: [4], kind: 'client-cursor-area' }
] as unknown as Parameters<typeof analyzeScriptDrift>[1] extends readonly (infer T)[] ? T[] : never
const fakeGia = {
  filePath: 'fake.gia',
  gameVersion: '7.1.0',
  nodes: [],
  scripts: [
    {
      id: 1,
      name: 'main',
      path: 'main.lua',
      sourceBytes: 10,
      source: 'T.tpl = { prim = 1073742105, label = 1073742106 }\nlocal d = discoverTemplates'
    }
  ]
}
const drift = analyzeScriptDrift(fakeGia, fakeRecords)
assert.ok(drift, 'script present → drift report')
assert.equal(drift.missing.length, 2, 'both declared guids missing in target')
assert.equal(drift.selfHeal, true, 'discover marker detected')
assert.equal(drift.templates[0].candidate?.id, 500, 'prim remaps to target prim')

// ── 5) 端到端差分：导入前 / 导入后 两条真实快照，模板栏必须翻转
const GIA = 'workspace/flower-tea/device-package/花间茶会-整合包.gia'
const RAW = 'evidence/2026-10-29-server-control-group/raw'
const before = `${RAW}/r3-layout.gil`
const after = `${RAW}/r6-swap.gil`
if (!existsSync(GIA) || !existsSync(before) || !existsSync(after)) {
  console.log('CLI sim:import analysis test SKIPPED (证据文件不在，跳过端到端段)')
} else {
  const gia = decodeGia(new Uint8Array(readFileSync(GIA)))
  assert.equal(gia.scripts.length, 1, 'flower-tea package carries exactly one script')
  assert.ok(gia.scripts[0].source.length > 1000, 'script source captured for drift scan')

  const tplNames = gia.nodes.filter((n) => n.which === 70).map((n) => n.name)
  assert.deepEqual(tplNames, ['prim', 'label', 'hit'], 'three client control templates')

  // 导入前：容器在、模板不在 → 模板条目没有 inTarget
  const pre = readTarget(new Uint8Array(readFileSync(before)))
  const preReport = analyzeCoverage(gia, { ...pre.target, path: before }, pre.records)
  const preTplItems = preReport.items.filter((i) => i.item.includes('客户端控件模板「'))
  assert.equal(preTplItems.length, 3)
  for (const item of preTplItems) {
    assert.equal(item.inTarget ?? undefined, undefined, `${item.item} 导入前不应命中目标图`)
  }

  // 导入后：模板落在 1867/68/69 → 三个模板条目都命中，且 form=template
  const post = readTarget(new Uint8Array(readFileSync(after)))
  const postReport = analyzeCoverage(gia, { ...post.target, path: after }, post.records)
  const postTplItems = postReport.items.filter((i) => i.item.includes('客户端控件模板「'))
  const postIds = postTplItems.map((i) => i.inTarget?.[0]?.id)
  assert.deepEqual(postIds, [1073741867, 1073741868, 1073741869], 'imported templates located')
  assert.ok(
    postTplItems.every((i) => i.inTarget?.[0]?.form === 'template'),
    'imported templates are template form (类4 且无 f504)'
  )

  // nextFreeId 必须大于当前最大记录（导入会从这里往上分配）
  assert.equal(post.target.nextFreeId, post.target.maxRecordId + 1, 'nextFreeId = maxRecordId + 1')

  // 脚本漂移：三条写死的 GUID 在目标图都不存在，但能按名字找到候选
  const d = postReport.scriptDrift
  assert.ok(d, 'drift report present')
  for (const g of [1073742105, 1073742106, 1073742107]) {
    assert.ok(d.missing.includes(g), `guid ${g} reported missing`)
  }
  assert.deepEqual(
    d.templates.map((t) => [t.key, t.candidate?.id]),
    [
      ['prim', 1073741867],
      ['label', 1073741868],
      ['hit', 1073741869]
    ],
    'remap suggestions point at the imported templates'
  )
  assert.equal(d.selfHeal, true, 'flower-tea script carries discoverTemplates self-heal')
  assert.equal(postReport.schemaVersion, 2)
}

// ── 6) findInTarget 的 form 判别：类4=template / 类3=instance / 其余=plain
const formRecords = [
  { id: 1, name: 'c', familyTypes: [4], kind: 'client-container' },
  { id: 2, name: 'c', familyTypes: [3], kind: 'client-container' },
  { id: 3, name: 'c', familyTypes: [], kind: 'client-container' }
] as unknown as Parameters<typeof findInTarget>[0]
const forms = findInTarget(formRecords, {
  guid: 9,
  name: 'c',
  types: [15, 23, 82],
  kind: 'client-container',
  children: [],
  origin: 'graph',
  which: 21
}).map((m) => m.form)
assert.deepEqual(forms, ['template', 'instance', 'plain'], 'familyTypes → form')

console.log('CLI sim:import three-link analysis test passed')
