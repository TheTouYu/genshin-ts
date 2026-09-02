/**
 * ui/tests/create-candidates-assert.ts — create 候选字节级断言（票 05）
 *
 * 运行：npx tsx ui/tests/create-candidates-assert.ts
 * 依赖：本地快照 .gsts/diff-exp/ui学习/（缺 SKIP，与 exhaustive 同约定）+ donor 已提取
 *       （先跑 npx tsx ui/tests/extract-create-donors.ts）。
 *
 * 断言层级（由强到弱）：
 *   A. donor 防漂移：CREATE_DONORS.hex 与来源快照记录原始字节逐字节一致（sha256 兜底）；
 *   B. 重放对拍（最严）：在 before 快照上用编辑器实际 ID + 实际插入锚点重放 create
 *      → root9 段与编辑器 after 快照**逐字节相等**、其余顶层字段等值
 *      （唯一预期差异=root46 保存审计段等长改写，差分轮笔记已登记）；布局轮4 / 悬浮页轮26 各一对；
 *   C. 分配器：空洞取最高空闲（轮4 after 文件的 2019..2031 → 2031，mappings §8 例）；
 *      占用/越权显式报错；确定性；
 *   D. 参数 patch（名字/位置/尺寸）语义回读：kind/role/name/geometry/parent 正确、
 *      宿主成员追加、其余记录字节零改动（patch 的字节级对拍无同参编辑器样本，
 *      属结构层证据，行为层留待编辑器/游戏核验）。
 */

import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import { CREATE_DONORS } from '../src/create-donors.js'
import {
  allocateControlId,
  createButtonCandidate,
  resolveSurfaceTarget
} from '../src/create.js'
import { parseRoot9 } from '../src/record.js'
import { buildSemanticView } from '../src/tree.js'
import { parseWireMessage } from '../../src/cli/static_assembly/wire.js'

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
    assert.equal(
      sameValue(av, bv),
      true,
      `${label}: 顶层字段 ${num} 不一致（wire ${av.wire}）`
    )
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
const CONTAINER_2084 = 1073742084
const ROUND4_AFTER = '1073741909.after-重启4-默认布局自定义按钮-e645aefb.gil'
const ROUND4_BEFORE = '1073741909.after-重启3-删除控件组详情-76ed6ae3.gil'
const ROUND26_AFTER = '1073741909.after-重启26-悬浮页加按钮-f0ddb622.gil'
const ROUND26_BEFORE = '1073741909.after-重启25-悬浮页同步模板-a5cd7b9e.gil'

// ============ A. donor 防漂移 ============
for (const donor of CREATE_DONORS) {
  ok(`donor 防漂移: ${donor.id} (${donor.sourceSnapshot} #${donor.selfId})`, () => {
    const parsed = parse(load(donor.sourceSnapshot))
    const record = parsed.recordsById.get(donor.selfId)
    assert.ok(record, `donor 记录缺失: ${donor.selfId}`)
    assert.equal(record.raw.length, donor.hex.length / 2, 'donor hex 长度 != 快照记录')
    assert.equal(Buffer.from(donor.hex, 'hex').equals(Buffer.from(record.raw)), true, 'hex 漂移')
    assert.equal(sha256(record.raw), donor.sha256, 'sha256 漂移')
  })
}

// ============ B. 整文件重放 ============
/** 取 after 快照中 recordId 的物理前驱（编辑器真实插入锚点），再在 before 快照上重放 */
function replayExact(
  label: string,
  donor: { id: 'custom-button.layout' | 'custom-button.container'; selfId: number },
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
    const result = createButtonCandidate(before, {
      surface,
      id: donor.selfId,
      insertAfterId: anchor
    })
    assertReplayEquals(result.bytes, after, label)
  })
}

ok('donor 集齐两个放置面（布局/容器）', () => {
  const ids = CREATE_DONORS.map((d) => d.id).sort()
  assert.deepEqual(ids, ['custom-button.container', 'custom-button.layout'])
})

const layoutDonor = CREATE_DONORS.find((d) => d.id === 'custom-button.layout')!
const containerDonor = CREATE_DONORS.find((d) => d.id === 'custom-button.container')!

replayExact(
  `重放对拍: 布局按钮（轮4 ${ROUND4_BEFORE} → ${ROUND4_AFTER}；root9 全等 + root46 审计登记）`,
  layoutDonor,
  ROUND4_BEFORE,
  ROUND4_AFTER,
  { kind: 'layout', layoutId: DEFAULT_LAYOUT_ID }
)

replayExact(
  `重放对拍: 悬浮页容器按钮（轮25 → 轮26；root9 全等 + root46 审计登记）`,
  containerDonor,
  ROUND26_BEFORE,
  ROUND26_AFTER,
  { kind: 'container', containerId: CONTAINER_2084 }
)

// ============ C. 分配器 ============
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
  assert.throws(() => allocateControlId(parsed, containerDonor.selfId), /已被占用/)
})

ok('分配器: 确定性（同文件两次一致）', () => {
  const parsed = parse(load(ROUND26_BEFORE))
  assert.equal(allocateControlId(parsed), allocateControlId(parse(load(ROUND26_BEFORE))))
})

// ============ D. 参数 patch 语义回读 ============
ok('resolveSurfaceTarget: container 面归属校验（非容器记录拒绝）', () => {
  const parsed = parse(load(ROUND4_AFTER))
  // 默认布局 1825 是布局（控件/布局类）→ 拒绝
  assert.throws(() => resolveSurfaceTarget(parsed, `container:${DEFAULT_LAYOUT_ID}`), /不是悬浮页容器/)
  // 关闭按钮 2085 是控件记录 → 拒绝
  const parsed26 = parse(load(ROUND26_BEFORE))
  assert.throws(() => resolveSurfaceTarget(parsed26, 'container:1073742085'), /不是悬浮页容器/)
})

ok('resolveSurfaceTarget: 悬浮页:容器 双段校验（页-容器配对）', () => {
  const parsed = parse(load(ROUND26_BEFORE))
  const surface = resolveSurfaceTarget(parsed, `container:${CONTAINER_2084}`)
  assert.deepEqual(surface, { kind: 'container', containerId: CONTAINER_2084 })
  // 实例页 2083 ↔ 容器 2084 配对合法
  const paired = resolveSurfaceTarget(parsed, '悬浮页:1073742083:1073742084')
  assert.deepEqual(paired, { kind: 'container', containerId: CONTAINER_2084 })
  // 模板页 2086 的容器是 2087——把实例容器 2084 配给模板页必须拒绝
  assert.throws(
    () => resolveSurfaceTarget(parsed, '悬浮页:1073742086:1073742084'),
    /不在悬浮页 .* 的容器列表/
  )
  // 素材组（如轮28 的 2091）不是悬浮页容器：控件类拒绝或 t42 无归属，任一即拒绝
  const parsed28 = parse(load('1073741909.after-重启28-悬浮按钮状态素材-127e82c2.gil'))
  assert.throws(
    () => resolveSurfaceTarget(parsed28, 'container:1073742091'),
    /不是悬浮页容器|不属于任何悬浮页/
  )
})

ok('参数 patch: --name/--position/--size 语义回读 + 宿主成员 + 其余记录零改动', () => {
  const before = load(ROUND4_BEFORE)
  const beforeParsed = parse(before)
  const id = allocateControlId(beforeParsed)
  assert.ok(id !== layoutDonor.selfId)
  const result = createButtonCandidate(before, {
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
  const layout = after.recordsById.get(DEFAULT_LAYOUT_ID)!
  // 成员断言用语义读回（layout f503 packed）
  const memberField = layout.fields.find((f) => f.number === 503 && f.wire === 2)!
  const members = packed(memberField.value as Uint8Array)
  assert.ok(members.includes(id), `布局 f503 未含 ${id}`)
  // 几何语义回读（tree 层，读侧与写侧独立实现）
  const view = buildSemanticView(result.bytes)
  const node = view.flat.find((n) => n.id === id)
  assert.ok(node?.geometry, `geometry 缺失 id=${id}`)
  assert.ok(Math.abs(node.geometry!.position![0] - 920) < 0.05, 'position.x')
  assert.ok(Math.abs(node.geometry!.position![1] - 300) < 0.05, 'position.y')
  assert.ok(Math.abs(node.geometry!.size![0] - 240) < 0.05, 'size.w')
  assert.ok(Math.abs(node.geometry!.size![1] - 80) < 0.05, 'size.h')
  // 其余记录逐字节零改动（宿主布局 1825 自身成员追加属预期变化，排除在外）
  assert.equal(after.records.length, beforeParsed.records.length + 1)
  for (const r of beforeParsed.records) {
    if (r.id === DEFAULT_LAYOUT_ID) continue
    const same = after.recordsById.get(r.id)
    assert.ok(same, `既有记录消失: ${r.id}`)
    assert.equal(Buffer.from(same.raw).equals(Buffer.from(r.raw)), true, `既有记录被改动: ${r.id}`)
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
