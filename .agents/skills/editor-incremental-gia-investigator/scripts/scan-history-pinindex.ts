// 历史差分复用：pinIndex 扫描资产（2026-08-08 case6/case7 提炼，此前在 /tmp 重复 4+ 次）
// 用法：
//   npx tsx scan-history-pinindex.ts <gil>                        # 全部 def pinIndex + 全局缺失
//   npx tsx scan-history-pinindex.ts --timeline <exp-root> <defIdx>  # 指定 def 按 v 时间线演变
//   npx tsx scan-history-pinindex.ts --history <exp-root> <n,...>  # 指定号在所有快照的出现史
// 背景：规则冲突时用历史快照（experiments/*/raw/*.gil）验证"某号是否曾分配/何时删除"，
//       判定墓碑（NEVER SEEN ≠ 未分配，可能是被整体删除 def 的号）与分配器演变。
import { readGilPayloadFields } from '../../../../src/cli/gil_extract_utils.js'
import { parseMessage, readVarint } from '../../../../src/injector/binary.js'
import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'

const [mode, arg2, arg3] = process.argv.slice(2)

function walk(buf: Uint8Array): [number, number, Uint8Array][] {
  const out: [number, number, Uint8Array][] = []
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
    } else if (wire === 1) { out.push([field, 1, buf.subarray(i, i + 8)]); i += 8 }
    else if (wire === 5) { out.push([field, 5, buf.subarray(i, i + 4)]); i += 4 }
    else break
  }
  return out
}

// 各 def 的 pinIndex 列表（def 名 + 100/101/102/103 参数流的 field8）
function scanDefs(gil: string): { name: string; pis: number[] }[] {
  const { payload, fields } = readGilPayloadFields(gil)
  const root10 = fields.find((f) => f.depth === 1 && f.field === 10)
  if (!root10) throw new Error(`root 10 not found in ${gil}`)
  const children: any[] = []
  parseMessage(payload, root10.dataStart, root10.dataEnd, 1, 10, 0, 0, 0, 0, 0, children)
  const f2 = children.filter((f) => f.depth === 2 && f.field === 2)
  return f2.map((item) => {
    const o = walk(payload.subarray(item.dataStart, item.dataEnd))
    if (o.length !== 1 || o[0][0] !== 1) return { name: '?', pis: [] }
    const inner = o[0][2]
    const name = walk(inner).find(([f]) => f === 200)
    const pis: number[] = []
    for (const [f, , v] of walk(inner)) {
      if (f === 100 || f === 101 || f === 102 || f === 103) {
        for (const [ff, fw, fv] of walk(v)) {
          if (ff === 8 && fw === 0) pis.push(Number(fv[0]))
        }
      }
    }
    return { name: name ? Buffer.from(name[2]).toString('utf8') : '?', pis }
  })
}

function listSnapshots(root: string): string[] {
  return execSync(`ls ${root}/experiments/*/raw/*.gil`).toString().trim().split('\n').filter(Boolean)
}
// 按 v 编号排序（取文件名中最大 vN；同 v 保留一个）
function vnum(f: string): number {
  const m = f.match(/v(\d+)-v(\d+)/)
  const single = f.match(/-v(\d+)\//)
  return m ? Number(m[2]) : single ? Number(single[1]) : 0
}

if (!mode || (mode !== '--timeline' && mode !== '--history' && !existsSync(mode))) {
  console.error('usage: scan-history-pinindex.ts <gil> | --timeline <exp-root> <defIdx> | --history <exp-root> <n,...>')
  process.exit(1)
}

if (mode === '--timeline') {
  const defIdx = Number(arg3 ?? 58)
  const seen = new Set<number>()
  for (const gil of listSnapshots(arg2).sort((a, b) => vnum(a) - vnum(b))) {
    const vn = vnum(gil)
    if (seen.has(vn)) continue
    seen.add(vn)
    let defs: { name: string; pis: number[] }[]
    try { defs = scanDefs(gil) } catch { continue }
    const d = defs[defIdx]
    if (!d) continue
    console.log(`v${String(vn).padStart(3)} [${defIdx}] ${d.name}: ${d.pis.join(',')}`)
  }
} else if (mode === '--history') {
  const watch = new Set((arg3 ?? '').split(',').map((s) => s.trim()).filter(Boolean))
  const history = new Map<string, string[]>()
  for (const gil of listSnapshots(arg2)) {
    let defs: { name: string; pis: number[] }[]
    try { defs = scanDefs(gil) } catch { continue }
    const short = gil.split('/experiments/')[1].replace('/raw/', '@')
    defs.forEach((d, idx) => {
      const hits = new Set(d.pis.filter((p) => watch.has(String(p))).map(String))
      for (const h of hits) history.set(h, [...(history.get(h) ?? []), `${short}[${idx}]`])
    })
  }
  for (const n of [...watch].sort((a, b) => Number(a) - Number(b))) {
    const hits = history.get(n) ?? []
    console.log(
      `pinIndex ${n}: ${hits.length ? hits.length + ' hits: ' + hits.slice(0, 6).join(' ') + (hits.length > 6 ? ' ...' : '') : 'NEVER SEEN'}`
    )
  }
} else {
  const defs = scanDefs(mode)
  const all: number[] = []
  defs.forEach((d, idx) => {
    if (d.pis.length) console.log(`[${idx}] ${d.name}: ${d.pis.join(',')}`)
    all.push(...d.pis)
  })
  console.log('---')
  const set = new Set(all)
  const missing: number[] = []
  for (let i = 1; i <= Math.max(...all); i++) if (!set.has(i)) missing.push(i)
  console.log(`max: ${Math.max(...all)} count: ${all.length}`)
  console.log(`missing in 1..max: ${missing.join(',')}`)
}
