/**
 * ui/tests/create-candidates-assert.ts — create 候选字节级断言（票 05，多 kind）
 *
 * 运行：npx tsx ui/tests/create-candidates-assert.ts
 * 依赖：本地快照 .gsts/diff-exp/ui学习/（缺 SKIP，与 exhaustive 同约定）+ donor 已提取
 *       （先跑 npx tsx ui/tests/extract-create-donors.ts）。
 *
 * 断言层级（由强到弱）：
 *   A. donor 防漂移：CREATE_DONORS.hex 与来源快照记录原始字节逐字节一致（sha256 兜底），
 *      kind/parent/长度与样本事件结论一致；
 *   B. 重放对拍（最严）：80 快照内**单控件新建事件**全部重放——在 before 快照上用编辑器实际
 *      ID + 实际插入锚点重放 create → root9 段与编辑器 after 快照**逐字节相等**、其余顶层
 *      字段等值（唯一预期差异=root46 保存审计段等长改写）。事件清单：按钮 轮4(布局)/轮26(容器)、
 *      图文输入框 轮18→19(自定义布局 1989)、消息队列 轮50→51(默认布局)；
 *   B2. 容器面三件套（轮63→64 一次新建 3 控件，非单件事件）：textbox/image/input-box 各自
 *      重放后逐记录断言 + 宿主成员与编辑器一致；
 *   C. 跨面同构实证（轮64 规则 2）：input-box 布局 2079 与容器 2157 两真实样本互 remap 后
 *      字节相等——证明「内容与放置面无关、仅 f504 不同」；
 *   D. 分配器：空洞取最高空闲（轮4 after → 2031，mappings §8 例）；占用/越权报错；确定性；
 *   E. 参数 patch 语义回读 + textbox 布局面 donor 回退标记；
 *   F. resolveSurfaceTarget 归属/配对校验；
 *   G. 全量快照冒烟（禁抽查）：80 个 .gil × 5 kind 逐一 layout 面候选；含容器 2084 的快照
 *      × 3 kind 逐一 container 面候选；message-queue 容器面显式 fail-closed。
 */

import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import { CREATE_DONORS } from '../src/create-donors.js'
import type { UiCreateDonor } from '../src/create-donors.js'
import {
  allocateControlId,
  createLayoutCandidate,
  createUiCandidate,
  ownerFloatingPageId,
  resolveSurfaceTarget
} from '../src/create.js'
import type { CreateControlKind } from '../src/create.js'
import { parseRoot9 } from '../src/record.js'
import { buildSemanticView } from '../src/tree.js'
import { parseWireMessage } from '../../src/cli/static_assembly/wire.js'
import { remapUiRecordVarints } from '../../src/cli/gil_ui.js'

const ROOT = path.resolve(import.meta.dirname, '..', '..')
const FIXTURES = path.join(ROOT, '.gsts', 'diff-exp', 'ui学习')

if (!fs.existsSync(FIXTURES)) {
  console.log('SKIP: .gsts/diff-exp/ui学习/ 不存在（本地快照核验需真实差分留存）')
  process.exit(0)
}

if (CREATE_DONORS.length === 0) {
  console.error(
    'FAIL: CREATE_DONORS 为空（占位态）——先运行 npx tsx ui/tests/extract-create-donors.ts 提取真实 donor'
  )
  process.exit(1)
}

function load(file: string): Uint8Array {
  return new Uint8Array(fs.readFileSync(path.join(FIXTURES, file)))
}

function sha256(bytes: Uint8Array): string {
  return crypto.createHash('sha256').update(Buffer.from(bytes)).digest('hex')
}

/** 首个差异位置与两侧字节片段（对拍失败时定位用） */
function firstDiff(a: Uint8Array, b: Uint8Array): string {
  const len = Math.min(a.length, b.length)
  for (let i = 0; i < len; i++) {
    if (a[i] !== b[i]) {
      const from = Math.max(0, i - 8)
      const to = Math.min(a.length, i + 16)
      return `first diff @ ${i} (len ${a.length} vs ${b.length})\n` +
        `candidate: ${Buffer.from(a.subarray(from, to)).toString('hex')}\n` +
        `editor   : ${Buffer.from(b.subarray(from, to)).toString('hex')}`
    }
  }
  return `prefix equal, length differs: ${a.length} vs ${b.length}`
}

/**
 * 编辑器保存 = root9 变更 + root46 审计段等长改写（每轮差分笔记的「root46 等长审计」，
 * 非 UI 语义、无法也不应模拟）。因此对拍按顶层字段比较：
 *  - root9（field 9）必须逐字节相等（记录/顺序/宿主 f503 全含）；
 *  - 其余顶层字段必须逐字节相等，唯一例外 = field 46（等长、登记为预期差异）。
 */
function assertReplayEquals(candidate: Uint8Array, editor: Uint8Array, label: string): void {
  const parse = (bytes: Uint8Array) => parseWireMessage(bytes.subarray(20, bytes.length - 4))
  const left = parse(candidate)
  const right = parse(editor)
  assert.ok(left, 'candidate payload 解析失败')
  assert.ok(right, 'editor payload 解析失败')
  type Entry = NonNullable<typeof left>[number]
  const byNumber = (fields: NonNullable<typeof left>) => {
    const map = new Map<number, Entry>()
    for (const field of fields) map.set(field.number, field)
    return map
  }
  const a = byNumber(left)
  const b = byNumber(right)
  const numbers = [...new Set([...a.keys(), ...b.keys()])].sort((x, y) => x - y)
  const sameValue = (x: Entry, y: Entry): boolean =>
    x.wire === y.wire &&
    (typeof x.value === 'number'
      ? typeof y.value === 'number' && x.value === y.value
      : Buffer.from(x.value).equals(Buffer.from(y.value)))
  for (const num of numbers) {
    const av = a.get(num)
    const bv = b.get(num)
    assert.ok(av && bv, `${label}: 顶层字段 ${num} 仅一侧存在`)
    if (num === 46) {
      // root46 保存审计：等长即可，内容差异属编辑器保存噪声（预期字段差异）
      const avLen = typeof av.value === 'number' ? 0 : av.value.length
      const bvLen = typeof bv.value === 'number' ? 0 : bv.value.length
      assert.equal(avLen, bvLen, `${label}: root46 长度不一致`)
      continue
    }
    assert.equal(sameValue(av, bv), true, `${label}: 顶层字段 ${num} 不一致（wire ${av.wire}）`)
  }
}

function parse(bytes: Uint8Array) {
  return parseRoot9(bytes)
}

let passed = 0
function ok(label: string, fn: () => void): void {
  fn()
  passed += 1
  console.log(`ok ${passed} - ${label}`)
}

const DEFAULT_LAYOUT_ID = 1073741825
const LAYOUT_1989_ID = 1073741989
const CONTAINER_2084 = 1073742084
const ROUND4_AFTER = '1073741909.after-重启4-默认布局自定义按钮-e645aefb.gil'
const ROUND4_BEFORE = '1073741909.after-重启3-删除控件组详情-76ed6ae3.gil'
const ROUND19_AFTER = '1073741909.after-重启19-图文输入框-a81cbfbf.gil'
const ROUND19_BEFORE = '1073741909.after-重启18-右下角位置-2bed515e.gil'
const ROUND26_AFTER = '1073741909.after-重启26-悬浮页加按钮-f0ddb622.gil'
const ROUND26_BEFORE = '1073741909.after-重启25-悬浮页同步模板-a5cd7b9e.gil'
const ROUND51_AFTER = '1073741909.after-重启51-消息队列-536528cb.gil'
const ROUND51_BEFORE = '1073741909.after-重启50-同步初始生效-ad3a8d80.gil'
const ROUND64_AFTER = '1073741909.after-重启64-容器三控件-e4c92e39.gil'
const ROUND64_BEFORE = '1073741909.after-重启63-队列存模板同步-5572a5f9.gil'

function donorOf(id: UiCreateDonor['id']): UiCreateDonor {
  const donor = CREATE_DONORS.find((d) => d.id === id)
  assert.ok(donor, `donor 缺失: ${id}`)
  return donor
}

// ============ A. donor 防漂移（7 个真实样本） ============
for (const donor of CREATE_DONORS) {
  ok(`donor 防漂移: ${donor.id} (${donor.sourceSnapshot} #${donor.selfId})`, () => {
    const parsed = parse(load(donor.sourceSnapshot))
    const record = parsed.recordsById.get(donor.selfId)
    assert.ok(record, `donor 记录缺失: ${donor.selfId}`)
    assert.equal(record.kind, donor.kind, `kind 漂移: ${record.kind}`)
    assert.equal(record.parentId, donor.parentId, 'parent 漂移')
    assert.equal(record.raw.length, donor.hex.length / 2, 'donor hex 长度 != 快照记录')
    assert.equal(Buffer.from(donor.hex, 'hex').equals(Buffer.from(record.raw)), true, 'hex 漂移')
    assert.equal(sha256(record.raw), donor.sha256, 'sha256 漂移')
  })
}

ok('donor 集齐支持矩阵（7 样本 = 80 快照内全部单条新建事件）', () => {
  const ids = CREATE_DONORS.map((d) => d.id).sort()
  assert.deepEqual(ids, [
    'custom-button.container',
    'custom-button.layout',
    'image.container',
    'input-box.container',
    'input-box.layout',
    'message-queue.layout',
    'textbox.container'
  ])
})

// ============ B. 单件新建事件整段重放（最严） ============
/** 取 after 快照中 recordId 的物理前驱（编辑器真实插入锚点），再在 before 快照上重放 */
function replayExact(
  label: string,
  donor: UiCreateDonor,
  beforeFile: string,
  afterFile: string,
  surface: { kind: 'layout'; layoutId: number } | { kind: 'container'; containerId: number }
): void {
  ok(label, () => {
    const before = load(beforeFile)
    const after = load(afterFile)
    const afterParsed = parse(after)
    const afterOrder = afterParsed.records.map((r) => r.id)
    const at = afterOrder.indexOf(donor.selfId)
    assert.ok(at >= 0, `after 快照无记录 ${donor.selfId}`)
    assert.ok(at > 0, `after 快照中 ${donor.selfId} 是首条记录，无前驱锚点`)
    const anchor = afterOrder[at - 1]
    const result = createUiCandidate(before, {
      kind: donor.kind,
      surface,
      id: donor.selfId,
      insertAfterId: anchor
    })
    assertReplayEquals(result.bytes, after, label)
  })
}

replayExact(
  `重放对拍: 布局自定义按钮（轮3→轮4；root9 全等 + root46 审计登记）`,
  donorOf('custom-button.layout'),
  ROUND4_BEFORE,
  ROUND4_AFTER,
  { kind: 'layout', layoutId: DEFAULT_LAYOUT_ID }
)

replayExact(
  `重放对拍: 悬浮页容器自定义按钮（轮25→轮26）`,
  donorOf('custom-button.container'),
  ROUND26_BEFORE,
  ROUND26_AFTER,
  { kind: 'container', containerId: CONTAINER_2084 }
)

replayExact(
  `重放对拍: 图文输入框→自定义布局1989（轮18→轮19）`,
  donorOf('input-box.layout'),
  ROUND19_BEFORE,
  ROUND19_AFTER,
  { kind: 'layout', layoutId: LAYOUT_1989_ID }
)

replayExact(
  `重放对拍: 消息队列→默认布局（轮50→轮51）`,
  donorOf('message-queue.layout'),
  ROUND51_BEFORE,
  ROUND51_AFTER,
  { kind: 'layout', layoutId: DEFAULT_LAYOUT_ID }
)

// ============ B2. 容器面三件套（轮63→64 一次新建 3 控件） ============
ok('重放对拍: 容器面 textbox/image/input-box（轮63→64 三件套逐件重放）', () => {
  const before = load(ROUND64_BEFORE)
  const beforeParsed = parse(before)
  const beforeIds = new Set(beforeParsed.records.map((r) => r.id))
  const afterParsed = parse(load(ROUND64_AFTER))
  const afterOrder = afterParsed.records.map((r) => r.id)
  const trios = ['textbox.container', 'image.container', 'input-box.container'] as const
  const siblings = new Set(trios.map((id) => donorOf(id).selfId))
  for (const donorId of trios) {
    const donor = donorOf(donorId)
    // 锚点 = after 序中该记录之前、且存在于 before 的最近记录（兄弟新记录不可作锚点）
    const at = afterOrder.indexOf(donor.selfId)
    let anchor: number | undefined
    for (let i = at - 1; i >= 0; i--) {
      if (beforeIds.has(afterOrder[i])) {
        anchor = afterOrder[i]
        break
      }
    }
    assert.ok(anchor !== undefined, `${donor.id}: before 中无可用锚点`)
    const result = createUiCandidate(before, {
      kind: donor.kind,
      surface: { kind: 'container', containerId: CONTAINER_2084 },
      id: donor.selfId,
      insertAfterId: anchor
    })
    const candParsed = parse(result.bytes)
    const afterRecord = afterParsed.recordsById.get(donor.selfId)
    const candRecord = candParsed.recordsById.get(donor.selfId)
    assert.ok(afterRecord && candRecord, `${donor.id}: 记录缺失`)
    // 新记录与编辑器样本逐字节一致（donor 同源 + 插入/宿主更新无副作用）
    assert.equal(
      Buffer.from(candRecord.raw).equals(Buffer.from(afterRecord.raw)),
      true,
      `${donor.id}: 候选记录 ≠ 编辑器样本`
    )
    // 宿主容器 2084 成员：候选=before+1；编辑器=before+3；候选 == 编辑器成员剔除两个兄弟 ID
    const beforeMembers = packed(
      parse(before).recordsById.get(CONTAINER_2084)!.fields.find((f) => f.number === 503)!
        .value as Uint8Array
    )
    const candMembers = packed(
      candParsed.recordsById.get(CONTAINER_2084)!.fields.find((f) => f.number === 503)!
        .value as Uint8Array
    )
    const afterMembers = packed(
      afterParsed.recordsById.get(CONTAINER_2084)!.fields.find((f) => f.number === 503)!
        .value as Uint8Array
    )
    assert.deepEqual(candMembers, [...beforeMembers, donor.selfId])
    const withoutSiblings = afterMembers.filter(
      (m) => !siblings.has(m) || m === donor.selfId
    )
    assert.deepEqual(
      candMembers,
      withoutSiblings,
      `${donor.id}: 候选宿主成员 ≠ 编辑器成员剔除兄弟`
    )
    // 其余既有记录零改动
    for (const r of parse(before).records) {
      if (r.id === CONTAINER_2084) continue
      const same = candParsed.recordsById.get(r.id)
      assert.ok(same, `${donor.id}: 既有记录消失 ${r.id}`)
      assert.equal(
        Buffer.from(same.raw).equals(Buffer.from(r.raw)),
        true,
        `${donor.id}: 既有记录被改动 ${r.id}`
      )
    }
  }
})

// ============ C. 跨面同构实证（轮64 规则 2） ============
ok('跨面同构: input-box 布局 2079 ↔ 容器 2157 互 remap 后逐字节相等（仅 f504/自身 ID 差）', () => {
  const layoutDonor = donorOf('input-box.layout')
  const containerDonor = donorOf('input-box.container')
  // 容器样本 → 布局样本：自身 ID 2157→2079、父 2084→1989
  const remapped = remapUiRecordVarints(Buffer.from(containerDonor.hex, 'hex'), {
    [containerDonor.selfId]: layoutDonor.selfId,
    [containerDonor.parentId]: layoutDonor.parentId
  })
  assert.equal(
    Buffer.from(remapped).equals(Buffer.from(layoutDonor.hex, 'hex')),
    true,
    '容器样本 remap ≠ 布局样本（跨面同构不成立）'
  )
})

// ============ D. 分配器 ============
ok('分配器: 编辑器跳变空洞取最高空闲（轮4 after → 2031，mappings §8 例）', () => {
  const parsed = parse(load(ROUND4_AFTER))
  const id = allocateControlId(parsed)
  assert.equal(id, 1073742031)
})

ok('分配器: 结果不与任何记录/索引/引用冲突', () => {
  const parsed = parse(load(ROUND26_AFTER))
  const id = allocateControlId(parsed)
  assert.ok(!parsed.recordsById.has(id), `新 ID 撞记录: ${id}`)
  assert.ok(!parsed.indexIds.has(id), `新 ID 撞顶层索引: ${id}`)
})

ok('分配器: 显式 --id 已被占用时报错', () => {
  const parsed = parse(load(ROUND26_AFTER))
  assert.throws(() => allocateControlId(parsed, donorOf('custom-button.container').selfId), /已被占用/)
})

ok('分配器: 确定性（同文件两次一致）', () => {
  const parsed = parse(load(ROUND26_BEFORE))
  assert.equal(allocateControlId(parsed), allocateControlId(parse(load(ROUND26_BEFORE))))
})

// ============ E. 参数 patch + 回退标记 ============
ok('参数 patch: custom-button --name/--position/--size 语义回读 + 宿主成员 + 其余零改动', () => {
  const before = load(ROUND4_BEFORE)
  const beforeParsed = parse(before)
  const id = allocateControlId(beforeParsed)
  assert.ok(id !== donorOf('custom-button.layout').selfId)
  const result = createUiCandidate(before, {
    kind: 'custom-button',
    surface: { kind: 'layout', layoutId: DEFAULT_LAYOUT_ID },
    id,
    name: '测试按钮甲',
    position: [920, 300],
    size: [240, 80]
  })
  const after = parse(result.bytes)
  const record = after.recordsById.get(id)
  assert.ok(record, `候选记录缺失: ${id}`)
  assert.equal(record.kind, 'custom-button')
  assert.equal(record.name, '测试按钮甲')
  assert.equal(record.parentId, DEFAULT_LAYOUT_ID)
  const memberField = after.recordsById.get(DEFAULT_LAYOUT_ID)!.fields.find(
    (f) => f.number === 503 && f.wire === 2
  )!
  assert.ok(packed(memberField.value as Uint8Array).includes(id), `布局 f503 未含 ${id}`)
  const view = buildSemanticView(result.bytes)
  const node = view.flat.find((n) => n.id === id)
  assert.ok(node?.geometry, `geometry 缺失 id=${id}`)
  assert.ok(Math.abs(node.geometry!.position![0] - 920) < 0.05, 'position.x')
  assert.ok(Math.abs(node.geometry!.position![1] - 300) < 0.05, 'position.y')
  assert.ok(Math.abs(node.geometry!.size![0] - 240) < 0.05, 'size.w')
  assert.ok(Math.abs(node.geometry!.size![1] - 80) < 0.05, 'size.h')
  assert.equal(after.records.length, beforeParsed.records.length + 1)
  for (const r of beforeParsed.records) {
    if (r.id === DEFAULT_LAYOUT_ID) continue
    const same = after.recordsById.get(r.id)
    assert.ok(same, `既有记录消失: ${r.id}`)
    assert.equal(Buffer.from(same.raw).equals(Buffer.from(r.raw)), true, `既有记录被改动: ${r.id}`)
  }
})

ok('donor 回退: textbox/image 布局面 = 容器 donor + f504 重映射（跨面同构轮64 规则 2）', () => {
  const before = load(ROUND4_BEFORE)
  for (const kind of ['textbox', 'image'] as const) {
    const result = createUiCandidate(before, {
      kind,
      surface: { kind: 'layout', layoutId: DEFAULT_LAYOUT_ID },
      name: kind === 'textbox' ? '测试文本框' : '测试图片'
    })
    assert.equal(result.donorSurface, 'container', `${kind}: 应回退容器 donor`)
    assert.equal(result.donorFallback, true, `${kind}: 应带回退标记`)
    const after = parse(result.bytes)
    const record = after.recordsById.get(result.newId)
    assert.ok(record, `${kind}: 候选记录缺失`)
    assert.equal(record.kind, kind)
    assert.equal(record.parentId, DEFAULT_LAYOUT_ID)
    assert.equal(record.name, kind === 'textbox' ? '测试文本框' : '测试图片')
    const memberField = after.recordsById.get(DEFAULT_LAYOUT_ID)!.fields.find(
      (f) => f.number === 503 && f.wire === 2
    )!
    assert.ok(packed(memberField.value as Uint8Array).includes(result.newId), `${kind}: f503 未含`)
  }
})

// ============ F. Surface 解析校验 ============
ok('resolveSurfaceTarget: container 面归属校验（非容器记录拒绝）', () => {
  const parsed = parse(load(ROUND4_AFTER))
  assert.throws(
    () => resolveSurfaceTarget(parsed, `container:${DEFAULT_LAYOUT_ID}`),
    /不是悬浮页容器/
  )
  const parsed26 = parse(load(ROUND26_BEFORE))
  assert.throws(() => resolveSurfaceTarget(parsed26, 'container:1073742085'), /不是悬浮页容器/)
})

ok('resolveSurfaceTarget: 悬浮页:容器 双段校验（页-容器配对）', () => {
  const parsed = parse(load(ROUND26_BEFORE))
  const surface = resolveSurfaceTarget(parsed, `container:${CONTAINER_2084}`)
  assert.deepEqual(surface, { kind: 'container', containerId: CONTAINER_2084 })
  const paired = resolveSurfaceTarget(parsed, '悬浮页:1073742083:1073742084')
  assert.deepEqual(paired, { kind: 'container', containerId: CONTAINER_2084 })
  assert.throws(
    () => resolveSurfaceTarget(parsed, '悬浮页:1073742086:1073742084'),
    /不在悬浮页 .* 的容器列表/
  )
  const parsed28 = parse(load('1073741909.after-重启28-悬浮按钮状态素材-127e82c2.gil'))
  assert.throws(
    () => resolveSurfaceTarget(parsed28, 'container:1073742091'),
    /不是悬浮页容器|不属于任何悬浮页/
  )
})

// ============ G. 全量 80 快照逐文件冒烟（禁抽查） ============
/** 对单个快照做一次候选生成并断言不变式：+1 记录 / 宿主 f503 含新 ID / 其余记录零改动 */
function assertCandidateInvariants(
  file: string,
  kind: CreateControlKind,
  parentId: number
): void {
  const before = load(file)
  const beforeParsed = parse(before)
  const id = allocateControlId(beforeParsed)
  const result = createUiCandidate(before, {
    kind,
    surface: parentId === DEFAULT_LAYOUT_ID
      ? { kind: 'layout', layoutId: parentId }
      : { kind: 'container', containerId: parentId }
  })
  const afterParsed = parse(result.bytes)
  assert.ok(afterParsed.recordsById.has(id), `${file}/${kind}: 候选记录缺失 ${id}`)
  assert.equal(
    afterParsed.records.length,
    beforeParsed.records.length + 1,
    `${file}/${kind}: 记录数未 +1`
  )
  const owner = afterParsed.recordsById.get(parentId)
  assert.ok(owner, `${file}/${kind}: 宿主记录缺失 ${parentId}`)
  const memberField = owner.fields.find((f) => f.number === 503 && f.wire === 2)
  assert.ok(memberField, `${file}/${kind}: 宿主无 f503`)
  assert.ok(packed(memberField.value as Uint8Array).includes(id), `${file}/${kind}: f503 未含`)
  for (const r of beforeParsed.records) {
    if (r.id === parentId) continue
    const same = afterParsed.recordsById.get(r.id)
    assert.ok(same, `${file}/${kind}: 既有记录消失 ${r.id}`)
    assert.equal(
      Buffer.from(same.raw).equals(Buffer.from(r.raw)),
      true,
      `${file}/${kind}: 既有记录被改动 ${r.id}`
    )
  }
}

const LAYOUT_KINDS: readonly CreateControlKind[] = [
  'custom-button',
  'textbox',
  'image',
  'input-box',
  'message-queue'
]
const CONTAINER_KINDS: readonly CreateControlKind[] = ['custom-button', 'textbox', 'image', 'input-box']

ok('全量快照: 80 个文件 × 5 kind 逐一 layout 面候选冒烟（禁抽查）', () => {
  const files = fs
    .readdirSync(FIXTURES)
    .filter((f) => f.endsWith('.gil'))
    .sort()
  assert.equal(files.length, 80, `快照数 != 80（实际 ${files.length}）`)
  for (const file of files) {
    for (const kind of LAYOUT_KINDS) {
      assertCandidateInvariants(file, kind, DEFAULT_LAYOUT_ID)
    }
  }
})

ok('全量快照: 含悬浮页固有容器 2084 的快照 × 4 kind 逐一 container 面候选冒烟', () => {
  const files = fs
    .readdirSync(FIXTURES)
    .filter((f) => f.endsWith('.gil'))
    .sort()
  let covered = 0
  let skipped = 0
  for (const file of files) {
    const parsed = parse(load(file))
    if (!parsed.recordsById.has(CONTAINER_2084) || ownerFloatingPageId(parsed, CONTAINER_2084) === undefined) {
      skipped += 1
      continue
    }
    for (const kind of CONTAINER_KINDS) {
      assertCandidateInvariants(file, kind, CONTAINER_2084)
    }
    covered += 1
  }
  console.log(`  (container 面覆盖 ${covered} 个快照，跳过 ${skipped} 个无 2084/无归属)`)
})

ok('fail-closed: message-queue 容器面无样本 → 显式报错（不猜字节）', () => {
  const parsed = parse(load(ROUND51_AFTER))
  assert.ok(ownerFloatingPageId(parsed, CONTAINER_2084) !== undefined)
  assert.throws(
    () =>
      createUiCandidate(load(ROUND51_AFTER), {
        kind: 'message-queue',
        surface: { kind: 'container', containerId: CONTAINER_2084 }
      }),
    /message-queue 容器面无编辑器新建样本/
  )
})

// ============ H. 布局创建（轮1/2 双样本重放 + 全量冒烟） ============
const ROUND1_BEFORE = '1073741909.before-重启1-60a8692d.gil'
const ROUND1_AFTER = '1073741909.after-重启1-自定义布局-987a4388.gil'
const ROUND2_BEFORE = ROUND1_AFTER
const ROUND2_AFTER = '1073741909.after-重启2-自定义布局2-872ec254.gil'

ok('布局创建: 轮0→轮1 重放（新布局 1989 + 14 官方克隆，root9 全等 + root46 审计登记）', () => {
  const before = load(ROUND1_BEFORE)
  const after = load(ROUND1_AFTER)
  const result = createLayoutCandidate(before, { name: '自定义布局' })
  assert.equal(result.layoutId, 1073741989)
  assert.equal(result.officialsCount, 14)
  assert.equal(result.memberIds.length, 14)
  assert.equal(result.memberIds[0], 1073741990)
  assert.equal(result.memberIds[13], 1073742003)
  assertReplayEquals(result.bytes, after, '布局创建 轮1')
})

ok('布局创建: 轮1→轮2 重放（重名自动去重 _1，新布局 2004 + 14 克隆）', () => {
  const before = load(ROUND2_BEFORE)
  const after = load(ROUND2_AFTER)
  const result = createLayoutCandidate(before, { name: '自定义布局' })
  assert.equal(result.name, '自定义布局_1')
  assert.equal(result.layoutId, 1073742004)
  assert.equal(result.memberIds.length, 14)
  assert.equal(result.memberIds[13], 1073742018)
  assertReplayEquals(result.bytes, after, '布局创建 轮2')
})

ok('全量快照: 80 个文件逐一布局创建冒烟（+1+14 记录/成员/父引用/其余零改动）', () => {
  const files = fs
    .readdirSync(FIXTURES)
    .filter((f) => f.endsWith('.gil'))
    .sort()
  assert.equal(files.length, 80)
  for (const file of files) {
    const before = load(file)
    const beforeParsed = parse(before)
    const defaultMeta = beforeParsed.recordsById.get(DEFAULT_LAYOUT_ID)
    assert.ok(defaultMeta, `${file}: 无默认布局`)
    const f503 = defaultMeta!.fields.find((f) => f.number === 503 && f.wire === 2)
    assert.ok(f503, `${file}: 默认布局无成员`)
    const members = f503 ? packed(f503.value as Uint8Array) : []
    const officialCount = members.filter(
      (id) => beforeParsed.recordsById.get(id)?.kind === 'official'
    ).length
    assert.ok(officialCount >= 1, `${file}: 无官方预置`)
    const result = createLayoutCandidate(before, { name: `布局冒烟${file.slice(0, 4)}` })
    const afterParsed = parse(result.bytes)
    assert.ok(afterParsed.recordsById.has(result.layoutId), `${file}: 布局记录缺失`)
    assert.equal(
      afterParsed.records.length,
      beforeParsed.records.length + 1 + result.memberIds.length,
      `${file}: 记录数增量错误`
    )
    // 新布局成员 = 克隆 ID；克隆父引用 = 新布局
    const layoutRec = afterParsed.recordsById.get(result.layoutId)!
    const memberField = layoutRec.fields.find((f) => f.number === 503 && f.wire === 2)!
    const layoutMembers = packed(memberField.value as Uint8Array)
    assert.deepEqual(layoutMembers, result.memberIds, `${file}: 成员列表`)
    for (const id of result.memberIds) {
      const clone = afterParsed.recordsById.get(id)
      assert.ok(clone, `${file}: 克隆缺失 ${id}`)
      assert.equal(clone.parentId, result.layoutId, `${file}: 克隆父引用 ${id}`)
      assert.equal(clone.kind, 'official', `${file}: 克隆 kind ${id}`)
    }
    // 既有记录逐字节零改动（索引字段非 502 记录，不在 records 集合内）
    for (const r of beforeParsed.records) {
      const same = afterParsed.recordsById.get(r.id)
      assert.ok(same, `${file}: 既有记录消失 ${r.id}`)
      assert.equal(Buffer.from(same.raw).equals(Buffer.from(r.raw)), true, `${file}: 既有记录被改动`)
    }
  }
})

function packed(data: Uint8Array): number[] {
  const out: number[] = []
  let offset = 0
  const read = (): number => {
    let value = 0
    let shift = 0
    while (offset < data.length) {
      const byte = data[offset++]
      value |= (byte & 0x7f) << shift
      if ((byte & 0x80) === 0) return value
      shift += 7
    }
    return value
  }
  while (offset < data.length) out.push(read())
  return out
}

console.log(`PASS ${passed} create-candidate assertions`)
