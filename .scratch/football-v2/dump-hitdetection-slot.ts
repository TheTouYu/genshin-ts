// donor vs v3 命中检测(type12)槽内容对比（票 25-B）
import { readFileSync } from 'node:fs'
import { readVarint } from '../../src/injector/binary.js'
import { parseWireMessage } from '../../src/cli/static_assembly/wire.js'

type Span = { number: number; wire: number; start: number; end: number }
function spans(buf: Uint8Array): Span[] {
  const out: Span[] = []; let off = 0
  while (off < buf.length) {
    const key = readVarint(buf, off)!
    const number = key.value >> 3, wire = key.value & 7
    let end = key.next
    if (wire === 0) end = readVarint(buf, end)!.next
    else if (wire === 1) end += 8
    else if (wire === 5) end += 4
    else if (wire === 2) { const l = readVarint(buf, end)!; end = l.next + l.value }
    else throw new Error(`wire ${wire}`)
    out.push({ number, wire, start: off, end }); off = end
  }
  return out
}
function recordId(rec: Uint8Array): number | undefined {
  const f = spans(rec)[0]; if (!f || f.number !== 1 || f.wire !== 0) return undefined
  return readVarint(rec, readVarint(rec, f.start).next)?.value
}
function containerRecords(payload: Uint8Array, fieldNo: number): Uint8Array[] {
  const c = spans(payload).find(s => s.number === fieldNo && s.wire === 2); if (!c) return []
  const key = readVarint(payload, c.start)!
  const body = payload.slice(readVarint(payload, key.next)!.next, c.end)
  return spans(body).filter(s => s.number === 1 && s.wire === 2).map(s => {
    const k = readVarint(body, s.start)!; return body.slice(readVarint(body, k.next)!.next, s.end)
  })
}
function type12Slot(rec: Uint8Array, fieldNo: number): Uint8Array | undefined {
  for (const s of spans(rec).filter(x => x.number === fieldNo && x.wire === 2)) {
    const key = readVarint(rec, s.start)!
    const slot = rec.slice(readVarint(rec, key.next)!.next, s.end)
    const t = spans(slot).find(x => x.number === 1 && x.wire === 0)
    if (t && readVarint(slot, readVarint(slot, t.start)!.next)!.value === 12) return slot
  }
  return undefined
}
function isText(b: Uint8Array): boolean {
  if (!b.length) return false
  try { const s = new TextDecoder('utf-8', { fatal: true }).decode(b)
    return !/[\u0000-\u0008\u000e-\u001f]/.test(s) } catch { return false }
}
function dump(bytes: Uint8Array, indent = '  ', depth = 0) {
  for (const f of parseWireMessage(bytes) ?? []) {
    const v = f.value as any
    if (f.wire === 2 && v instanceof Uint8Array) {
      if (isText(v)) console.log(`${indent}f${f.number}(w2)= "${new TextDecoder().decode(v)}"`)
      else { console.log(`${indent}f${f.number}(w2 msg ${v.length}B)`); if (depth < 4) dump(v, indent + '  ', depth + 1) }
    } else console.log(`${indent}f${f.number}(w${f.wire})= ${v}`)
  }
}
const D = '.scratch/_archive/football-v2/evidence/ab-22/map-2026-09-07_14-37-43_3231_110170759.gil'
const V3 = '/home/h/.local/share/anime-game-launcher/prefix/drive_c/users/h/AppData/LocalLow/miHoYo/原神/BeyondLocal/110170759/Beyond_Local_Save_Level/1073741827/1073741827.gil'
for (const [label, path] of [['donor3231', D], ['v3', V3]] as const) {
  const payload = readFileSync(path).slice(20, -4)
  const def = containerRecords(payload, 4).find(r => recordId(r) === 1077936138)!
  const inst = containerRecords(payload, 8).find(r => recordId(r) === 1077936138)
  const ent = containerRecords(payload, 5).find(r => recordId(r) === 1077936135)!
  for (const [layer, rec, fno] of [['def f8', def, 8], ['inst f7', inst, 7], ['entity f7', ent, 7]] as const) {
    if (!rec) { console.log(`${label} ${layer}: (无记录)`); continue }
    const slot = type12Slot(rec, fno)
    if (!slot) { console.log(`${label} ${layer}: 无 type12 槽`); continue }
    console.log(`\n=== ${label} ${layer} type12槽 ${slot.length}B ===`)
    dump(slot)
  }
}
