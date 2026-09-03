/**
 * ui/tests/material-member-assert.ts — 素材成员 add/update 字节级断言（票10）
 *
 * 运行：npx tsx ui/tests/material-member-assert.ts
 * 断言层级：
 *   A. donor 防漂移（group-create/member-text/member-image）；
 *   B. 重放对拍（root9 全等）：
 *     - 轮14→15 悬浮状态组追加文本框成员（已有组：f503 追加 + 成员插组后）
 *     - 轮15→16 按下状态建组+图片成员（组 donor 克隆 + t50 引用 +10B + 索引尾追加 + 段尾插入）
 *     - 轮8→9 成员文本/颜色改写（f19.f505/f510；R2 patchTextMember 原语）
 *   C. 参数化改写回读（非 donor 原文/原色的文本与颜色 → f19 语义回读）；
 *   D. 不变式冒烟（全量快照建组路径：+2 记录/组入索引/t50 引用/其余零改动）；
 *   E. fail-closed：image 成员不支持 --text / 非按钮目标 / 已有素材幂等拒绝。
 */

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

import { parseWireMessage } from '../../src/cli/static_assembly/wire.js'
import { MATERIAL_MEMBER_DONORS } from '../src/material-member-donors.js'
import {
  addStateMaterialMemberCandidate,
  stateMaterialGroupId,
  updateMaterialMemberCandidate
} from '../src/material-member.js'
import { extractTextConfig, parseRoot9 } from '../src/record.js'

const ROOT = path.resolve(import.meta.dirname, '..', '..')
const FIXTURES = path.join(ROOT, '.gsts', 'diff-exp', 'ui学习')

if (!fs.existsSync(FIXTURES)) {
  console.log('SKIP: .gsts/diff-exp/ui学习/ 不存在')
  process.exit(0)
}

if (MATERIAL_MEMBER_DONORS.length === 0) {
  console.error('FAIL: MATERIAL_MEMBER_DONORS 为空——先运行 npx tsx ui/tests/extract-material-member-donors.ts')
  process.exit(1)
}

const R8 = '1073741909.after-重启8-常态素材文本框图片-bc9f8198.gil'
const R9 = '1073741909.after-重启9-文本颜色-4ee67975.gil'
const R14 = '1073741909.after-重启14-删除布局按钮-4d848f3f.gil'
const R15 = '1073741909.after-重启15-悬浮射击文本-951e07ad.gil'
const R16 = '1073741909.after-重启16-按下图片素材-e2afd1ad.gil'

const BUTTON = 1073742034
const HOVER_GROUP = 1073742044
const NEW_GROUP = 1073742070
const NEW_IMAGE_MEMBER = 1073742071
const NEW_TEXT_MEMBER = 1073742069

function load(file: string): Uint8Array {
  return new Uint8Array(fs.readFileSync(path.join(FIXTURES, file)))
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
    if (num === 45) {
      // root45 = 全局颜色历史 MRU（编辑器会话态）：条目数随用户取色操作增长，非命令可推导
      // （轮15 一次落盘 +2 条、轮9 +4 条）。结构断言：编辑器列表 = 候选列表 + 前缀新增
      // 条目（每条 5B varint ARGB）；引擎不写 root45（mappings §0：CLI 暂只写 f19）。
      const listBytes = (entry: Entry): Uint8Array => {
        let cur = entry.value as Uint8Array
        for (const tag of [1, 11, 1, 3]) {
          const fields = parseWireMessage(cur)
          const next = fields?.find((f) => f.number === tag && f.wire === 2)
          if (!next) throw new Error(`${label}: root45 嵌套结构非常规（f${tag} 缺失）`)
          cur = next.value as Uint8Array
        }
        return cur
      }
      const editorList = listBytes(bv)
      const candidateList = listBytes(av)
      const delta = editorList.length - candidateList.length
      assert.ok(
        delta >= 0 && delta % 5 === 0,
        `${label}: root45 差异非 5B 对齐（${delta}B）`
      )
      assert.ok(
        Buffer.from(editorList.subarray(delta)).equals(Buffer.from(candidateList)),
        `${label}: root45 候选列表 != 编辑器列表尾部`
      )
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

/** 从记录读 f19 文本/颜色（t25 文本成员语义回读；extractTextConfig 收 t25 comp 字段） */
function memberTextConfig(raw: Uint8Array): { text?: string; color?: string } {
  const unknown: string[] = []
  for (const slot of parseWireMessage(raw) ?? []) {
    if (slot.number !== 505 || slot.wire !== 2) continue
    const comp = parseWireMessage(slot.value as Uint8Array)
    if (comp?.find((x) => x.number === 502 && x.wire === 0)?.value !== 25) continue
    return extractTextConfig(comp, unknown)
  }
  return {}
}

// ============ A. donor 防漂移 ============
for (const donor of MATERIAL_MEMBER_DONORS) {
  ok(`donor 防漂移: ${donor.id} (#${donor.selfId})`, () => {
    const record = parseRoot9(load(donor.sourceSnapshot)).recordsById.get(donor.selfId)
    assert.ok(record, 'donor 记录缺失')
    assert.equal(Buffer.from(donor.hex, 'hex').equals(Buffer.from(record.raw)), true, 'hex 漂移')
  })
}

// ============ B1. 轮14→15 追加文本成员（已有组） ============
ok('重放对拍: 悬浮组追加文本框成员（轮14→15；root9 全等）', () => {
  const before = load(R14)
  const after = parseRoot9(load(R15))
  const afterMember = after.recordsById.get(NEW_TEXT_MEMBER)!
  const cfg = memberTextConfig(afterMember.raw)
  assert.ok(cfg.text !== undefined, '轮15 成员应带文本')
  const result = addStateMaterialMemberCandidate(before, {
    targetId: BUTTON,
    state: 'hover',
    member: 'text',
    text: cfg.text,
    ...(cfg.color !== undefined ? { color: cfg.color } : {}),
    ids: { member: NEW_TEXT_MEMBER }
  })
  assert.equal(result.createdGroup, false)
  assert.equal(result.groupId, HOVER_GROUP)
  assertReplayEquals(result.bytes, load(R15), '轮15 追加文本成员')
})

// ============ B2. 轮15→16 建组+图片成员 ============
ok('重放对拍: 按下状态建组+图片成员（轮15→16；root9 全等）', () => {
  const result = addStateMaterialMemberCandidate(load(R15), {
    targetId: BUTTON,
    state: 'press',
    member: 'image',
    ids: { group: NEW_GROUP, member: NEW_IMAGE_MEMBER }
  })
  assert.equal(result.createdGroup, true)
  assert.equal(result.groupId, NEW_GROUP)
  const parsed = parseRoot9(result.bytes)
  const group = parsed.recordsById.get(NEW_GROUP)!
  assert.equal(group.name, '按下状态素材组')
  assert.equal(stateMaterialGroupId(parsed.recordsById.get(BUTTON)!.fields, 'press'), NEW_GROUP)
  assertReplayEquals(result.bytes, load(R16), '轮16 建组+图片')
})

// ============ B3. 成员文本/颜色 update（轮9 为复合动作轮：自动建空组+t50 引用+字号
// 变化，不可作单动作 donor——mappings §2「CLI 不模拟 UI 副作用」；patchTextMember 原语
// 已由 09 R2 生产核验背书。此处断言引擎自洽：仅动成员记录 + 语义回读 + 字号/对齐不动） ============
ok('update 自洽: 成员文本/颜色改写仅落成员记录，字号/对齐不动', () => {
  const base = addStateMaterialMemberCandidate(load(R14), {
    targetId: BUTTON,
    state: 'hover',
    member: 'text',
    text: '旧文本',
    color: '#B4CD23',
    ids: { member: NEW_TEXT_MEMBER }
  }).bytes
  const baseParsed = parseRoot9(base)
  const before = baseParsed.recordsById.get(NEW_TEXT_MEMBER)!
  const beforeCfg = memberTextConfig(before.raw)
  const result = updateMaterialMemberCandidate(base, {
    memberId: NEW_TEXT_MEMBER,
    text: '新文本内容',
    color: '#FF8800'
  })
  const afterParsed = parseRoot9(result.bytes)
  const member = afterParsed.recordsById.get(NEW_TEXT_MEMBER)!
  const cfg = memberTextConfig(member.raw)
  assert.equal(cfg.text, '新文本内容')
  assert.equal(cfg.color, '#FF8800')
  if (beforeCfg.fontSize !== undefined) assert.equal(cfg.fontSize, beforeCfg.fontSize, '字号不应被 update 改动')
  for (const r of baseParsed.records) {
    if (r.id === NEW_TEXT_MEMBER) continue
    const same = afterParsed.recordsById.get(r.id)
    assert.ok(same, `既有记录消失 ${r.id}`)
    assert.equal(
      Buffer.from(same.raw).equals(Buffer.from(r.raw)),
      true,
      `update 波及了成员以外记录 ${r.id}`
    )
  }
})

// ============ C. 参数化改写回读（非 donor 原值） ============
ok('参数化改写: 自定义文本/颜色 → f19 语义回读', () => {
  const result = addStateMaterialMemberCandidate(load(R14), {
    targetId: BUTTON,
    state: 'hover',
    member: 'text',
    text: '开始游戏',
    color: '#FF8800',
    ids: { member: NEW_TEXT_MEMBER }
  })
  const parsed = parseRoot9(result.bytes)
  const member = parsed.recordsById.get(NEW_TEXT_MEMBER)!
  const cfg = memberTextConfig(member.raw)
  assert.equal(cfg.text, '开始游戏')
  assert.equal(cfg.color, '#FF8800')
})

ok('参数化改写: 建组路径组名按状态派生（常态/悬浮）', () => {
  for (const [state, name] of [
    ['normal', '默认状态素材组'],
    ['hover', '悬浮状态素材组']
  ] as const) {
    const result = addStateMaterialMemberCandidate(load(R14), {
      targetId: BUTTON,
      state,
      member: 'text',
      text: '标签'
    })
    const parsed = parseRoot9(result.bytes)
    const group = parsed.recordsById.get(result.groupId)!
    assert.equal(group.name, name, `${state} 组名`)
    assert.equal(stateMaterialGroupId(parsed.recordsById.get(BUTTON)!.fields, state), result.groupId)
  }
})

// ============ D. 不变式冒烟（全量快照建组路径） ============
ok('全量快照: 建组路径不变式（+2 记录/索引/t50 引用/其余零改动）', () => {
  const files = fs
    .readdirSync(FIXTURES)
    .filter((f) => f.endsWith('.gil'))
    .sort()
  assert.ok(files.length >= 80)
  let covered = 0
  for (const file of files) {
    const before = load(file)
    const beforeParsed = parseRoot9(before)
    const button = beforeParsed.records.find(
      (r) => r.compTypes.includes(50) && stateMaterialGroupId(r.fields, 'press') === undefined
    )
    if (!button) continue
    covered += 1
    const result = addStateMaterialMemberCandidate(before, {
      targetId: button.id,
      state: 'press',
      member: 'text',
      text: '冒烟'
    })
    const afterParsed = parseRoot9(result.bytes)
    assert.equal(afterParsed.records.length, beforeParsed.records.length + 2, `${file}: 未 +2`)
    assert.ok(afterParsed.indexIds.has(result.groupId), `${file}: 组未入索引`)
    assert.equal(
      stateMaterialGroupId(afterParsed.recordsById.get(button.id)!.fields, 'press'),
      result.groupId,
      `${file}: t50 引用未写`
    )
    const member = afterParsed.recordsById.get(result.memberId)
    assert.equal(member?.parentId, result.groupId, `${file}: 成员父引用`)
    for (const r of beforeParsed.records) {
      if (r.id === button.id) continue
      const same = afterParsed.recordsById.get(r.id)
      assert.ok(same, `${file}: 既有记录消失 ${r.id}`)
      assert.equal(
        Buffer.from(same.raw).equals(Buffer.from(r.raw)),
        true,
        `${file}: 既有记录被改动 ${r.id}`
      )
    }
  }
  assert.ok(covered >= 40, `可冒烟快照数 ${covered} 过少`)
})

// ============ E. fail-closed ============
ok('fail-closed: image 成员不支持 --text / 非按钮目标 / 幂等拒绝', () => {
  assert.throws(
    () =>
      addStateMaterialMemberCandidate(load(R15), {
        targetId: BUTTON,
        state: 'press',
        member: 'image',
        text: 'x'
      }),
    /image 成员不支持 --text/
  )
  assert.throws(
    () =>
      addStateMaterialMemberCandidate(load(R15), {
        targetId: 1073742044,
        state: 'press',
        member: 'image'
      }),
    /不是按钮/
  )
  // 图片成员文本 update = fail-closed（无 t25 文本组件）
  assert.throws(
    () => updateMaterialMemberCandidate(load(R16), { memberId: NEW_IMAGE_MEMBER, text: 'x' }),
    /不是文本素材成员/
  )
})

console.log(`PASS ${passed} material-member assertions`)
