/**
 * ui/tests/gen-templateize-slots.ts — 生成 ui/src/templateize-slots.ts（模板化族槽字节常量）
 *
 * 运行：npx tsx ui/tests/gen-templateize-slots.ts
 * 源：真实编辑器样本（按钮族 轮5 after-重启5 / 轮6 after-重启6）的 family 槽整字段字节。
 * 生成物勿手改；防漂移靠 ui/tests/create-candidates-assert.ts 对拍与 sha 注释。
 */

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import { parseRoot9 } from '../src/record.js'

const ROOT = path.resolve(import.meta.dirname, '..', '..')
const FIXTURES = path.join(ROOT, '.gsts', 'diff-exp', 'ui学习')
const OUT = path.join(ROOT, 'ui', 'src', 'templateize-slots.ts')

function parseMsg(data: Uint8Array): Array<[number, number | Uint8Array]> {
  const out: Array<[number, number | Uint8Array]> = []
  let o = 0
  while (o < data.length) {
    let k = 0
    let s = 0
    while (o < data.length) {
      const b = data[o++]
      k |= (b & 0x7f) << s
      if (b < 0x80) break
      s += 7
    }
    const num = k >> 3
    const wt = k & 7
    if (wt === 0) {
      let v = 0
      let s2 = 0
      while (o < data.length) {
        const b = data[o++]
        v |= (b & 0x7f) << s2
        if (b < 0x80) break
        s2 += 7
      }
      out.push([num, v])
    } else if (wt === 2) {
      let ln = 0
      let s2 = 0
      while (o < data.length) {
        const b = data[o++]
        ln |= (b & 0x7f) << s2
        if (b < 0x80) break
        s2 += 7
      }
      out.push([num, data.subarray(o, o + ln)])
      o += ln
    } else {
      o += wt === 1 ? 8 : 4
    }
  }
  return out
}

function fullRecordFields(
  data: Uint8Array
): Array<{ num: number; wire: number; start: number; end: number }> {
  const out: Array<{ num: number; wire: number; start: number; end: number }> = []
  let o = 0
  while (o < data.length) {
    let k = 0
    let s = 0
    const start = o
    while (o < data.length) {
      const b = data[o++]
      k |= (b & 0x7f) << s
      if (b < 0x80) break
      s += 7
    }
    const num = k >> 3
    const wt = k & 7
    if (wt === 2) {
      let ln = 0
      let s2 = 0
      while (o < data.length) {
        const b = data[o++]
        ln |= (b & 0x7f) << s2
        if (b < 0x80) break
        s2 += 7
      }
      o += ln
      out.push({ num, wire: wt, start, end: o })
    } else if (wt === 0) {
      let v = 0
      let s2 = 0
      while (o < data.length) {
        const b = data[o++]
        v |= (b & 0x7f) << s2
        if (b < 0x80) break
        s2 += 7
      }
      void v
      out.push({ num, wire: wt, start, end: o })
    } else {
      o += wt === 1 ? 8 : 4
      out.push({ num, wire: wt, start, end: o })
    }
  }
  return out
}

function findSlot(
  raw: Uint8Array,
  typeCode: number
): { start: number; end: number } | undefined {
  for (const f of fullRecordFields(raw)) {
    if (f.num !== 502 || f.wire !== 2) continue
    const inner = parseMsg(raw.subarray(f.start + 1, f.end)) // 粗定位：字段体紧随 key
    // 精确解析：以 f.start 重新解码 key/len
    const exact = exactField(raw, f.start)
    if (!exact) continue
    const msg = parseMsg(raw.subarray(exact.payloadStart, exact.end))
    if (msg.some(([n, v]) => n === 502 && v === typeCode)) {
      return { start: exact.start, end: exact.end }
    }
  }
  return undefined
}

function exactField(
  data: Uint8Array,
  at: number
): { start: number; payloadStart: number; end: number } | undefined {
  let o = at
  let k = 0
  let s = 0
  while (o < data.length) {
    const b = data[o++]
    k |= (b & 0x7f) << s
    if (b < 0x80) break
    s += 7
  }
  void k
  let ln = 0
  let s2 = 0
  while (o < data.length) {
    const b = data[o++]
    ln |= (b & 0x7f) << s2
    if (b < 0x80) break
    s2 += 7
  }
  if (o + ln > data.length) return undefined
  return { start: at, payloadStart: o, end: o + ln }
}

function sha256(bytes: Uint8Array): string {
  return crypto.createHash('sha256').update(Buffer.from(bytes)).digest('hex')
}

const hex = (b: Uint8Array) => Buffer.from(b).toString('hex')

function load(file: string) {
  return parseRoot9(new Uint8Array(fs.readFileSync(path.join(FIXTURES, file))))
}

if (!fs.existsSync(FIXTURES)) {
  console.log('SKIP: 快照目录缺失')
  process.exit(0)
}

const after5 = load('1073741909.after-重启5-按钮保存为模板-7e62741d.gil')
const after6 = load('1073741909.after-重启6-模板保存入库-cb6c78ae.gil')
const after23 = load('1073741909.after-重启23-输入框存模板-2ac5a0b8.gil')
const after63 = load('1073741909.after-重启63-队列存模板同步-5572a5f9.gil')
const inst5 = after5.recordsById.get(1073742032)!
const tpl5 = after5.recordsById.get(1073742033)!
const tpl6 = after6.recordsById.get(1073742033)!
const inputUpgraded = after23.recordsById.get(1073742079)!
const queueUpgraded = after63.recordsById.get(1073742132)!
const queueTpl = after63.recordsById.get(1073742137)!

const subtype = findSlot(tpl5.raw, 6)
const subtypeV2 = findSlot(inputUpgraded.raw, 6)
const subtypeV3 = findSlot(queueUpgraded.raw, 6)
const type3 = findSlot(inst5.raw, 3)
const type4single = findSlot(tpl5.raw, 4)
const type4double = findSlot(tpl6.raw, 4)
const type4queueDouble = findSlot(queueTpl.raw, 4)
if (!subtype || !subtypeV2 || !subtypeV3 || !type3 || !type4single || !type4double || !type4queueDouble) {
  throw new Error('槽定位失败')
}

function line(name: string, range: { start: number; end: number }, raw: Uint8Array, src: string): string {
  const bytes = raw.subarray(range.start, range.end)
  return (
    `  /** ${name} — 源: ${src}（f502 槽整字段字节，key+len+payload） */\n` +
    `  ${name}: '${hex(bytes)}',\n` +
    `  /** sha256: ${sha256(bytes)} */\n`
  )
}

const out =
  `/**\n` +
  ` * ui/src/templateize-slots.ts — 模板化族槽字节常量（AUTO-GENERATED）\n` +
  ` *\n` +
  ` * ⚠️ 生成物勿手改：源=真实编辑器样本（按钮族 轮5 after-重启5 / 轮6 after-重启6）。\n` +
  ` * 用法：整字段字节克隆 + 内部 ID 定宽字节重映射（勿重新编码未知结构）。\n` +
  ` * 重新生成：npx tsx ui/tests/gen-templateize-slots.ts\n` +
  ` */\n\n` +
  `export const TPL_SLOTS = {\n` +
  line('SUBTYPE', subtype, tpl5.raw, '轮5 2033/2032 subtype6 槽（按钮族 v1）') +
  line('SUBTYPE_V2', subtypeV2, inputUpgraded.raw, '轮23 2079 subtype6 槽（输入框族 v2）') +
  line('SUBTYPE_V3', subtypeV3, queueUpgraded.raw, '轮63 2132 subtype6 槽（队列族 v3）') +
  line('TYPE3_SINGLE', type3, inst5.raw, '轮5 2032 instance type3 槽(f13→2033)') +
  line('TYPE4_SINGLE', type4single, tpl5.raw, '轮5 2033 template type4 槽(f14=[2032])') +
  line('TYPE4_DOUBLE', type4double, tpl6.raw, '轮6 2033 template type4 槽(f14=[2032,2034])') +
  line('TYPE4_QUEUE_DOUBLE', type4queueDouble, queueTpl.raw, '轮63 2137 template type4 槽(队列双引用)') +
  `} as const\n`
fs.writeFileSync(OUT, out)
console.log(`wrote ${OUT}`)
console.log('SUBTYPE', subtype.end - subtype.start, 'TYPE3', type3.end - type3.start,
  'TYPE4_S', type4single.end - type4single.start, 'TYPE4_D', type4double.end - type4double.start)
