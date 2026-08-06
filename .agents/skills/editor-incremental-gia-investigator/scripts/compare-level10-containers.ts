// root 10 Level 容器的 field2(CompositeDef)/field4(内部图) 列表逐项字节对比（按 occurrence）
// 用法：npx tsx scripts/compare-level10-containers.ts <before.gil> <after.gil>
// 输出：root10 直接子字段(field2/field4)中字节不同的项，含 len + sha8 + 尽力解码摘要。
// 避坑（v31 实测）：
//  - 顶层 fields 是 parseMessage 递归结果，必须 filter(depth === 1 && field === 10) 取 Level 容器；
//    find(field === 10) 会命中深层字段导致解析错乱。
//  - Level 的 field2/field4 列表项是"单层 f1 包装"（f1 内容直接是 CompositeDef/NodeGraph 字段），
//    与 gia.proto 的 CompositeDefWrapper{InnerWrapper} 两层结构不符，protobufjs decode 会错位/越界，
//    摘要用轻量 walk 手工提取。
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

import { readGilPayloadFields } from '../../../../src/cli/gil_extract_utils.js'
import { parseMessage, readVarint } from '../../../../src/injector/binary.js'
import type { LenField } from '../../../../src/injector/types.js'

const [beforePath, afterPath] = process.argv.slice(2)
if (!beforePath || !afterPath) {
  console.error('usage: compare-level10-containers.ts <before.gil> <after.gil>')
  process.exit(1)
}
for (const p of [beforePath, afterPath]) {
  if (!existsSync(p)) {
    console.error(`file not found: ${p}`)
    process.exit(1)
  }
}

function sha8(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex').slice(0, 8)
}

type Field = readonly [number, number, number, number] // field, wire, dataStart, dataEnd

// walk 只收集 length-delimited(wire=2) 字段（嵌套 message）；varint 字段需手动读。
function walk(buf: Uint8Array, start = 0, end = buf.length): Field[] {
  const out: Field[] = []
  let i = start
  while (i < end) {
    const key = readVarint(buf, i)
    if (!key || key.next > end) break
    i = key.next
    const field = key.value >> 3
    const wire = key.value & 7
    if (wire === 0) {
      const v = readVarint(buf, i)
      if (!v) break
      i = v.next
    } else if (wire === 2) {
      const lenV = readVarint(buf, i)
      if (!lenV) break
      const dataStart = lenV.next
      const dataEnd = dataStart + lenV.value
      if (dataEnd > end) break
      out.push([field, wire, dataStart, dataEnd])
      i = dataEnd
    } else if (wire === 1) {
      i += 8
    } else if (wire === 5) {
      i += 4
    } else break
  }
  return out
}

function decodeUtf8(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes)
}

// f2: CompositeDef；f4: NodeGraph（内部实现图）。单层 f1 包装，摘要手工提取。
// NodeGraph.Id 内部全是 varint（class=1/type=2/kind=3/id=5），walk 不收集，单独扫。
function readId(buf: Uint8Array): number | null {
  let i = 0
  let id: number | null = null
  while (i < buf.length) {
    const key = readVarint(buf, i)
    if (!key) break
    i = key.next
    const field = key.value >> 3
    const wire = key.value & 7
    if (wire === 0) {
      const v = readVarint(buf, i)
      if (!v) break
      if (field === 5) id = v.value
      i = v.next
    } else if (wire === 2) {
      const lenV = readVarint(buf, i)
      if (!lenV) break
      i = lenV.next + lenV.value
    } else break
  }
  return id
}

function summarize(kind: 'def' | 'graph', body: Uint8Array): string {
  const outer = walk(body)
  if (outer.length !== 1 || outer[0][0] !== 1) return 'unexpected-wrapper'
  const inner = body.subarray(outer[0][2], outer[0][3])
  const fields = walk(inner)
  if (kind === 'def') {
    const name = fields.find((f) => f[0] === 200)
    const inputs = fields.filter((f) => f[0] === 102).length
    const outputs = fields.filter((f) => f[0] === 103).length
    const inflows = fields.filter((f) => f[0] === 100).length
    const outflows = fields.filter((f) => f[0] === 101).length
    const lastPin = [...fields].reverse().find((f) => f[0] === 102 || f[0] === 103)
    let pinIndex = ''
    if (lastPin) {
      const pf = walk(inner.subarray(lastPin[2], lastPin[3]))
      const pi = pf.find((f) => f[0] === 8)
      if (pi) pinIndex = ` pinIndex=${readVarint(inner, pi[2])!.value}`
    }
    return `name=${name ? decodeUtf8(inner.subarray(name[2], name[3])) : '?'}` +
      ` in=${inputs} out=${outputs} fin=${inflows} fout=${outflows}${pinIndex}`
  }
  const id = fields.find((f) => f[0] === 1)
  let idStr = '?'
  if (id) idStr = String(readId(inner.subarray(id[2], id[3])) ?? '?')
  const pins = fields.filter((f) => f[0] === 4).length
  const nodes = fields.filter((f) => f[0] === 3).length
  return `id=${idStr} compositePins=${pins} nodes=${nodes}`
}

function items(gilPath: string, field: number): { len: number; sha: string; sum: string }[] {
  const { payload, fields } = readGilPayloadFields(gilPath)
  const root10 = fields.find((f) => f.depth === 1 && f.field === 10)
  if (!root10) throw new Error(`root 10 not found in ${gilPath}`)
  const children: LenField[] = []
  parseMessage(payload, root10.dataStart, root10.dataEnd, 1, 10, 0, 0, 0, 0, 0, children)
  return children
    .filter((f) => f.depth === 2 && f.field === field)
    .map((f) => {
      const body = payload.subarray(f.dataStart, f.dataEnd)
      const kind = field === 2 ? ('def' as const) : ('graph' as const)
      return { len: body.length, sha: sha8(body), sum: summarize(kind, body) }
    })
}

let changed = 0
for (const field of [2, 4]) {
  const b = items(beforePath, field)
  const a = items(afterPath, field)
  console.log(`== root10 field${field}: ${b.length} -> ${a.length} items ==`)
  for (let i = 0; i < Math.max(b.length, a.length); i++) {
    const bb = b[i] ?? null
    const aa = a[i] ?? null
    if (JSON.stringify(bb) !== JSON.stringify(aa)) {
      changed++
      console.log(`[${i}] before: ${bb ? `${bb.len}B ${bb.sha} ${bb.sum}` : '(absent)'}`)
      console.log(`[${i}] after : ${aa ? `${aa.len}B ${aa.sha} ${aa.sum}` : '(absent)'}`)
    }
  }
}
console.log(changed === 0 ? 'NO CHANGES' : `${changed} item(s) changed`)
