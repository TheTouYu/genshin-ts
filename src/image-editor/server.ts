/**
 * `gsts image:serve` — local web UI for the image editor capability.
 *
 * Serves a single-page editor (see web/index.html) plus JSON APIs backed by
 * the image-editor module:
 *
 *   POST /api/import      { sourceType, content }  → { scene, warnings }
 *   POST /api/export      { scene, format }        → text (svg|css|json)
 *   POST /api/export-gia  { scene, groupName }     → binary .gia (download)
 *   POST /api/inject      { scene, groupName }     → writes .gia into the
 *                         game's Beyond_Local_Export dir (game auto-loads it)
 *   GET  /api/assets                                → scanned asset library
 *                         (CSS/SVG/JSON files in the assets dir, parsed + preview)
 *   POST /api/assets/save { name, scene }          → write corrected scene back
 *                         to the asset file (CSS→CSS, SVG→JSON)
 *   DELETE /api/assets?name=xxx                     → remove an asset file
 *   POST /api/assets/inject-batch { names: [] }    → convert several asset
 *                         library files to GIA (one per asset, file name =
 *                         asset stem) and write them all into
 *                         Beyond_Local_Export in one call; response includes
 *                         each GIA's resource id/name list (for node-graph
 *                         authoring)
 *   GET  /api/assets/imported                       → scan Beyond_Local_Export
 *                         .gia files and list each one's group name plus
 *                         resource ids/names (AI-readable asset inventory)
 *
 * GIA naming rule: assets from the library are named after their file stem
 * (guide-tap.css → guide-tap.gia, group name guide-tap); free-form canvas
 * exports keep groupName (default = today's date). The old generic "image.gia"
 * fallback is gone so concurrent assets no longer overwrite each other.
 *
 * The server binds to 127.0.0.1 only. /api/inject* only writes into the
 * Beyond_Local_Export folder (the game's external-asset folder) — it never
 * touches .gil maps, game saves or injects node graphs.
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { parseCssScene, parseJsonScene, parseSvgScene } from './importers.js'
import { sceneToCss, sceneToJson, sceneToSvg } from './exporters.js'
import { defaultGiaGroupName } from './exporters.js'
import { convertSceneToImageGia } from './index.js'
import {
  parseGiaRootFields,
  parsePrimaryResource,
  UI_IMAGE_RESOURCE_CLASS
} from './index.js'
import { ProtoReader, WireType, parseResourceEntry, findVarint } from './gia/wire.js'
import type { SceneDocumentModel } from './types.js'
import { detectGameRegion, listBeyondLocalExportDirs } from '../cli/gil_paths.js'
import { listMaps, resyncMap } from '../cli/maps.js'
import { extractTemplate } from '../cli/static_assembly/library_template.js'
import { parseCssAsset, type CssAsset } from '../cli/static_assembly/library_css.js'
import {
  injectLibraryGil,
  planLibraryInjection,
  verifyLibraryInjection,
  sha256 as sha256Bytes
} from '../cli/static_assembly/library_inject.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export interface ImageServerOptions {
  port?: number
  host?: string
  /** Directory scanned as the reusable asset library (default: <cwd>/assets/images). */
  assetsDir?: string
}

export interface AssetFileItem {
  name: string
  sourceType: 'css' | 'svg' | 'json'
  mtimeMs: number
  size: number
  scene: SceneDocumentModel | null
  svg: string | null
  warnings: string[]
  error: string | null
}

const ASSET_EXTENSIONS = new Set(['.css', '.svg', '.json'])

interface JsonBody {
  scene?: unknown
  sourceType?: string
  content?: string
  format?: string
  groupName?: string
  assetName?: string
  name?: string
  names?: string[]
  game?: string
  mapId?: number
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body)
  })
  res.end(body)
}

function sendError(res: ServerResponse, status: number, message: string): void {
  sendJson(res, status, { error: message })
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
    req.on('error', reject)
  })
}

function parseBody(req: IncomingMessage): Promise<JsonBody> {
  return readBody(req).then((text) => {
    try {
      return JSON.parse(text) as JsonBody
    } catch {
      throw new Error('请求体不是合法 JSON')
    }
  })
}

function toScene(body: JsonBody): SceneDocumentModel {
  if (typeof body.scene !== 'object' || body.scene === null) {
    throw new Error('缺少 scene 字段')
  }
  return body.scene as SceneDocumentModel
}

/** Resolve the game's Beyond_Local_Export folder (external assets dir). */
export function resolveBeyondLocalExportDir(): string | null {
  const explicit = process.env.GSTS_BEYOND_LOCAL_EXPORT_DIR
  if (explicit) return fs.existsSync(explicit) ? explicit : null

  const auto = detectGameRegion()
  if (!auto) return null

  const rootCandidates = [path.join(auto.root, 'Beyond_Local_Export')]
  const numeric = fs
    .readdirSync(auto.root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^\d+$/.test(entry.name))
    .map((entry) => path.join(auto.root, entry.name, 'Beyond_Local_Export'))
  const found = [...rootCandidates, ...numeric].find((dir) => fs.existsSync(dir))
  return found ?? null
}

function sanitizeFileName(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|\s]+/g, '_').replace(/^_+|_+$/g, '')
  return cleaned || 'image'
}

/** File stem of an asset library file (guide-tap.css → guide-tap). */
function assetStem(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? name
  return base.replace(/\.[^.]*$/, '')
}

/**
 * Resolve the GIA group name (what shows up inside the game as the asset
 * library name). Priority: explicit user input → current asset's stem (the
 * name the AI gave the asset file) → today's date as last resort.
 */
function chooseGiaGroupName(groupName: string | undefined, assetName: string | undefined): string {
  if (groupName && groupName.trim()) return groupName.trim()
  if (assetName) {
    const stem = assetStem(assetName)
    if (stem) return stem
  }
  return defaultGiaGroupName()
}

export interface ImageGiaResource {
  guid: number
  name: string
}

export interface ImageGiaInventory {
  groupName: string
  resources: ImageGiaResource[]
}

/**
 * Parse image-mode GIA bytes into a resource inventory: the group name plus
 * every image resource entry (kind=8, class=15) with its guid and name.
 * Used to tell the AI which asset ids exist after an import, so it can
 * author node-graph interactions by id.
 */
export function parseImageGiaInventory(bytes: Uint8Array): ImageGiaInventory {
  const { rootFields } = parseGiaRootFields(bytes)
  const resources: ImageGiaResource[] = []
  let groupName = ''
  for (const field of rootFields) {
    if (field.tag === 1 && field.wire === WireType.LENGTH_DELIMITED) {
      // Primary resource: group name lives in field 3 (patchPrimaryResourceImage).
      for (const prField of parsePrimaryResource(field.data)) {
        if (prField.tag === 3 && prField.wire === WireType.LENGTH_DELIMITED) {
          groupName = new TextDecoder().decode(prField.data)
        }
      }
    } else if (field.tag === 2 && field.wire === WireType.LENGTH_DELIMITED) {
      const info = parseResourceEntry(field.data)
      if (info.class === UI_IMAGE_RESOURCE_CLASS) {
        resources.push({ guid: info.guid, name: info.name || extractUiImageName(field.data) })
      }
    }
  }
  return { groupName, resources }
}

/**
 * Dig the display name out of a ui.content payload: entry → field 19 (ui) →
 * field 1 (uiContent) → field 505 (nameData, tag 502=15) → field 12 →
 * field 501 (string). The resource entry itself deliberately omits
 * internal_name (field 3), so this is the only place a human-readable name
 * exists.
 */
function extractUiImageName(entryData: Uint8Array): string {
  const entryFields = new ProtoReader(entryData).parseFields()
  for (const entryField of entryFields) {
    if (entryField.tag === 19 && entryField.wire === WireType.LENGTH_DELIMITED) {
      for (const uiField of new ProtoReader(entryField.data).parseFields()) {
        if (uiField.tag === 1 && uiField.wire === WireType.LENGTH_DELIMITED) {
          for (const contentField of new ProtoReader(uiField.data).parseFields()) {
            if (contentField.tag !== 505 || contentField.wire !== WireType.LENGTH_DELIMITED) continue
            const nameData = new ProtoReader(contentField.data).parseFields()
            if (findVarint(nameData, 502) !== 15) continue
            for (const nameField of nameData) {
              if (nameField.tag === 12 && nameField.wire === WireType.LENGTH_DELIMITED) {
                for (const inner of new ProtoReader(nameField.data).parseFields()) {
                  if (inner.tag === 501 && inner.wire === WireType.LENGTH_DELIMITED) {
                    return new TextDecoder().decode(inner.data)
                  }
                }
              }
            }
          }
        }
      }
    }
  }
  return ''
}

/** Resolve the reusable asset library dir (created on demand). */
export function resolveAssetsDir(options: ImageServerOptions = {}): string {
  const dir = options.assetsDir
    ? path.resolve(options.assetsDir)
    : path.resolve(process.cwd(), 'assets/images')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

function sourceTypeOf(name: string): 'css' | 'svg' | 'json' {
  const ext = path.extname(name).toLowerCase()
  return ext === '.css' ? 'css' : ext === '.svg' ? 'svg' : 'json'
}

function loadAssetFile(dir: string, name: string): Omit<AssetFileItem, 'name'> {
  const sourceType = sourceTypeOf(name)
  const fullPath = path.join(dir, name)
  const stat = fs.statSync(fullPath)
  try {
    const content = fs.readFileSync(fullPath, 'utf-8')
    const scene =
      sourceType === 'css'
        ? parseCssScene(content)
        : sourceType === 'svg'
          ? parseSvgScene(content)
          : parseJsonScene(content)
    const svg = sceneToSvg(scene)
    return { sourceType, mtimeMs: stat.mtimeMs, size: stat.size, scene, svg, warnings: scene.meta.warnings, error: null }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { sourceType, mtimeMs: stat.mtimeMs, size: stat.size, scene: null, svg: null, warnings: [], error: message }
  }
}

let assetCache: { key: string; items: AssetFileItem[] } | null = null

/** Scan the asset dir; returns null when the dir is unreadable. */
export function listAssets(dir: string): { items: AssetFileItem[]; key: string } | null {
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return null
  }
  const files = entries
    .filter((entry) => entry.isFile() && ASSET_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
    .map((entry) => entry.name)
    .sort()
  const key = files
    .map((name) => {
      const stat = fs.statSync(path.join(dir, name))
      return `${name}:${stat.mtimeMs}:${stat.size}`
    })
    .join('|')
  if (assetCache && assetCache.key === key) return { items: assetCache.items, key }
  const items = files.map((name) => ({ name, ...loadAssetFile(dir, name) }))
  assetCache = { key, items }
  return { items, key }
}

function handleAssetsList(res: ServerResponse, dir: string): void {
  const result = listAssets(dir)
  if (!result) {
    sendError(res, 500, `无法读取资产目录: ${dir}`)
    return
  }
  sendJson(res, 200, {
    dir,
    key: result.key,
    count: result.items.length,
    items: result.items
  })
}

function handleAssetSave(req: IncomingMessage, res: ServerResponse, dir: string): Promise<void> {
  return parseBody(req).then((body) => {
    const name = typeof body.name === 'string' ? path.basename(body.name) : ''
    if (!name || !ASSET_EXTENSIONS.has(path.extname(name).toLowerCase())) {
      sendError(res, 400, 'name 必须是资产文件名（.css/.svg/.json）')
      return
    }
    const scene = toScene(body)
    try {
      const sourceType = sourceTypeOf(name)
      // 更正回写：CSS 源写回 CSS（全功能无损）；SVG 源升级为 JSON（保旋转/圆环）
      const targetName = sourceType === 'css' ? name : name.replace(/\.svg$/i, '.json')
      const text = sourceType === 'css' ? sceneToCss(scene) : sceneToJson(scene)
      const target = path.join(dir, targetName)
      fs.writeFileSync(target, text, 'utf-8')
      assetCache = null
      sendJson(res, 200, { ok: true, name: targetName, message: `已保存到资产库: ${targetName}` })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      sendError(res, 500, `保存失败: ${message}`)
    }
  })
}

function handleAssetDelete(req: IncomingMessage, res: ServerResponse, dir: string): void {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const name = path.basename(url.searchParams.get('name') ?? '')
  if (!name || !ASSET_EXTENSIONS.has(path.extname(name).toLowerCase())) {
    sendError(res, 400, 'name 必须是资产文件名（.css/.svg/.json）')
    return
  }
  try {
    fs.unlinkSync(path.join(dir, name))
    assetCache = null
    sendJson(res, 200, { ok: true, name, message: `已删除资产: ${name}` })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    sendError(res, 500, `删除失败: ${message}`)
  }
}

function handleImport(req: IncomingMessage, res: ServerResponse): Promise<void> {
  return parseBody(req).then((body) => {
    const sourceType = body.sourceType
    const content = body.content ?? ''
    let scene: SceneDocumentModel
    try {
      if (sourceType === 'css') scene = parseCssScene(content)
      else if (sourceType === 'svg') scene = parseSvgScene(content)
      else if (sourceType === 'json') scene = parseJsonScene(content)
      else throw new Error('sourceType 必须是 css/svg/json')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      sendError(res, 400, message)
      return
    }
    sendJson(res, 200, { scene, warnings: scene.meta.warnings })
  })
}

function handleExport(req: IncomingMessage, res: ServerResponse): Promise<void> {
  return parseBody(req).then((body) => {
    const scene = toScene(body)
    const format = body.format ?? 'svg'
    let text: string
    try {
      if (format === 'css') text = sceneToCss(scene)
      else if (format === 'json') text = sceneToJson(scene)
      else if (format === 'svg') text = sceneToSvg(scene)
      else throw new Error('format 必须是 svg/css/json')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      sendError(res, 400, message)
      return
    }
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' })
    res.end(text)
  })
}

function sendGiaDownload(res: ServerResponse, bytes: Uint8Array, fileName: string): void {
  const asciiName = fileName.replace(/[^\x20-\x7e]/g, '_')
  const encoded = encodeURIComponent(fileName)
  res.writeHead(200, {
    'content-type': 'application/octet-stream',
    'content-disposition': `attachment; filename="${asciiName}"; filename*=UTF-8''${encoded}`,
    'content-length': bytes.length
  })
  res.end(Buffer.from(bytes))
}

function handleExportGia(req: IncomingMessage, res: ServerResponse): Promise<void> {
  return parseBody(req).then((body) => {
    const scene = toScene(body)
    const groupName = chooseGiaGroupName(body.groupName, body.assetName)
    let bytes: Uint8Array
    try {
      bytes = convertSceneToImageGia(scene, { groupName: groupName || undefined })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      sendError(res, 400, message)
      return
    }
    const fileName = `${sanitizeFileName(groupName || defaultGiaGroupName())}.gia`
    sendGiaDownload(res, bytes, fileName)
  })
}

/** Write one GIA file into Beyond_Local_Export; returns the target path. */
function writeGiaToExportDir(bytes: Uint8Array, fileName: string, exportDir?: string): string {
  const dir = exportDir ?? resolveBeyondLocalExportDir()
  if (!dir) {
    throw new Error(
      '未找到 Beyond_Local_Export 目录（游戏外部资产目录）；可设置 GSTS_BEYOND_LOCAL_EXPORT_DIR 指定'
    )
  }
  const target = path.join(dir, fileName)
  fs.writeFileSync(target, Buffer.from(bytes))
  return target
}

export interface AssetInjectResult {
  name: string
  groupName: string
  fileName: string
  path: string
  resources: ImageGiaResource[]
}

export interface AssetInjectOutcome {
  results: AssetInjectResult[]
  errors: Array<{ name: string; error: string }>
}

/**
 * Shared conversion + injection pipeline (CLI `image:inject` and the web
 * batch endpoint): load each asset file from `dir`, convert to a GIA whose
 * group name is the asset stem (the AI-chosen name), and write it into
 * `exportDir` (defaults to the auto-detected game export dir).
 */
export function injectAssetsToExportDir(
  names: string[],
  dir: string,
  exportDir?: string,
  groupNameOverride?: string
): AssetInjectOutcome {
  const seen = new Set<string>()
  const results: AssetInjectResult[] = []
  const errors: Array<{ name: string; error: string }> = []
  for (const raw of names) {
    const name = path.basename(raw)
    if (!ASSET_EXTENSIONS.has(path.extname(name).toLowerCase())) {
      errors.push({ name, error: '仅支持 .css/.svg/.json 资产文件' })
      continue
    }
    if (seen.has(name)) continue
    seen.add(name)
    const fullPath = path.join(dir, name)
    if (!fs.existsSync(fullPath)) {
      errors.push({ name, error: '资产文件不存在' })
      continue
    }
    const loaded = loadAssetFile(dir, name)
    if (!loaded.scene) {
      errors.push({ name, error: loaded.error ?? '解析失败' })
      continue
    }
    // 单文件可用显式 --group-name 覆盖；批量一律用资产文件名（AI 起的名字）
    const stem = groupNameOverride && names.length === 1 ? groupNameOverride : assetStem(name)
    let bytes: Uint8Array
    try {
      bytes = convertSceneToImageGia(loaded.scene, { groupName: stem })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      errors.push({ name, error: `转 GIA 失败: ${message}` })
      continue
    }
    const fileName = `${sanitizeFileName(stem)}.gia`
    try {
      const target = writeGiaToExportDir(bytes, fileName, exportDir)
      results.push({
        name,
        groupName: stem,
        fileName,
        path: target,
        resources: parseImageGiaInventory(bytes).resources
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      errors.push({ name, error: `写入失败: ${message}` })
    }
  }
  return { results, errors }
}

function handleInject(req: IncomingMessage, res: ServerResponse): Promise<void> {
  return parseBody(req).then((body) => {
    const scene = toScene(body)
    const groupName = chooseGiaGroupName(body.groupName, body.assetName)
    let bytes: Uint8Array
    try {
      bytes = convertSceneToImageGia(scene, { groupName: groupName || undefined })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      sendError(res, 400, message)
      return
    }
    const fileName = `${sanitizeFileName(groupName || defaultGiaGroupName())}.gia`
    let target: string
    try {
      target = writeGiaToExportDir(bytes, fileName)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      sendError(res, 400, message)
      return
    }
    sendJson(res, 200, {
      ok: true,
      path: target,
      resources: parseImageGiaInventory(bytes).resources,
      message:
        `已写入 ${target}。游戏内：系统菜单 → 资产导入导出工具 → 导入与转存 → 加载外部资产` +
        '（应用重启后首次打开会自动加载一次）。加载后到资产库转存资产即可用。'
    })
  })
}

/**
 * Batch import: convert several asset-library files to GIA (one file per
 * asset, named after the asset stem) and write them all into
 * Beyond_Local_Export. Returns per-asset results including the parsed
 * resource ids/names so the AI can author node-graph interactions by id.
 */
function handleInjectBatch(req: IncomingMessage, res: ServerResponse, dir: string): Promise<void> {
  return parseBody(req).then((body) => {
    const names = Array.isArray(body.names) ? body.names.filter((n) => typeof n === 'string') : []
    if (names.length === 0) {
      sendError(res, 400, 'names 必须是非空字符串数组（资产文件名）')
      return
    }
    // 可选 game：`id`（如 china:110170759，来自 /api/games）或 Beyond_Local_Export 绝对路径
    const game = typeof body.game === 'string' && body.game.trim() !== '' ? body.game.trim() : undefined
    const exportDir = resolveGameExportDir(game)
    if (exportDir instanceof Error) {
      sendError(res, 400, exportDir.message)
      return
    }
    const outcome = injectAssetsToExportDir(names, dir, exportDir)
    sendJson(res, 200, {
      ok: true,
      count: outcome.results.length,
      dir: exportDir,
      results: outcome.results,
      errors: outcome.errors
    })
  })
}

/** Resolve a game selection (id from /api/games, or a path) to an export dir. */
function resolveGameExportDir(game: string | undefined): string | Error {
  if (game === undefined) {
    const defaultDir = resolveBeyondLocalExportDir()
    return defaultDir ?? new Error('未找到 Beyond_Local_Export 目录，请用 --assets-dir 或扫描到游戏后重试')
  }
  // 直接路径
  if (fs.existsSync(game) && fs.statSync(game).isDirectory()) return path.resolve(game)
  // 按 id 匹配扫描结果
  const match = listBeyondLocalExportDirs().find((d) => d.id === game)
  if (match) return match.path
  return new Error(`未找到游戏 "${game}"：运行 gsts image:games 查看可用 id`)
}

/** GET /api/games: 扫描本机可用的游戏导出目录，供前端下拉选择。 */
function handleGamesList(res: ServerResponse): void {
  const dirs = listBeyondLocalExportDirs()
  sendJson(res, 200, { count: dirs.length, games: dirs })
}

/**
 * Resolve the game's Beyond_Local_Save_Level dir (where map .gil files live).
 * Mirrors resolveGilTarget's base resolution but without requiring a mapId.
 */
function resolveSaveLevelDir(): string | null {
  const auto = detectGameRegion()
  if (!auto) return null
  const numeric = fs
    .readdirSync(auto.root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^\d+$/.test(entry.name))
    .map((entry) => Number(entry.name))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b)
  const playerId = numeric.length === 1 ? numeric[0] : undefined
  if (playerId === undefined) return null
  const dir = path.join(auto.root, String(playerId), 'Beyond_Local_Save_Level')
  return fs.existsSync(dir) ? dir : null
}

/** GET /api/maps: 扫描本机地图（Save_Level/*.gil），供前端选择目标地图。 */
function handleMapsList(res: ServerResponse): void {
  const saveLevelDir = resolveSaveLevelDir()
  if (!saveLevelDir) {
    sendError(res, 400, '未找到 Beyond_Local_Save_Level 目录（地图目录）')
    return
  }
  try {
    const result = listMaps(saveLevelDir, { includeName: true })
    sendJson(res, 200, { dir: saveLevelDir, count: result.maps.length, maps: result.maps })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    sendError(res, 500, `读取地图列表失败: ${message}`)
  }
}

export interface LibraryInjectResult {
  name: string
  containerId: number
  copyId: number
  groupIds: number[]
}

export interface LibraryInjectOutcome {
  mapId: number
  gilPath: string
  backup: string | null
  results: LibraryInjectResult[]
  errors: Array<{ name: string; error: string }>
}

/**
 * 把资产库里的 CSS 资产（或画布 scene）写入目标地图 .gil 素材库（root9 素材段）。
 * 容器 ID = 素材索引 ID（0x40000000+ 段），可被游戏 API / 节点图引用。
 * 走安全写回：SHA 锁定 → 内存验证 → 备份 → 写回 → 回读 → Temp 同步。
 */
function injectLibraryToMap(
  mapId: number,
  assets: CssAsset[],
  groupName: string
): LibraryInjectOutcome {
  const saveLevelDir = resolveSaveLevelDir()
  if (!saveLevelDir) {
    throw new Error('未找到 Beyond_Local_Save_Level 目录（地图目录）')
  }
  const gilPath = path.join(saveLevelDir, `${mapId}.gil`)
  if (!fs.existsSync(gilPath)) {
    throw new Error(`地图文件不存在: ${gilPath}`)
  }
  const sourceBytes = new Uint8Array(fs.readFileSync(gilPath))
  const sourceHash = sha256Bytes(sourceBytes)
  const template = extractTemplate(gilPath)
  const plan = planLibraryInjection(sourceBytes, template, assets, groupName)

  const candidate = injectLibraryGil(sourceBytes, template, assets, groupName)
  // 写回前内存验证（独立回读断言）
  verifyLibraryInjection(candidate, sourceBytes, template, assets, groupName)

  // SHA 锁定：源自读取后未变化才写回
  const nowBytes = new Uint8Array(fs.readFileSync(gilPath))
  if (sha256Bytes(nowBytes) !== sourceHash) {
    throw new Error('源 .gil 自读取后已变化，中止写回（请重试）')
  }

  // 备份 + 写回
  const backupDir = path.join(saveLevelDir, '.gsts', 'backups')
  fs.mkdirSync(backupDir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupPath = path.join(backupDir, `${mapId}.gil.${stamp}.library-inject.bak`)
  fs.copyFileSync(gilPath, backupPath)
  fs.writeFileSync(gilPath, candidate)

  // 写后回读 hash 一致
  const after = new Uint8Array(fs.readFileSync(gilPath))
  if (sha256Bytes(after) !== sha256Bytes(candidate)) {
    throw new Error('写回后回读 hash 不一致')
  }

  // Temp 同步（编辑器列表可见）
  try {
    resyncMap(saveLevelDir, mapId)
  } catch {
    // best-effort
  }

  // 从 plan 提取每个资产的容器 ID（素材索引 ID）
  const results: LibraryInjectResult[] = plan.assets.map((a) => ({
    name: a.name,
    containerId: a.topId,
    copyId: a.copyId,
    groupIds: a.topGroupIds
  }))
  return { mapId, gilPath, backup: backupPath, results, errors: [] }
}

/** POST /api/maps/inject-library: 把资产写入地图素材库。 */
function handleMapInjectLibrary(req: IncomingMessage, res: ServerResponse, dir: string): Promise<void> {
  return parseBody(req).then((body) => {
    const mapId = typeof body.mapId === 'number' ? body.mapId : Number(body.mapId)
    if (!Number.isSafeInteger(mapId) || mapId <= 0) {
      sendError(res, 400, 'mapId 必须是正整数（目标地图 ID）')
      return
    }
    const groupName = typeof body.groupName === 'string' && body.groupName.trim() !== ''
      ? body.groupName.trim()
      : '图片'

    // 两种输入：① names[]（资产库文件名）② scene（画布直接写，name 必填）
    const names = Array.isArray(body.names) ? body.names.filter((n) => typeof n === 'string') : []
    const scene = typeof body.scene === 'object' && body.scene !== null ? body.scene as SceneDocumentModel : null

    const assets: CssAsset[] = []
    const errors: Array<{ name: string; error: string }> = []

    if (names.length > 0) {
      for (const raw of names) {
        const name = path.basename(raw)
        if (!name.toLowerCase().endsWith('.css')) {
          errors.push({ name, error: '仅支持 .css 资产（素材库注入走 CSS 图元语法）' })
          continue
        }
        const fullPath = path.join(dir, name)
        if (!fs.existsSync(fullPath)) {
          errors.push({ name, error: '资产文件不存在' })
          continue
        }
        try {
          const css = fs.readFileSync(fullPath, 'utf-8')
          assets.push(parseCssAsset(css, name.replace(/\.css$/i, '')))
        } catch (error) {
          errors.push({ name, error: error instanceof Error ? error.message : String(error) })
        }
      }
    } else if (scene) {
      const name = typeof body.name === 'string' && body.name.trim() !== ''
        ? body.name.trim()
        : '画布素材'
      try {
        const css = sceneToCss(scene)
        assets.push(parseCssAsset(css, name))
      } catch (error) {
        errors.push({ name, error: error instanceof Error ? error.message : String(error) })
      }
    } else {
      sendError(res, 400, '需要 names[]（资产文件名）或 scene（画布内容）')
      return
    }

    if (assets.length === 0) {
      sendJson(res, 200, { ok: false, mapId, results: [], errors })
      return
    }

    try {
      const outcome = injectLibraryToMap(mapId, assets, groupName)
      sendJson(res, 200, {
        ok: true,
        mapId: outcome.mapId,
        gilPath: outcome.gilPath,
        backup: outcome.backup,
        results: outcome.results,
        errors: [...errors, ...outcome.errors],
        message:
          `已写入地图 ${mapId} 素材库（${outcome.results.length} 个素材）。` +
          '容器 ID = 素材索引 ID，可被节点图引用。游戏内重载地图后素材库可见。'
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      sendError(res, 500, `写入地图失败: ${message}`)
    }
  })
}

/** List every .gia in Beyond_Local_Export with its group name + resources. */
function handleImportedList(res: ServerResponse): void {
  const exportDir = resolveBeyondLocalExportDir()
  if (!exportDir) {
    sendError(res, 400, '未找到 Beyond_Local_Export 目录')
    return
  }
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(exportDir, { withFileTypes: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    sendError(res, 500, `读取目录失败: ${message}`)
    return
  }
  const items: Array<{ fileName: string; path: string; size: number; inventory: ImageGiaInventory }> = []
  const errors: Array<{ fileName: string; error: string }> = []
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.gia')) continue
    const fullPath = path.join(exportDir, entry.name)
    try {
      const stat = fs.statSync(fullPath)
      const bytes = fs.readFileSync(fullPath)
      items.push({
        fileName: entry.name,
        path: fullPath,
        size: stat.size,
        inventory: parseImageGiaInventory(new Uint8Array(bytes))
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      errors.push({ fileName: entry.name, error: message })
    }
  }
  items.sort((a, b) => a.fileName.localeCompare(b.fileName))
  sendJson(res, 200, { dir: exportDir, count: items.length, items, errors })
}

function serveIndex(res: ServerResponse): void {
  const indexPath = path.resolve(__dirname, 'web/index.html')
  try {
    const html = fs.readFileSync(indexPath, 'utf-8')
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    res.end(html)
  } catch {
    sendError(res, 500, '前端资源缺失：请先 npm run build（postbuild 会复制 web/index.html）')
  }
}

export function startImageServer(options: ImageServerOptions = {}): ReturnType<typeof createServer> {
  const port = options.port ?? 8510
  const host = options.host ?? '127.0.0.1'
  const assetsDir = resolveAssetsDir(options)

  const server = createServer((req, res) => {
    const url = (req.url ?? '/').split('?')[0]
    if (req.method === 'GET' && (url === '/' || url === '/index.html')) {
      serveIndex(res)
      return
    }
    if (req.method === 'GET' && url === '/api/assets') {
      handleAssetsList(res, assetsDir)
      return
    }
    if (req.method === 'GET' && url === '/api/assets/imported') {
      handleImportedList(res)
      return
    }
    if (req.method === 'GET' && url === '/api/games') {
      handleGamesList(res)
      return
    }
    if (req.method === 'GET' && url === '/api/maps') {
      handleMapsList(res)
      return
    }
    if (req.method === 'POST' && url === '/api/maps/inject-library') {
      void handleMapInjectLibrary(req, res, assetsDir)
      return
    }
    if (req.method === 'POST' && url === '/api/assets/save') {
      void handleAssetSave(req, res, assetsDir)
      return
    }
    if (req.method === 'POST' && url === '/api/assets/inject-batch') {
      void handleInjectBatch(req, res, assetsDir)
      return
    }
    if (req.method === 'DELETE' && url === '/api/assets') {
      handleAssetDelete(req, res, assetsDir)
      return
    }
    if (req.method === 'POST' && url === '/api/import') {
      void handleImport(req, res)
      return
    }
    if (req.method === 'POST' && url === '/api/export') {
      void handleExport(req, res)
      return
    }
    if (req.method === 'POST' && url === '/api/export-gia') {
      void handleExportGia(req, res)
      return
    }
    if (req.method === 'POST' && url === '/api/inject') {
      void handleInject(req, res)
      return
    }
    sendError(res, 404, 'Not found')
  })

  server.listen(port, host, () => {
    console.log(`[image:serve] 图片编辑器 Web UI: http://${host}:${port}`)
    console.log(`[image:serve] 资产库目录: ${assetsDir}（写入此目录的文件会自动出现在网页资产库）`)
    console.log('[image:serve] Ctrl+C 停止服务')
  })
  return server
}
