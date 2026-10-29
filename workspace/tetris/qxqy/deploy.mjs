#!/usr/bin/env node
// 一步部署：重建 → 复制 GIA 到游戏导出目录（编辑器导入对话框默认打开这里）
//          → 把注入过 guid 的 Lua 写进地图的 external_lua_file（脚本同步路径）。
//
// 用法：
//   node qxqy/deploy.mjs                 只重建 + 部署
//   node qxqy/deploy.mjs --calibrate     先读真机 GIL 的 cell/hit 实际 guid，写进 main.lua 候选表，再重建部署
//   node qxqy/deploy.mjs --map 1073741834 --uid 110170759
//
// 需要环境变量 GSTS_LOCALLOW_DIR（缺省按本机路径推断；须指到 .../AppData/LocalLow/miHoYo/原神）
import { readFileSync, writeFileSync, copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildStudio } from './build.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const repoRoot = join(root, '..', '..')

const args = process.argv.slice(2)
const flag = (name) => args.includes(name)
const opt = (name, fallback) => {
  const i = args.indexOf(name)
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback
}

const mapId = opt('--map', '1073741834')
const uid = opt('--uid', '110170759')
const localLow = process.env.GSTS_LOCALLOW_DIR
  || join(process.env.HOME, '.local/share/anime-game-launcher/prefix/drive_c/users/h/AppData/LocalLow/miHoYo/原神')
const saveDir = join(localLow, 'BeyondLocal', uid, 'Beyond_Local_Save_Level', mapId)
const gilPath = join(saveDir, `${mapId}.gil`)
const exportDir = join(localLow, 'BeyondLocal', 'Beyond_Local_Export')
const externalLua = join(saveDir, 'external_lua_file', 'default_import_file', 'lua', 'main.lua')
const luaSource = join(root, 'lua/main.lua')

function calibrate() {
  if (!existsSync(gilPath)) throw new Error(`找不到 GIL：${gilPath}`)
  const out = execFileSync(
    'npx',
    ['tsx', 'src/cli/gsts.ts', 'assets:ui', 'list', '--gil', gilPath, '--flat'],
    { cwd: repoRoot, env: { ...process.env, GSTS_LOCALLOW_DIR: localLow }, encoding: 'utf8', maxBuffer: 32 << 20 },
  )
  const grab = (name) => {
    const hits = [...out.matchAll(new RegExp(`\\[[^\\]]*\\] ${name} id=(\\d+)`, 'g'))].map((m) => m[1])
    return [...new Set(hits)]
  }
  const cell = grab('cell')
  const hit = grab('hit')
  if (!cell.length) console.warn('⚠ 真机里没找到 name=cell 的控件记录')
  if (!hit.length) console.warn('⚠ 真机里没找到 name=hit 的模板（先导入一次含 hit 的 GIA）')
  let src = readFileSync(luaSource, 'utf8')
  const listLine = (key, found, fallbackIds) => {
    const ids = [...found, ...fallbackIds]
    const uniq = [...new Set(ids.filter((x) => x && x !== '__GUID_CELL__' && x !== '__GUID_HIT__'))]
    const head = key === 'cell' ? '__GUID_CELL__' : '__GUID_HIT__'
    return `  ${key} = { ${[head, ...uniq].join(', ')} },`
  }
  src = src.replace(/^  cell = \{.*$/m, listLine('cell', cell, ['1073741849', '1073741854']))
  src = src.replace(/^  hit  = \{.*$/m, listLine('hit', hit, ['1073741865', '1073741866', '1073741867']))
  writeFileSync(luaSource, src)
  console.log(`校准：cell=[${cell.join(',')}] hit=[${hit.join(',')}] → 已写进 ${luaSource} 的 TPL_GUIDS`)
}

if (flag('--calibrate')) calibrate()

// 重建（与 build.mjs 共用同一套 patch 序列，保证存档/GIA/Lua 三份产物同源）
const { studio, cellGuid, hitGuid, settleGuid, stextGuid } = buildStudio()
const save = studio.exportData('save')
writeFileSync(join(root, 'tetris.save.json'), Buffer.from(save.data, 'base64').toString('utf8'))
mkdirSync(join(root, 'device-package'), { recursive: true })
const gia = Buffer.from(studio.exportData('gia-combined').data, 'base64')
writeFileSync(join(root, 'device-package/tetris-整合包.gia'), gia)
// 注入过 guid 的 Lua（与 GIA 内联源码一致）：外部脚本同步路径也拿同一份
const injectedLua = readFileSync(luaSource, 'utf8')
  .replaceAll('__GUID_CELL__', String(cellGuid))
  .replaceAll('__GUID_HIT__', String(hitGuid))
  .replaceAll('__GUID_SETTLE__', String(settleGuid))
  .replaceAll('__GUID_STEXT__', String(stextGuid))

// 网页试玩工作区：模拟器存档扫描 policy.symlinks=false（studio/host/workspace.js:170）
// ⇒ 软链不会被列出，必须实体复制；每次 rebuild 后自动同步一次
let deployed = []
{
  const ws = process.env.QXQY_WORKSPACE || join(process.env.HOME || '', 'qxqy-workspace')
  if (existsSync(ws)) {
    const target = join(ws, 'tetris.save.json')
    copyFileSync(join(root, 'tetris.save.json'), target)
    deployed.push(`存档 → ${target}`)
  }
}
if (existsSync(exportDir)) {
  const target = join(exportDir, 'tetris-整合包.gia')
  copyFileSync(join(root, 'device-package/tetris-整合包.gia'), target)
  deployed.push(`GIA → ${target}`)
}
if (existsSync(dirname(externalLua))) {
  writeFileSync(externalLua, injectedLua)
  deployed.push(`Lua → ${externalLua}`)
  // v4.0（2026-10-29）：**模块文件也要部署**。main 用 loadModule('config'|'widgets'|'audio'|'skills')
  // 按路径 require（4 级候选，首选 default_import_file/lua/tetris/<name>），而上面的 writeFileSync
  // 只写 main.lua ⇒ 真机上模块是本机旧副本（本次实测：config 还是 10-28 的 47788 B、skills.lua 根本没有）。
  // 后果不是报错而是**静默用旧数值**（NUM.PHONE/AI_TUNE 缺失、aiPace 不存在）。
  const modDir = join(dirname(externalLua), 'tetris')
  mkdirSync(modDir, { recursive: true })
  const mods = ['config.lua', 'widgets.lua', 'audio.lua', 'skills.lua']
  for (const m of mods) {
    const src = join(root, 'lua/tetris', m)
    if (!existsSync(src)) { console.log(`部署：模块缺失 ${m}（跳过）`); continue }
    copyFileSync(src, join(modDir, m))
    deployed.push(`模块 → ${join(modDir, m)}`)
  }
}

console.log(`构建：GIA ${gia.length} B  模板 cell=${cellGuid} hit=${hitGuid}  Lua ${injectedLua.length} B`)
for (const line of deployed) console.log('部署：' + line)
if (!deployed.length) console.log('部署：跳过（导出目录或 external_lua_file 不存在，检查 --map/--uid/GSTS_LOCALLOW_DIR）')
console.log('\n下一步：编辑器 → 打开存档「hl」→ 导入 ' + join(exportDir, 'tetris-整合包.gia') + ' → 试玩')
