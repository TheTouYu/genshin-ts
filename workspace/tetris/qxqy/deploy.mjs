#!/usr/bin/env node
// 一步部署：重建 → 复制 GIA 到游戏导出目录（编辑器导入对话框默认打开这里）
//          → 把注入过 guid 的 Lua 写进地图的 external_lua_file（脚本同步路径）。
//
// 用法：
//   node qxqy/deploy.mjs                 重建 + 铺网页工作区 + 导出目录（旧路径，仍需编辑器导入）
//   node qxqy/deploy.mjs --device        重建 + **直写地图 .gil**（f5 内联源码 + external lua + Temp 同步）
//                                        ⇒ 真机里切到这张图就能直接试玩，不需要编辑器导入/重挂
//   node qxqy/deploy.mjs --calibrate     先读真机 GIL 的 cell/hit 实际 guid，写进 main.lua 候选表，再重建部署
//   node qxqy/deploy.mjs --map 1073741834 --uid 110170759
//
// 为什么 --device 走 assets:scripts update 而不是复制文件：
//   GIA 导入只会**新增**一条 main_N 脚本并把它挂到**新的**容器实例节点上；地图里真正跑的是
//   「父 = 默认布局」的那个实例节点上挂的那条脚本（本次实测 = main_2 / guid 1073741827）。
//   只复制 external_lua_file 里的文件不改 f5 内联源码与 Temp ⇒ 真机读到的还是旧逻辑（而且不报错）。
//
// 需要环境变量 GSTS_LOCALLOW_DIR（缺省按本机路径推断；须指到 .../AppData/LocalLow/miHoYo/原神）
import { readFileSync, writeFileSync, copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs'
import crypto from 'node:crypto'
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
{
  // 存档显示名：网页工作区下拉显示 `meta.name · 文件名`，不设就是「未命名存档」⇒ 每次构建看起来都像旧的
  const saveObj = JSON.parse(Buffer.from(save.data, 'base64').toString('utf8'))
  saveObj.meta = saveObj.meta || {}
  // ⚠ 版本号必须与 build.mjs 同源（main.lua 的 BUILD_TAG），别写死字面量。
  // 事故：这里曾硬编码存档名（含旧版本号 v4.0），网页工作区那份存档因此一直显示 v4.0，
  // 与仓库存档（build.mjs 写 BUILD_TAG）不同名，谁都分不清网页跑的是哪一版。
  // 与 build.mjs 同一个函数（qxqy/buildtag.mjs）——两处各读一次正则就是"同一事实两处表达"
  const tagNow = buildTag(root)
  saveObj.meta.name = opt('--title', `俄罗斯方块 ${tagNow}`)
  writeFileSync(join(root, 'tetris.save.json'), JSON.stringify(saveObj))
}
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
  // ⚠ 这里原本写死 4 个模块 —— 新增 aieval/roster 时真机上直接缺失（main 的 loadModule 静默降级）。
  // 改成**扫目录**：lua/tetris/*.lua 全量同步，新增模块零改动。
  const mods = readdirSync(join(root, 'lua/tetris')).filter((f) => f.endsWith('.lua')).sort()
  for (const m of mods) {
    const src = join(root, 'lua/tetris', m)
    if (!existsSync(src)) { console.log(`部署：模块缺失 ${m}（跳过）`); continue }
    copyFileSync(src, join(modDir, m))
    deployed.push(`模块 → ${join(modDir, m)}`)
  }
}

// ── 直写地图（一步到位：真机切图即玩）────────────────────────────────────────
// 步骤：①更新「默认布局里那个容器实例节点」所挂脚本的源码（f5 + external + Temp 三同步）
//       ②四个模块脚本同步（已在登记表里就 update，不在就 register）
//       ③读回 mounts 与 Save/Temp sha 作验收
const MAP_ID = String(mapId)
function runGsts(args) {
  const cli = join(repoRoot, 'dist/src/cli/gsts.js')
  return execFileSync(process.execPath, [cli, ...args], {
    encoding: 'utf8',
    env: { ...process.env, GSTS_LOCALLOW_DIR: localLow },
    maxBuffer: 64 * 1024 * 1024
  })
}
function deviceDeploy() {
  if (!existsSync(gilPath)) throw new Error(`找不到 GIL：${gilPath}`)
  const tmp = join(root, 'device-package', 'inject-main.lua')
  mkdirSync(dirname(tmp), { recursive: true })
  writeFileSync(tmp, injectedLua)

  // ① 找出"默认布局里"的容器实例节点挂的是哪条脚本（不是靠名字猜：名字每导入一次就变）
  const discoverRaw = runGsts(['assets:ui', 'container', 'discover', '--gil', gilPath, '--format', 'json'])
  const discover = JSON.parse(discoverRaw.slice(discoverRaw.indexOf('{')))
  const inst = (discover.instances || []).find((x) => String(x.parentId || x.parent || '') === '1073741825')
    || (discover.instances || []).slice().sort((a, b) => (b.children?.length || 0) - (a.children?.length || 0))[0]
  const hostId = inst?.mounts?.[0]?.hostId
  const scriptGuid = inst?.mounts?.[0]?.scriptGuids?.[0]
  if (!scriptGuid) throw new Error('设备部署失败：默认布局的容器实例上没有挂脚本（先导入一次 GIA 或手动挂载）')
  const listRaw = runGsts(['assets:scripts', 'list', '--gil', gilPath])
  const scriptName = (listRaw.match(new RegExp(`guid=${scriptGuid} name=(\\S+)`)) || [])[1]
  if (!scriptName) throw new Error(`设备部署失败：登记表里找不到 guid=${scriptGuid}`)
  console.log(`设备部署：布局实例=${inst.name || '?'} node=${hostId} → 脚本 ${scriptName}(guid=${scriptGuid})`)
  const upd = runGsts(['assets:scripts', 'update', '--gil', gilPath, '--name', scriptName,
    '--source-file', tmp, '--map-id', MAP_ID, '--write'])
  for (const line of upd.split('\n')) if (/sourceBytes|temp-sync|backup=|writePerformed/.test(line)) console.log('  ' + line.trim())

  // ② 模块脚本（require 按路径读 external，但登记表里同步一份更稳）
  // v5.0：模块清单必须与 main.lua 的 loadModule 列表逐一对齐，否则新模块只在仓库里、
  // 真机上 require 失败 ⇒ 技能没有文案/特效、手机没有布局（"部署了但界面崩"的老坑）。
  // 同理：登记表也按目录生成（脚本名 = tetris_<文件名>），别再写死
  const mods = readdirSync(join(root, 'lua/tetris')).filter((f) => f.endsWith('.lua')).sort()
    .map((f) => ['tetris_' + f.replace(/\.lua$/, ''), f])
  // ⚠ 模块源码里也有 __GUID_*__ 占位（TPL_GUIDS 在 config.lua）。build 会给 GIA 里的模块源码注入，
  // 但这里直写 external 时用的是**仓库源文件**——不注入就等于把字符串当 guid 传下去（2026-10-29 真机实测：
  // `cell 模板 guid 都不可用，候选=3` 就是这么来的）。
  const subst = (text) => text
    .replaceAll('__GUID_CELL__', String(cellGuid))
    .replaceAll('__GUID_HIT__', String(hitGuid))
    .replaceAll('__GUID_SETTLE__', String(settleGuid))
    .replaceAll('__GUID_STEXT__', String(stextGuid))
  for (const [name, file] of mods) {
    const src = join(root, 'lua/tetris', file)
    if (!existsSync(src)) continue
    const injectedMod = join(root, 'device-package', `inject-${file}`)
    writeFileSync(injectedMod, subst(readFileSync(src, 'utf8')))
    const registered = listRaw.includes(`name=${name} `)
    const base = ['--gil', gilPath, '--name', name, '--source-file', injectedMod, '--map-id', MAP_ID, '--write']
    if (registered) {
      runGsts(['assets:scripts', 'update', ...base])
      console.log(`  模块更新 ${name}`)
    } else {
      runGsts(['assets:scripts', 'register', '--gil', gilPath, '--name', name,
        '--path', `lua/tetris/${file}`, '--source-file', injectedMod, '--map-id', MAP_ID, '--write'])
      console.log(`  模块登记 ${name}`)
    }
  }

  // ③ 验收：挂载 + Save/Temp 同 sha
  const mounts = runGsts(['assets:scripts', 'mounts', '--gil', gilPath])
  const mountLines = mounts.split('\n').filter((l) => l.includes('host='))
  console.log(`  挂载：${mountLines.length} 处`)
  for (const line of mountLines) console.log('    ' + line.trim())
  // Temp 与 Save_Level 平级：<...>/BeyondLocal/<uid>/Temp/<id>.gil（不是 <saveDir>/Temp！）
  const tempPath = join(saveDir, '..', '..', 'Temp', `${MAP_ID}.gil`)
  const sha = (f) => (existsSync(f) ? crypto.createHash('sha256').update(readFileSync(f)).digest('hex').slice(0, 16) : 'MISSING')
  const a = sha(gilPath), b = sha(tempPath)
  console.log(`  双址：Save_Level=${a} Temp=${b} ${a === b && a !== 'MISSING' ? 'OK（编辑器/游戏读的是同一份）' : '⚠ 不一致'}`)
  console.log('\n下一步：真机里直接切到这张图（' + MAP_ID + '）试玩；不用再开编辑器导入。')
  console.log('网页试玩注意：**正在运行的试玩不会热更 Lua** —— 存档更新只会刷新预览画面；'
    + '要让新代码生效必须点「■ 停止 / ↻ 重新开始」重启一次试玩（或按 R 不行，R 只是游戏内重开）。')
}

console.log(`构建：GIA ${gia.length} B  模板 cell=${cellGuid} hit=${hitGuid}  Lua ${injectedLua.length} B`)
for (const line of deployed) console.log('部署：' + line)
if (!deployed.length) console.log('部署：跳过（导出目录或 external_lua_file 不存在，检查 --map/--uid/GSTS_LOCALLOW_DIR）')
if (flag('--device')) {
  try {
    deviceDeploy()
  } catch (err) {
    console.error('设备部署失败：' + (err && err.message ? err.message : err))
    process.exitCode = 1
  }
} else {
  console.log('\n下一步（旧路径）：编辑器 → 打开存档「hl」→ 导入 ' + join(exportDir, 'tetris-整合包.gia') + ' → 试玩')
  console.log('        （想一步到位直写地图：node qxqy/deploy.mjs --device）')
}
