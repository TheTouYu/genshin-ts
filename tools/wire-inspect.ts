/**
 * 通用 wire 结构检查工具（.gil/.gia 记录级）。
 *
 * 固化探索期反复手写的解析套路：
 *   read_varint/parse_fields/dump_tree/rec_by_id/type_codes/name_of/packed 解码
 * 现为一条命令，任意 .gil 的 root9 记录级探索无需再写脚本。
 *
 * 用法:
 *   npx tsx tools/wire-inspect.ts <file> --list                 盘点 root9 记录（ID/名/type码/parent/大小）
 *   npx tsx tools/wire-inspect.ts <file> --type <code>          列出含指定 type 码的记录（如 13 悬浮组/55 素材容器）
 *   npx tsx tools/wire-inspect.ts <file> --find <id> [--depth N] 定点 dump 记录完整字段树（默认深度 4）
 *   npx tsx tools/wire-inspect.ts <file> --find <id> --packed <field> 把字段当 packed varints 解码
 *   npx tsx tools/wire-inspect.ts <file> --top                  dump 顶层字段
 *   --json                                                     JSON 输出
 *   -h, --help
 *
 * 只读工具，不修改任何输入文件。试点：推箱子 1073741910 / 学习资产 1073741911（2026-08-27）。
 */
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

import { parseWireMessage, type WireField } from '../src/cli/static_assembly/wire.js'

const DECODER = new TextDecoder()

function textOf(v: Uint8Array): string | null {
  try {
    const t = DECODER.decode(v)
    if (t.length > 0 && t.length < 80 && /^[\x20-\x7e\u4e00-\u9fff]+$/.test(t)) return t
  } catch {
    /* ignore */
  }
  return null
}

function floatOf(v: Uint8Array): number | null {
  if (v.length === 4) return new DataView(v.buffer, v.byteOffset, 4).getFloat32(0, true)
  if (v.length === 8) return new DataView(v.buffer, v.byteOffset, 8).getFloat64(0, true)
  return null
}

function describe(field: WireField): string {
  if (field.wire === 0) return 'varint = ' + field.value
  if (field.wire === 1 || field.wire === 5) {
    const fl = floatOf(field.value as Uint8Array)
    return 'fixed -> ' + (fl !== null ? fl : (field.value as Uint8Array).length + 'B')
  }
  const bytes = field.value as Uint8Array
  const s = textOf(bytes)
  if (s !== null) return 'len=' + bytes.length + ' str="' + s + '"'
  if (bytes.length === 4 || bytes.length === 8) {
    const fl = floatOf(bytes)
    if (fl !== null && Number.isFinite(fl)) return 'len=' + bytes.length + ' f=' + fl.toFixed(4)
  }
  return 'len=' + bytes.length
}

function dumpTree(data: Uint8Array, indent: number, depth: number, showOnlyField?: number): void {
  const fields = parseWireMessage(data)
  if (!fields) return
  for (const f of fields) {
    if (showOnlyField !== undefined && f.number !== showOnlyField) continue
    const pad = '  '.repeat(indent)
    if (f.wire === 2) {
      console.log(pad + 'f' + f.number + ' ' + describe(f))
      if (depth > 1) {
        const sub = parseWireMessage(f.value as Uint8Array)
        if (sub && sub.length > 0) dumpTree(f.value as Uint8Array, indent + 1, depth - 1, showOnlyField)
      }
    } else {
      console.log(pad + 'f' + f.number + ' ' + describe(f))
    }
  }
}

type UiRec = { id: number | undefined; name: string; types: number[]; parent: number | undefined; size: number }

function typeCodesOf(m: WireField[]): number[] {
  const out: number[] = []
  for (const f of m) {
    if (f.number !== 502 || f.wire !== 2) continue
    const sub = parseWireMessage(f.value as Uint8Array)
    for (const s of sub ?? []) {
      if (s.number === 502 && s.wire === 0) out.push(s.value as number)
    }
  }
  return out
}

function nameOf(m: WireField[]): string {
  for (const f of m) {
    if (f.number !== 505 || f.wire !== 2) continue
    const sub = parseWireMessage(f.value as Uint8Array)
    for (const s of sub ?? []) {
      if (s.number !== 12 || s.wire !== 2) continue
      const sub2 = parseWireMessage(s.value as Uint8Array)
      for (const s2 of sub2 ?? []) {
        if (s2.number === 501 && s2.wire === 2) {
          const t = textOf(s2.value as Uint8Array)
          if (t) return t
        }
      }
    }
  }
  return ''
}

function root9Records(bytes: Uint8Array): WireField[] {
  const top = parseWireMessage(bytes.subarray(20, bytes.length - 4))
  const root9 = top?.find((f) => f.number === 9 && f.wire === 2)
  if (!root9) throw new Error('[error] root9 不存在')
  const section = parseWireMessage(root9.value as Uint8Array)
  return (section ?? []).filter((f) => f.number === 502 && f.wire === 2)
}

function parseRec(rec: Uint8Array): UiRec {
  const m = parseWireMessage(rec) ?? []
  const idField = m.find((x) => x.number === 501 && x.wire === 0)
  const parentField = m.find((x) => x.number === 504 && x.wire === 0)
  return {
    id: idField ? (idField.value as number) : undefined,
    name: nameOf(m),
    types: typeCodesOf(m),
    parent: parentField ? (parentField.value as number) : undefined,
    size: rec.length
  }
}

function main() {
  const args = process.argv.slice(2)
  if (args.includes('--help') || args.includes('-h') || args.length === 0) {
    console.log('用法: npx tsx tools/wire-inspect.ts <file.gil> [--list|--type <code>|--find <id>|--top] [--depth N] [--packed <field>] [--json]')
    process.exit(args.length === 0 ? 1 : 0)
  }
  const file = args[0]
  const json = args.includes('--json')
  const depthIdx = args.indexOf('--depth')
  const depth = depthIdx >= 0 ? Number(args[depthIdx + 1]) : 4
  const packedIdx = args.indexOf('--packed')
  const packedField = packedIdx >= 0 ? Number(args[packedIdx + 1]) : undefined
  const bytes = readFileSync(file)

  const out: Record<string, unknown> = { file }
  if (args.includes('--top')) {
    const top = parseWireMessage(bytes.subarray(20, bytes.length - 4))
    if (json) {
      out.top = (top ?? []).map((f) => ({ field: f.number, wire: f.wire, text: describe(f) }))
      console.log(JSON.stringify(out, null, 2))
    } else {
      dumpTree(bytes.subarray(20, bytes.length - 4), 0, depth)
    }
    return
  }

  const recs = root9Records(bytes).map((f) => parseRec(f.value as Uint8Array))

  if (args.includes('--list')) {
    if (json) {
      out.records = recs
      console.log(JSON.stringify(out, null, 2))
    } else {
      for (const r of recs) {
        const types = r.types.length ? 'type=' + r.types.join(',') : ''
        console.log(r.id + ' [' + (r.types[0] ?? '?') + '] name=' + (r.name || '(空)') + ' parent=' + (r.parent ?? '-') + ' size=' + r.size + (types ? ' ' + types : ''))
      }
    }
    return
  }

  const typeArg = args.indexOf('--type')
  if (typeArg >= 0) {
    const code = Number(args[typeArg + 1])
    const hits = recs.filter((r) => r.types.includes(code))
    if (json) {
      out.type = code
      out.records = hits
      console.log(JSON.stringify(out, null, 2))
    } else {
      console.log('type ' + code + ' 记录数: ' + hits.length)
      for (const r of hits) console.log('  ' + r.id + ' name=' + (r.name || '(空)') + ' parent=' + (r.parent ?? '-') + ' size=' + r.size)
    }
    return
  }

  const findIdx = args.indexOf('--find')
  if (findIdx >= 0) {
    const id = Number(args[findIdx + 1])
    const recField = root9Records(bytes).find((f) => {
      const m = parseWireMessage(f.value as Uint8Array)
      return m?.find((x) => x.number === 501 && x.wire === 0)?.value === id
    })
    if (!recField) throw new Error('[error] 记录 ' + id + ' 不存在')
    const m = parseWireMessage(recField.value as Uint8Array)
    if (json) {
      out.find = id
      out.fields = (m ?? []).map((f) => ({ field: f.number, wire: f.wire, text: describe(f) }))
      if (packedField !== undefined) {
        const pf = (m ?? []).find((f) => f.number === packedField && f.wire === 2)
        out.packed = pf ? decodePacked(pf.value as Uint8Array) : []
      }
      console.log(JSON.stringify(out, null, 2))
    } else {
      console.log('== 记录 ' + id + ' (depth ' + depth + ') ==')
      dumpTree(recField.value as Uint8Array, 0, depth)
      if (packedField !== undefined) {
        const pf = (m ?? []).find((f) => f.number === packedField && f.wire === 2)
        console.log('== packed f' + packedField + ' ==')
        console.log(pf ? decodePacked(pf.value as Uint8Array) : '(无)')
      }
    }
    return
  }

  console.log('未指定操作（--list / --type / --find / --top）；-h 查看用法')
  process.exit(1)
}

function decodePacked(data: Uint8Array): number[] {
  const out: number[] = []
  let off = 0
  while (off < data.length) {
    let shift = 0
    let v = 0
    let b: number
    do {
      b = data[off++]
      v |= (b & 0x7f) << shift
      shift += 7
    } while (b & 0x80)
    out.push(v >>> 0)
  }
  return out
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main()
}

