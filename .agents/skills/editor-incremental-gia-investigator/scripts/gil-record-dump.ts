// 记录级 dump（差分技能资产化 2026-10-13，源自 .scratch/football-v2/dump-record.ts）
// 用途：给定 GIL 与 root 字段号+记录 id，打印字段树（递归 3 层 + UTF-8 名字识别），可导出原始记录字节做逐字节比对。
// 记录级 dump：<gil> <root字段号> <记录id> [--hex] [--out <file>]
// 用法例：npx tsx dump-record.ts <map.gil> 4 1082130433
import { readFileSync, writeFileSync } from 'node:fs'
import { parseWireMessage } from '../../../../src/cli/static_assembly/wire.js'

const payloadOf = (p: string) => new Uint8Array(readFileSync(p).slice(20, -4))
function container(body: Uint8Array, fieldNo: number): Uint8Array | undefined {
  return parseWireMessage(body)?.find((f) => f.number === fieldNo && f.wire === 2)?.value as Uint8Array
}
function recs(body: Uint8Array) {
  const out: { id: number; rec: Uint8Array }[] = []
  for (const f of parseWireMessage(body) ?? []) {
    if (f.number !== 1 || f.wire !== 2) continue
    const rec = f.value as Uint8Array
    const first = parseWireMessage(rec)?.[0]
    out.push({ id: first && first.number === 1 && first.wire === 0 ? (first.value as number) : -1, rec })
  }
  return out
}
const utf8ish = (b: Uint8Array) => {
  try { const s = Buffer.from(b).toString('utf8'); return /^[\x20-\x7e\u4e00-\u9fff]+$/.test(s) ? ` "${s}"` : '' } catch { return '' }
}
function tree(fields: ReturnType<typeof parseWireMessage>, depth: number, maxDepth: number): void {
  for (const f of fields ?? []) {
    const v = f.value
    if (v instanceof Uint8Array) {
      const sub = parseWireMessage(v)
      console.log(`${'  '.repeat(depth)}f${f.number} w2 len=${v.length}${utf8ish(v)}${sub && sub.length && depth < maxDepth ? '' : ' [opaque]'}`)
      if (sub && sub.length && depth < maxDepth) tree(sub, depth + 1, maxDepth)
    } else console.log(`${'  '.repeat(depth)}f${f.number} w${f.wire} = ${String(v)}`)
  }
}
const [file, rootNo, idStr] = process.argv.slice(2)
const hex = process.argv.includes('--hex')
const outIdx = process.argv.indexOf('--out')
const payload = payloadOf(file)
const body = container(payload, Number(rootNo))
if (!body) { console.error(`root ${rootNo} 不存在`); process.exit(1) }
const all = recs(body)
const hit = all.find((r) => r.id === Number(idStr))
if (!hit) { console.error(`记录 ${idStr} 不存在（root${rootNo} 共 ${all.length} 条）`); process.exit(1) }
console.log(`== ${file} root${rootNo} id=${hit.id} bytes=${hit.rec.length} ==`)
tree(parseWireMessage(hit.rec), 1, 3)
if (hex) console.log(Buffer.from(hit.rec).toString('hex').replace(/(.{64})/g, '$1\n'))
if (outIdx > 0) { writeFileSync(process.argv[outIdx + 1], hit.rec); console.log(`已导出 → ${process.argv[outIdx + 1]}`) }
