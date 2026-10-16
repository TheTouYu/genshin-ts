// 深挖验证：szd 图元 entry 的 image_settings（assetRef/颜色）与 scene.json 对拍
// wire 事实：505{501=21,502=38} = image_settings；503→31{2=assetRef,4=packedColor}
import { readFileSync } from 'node:fs'
import { parseGiaRootFields } from '../../../src/image-editor/gia/image_mode.js'
import { ProtoReader, findVarint } from '../../../src/image-editor/gia/wire.js'

const EXP = '/home/h/.local/share/anime-game-launcher/prefix/drive_c/users/h/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export'
const name = 'szd'
const b = new Uint8Array(readFileSync(`${EXP}/${name}.scene.gia`))
const scene = JSON.parse(readFileSync(`./art/${name}.scene.json`, 'utf8'))
const { rootFields } = parseGiaRootFields(b)
const REF = { ellipse: 100002, rectangle: 100001, triangle: 100003, four_point_star: 100004, five_point_star: 100005, ring: 100006 }
const ordered = [...scene.elements].reverse()

let pass = 0, fail = 0
const entries = rootFields.filter(x => x.tag === 2 && x.wire === 2)
console.log(`素材 ${name}：${entries.length} 个 field2 条目（GIA 序 = reverse 编辑序）`)
entries.forEach((e, i) => {
  const f = new ProtoReader(e.data).parseFields()
  const inner = new ProtoReader(f.find(x => x.tag === 19 && x.wire === 2).data).parseFields()
  const content = new ProtoReader(inner.find(x => x.tag === 1 && x.wire === 2).data).parseFields()
  let assetRef = 0, packedColor = 0
  for (const fld of content) {
    if (fld.tag !== 505 || fld.wire !== 2) continue
    const sub = new ProtoReader(fld.data).parseFields()
    if (findVarint(sub, 501) === 21 && findVarint(sub, 502) === 38) {
      const det = sub.find(s => s.tag === 503 && s.wire === 2)
      if (det) {
        const d = new ProtoReader(det.data).parseFields()
        const is = d.find(s => s.tag === 31 && s.wire === 2)
        if (is) {
          const s2 = new ProtoReader(is.data).parseFields()
          assetRef = findVarint(s2, 2) ?? 0
          const c = s2.find(s => s.tag === 4 && s.wire === 0)
          if (c) packedColor = c.value >>> 0
        }
      }
    }
  }
  const def = ordered[i]
  const expectRef = REF[def.type] ?? -1
  const ok = assetRef === expectRef
  ok ? pass++ : fail++
  const a = (packedColor >>> 24) & 0xff, r = (packedColor >>> 16) & 0xff, g = (packedColor >>> 8) & 0xff, bl = packedColor & 0xff
  console.log(`  [${i}] guid=${findVarint(content, 501)} assetRef=${assetRef} (期望${expectRef}) color=#${a.toString(16).padStart(2, '0')}${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${bl.toString(16).padStart(2, '0')} type=${def.type} → ${ok ? 'PASS' : 'FAIL'}`)
})
console.log(fail === 0 ? `✅ assetRef ${pass}/${entries.length} 全对` : `❌ ${fail} 不符`)
process.exit(fail === 0 ? 0 : 1)
