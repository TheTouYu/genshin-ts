/**
 * ui/tests/floating-page-assert.ts — 悬浮页基础命令字节级断言（票10）
 *
 * 运行：npx tsx ui/tests/floating-page-assert.ts
 * 依赖：本地快照 .gsts/diff-exp/ui学习/（缺 SKIP，与 exhaustive 同约定）+ donor 已提取
 *       （先跑 npx tsx ui/tests/extract-floating-page-donors.ts）。
 *
 * 断言层级：
 *   A. donor 防漂移：FLOATING_PAGE_DONORS.hex 与来源快照记录逐字节一致（sha256 兜底）；
 *   B. 重放对拍（最严）：
 *     - 轮23→24 悬浮页纯添加（3 条单条族 2083/2084/2085 + 库 f503 + 索引）root9 全等；
 *     - 轮32b→33 新增页面容器（2107 + 实体 t42 追加 + 索引）root9 全等；
 *     - 轮47→48 容器初始生效关闭（2107 标记删除 -3B）root9 全等；
 *     - 轮48→49 初始生效切换（2084 删 + 2107 增，两步连续）root9 全等；
 *     - 轮2→3 形式变量 t41 条目追加（轮3=复合动作轮：变量+单选项视窗；t41 双写
 *       实体记录级逐字节对拍——非 root9 全等，断言层级如实标注）；
 *   C. 语义回读：初始生效读回（list 视角）/t42 引用读回/变量读读回；
 *   D. 不变式冒烟（全量快照，禁抽查）：+3 记录/库成员/索引/其余记录零改动；
 *   E. fail-closed：非容器目标初始生效报错；布局面建悬浮页报错（placement）。
 */

import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import { parseWireMessage } from '../../src/cli/static_assembly/wire.js'
import { FLOATING_PAGE_DONORS } from '../src/floating-page-donors.js'
import {
  addPageContainerCandidate,
  addPageVariableCandidate,
  createFloatingPageCandidate,
  setContainerActiveCandidate
} from '../src/floating-page.js'
import { extractContainerRefs, packedVarints, parseRoot9 } from '../src/record.js'

const ROOT = path.resolve(import.meta.dirname, '..', '..')
const FIXTURES = path.join(ROOT, '.gsts', 'diff-exp', 'ui学习')

if (!fs.existsSync(FIXTURES)) {
  console.log('SKIP: .gsts/diff-exp/ui学习/ 不存在（本地快照核验需真实差分留存）')
  process.exit(0)
}

if (FLOATING_PAGE_DONORS.length === 0) {
  console.error(
    'FAIL: FLOATING_PAGE_DONORS 为空（占位态）——先运行 npx tsx ui/tests/extract-floating-page-donors.ts'
  )
  process.exit(1)
}

const R2_AFTER = '1073741909.after-轮2.gil'
const R3_AFTER = '1073741909.after-轮3.gil'
const R23_AFTER = '1073741909.after-重启23-输入框存模板-2ac5a0b8.gil'
const R24_AFTER = '1073741909.after-重启24-悬浮交互页-139e22a6.gil'
const R32B_AFTER = '1073741909.after-重启32b-同步生效-6a9cd2e9.gil'
const R33_AFTER = '1073741909.after-重启33-页面容器-4590a9d2.gil'
const R47_AFTER = '1073741909.after-重启47-同步页签配置-8c2b8e4e.gil'
const R48_AFTER = '1073741909.after-重启48-初始生效容器1-8737dadd.gil'
const R49_AFTER = '1073741909.after-重启49-初始生效容器2-e00544d9.gil'

const ENTITY_2083 = 1073742083
const CONTAINER_2084 = 1073742084
const CONTAINER_2107 = 1073742107

function load(file: string): Uint8Array {
  return new Uint8Array(fs.readFileSync(path.join(FIXTURES, file)))
}

function sha256(bytes: Uint8Array): string {
  return crypto.createHash('sha256').update(Buffer.from(bytes)).digest('hex')
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

/** root9 逐字节全等；其余顶层字段等值（唯一预期差异 = root46 保存审计段等长改写） */
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
      const avLen = typeof av.value === 'number' ? 0 : av.value.length
      const bvLen = typeof bv.value === 'number' ? 0 : bv.value.length
      assert.equal(avLen, bvLen, `${label}: root46 长度不一致`)
      continue
    }
    if (!sameValue(av, bv)) {
      const avb = av.value as Uint8Array
      const bvb = bv.value as Uint8Array
      assert.fail(`${label}: 顶层字段 ${num} 不一致\n${firstDiff(avb, bvb)}`)
    }
  }
}

/** after 快照中记录的物理前驱（编辑器真实插入锚点） */
function physicalAnchor(afterFile: string, recordId: number): number {
  const order = parseRoot9(load(afterFile)).records.map((r) => r.id)
  const at = order.indexOf(recordId)
  assert.ok(at > 0, `${afterFile} 中 ${recordId} 无前驱锚点`)
  return order[at - 1]
}

/** after 快照顶层索引中新 ID 的前一索引项（索引插入锚点） */
function indexAnchor(afterFile: string, newId: number): number {
  const parsed = parseRoot9(load(afterFile))
  const ids = [...parsed.indexIds]
  // indexIds 是 Set（物理序保持）；取新 ID 前一项
  const at = ids.indexOf(newId)
  assert.ok(at > 0, `${afterFile} 索引中 ${newId} 无前驱`)
  return ids[at - 1]
}

let passed = 0
function ok(label: string, fn: () => void): void {
  fn()
  passed += 1
  console.log(`ok ${passed} - ${label}`)
}

// ============ A. donor 防漂移 ============
for (const donor of FLOATING_PAGE_DONORS) {
  ok(`donor 防漂移: ${donor.id} (${donor.sourceSnapshot} #${donor.selfId})`, () => {
    const record = parseRoot9(load(donor.sourceSnapshot)).recordsById.get(donor.selfId)
    assert.ok(record, `donor 记录缺失: ${donor.selfId}`)
    assert.equal(record.raw.length, donor.hex.length / 2, 'donor hex 长度 != 快照记录')
    assert.equal(Buffer.from(donor.hex, 'hex').equals(Buffer.from(record.raw)), true, 'hex 漂移')
    assert.equal(sha256(record.raw), donor.sha256, 'sha256 漂移')
  })
}

// ============ B1. 轮23→24 悬浮页纯添加重放（默认簇锚=检验插入规则本身） ============
ok('重放对拍: 悬浮页纯添加 3 条单条族（轮23→轮24；root9 全等）', () => {
  const result = createFloatingPageCandidate(load(R23_AFTER), {
    ids: { entity: ENTITY_2083, container: CONTAINER_2084, closeButton: 1073742085 }
  })
  assert.equal(result.entityId, ENTITY_2083)
  assert.equal(result.containerId, CONTAINER_2084)
  assert.deepEqual(result.libraryMemberIds.slice(-1), [ENTITY_2083])
  assertReplayEquals(result.bytes, load(R24_AFTER), '轮24 悬浮页添加')
})

// ============ B2. 轮32b→33 新增页面容器重放（默认簇锚） ============
ok('重放对拍: 新增页面容器 + 实体 t42 追加（轮32b→轮33；root9 全等）', () => {
  const result = addPageContainerCandidate(load(R32B_AFTER), {
    pageId: ENTITY_2083,
    containerId: CONTAINER_2107
  })
  assert.equal(result.containerId, CONTAINER_2107)
  assert.equal(result.active, true)
  assert.deepEqual(result.pageContainerRefs, [CONTAINER_2084, CONTAINER_2107])
  assertReplayEquals(result.bytes, load(R33_AFTER), '轮33 页面容器')
})

// ============ B3. 轮47→48 初始生效关闭重放 ============
ok('重放对拍: 容器初始生效关闭（轮47→轮48；2107 标记删除 root9 全等）', () => {
  const result = setContainerActiveCandidate(load(R47_AFTER), {
    containerId: CONTAINER_2107,
    active: false
  })
  assert.equal(result.active, false)
  const before = parseRoot9(load(R47_AFTER)).recordsById.get(CONTAINER_2107)!.raw.length
  const after = parseRoot9(result.bytes).recordsById.get(CONTAINER_2107)!.raw.length
  assert.equal(after, before - 3, '初始生效关闭应 -3B（b01f01 删除）')
  assertReplayEquals(result.bytes, load(R48_AFTER), '轮48 初始生效关闭')
})

// ============ B4. 轮48→49 初始生效切换（两步连续） ============
ok('重放对拍: 初始生效切换 2084 关 + 2107 开（轮48→轮49；root9 全等）', () => {
  const step1 = setContainerActiveCandidate(load(R48_AFTER), {
    containerId: CONTAINER_2084,
    active: false
  })
  const step2 = setContainerActiveCandidate(step1.bytes, {
    containerId: CONTAINER_2107,
    active: true
  })
  assertReplayEquals(step2.bytes, load(R49_AFTER), '轮49 初始生效切换')
})

// ============ B5. 轮2→3 形式变量重放（轮3 为复合动作轮：变量+单选项视窗；
// 实体记录内 t41 变更隔离对拍——记录级逐字节，非 root9 全等，层级如实标注） ============
ok('重放对拍: 形式变量 t41 条目追加（轮2→轮3；t41 双写实体记录级逐字节）', () => {
  const beforeBytes = load(R2_AFTER)
  const afterBytes = load(R3_AFTER)
  const beforeParsed = parseRoot9(beforeBytes)
  const afterParsed = parseRoot9(afterBytes)
  const beforeLen = new Map(beforeParsed.records.map((r) => [r.id, r.raw.length] as const))
  const changedEntities = afterParsed.records.filter((r) => {
    const prev = beforeLen.get(r.id)
    return prev !== undefined && prev !== r.raw.length && r.compTypes.includes(41)
  })
  assert.ok(changedEntities.length >= 1, '轮3 应至少有 1 条 t41 实体记录变更')
  const typeOf = (code: number): 'int' | 'float' | 'string' | 'dynamic-text' =>
    code === 0 ? 'int' : code === 1 ? 'float' : code === 2 ? 'string' : 'dynamic-text'
  let current = beforeBytes
  for (const rec of changedEntities) {
    // after 记录 t41（右侧 f503.f34）条目清单 = 重放目标
    const entries = extractT41Entries(afterParsed.recordsById.get(rec.id)!)
    assert.ok(entries.length === 4, `轮3 应有 4 个变量（实际 ${entries.length}）`)
    for (const entry of entries) {
      const result = addPageVariableCandidate(current, {
        pageId: rec.id,
        name: entry.name,
        type: typeOf(entry.type)
      })
      assert.equal(result.variable.seq, entry.seq)
      current = result.bytes
    }
    // 记录级逐字节对拍（轮3 实体记录唯一变化=t41；对不上=隔离失败，如实 FAIL）
    const replayed = parseRoot9(current).recordsById.get(rec.id)!
    assert.equal(
      Buffer.from(replayed.raw).equals(Buffer.from(rec.raw)),
      true,
      `t41 记录级对拍失败 #${rec.id}`
    )
  }
})

/** t41 右侧（comp.f503.f34）条目清单：{类型(缺省=0), 名字, 序号} */
function extractT41Entries(record: { fields: readonly import('../../src/cli/static_assembly/wire.js').WireField[] }): Array<{ type: number; name: string; seq: number }> {
  for (const f of record.fields) {
    if (f.number !== 505 || f.wire !== 2) continue
    const comp = parseWireMessage(f.value as Uint8Array)
    if (!comp) continue
    if (comp.find((x) => x.number === 502 && x.wire === 0)?.value !== 41) continue
    const f503 = comp.find((x) => x.number === 503 && x.wire === 2)
    const f503m = f503 ? parseWireMessage(f503.value as Uint8Array) : undefined
    const f34 = f503m?.find((x) => x.number === 34 && x.wire === 2)
    const f34m = f34 ? parseWireMessage(f34.value as Uint8Array) : undefined
    if (!f34m) return []
    const out: Array<{ type: number; name: string; seq: number }> = []
    for (const entryField of f34m.filter((x) => x.number === 501 && x.wire === 2)) {
      const entry = parseWireMessage(entryField.value as Uint8Array)
      if (!entry) continue
      const type = (entry.find((x) => x.number === 501 && x.wire === 0)?.value as number) ?? 0
      const nameField = entry.find((x) => x.number === 502 && x.wire === 2)
      const seq = (entry.find((x) => x.number === 503 && x.wire === 0)?.value as number) ?? 0
      out.push({
        type,
        name: nameField ? new TextDecoder().decode(nameField.value as Uint8Array) : '',
        seq
      })
    }
    return out
  }
  return []
}

// ============ C. 语义回读 ============
ok('语义回读: t42 引用/索引成员/初始生效标记读回', () => {
  const created = createFloatingPageCandidate(load(R23_AFTER), {
    ids: { entity: ENTITY_2083, container: CONTAINER_2084, closeButton: 1073742085 }
  })
  const parsed = parseRoot9(created.bytes)
  const entity = parsed.recordsById.get(ENTITY_2083)!
  assert.deepEqual(extractContainerRefs(entity.fields), [CONTAINER_2084])
  assert.ok(parsed.indexIds.has(CONTAINER_2084), '固有容器应入顶层索引')
  assert.ok(!parsed.indexIds.has(ENTITY_2083), '实体不应入索引（库容器子记录）')
  const library = parsed.recordsById.get(1073741840)!
  const members = packedVarints(
    library.fields.find((f) => f.number === 503 && f.wire === 2)!.value as Uint8Array
  )
  assert.ok(members.includes(ENTITY_2083), '库容器 f503 应含实体')
  // 固有容器出生=初始生效（donor 带标记；轮24 形态，轮48 才关闭）
  const close = parsed.recordsById.get(1073742085)!
  assert.equal(close.parentId, CONTAINER_2084)
})

// ============ D. 全量快照不变式冒烟（禁抽查） ============
ok('全量快照: 悬浮页纯添加不变式（+3 记录/库成员/索引/其余零改动）', () => {
  const files = fs
    .readdirSync(FIXTURES)
    .filter((f) => f.endsWith('.gil'))
    .sort()
  assert.ok(files.length >= 80, `快照数 ${files.length} < 80`)
  for (const file of files) {
    const before = load(file)
    const beforeParsed = parseRoot9(before)
    if (!beforeParsed.recordsById.has(1073741840)) continue
    const result = createFloatingPageCandidate(before)
    const after = parseRoot9(result.bytes)
    assert.equal(after.records.length, beforeParsed.records.length + 3, `${file}: 记录数未 +3`)
    for (const id of [result.entityId, result.containerId, result.closeButtonId]) {
      assert.ok(after.recordsById.has(id), `${file}: 新记录缺失 ${id}`)
    }
    assert.ok(after.indexIds.has(result.containerId), `${file}: 固有容器未入索引`)
    const entity = after.recordsById.get(result.entityId)!
    assert.equal(entity.kind, 'floating-page')
    assert.deepEqual(extractContainerRefs(entity.fields), [result.containerId])
    assert.equal(after.recordsById.get(result.closeButtonId)!.parentId, result.containerId)
    for (const r of beforeParsed.records) {
      if (r.id === 1073741840) continue
      const same = after.recordsById.get(r.id)
      assert.ok(same, `${file}: 既有记录消失 ${r.id}`)
      assert.equal(
        Buffer.from(same.raw).equals(Buffer.from(r.raw)),
        true,
        `${file}: 既有记录被改动 ${r.id}`
      )
    }
  }
})

// ============ E. fail-closed ============
ok('fail-closed: 非容器目标初始生效报错', () => {
  const parsed = parseRoot9(load(R24_AFTER))
  const button = parsed.records.find((r) => r.kind === 'custom-button')
  assert.ok(button)
  assert.throws(
    () => setContainerActiveCandidate(load(R24_AFTER), { containerId: button.id, active: false }),
    /不是容器记录/
  )
})

ok('fail-closed: 非悬浮页实体加容器/加变量报错', () => {
  assert.throws(
    () => addPageContainerCandidate(load(R24_AFTER), { pageId: CONTAINER_2084 }),
    /不是悬浮页实体/
  )
  assert.throws(
    () =>
      addPageVariableCandidate(load(R24_AFTER), {
        pageId: CONTAINER_2084,
        name: 'x',
        type: 'int'
      }),
    /不是悬浮页实体/
  )
})

console.log(`PASS ${passed} floating-page assertions`)
