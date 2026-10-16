// 用模拟器 exportScriptGia 生成 10-14 同款脚本 GIA（对照基准）
import { writeFileSync } from 'node:fs'
import { createStudio } from '/home/h/miliastra-beyond-simulator/studio/index.js'
const studio = createStudio()
const { buffer } = studio.exportData('script-gia', {
  scripts: [{ guid: 1073742400, path: 'probe-check/main.lua', source: 'print("PROBE-CHECK")' }]
})
const out = '/home/h/.local/share/anime-game-launcher/prefix/drive_c/users/h/AppData/LocalLow/miHoYo/原神/BeyondLocal/110170759/Beyond_Local_Export/probe-check.gia'
writeFileSync(out, buffer)
console.log('wrote', out, buffer.length, 'bytes')
