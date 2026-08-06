import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import { buildFile, readUint32BE } from '../injector/binary.js'
import { decodeUtf8, readGilPayloadFields } from './gil_extract_utils.js'
import { buildEmptyNodeGraph, nextGraphId } from './assets_node_graphs.js'
import { emitWireMessage, parseWireMessage, printableWireText, type WireField } from './static_assembly/wire.js'

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

// 地图注册表 Beyond_Local_Save_Player.gip（真实编辑器观察，map-name exp1 轮 6）：
//   顶层 {1: 页签树, 2[*]: 地图条目{1:ID, 2:名字UTF-8, 3:时间戳秒}, 3: 最近地图, 4: 未知}
//   页签树内“未分类页签”容器 {1:"未分类页签", 3:2, 5[*]: {1:1600, 2:图ID}}
//   编辑器列表读 .gip，不扫描目录；新 .gil 不注册则列表不可见
const GIP_FILENAME = 'Beyond_Local_Save_Player.gip'
const GIP_FOLDER_TYPE = 1600 // “未分类页签” typeValue

function gipPathOf(saveLevelDir: string): string {
  return path.join(saveLevelDir, '..', GIP_FILENAME)
}

function readGipPayload(gipPath: string): Uint8Array {
  const bytes = new Uint8Array(fs.readFileSync(gipPath))
  return bytes.slice(20, -4)
}

function writeGip(gipPath: string, payload: Uint8Array) {
  const bytes = new Uint8Array(fs.readFileSync(gipPath))
  const header = {
    schema: readUint32BE(bytes, 4),
    headTag: readUint32BE(bytes, 8),
    fileType: readUint32BE(bytes, 12),
    tailTag: readUint32BE(bytes, bytes.length - 4)
  }
  fs.writeFileSync(gipPath, buildFile(payload, header))
}

function gipMapEntry(mapId: number, name: string, nowSec: number): WireField[] {
  return [
    { number: 1, wire: 0, value: mapId },
    { number: 2, wire: 2, value: new TextEncoder().encode(name) },
    { number: 3, wire: 0, value: nowSec }
  ]
}

// 在“未分类页签”容器内追加 {5: {1:1600, 2:图ID}}
function appendGipFolderLink(tabTree: WireField[], mapId: number): WireField[] {
  return tabTree.map((tab) => {
    if (tab.number !== 3 || tab.wire !== 2) return tab
    const tabMsg = parseWireMessage(tab.value as Uint8Array)
    if (!tabMsg || printableWireText(tabMsg.find((f) => f.number === 1 && f.wire === 2)?.value as Uint8Array) !== '未分类页签') {
      return tab
    }
    const link = emitWireMessage([
      { number: 1, wire: 0, value: GIP_FOLDER_TYPE },
      { number: 2, wire: 0, value: mapId }
    ])
    return { ...tab, value: emitWireMessage([...tabMsg, { number: 5, wire: 2, value: link }]) }
  })
}

// 注册新图到 .gip（追加顶层条目 + 页签链接）；.gip 不存在时跳过（warn）
function gipRegister(
  saveLevelDir: string,
  mapId: number,
  name: string,
  warn: (message: string) => void
): void {
  const gipPath = gipPathOf(saveLevelDir)
  if (!fs.existsSync(gipPath)) {
    warn(`skip .gip register (missing): ${gipPath}`)
    return
  }
  const root = parseWireMessage(readGipPayload(gipPath))
  if (!root) throw new Error(`[error] malformed .gip payload: ${gipPath}`)
  const updated = root.map((field) => {
    if (field.number !== 1 || field.wire !== 2) return field
    const tabTree = parseWireMessage(field.value as Uint8Array)
    if (!tabTree) return field
    return { ...field, value: emitWireMessage(appendGipFolderLink(tabTree, mapId)) }
  })
  const nowSec = Math.floor(Date.now() / 1000)
  writeGip(gipPath, emitWireMessage([...updated, { number: 2, wire: 2, value: emitWireMessage(gipMapEntry(mapId, name, nowSec)) }]))
}

// 更新 .gip 中地图条目名字（编辑器列表同步显示新名）；.gip 不存在时跳过
function gipRename(
  saveLevelDir: string,
  mapId: number,
  newName: string,
  warn: (message: string) => void
): void {
  const gipPath = gipPathOf(saveLevelDir)
  if (!fs.existsSync(gipPath)) {
    warn(`skip .gip rename (missing): ${gipPath}`)
    return
  }
  const root = parseWireMessage(readGipPayload(gipPath))
  if (!root) throw new Error(`[error] malformed .gip payload: ${gipPath}`)
  let found = false
  const updated = root.map((field) => {
    if (field.number !== 2 || field.wire !== 2) return field
    const entry = parseWireMessage(field.value as Uint8Array)
    if (!entry) return field
    const id = entry.find((f) => f.number === 1 && f.wire === 0)?.value
    if (typeof id !== 'number' || id !== mapId) return field
    found = true
    return {
      ...field,
      value: emitWireMessage(
        entry.map((f) =>
          f.number === 2 && f.wire === 2
            ? { ...f, value: new TextEncoder().encode(newName) }
            : f
        )
      )
    }
  })
  if (!found) {
    warn(`map ${mapId} not registered in .gip; editor list may keep old name`)
  }
  writeGip(gipPath, emitWireMessage(updated))
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
  gipRename(saveLevelDir, mapId, newName, warn)
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
  graphs: { graphId: number; name: string }[]
}

// 新建地图骨架（真实编辑器观察，map-name exp1 轮 4/5）：
//   root 1=地图ID、2=名字 UTF-8、34=1、39=账号ID（BeyondLocal 数字目录）、40=创建时间戳秒、41=1
//   header：schema 1 / headTag 0x0326 / fileType 2 / tailTag 0x0679
const FIRST_MAP_ID = 1073741825 // 图 ID 起点（gil-structure-semantics.md 自由新建节）

export function createMap(
  saveLevelDir: string,
  name: string,
  dependencies: ListMapsDependencies & { graphs?: string[] } = {}
): CreateMapResult {
  const warn = dependencies.warn ?? (() => {})
  const graphNames = dependencies.graphs ?? []
  for (const graphName of graphNames) {
    if (!graphName.trim()) throw new Error('[error] --graphs contains an empty name')
  }
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
  const header = { schema: 1, headTag: 0x0326, fileType: 2, tailTag: 0x0679 }
  let file = buildFile(payload, header)

  const graphs: CreateMapResult['graphs'] = []
  if (graphNames.length > 0) {
    // 骨架没有 root 6/10：buildEmptyNodeGraph 会自动补最小挂载容器，再逐个追加占位节点图
    // 节点图 ID 自动分配：空地图从固定起始值 1073741825 起递增（nextGraphId），名字 = 传入名字
    let nextPayload = payload
    for (const graphName of graphNames) {
      const graphId = nextGraphId(nextPayload)
      nextPayload = buildEmptyNodeGraph(nextPayload, graphId, graphName)
      graphs.push({ graphId, name: graphName })
    }
    file = buildFile(nextPayload, header)
  }

  fs.writeFileSync(gilPath, file)
  warn(`created=${gilPath}`)
  gipRegister(saveLevelDir, nextId, name, warn)
  return {
    mapId: nextId,
    gilPath,
    name,
    size: file.length,
    sha256: createHash('sha256').update(file).digest('hex'),
    graphs
  }
}
