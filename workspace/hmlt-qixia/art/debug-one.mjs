// 真机 GIA 条目身份：field1 → {1:ident{2,3:kind,4:guid,5:class}, 3:name, 19:ui}
import { readFileSync } from 'node:fs'
import { parseGiaRootFields } from '../../../src/image-editor/gia/image_mode.js'
import { ProtoReader } from '../../../src/image-editor/gia/wire.js'

const EXP = '/home/h/.local/share/anime-game-launcher/prefix/drive_c/users/h/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export'
for (const f of ['input-probe · 整合包.gia', 'input-probe · 客户端控件模板.gia']) {
  const b = new Uint8Array(readFileSync(`${EXP}/${f}`))
  console.log(`\n=== ${f} (${b.length}B) ===`)
  const { rootFields } = parseGiaRootFields(b)
  for (const x of rootFields.filter(r => r.tag === 1 && r.wire === 2)) {
    const sub = new ProtoReader(x.data).parseFields()
    const ident = sub.find(s => s.tag === 1 && s.wire === 2)
    if (!ident) { console.log(`  (no ident, tags: ${sub.map(s => s.tag + ':w' + s.wire).join(' ')})`); continue }
    const idf = new ProtoReader(ident.data).parseFields()
    const kind = idf.find(s => s.tag === 3 && s.wire === 0)?.value
    const guid = idf.find(s => s.tag === 4 && s.wire === 0)?.value
    const cls = idf.find(s => s.tag === 5 && s.wire === 0)?.value
    const nm = sub.find(s => s.tag === 3 && s.wire === 2)
    const name = nm ? Buffer.from(nm.data).toString('utf8').replace(/\u0000/g, '') : ''
    const extra = sub.filter(s => s.tag === 19 && s.wire === 2).length ? ' +ui' : ''
    const mount = sub.find(s => s.tag === 2 && s.wire === 2)
    const mountInfo = mount ? ` ref(${mount.data.length}B)` : ''
    console.log(`  kind=${kind} class=${cls} guid=${guid} '${name.slice(0, 30)}'${extra}${mountInfo}`)
  }
}
