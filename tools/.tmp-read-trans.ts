// 复用 gil_ui.ts 的解析路径（setUiTransform 同款 wire 路径）读每条 r9 记录的平台 transform
import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
// gil_ui 未导出 parseMessageFields——从 dist import 编译产物（tsx 走 dist 单副本）
const { parseMessageFields } = await import('../src/injector/binary.js') as any
const bytes = new Uint8Array(readFileSync(process.argv[2]))
const top = parseMessageFields(bytes.slice(20, -4))
const TARGET = new Set([1869, 1870, 1874, 1876, 1877, 1878, 1879].map((x) => x + 1073741824 - 1824))
const f32 = (v: Uint8Array): number => { const b = Buffer.from(v); return b.readFloatLE(0) }
const vec2 = (data: Uint8Array): number[] => {
  const fs = parseMessageFields(data) ?? []
  const out: number[] = []
  for (const f of fs) if (f.wire === 5) out[f.number === 501 ? 0 : 1] = f32(f.value as Uint8Array)
  return out
}
// r9 主记录流（root9Records 逻辑内联：f9 wire2 的内容）
for (const root9 of top!.filter((f: any) => f.number === 9 && f.wire === 2)) {
  const stream = parseMessageFields(root9.value as Uint8Array) ?? []
  for (const field of stream) {
    if (field.wire !== 2) continue
    const rec = parseMessageFields(field.value as Uint8Array) ?? []
    const guid = rec.find((f: any) => f.number === 501 && f.wire === 0)?.value as number | undefined
    if (guid === undefined || guid < 1073741869 || guid > 1073741879) continue
    let name = '?'
    const plats: string[] = []
    for (const f505 of rec.filter((f: any) => f.number === 505 && f.wire === 2)) {
      const sub = parseMessageFields(f505.value as Uint8Array) ?? []
      const nf = sub.find((x: any) => x.number === 12 && x.wire === 2)
      if (nf) {
        const nm = parseMessageFields(nf.value as Uint8Array) ?? []
        const tf = nm.find((x: any) => x.number === 501 && x.wire === 2)
        if (tf) name = Buffer.from(tf.value as Uint8Array).toString('utf8')
      }
      const f503 = sub.find((x: any) => x.number === 503 && x.wire === 2)
      if (!f503) continue
      const det = parseMessageFields(f503.value as Uint8Array) ?? []
      const f13 = det.find((x: any) => x.number === 13 && x.wire === 2)
      if (!f13) continue
      const tr = parseMessageFields(f13.value as Uint8Array) ?? []
      const f12 = tr.find((x: any) => x.number === 12 && x.wire === 2)
      if (!f12) continue
      const mp = parseMessageFields(f12.value as Uint8Array) ?? []
      for (const pf of mp.filter((x: any) => x.number === 501 && x.wire === 2)) {
        const entry = parseMessageFields(pf.value as Uint8Array) ?? []
        const ptype = entry.find((x: any) => x.number === 501 && x.wire === 0)?.value as number
        const rt = entry.find((x: any) => x.number === 502 && x.wire === 2)
        if (rt === undefined) continue
        const rtf = parseMessageFields(rt.value as Uint8Array) ?? []
        const parts: string[] = []
        for (const rf of rtf) {
          if (rf.wire !== 2) continue
          const label = ({ 501: 'scale', 502: 'aMin', 503: 'aMax', 504: 'off', 505: 'size', 506: 'piv' } as any)[rf.number] ?? `f${rf.number}`
          parts.push(`${label}=${JSON.stringify(vec2(rf.value as Uint8Array))}`)
        }
        plats.push(`  ${['KB', 'TC', 'CS', 'MB'][ptype ?? -1] ?? ptype}: ${parts.join(' ')}`)
      }
    }
    console.log(`=== ${guid} "${name}"`)
    for (const p of plats) console.log(p)
  }
}
