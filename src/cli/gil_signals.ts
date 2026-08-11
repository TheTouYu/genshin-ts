import fs from 'node:fs'
import path from 'node:path'

import type { RegisteredSignalDefinition } from '../compiler/signal_registry.js'
import { readVarint } from '../injector/binary.js'
import { extractSignalNodeIds } from '../injector/signal_nodes.js'
import type { LenField } from '../injector/types.js'
import type { SignalParamType } from '../runtime/core.js'
import {
  checkExistingGeneratedFile,
  decodeUtf8,
  readFieldBytes,
  readFieldMessages,
  readFieldVarint,
  readGilPayloadFields,
  writeGeneratedFile
} from './gil_extract_utils.js'
import { parseWireMessage, printableWireText, type WireField } from './static_assembly/wire.js'

export const SIGNALS_HEADER = '// @gsts:signals'
export const DEFAULT_SIGNALS_PATH = 'src/resources/signals.ts'

type NodeGraphIdInfo = {
  type?: number
  nodeId?: number
}

type SignalEntry = {
  name: string
  params: { name: string; type: SignalParamType }[]
}

type SignalLayout = {
  signalVersion: number
  params: Array<{
    name: string
    type: SignalParamType
    sendPinIndex: number
    monitorPinIndex: number
    serverPinIndex: number
    serverType: number
  }>
  sendNameCompositePinIndex: number
  monitorNameCompositePinIndex: number
  definitionBytes: { send: string; monitor: string; server: string }
}

export type ExtractSignalsOutcome =
  | { status: 'ok'; outPath: string; count: number }
  | { status: 'skipped-existing'; outPath: string }
  | { status: 'failed'; outPath: string; error: string }

const SIGNAL_NODE_TYPE_SKILLS = 20002

function parseNodeGraphId(buf: Uint8Array): NodeGraphIdInfo {
  const out: NodeGraphIdInfo = {}
  let offset = 0
  while (offset < buf.length) {
    const key = readVarint(buf, offset)
    if (!key) break
    offset = key.next
    const field = key.value >> 3
    const wire = key.value & 7
    if (wire === 0) {
      const v = readVarint(buf, offset)
      if (!v) break
      offset = v.next
      if (field === 2) out.type = v.value
      if (field === 5) out.nodeId = v.value
      continue
    }
    if (wire === 2) {
      const lenVar = readVarint(buf, offset)
      if (!lenVar) break
      offset = lenVar.next + lenVar.value
      continue
    }
    if (wire === 1) {
      offset += 8
      continue
    }
    if (wire === 5) {
      offset += 4
      continue
    }
    break
  }
  return out
}

function parseCompositeDefId(buf: Uint8Array): NodeGraphIdInfo | undefined {
  const genericBytes = readFieldBytes(buf, 1)
  if (genericBytes) return parseNodeGraphId(genericBytes)
  const concreteBytes = readFieldBytes(buf, 2)
  if (concreteBytes) return parseNodeGraphId(concreteBytes)
  return undefined
}

function parseSignalName(buf: Uint8Array): string | undefined {
  const defBytes = readFieldBytes(buf, 101) ?? readFieldBytes(buf, 102)
  if (!defBytes) return undefined
  const nameBytes = readFieldBytes(defBytes, 1)
  if (!nameBytes) return undefined
  return decodeUtf8(nameBytes)
}

function mapSignalParamType(typeCode: number | undefined): SignalParamType {
  switch (typeCode) {
    case 1:
      return 'entity'
    case 2:
      return 'guid'
    case 3:
      return 'int'
    case 4:
      return 'bool'
    case 5:
      return 'float'
    case 6:
      return 'str'
    case 7:
      return 'guid_list'
    case 8:
      return 'int_list'
    case 9:
      return 'bool_list'
    case 10:
      return 'float_list'
    case 11:
      return 'str_list'
    case 12:
      return 'vec3'
    case 17:
      return 'faction'
    case 13:
      return 'entity_list'
    case 15:
      return 'vec3_list'
    case 20:
      return 'config_id'
    case 21:
      return 'prefab_id'
    case 22:
      return 'config_id_list'
    case 23:
      return 'prefab_id_list'
    case 24:
      return 'faction_list'
    default:
      return 'unknown'
  }
}

function parseSignalParam(buf: Uint8Array): { name: string; type: SignalParamType } | undefined {
  const nameBytes = readFieldBytes(buf, 1)
  const name = nameBytes ? decodeUtf8(nameBytes) : undefined
  if (!name) return undefined

  const typeBytes = readFieldBytes(buf, 4)
  const typeCode = typeBytes
    ? (readFieldVarint(typeBytes, 4) ?? readFieldVarint(typeBytes, 3))
    : undefined
  return { name, type: mapSignalParamType(typeCode) }
}

function parseSignalEntries(payload: Uint8Array, fields: LenField[]): SignalEntry[] {
  const byName = new Map<string, SignalEntry>()
  const maxContainerBytes = 4096

  for (const f of fields) {
    const len = f.dataEnd - f.dataStart
    if (len <= 0 || len > maxContainerBytes) continue
    const containerBytes = payload.subarray(f.dataStart, f.dataEnd)

    const signalDefBytes = readFieldBytes(containerBytes, 107)
    if (!signalDefBytes) continue
    const signalName = parseSignalName(signalDefBytes)
    if (!signalName || byName.has(signalName)) continue

    const idBytes = readFieldBytes(containerBytes, 4)
    const nodeId = idBytes ? parseCompositeDefId(idBytes) : undefined
    const outputs = readFieldMessages(containerBytes, 103).length
    const isSendSignal = !!nodeId?.nodeId && nodeId.type !== SIGNAL_NODE_TYPE_SKILLS && outputs < 3
    if (!isSendSignal) continue

    const params = readFieldMessages(containerBytes, 102)
      .map(parseSignalParam)
      .filter((param): param is { name: string; type: SignalParamType } => !!param)
    byName.set(signalName, { name: signalName, params })
  }

  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name))
}

function buildSignalsSource(entries: SignalEntry[]): string {
  const lines: string[] = []
  lines.push(SIGNALS_HEADER)
  lines.push('', "import { defineSignal } from 'genshin-ts/runtime/core'", '')
  lines.push('export const Signal = {')
  for (const entry of entries) {
    lines.push(`  ${JSON.stringify(entry.name)}: defineSignal(${JSON.stringify(entry.name)}, [`)
    for (const param of entry.params) {
      lines.push(`    [${JSON.stringify(param.name)}, ${JSON.stringify(param.type)}],`)
    }
    lines.push('  ]),')
  }
  lines.push('} as const', '')
  return lines.join('\n')
}

function fieldText(fields: readonly WireField[], number: number): string | undefined {
  const field = fields.find((entry) => entry.number === number && entry.wire === 2)
  return field ? printableWireText(field.value as Uint8Array) : undefined
}

function fieldVarint(fields: readonly WireField[], number: number): number | undefined {
  const field = fields.find((entry) => entry.number === number && entry.wire === 0)
  return field?.value as number | undefined
}

function containsText(data: Uint8Array, expected: string, depth = 0): boolean {
  if (depth > 8) return false
  for (const field of parseWireMessage(data) ?? []) {
    if (field.wire !== 2) continue
    const value = field.value as Uint8Array
    const text = printableWireText(value)
    if (text === expected || (text === undefined && containsText(value, expected, depth + 1))) {
      return true
    }
  }
  return false
}

function definitionNameCompositePinIndex(
  raw: Uint8Array,
  signalName: string
): number | undefined {
  for (const encoded of readFieldMessages(raw, 106)) {
    if (!containsText(encoded, signalName)) continue
    const pinIndex = readFieldVarint(encoded, 8)
    if (pinIndex !== undefined) return pinIndex
  }
  // 残缺 definition（缺 field 106 信号名 CPI）：返回 undefined，由调用方跳过该信号（2026-08-11 容错）
  return undefined
}

function readSignalLayouts(payload: Uint8Array): Map<string, SignalLayout> {
  const top = parseWireMessage(payload) ?? []
  const containerField = top.find((field) => field.number === 10 && field.wire === 2)
  const container = containerField
    ? (parseWireMessage(containerField.value as Uint8Array) ?? [])
    : []
  const definitions = new Map<number, Uint8Array>()
  for (const wrapper of container.filter((field) => field.number === 2 && field.wire === 2)) {
    const inner = readFieldBytes(wrapper.value as Uint8Array, 1)
    const idBytes = inner ? readFieldBytes(inner, 4) : undefined
    const id = idBytes ? parseCompositeDefId(idBytes)?.nodeId : undefined
    if (id && inner) definitions.set(id, inner)
  }

  const indexField = container.find((field) => field.number === 5 && field.wire === 2)
  const index = indexField ? (parseWireMessage(indexField.value as Uint8Array) ?? []) : []
  const result = new Map<string, SignalLayout>()
  for (const field of index.filter((entry) => entry.number === 3 && entry.wire === 2)) {
    const entry = parseWireMessage(field.value as Uint8Array) ?? []
    const name = fieldText(entry, 3)
    if (!name) continue
    const send = readFieldBytes(field.value as Uint8Array, 1)
    const monitor = readFieldBytes(field.value as Uint8Array, 2)
    const server = readFieldBytes(field.value as Uint8Array, 7)
    const sendId = send ? parseNodeGraphId(send).nodeId : undefined
    const monitorId = monitor ? parseNodeGraphId(monitor).nodeId : undefined
    const serverId = server ? parseNodeGraphId(server).nodeId : undefined
    const sendDef = sendId ? definitions.get(sendId) : undefined
    const monitorDef = monitorId ? definitions.get(monitorId) : undefined
    const serverDef = serverId ? definitions.get(serverId) : undefined
    if (!sendDef || !monitorDef || !serverDef) continue
    const serverParams = readFieldMessages(serverDef, 102)
    const paramItems = entry.filter((item) => item.number === 4 && item.wire === 2)
    const params: SignalLayout['params'] = []
    let broken = false
    for (let index = 0; index < paramItems.length; index++) {
      if (broken) break
      const item = paramItems[index]
      const param = parseWireMessage(item.value as Uint8Array) ?? []
      const paramName = fieldText(param, 1)
      const typeCode = fieldVarint(param, 2)
      const sendPinIndex = fieldVarint(param, 4)
      const monitorPinIndex = fieldVarint(param, 5)
      const serverPinIndex = fieldVarint(param, 6)
      const serverTypeBytes = serverParams[index]
        ? readFieldBytes(serverParams[index], 4)
        : undefined
      const serverType = serverTypeBytes
        ? (readFieldVarint(serverTypeBytes, 3) ?? readFieldVarint(serverTypeBytes, 4))
        : undefined
      if (
        !paramName ||
        typeCode === undefined ||
        sendPinIndex === undefined ||
        monitorPinIndex === undefined ||
        serverPinIndex === undefined ||
        serverType === undefined
      ) {
        // 残缺参数布局：跳过该信号，不中断整表读取（2026-08-11 容错，配合 scan-gil-signal-registry 探活）
        broken = true
        break
      }
      params.push({
        name: paramName,
        type: mapSignalParamType(typeCode),
        sendPinIndex,
        monitorPinIndex,
        serverPinIndex,
        serverType
      })
    }
    if (broken) continue
    const signalVersion = fieldVarint(entry, 6)
    if (signalVersion === undefined) continue
    const sendNameCpi = definitionNameCompositePinIndex(sendDef, name)
    const monitorNameCpi = definitionNameCompositePinIndex(monitorDef, name)
    if (sendNameCpi === undefined || monitorNameCpi === undefined) continue
    result.set(name, {
      signalVersion,
      params,
      sendNameCompositePinIndex: sendNameCpi,
      monitorNameCompositePinIndex: monitorNameCpi,
      definitionBytes: {
        send: Buffer.from(sendDef).toString('base64'),
        monitor: Buffer.from(monitorDef).toString('base64'),
        server: Buffer.from(serverDef).toString('base64')
      }
    })
  }
  return result
}

function readSignalSource(gilPath: string, payload: Uint8Array) {
  const normalized = path.resolve(gilPath)
  const uid = Number(normalized.match(/[\\/]BeyondLocal[\\/](\d+)[\\/]/)?.[1])
  const mapId = Number(path.basename(normalized, path.extname(normalized)))
  const root = parseWireMessage(payload) ?? []
  const versionField = root.find((field) => field.number === 43 && field.wire === 2)
  const gameVersion = versionField ? printableWireText(versionField.value as Uint8Array) : undefined
  return Number.isInteger(uid) && Number.isInteger(mapId) && gameVersion
    ? { uid, mapId, gameVersion }
    : undefined
}

export function readRegisteredSignalsFromGil(gilPath: string): RegisteredSignalDefinition[] {
  const { payload, fields } = readGilPayloadFields(gilPath)
  const entries = parseSignalEntries(payload, fields)
  const ids = extractSignalNodeIds(payload, fields)
  const layouts = readSignalLayouts(payload)
  const source = readSignalSource(gilPath, payload)
  return entries.map((entry) => {
    const identity = ids.get(entry.name)
    const layout = layouts.get(entry.name)
    if (!identity?.send?.nodeId || !identity.monitor?.nodeId || !identity.sendServer?.nodeId) {
      throw new Error(`[error] incomplete signal identity: ${entry.name}`)
    }
    if (!layout) throw new Error(`[error] incomplete signal layout: ${entry.name}`)
    return {
      ...entry,
      params: layout.params,
      sendId: identity.send.nodeId,
      monitorId: identity.monitor.nodeId,
      serverId: identity.sendServer.nodeId,
      encoding: { ...layout, source }
    }
  })
}

export function extractSignalsFromGil(params: {
  gilPath: string
  outPath: string
}): ExtractSignalsOutcome {
  const existingCheck = checkExistingGeneratedFile(params.outPath, SIGNALS_HEADER)
  if (existingCheck) return existingCheck

  try {
    const entries = readRegisteredSignalsFromGil(params.gilPath)

    writeGeneratedFile(params.outPath, buildSignalsSource(entries))
    return { status: 'ok', outPath: params.outPath, count: entries.length }
  } catch (e) {
    return {
      status: 'failed',
      outPath: params.outPath,
      error: e instanceof Error ? e.message : String(e)
    }
  }
}
