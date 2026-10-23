/**
 * ui/tests/client-container-create-assert.ts — 「空客户端控件容器」候选断言（2026-10-23 hl 差分）
 *
 * 运行：npx tsx ui/tests/client-container-create-assert.ts
 * 依赖：本地证据快照 $GTS_EVIDENCE_HOME/ui-layout-attach/2026-10-23-hl-container/raw/
 *       （缺文件 SKIP，与其它 80 快照断言同一约定）。
 *
 * 断言层级：
 *   A. donor 防漂移：donor.hex 的 sha256 与登记值一致；
 *   B. 两件套装配：create 后 root9 +2 条记录，容器组 f502=23、子控件 f502=86，
 *      容器组引用子 ID、容器组父引用=目标布局，布局 f503 成员列表**尾部追加**容器组 ID；
 *   C. 往返：对候选执行 delete → 与原始字节**逐字节相等**（create/delete 互为逆运算）。
 */

import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import { deleteUiControl } from '../../src/cli/gil_ui.js'
import {
  CLIENT_CONTAINER_CHILD_DONOR,
  CLIENT_CONTAINER_GROUP_DONOR
} from '../src/create-donors-client-container.js'
import { createClientContainerCandidate } from '../src/create.js'
import { parseRoot9, packedVarints } from '../src/record.js'

const EVIDENCE =
  process.env.GTS_EVIDENCE_HOME ?? path.join(process.env.HOME ?? '', 'genshin-ts-evidence')
const SNAPSHOT = path.join(
  EVIDENCE,
  'ui-layout-attach',
  '2026-10-23-hl-container',
  'raw',
  'hl-v2-remove-template.gil'
)

if (!fs.existsSync(SNAPSHOT)) {
  console.log(`SKIP: 证据快照不存在 ${SNAPSHOT}`)
  process.exit(0)
}

const sha = (b: Uint8Array) => crypto.createHash('sha256').update(b).digest('hex')
const LAYOUT = 1073741825

// A. donor 防漂移
assert.equal(sha(Buffer.from(CLIENT_CONTAINER_GROUP_DONOR.hex, 'hex')), CLIENT_CONTAINER_GROUP_DONOR.sha256)
assert.equal(sha(Buffer.from(CLIENT_CONTAINER_CHILD_DONOR.hex, 'hex')), CLIENT_CONTAINER_CHILD_DONOR.sha256)

const original = new Uint8Array(fs.readFileSync(SNAPSHOT))
const result = createClientContainerCandidate(original, { surface: { kind: 'layout', layoutId: LAYOUT } })

// B. 两件套装配
const before = parseRoot9(original)
const after = parseRoot9(result.bytes)
assert.equal(after.records.length, before.records.length + 2, '应新增 2 条记录')

const group = after.recordsById.get(result.containerId)
const child = after.recordsById.get(result.childId)
assert.ok(group, '容器组记录存在')
assert.ok(child, '子控件记录存在')

// f502 varint tag = 0xB0 0x1F；容器组=23（isGroup）、容器节点=86（普通控件）
const tag502_23 = Buffer.from([0xb0, 0x1f, 0x17])
const tag502_86 = Buffer.from([0xb0, 0x1f, 0x56])
assert.ok(Buffer.from(group!.raw).includes(tag502_23), '容器组 f502=23（isGroup）')
assert.ok(Buffer.from(child!.raw).includes(tag502_86), '子控件 f502=86（普通控件）')
assert.equal(result.parentId, LAYOUT, '容器组父引用=目标布局')

const layout = after.recordsById.get(LAYOUT)
const members = layout!.fields.filter((f) => f.number === 503 && f.wire === 2).flatMap((f) => packedVarints(f.value as Uint8Array))
assert.equal(members[members.length - 1], result.containerId, '布局成员列表尾部追加容器组 ID')
assert.ok(!members.includes(result.childId), '子控件不进布局成员列表')

// C. 往返：delete → 与原始字节相等
const back = deleteUiControl(result.bytes, result.containerId, { orphanOk: true })
assert.equal(sha(back.bytes), sha(original), 'create+delete 应逐字节还原')

console.log(`PASS client-container: container=${result.containerId} child=${result.childId} members=${members.length}`)
