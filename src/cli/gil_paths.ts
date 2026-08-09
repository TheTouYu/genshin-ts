import fs from 'node:fs'
import path from 'node:path'

import { existsDir } from '../compiler/config_loader.js'
import type { GstsGameRegion, GstsInjectConfig } from '../compiler/gsts_config.js'

function exists(p: string): boolean {
  try {
    return fs.existsSync(p)
  } catch {
    return false
  }
}

function listNumericDirs(parent: string): number[] {
  if (!existsDir(parent)) return []
  return fs
    .readdirSync(parent, { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^\d+$/.test(d.name))
    .map((d) => Number(d.name))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b)
}

export type ResolvedGilTarget = {
  region: GstsGameRegion
  beyondLocalRoot: string
  playerId: number
  saveLevelDir: string
  mapId: number
  gilPath: string
}

export type ResolvedGilFolder = {
  region: GstsGameRegion
  beyondLocalRoot: string
  playerId: number
  saveLevelDir: string
}

function getWslLocalLowDir(): string | undefined {
  const usersRoot = '/mnt/c/Users'
  if (!existsDir(usersRoot)) return undefined
  const candidates = fs
    .readdirSync(usersRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    // CodexSandbox* 是沙箱环境用户目录，不可能是真实游戏目录，排除以免干扰自动探测
    .filter((d) => !d.name.toLowerCase().startsWith('codexsandbox'))
    .map((d) => path.join(usersRoot, d.name, 'AppData', 'LocalLow'))
    .filter((p) => existsDir(p))

  if (candidates.length === 1) return candidates[0]
  if (candidates.length > 1) {
    throw new Error(
      `[error] multiple WSL LocalLow folders found; set GSTS_LOCALLOW_DIR: ${candidates.join(', ')}`
    )
  }
  return undefined
}

function getLocalLowDir(): string {
  const explicit = process.env.GSTS_LOCALLOW_DIR
  if (explicit) return explicit

  const localAppData = process.env.LOCALAPPDATA
  if (localAppData) {
    const appDataDir = path.dirname(localAppData)
    return path.join(appDataDir, 'LocalLow')
  }

  const wslLocalLow = getWslLocalLowDir()
  if (wslLocalLow) return wslLocalLow

  throw new Error(
    '[error] LOCALAPPDATA not found; set GSTS_LOCALLOW_DIR or run under Windows/WSL with /mnt/c mounted'
  )
}

function getBeyondLocalRoot(region: GstsGameRegion): string {
  const explicit = process.env.GSTS_BEYOND_LOCAL_ROOT
  if (explicit) return explicit

  const localLow = getLocalLowDir()
  if (region === 'China') return path.join(localLow, 'miHoYo', '原神', 'BeyondLocal')
  return path.join(localLow, 'miHoYo', 'Genshin Impact', 'BeyondLocal')
}

export function detectGameRegion(): { region: GstsGameRegion; root: string } | null {
  const china = getBeyondLocalRoot('China')
  const global = getBeyondLocalRoot('Global')
  const hasChina = existsDir(china)
  const hasGlobal = existsDir(global)
  if (hasChina && !hasGlobal) return { region: 'China', root: china }
  if (!hasChina && hasGlobal) return { region: 'Global', root: global }
  return null
}

function resolveBase(cfg: GstsInjectConfig): ResolvedGilFolder {
  const auto = detectGameRegion()
  let region: GstsGameRegion | undefined = cfg.gameRegion
  if (!region) {
    if (!auto) {
      throw new Error(
        '[error] gameRegion is required (both China/Global folders exist or neither found)'
      )
    }
    region = auto.region
  }

  const beyondLocalRoot = getBeyondLocalRoot(region)
  if (!existsDir(beyondLocalRoot)) {
    throw new Error(`[error] BeyondLocal folder not found: ${beyondLocalRoot}`)
  }

  const numeric = listNumericDirs(beyondLocalRoot)
  const playerId =
    typeof cfg.playerId === 'number' ? cfg.playerId : numeric.length === 1 ? numeric[0] : undefined
  if (typeof playerId !== 'number' || !Number.isFinite(playerId)) {
    throw new Error('[error] playerId is required (multiple accounts found)')
  }

  const saveLevelDir = path.join(beyondLocalRoot, String(playerId), 'Beyond_Local_Save_Level')
  if (!existsDir(saveLevelDir)) {
    throw new Error(`[error] Beyond_Local_Save_Level not found: ${saveLevelDir}`)
  }

  return { region, beyondLocalRoot, playerId, saveLevelDir }
}

export function resolveGilTarget(cfg: GstsInjectConfig): ResolvedGilTarget {
  const { region, beyondLocalRoot, playerId, saveLevelDir } = resolveBase(cfg)

  const mapId = cfg.mapId
  if (typeof mapId !== 'number' || !Number.isFinite(mapId)) {
    throw new Error('[error] mapId is required')
  }

  const gilPath = path.join(saveLevelDir, `${mapId}.gil`)
  if (!exists(gilPath)) {
    throw new Error(`[error] target gil not found: ${gilPath}`)
  }

  return { region, beyondLocalRoot, playerId, saveLevelDir, mapId, gilPath }
}

export function resolveGilFolder(cfg: GstsInjectConfig): ResolvedGilFolder {
  return resolveBase(cfg)
}

// 编辑器（游戏）实际读写的地图活动目录是 BeyondLocal/<player>/Temp/：地图列表来自
// Temp/Beyond_Local_Save_Player.gip，打开/保存地图时 .gil 双写 Temp 与
// Beyond_Local_Save_Level/。CLI 以 Save_Level 为准，新文件或写回必须同步到 Temp
// 并注册 Temp gip，编辑器列表才能看到（2026-08-09 实测：仅写 Save_Level 时编辑器不显示）。
export function tempDirOf(saveLevelDir: string): string {
  return path.join(saveLevelDir, '..', 'Temp')
}

export function syncGilToTemp(saveLevelDir: string, fileName: string): string | null {
  const tempDir = tempDirOf(saveLevelDir)
  if (!existsDir(tempDir)) return null
  const src = path.join(saveLevelDir, fileName)
  if (!exists(src)) return null
  const dst = path.join(tempDir, fileName)
  fs.copyFileSync(src, dst)
  return dst
}
