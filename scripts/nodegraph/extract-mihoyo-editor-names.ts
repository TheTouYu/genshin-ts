import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

type WireField =
  | { field: number; wire: 0; value: bigint }
  | { field: number; wire: 1; bytes: Uint8Array }
  | { field: number; wire: 2; bytes: Uint8Array }
  | { field: number; wire: 5; bytes: Uint8Array }

type TextMaps = {
  zh: Map<number, string | undefined>
  en: Map<number, string | undefined>
}

type LocalizedName = {
  nameHash?: number
  nameZh?: string
  nameEn?: string
}

const DEFAULT_NODE_ROOT =
  'D:\\Genshin Impact\\Genshin Impact Game\\BeyondAssets\\BeyondAssistEditor\\Resource\\Json\\Beyond\\Node'
const OUTPUT_PATH = 'resources/mihoyo_editor_names.json'
const XOR_KEY = 0xe5

const PIN_GROUPS = [
  { field: 100, kind: 'in_flow' },
  { field: 101, kind: 'out_flow' },
  { field: 102, kind: 'input' },
  { field: 103, kind: 'output' },
  { field: 106, kind: 'client_exec' },
  { field: 107, kind: 'client_signal' }
] as const

function readVarint(buffer: Uint8Array, start: number) {
  let value = 0n
  let shift = 0n
  let offset = start
  while (offset < buffer.length && shift < 70n) {
    const byte = buffer[offset++]
    value |= BigInt(byte & 0x7f) << shift
    if ((byte & 0x80) === 0) return { value, offset }
    shift += 7n
  }
  throw new Error(`[error] invalid protobuf varint at offset ${start}`)
}

function parseMessage(buffer: Uint8Array): WireField[] {
  const fields: WireField[] = []
  let offset = 0
  while (offset < buffer.length) {
    const key = readVarint(buffer, offset)
    offset = key.offset
    const field = Number(key.value >> 3n)
    const wire = Number(key.value & 7n)
    if (wire === 0) {
      const result = readVarint(buffer, offset)
      fields.push({ field, wire, value: result.value })
      offset = result.offset
      continue
    }
    if (wire === 1 || wire === 5) {
      const length = wire === 1 ? 8 : 4
      const end = offset + length
      if (end > buffer.length) throw new Error(`[error] truncated protobuf field ${field}`)
      fields.push({ field, wire, bytes: buffer.slice(offset, end) })
      offset = end
      continue
    }
    if (wire !== 2) throw new Error(`[error] unsupported protobuf wire type ${wire}`)
    const length = readVarint(buffer, offset)
    offset = length.offset
    const end = offset + Number(length.value)
    if (end > buffer.length) throw new Error(`[error] truncated protobuf field ${field}`)
    fields.push({ field, wire, bytes: buffer.slice(offset, end) })
    offset = end
  }
  return fields
}

function numberField(fields: WireField[], field: number): number | undefined {
  const value = fields.find(
    (item): item is Extract<WireField, { wire: 0 }> => item.field === field && item.wire === 0
  )?.value
  if (value === undefined) return undefined
  const number = Number(value)
  if (!Number.isSafeInteger(number)) throw new Error(`[error] field ${field} exceeds safe integer`)
  return number
}

function bytesField(fields: WireField[], field: number): Uint8Array | undefined {
  return fields.find(
    (item): item is Extract<WireField, { wire: 2 }> => item.field === field && item.wire === 2
  )?.bytes
}

function messageField(fields: WireField[], field: number): WireField[] {
  const bytes = bytesField(fields, field)
  return bytes ? parseMessage(bytes) : []
}

function repeatedMessages(fields: WireField[], field: number): WireField[][] {
  return fields
    .filter(
      (item): item is Extract<WireField, { wire: 2 }> => item.field === field && item.wire === 2
    )
    .map((item) => parseMessage(item.bytes))
}

function stringField(fields: WireField[], field: number): string | undefined {
  const bytes = bytesField(fields, field)
  return bytes ? new TextDecoder().decode(bytes) : undefined
}

function decodeMihoyoBin(filePath: string) {
  const raw = fs.readFileSync(filePath)
  return {
    raw,
    decoded: Uint8Array.from(raw, (byte) => byte ^ XOR_KEY)
  }
}

function readTextMap(filePath: string) {
  const { raw, decoded } = decodeMihoyoBin(filePath)
  const texts = new Map<number, string | undefined>()
  for (const entry of repeatedMessages(parseMessage(decoded), 2)) {
    const hash = numberField(entry, 2)
    const text = stringField(entry, 3)
    if (hash === undefined) throw new Error(`[error] TextMap entry has no hash: ${filePath}`)
    if (texts.has(hash)) throw new Error(`[error] duplicate TextMap hash ${hash}: ${filePath}`)
    texts.set(hash, text)
  }
  return { texts, sha256: sha256(raw) }
}

function localizedName(hash: number | undefined, maps: TextMaps): LocalizedName {
  if (hash === undefined) return {}
  const nameZh = maps.zh.get(hash)
  const nameEn = maps.en.get(hash)
  return {
    nameHash: hash,
    ...(nameZh !== undefined ? { nameZh } : {}),
    ...(nameEn !== undefined ? { nameEn } : {})
  }
}

function genericIdFromNode(fields: WireField[]) {
  const genericId = numberField(messageField(messageField(fields, 4), 1), 5)
  if (genericId === undefined) throw new Error('[error] Node metadata has no generic id')
  return genericId
}

function uniqueMihoyoBin(dir: string, label: string) {
  if (!fs.existsSync(dir)) throw new Error(`[error] ${label} directory not found: ${dir}`)
  const files = fs
    .readdirSync(dir)
    .filter((name) => name.toLowerCase().endsWith('.mihoyobin'))
    .sort()
  if (files.length !== 1) {
    throw new Error(
      `[error] expected exactly one ${label} .mihoyobin in ${dir}, found ${files.length}`
    )
  }
  return path.join(dir, files[0])
}

function sha256(bytes: Uint8Array | string) {
  return crypto.createHash('sha256').update(bytes).digest('hex')
}

function main() {
  const nodeRoot = path.resolve(
    process.argv[2] ?? process.env.BEYOND_EDITOR_NODE_ROOT ?? DEFAULT_NODE_ROOT
  )
  if (!fs.existsSync(nodeRoot)) {
    throw new Error(
      `[error] BeyondEditor Node directory not found: ${nodeRoot}\n` +
        'Pass it as the first argument or set BEYOND_EDITOR_NODE_ROOT.'
    )
  }

  const jsonRoot = path.resolve(nodeRoot, '..', '..')
  const chsTextMapPath = path.resolve(
    process.env.BEYOND_EDITOR_CHS_TEXT_MAP ??
      uniqueMihoyoBin(path.join(jsonRoot, 'TextMap', 'CHS'), 'CHS TextMap')
  )
  const enTextMapPath = path.resolve(
    process.env.BEYOND_EDITOR_EN_TEXT_MAP ??
      uniqueMihoyoBin(path.join(jsonRoot, 'TextMap', 'EN'), 'EN TextMap')
  )
  const beyondGlobalPath = path.resolve(
    process.env.BEYOND_EDITOR_GLOBAL ??
      uniqueMihoyoBin(path.join(jsonRoot, 'Beyond', 'BeyondGlobal'), 'BeyondGlobal')
  )

  const zh = readTextMap(chsTextMapPath)
  const en = readTextMap(enTextMapPath)
  const maps: TextMaps = { zh: zh.texts, en: en.texts }

  const nodeFiles = fs
    .readdirSync(nodeRoot)
    .filter((name) => name.toLowerCase().endsWith('.mihoyobin'))
    .sort()
  const nodeSourceHashes: string[] = []
  const seenNodeIds = new Set<number>()
  const nodes = nodeFiles.map((sourceFile) => {
    const { raw, decoded } = decodeMihoyoBin(path.join(nodeRoot, sourceFile))
    const fields = parseMessage(decoded)
    const genericId = genericIdFromNode(fields)
    if (seenNodeIds.has(genericId)) throw new Error(`[error] duplicate Node id ${genericId}`)
    seenNodeIds.add(genericId)
    const fileHash = sha256(raw)
    nodeSourceHashes.push(`${sourceFile}:${fileHash}`)

    const pins = PIN_GROUPS.flatMap((group) =>
      repeatedMessages(fields, group.field).map((descriptor, index) => ({
        kind: group.kind,
        index,
        ...localizedName(numberField(descriptor, 7), maps)
      }))
    )
    return {
      genericId,
      sourceFile: `Node/${sourceFile}`,
      ...localizedName(numberField(fields, 206), maps),
      pins
    }
  })
  nodes.sort((a, b) => a.genericId - b.genericId)

  const global = decodeMihoyoBin(beyondGlobalPath)
  const globalFields = parseMessage(global.decoded)
  const enumContainer = messageField(globalFields, 1)
  const seenEnumIds = new Set<number>()
  const enums = repeatedMessages(enumContainer, 1).map((record) => {
    const id = numberField(record, 1)
    if (id === undefined) throw new Error('[error] BeyondGlobal enum record has no id')
    if (seenEnumIds.has(id)) throw new Error(`[error] duplicate BeyondGlobal enum id ${id}`)
    seenEnumIds.add(id)
    const values = repeatedMessages(record, 2).map((valueRecord) => ({
      value: numberField(valueRecord, 1) ?? 0,
      ...localizedName(numberField(valueRecord, 3), maps)
    }))
    return {
      id,
      ...localizedName(numberField(record, 4), maps),
      values
    }
  })
  enums.sort((a, b) => a.id - b.id)

  const localized = [
    ...nodes.flatMap((node) => [node, ...node.pins]),
    ...enums.flatMap((enumRecord) => [enumRecord, ...enumRecord.values])
  ]
  const unknownZh = localized.filter(
    (item) => item.nameHash !== undefined && !maps.zh.has(item.nameHash)
  ).length
  const unknownEn = localized.filter(
    (item) => item.nameHash !== undefined && !maps.en.has(item.nameHash)
  ).length
  const emptyZh = localized.filter(
    (item) => item.nameHash !== undefined && maps.zh.has(item.nameHash) && item.nameZh === undefined
  ).length
  const emptyEn = localized.filter(
    (item) => item.nameHash !== undefined && maps.en.has(item.nameHash) && item.nameEn === undefined
  ).length

  const output = {
    formatVersion: 1,
    source: {
      encoding: 'xor-0xe5 protobuf wire format',
      nodeFiles: nodeFiles.length,
      nodeAggregateSha256: sha256(nodeSourceHashes.join('\n')),
      chsTextMapFile: path.basename(chsTextMapPath),
      chsTextMapSha256: zh.sha256,
      enTextMapFile: path.basename(enTextMapPath),
      enTextMapSha256: en.sha256,
      beyondGlobalFile: path.basename(beyondGlobalPath),
      beyondGlobalSha256: sha256(global.raw)
    },
    summary: {
      nodes: nodes.length,
      namedNodesZh: nodes.filter((node) => node.nameZh !== undefined).length,
      namedNodesEn: nodes.filter((node) => node.nameEn !== undefined).length,
      pinNameHashes: nodes.flatMap((node) => node.pins).filter((pin) => pin.nameHash !== undefined)
        .length,
      namedPinsZh: nodes.flatMap((node) => node.pins).filter((pin) => pin.nameZh !== undefined)
        .length,
      namedPinsEn: nodes.flatMap((node) => node.pins).filter((pin) => pin.nameEn !== undefined)
        .length,
      enums: enums.length,
      enumValues: enums.reduce((count, enumRecord) => count + enumRecord.values.length, 0),
      unknownZh,
      unknownEn,
      emptyZh,
      emptyEn
    },
    nodes,
    enums
  }

  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`)
  console.log(
    `[ok] wrote ${OUTPUT_PATH}: ${nodes.length} nodes, ` +
      `${enums.length} enum families, ${output.summary.enumValues} enum values`
  )
  console.log(
    `[check] localized hashes: unknown zh=${unknownZh}/en=${unknownEn}, ` +
      `empty zh=${emptyZh}/en=${emptyEn}`
  )
}

main()
