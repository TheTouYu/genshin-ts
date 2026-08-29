import { readVarint } from './binary.js'
import type { FolderEntry, FolderIndex, FolderMetaList, LenField } from './types.js'

export const DEFAULT_GRAPH_TYPE_VALUES = new Map<number, number>([
  [20000, 800],
  [20001, 2100],
  [20002, 2200],
  [20003, 2300],
  [20004, 2400],
  [20005, 4300],
  [20006, 6300],
  [20007, 6600],
  [20008, 6700],
  [20009, 6800],
  [20010, 7400]
])
const DEFAULT_VALUE_TO_GRAPH_TYPE = new Map<number, number>(
  [...DEFAULT_GRAPH_TYPE_VALUES.entries()].map(([type, value]) => [value, type])
)

export function parseFolderEntry(buf: Uint8Array): FolderEntry {
  const entry: FolderEntry = {}
  let innerOffset = 0
  while (innerOffset < buf.length) {
    const k = readVarint(buf, innerOffset)
    if (!k) break
    const v = k.value
    innerOffset = k.next
    const f = v >> 3
    const w = v & 7
    if (w !== 0) break
    const val = readVarint(buf, innerOffset)
    if (!val) break
    innerOffset = val.next
    if (f === 1) entry.typeValue = val.value
    if (f === 2) entry.id = val.value
  }
  return entry
}

function parseFolderContent(buf: Uint8Array): { name?: string; entries: FolderEntry[] } {
  let offset = 0
  let name: string | undefined
  const entries: FolderEntry[] = []
  while (offset < buf.length) {
    const key = readVarint(buf, offset)
    if (!key) break
    const keyVal = key.value
    offset = key.next
    const field = keyVal >> 3
    const wire = keyVal & 7
    if (wire === 0) {
      const v = readVarint(buf, offset)
      if (!v) break
      offset = v.next
      continue
    }
    if (wire !== 2) break
    const lenVar = readVarint(buf, offset)
    if (!lenVar) break
    const len = lenVar.value
    const dataStart = lenVar.next
    const dataEnd = dataStart + len
    const data = buf.subarray(dataStart, dataEnd)
    offset = dataEnd

    if (field === 1) {
      try {
        name = Buffer.from(data).toString('utf8')
      } catch {
        // ignore
      }
      continue
    }
    if (field !== 5) continue

    entries.push(parseFolderEntry(data))
  }
  return { name, entries }
}

function parseMetaList(buf: Uint8Array): FolderMetaList {
  let offset = 0
  let name: string | undefined
  const entries: FolderEntry[] = []
  while (offset < buf.length) {
    const key = readVarint(buf, offset)
    if (!key) break
    const keyVal = key.value
    offset = key.next
    const field = keyVal >> 3
    const wire = keyVal & 7
    if (wire === 0) {
      const v = readVarint(buf, offset)
      if (!v) break
      offset = v.next
      continue
    }
    if (wire !== 2) break
    const lenVar = readVarint(buf, offset)
    if (!lenVar) break
    const len = lenVar.value
    const dataStart = lenVar.next
    const dataEnd = dataStart + len
    const data = buf.subarray(dataStart, dataEnd)
    offset = dataEnd

    if (field === 1) {
      try {
        name = Buffer.from(data).toString('utf8')
      } catch {
        // ignore
      }
      continue
    }
    if (field !== 5) continue

    entries.push(parseFolderEntry(data))
  }
  return { name, entries }
}

function parseFolderId(buf: Uint8Array): number | undefined {
  let offset = 0
  while (offset < buf.length) {
    const key = readVarint(buf, offset)
    if (!key) return undefined
    offset = key.next
    const field = key.value >> 3
    const wire = key.value & 7
    if (wire === 0) {
      const v = readVarint(buf, offset)
      if (!v) return undefined
      offset = v.next
      if (field === 1) return v.value
      continue
    }
    if (wire === 1) {
      offset += 8
      continue
    }
    if (wire === 2) {
      const lenVar = readVarint(buf, offset)
      if (!lenVar) return undefined
      offset = lenVar.next + lenVar.value
      continue
    }
    if (wire === 5) {
      offset += 4
      continue
    }
    return undefined
  }
  return undefined
}

export function collectFolderIndexes(payload: Uint8Array, fields: LenField[]): FolderIndex[] {
  const folderEntries: LenField[] = []
  const contentFields: LenField[] = []
  const metaFields: LenField[] = []

  // 单次遍历收集相关字段，避免多次 filter/find + path.join('.') 分配
  for (const f of fields) {
    if (f.depth < 2 || f.p0 !== 6 || f.p1 !== 1) continue
    if (f.depth === 2)
      folderEntries.push(f) // 6.1
    else if (f.depth === 3 && f.p2 === 3)
      contentFields.push(f) // 6.1.3
    else if (f.depth === 4 && f.p2 === 2 && f.p3 === 4) metaFields.push(f) // 6.1.2.4
  }

  folderEntries.sort((a, b) => a.dataStart - b.dataStart)
  contentFields.sort((a, b) => a.dataStart - b.dataStart)
  metaFields.sort((a, b) => a.dataStart - b.dataStart)

  const indexes: FolderIndex[] = []
  let contentIdx = 0
  let metaIdx = 0
  for (const entryField of folderEntries) {
    const entryBytes = payload.subarray(entryField.dataStart, entryField.dataEnd)
    const folderId = parseFolderId(entryBytes)

    while (
      contentIdx < contentFields.length &&
      contentFields[contentIdx].dataEnd <= entryField.dataStart
    ) {
      contentIdx++
    }
    let contentField: LenField | undefined
    for (let i = contentIdx; i < contentFields.length; i++) {
      const f = contentFields[i]
      if (f.dataStart >= entryField.dataEnd) break
      if (f.dataStart >= entryField.dataStart && f.dataEnd <= entryField.dataEnd) {
        contentField = f
        break
      }
    }
    const contentEntries: FolderEntry[] = []
    let contentName: string | undefined
    if (contentField) {
      const parsed = parseFolderContent(
        payload.subarray(contentField.dataStart, contentField.dataEnd)
      )
      contentName = parsed.name
      contentEntries.push(...parsed.entries)
    }

    while (metaIdx < metaFields.length && metaFields[metaIdx].dataEnd <= entryField.dataStart) {
      metaIdx++
    }
    const metaLists: Array<{ field: LenField; list: FolderMetaList }> = []
    for (let i = metaIdx; i < metaFields.length; i++) {
      const f = metaFields[i]
      if (f.dataStart >= entryField.dataEnd) break
      if (f.dataStart >= entryField.dataStart && f.dataEnd <= entryField.dataEnd) {
        metaLists.push({ field: f, list: parseMetaList(payload.subarray(f.dataStart, f.dataEnd)) })
      }
    }

    indexes.push({
      entryField,
      folderId,
      contentField,
      contentName,
      contentEntries,
      metaLists
    })
  }
  return indexes
}

export function findFolderEntryField(
  payload: Uint8Array,
  fields: LenField[],
  targetId: number
): { field: LenField; entry: FolderEntry } | undefined {
  const matches: Array<{ field: LenField; entry: FolderEntry }> = []
  const contentMatches: Array<{ field: LenField; entry: FolderEntry }> = []
  const metaMatches: Array<{ field: LenField; entry: FolderEntry }> = []
  for (const f of fields) {
    const isContentEntry = f.depth === 4 && f.p0 === 6 && f.p1 === 1 && f.p2 === 3 && f.p3 === 5
    const isMetaEntry =
      f.depth === 5 && f.p0 === 6 && f.p1 === 1 && f.p2 === 2 && f.p3 === 4 && f.p4 === 5
    if (!isContentEntry && !isMetaEntry) continue
    const entry = parseFolderEntry(payload.subarray(f.dataStart, f.dataEnd))
    if (entry.id === targetId) {
      const record = { field: f, entry }
      matches.push(record)
      if (isContentEntry) {
        contentMatches.push(record)
      } else if (isMetaEntry) {
        metaMatches.push(record)
      }
    }
  }
  if (matches.length > 1) {
    if (contentMatches.length === 1) {
      return contentMatches[0]
    }
    throw new Error(
      `[error] multiple folder entries found for target id (content=${contentMatches.length}, meta=${metaMatches.length})`
    )
  }
  return matches[0]
}

export function resolveGraphTypeForTypeValue(
  typeValue: number | undefined,
  folders: FolderIndex[],
  idToType: Map<number, number>,
  fallback: Map<number, number> = DEFAULT_VALUE_TO_GRAPH_TYPE
): number {
  if (typeof typeValue !== 'number') {
    throw new Error('[error] NodeGraph category value is missing; cannot resolve graph type')
  }
  const values = new Set<number>()
  for (const folder of folders) {
    for (const entry of folder.contentEntries) {
      if (entry.id === undefined || entry.typeValue !== typeValue) continue
      const type = idToType.get(entry.id)
      if (type !== undefined) values.add(type)
    }
  }
  if (values.size === 1) return [...values][0]
  const fallbackValue = fallback.get(typeValue)
  if (fallbackValue !== undefined) return fallbackValue
  if (values.size === 0) {
    throw new Error(`[error] no graph type mapping for category value ${typeValue}`)
  }
  throw new Error(`[error] conflicting graph type mapping for category value ${typeValue}`)
}
