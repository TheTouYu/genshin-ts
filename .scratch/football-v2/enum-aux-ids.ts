// 只读：枚举地图 top4.f1/top8.f1/top27.f1/f2 记录 ID（assertIdsFree 同口径），找空闲段
import { readFileSync } from 'node:fs'
import { parseWireMessage } from '../../src/cli/static_assembly/wire.js'

const bytes = readFileSync(process.argv[2])
const payload = bytes.slice(20, -4)
const top = parseWireMessage(payload)
const byRoot = { 4: [], 8: [], 27: [] }
for (const field of top) {
  if (field.number !== 4 && field.number !== 8 && field.number !== 27) continue
  const inner = parseWireMessage(field.value)
  for (const rec of inner) {
    if (rec.number === 1 || rec.number === 2) {
      const idRec = parseWireMessage(rec.value).find((f) => f.number === 1)
      if (idRec && idRec.wire === 0) byRoot[field.number].push(Number(rec.number * 1e6 + idRec.value))
      // 直接存 (root, subfield, id)
      byRoot[field.number].pop()
      byRoot[field.number].push([rec.number, Number(idRec.value)])
    }
  }
}
for (const root of [4, 8, 27]) {
  const ids = byRoot[root].map(([, id]) => id).sort((a, b) => a - b)
  const rel = ids.map((i) => i - 1073741824)
  console.log(`root${root}: ${ids.length} ids, 相对段 ${Math.min(...rel)}..${Math.max(...rel)}`)
  console.log(' ', [...new Set(rel.filter((r) => r > 1800).map((r) => Math.floor(r / 100)))].sort((a, b) => a - b).map((b) => `${b}xx`).join(' '))
}
// 空闲段扫描 2550-4200（相对 1824）
const occupied = new Set([...byRoot[4], ...byRoot[8], ...byRoot[27]].map(([, id]) => id))
const runs = []
for (let i = 1073742542; i <= 1073744200; i++) {
  if (!occupied.has(i)) {
    if (runs.length && i === runs[runs.length - 1][1] + 1) runs[runs.length - 1][1] = i
    else runs.push([i, i])
  }
}
console.log('空闲段:', runs.map(([a, b]) => `${a - 1073741824}..${b - 1073741824}(${b - a + 1})`).slice(0, 10).join(' '))
