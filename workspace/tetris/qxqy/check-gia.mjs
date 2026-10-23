#!/usr/bin/env node
// 交付物自查：GIA 文件 > 0 字节且能重新 importGia() 解出；存档能被 importData('json') 加载。
// 用法：node qxqy/check-gia.mjs   （退出码 0 = 全绿）
import { readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createStudio, importGia } from '/home/h/miliastra-beyond-simulator/studio/index.js'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const giaPath = join(root, 'device-package/tetris-整合包.gia')
const savePath = join(root, 'tetris.save.json')

const problems = []
const check = (label, ok, detail) => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}${detail ? ' — ' + detail : ''}`)
  if (!ok) problems.push(label)
}

// 1) GIA 文件
const size = statSync(giaPath).size
check('GIA 文件 > 0 字节', size > 0, `${size} B`)

const bytes = readFileSync(giaPath)
const back = importGia(bytes)
const templateCount = (back.clientProject?.root?.children || []).length
const scriptCount = back.scripts?.length || 0
const serverNodes = (() => {
  let n = 0
  const walk = (node) => { n += 1; (node.children || []).forEach(walk) }
  if (back.project?.root) walk(back.project.root)
  return n
})()
check('importGia 解出客户端模板 = 1', templateCount === 1, `${templateCount}`)
check('importGia 解出脚本映射 = 1', scriptCount === 1, (back.scripts || []).map((s) => s.path).join(','))
check('importGia 解出服务端控件 = 4（根 + 容器 + 2 个 HUD 文本）', serverNodes === 4, `${serverNodes}`)
check('GIA 是整合包（服务端 + 客户端同文件）', back.metadata?.combined === true, String(back.metadata?.combined))

const luaInGia = (back.scripts || [])[0]?.source || ''
check('GIA 内联 Lua 源码非空', luaInGia.length > 2000, `${luaInGia.length} B`)
check('Lua 源码含 OnUpdate 固定步长', luaInGia.includes('GRAVITY_TICKS') && luaInGia.includes('EnableUpdate(true)'))

// 2) 存档能被 importData 重新加载
const raw = readFileSync(savePath)
const b64 = raw.toString('base64')
const studio = createStudio()
const imported = studio.importData('json', b64, 'tetris.save.json')
const importedScripts = imported.snapshot?.scripts || []
check('存档 importData 成功且带 1 个脚本', importedScripts.length === 1,
  importedScripts.map((s) => `${s.path}->${s.controlId}`).join(','))

// 3) 存档能被 createStudio 直接当 seed 加载
const seeded = createStudio(JSON.parse(raw.toString('utf8')))
check('存档可作为 createStudio seed 直接加载', Boolean(seeded.get().scripts?.length === 1))

console.log(problems.length ? `\n${problems.length} 项不通过` : '\nGIA/存档自查全部通过')
process.exit(problems.length ? 1 : 0)
