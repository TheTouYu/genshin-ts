// 复合节点定义/内部图定点解码（v22-v48 复合模块常用）
// 用法：npx tsx scripts/inspect-composite-def.ts <gil> [defIndex] [graphIndex]
//   - 无参数：打印 root10 field2(CompositeDef)/field4(内部图) 全部项摘要（len/sha8/in/out/fin/fout/compositePins/nodes）
//   - defIndex=N：打印 f2[N] 详细（name、inputs/outputs/inflows/outflows 各项 name/index/type/pinIndex/description）
//   - graphIndex=N：打印 f4[N] 详细（compositePins 各项 + nodes 各项 nodeIndex/gid/cid/pins 摘要/坐标）
// 避坑（v31 实测，与 compare-level10-containers.ts 同源）：
//   - 顶层 fields 必须 filter(depth === 1 && field === 10)；find(field === 10) 会命中深层字段。
//   - f2/f4 列表项是单层 f1 包装（f1 内容直接是 CompositeDef/NodeGraph 字段）。
//   - walk 只收集 wire=2 嵌套 message；varint 字段（Id、nodeIndex 等）需手动扫。
//   - 字符串字段不能递归 walk（UTF-8 中文会当 message 解析越界），直接按字段号取 bytes。
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
import { readGilPayloadFields } from '../../../../src/cli/gil_extract_utils.js'
import { parseMessage, readVarint } from '../../../../src/injector/binary.js'

const [gil, defIdxArg, graphIdxArg] = process.argv.slice(2)
if (!gil || !existsSync(gil)) {
  console.error('usage: inspect-composite-def.ts <gil> [defIndex] [graphIndex]')
  process.exit(1)
}
const defIdx = defIdxArg !== undefined ? Number(defIdxArg) : null
const graphIdx = graphIdxArg !== undefined ? Number(graphIdxArg) : null

type Field = [number, number, Uint8Array] // field, wire(0=varint/1=fixed64/2=bytes/5=fixed32), value/bytes

// walk 只收集 wire=2 嵌套 message；varint 字段手动扫（readVarint）
function walk(buf: Uint8Array): Field[] {
  const out: Field[] = []
  let i = 0
  while (i < buf.length) {
    const key = readVarint(buf, i)
    if (!key || key.next > buf.length) break
    i = key.next
    const field = key.value >> 3
    const wire = key.value & 7
    if (wire === 0) {
      const v = readVarint(buf, i)
      if (!v) break
      out.push([field, 0, Uint8Array.from([v.value])])
      i = v.next
    } else if (wire === 2) {
      const lenV = readVarint(buf, i)
      if (!lenV) break
      const s = lenV.next
      out.push([field, 2, buf.subarray(s, s + lenV.value)])
      i = s + lenV.value
    } else if (wire === 1) {
      out.push([field, 1, buf.subarray(i, i + 8)])
      i += 8
    } else if (wire === 5) {
      out.push([field, 5, buf.subarray(i, i + 4)])
      i += 4
    } else break
  }
  return out
}

function varintFields(buf: Uint8Array): Map<number, number[]> {
  const m = new Map<number, number[]>()
  for (const [f, w, v] of walk(buf)) {
    if (w === 0) m.set(f, [...(m.get(f) ?? []), v[0]])
  }
  return m
}

const hex = (b: Uint8Array) => Buffer.from(b).toString('hex')
const str = (b: Uint8Array) => {
  try {
    return Buffer.from(b).toString('utf8')
  } catch {
    return hex(b)
  }
}
function sha8(b: Uint8Array): string {
  return createHash('sha256').update(b).digest('hex').slice(0, 8)
}

// Id message：{class(1), type(2), kind(3), id(5)} 全 varint，取 id
function idOf(b: Uint8Array): number | null {
  let i = 0
  let id: number | null = null
  while (i < b.length) {
    const key = readVarint(b, i)
    if (!key) break
    i = key.next
    const field = key.value >> 3
    const wire = key.value & 7
    if (wire === 0) {
      const v = readVarint(b, i)
      if (!v) break
      if (field === 5) id = v.value
      i = v.next
    } else if (wire === 2) {
      const l = readVarint(b, i)
      if (!l) break
      i = l.next + l.value
    } else break
  }
  return id
}

function items(gilPath: string, fieldNo: number): Uint8Array[] {
  const { payload, fields } = readGilPayloadFields(gilPath)
  const root10 = fields.find((f) => f.depth === 1 && f.field === 10)
  if (!root10) throw new Error(`root 10 not found in ${gilPath}`)
  const children: any[] = []
  parseMessage(payload, root10.dataStart, root10.dataEnd, 1, 10, 0, 0, 0, 0, 0, children)
  return children
    .filter((f) => f.depth === 2 && f.field === fieldNo)
    .map((f) => payload.subarray(f.dataStart, f.dataEnd))
}

// 单层 f1 包装 → 内容
function un1(body: Uint8Array): Uint8Array {
  const o = walk(body)
  if (o.length !== 1 || o[0][0] !== 1) throw new Error('unexpected wrapper')
  return o[0][2]
}

// 参数流/控制流的 index(3) message：{kind(1), index(2)} varint
function pinIdxDesc(b: Uint8Array): string {
  const v = varintFields(b)
  return `kind=${v.get(1)?.[0] ?? '?'} idx=${v.get(2)?.[0] ?? '(省略)'}`
}

function defSummary(body: Uint8Array): string {
  const inner = un1(body)
  const fields = walk(inner)
  const name = fields.find((f) => f[0] === 200)
  const cnt = (n: number) => fields.filter((f) => f[0] === n).length
  return `name=${name ? str(name[2]) : '?'} in=${cnt(102)} out=${cnt(103)} fin=${cnt(100)} fout=${cnt(101)}`
}

function graphSummary(body: Uint8Array): string {
  const inner = un1(body)
  const fields = walk(inner)
  const id = fields.find((f) => f[0] === 1)
  const pins = fields.filter((f) => f[0] === 4).length
  const nodes = fields.filter((f) => f[0] === 3).length
  return `id=${id ? idOf(id[2]) ?? '?' : '?'} compositePins=${pins} nodes=${nodes}`
}

function printDefDetail(body: Uint8Array): void {
  const inner = un1(body)
  console.log('--- CompositeDef ---')
  for (const [f, , v] of walk(inner)) {
    if (f === 200) console.log(`name(200) = ${str(v)}`)
    else if (f === 100 || f === 101 || f === 102 || f === 103) {
      const tag = { 100: 'inflow', 101: 'outflow', 102: 'input', 103: 'output' }[f]
      const vs = walk(v)
      const name = vs.find(([x]) => x === 1)
      const index = vs.find(([x]) => x === 3)
      const type = vs.find(([x]) => x === 4) // ParameterFlow.type；ControlFlow 无 type
      const desc = vs.find(([x]) => x === 4) // ControlFlow.description；ParameterFlow 无 desc
      const pi = varintFields(v).get(8)
      const isCf = f === 100 || f === 101
      console.log(
        `${tag}: name=${name ? str(name[2]) : '(无)'} index(${index ? hex(index[2]) : '-'})=` +
          `{${index ? pinIdxDesc(index[2]) : '?'}} ${isCf ? 'desc' : 'type'}=` +
          `${isCf ? (desc && desc[2].length === 0 ? '显式空' : desc ? hex(desc[2]) : '-') : type ? hex(type[2]) : '-'} ` +
          `pinIndex=${pi?.[0] ?? '?'}`
      )
    }
  }
}

function printGraphDetail(body: Uint8Array): void {
  const inner = un1(body)
  console.log('--- 内部实现图 ---')
  for (const [f, , v] of walk(inner)) {
    if (f === 4) {
      const vs = walk(v)
      const outer = vs.find(([x]) => x === 1)
      const innerNode = varintFields(v).get(2)
      const innerPin = vs.find(([x]) => x === 3)
      console.log(
        `compositePin: outer=${outer ? hex(outer[2]) : '?'} innerNode=${innerNode?.[0] ?? '?'} ` +
          `inner=${innerPin ? hex(innerPin[2]) : '?'}`
      )
    } else if (f === 3) {
      const vs = varintFields(v)
      const gid = walk(v).find(([x]) => x === 2)
      const cid = walk(v).find(([x]) => x === 3)
      const coordX = walk(v).find(([x]) => x === 5)
      const coordY = walk(v).find(([x]) => x === 6)
      const pins = walk(v)
        .filter(([x]) => x === 4)
        .map(([, , p]) => {
          const pv = varintFields(p)
          const i1 = walk(p).find(([x]) => x === 1)
          const i2 = walk(p).find(([x]) => x === 2)
          const type = walk(p).find(([x]) => x === 3)
          const conns = walk(p)
            .filter(([x]) => x === 5)
            .map(([, , c]) => hex(c))
          return `pin(i1=${i1 ? hex(i1[2]) : '?'} i2=${i2 ? hex(i2[2]) : '?'} ` +
            `type=${type ? hex(type[2]).slice(0, 40) : 'varint' + (pv.get(3)?.[0] ?? '?')} ` +
            `conns=[${conns.join(',')}])`
        })
      console.log(
        `node ${vs.get(1)?.[0] ?? '?'}: gid=${gid ? idOf(gid[2]) ?? '?' : '?'} ` +
          `cid=${cid ? idOf(cid[2]) ?? '?' : '(无)'} pins=[${pins.join(' | ')}] ` +
          `coord=${coordX && coordY ? `(${Buffer.from(coordX[2]).readFloatLE(0)}, ${Buffer.from(coordY[2]).readFloatLE(0)})` : '(无)'}`
      )
    }
  }
}

const defs = items(gil, 2)
const graphs = items(gil, 4)
if (defIdx === null && graphIdx === null) {
  console.log(`== root10 field2: ${defs.length} items ==`)
  defs.forEach((d, i) => console.log(`[${i}] ${d.length}B ${sha8(d)} ${defSummary(d)}`))
  console.log(`== root10 field4: ${graphs.length} items ==`)
  graphs.forEach((g, i) => console.log(`[${i}] ${g.length}B ${sha8(g)} ${graphSummary(g)}`))
} else {
  if (defIdx !== null) {
    if (defIdx < 0 || defIdx >= defs.length) {
      console.error(`def index ${defIdx} out of range 0..${defs.length - 1}`)
      process.exit(1)
    }
    printDefDetail(defs[defIdx])
  }
  if (graphIdx !== null) {
    if (graphIdx < 0 || graphIdx >= graphs.length) {
      console.error(`graph index ${graphIdx} out of range 0..${graphs.length - 1}`)
      process.exit(1)
    }
    printGraphDetail(graphs[graphIdx])
  }
}
