/**
 * ui/tests/tab-assert.ts — 页签体系命令字节级断言（票10）
 *
 * 运行：npx tsx ui/tests/tab-assert.ts
 * 依赖：本地快照 .gsts/diff-exp/ui学习/（缺 SKIP）+ donor 已提取
 *       （先跑 npx tsx ui/tests/extract-tab-donors.ts）。
 *
 * 断言层级：
 *   A. donor 防漂移（tab-create 轮29）；
 *   B. 重放对拍（root9 全等 + root46 审计登记）：
 *     - 轮28→29  新建页签（donor 克隆 + 容器 f503 + 簇末插入）
 *     - 轮29→30  页面项追加（默认模板）+ 双页改名/改文本（f501.f501 / f502.f503.f502.f13.f501）
 *     - 轮35→36  默认选择=页签1（哨兵 2^56-1 → 序号，-9B）
 *     - 轮36→37 / 37→38  返回服务器事件开关（名字容器 f504=1 增删）
 *     - 轮38→39→40→41→42  容器状态设置：双容器显隐 / 隐→显 / 移除容器 / 关开关
 *     - 轮42→43  双页签互补容器配置（轮43 模式）
 *     - 轮43→44→45→46  控件状态设置：空启用 / 双控件条目 / 扩展至四控件含隐藏
 *     - 轮65→66  默认选择切换 1→2（等长 01→02，E3 轮66 闭合）
 *   C. 语义回读（extractTabPages 页数/默认序号）；
 *   D. 不变式冒烟（全量快照：+1 记录/宿主成员/其余零改动）；
 *   E. fail-closed：tab 不进布局面 / 页面序号越界 / 非页签目标。
 */

import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import { parseWireMessage } from '../../src/cli/static_assembly/wire.js'
import { TAB_DONORS } from '../src/tab-donors.js'
import {
  createTabCandidate,
  tabStateBlockCandidate,
  tabPageAddCandidate,
  tabPageDefaultCandidate,
  tabPageRenameCandidate,
  tabPageServerEventCandidate
} from '../src/tab.js'
import { extractTabPages, parseRoot9 } from '../src/record.js'

const ROOT = path.resolve(import.meta.dirname, '..', '..')
const FIXTURES = path.join(ROOT, '.gsts', 'diff-exp', 'ui学习')

if (!fs.existsSync(FIXTURES)) {
  console.log('SKIP: .gsts/diff-exp/ui学习/ 不存在（本地快照核验需真实差分留存）')
  process.exit(0)
}

if (TAB_DONORS.length === 0) {
  console.error('FAIL: TAB_DONORS 为空——先运行 npx tsx ui/tests/extract-tab-donors.ts')
  process.exit(1)
}

const S = (name: string) => path.join(FIXTURES, name)
const R28 = '1073741909.after-重启28-悬浮按钮状态素材-127e82c2.gil'
const R29 = '1073741909.after-重启29-悬浮页加页签-de3ffb3f.gil'
const R30 = '1073741909.after-重启30-第二页签文本-e930c9fe.gil'
const R35 = '1073741909.after-重启35-同步容器页签-6d09888c.gil'
const R36 = '1073741909.after-重启36-页签默认选择-bf9da2c4.gil'
const R37 = '1073741909.after-重启37-页签服务端事件-2e34d008.gil'
const R38 = '1073741909.after-重启38-关闭一项开关-aab35adf.gil'
const R39 = '1073741909.after-重启39-容器状态设置-a175224e.gil'
const R40 = '1073741909.after-重启40-容器2也显示-7ac2b185.gil'
const R41 = '1073741909.after-重启41-只控容器1-74e0d49b.gil'
const R42 = '1073741909.after-重启42-关闭容器状态设置-e98b6993.gil'
const R43 = '1073741909.after-重启43-双页签容器配置-edb372fc.gil'
const R44 = '1073741909.after-重启44-控件状态设置-035fb6a8.gil'
const R45 = '1073741909.after-重启45-控件状态条目-4c4d178e.gil'
const R46 = '1073741909.after-重启46-四控件全控-a9ee5f97.gil'
const R65 = '1073741909.after-重启65-删文本框-da17641a.gil'
const R66 = '1073741909.after-重启66-默认页签2-7468eadd.gil'

const TAB = 1073742097
const CONTAINER_2084 = 1073742084
const CONTAINER_2107 = 1073742107

function load(file: string): Uint8Array {
  return new Uint8Array(fs.readFileSync(S(file)))
}

function firstDiff(a: Uint8Array, b: Uint8Array): string {
  const len = Math.min(a.length, b.length)
  for (let i = 0; i < len; i++) {
    if (a[i] !== b[i]) {
      const from = Math.max(0, i - 8)
      const to = Math.min(a.length, i + 16)
      return (
        `first diff @ ${i} (len ${a.length} vs ${b.length})\n` +
        `candidate: ${Buffer.from(a.subarray(from, to)).toString('hex')}\n` +
        `editor   : ${Buffer.from(b.subarray(from, to)).toString('hex')}`
      )
    }
  }
  return `prefix equal, length differs: ${a.length} vs ${b.length}`
}

function assertReplayEquals(candidate: Uint8Array, editor: Uint8Array, label: string): void {
  const parse = (bytes: Uint8Array) => parseWireMessage(bytes.subarray(20, bytes.length - 4))
  const left = parse(candidate)
  const right = parse(editor)
  assert.ok(left && right, `${label}: payload 解析失败`)
  type Entry = NonNullable<typeof left>[number]
  const byNumber = (fields: NonNullable<typeof left>) => {
    const map = new Map<number, Entry>()
    for (const field of fields) map.set(field.number, field)
    return map
  }
  const a = byNumber(left!)
  const b = byNumber(right!)
  const sameValue = (x: Entry, y: Entry): boolean =>
    x.wire === y.wire &&
    (typeof x.value === 'number'
      ? typeof y.value === 'number' && x.value === y.value
      : Buffer.from(x.value).equals(Buffer.from(y.value)))
  for (const num of [...new Set([...a.keys(), ...b.keys()])].sort((x, y) => x - y)) {
    const av = a.get(num)
    const bv = b.get(num)
    assert.ok(av && bv, `${label}: 顶层字段 ${num} 仅一侧存在`)
    if (num === 46) {
      const avLen = typeof av.value === 'number' ? 0 : av.value.length
      const bvLen = typeof bv.value === 'number' ? 0 : bv.value.length
      assert.equal(avLen, bvLen, `${label}: root46 长度不一致`)
      continue
    }
    if (!sameValue(av, bv)) {
      assert.fail(`${label}: 顶层字段 ${num} 不一致\n${firstDiff(av.value as Uint8Array, bv.value as Uint8Array)}`)
    }
  }
}

let passed = 0
function ok(label: string, fn: () => void): void {
  fn()
  passed += 1
  console.log(`ok ${passed} - ${label}`)
}

// ============ A. donor 防漂移 ============
for (const donor of TAB_DONORS) {
  ok(`donor 防漂移: ${donor.id} (${donor.sourceSnapshot} #${donor.selfId})`, () => {
    const record = parseRoot9(load(donor.sourceSnapshot)).recordsById.get(donor.selfId)
    assert.ok(record, 'donor 记录缺失')
    assert.equal(record.raw.length, donor.hex.length / 2, 'hex 长度漂移')
    assert.equal(Buffer.from(donor.hex, 'hex').equals(Buffer.from(record.raw)), true, 'hex 漂移')
    assert.equal(
      crypto.createHash('sha256').update(Buffer.from(record.raw)).digest('hex'),
      donor.sha256,
      'sha256 漂移'
    )
  })
}

// ============ B. 重放对拍 ============
ok('重放对拍: 新建页签（轮28→29；root9 全等）', () => {
  const result = createTabCandidate(load(R28), { containerId: CONTAINER_2084, id: TAB })
  assert.equal(result.tabId, TAB)
  assert.equal(result.pageCount, 1)
  assertReplayEquals(result.bytes, load(R29), '轮29 页签创建')
})

ok('重放对拍: 页面项追加+双页改名/改文本（轮29→30；root9 全等）', () => {
  const added = tabPageAddCandidate(load(R29), { tabId: TAB })
  assert.equal(added.page, 2)
  assert.equal(added.name, '页签项_2')
  const renamed1 = tabPageRenameCandidate(added.bytes, {
    tabId: TAB,
    page: 1,
    name: '页签1',
    text: '页签1'
  })
  const renamed2 = tabPageRenameCandidate(renamed1, {
    tabId: TAB,
    page: 2,
    name: '页签2',
    text: '页签2'
  })
  assertReplayEquals(renamed2, load(R30), '轮30 页面项')
})

ok('重放对拍: 默认选择=页签1（轮35→36；哨兵→序号 root9 全等）', () => {
  const result = tabPageDefaultCandidate(load(R35), { tabId: TAB, page: 1 })
  assertReplayEquals(result, load(R36), '轮36 默认选择')
})

ok('重放对拍: 默认选择切换 1→2（轮65→66；等长 01→02 root9 全等）', () => {
  const result = tabPageDefaultCandidate(load(R65), { tabId: TAB, page: 2 })
  assertReplayEquals(result, load(R66), '轮66 默认切换')
})

ok('重放对拍: 返回服务器事件双开（轮36→37；名字容器 f504=1 root9 全等）', () => {
  const page1 = tabPageServerEventCandidate(load(R36), { tabId: TAB, page: 1, on: true })
  const page2 = tabPageServerEventCandidate(page1, { tabId: TAB, page: 2, on: true })
  assertReplayEquals(page2, load(R37), '轮37 server-event on')
})

ok('重放对拍: 页签1 开关关闭（轮37→38；-3B root9 全等）', () => {
  const result = tabPageServerEventCandidate(load(R37), { tabId: TAB, page: 1, on: false })
  assertReplayEquals(result, load(R38), '轮38 server-event off')
})

ok('重放对拍: 容器状态设置初配 双容器显隐+启用（轮38→39；+26B root9 全等）', () => {
  let bytes = load(R38)
  for (const op of [
    { kind: 'upsert' as const, targetId: CONTAINER_2084, hidden: false },
    { kind: 'upsert' as const, targetId: CONTAINER_2107, hidden: true },
    { kind: 'enable' as const }
  ]) {
    bytes = tabStateBlockCandidate(bytes, { tabId: TAB, page: 1, block: 'container', op })
  }
  assertReplayEquals(bytes, load(R39), '轮39 容器状态')
})

ok('重放对拍: 容器2 隐→显（轮39→40；entry 内 b01f01 删 root9 全等）', () => {
  const result = tabStateBlockCandidate(load(R39), {
    tabId: TAB,
    page: 1,
    block: 'container',
    op: { kind: 'upsert', targetId: CONTAINER_2107, hidden: false }
  })
  assertReplayEquals(result, load(R40), '轮40 隐→显')
})

ok('重放对拍: 容器状态移除容器2（轮40→41；entry 删 root9 全等）', () => {
  const result = tabStateBlockCandidate(load(R40), {
    tabId: TAB,
    page: 1,
    block: 'container',
    op: { kind: 'remove', targetId: CONTAINER_2107 }
  })
  assertReplayEquals(result, load(R41), '轮41 移除容器')
})

ok('重放对拍: 容器状态开关关闭（轮41→42；启用标记删 root9 全等）', () => {
  const result = tabStateBlockCandidate(load(R41), {
    tabId: TAB,
    page: 1,
    block: 'container',
    op: { kind: 'disable' }
  })
  assertReplayEquals(result, load(R42), '轮42 关开关')
})

ok('重放对拍: 双页签互补容器配置（轮42→43；轮43 模式 root9 全等）', () => {
  // 页签1：容器1显 + 容器2隐 + 启用
  let bytes = tabStateBlockCandidate(load(R42), {
    tabId: TAB,
    page: 1,
    block: 'container',
    op: { kind: 'upsert', targetId: CONTAINER_2107, hidden: true }
  })
  bytes = tabStateBlockCandidate(bytes, {
    tabId: TAB,
    page: 1,
    block: 'container',
    op: { kind: 'enable' }
  })
  // 页签2：容器1隐 + 容器2显 + 启用
  bytes = tabStateBlockCandidate(bytes, {
    tabId: TAB,
    page: 2,
    block: 'container',
    op: { kind: 'upsert', targetId: CONTAINER_2084, hidden: true }
  })
  bytes = tabStateBlockCandidate(bytes, {
    tabId: TAB,
    page: 2,
    block: 'container',
    op: { kind: 'upsert', targetId: CONTAINER_2107, hidden: false }
  })
  bytes = tabStateBlockCandidate(bytes, {
    tabId: TAB,
    page: 2,
    block: 'container',
    op: { kind: 'enable' }
  })
  assertReplayEquals(bytes, load(R43), '轮43 双页签互补')
})

ok('重放对拍: 控件状态空启用（轮43→44；len3 启用标记 root9 全等）', () => {
  const result = tabStateBlockCandidate(load(R43), {
    tabId: TAB,
    page: 2,
    block: 'control',
    op: { kind: 'enable' }
  })
  assertReplayEquals(result, load(R44), '轮44 空启用')
})

ok('重放对拍: 控件状态双条目（轮44→45；关闭按钮/页签副本显 root9 全等）', () => {
  let bytes = tabStateBlockCandidate(load(R44), {
    tabId: TAB,
    page: 2,
    block: 'control',
    op: { kind: 'upsert', targetId: 1073742085, hidden: false }
  })
  bytes = tabStateBlockCandidate(bytes, {
    tabId: TAB,
    page: 2,
    block: 'control',
    op: { kind: 'upsert', targetId: 1073742108, hidden: false }
  })
  assertReplayEquals(bytes, load(R45), '轮45 双条目')
})

ok('重放对拍: 控件状态扩展至四控件（轮45→46；含隐藏 root9 全等）', () => {
  let bytes = tabStateBlockCandidate(load(R45), {
    tabId: TAB,
    page: 2,
    block: 'control',
    op: { kind: 'upsert', targetId: 1073742089, hidden: true }
  })
  bytes = tabStateBlockCandidate(bytes, {
    tabId: TAB,
    page: 2,
    block: 'control',
    op: { kind: 'upsert', targetId: 1073742097, hidden: true }
  })
  assertReplayEquals(bytes, load(R46), '轮46 四控件')
})

// ============ C. 语义回读 ============
ok('语义回读: extractTabPages 页数/默认序号随操作演化', () => {
  const tabAfterCreate = parseRoot9(load(R29)).recordsById.get(TAB)!
  const pages29 = extractTabPages(tabAfterCreate.fields, [])
  assert.equal(pages29.pageCount, 1)
  assert.equal((pages29 as { defaultIndex?: number }).defaultIndex, undefined)
  const added = tabPageAddCandidate(load(R29), { tabId: TAB })
  const tabAfterAdd = parseRoot9(added.bytes).recordsById.get(TAB)!
  assert.equal(extractTabPages(tabAfterAdd.fields, []).pageCount, 2)
  const defaulted = tabPageDefaultCandidate(load(R36), { tabId: TAB, page: 1 })
  const tabAfterDefault = parseRoot9(defaulted).recordsById.get(TAB)!
  assert.equal(extractTabPages(tabAfterDefault.fields, []).pageCount, 2)
})

// ============ D. 不变式冒烟（全量快照，禁抽查） ============
ok('全量快照: 页签新建不变式（+1 记录/宿主成员/其余零改动）', () => {
  const files = fs
    .readdirSync(FIXTURES)
    .filter((f) => f.endsWith('.gil'))
    .sort()
  assert.ok(files.length >= 80)
  let covered = 0
  for (const file of files) {
    const before = load(file)
    const beforeParsed = parseRoot9(before)
    if (!beforeParsed.recordsById.has(CONTAINER_2084)) continue
    covered += 1
    const result = createTabCandidate(before, { containerId: CONTAINER_2084 })
    const afterParsed = parseRoot9(result.bytes)
    assert.equal(afterParsed.records.length, beforeParsed.records.length + 1, `${file}: 未 +1`)
    const tab = afterParsed.recordsById.get(result.tabId)
    assert.ok(tab, `${file}: 页签记录缺失`)
    assert.equal(tab.kind, 'tab')
    assert.equal(tab.parentId, CONTAINER_2084)
    for (const r of beforeParsed.records) {
      if (r.id === CONTAINER_2084) continue
      const same = afterParsed.recordsById.get(r.id)
      assert.ok(same, `${file}: 既有记录消失 ${r.id}`)
      assert.equal(
        Buffer.from(same.raw).equals(Buffer.from(r.raw)),
        true,
        `${file}: 既有记录被改动 ${r.id}`
      )
    }
  }
  assert.ok(covered >= 40, `含 2084 快照数 ${covered} 过少`)
})

// ============ E. fail-closed ============
ok('fail-closed: tab 不能进布局面（容器归属校验）', () => {
  assert.throws(
    () => createTabCandidate(load(R29), { containerId: 1073741825 }),
    /不属于任何悬浮页/
  )
})

ok('fail-closed: 页面序号越界 / 非页签目标', () => {
  assert.throws(
    () => tabPageDefaultCandidate(load(R36), { tabId: TAB, page: 3 }),
    /页面项 #3 不存在/
  )
  assert.throws(
    () => tabPageAddCandidate(load(R29), { tabId: CONTAINER_2084 }),
    /不是页签记录/
  )
})

console.log(`PASS ${passed} tab assertions`)
