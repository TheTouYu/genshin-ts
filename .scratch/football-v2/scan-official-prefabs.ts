// 只读扫描：OfficialPrefab .mihoyobin（XOR 0xE5 → protobuf 泛型解析）
// 锚点：木质花圃 引擎ID=20001159（docs 实证）；默认装饰物 20001001
import { readdirSync, readFileSync } from 'node:fs'
import { parseWireMessage } from '../../src/cli/static_assembly/wire.js'

const dir = '/home/h/.ys/BeyondAssets/BeyondAssistEditor/Resource/Json/Beyond/Official/OfficialPrefab'
const files = readdirSync(dir).filter((f) => f.endsWith('.mihoyobin'))
console.log('files:', files.length)

const deepValues = (fields, depth = 0) => {
  const out = []
  for (const f of fields) {
    out.push({ n: f.number, w: f.wire, v: f.wire === 2 ? null : Number(f.value) })
    if (f.wire === 2 && depth < 3) {
      try {
        const nested = parseWireMessage(f.value)
        if (nested.length) out.push(...deepValues(nested, depth + 1).map((x) => ({ ...x, p: f.number })))
      } catch { /* 非 message 字节 */ }
    }
  }
  return out
}

const anchors = new Set([20001159, 20001001, 20001008])
let hits = 0
for (const file of files) {
  const raw = readFileSync(`${dir}/${file}`)
  const dec = Buffer.from(raw.map((b) => b ^ 0xe5))
  let top
  try { top = parseWireMessage(dec) } catch { continue }
  const vals = deepValues(top)
  const found = vals.filter((x) => x.w === 0 && anchors.has(x.v))
  if (found.length) {
    hits++
    console.log(`\n=== ${file} anchor=${found.map((f) => f.v).join(',')}`)
    const strs = vals.filter((x) => x.w === 2 || (x.w === 0 && x.v > 1000000)).slice(0, 20)
    for (const s of strs) console.log(' ', JSON.stringify(s).slice(0, 140))
    if (hits >= 3) break
  }
}
if (!hits) console.log('锚点 0 命中')
