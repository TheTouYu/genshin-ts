// v3 三层组件槽签名对照（票 25-B 球资产落盘核验）：
// donor 3231 vs v3 1073741827 —— def 6138(root4 f8) / 实例 6138(root8 f7) / 实体 6135(root5 f7)
// 输出形态：`<类型码>:<槽字节数>`（预期 basicMotion=4 / hitDetection=12 / tabBar=17）
import { readFileSync } from 'node:fs'
import { readVarint } from '../../src/injector/binary.js'

type Span = { number: number; wire: number; start: number; end: number }
function spans(buf: Uint8Array): Span[] {
  const out: Span[] = []
  let off = 0
  while (off < buf.length) {
    const key = readVarint(buf, off)!
    if (key.value >> 3 === 0) throw new Error(`malformed at ${off}`)
    const number = key.value >> 3, wire = key.value & 7
    let end = key.next
    if (wire === 0) end = readVarint(buf, end)!.next
    else if (wire === 1) end += 8
    else if (wire === 5) end += 4
    else if (wire === 2) { const l = readVarint(buf, end)!; end = l.next + l.value }
    else throw new Error(`wire ${wire}`)
    out.push({ number, wire, start: off, end })
    off = end
  }
  return out
}
function recordId(rec: Uint8Array): number | undefined {
  const f = spans(rec)[0]
  if (!f || f.number !== 1 || f.wire !== 0) return undefined
  return readVarint(rec, readVarint(rec, f.start).next)?.value
}
function slotsOf(rec: Uint8Array, fieldNo: number): string {
  return spans(rec).filter(s => s.number === fieldNo && s.wire === 2).map(s => {
    const key = readVarint(rec, s.start)!
    const slot = rec.slice(readVarint(rec, key.next)!.next, s.end)
    const t = spans(slot).find(x => x.number === 1 && x.wire === 0)
    const en = spans(slot).find(x => x.number === 2 && x.wire === 0)
    const code = t ? readVarint(slot, readVarint(slot, t.start)!.next)!.value : '?'
    const on = en ? readVarint(slot, readVarint(slot, en.start)!.next)!.value : 0
    return `${code}/${on}:${slot.length}B`
  }).join(' ')
}
function containerRecords(payload: Uint8Array, fieldNo: number): Uint8Array[] {
  const c = spans(payload).find(s => s.number === fieldNo && s.wire === 2)
  if (!c) return []
  const key = readVarint(payload, c.start)!
  const body = payload.slice(readVarint(payload, key.next)!.next, c.end)
  return spans(body).filter(s => s.number === 1 && s.wire === 2).map(s => {
    const k = readVarint(body, s.start)!
    return body.slice(readVarint(body, k.next)!.next, s.end)
  })
}
const D = '.scratch/_archive/football-v2/evidence/ab-22/map-2026-09-07_14-37-43_3231_110170759.gil'
const V3 = '/home/h/.local/share/anime-game-launcher/prefix/drive_c/users/h/AppData/LocalLow/miHoYo/原神/BeyondLocal/110170759/Beyond_Local_Save_Level/1073741827/1073741827.gil'
for (const [label, path] of [['donor3231', D], ['v3      ', V3]] as const) {
  const payload = readFileSync(path).slice(20, -4)
  const defs = containerRecords(payload, 4).filter(r => recordId(r) === 1077936138)
  const insts = containerRecords(payload, 8).filter(r => recordId(r) === 1077936138)
  const ents = containerRecords(payload, 5).filter(r => recordId(r) === 1077936135)
  console.log(`${label} | def6138 f8=[${defs[0] ? slotsOf(defs[0], 8) : '无'}]`)
  console.log(`${label} | 实例6138 f7=[${insts[0] ? slotsOf(insts[0], 7) : '无'}]`)
  console.log(`${label} | 实体6135 f7=[${ents[0] ? slotsOf(ents[0], 7) : '无'}]`)
}
