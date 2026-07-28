import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

export type MapsResultV1 = {
  schemaVersion: 1
  kind: 'gsts.maps'
  maps: readonly {
    mapId: number
    modifiedAt: string
    modifiedAtMs: number
    size: number
    recent: boolean
    sha256?: string
    locator: { kind: 'mapId'; mapId: number }
  }[]
}

export type ListMapsDependencies = {
  readdir?: typeof fs.readdirSync
  stat?: typeof fs.statSync
  readFile?: typeof fs.readFileSync
  now?: () => number
  warn?: (message: string) => void
}

export function listMaps(
  saveLevelDir: string,
  options: { includeHash?: boolean } = {},
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
