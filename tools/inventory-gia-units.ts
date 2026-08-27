
/**
 * 盘点 GIA 文件的全部单元（Root.f1 graph 单元 + Root.f2 accessories 单元）。
 * 解决 decode-gia.ts 对「素材/UI .gia」的盲区：其 which=61/21/15/1 不是标准节点图，
 * payload 在 f19/f11 等非已知 oneof 字段，且 Root.f1 重复出现（protobuf 单数语义下
 * decode-gia 只保留最后一条）。
 *
 * 用法:
 *   npx tsx tools/inventory-gia-units.ts <file.gia>
 *   npx tsx tools/inventory-gia-units.ts <file.gia> --json
 *   npx tsx tools/inventory-gia-units.ts <file.gia> --extract <dir>   # 导出每个单元 payload 字节
 *
 * 只读工具，不修改任何输入文件。
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { parseWireMessage, type WireField } from '../src/cli/static_assembly/wire.js'

const TEXT_DECODER = new TextDecoder()

function textOf(value: Uint8Array): string {
  try {
    return TEXT_DECODER.decode(value)
  } catch {
    return ''
  }
}

function printable(text: string): boolean {
  for (const ch of text) {
    const code = ch.charCodeAt(0)
    if (code !== 0x20 && (code < 0x21 || code > 0x7e) && (code < 0x4e00 || code > 0x9fff)) return false
  }
  return text.length > 0
}

type UnitInfo = {
  index: number
  section: 'graph' | 'accessory'
  field: number
  id: { class?: number; type?: number; id?: number } | null
  relatedIds: number[]
  name: string
  which: number | null
  payloadField: number | null
  payloadLen: number
  totalLen: number
}

/** 解 GraphUnit.Id 消息（f1.f2=class, f1.f3=type, f1.f4=id） */
function parseId(fields: readonly WireField[] | undefined): { class?: number; type?: number; id?: number } | null {
  if (!fields) return null
  const value: { class?: number; type?: number; id?: number } = {}
  for (const f of fields) {
    if (f.wire !== 0) continue
    if (f.number === 2) value.class = f.value as number
    else if (f.number === 3) value.type = f.value as number
    else if (f.number === 4) value.id = f.value as number
  }
  return Object.keys(value).length > 0 ? value : null
}

function parseUnit(raw: Uint8Array): UnitInfo {
  const m = parseWireMessage(raw) ?? []
  const idField = m.find((f) => f.number === 1 && f.wire === 2)
  const related: number[] = []
  for (const f of m) {
    if (f.number !== 2 || f.wire !== 2) continue
    const sub = parseWireMessage(f.value as Uint8Array)
    const rid = sub?.find((x) => x.number === 4 && x.wire === 0)?.value
    if (typeof rid === 'number' && rid > 0) related.push(rid)
  }
  let name = ''
  for (const f of m) {
    if (f.number !== 3 || f.wire !== 2) continue
    const text = textOf(f.value as Uint8Array)
    if (printable(text)) name = text
    break
  }
  let which: number | null = null
  const whichField = m.find((f) => f.number === 5 && f.wire === 0)
  if (whichField && typeof whichField.value === 'number') which = whichField.value
  let payloadField: number | null = null
  let payloadLen = 0
  for (const f of m) {
    if (f.wire !== 2) continue
    if (f.number === 11 || f.number === 13 || f.number === 14 || f.number === 19 || f.number === 22) {
      payloadField = f.number
      payloadLen = (f.value as Uint8Array).length
      break
    }
  }
  return {
    index: 0,
    section: 'graph',
    field: 0,
    id: parseId(idField ? parseWireMessage(idField.value as Uint8Array) : undefined),
    relatedIds: related,
    name,
    which,
    payloadField,
    payloadLen,
    totalLen: raw.length
  }
}

const WHICH_HINT: Record<number, string> = {
  1: '复合定义',
  9: '节点图',
  15: '素材组',
  21: '控件模板',
  61: '素材容器'
}

function main() {
  const args = process.argv.slice(2)
  const file = args[0]
  if (!file || file === '--help' || file === '-h') {
    console.log('用法: npx tsx tools/inventory-gia-units.ts <file.gia> [--json] [--extract <dir>]')
    process.exit(file ? 0 : 1)
  }
  const jsonMode = args.includes('--json')
  const extractIdx = args.indexOf('--extract')
  const extractDir = extractIdx >= 0 ? args[extractIdx + 1] : undefined

  const bytes = new Uint8Array(fs.readFileSync(file))
  const proto = bytes.slice(20, -4)
  const top = parseWireMessage(proto)
  if (!top) throw new Error('[error] malformed GIA payload')

  const units: UnitInfo[] = []
  let gi = 0
  let ai = 0
  for (const f of top) {
    if (f.wire !== 2) continue
    if (f.number === 1) {
      const u = parseUnit(f.value as Uint8Array)
      u.index = gi
      u.section = 'graph'
      u.field = 1
      units.push(u)
      gi++
    } else if (f.number === 2) {
      const u = parseUnit(f.value as Uint8Array)
      u.index = ai
      u.section = 'accessory'
      u.field = 2
      units.push(u)
      ai++
    }
  }

  if (extractDir) {
    fs.mkdirSync(extractDir, { recursive: true })
    let idx = 0
    for (const f of top) {
      if (f.wire !== 2 || (f.number !== 1 && f.number !== 2)) continue
      const u = units[idx]
      const m = parseWireMessage(f.value as Uint8Array) ?? []
      const payload = m.find(
        (x) => x.wire === 2 && (x.number === 11 || x.number === 13 || x.number === 14 || x.number === 19 || x.number === 22)
      )
      const safeName = (u.name || 'unnamed').replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 40)
      const fname = path.join(
        extractDir,
        String(idx).padStart(3, '0') + '_' + u.section + '_w' + String(u.which) + '_' + safeName + '.bin'
      )
      if (payload) fs.writeFileSync(fname, payload.value as Uint8Array)
      else fs.writeFileSync(fname, f.value as Uint8Array)
      idx++
    }
    if (!jsonMode) console.log('extracted', idx, 'units to', extractDir)
  }

  if (jsonMode) {
    console.log(JSON.stringify({ schemaVersion: 1, kind: 'gia-unit-inventory', units }, null, 2))
    return
  }
  for (const u of units) {
    const hint = u.which !== null ? WHICH_HINT[u.which] ?? '' : ''
    console.log(
      `#${String(u.index).padStart(3, '0')} [${u.section}]` +
        ` which=${u.which ?? '?'}(${hint}) id=${u.id?.id ?? '?'} name=${u.name || '(unnamed)'}` +
        ` payload=f${u.payloadField ?? '-'}:${u.payloadLen} total=${u.totalLen} related=${u.relatedIds.length}`
    )
  }
  console.log('total units:', units.length)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main()
}

