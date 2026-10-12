// 全实体 f7 组件槽签名对比：当前 1825 vs donor 3231
import { readFileSync } from 'node:fs'
import { parseWireMessage as parse } from '../../src/cli/static_assembly/wire.js'

const G = '/home/h/.local/share/anime-game-launcher/prefix/drive_c/users/h/AppData/LocalLow/miHoYo/原神/BeyondLocal/110170759/Beyond_Local_Save_Level/1073741825/1073741825.gil'
const D = '.scratch/_archive/football-v2/evidence/ab-22/map-2026-09-07_14-37-43_3231_110170759.gil'

function recordId(record: Uint8Array): number | undefined {
  const fs = parse(record)!
  for (const f of fs) {
    if (f.number === 1 && f.wire === 0) return f.value as number
    if (f.number === 1 && f.wire === 2) {
      const sub = parse(f.value as Uint8Array)!
      for (const s of sub) if (s.number === 4 && s.wire === 0) return s.value as number
    }
  }
  return undefined
}
function entityRecords(path: string): [number, Uint8Array][] {
  const bytes = readFileSync(path)
  const top = parse(bytes.slice(20, -4))!
  const c5 = top.find(f => f.number === 5 && f.wire === 2)!
  return parse(c5.value as Uint8Array)!.filter(f => f.number === 1 && f.wire === 2)
    .map(f => f.value as Uint8Array)
    .map(r => [recordId(r)!, r] as [number, Uint8Array])
}
const sig = (r: Uint8Array) => {
  const fs = parse(r)!
  return fs.filter(f => f.number === 7 && f.wire === 2)
    .map(f => {
      const slot = f.value as Uint8Array
      const sfs = parse(slot)!
      const t = sfs.find(x => x.number === 1)
      return `${t && t.wire === 0 ? t.value : '?'}:${slot.length}`
    }).join(' ')
}
const cur = new Map(entityRecords(G)); const don = new Map(entityRecords(D))
for (const [id, d] of [...don].sort((a, b) => a[0] - b[0])) {
  const c = cur.get(id)
  if (!c) { console.log(`${id}: 当前不存在!`); continue }
  const sc = sig(c), sd = sig(d)
  if (sc !== sd) console.log(`${id}: \n  当前: ${sc}\n  donor: ${sd}`)
}
console.log('--- 对比完成 ---')
