// hmlt-qixia 阶段0交付：从最新模拟器存档导出 GIA 到真机导入目录
// 通路=controller.exportData（与模拟器 web 顶栏导出按钮同一函数，D271 实证真机认识）
// 正确目录=BeyondLocal/Beyond_Local_Export/（直接在 BeyondLocal 下，不在 UID 子目录——D271 破案）
import { writeFileSync, copyFileSync } from 'node:fs'
import { createStudio } from '/home/h/miliastra-beyond-simulator/studio/index.js'

const SAVE = '/home/h/genshin-ts/workspace/hmlt-qixia/hmlt-qixia.save.json'
const EXP = '/home/h/.local/share/anime-game-launcher/prefix/drive_c/users/h/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export'
const PKG = '/home/h/genshin-ts/workspace/hmlt-qixia/device-package'

const studio = createStudio()
studio.importData('json', Buffer.from(JSON.stringify(JSON.parse(
  (await import('node:fs')).readFileSync(SAVE, 'utf8')))).toString('base64'), 'hmlt-qixia.save.json')

const names = { 'gia-combined': 'hmlt-qixia-整合包.gia', 'scripts-gia': 'hmlt-qixia-脚本.gia' }
for (const format of Object.keys(names)) {
  const r = studio.exportData(format)
  const files = r.files || [r]
  for (const f of files) {
    const buf = Buffer.from(f.data, 'base64')
    writeFileSync(`${EXP}/${names[format]}`, buf)
    writeFileSync(`${PKG}/${names[format]}`, buf)
    console.log(`${names[format]} ${buf.length}B | warnings: ${(f.warnings || []).join(' / ') || 'none'}`)
  }
}
copyFileSync(SAVE, `${PKG}/hmlt-qixia.save.json`)
console.log('save copied; done')
