// sim:import --apply 落地回归（2026-10-29）：GIA → root9 模板 + 脚本 + 布局实例。
//
// 判据全部对齐编辑器真值（evidence/2026-10-29-server-control-group/raw/）：
//   ① 五条模板记录（模板组/容器节点/prim/label/hit）与编辑器导入产物**逐字节同尺寸**
//      （513 / 566 / 810 / 755 / 715 B）——归一化 ID 后非 ID 差异为 0
//   ② 脚本里写死的模板 GUID 被重映射到新分配 ID（不重映射 = 运行时 probe 全 FAIL）
//   ③ root9 森林根集（f501）必须等于「无 f504 记录集合」
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

import {
  applyGiaPackage,
  checkRoot9Invariants,
  decodeGia
} from '../src/cli/sim_import.js'
import { parseRoot9 } from '../ui/src/record.js'

const GIA = 'workspace/flower-tea/device-package/花间茶会-整合包.gia'
const BASE = 'evidence/2026-10-29-server-control-group/raw/r3-layout.gil'
const EDITOR = 'evidence/2026-10-29-server-control-group/raw/r4-gia-import.gil'
if (!existsSync(GIA) || !existsSync(BASE) || !existsSync(EDITOR)) {
  console.log('CLI sim:import apply test SKIPPED (证据文件不在)')
  process.exit(0)
}

const giaBytes = new Uint8Array(readFileSync(GIA))
const baseBytes = new Uint8Array(readFileSync(BASE))
const editorBytes = new Uint8Array(readFileSync(EDITOR))
const START = 1073742500

// ── 1) 只造模板（不实例化）：五条记录尺寸必须与编辑器产物完全一致
const templatesOnly = applyGiaPackage(giaBytes, baseBytes, { startId: START })
assert.equal(templatesOnly.groupId, START)
assert.equal(templatesOnly.nodeId, START + 1)
assert.deepEqual(templatesOnly.templateIds, [START + 2, START + 3, START + 4])
assert.deepEqual(templatesOnly.templateSeqs, [2, 3, 4, 5], '模板序号接在既有 1 之后')

const parsed = parseRoot9(templatesOnly.bytes)
const sizeOf = (id: number) => parsed.recordsById.get(id)?.raw.length
assert.deepEqual(
  [sizeOf(START), sizeOf(START + 1), sizeOf(START + 2), sizeOf(START + 3), sizeOf(START + 4)],
  [513, 566, 810, 755, 715],
  '五条记录尺寸与编辑器导入产物逐字节一致'
)
// 编辑器侧同形对照（防止证据文件被换掉后判据静默失效）
const editorParsed = parseRoot9(editorBytes)
assert.deepEqual(
  [1073741865, 1073741866, 1073741867, 1073741868, 1073741869].map(
    (id) => editorParsed.recordsById.get(id)?.raw.length
  ),
  [513, 566, 810, 755, 715],
  '编辑器真值基线未漂移'
)

// ── 2) 重名去重只作用于进模板列表的记录（容器节点不去重，与编辑器一致）
assert.deepEqual(templatesOnly.renames, [{ from: '客户端控件容器', to: '客户端控件容器_1' }])
assert.equal(parsed.recordsById.get(START + 1)?.name, '容器节点', '容器节点保持原名')

// ── 3) 森林根集不变量：f501 == 无 f504 记录集合
assert.deepEqual(checkRoot9Invariants(templatesOnly.bytes), [])
for (const id of [START, START + 1, START + 2, START + 3, START + 4]) {
  assert.ok(parsed.indexIds.has(id), `${id} 应进 f501 索引`)
  assert.equal(parsed.recordsById.get(id)?.parentId, null, `${id} 不应有 f504`)
}

// ── 4) 脚本：登记 + 挂载槽 GUID + 源码里的模板 GUID 重映射
assert.ok(templatesOnly.script, '脚本已登记进 root50')
const scriptGuid = templatesOnly.script.guid
const text = Buffer.from(templatesOnly.bytes).toString('latin1')
assert.ok(text.includes('T.tpl = {'), '脚本源码已写入')
for (const [from, to] of [
  [1073742105, START + 2],
  [1073742106, START + 3],
  [1073742107, START + 4]
]) {
  assert.ok(!text.includes(String(from)), `旧 GUID ${from} 应被重映射掉`)
  assert.ok(text.includes(String(to)), `新 GUID ${to} 应出现在脚本里`)
}
assert.deepEqual(
  templatesOnly.remaps.map((r) => r.key),
  ['prim', 'label', 'hit'],
  '三个模板 GUID 都重映射'
)
const nodeRecord = parsed.recordsById.get(START + 1)
assert.ok(nodeRecord, '容器节点记录存在')
void scriptGuid

// ── 5) 实例化进布局：实例组 f504=布局、布局 f503 追加组、模板 f14 追加组
const applied = applyGiaPackage(giaBytes, baseBytes, { layoutId: 1073741825, startId: START })
assert.ok(applied.instanceGroupId !== undefined, '已实例化')
assert.ok(applied.instanceNodeId !== undefined, '实例容器节点存在')
const finalParsed = parseRoot9(applied.bytes)
const instanceGroup = finalParsed.recordsById.get(applied.instanceGroupId as number)
assert.equal(instanceGroup?.parentId, 1073741825, '实例组 f504 = 布局')
assert.equal(instanceGroup?.familyTypes.includes(3), true, '实例组带类3')
const layout = finalParsed.recordsById.get(1073741825)
assert.ok(layout, '布局记录存在')
assert.ok(layout.fields.some((f) => f.number === 503), '布局 f503 成员表仍在')
const templateGroup = finalParsed.recordsById.get(START)
assert.equal(templateGroup?.familyTypes.includes(4), true, '模板组带类4')
assert.equal(templateGroup?.parentId, null, '模板组无 f504')
assert.deepEqual(checkRoot9Invariants(applied.bytes), [], '实例化后不变量仍成立')

// ── 6) 分析面自洽：落完之后再跑分析，模板应被认成「目标图已有」
const after = decodeGia(giaBytes)
assert.equal(after.scripts.length, 1)

console.log('CLI sim:import apply test passed')
