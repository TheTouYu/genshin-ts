// 素材 GIA 结构验证（wire 层对象级断言）：
// ① 信封：0326@offset10-11 / contentLen@offset16 / 尾 0679
// ② 主资源：field19(ui.content) 内 503 varint children 数 = scene 图元数
// ③ root field2 依赖条目 class=15 数 = 图元数
// ④ 组名：ui.content 内 f505{f502=15} name = 文件名
import { readFileSync, readdirSync } from 'node:fs'
import { parseGiaRootFields, parsePrimaryResource } from '../../../src/image-editor/gia/image_mode.js'
import { ProtoReader, parseResourceEntry } from '../../../src/image-editor/gia/wire.js'

const EXP = '/home/h/.local/share/anime-game-launcher/prefix/drive_c/users/h/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export'
const files = readdirSync(EXP).filter(f => f.endsWith('.scene.gia')).sort()

let fail = 0
console.log(`素材 GIA 验证：${files.length} 个文件\n素材              | 信封 | children | class15 | scene | 组名 | 判定`)
console.log('-----------------|------|----------|---------|-------|------|-----')
for (const f of files) {
  const name = f.replace('.scene.gia', '')
  const bytes = new Uint8Array(readFileSync(`${EXP}/${f}`))
  let ok = true, msg = []
  let childCount = 0, resCount = 0, groupName = ''
  try {
    const { header, contentLen, tail, rootFields } = parseGiaRootFields(bytes)
    const tag = (header[10] << 8) | header[11]
    if (tag !== 0x0326) { ok = false; msg.push('HEAD_TAG!=0326') }
    if (contentLen !== bytes.length - 24) { ok = false; msg.push('contentLen 不匹配') }
    const tailTag = (tail[2] << 8) | tail[3]
    if (tailTag !== 0x0679) { ok = false; msg.push('TAIL!=0679') }
    // 主资源 f19 ui.content → 503 children + 组名
    const pr = rootFields.find(x => x.tag === 1 && x.wire === 2)
    const prf = parsePrimaryResource(pr.data)
    const f19 = prf.find(x => x.tag === 19 && x.wire === 2)
    if (!f19) { ok = false; msg.push('无 f19 ui.content') } else {
      // f19 → 内层 f1 才是 ui.content 本体（children 503 varint 与组名 505 都在这层）
      const inner = new ProtoReader(f19.data).parseFields().find(x => x.tag === 1 && x.wire === 2)
      const ui = new ProtoReader(inner.data).parseFields()
      childCount = ui.filter(x => x.tag === 503 && x.wire === 0).length
      for (const fld of ui) {
        if (fld.tag === 505 && fld.wire === 2) {
          const sub = new ProtoReader(fld.data).parseFields()
          const v = sub.find(s => s.tag === 502 && s.wire === 0)
          const n = sub.find(s => s.tag === 12 && s.wire === 2)
          if (v && v.value === 15 && n) groupName = Buffer.from(n.data).toString('utf8').replace(/[^\x20-\x7e]/g, '')
        }
      }
    }
    for (const x of rootFields) {
      if (x.wire !== 2) continue
      try { if (parseResourceEntry(x.data).class === 15) resCount++ } catch {}
    }
  } catch (e) { ok = false; msg.push('解析失败:' + e.message) }
  const scene = JSON.parse(readFileSync(`./art/${name}.scene.json`, 'utf8'))
  const expect = scene.elements.length
  if (childCount !== expect) { ok = false; msg.push(`children=${childCount}≠${expect}`) }
  if (resCount !== expect) { ok = false; msg.push(`class15=${resCount}≠${expect}`) }
  if (!groupName.includes(name)) { ok = false; msg.push(`组名'${groupName}'不含${name}`) }
  if (!ok) fail++
  console.log(`${name.padEnd(17)}| ${ok ? ' ✓ ' : ' ✗ '} | ${String(childCount).padStart(5)}    | ${String(resCount).padStart(5)}   | ${String(expect).padStart(4)} | ${groupName.slice(0, 6).padEnd(6)}| ${ok ? 'PASS' : msg.join(';')}`)
}
console.log(`\n${fail === 0 ? '✅ 全部通过' : `❌ ${fail} 个失败`}`)
process.exit(fail === 0 ? 0 : 1)
