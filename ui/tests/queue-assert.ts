/**
 * ui/tests/queue-assert.ts — 消息队列样式/消息项/显示配置字节级断言（票10 · 09 B1d backlog）
 *
 * 运行：npx tsx ui/tests/queue-assert.ts
 * 断言层级（root9 全等重放）：
 *   - 轮52→53 样式一（图片素材：type77 条目 + type55 组+成员 + 索引）
 *   - 轮53→54 样式二（文本素材：条目 + 组+成员 + 字号 30 + 文本「样式二」）
 *   - 轮60→61 消息项二（type79 前插 + 序号 max+1 + 默认名 消息项_2）
 *   - 轮61→62 消息配样式（名字容器内 f502 = 样式序号，两条）
 *   - 轮54→55 最大显示项 5→4；轮55→56 限时显示开；轮56→57 插入开头；轮57→58 内容居中
 *   - 补充2 第8→9步 另一队列样式一加素材（显式插入锚点——该轮组记录插位为队列树簇末，
 *     与主链尾插不同，重放以证据锚点对拍）
 *   - 语义回读 + 不变式冒烟 + fail-closed
 */

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

import { parseWireMessage } from '../../src/cli/static_assembly/wire.js'
import { setUiControlTransform } from '../../src/cli/gil_ui.js'
import { ownIdOf, withSection } from '../src/section-ops.js'
import {
  queueMessageAddCandidate,
  queueMessageStyleCandidate,
  queuePropsCandidate,
  queueStyleAddCandidate
} from '../src/queue.js'
import { extractGeometry, extractQueueProps, parseRoot9 } from '../src/record.js'

const ROOT = path.resolve(import.meta.dirname, '..', '..')
const FIXTURES = path.join(ROOT, '.gsts', 'diff-exp', 'ui学习')
const FIXTURES2 = path.join(ROOT, '.gsts', 'diff-exp', 'ui补充')

if (!fs.existsSync(FIXTURES)) {
  console.log('SKIP: .gsts/diff-exp/ui学习/ 不存在')
  process.exit(0)
}

const S = (name: string) => path.join(FIXTURES, name)
const QUEUE = 1073742132
const R52 = '1073741909.after-重启52-队列位置大小-0ef16716.gil'
const R53 = '1073741909.after-重启53-队列项样式图片-c23fef5c.gil'
const R54 = '1073741909.after-重启54-队列样式2-2a260b6c.gil'
const R55 = '1073741909.after-重启55-队列显示项4-8a1ad24f.gil'
const R56 = '1073741909.after-重启56-队列限时显示-6331860c.gil'
const R57 = '1073741909.after-重启57-队列插入开头-1e9b73c3.gil'
const R58 = '1073741909.after-重启58-队列内容居中-3b7080d7.gil'
const R60 = '1073741909.after-重启60-样式二文本居中-77c88fc5.gil'
const R61 = '1073741909.after-重启61-队列新增消息项-48051914.gil'
const R62 = '1073741909.after-重启62-消息配置样式-a5a14a7f.gil'

function load(file: string): Uint8Array {
  return new Uint8Array(fs.readFileSync(S(file)))
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
      const ah = Buffer.from(a1).toString('hex')
      const bh = Buffer.from(b1).toString('hex')
      let i = 0
      while (i < Math.min(ah.length, bh.length) && ah[i] === bh[i]) i++
      assert.fail(
        `${label}: 顶层字段 ${num} 不一致 first diff @ ${i / 2} (len ${a1.length} vs ${b1.length})` +
          `\ncandidate: ${ah.slice(Math.max(0, i - 16), i + 32)}\neditor   : ${bh.slice(Math.max(0, i - 16), i + 32)}`
      )
    }
  }
}


/** after 快照顶层索引中新组 ID 的前一索引项（编辑器索引插位锚点） */
function indexAnchorOf(afterBytes: Uint8Array, newId: number): number | undefined {
  const top = parseWireMessage(afterBytes.subarray(20, afterBytes.length - 4))
  const root9 = top?.find((f) => f.number === 9 && f.wire === 2)
  const section = root9 ? parseWireMessage(root9.value as Uint8Array) : undefined
  const indexField = section?.find((x) => x.number === 501 && x.wire === 2)
  const ids = indexField ? [...parseRoot9(afterBytes).indexIds] : []
  const at = ids.indexOf(newId)
  return at > 0 ? ids[at - 1] : undefined
}


/** after 快照中新记录的物理前驱（编辑器物理插位锚点） */
function physicalAnchorOf(afterBytes: Uint8Array, newId: number): number {
  const order = parseRoot9(afterBytes).records.map((r) => r.id)
  const at = order.indexOf(newId)
  assert.ok(at > 0, '新记录无物理前驱')
  return order[at - 1]
}

let passed = 0
function ok(label: string, fn: () => void): void {
  fn()
  passed += 1
  console.log(`ok ${passed} - ${label}`)
}

// ============ 重放对拍 ============
ok('重放对拍: 样式一图片素材（轮52→53；root9 全等）', () => {
  const result = queueStyleAddCandidate(load(R52), {
    targetId: QUEUE,
    material: 'image',
    ids: { group: 1073742133, member: 1073742134 },
    indexAfterId: indexAnchorOf(load(R53), 1073742133),
    insertAfterId: physicalAnchorOf(load(R53), 1073742133)
  })
  assert.equal(result.styleIndex, 1)
  assert.equal(result.styleName, '样式_1')
  assertReplayEquals(result.bytes, load(R53), '轮53 样式一')
})

ok('重放对拍: 样式二文本素材（轮53→54；字号30+文本 root9 全等）', () => {
  const result = queueStyleAddCandidate(load(R53), {
    targetId: QUEUE,
    material: 'text',
    text: '样式二',
    fontSize: 30,
    ids: { group: 1073742135, member: 1073742136 },
    indexAfterId: indexAnchorOf(load(R54), 1073742135),
    insertAfterId: physicalAnchorOf(load(R54), 1073742135)
  })
  assert.equal(result.styleIndex, 2)
  assertReplayEquals(result.bytes, load(R54), '轮54 样式二')
})

ok('重放对拍: 消息项二前插（轮60→61；root9 全等）', () => {
  const result = queueMessageAddCandidate(load(R60), { targetId: QUEUE })
  assert.equal(result.messageIndex, 2)
  assert.equal(result.name, '消息项_2')
  assertReplayEquals(result.bytes, load(R61), '轮61 消息项')
})

ok('重放对拍: 消息配样式（轮61→62；两条 f502 root9 全等）', () => {
  const step1 = queueMessageStyleCandidate(load(R61), {
    targetId: QUEUE,
    message: 1,
    style: 1
  })
  const step2 = queueMessageStyleCandidate(step1, { targetId: QUEUE, message: 2, style: 2 })
  assertReplayEquals(step2, load(R62), '轮62 消息样式')
})

ok('重放对拍: 几何+最大显示项（轮54→55；root9 全等）', () => {
  // 轮55 为复合轮：几何（f32 含编辑器拖拽噪声，按 after 快照读回精确值）+ 显示项 5→4
  const after55 = parseRoot9(load(R55)).recordsById.get(QUEUE)!
  const g = extractGeometry(after55.fields, after55.compTypes, [])!
  const geo = withSection(load(R54), (section) => {
    const field = section.find((f) => ownIdOf(f) === QUEUE)
    field!.value = setUiControlTransform(field!.value as Uint8Array, {
      position: [g.position![0], g.position![1]],
      size: [g.size![0], g.size![1]]
    })
  })
  const result = queuePropsCandidate(geo, { targetId: QUEUE, maxItems: 4 })
  assertReplayEquals(result, load(R55), '轮55 显示项')
})

ok('重放对拍: 限时显示开（轮55→56；f511 +3B root9 全等）', () => {
  const result = queuePropsCandidate(load(R55), { targetId: QUEUE, timedShow: true })
  assertReplayEquals(result, load(R56), '轮56 限时')
})

ok('重放对拍: 插入开头（轮56→57；f510 删 -3B root9 全等）', () => {
  const result = queuePropsCandidate(load(R56), { targetId: QUEUE, insertHead: true })
  assertReplayEquals(result, load(R57), '轮57 插入开头')
})

ok('重放对拍: 内容居中（轮57→58；f506 +3B root9 全等）', () => {
  const result = queuePropsCandidate(load(R57), { targetId: QUEUE, align: 'center' })
  assertReplayEquals(result, load(R58), '轮58 居中')
})

// ============ 补充2 第8→9步（另一队列，显式锚点） ============
ok('补充2 第8→9步: 三样式队列填充首空位（不变式级；图源资源变体登记）', () => {
  // 第9步队列 #355 f69 = [#1(空) #2(满) #3(满)] → 填充 #1（+22B）。
  // 字节级差异：第9步成员 t38 图源 49B ≠ 轮53 donor 53B（用户所选图不同——图源参数
  // 化待图源差分轮；本条降级为不变式：填充语义 + 组+成员创建 + 索引/物理锚可复算）
  if (!fs.existsSync(FIXTURES2)) {
    console.log('  (ui补充 快照缺失，跳过本条)')
    return
  }
  const before = new Uint8Array(fs.readFileSync(path.join(FIXTURES2, '1073741909.after-补充2-第8步-模板化后-5e56a922.gil')))
  const afterBytes = new Uint8Array(fs.readFileSync(path.join(FIXTURES2, '1073741909.after-补充2-第9步-样式一加素材-8dd0629d.gil')))
  const beforeParsed = parseRoot9(before)
  const afterParsed = parseRoot9(afterBytes)
  const target = afterParsed.records.find(
    (r) => r.compTypes.includes(77) && beforeParsed.recordsById.get(r.id)?.raw.length !== r.raw.length
  )
  assert.ok(target, '第9步应变更一条队列记录')
  assert.equal(target.raw.length - beforeParsed.recordsById.get(target.id)!.raw.length, 22, '填充应 +22B')
  const newRecords = afterParsed.records.filter((r) => !beforeParsed.recordsById.has(r.id))
  assert.equal(newRecords.length, 2, '第9步应新增组+成员两条')
  const group = newRecords.find((r) => r.parentId === null)!
  const member = newRecords.find((r) => r.parentId !== null)!
  const result = queueStyleAddCandidate(before, {
    targetId: target.id,
    material: member.compTypes.includes(38) ? 'image' : 'text',
    ids: { group: group.id, member: member.id },
    insertAfterId: (() => {
      const order = afterParsed.records.map((r) => r.id)
      return order[order.indexOf(group.id) - 1]
    })(),
    indexAfterId: (() => {
      const ids = [...afterParsed.indexIds]
      return ids[ids.indexOf(group.id) - 1]
    })()
  })
  const candParsed = parseRoot9(result.bytes)
  const candQueue = candParsed.recordsById.get(target.id)!
  // 队列记录级逐字节（编辑器一致）；成员差异仅图源资源块（53B vs 49B，登记）
  assert.equal(candQueue.raw.length, target.raw.length, '队列记录长度应一致')
  assert.equal(
    Buffer.from(candQueue.raw).equals(Buffer.from(target.raw)),
    true,
    '队列记录应逐字节一致'
  )
  const candGroup = candParsed.recordsById.get(group.id)!
  assert.equal(Buffer.from(candGroup.raw).equals(Buffer.from(group.raw)), true, '组记录应逐字节一致')
})

// ============ 语义回读 ============
ok('语义回读: extractQueueProps 随 props 操作演化', () => {
  const p58 = parseRoot9(load(R58)).recordsById.get(QUEUE)!
  const props58 = extractQueueProps(p58.fields, p58.compTypes, [])
  assert.equal(props58.maxItems, 4)
  assert.equal(props58.align, 'center')
  const messages = props58.messages as Array<{ name: string; styleIndex?: number }>
  assert.equal(messages.length, 1)
})

// ============ 不变式冒烟 ============
ok('全量快照: 消息项追加不变式（仅队列记录变化）', () => {
  const files = fs
    .readdirSync(FIXTURES)
    .filter((f) => f.endsWith('.gil'))
    .sort()
  assert.ok(files.length >= 80)
  let covered = 0
  for (const file of files) {
    const before = load(file)
    const beforeParsed = parseRoot9(before)
    const queue = beforeParsed.records.find((r) => r.compTypes.includes(79))
    if (!queue) continue
    covered += 1
    const result = queueMessageAddCandidate(before, { targetId: queue.id })
    const afterParsed = parseRoot9(result.bytes)
    for (const r of beforeParsed.records) {
      const same = afterParsed.recordsById.get(r.id)
      assert.ok(same, `${file}: 既有记录消失 ${r.id}`)
      const expectSame = r.id !== queue.id
      assert.equal(
        Buffer.from(same.raw).equals(Buffer.from(r.raw)),
        expectSame,
        `${file}: 记录${expectSame ? '被改动' : '未更新'} ${r.id}`
      )
    }
  }
  assert.ok(covered >= 15, `可冒烟快照 ${covered} 过少（队列自轮51 起）`)
})

// ============ fail-closed ============
ok('fail-closed: 非队列目标 / 非法参数', () => {
  assert.throws(
    () => queueStyleAddCandidate(load(R52), { targetId: 1073741825, material: 'image' }),
    /不是消息队列/
  )
  assert.throws(
    () => queueMessageAddCandidate(load(R52), { targetId: 1073741825 }),
    /不是消息队列/
  )
  assert.throws(
    () => queuePropsCandidate(load(R54), { targetId: QUEUE, maxItems: 0 }),
    /--max-items/
  )
})

console.log(`PASS ${passed} queue assertions`)
