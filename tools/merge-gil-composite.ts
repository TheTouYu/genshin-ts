// @ts-nocheck
/**
 * 跨文件结构复制：把 src.gil 中某复合的 def 记录 + impl 图记录整条搬进 dst.gil
 * （wire 原样搬移 + 容器长度/文件头长度更新）。
 *
 * 背景（2026-08-12 魔方第 3 轮复盘）：把"状态复合"候选（def#61 + impl#61）合并进
 * bind-hold 候选时，子代理自写 3 版脚本 + 5 个探针才摸清 GIL root 布局。本工具把
 * 已验证的 merge_state3.ts 逻辑泛化沉淀（defId → implId 自动解析，非硬编码）。
 *
 * GIL root 布局（本轮实证）：
 *   root.field10 是单个大容器，内按分组顺序平铺子消息：主图组 field1、def 组 field2、
 *   p1=3 组、impl 图组 field4、p1=5 组；每条记录 = 一个 {1: 记录} 子消息。
 *   合并 = 把 src 中 def/impl 记录所在 d2 容器（tag+len+value 整条 wire）原样插到
 *   dst 对应分组尾部；然后更新 field10 长度 varint 与文件头长度
 *   （u32@0 = payload+20、u32@16 = payload；尾 tag 不动）。
 *
 * 用法:
 *   npx tsx tools/merge-gil-composite.ts <src.gil> <dst.gil> <defId> <out.gil>
 * 验证:
 *   npx tsx tools/diff-gil-files.ts <dst.gil> <out.gil>   # 预期只新增 def+impl
 *   npx tsx tools/diff-gil-files.ts <src.gil> <out.gil>   # 预期 def/impl 无变化
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { readGilPayloadFields } from '../src/cli/gil_extract_utils.js'
import { parseMessage, encodeVarint } from '../src/injector/binary.js'
import { blobId, compositeImplGraphId } from '../src/cli/static_assembly/graph_edit.js'

const [srcPath, dstPath, defIdStr, outPath] = process.argv.slice(2)
if (!srcPath || !dstPath || !defIdStr || !outPath) {
  console.error('用法: npx tsx tools/merge-gil-composite.ts <src.gil> <dst.gil> <defId> <out.gil>')
  process.exit(1)
}
const DEF_ID = Number(defIdStr)

function fieldsOf(path: string): { payload: Uint8Array; fields: any[] } {
  const g = readGilPayloadFields(path)
  return { payload: g.payload, fields: g.fields }
}
function splice(payload: Uint8Array, at: number, bytes: Uint8Array): Uint8Array {
  return new Uint8Array([...payload.subarray(0, at), ...bytes, ...payload.subarray(at)])
}

const src = fieldsOf(srcPath)
const dst = fieldsOf(dstPath)
const IMPL_ID = compositeImplGraphId(src.payload, DEF_ID)

/** 记录所在 d2 容器（p1=section 的 {1: record} 子消息）整条 wire（tag+len+value）。 */
function containerWire(p1: 2 | 4, wantId: number): Uint8Array {
  const recs = src.fields.filter((f: any) => f.depth === 3 && f.p0 === 10 && f.p1 === p1 && f.p2 === 1)
  const rec = recs.find((f: any) => blobId(src.payload.subarray(f.dataStart, f.dataEnd), p1) === wantId)
  if (!rec) throw new Error(`record ${wantId} section ${p1} not found in ${srcPath}`)
  const cont = src.fields.find(
    (f: any) => f.depth === 2 && f.p0 === 10 && f.p1 === p1 && f.dataStart <= rec.lenOffset && f.dataEnd >= rec.dataEnd
  )
  if (!cont) throw new Error(`container section ${p1} not found`)
  const start = cont.lenOffset - 1
  const tag = src.payload[start]
  const expectTag = p1 === 2 ? 0x12 : 0x22
  if (tag !== expectTag) throw new Error(`container tag 0x${tag.toString(16)} != 0x${expectTag.toString(16)}`)
  return src.payload.slice(start, cont.dataEnd)
}
const implWire = containerWire(4, IMPL_ID)
const defWire = containerWire(2, DEF_ID)
console.log(`def ${DEF_ID} / impl ${IMPL_ID}: impl container ${implWire.length} B; def container ${defWire.length} B`)

/** 目标文件中最后一个 p1 分组容器（d2）的 dataEnd。 */
function lastGroupEnd(payload: Uint8Array, p1: number): number {
  const fs: any[] = []
  parseMessage(payload, 0, payload.length, 0, 0, 0, 0, 0, 0, 0, fs)
  const cs = fs.filter((f: any) => f.depth === 2 && f.p0 === 10 && f.p1 === p1)
  if (!cs.length) throw new Error(`no p1=${p1} containers`)
  return Math.max(...cs.map((c: any) => c.dataEnd))
}

// 1) impl 容器插到 impl 组尾部
let payload = dst.payload
let at = lastGroupEnd(payload, 4)
payload = splice(payload, at, implWire)
// 2) def 容器插到 def 组尾部（重新解析取偏移）
at = lastGroupEnd(payload, 2)
payload = splice(payload, at, defWire)

// 3) field10 长度 varint 更新（位置在原文件固定：lenOffset）
const f10 = dst.fields.find((f: any) => f.depth === 1 && f.field === 10)
if (!f10) throw new Error('root field10 not found')
const oldLen = f10.dataEnd - f10.dataStart
const newLen = oldLen + implWire.length + defWire.length
const newVar = encodeVarint(newLen)
payload = new Uint8Array([
  ...payload.subarray(0, f10.lenOffset),
  ...newVar,
  ...payload.subarray(f10.lenOffset + f10.lenSize)
])

// 4) 文件头长度更新（u32@0 = payload+20, u32@16 = payload len）
const dstBytes = readFileSync(dstPath)
const header = Buffer.from(dstBytes.subarray(0, 20))
const total = payload.length
header.writeUInt32BE(total + 20, 0)
header.writeUInt32BE(total, 16)
writeFileSync(outPath, new Uint8Array([...header, ...payload, ...dstBytes.subarray(dstBytes.length - 4)]))
console.log(`merged written: ${outPath} (${total + 24} bytes; payload ${total})`)
