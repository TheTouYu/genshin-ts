/**
 * ui/tests/rich-image-assert.ts — 富文本内联图片字节级断言（票10 · 09 R4 backlog 闭合）
 *
 * 运行：npx tsx ui/tests/rich-image-assert.ts
 * 断言层级：
 *   A. 重放对拍（root9 全等）：
 *     - 轮20→21 插入图片（f62 6B minimal → 42B 完整块 +47B；文本 {5:img_1} 前缀同步）
 *     - 轮21→22 换资源（f62 内层 f3 100101→100102 等长单点）
 *   B. 语义回读（extractTextConfig.richImages + 文本插值）；
 *   C. 不变式冒烟（全量快照：仅目标记录变化，其余零改动）；
 *   D. fail-closed：非 input-box 目标 / slot>1 / 空参数。
 */

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

import { parseWireMessage } from '../../src/cli/static_assembly/wire.js'
import { setRichImageCandidate } from '../src/rich-image.js'
import { extractTextConfig, parseRoot9 } from '../src/record.js'

const ROOT = path.resolve(import.meta.dirname, '..', '..')
const FIXTURES = path.join(ROOT, '.gsts', 'diff-exp', 'ui学习')

if (!fs.existsSync(FIXTURES)) {
  console.log('SKIP: .gsts/diff-exp/ui学习/ 不存在')
  process.exit(0)
}

const R19 = '1073741909.after-重启19-图文输入框-a81cbfbf.gil'
const R20 = '1073741909.after-重启20-输入框文字颜色-e805d0cc.gil'
const R21 = '1073741909.after-重启21-插入图片-cde900f2.gil'
const R22 = '1073741909.after-重启22-换图片资源-a4dd24b2.gil'
const INPUT_BOX = 1073742079

function load(file: string): Uint8Array {
  return new Uint8Array(fs.readFileSync(path.join(FIXTURES, file)))
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
      const a1 = av.value as Uint8Array
      const b1 = bv.value as Uint8Array
      let i = 0
      const ah = Buffer.from(a1).toString('hex')
      const bh = Buffer.from(b1).toString('hex')
      while (i < Math.min(ah.length, bh.length) && ah[i] === bh[i]) i++
      assert.fail(
        `${label}: 顶层字段 ${num} 不一致 first diff @ ${i / 2} (len ${a1.length} vs ${b1.length})` +
          `\ncandidate: ${ah.slice(Math.max(0, i - 16), i + 32)}\neditor   : ${bh.slice(Math.max(0, i - 16), i + 32)}`
      )
    }
  }
}

let passed = 0
function ok(label: string, fn: () => void): void {
  fn()
  passed += 1
  console.log(`ok ${passed} - ${label}`)
}

/** input-box 文本语义回读（type45 comp → extractTextConfig；只读路径，哨兵不影响 text/richImages） */
function inputBoxText(fields: readonly { number: number; wire: number; value: unknown }[]): Record<string, unknown> {
  const unknown: string[] = []
  for (const f of fields as never[]) {
    if (f.number !== 505 || f.wire !== 2) continue
    const comp = parseWireMessage(f.value as Uint8Array)
    if (!comp) continue
    if (comp.find((x) => x.number === 502 && x.wire === 0)?.value !== 45) continue
    return extractTextConfig(comp, unknown)
  }
  return {}
}

// ============ A. 重放对拍 ============
ok('重放对拍: 插入图片（轮20→21；f62 完整块 + 文本插值 root9 全等）', () => {
  const result = setRichImageCandidate(load(R20), {
    targetId: INPUT_BOX,
    resourceId: 100101,
    text: '{5:img_1}这是文字'
  })
  assert.equal(result.action, 'insert')
  assert.equal(result.resourceId, 100101)
  assertReplayEquals(result.bytes, load(R21), '轮21 插图')
})

ok('重放对拍: 换资源（轮21→22；f3 单点等长 root9 全等）', () => {
  const result = setRichImageCandidate(load(R21), {
    targetId: INPUT_BOX,
    resourceId: 100102
  })
  assert.equal(result.action, 'swap')
  assertReplayEquals(result.bytes, load(R22), '轮22 换图')
})

// ============ B. 语义回读 ============
ok('语义回读: richImages 计数与文本插值', () => {
  const after = parseRoot9(load(R21)).recordsById.get(INPUT_BOX)!
  const cfg = inputBoxText(after.fields)
  assert.equal(cfg.text, '{5:img_1}这是文字')
  assert.equal(cfg.richImages, 1)
})

// ============ C. 不变式冒烟（全量快照） ============
ok('全量快照: 插图不变式（仅目标记录变化，其余零改动）', () => {
  const files = fs
    .readdirSync(FIXTURES)
    .filter((f) => f.endsWith('.gil'))
    .sort()
  assert.ok(files.length >= 80)
  let covered = 0
  for (const file of files) {
    const before = load(file)
    const beforeParsed = parseRoot9(before)
    const box = beforeParsed.records.find((r) => r.compTypes.includes(45))
    if (!box) continue
    covered += 1
    const result = setRichImageCandidate(before, {
      targetId: box.id,
      resourceId: 100102,
      text: '{5:img_1}冒烟'
    })
    const afterParsed = parseRoot9(result.bytes)
    for (const r of beforeParsed.records) {
      if (r.id === box.id) continue
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

// ============ D. fail-closed ============
ok('fail-closed: 非 input-box / slot>1 / 空参数', () => {
  assert.throws(
    () => setRichImageCandidate(load(R20), { targetId: 1073741825, resourceId: 100101 }),
    /不是图文输入框/
  )
  assert.throws(
    () => setRichImageCandidate(load(R20), { targetId: INPUT_BOX, resourceId: 1, slot: 2 }),
    /无 donor/
  )
  assert.throws(() => setRichImageCandidate(load(R20), { targetId: INPUT_BOX }), /至少/)
})

console.log(`PASS ${passed} rich-image assertions`)
