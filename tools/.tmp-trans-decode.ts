import { readFileSync } from 'node:fs'
const payload = readFileSync(process.argv[2]).subarray(20, -4)
function parse(b: Uint8Array, start: number, end: number, out: any[]): void {
  let i = start
  while (i < end) {
    let t = 0n, s = 0n
    for (;;) { const x = b[i++]; t |= BigInt(x & 0x7f) << s; if (!(x & 0x80)) break; s += 7n }
    const fn = Number(t >> 3n), wt = Number(t & 7n)
    if (wt === 0) { let v = 0n, s2 = 0n; for (;;) { const x = b[i++]; v |= BigInt(x & 0x7f) << s2; if (!(x & 0x80)) break; s2 += 7n } out.push({ fn, wt, val: v }) }
    else if (wt === 5) { out.push({ fn, wt, f32: b.subarray(i, i + 4) }); i += 4 }
    else if (wt === 1) { i += 8; out.push({ fn, wt }) }
    else if (wt === 2) { let l = 0n, s3 = 0n; for (;;) { const x = b[i++]; l |= BigInt(x & 0x7f) << s3; if (!(x & 0x80)) break; s3 += 7n } out.push({ fn, wt, data: b.subarray(i, i + Number(l)) }); i += Number(l) }
    else throw new Error(`wt${wt} at ${i} fn${fn}`)
  }
}
const top: any[] = []
parse(payload, 0, payload.length, top)
const r9 = top.find((f: any) => f.fn === 9)
const bytes = payload.subarray(r9.dataStart, r9.dataEnd)
console.error(`r9 ${bytes.length}B`)
const fields: any[] = []
parse(bytes, 0, bytes.length, fields)
const decVec = (fs: any[]): Record<string, number> => { const o: Record<string, number> = {}; for (const f of fs) { if (f.wt === 5) o[`f${f.fn}`] = Buffer.from(f.f32).readFloatLE(0); else if (f.wt === 0) o[`f${f.fn}`] = Number(f.val) } return o }
function decRT(data: Uint8Array): any {
  const fs: any[] = []; parse(data, 0, data.length, fs)
  const o: any = {}
  const names: Record<number, string> = { 501: 'scale', 502: 'anchorMin', 503: 'anchorMax', 504: 'offset', 505: 'size', 506: 'pivot', 508: 'rot' }
  for (const f of fs) if (f.wt === 2) { const sub: any[] = []; parse(f.data!, 0, f.data!.length, sub); o[names[f.fn] || `f${f.fn}`] = decVec(sub) }
  return o
}
for (let i = 0; i < fields.length; i++) {
  const f = fields[i]
  if (f.fn === 501 && f.wt === 0 && f.val >= 1073741869n && f.val <= 1073741879n) {
    console.log(`\n=== ${f.val} ===`)
    for (let j = i; j < Math.min(i + 40, fields.length); j++) {
      const g = fields[j]
      if (g.wt !== 2 || g.fn !== 505) continue
      const df: any[] = []; parse(g.data!, 0, g.data!.length, df)
      // name
      const nm = df.find((x: any) => x.fn === 12)
      if (nm) { const wf: any[] = []; parse(nm.data!, 0, nm.data!.length, wf); const sv = wf.find((x: any) => x.fn === 501); if (sv) console.log(`  name: "${Buffer.from(sv.data!).toString('utf8')}"`) }
      const tr = df.find((x: any) => x.fn === 13)
      if (tr) {
        const pf: any[] = []; parse(tr.data!, 0, tr.data!.length, pf)
        for (const p of pf) if (p.fn === 501 && p.wt === 2) {
          const pl: any[] = []; parse(p.data!, 0, p.data!.length, pl)
          const pt = pl.find((x: any) => x.fn === 501 && x.wt === 0)
          const rt = pl.find((x: any) => x.fn === 502 && x.wt === 2)
          if (rt && pt) console.log(`  ${['KEYBOARD', 'TOUCH', 'CONSOLE', 'MOBILE'][pt.val] || pt.val}: ${JSON.stringify(decRT(rt.data!))}`)
        }
      }
    }
  }
}
