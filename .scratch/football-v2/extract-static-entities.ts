// 提取地图内全部静态资源实体（f2={f1:2000xxxx,f2:1} 官方直引形态）→ (entityId, name, engineId)
// 输出 JSON：examples/football/assets/static-resource-probe.json（映射资产第一版）
import { readFileSync, writeFileSync } from 'node:fs'
import { parseWireMessage } from '../../src/cli/static_assembly/wire.js'

const bytes = readFileSync(process.argv[2])
const top = parseWireMessage(bytes.slice(20, -4))
const out: { entityId: number; name: string; engineId: number }[] = []
for (const field of top) {
  if (field.number !== 5) continue
  for (const rec of parseWireMessage(field.value)) {
    const inner = parseWireMessage(rec.value)
    const f1 = inner.find((x) => x.number === 1)
    const rel = inner.find((x) => x.number === 2)
    if (!rel) continue
    const relInner = parseWireMessage(rel.value)
    const resId = relInner.find((x) => x.number === 1 && x.wire === 0)
    const marker = relInner.find((x) => x.number === 2 && x.wire === 0)
    if (!resId || Number(resId.value) < 20000000 || Number(resId.value) >= 20100000) continue
    if (!marker || Number(marker.value) !== 1) continue
    // 名字：f5 槽1(f1=1) 的 f11.f1
    let name = ''
    for (const slot of inner.filter((x) => x.number === 5)) {
      const s = parseWireMessage(slot.value)
      if (Number(s[0]?.number) === 1 && Number(s[0]?.value) === 1) {
        const f11 = s.find((x) => Number(x.number) === 11)
        if (f11) {
          const nameField = parseWireMessage(f11.value).find((y) => y.number === 1)
          if (nameField) name = Buffer.from(nameField.value).toString('utf8')
        }
      }
    }
    out.push({ entityId: Number(f1.value), name, engineId: Number(resId.value) })
  }
}
console.log(`静态资源实体 ${out.length} 个`)
const seen = new Map<string, { engineId: number; count: number }>()
for (const r of out) {
  const k = `${r.name}#${r.engineId}`
  seen.set(k, { engineId: r.engineId, count: (seen.get(k)?.count ?? 0) + 1 })
}
for (const [k, v] of [...seen.entries()].sort((a, b) => b[1].count - a[1].count))
  console.log(`  ${k.split('#')[0].padEnd(12)} engineId=${v.engineId} ×${v.count}`)
writeFileSync(new URL('../../examples/football/assets/static-resource-probe.json', import.meta.url),
  JSON.stringify({ schemaVersion: 1, source: 'user editor placements 2026-10-12 18:47, map 1073741827', entities: out }, null, 1))
