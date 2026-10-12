// 构建 OfficialPrefab 引擎ID → 中文名 映射（TextMap CHS 解码 + 文件名 hash 对照）
// 验证锚点：20001159 应=木质花圃；目标=场景批 14 种装饰件的 list_id→引擎ID 映射
import { readdirSync, readFileSync } from 'node:fs'
import { parseWireMessage } from '../../src/cli/static_assembly/wire.js'

const base = '/home/h/.ys/BeyondAssets/BeyondAssistEditor/Resource/Json'
const tmDir = `${base}/TextMap/CHS`
const pfDir = `${base}/Beyond/Official/OfficialPrefab`
const dec = (p: string) => parseWireMessage(Buffer.from(readFileSync(p).map((b) => b ^ 0xe5)))

// TextMap：泛型解析收集 varint(hash)→string
const textMap = new Map<string, string>()
{
  const files = readdirSync(tmDir).filter((f) => f.endsWith('.mihoyobin'))
  console.log('textmap files:', files.length)
  for (const f of files) {
    const walk = (fields: any[], out: any[]) => {
      for (const x of fields) {
        if (x.wire === 2) { try { const n = parseWireMessage(x.value); if (n.length) { out.push(x); walk(n, out) } } catch { out.push(x) } }
        else out.push(x)
      }
    }
    const flat: any[] = []
    walk(dec(`${tmDir}/${f}`), flat)
    // 相邻 (varint, bytes) 对即 (hash, text)
    for (let i = 0; i + 1 < flat.length; i++) {
      if (flat[i].wire === 0 && flat[i + 1].wire === 2) {
        const s = Buffer.from(flat[i + 1].value).toString('utf8')
        if (s && !s.includes('\u0000')) textMap.set(String(flat[i].value), s)
      }
    }
  }
  console.log('textmap entries:', textMap.size)
}

// OfficialPrefab：f1=引擎ID，文件名=hash → 名
const prefabs: { id: number; hash: string; name?: string }[] = []
for (const f of readdirSync(pfDir).filter((x) => x.endsWith('.mihoyobin'))) {
  const hash = f.replace('.mihoyobin', '')
  try {
    const top = dec(`${pfDir}/${f}`)
    const f1 = top.find((x) => x.number === 1 && x.wire === 0)
    if (f1) prefabs.push({ id: Number(f1.value), hash, name: textMap.get(hash) })
  } catch { /* skip */ }
}
console.log('prefabs with f1:', prefabs.length, 'named:', prefabs.filter((p) => p.name).length)
console.log('锚点 20001159 →', prefabs.find((p) => p.id === 20001159)?.name, '(期望=木质花圃)')

// 目标件名（品目 API 名）→ 候选引擎 ID
const targets = ['木质台阶', '矩形石质平台', '圆形石质平台', '木质长椅', '帐篷组件', '帐篷', '石质栅栏门',
  '旗帜', '树木枝杈', '灌木', '花丛', '草丛', '岩石平台', '石质路灯', '木质指示牌', '木质花圃']
for (const t of targets) {
  const hits = prefabs.filter((p) => p.name === t)
  console.log(`「${t}」: ${hits.length} 个 → ${hits.slice(0, 8).map((h) => h.id).join(', ')}${hits.length > 8 ? ' …' : ''}`)
}
