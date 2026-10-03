// 票 24-A：新版存档子目录式布局 Save_Level/<mapId>/<mapId>.gil 的兼容回归。
// 场景来自 2026-09-30 wine 实测：新版编辑器地图存子目录（旁带 external_lua_file/），
// Temp 仍平铺 + gip 注册。覆盖 gilPathInSaveLevel / saveLevelDirOf / listMaps /
// syncGilToTemp / resyncMap / createMap 在两种布局下的行为。
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { gilPathInSaveLevel, saveLevelDirOf, syncGilToTemp } from '../src/cli/gil_paths.js'
import { createMap, listMaps, resyncMap } from '../src/cli/maps.js'

const root = mkdtempSync(path.join(tmpdir(), 'gsts-maps-layout-'))
// 模拟 BeyondLocal/<player>/ 目录：Save_Level + Temp 平级（玩家号须数字，createMap 依赖）
const playerDir = path.join(root, '110170759')
const saveLevelDir = path.join(playerDir, 'Beyond_Local_Save_Level')
const tempDir = path.join(playerDir, 'Temp')
mkdirSync(saveLevelDir, { recursive: true })
mkdirSync(tempDir, { recursive: true })

// 1) gilPathInSaveLevel：子目录式优先、平铺兜底、双缺返 null
const nestedDir = path.join(saveLevelDir, '1073741825')
mkdirSync(nestedDir)
writeFileSync(path.join(nestedDir, '1073741825.gil'), 'nested-map')
mkdirSync(path.join(nestedDir, 'external_lua_file'))
assert.equal(gilPathInSaveLevel(saveLevelDir, 1073741825), path.join(nestedDir, '1073741825.gil'))
writeFileSync(path.join(saveLevelDir, '1073741825.gil'), 'stale-flat')
assert.equal(
  gilPathInSaveLevel(saveLevelDir, 1073741825),
  path.join(nestedDir, '1073741825.gil'),
  'nested wins over stale flat'
)
writeFileSync(path.join(saveLevelDir, '1073741900.gil'), 'flat-only')
assert.equal(
  gilPathInSaveLevel(saveLevelDir, 1073741900),
  path.join(saveLevelDir, '1073741900.gil')
)
;(await import('node:fs')).rmSync(path.join(saveLevelDir, '1073741900.gil'))
assert.equal(gilPathInSaveLevel(saveLevelDir, 1073741827), null)

// 2) saveLevelDirOf：两种布局都反推 Save_Level 根
assert.equal(saveLevelDirOf(path.join(nestedDir, '1073741825.gil')), saveLevelDir)
assert.equal(saveLevelDirOf(path.join(saveLevelDir, '1073741826.gil')), saveLevelDir)

// 3) listMaps：子目录式可见；与平铺同名并存时去重（只收子目录式），
//    否则 maps:create 会算出撞 ID 的 nextId
const listed = listMaps(saveLevelDir, {})
const ids = listed.maps.map((m) => m.mapId)
assert.deepEqual(ids, [1073741825], `nested map listed exactly once, got ${ids.join(',')}`)

// 4) createMap：nextId 从子目录式地图起算（1073741826），不与 1073741825 撞
const created = createMap(saveLevelDir, 'layout-test')
assert.equal(created.mapId, 1073741826)
assert.ok(
  !listMaps(saveLevelDir, {}).maps.some((m) => m.mapId === 1073741825 && m.size === created.size),
  'no duplicate id from flat/nested overlap'
)

// 5) syncGilToTemp：src 支持子目录式，dst 仍平铺写 Temp
// （把合法 GIL 写进嵌套路径，供后续 resyncMap 解析名字）
const fs = await import('node:fs')
fs.writeFileSync(path.join(nestedDir, '1073741825.gil'), fs.readFileSync(created.gilPath))
const tempPath = syncGilToTemp(saveLevelDir, '1073741825.gil')
assert.equal(tempPath, path.join(tempDir, '1073741825.gil'))
assert.ok(
  fs.readFileSync(tempPath as string).equals(fs.readFileSync(created.gilPath)),
  'Temp copy comes from the nested source'
)

// 6) resyncMap：子目录式布局下 gip 注册到正确的 Temp/玩家级位置且不抛错
const resynced = resyncMap(saveLevelDir, 1073741825)
assert.equal(resynced.gilPath, path.join(nestedDir, '1073741825.gil'))
assert.ok(resynced.tempPath, 'temp resynced')

console.log('CLI maps layout (nested Save_Level) test passed')
