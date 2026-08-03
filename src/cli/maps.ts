import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import { buildFile, readUint32BE } from '../injector/binary.js'
import { decodeUtf8, readGilPayloadFields } from './gil_extract_utils.js'
import { emitWireMessage, parseWireMessage } from './static_assembly/wire.js'

export type MapsResultV1 = {
  schemaVersion: 1
  kind: 'gsts.maps'
  maps: readonly {
    mapId: number
    name?: string
    modifiedAt: string
    modifiedAtMs: number
    size: number
    recent: boolean
    sha256?: string
    locator: { kind: 'mapId'; mapId: number }
  }[]
}

export type ListMapsOptions = { includeHash?: boolean; includeName?: boolean }

export type ListMapsDependencies = {
  readdir?: typeof fs.readdirSync
  stat?: typeof fs.statSync
  readFile?: typeof fs.readFileSync
  now?: () => number
  warn?: (message: string) => void
}

export function listMaps(
  saveLevelDir: string,
  options: ListMapsOptions = {},
  dependencies: ListMapsDependencies = {}
): MapsResultV1 {
  const readdir = dependencies.readdir ?? fs.readdirSync
  const stat = dependencies.stat ?? fs.statSync
  const readFile = dependencies.readFile ?? fs.readFileSync
  const now = (dependencies.now ?? Date.now)()
  const warn = dependencies.warn ?? (() => {})
  const maps = readdir(saveLevelDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.gil'))
    .flatMap((entry) => {
      const rawId = entry.name.replace(/\.gil$/i, '')
      const mapId = Number(rawId)
      if (!/^\d+$/.test(rawId) || !Number.isSafeInteger(mapId) || mapId < 0) {
        warn(`skipping invalid map filename: ${entry.name}`)
        return []
      }
      const fullPath = path.join(saveLevelDir, entry.name)
      const metadata = stat(fullPath)
      return [
        {
          mapId,
          ...(options.includeName ? { name: readMapName(fullPath, warn) } : {}),
          modifiedAt: new Date(metadata.mtimeMs).toISOString(),
          modifiedAtMs: metadata.mtimeMs,
          size: metadata.size,
          recent: now - metadata.mtimeMs <= 30 * 60 * 1000,
          ...(options.includeHash
            ? { sha256: createHash('sha256').update(readFile(fullPath)).digest('hex') }
            : {}),
          locator: { kind: 'mapId' as const, mapId }
        }
      ]
    })
    .sort((a, b) => b.modifiedAtMs - a.modifiedAtMs || a.mapId - b.mapId)
  return { schemaVersion: 1, kind: 'gsts.maps', maps }
}

// 关卡图名字 = GIL payload root 2（UTF-8，见 docs/game-engine-knowledge/gil-structure-semantics.md）
function readMapName(gilPath: string, warn: (message: string) => void): string | undefined {
  try {
    const { payload, fields } = readGilPayloadFields(gilPath)
    const name = fields.find((field) => field.p0 === 2 && field.depth === 1)
    return name ? decodeUtf8(payload.subarray(name.dataStart, name.dataEnd)) : undefined
  } catch {
    warn(`skipping unreadable map name: ${path.basename(gilPath)}`)
    return undefined
  }
}

export type RenameMapResult = {
  mapId: number
  gilPath: string
  oldName?: string
  newName: string
  backupPath?: string
  size: number
  sha256: string
}

export function renameMap(
  saveLevelDir: string,
  mapId: number,
  newName: string,
  dependencies: ListMapsDependencies = {}
): RenameMapResult {
  const warn = dependencies.warn ?? (() => {})
  const gilPath = path.join(saveLevelDir, `${mapId}.gil`)
  const sourceBytes = new Uint8Array(fs.readFileSync(gilPath))
  const sourceSha = createHash('sha256').update(sourceBytes).digest('hex')
  const { payload, fields } = readGilPayloadFields(gilPath)
  const nameField = fields.find((field) => field.p0 === 2 && field.depth === 1)
  if (!nameField) {
    throw new Error(`[error] map ${mapId} has no name field (root 2)`)
  }
  const oldName = decodeUtf8(payload.subarray(nameField.dataStart, nameField.dataEnd))
  const root = parseWireMessage(payload)
  if (!root) throw new Error(`[error] malformed GIL payload: ${gilPath}`)
  const renamed = root.map((field) =>
    field.number === 2 && field.wire === 2
      ? { ...field, value: new TextEncoder().encode(newName) }
      : field
  )
  const newPayload = emitWireMessage(renamed)
  const header = {
    schema: readUint32BE(sourceBytes, 4),
    headTag: readUint32BE(sourceBytes, 8),
    fileType: readUint32BE(sourceBytes, 12),
    tailTag: readUint32BE(sourceBytes, sourceBytes.length - 4)
  }
  const newFile = buildFile(newPayload, header)
  const nowSha = createHash('sha256').update(new Uint8Array(fs.readFileSync(gilPath))).digest('hex')
  if (nowSha !== sourceSha) {
    throw new Error('[error] source GIL changed since read; aborting rename')
  }
  const backupDir = path.join(saveLevelDir, '.gsts', 'backups')
  fs.mkdirSync(backupDir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupPath = path.join(backupDir, `${mapId}.gil.${stamp}.rename.bak`)
  fs.copyFileSync(gilPath, backupPath)
  fs.writeFileSync(gilPath, newFile)
  warn(`backup=${backupPath}`)
  return {
    mapId,
    gilPath,
    oldName,
    newName,
    backupPath,
    size: newFile.length,
    sha256: createHash('sha256').update(newFile).digest('hex')
  }
}

export type CreateMapResult = {
  mapId: number
  gilPath: string
  name: string
  size: number
  sha256: string
}

// 新建地图骨架（真实编辑器观察，map-name exp1 轮 4/5）：
//   root 1=地图ID、2=名字 UTF-8、34=1、39=账号ID（BeyondLocal 数字目录）、40=创建时间戳秒、41=1
//   header：schema 1 / headTag 0x0326 / fileType 2 / tailTag 0x0679
const FIRST_MAP_ID = 1073741825 // 图 ID 起点（gil-structure-semantics.md 自由新建节）

export function createMap(
  saveLevelDir: string,
  name: string,
  dependencies: ListMapsDependencies = {}
): CreateMapResult {
  const warn = dependencies.warn ?? (() => {})
  const existing = listMaps(saveLevelDir, {}, dependencies).maps
  const nextId = existing.length
    ? Math.max(...existing.map((map) => map.mapId)) + 1
    : FIRST_MAP_ID
  const gilPath = path.join(saveLevelDir, `${nextId}.gil`)
  if (fs.existsSync(gilPath)) {
    throw new Error(`[error] target map file already exists: ${gilPath}`)
  }
  const playerIdDir = path.basename(path.dirname(saveLevelDir))
  const playerId = Number(playerIdDir)
  if (!/^\d+$/.test(playerIdDir) || !Number.isSafeInteger(playerId)) {
    throw new Error(
      `[error] cannot determine player account id from save level parent dir: ${playerIdDir}`
    )
  }
  const payload = emitWireMessage([
    { number: 1, wire: 0, value: nextId },
    { number: 2, wire: 2, value: new TextEncoder().encode(name) },
    { number: 34, wire: 0, value: 1 },
    { number: 39, wire: 0, value: playerId },
    { number: 40, wire: 0, value: Math.floor(Date.now() / 1000) },
    { number: 41, wire: 0, value: 1 }
  ])
  const file = buildFile(payload, { schema: 1, headTag: 0x0326, fileType: 2, tailTag: 0x0679 })
  fs.writeFileSync(gilPath, file)
  warn(`created=${gilPath}`)
  return {
    mapId: nextId,
    gilPath,
    name,
    size: file.length,
    sha256: createHash('sha256').update(file).digest('hex')
  }
}
