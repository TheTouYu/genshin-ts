// 导出 input-probe 真机导入包：node export-gia.mjs
// 用法：node export-gia.mjs  （读 input-probe.save.json → device-package/*.gia + main.lua）
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createStudio } from '/home/h/miliastra-beyond-simulator/studio/index.js'

const ROOT = '/home/h/genshin-ts/workspace/input-probe'
const OUT = `${ROOT}/device-package`
const save = readFileSync(`${ROOT}/input-probe.save.json`, 'utf8')

const st = createStudio()
st.importData('json', Buffer.from(save).toString('base64'), 'input-probe.save.json')
mkdirSync(OUT, { recursive: true })

for (const fmt of ['save-gia', 'gia-combined']) {
  const result = st.exportData(fmt)
  // save-gia 返回多文件清单；gia-combined 返回单文件
  const files = result.files || [result]
  for (const f of files) {
    const buf = Buffer.from(f.data, f.encoding === 'base64' ? 'base64' : 'utf8')
    writeFileSync(`${OUT}/${f.filename}`, buf)
    console.log('wrote', f.filename, buf.length, 'bytes', (f.warnings || []).length ? 'warnings:' + JSON.stringify(f.warnings) : '')
  }
  if (result.warnings?.length) console.log('pkg warnings:', result.warnings)
}
// 脚本源码副本（真机手工挂载用）
writeFileSync(`${OUT}/main.lua`, readFileSync(`${ROOT}/lua/main.lua`, 'utf8'))
console.log('wrote main.lua')
