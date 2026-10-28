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
// 2026-10-25：模板数从 2 变 4 —— 2026-10-24 那轮加了结算层的 settle(容器) 与 stext(文字) 两个模板，
// 这里原来写死 2 就一直红（与本轮音效/抖屏无关，顺手对齐）。
check('importGia 解出客户端模板 = 4（cell + hit + settle + stext）', templateCount === 4, `${templateCount}`)
// v2.7 ⑨ 多 lua：1 个主脚本（挂 n1）+ N 个未挂载模块（只被 require）
const scriptPaths = (back.scripts || []).map((s) => s.path)
const mainScript = (back.scripts || []).find((s) => s.path === 'lua/main.lua')
const moduleScripts = scriptPaths.filter((p) => p.startsWith('lua/tetris/'))
check('importGia 解出脚本映射 = 1 主 + 3 模块（config/widgets/audio）',
  scriptCount === 4 && Boolean(mainScript) && moduleScripts.length === 3, scriptPaths.join(','))
// 注意：**挂载关系不进 GIA wire**（D254/d3d 知识图谱实证）⇒ GIA 侧只能查"有 1 条主脚本 + 3 条模块"，
// 挂载点必须在**存档**侧查（下面 importData 那一条已经查了 main->n1）。
check('GIA 内脚本映射结构（1 主 + 3 模块，路径带 .lua）',
  Boolean(mainScript) && moduleScripts.length === 3 && scriptPaths.every((p) => p.endsWith('.lua')),
  scriptPaths.join(','))
check('importGia 解出服务端控件 = 18（根 + 容器 + 10 个文本 + 6 个按钮标签）', serverNodes === 18, `${serverNodes}`)
check('GIA 是整合包（服务端 + 客户端同文件）', back.metadata?.combined === true, String(back.metadata?.combined))

const luaInGia = mainScript?.source || ''
const allLua = (back.scripts || []).map((s) => s.source || '').join('\n')
check('GIA 内联 Lua 源码非空', luaInGia.length > 2000, `${luaInGia.length} B`)
// 旧断言查 GRAVITY_TICKS（v1 常量名，早改成 NUM.SPEED 了）⇒ 一直红；改为查真实存在的固定步长锚
check('主脚本含 OnUpdate 固定步长', luaInGia.includes('EnableUpdate(true)') && luaInGia.includes('function OnUpdate(dt)'))
check('主脚本含模板 guid 候选表（且占位符已被注入）', luaInGia.includes('TPL_GUIDS') && !luaInGia.includes('__GUID_CELL__'))
check('主脚本含引导状态机', luaInGia.includes('guide stage='))
// AddCursorEventListener 已搬进 widgets.lua ⇒ 按「全部脚本」查，并额外核对光标热区锚在 main
check('光标热区（全脚本）', allLua.includes('AddCursorEventListener') && luaInGia.includes('menuZone') && luaInGia.includes('hits='))
const moduleOk = moduleScripts.every((p) => {
  const src = (back.scripts || []).find((s) => s.path === p)?.source || ''
  // config 是纯数据模块（无 M.new）；widgets/audio 用工厂 M.new —— 共同契约是「return 恰好 1 个值 = M」
  const needsFactory = /widgets|audio/.test(p)
  return src.includes('return M') && (!needsFactory || src.includes('M.new'))
})
check('模块脚本符合 require 契约（return M；widgets/audio 有 M.new 工厂）', moduleOk)

// 2) 存档能被 importData 重新加载
const raw = readFileSync(savePath)
const b64 = raw.toString('base64')
const studio = createStudio()
const imported = studio.importData('json', b64, 'tetris.save.json')
const importedScripts = imported.snapshot?.scripts || []
check('存档 importData 成功且带 1 主 + 3 模块（仅主脚本有挂载点）',
  importedScripts.length === 4 && importedScripts.filter((s) => s.controlId).length === 1,
  importedScripts.map((s) => `${s.path}->${s.controlId || '-'}`).join(','))

// 3) 存档能被 createStudio 直接当 seed 加载
const seeded = createStudio(JSON.parse(raw.toString('utf8')))
check('存档可作为 createStudio seed 直接加载', Boolean(seeded.get().scripts?.length === 4))

console.log(problems.length ? `\n${problems.length} 项不通过` : '\nGIA/存档自查全部通过')
process.exit(problems.length ? 1 : 0)
