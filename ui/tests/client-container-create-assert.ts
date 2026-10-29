/**
 * ui/tests/client-container-create-assert.ts — 「客户端控件容器」四件套候选断言
 *
 * 运行：npx tsx ui/tests/client-container-create-assert.ts
 * 依赖：`workspace/flower-tea/device-package/1073741843.before-import-20261029.gil`（干净图骨架快照）。
 *
 * 2026-10-29 更新：donor 从「2 件套（布局组+节点）」升级为「4 件套」——
 *   模板组 + 模板节点（模板区，无 f504，模板族 f14 记实例）+ 布局实例组 + 布局节点
 *   （布局实例组 f504=布局、族 3 引用模板组；布局节点不进布局成员表）。
 *   旧断言（2 条记录 / 旧 donor 常量名）已随 donor 改名失效，本文件同步重写。
 *
 * 断言层级：
 *   A. donor 防漂移：4 个 donor 的 hex sha256 与登记值一致；
 *   B. 四件套装配：root9 +4 条；模板组无 f504 且 f14 实例列表含布局实例组；布局实例组 f504=布局、
 *      族 3 描述符引用模板组；布局 f503 **尾部追加**布局实例组、容器节点不在成员表；
 *   C. 挂载槽清空：两个节点记录的 f74 槽都已清空（不继承 donor 里的旧 main 挂载）；
 *   D. 往返：delete 布局实例（模板保留）→ delete 模板组 → 与原始字节**逐字节相等**。
 */

import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import { parseScriptMounts } from '../../src/cli/gil_scripts.js'
import { deleteUiControl } from '../../src/cli/gil_ui.js'
import { parseWireMessage } from '../../src/cli/static_assembly/wire.js'
import {
  CLIENT_CONTAINER_LAYOUT_CHILD_DONOR,
  CLIENT_CONTAINER_LAYOUT_GROUP_DONOR,
  CLIENT_CONTAINER_TEMPLATE_CHILD_DONOR,
  CLIENT_CONTAINER_TEMPLATE_GROUP_DONOR
} from '../src/create-donors-client-container.js'
import { createClientContainerCandidate } from '../src/create.js'
import { extractMemberIds, firstVarint, parseRoot9, packedVarints } from '../src/record.js'

const ROOT = path.resolve(import.meta.dirname, '..', '..')
const SNAPSHOT = path.join(
  ROOT,
  'workspace',
  'flower-tea',
  'device-package',
  '1073741843.before-import-20261029.gil'
)

if (!fs.existsSync(SNAPSHOT)) {
  console.log(`SKIP: 干净骨架快照不存在 ${SNAPSHOT}`)
  process.exit(0)
}

const sha = (b: Uint8Array) => crypto.createHash('sha256').update(b).digest('hex')
const LAYOUT = 1073741825

// A. donor 防漂移（4 个 donor）
for (const [name, donor] of [
  ['template-group', CLIENT_CONTAINER_TEMPLATE_GROUP_DONOR],
  ['template-child', CLIENT_CONTAINER_TEMPLATE_CHILD_DONOR],
  ['layout-group', CLIENT_CONTAINER_LAYOUT_GROUP_DONOR],
  ['layout-child', CLIENT_CONTAINER_LAYOUT_CHILD_DONOR]
] as const) {
  assert.equal(sha(Buffer.from(donor.hex, 'hex')), donor.sha256, `${name} donor sha 漂移`)
}

const original = new Uint8Array(fs.readFileSync(SNAPSHOT))
const result = createClientContainerCandidate(original, {
  surface: { kind: 'layout', layoutId: LAYOUT }
})
const before = parseRoot9(original)
const after = parseRoot9(result.bytes)

// B. 四件套装配
assert.equal(
  after.records.length,
  before.records.length + 4,
  '应新增 4 条记录（模板组/节点 + 布局组/节点）'
)
const templateGroup = after.recordsById.get(result.templateGroupId)
const templateChild = after.recordsById.get(result.templateChildId)
const layoutGroup = after.recordsById.get(result.containerId)
const layoutChild = after.recordsById.get(result.childId)
assert.ok(templateGroup && templateChild && layoutGroup && layoutChild, '四条记录都存在')

assert.equal(templateGroup!.parentId, null, '模板组没有 f504（模板根）')
assert.equal(templateChild!.parentId, null, '模板节点没有 f504（由组内 f73 引用）')
assert.equal(layoutGroup!.parentId, LAYOUT, '布局实例组 f504=布局')
assert.equal(layoutChild!.parentId, null, '布局实例节点没有 f504')
assert.ok(templateGroup!.familyTypes.includes(4), '模板组族描述符=4')
assert.ok(layoutGroup!.familyTypes.includes(3), '布局实例组族描述符=3')

// 布局实例组 f13 引用模板组
const templateRef = (() => {
  for (const field of layoutGroup!.fields) {
    if (field.number !== 502 || field.wire !== 2) continue
    const sub = parseWireMessage(field.value as Uint8Array)
    if (!sub || firstVarint(sub, 501) !== 3) continue
    const ref = sub.find((f) => f.number === 13 && f.wire === 2)
    const refMsg = ref ? parseWireMessage(ref.value as Uint8Array) : undefined
    if (refMsg) return firstVarint(refMsg, 501)
  }
  return undefined
})()
assert.equal(templateRef, result.templateGroupId, '布局实例组 f13 引用模板组')

// 模板族 f14 实例列表含布局实例组
const instanceIds = (() => {
  for (const field of templateGroup!.fields) {
    if (field.number !== 502 || field.wire !== 2) continue
    const sub = parseWireMessage(field.value as Uint8Array)
    if (!sub || firstVarint(sub, 501) !== 4) continue
    const list = sub.find((f) => f.number === 14 && f.wire === 2)
    const listMsg = list ? parseWireMessage(list.value as Uint8Array) : undefined
    const payload = listMsg?.find((f) => f.number === 501 && f.wire === 2)
    return payload ? packedVarints(payload.value as Uint8Array) : []
  }
  return []
})()
assert.deepEqual(instanceIds, [result.containerId], '模板 f14 实例列表 = 布局实例组')

const layout = after.recordsById.get(LAYOUT)
const members = extractMemberIds(layout!.fields)
assert.equal(members[members.length - 1], result.containerId, '布局 f503 尾部追加布局实例组')
assert.ok(!members.includes(result.childId), '容器节点不进布局成员表')

// 父子双向：组内成员表引用节点
assert.ok(extractMemberIds(layoutGroup!.fields).includes(result.childId), '布局实例组成员表引用布局节点')
assert.ok(
  extractMemberIds(templateGroup!.fields).includes(result.templateChildId),
  '模板组成员表引用模板节点'
)

// C. 挂载槽清空（不继承 donor 里的旧脚本挂载）
const mounts = parseScriptMounts(result.bytes.slice(20, result.bytes.length - 4))
for (const id of [result.templateChildId, result.childId]) {
  assert.ok(!mounts.some((mount) => mount.hostGuid === id), `节点 ${id} 的 f74 挂载槽应为空`)
}

// D. 往返：删布局实例（模板保留）→ 删模板组 → 逐字节还原
const afterLayoutDelete = deleteUiControl(result.bytes, result.containerId, { orphanOk: true })
assert.equal(
  parseRoot9(afterLayoutDelete.bytes).records.length,
  before.records.length + 2,
  '删布局实例后模板组/节点保留'
)
assert.ok(parseRoot9(afterLayoutDelete.bytes).recordsById.has(result.templateGroupId), '模板组仍在')
const back = deleteUiControl(afterLayoutDelete.bytes, result.templateGroupId, { orphanOk: true })
assert.equal(sha(back.bytes), sha(original), 'create+两段 delete 应逐字节还原')

console.log(
  `PASS client-container: template=${result.templateGroupId}/${result.templateChildId} ` +
    `layout=${result.containerId}/${result.childId} members=${members.length} mounts=0 byteRoundTrip=exact`
)
