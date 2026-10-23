// 导出「模拟器原始基线」GIA —— 不做任何我们项目的改动，只走 createStudio 默认工程。
// 用途：真机导入对齐基线（看标准形态：模板名/索引/挂载/warning），与 hmlt-qixia-整合包.gia 对照。
// 跑法：node qxqy/export-baseline.mjs
import { writeFileSync } from 'node:fs'
import { createStudio } from '/home/h/miliastra-beyond-simulator/studio/index.js'

const EXPORT_DIR =
  '/home/h/.local/share/anime-game-launcher/prefix/drive_c/users/h/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export'

function write(studio, name) {
  const r = studio.exportData('gia-combined')
  const buf = Buffer.from(r.data, 'base64')
  writeFileSync(`${EXPORT_DIR}/${name}`, buf)
  console.log(`wrote ${name} ${buf.length}B warnings=${(r.warnings || []).length}`)
}

// 1) 纯默认工程：服务端「客户端控件容器」+ 11 类控件，客户端默认模板「Lua实例化面板」，无脚本
write(createStudio(), 'baseline-模拟器原始导出-整合包.gia')

// 2) 默认工程 + 一条最小 Lua（挂到客户端模板根节点 n1）：证明脚本映射与挂载关系随包走
const s = createStudio()
let g = s.patch({ op: 'selectAsset', assetType: 'client-control-template' })
const src =
  '-- 基线脚本：只证明脚本映射+挂载通\n' +
  'local ui = script.object\n' +
  "print('BASELINE-LUA-OK ' .. tostring(ui ~= nil))\n"
g = s.patch({
  op: 'addScript',
  path: 'baseline/main.lua',
  source: src,
  controlId: 'n1',
  controlAsset: 'client-control-template',
  expectedRevision: g.version,
})
write(s, 'baseline-模拟器原始导出-Lua-整合包.gia')
