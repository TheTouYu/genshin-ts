// 对一批 engineId 提取 OfficialPrefab 尺寸浮点（f2 树内全部 0.3..30 浮点，取最大几个）
import { readdirSync, readFileSync } from 'node:fs'
import { parseWireMessage } from '../../src/cli/static_assembly/wire.js'

const ids = process.argv.slice(2).map(Number)
const dir = '/home/h/.ys/BeyondAssets/BeyondAssistEditor/Resource/Json/Beyond/Official/OfficialPrefab'
const want = new Set(ids)
const found = new Map()
for (const f of readdirSync(dir)) {
  try {
    const top = parseWireMessage(Buffer.from(readFileSync(`${dir}/${f}`).map((b) => b ^ 0xe5)))
    const f1 = top.find((x) => x.number === 1 && x.wire === 0)
    if (!f1 || !want.has(Number(f1.value))) continue
    const raw = Buffer.from(top.find((x) => x.number === 2)?.value ?? new Uint8Array())
    const floats: number[] = []
    for (let i = 0; i + 4 <= raw.length; i++) {
      const v = raw.readFloatLE(i)
      if (Number.isFinite(v) && v >= 0.3 && v <= 30 && Math.abs(v * 4 - Math.round(v * 4)) < 1e-4) floats.push(v)
    }
    const uniq = [...new Set(floats.map((x) => Math.round(x * 10) / 10))].sort((a, b) => b - a)
    found.set(Number(f1.value), uniq.slice(0, 6))
    if (found.size === want.size) break
  } catch { /* skip */ }
}
for (const id of ids) console.log(id, '→', found.get(id)?.join(' ') ?? '(未找到)')
