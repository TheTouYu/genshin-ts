// 正规通道：controller.exportData（与模拟器 web 顶栏导出按钮同一函数）
import { writeFileSync } from 'node:fs'
import { createStudio } from '/home/h/miliastra-beyond-simulator/studio/index.js'
const studio = createStudio()
studio.importData('json', Buffer.from(JSON.stringify(JSON.parse(
  (await import('node:fs')).readFileSync('workspace/input-probe/input-probe.save.json', 'utf8')))).toString('base64'), 'input-probe.save.json')
const EXP = '/home/h/.local/share/anime-game-launcher/prefix/drive_c/users/h/AppData/LocalLow/miHoYo/原神/BeyondLocal/110170759/Beyond_Local_Export'
for (const format of ['gia-combined', 'scripts-gia']) {
  const r = studio.exportData(format)
  const files = r.files || [r]
  for (const f of files) {
    const name = format === 'gia-combined' ? 'probe-combined.gia' : 'probe-scripts.gia'
    writeFileSync(`${EXP}/${name}`, Buffer.from(f.data, 'base64'))
    console.log(`wrote ${name} ${Buffer.from(f.data, 'base64').length}B | warnings: ${(f.warnings||[]).length}`)
  }
}
