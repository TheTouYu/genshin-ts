/**
 * assets:global-timers — 全局计时器 CLI（root12 定义 + root5 实体组件挂载）。
 *
 * 数据/结构依据（真实 GIL + 差分/抓包，2026-09-05，map 1073741908）：
 *   - root12 容器内每条 f1 记录：
 *       f1 = UTF-8 计时器名
 *       f2 = fixed32 float 时长
 *       f3 = presence：missing=正计时；1=倒计时/负计时
 *       f501 = varint 1（固定）
 *   - 实体组件槽（root5 实体记录 f7）：
 *       f1 = 16（组件类型：全局计时器）
 *       f2 = 1
 *       f26 = { f1 = 计时器名 }
 *
 * 子命令：
 *   list   列出 root12 全局计时器定义
 *   create 在 root12 新增计时器定义
 *   attach 给场景实体(root5)挂全局计时器组件并引用计时器名
 *
 * 安全：默认只读/list；变更类默认 --output 生成候选，--write 才写真实地图
 * （自动备份 + Temp 同步）。
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { loadGstsConfig } from '../compiler/config_loader.js'
import type { GstsConfig, GstsInjectConfig } from '../compiler/gsts_config.js'
import { buildFile, readUint32BE } from '../injector/binary.js'
import { resolveGilTarget, syncGilToTemp } from './gil_paths.js'
import { sha256Bytes } from './static_assembly/json.js'
import {
  emitWireMessage,
  parseWireMessage,
  type WireField
} from './static_assembly/wire.js'

type RootContext = { projectConfigPath?: string; projectConfig?: GstsConfig }
type Sub = 'list' | 'create' | 'attach'
type Args = {
  sub: Sub
  gilPath?: string
  mapId?: number
  name?: string
  duration?: number
  countdown?: boolean
  entityId?: number
  outputPath?: string
  write: boolean
  json: boolean
}

const ROOT12 = 12
const ROOT5 = 5
const COMPONENT_TYPE_GLOBAL_TIMER = 16

function usage(exitCode = 1): never {
  const text = [
    'Manage global timers (root12 definitions + root5 entity component) from real GIL donors.',
    '',
    'Usage: gsts assets:global-timers [list|create|attach] [options]',
    '',
    '  list:   gsts assets:global-timers list [--gil <file>] [--json]',
    '  create: gsts assets:global-timers create --name <名> [--duration <float>] [--countdown|--positive]',
    '          [--gil <file>] [--output <file>|--write]',
    '  attach: gsts assets:global-timers attach --entity <场景实体ID> --name <计时器名>',
    '          [--gil <file>] [--output <file>|--write]',
    '',
    'Notes:',
    '  - positive = f3 missing; countdown = f3=1',
    '  - attach adds component type 16 with f26={f1=name} to root5 entity record f7',
    '  - --write writes source GIL after backup; --output writes a new candidate file.'
  ].join('\n')
  console[exitCode === 0 ? 'log' : 'error'](text)
  process.exit(exitCode)
}

function parseArgv(argv: readonly string[]): Args {
  const args: Args = { sub: 'list', write: false, json: false }
  const rest = [...argv]
  const sub = rest.shift()
  if (sub === 'list' || sub === 'create' || sub === 'attach') {
    args.sub = sub
  } else if (sub) {
    throw new Error(`[error] unknown subcommand: ${sub}`)
  }
  const value = (a: readonly string[], i: number): string => {
    const v = a[i]
    if (v === undefined) throw new Error(`[error] missing value for ${a[i - 1]}`)
    return v
  }
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i]
    if (arg === '--gil') args.gilPath = value(rest, ++i)
    else if (arg === '--map-id') args.mapId = Number(value(rest, ++i))
    else if (arg === '--name') args.name = value(rest, ++i)
    else if (arg === '--duration') args.duration = Number(value(rest, ++i))
    else if (arg === '--entity') args.entityId = Number(value(rest, ++i))
    else if (arg === '--countdown') args.countdown = true
    else if (arg === '--positive') args.countdown = false
    else if (arg === '--output') args.outputPath = value(rest, ++i)
    else if (arg === '--write') args.write = true
    else if (arg === '--json') args.json = true
    else if (arg === '--help' || arg === '-h') usage(0)
    else throw new Error(`[error] unknown option: ${arg}`)
  }
  if (args.sub !== 'list' && !args.gilPath && args.mapId === undefined) {
    throw new Error('[error] need --gil <file> or --map-id for mutating commands')
  }
  if (args.sub === 'create') {
    if (!args.name) usage()
    if (args.duration === undefined) args.duration = 5
  }
  if (args.sub === 'attach') {
    if (args.entityId === undefined || !args.name) usage()
  }
  if (args.write && args.outputPath) throw new Error('[error] --write and --output are mutually exclusive')
  return args
}

function resolveGilPath(projectConfig: GstsConfig | undefined, args: Args): string {
  if (args.gilPath) return path.resolve(args.gilPath)
  const inject: GstsInjectConfig = { ...(projectConfig?.inject ?? {}) }
  if (args.mapId !== undefined) inject.mapId = args.mapId
  if (inject.mapId === undefined) throw new Error('[error] mapId is required')
  return resolveGilTarget(inject).gilPath
}

// ==================== wire helpers ====================

const textDec = new TextDecoder('utf-8', { fatal: false })
const str = (bytes?: Uint8Array): string => (bytes ? textDec.decode(bytes) : '')
const utf8 = (s: string): Uint8Array => new TextEncoder().encode(s)

function parseContainer(payload: Uint8Array, rootN: number): WireField[] | undefined {
  const top = parseWireMessage(payload)
  if (!top) throw new Error('[error] malformed GIL payload')
  const container = top.find((f) => f.number === rootN && f.wire === 2)
  if (!container) return undefined
  return parseWireMessage(container.value as Uint8Array) ?? []
}

export function root12Records(payload: Uint8Array): { fields: WireField[]; bytes: Uint8Array }[] {
  const container = parseContainer(payload, ROOT12) ?? []
  return container
    .filter((f) => f.number === 1 && f.wire === 2)
    .map((f) => ({
      fields: parseWireMessage(f.value as Uint8Array) ?? [],
      bytes: f.value as Uint8Array
    }))
}

function timerInfo(fields: WireField[]) {
  const nameF = fields.find((f) => f.number === 1 && f.wire === 2)
  const durF = fields.find((f) => f.number === 2 && f.wire === 5)
  const typeF = fields.find((f) => f.number === 3 && f.wire === 0)
  const f501F = fields.find((f) => f.number === 501 && f.wire === 0)
  let duration: number | undefined
  if (durF) {
    const dv = new DataView((durF.value as Uint8Array).buffer, (durF.value as Uint8Array).byteOffset, 4)
    duration = dv.getFloat32(0, true)
  }
  return {
    name: nameF ? str(nameF.value as Uint8Array) : '',
    duration,
    countdown: typeF !== undefined && typeF.value === 1,
    f501: f501F?.value as number | undefined
  }
}

function buildTimerRecord(name: string, duration: number, countdown: boolean): Uint8Array {
  const fields: WireField[] = [
    { number: 1, wire: 2, value: utf8(name) },
    { number: 2, wire: 5, value: new Uint8Array(new Float32Array([duration]).buffer) }
  ]
  if (countdown) fields.push({ number: 3, wire: 0, value: 1 })
  fields.push({ number: 501, wire: 0, value: 1 })
  return emitWireMessage(fields)
}

function root5Record(payload: Uint8Array, entityId: number): { fields: WireField[] } | undefined {
  const container = parseContainer(payload, ROOT5) ?? []
  for (const f of container) {
    if (f.number !== 1 || f.wire !== 2) continue
    const rec = parseWireMessage(f.value as Uint8Array)
    if (!rec) continue
    const id = rec.find((x) => x.number === 1 && x.wire === 0)?.value
    if (id === entityId) return { fields: rec }
  }
  return undefined
}

function componentBytes(timerName: string): Uint8Array {
  const f26 = emitWireMessage([{ number: 1, wire: 2, value: utf8(timerName) }])
  return emitWireMessage([
    { number: 1, wire: 0, value: COMPONENT_TYPE_GLOBAL_TIMER },
    { number: 2, wire: 0, value: 1 },
    { number: 26, wire: 2, value: f26 }
  ])
}

function hasComponent(record: WireField[], timerName: string): boolean {
  for (const f of record) {
    if (f.wire !== 2 || f.number !== 7) continue
    const comp = parseWireMessage(f.value as Uint8Array)
    if (!comp) continue
    const type = comp.find((x) => x.number === 1 && x.wire === 0)?.value
    if (type !== COMPONENT_TYPE_GLOBAL_TIMER) continue
    const f26 = comp.find((x) => x.number === 26 && x.wire === 2)
    if (!f26) continue
    const cfg = parseWireMessage(f26.value as Uint8Array)
    const name = cfg?.find((x) => x.number === 1 && x.wire === 2)
    if (name && str(name.value as Uint8Array) === timerName) return true
  }
  return false
}

// ==================== builders ====================

export function buildCreateGlobalTimer(payload: Uint8Array, name: string, duration: number, countdown: boolean): Uint8Array {
  const existing = root12Records(payload)
  if (existing.some((r) => timerInfo(r.fields).name === name)) {
    throw new Error(`[error] global timer already exists: ${name}`)
  }
  const container = parseContainer(payload, ROOT12) ?? []
  const newContainer = emitWireMessage([
    ...container,
    { number: 1, wire: 2, value: buildTimerRecord(name, duration, countdown) }
  ])
  const top = parseWireMessage(payload)!
  const filtered = top.filter((f) => !(f.number === ROOT12 && f.wire === 2))
  return emitWireMessage([...filtered, { number: ROOT12, wire: 2, value: newContainer }])
}

function buildAttachGlobalTimer(payload: Uint8Array, entityId: number, timerName: string): Uint8Array {
  const container = parseContainer(payload, ROOT5)
  if (!container) throw new Error('[error] root5 container not found')
  const rec = root5Record(payload, entityId)
  if (!rec) throw new Error(`[error] scene entity not found: ${entityId}`)
  if (hasComponent(rec.fields, timerName)) {
    throw new Error(`[error] entity already has GlobalTimer component for ${timerName}`)
  }
  const recBytes = emitWireMessage([
    ...rec.fields,
    { number: 7, wire: 2, value: componentBytes(timerName) }
  ])
  const newContainer = emitWireMessage(
    container.map((f) => {
      if (f.number !== 1 || f.wire !== 2) return f
      const inner = parseWireMessage(f.value as Uint8Array)
      const id = inner?.find((x) => x.number === 1 && x.wire === 0)?.value
      if (id !== entityId) return f
      return { ...f, value: recBytes }
    })
  )
  const top = parseWireMessage(payload)!
  const filtered = top.filter((f) => !(f.number === ROOT5 && f.wire === 2))
  return emitWireMessage([...filtered, { number: ROOT5, wire: 2, value: newContainer }])
}

// ==================== list / run ====================

function runList(payload: Uint8Array, file: string, json: boolean) {
  const timers = root12Records(payload).map((r) => timerInfo(r.fields))
  if (json) {
    console.log(JSON.stringify({ gil: file, timers }, null, 2))
    return
  }
  console.log(`global timers in ${file}:`)
  if (timers.length === 0) {
    console.log('(none)')
    return
  }
  for (const t of timers) {
    console.log(`  ${t.name} duration=${t.duration} type=${t.countdown ? 'countdown' : 'positive'} f501=${t.f501 ?? '?'}`)
  }
}

export async function runAssetsGlobalTimers(
  argv: readonly string[],
  rootCtx: RootContext = {}
): Promise<void> {
  const args = parseArgv(argv)
  const projectConfig = rootCtx.projectConfigPath
    ? await loadGstsConfig(rootCtx.projectConfigPath, { profile: 'project' })
    : rootCtx.projectConfig
  const gil = resolveGilPath(projectConfig, args)
  const sourceBytes = new Uint8Array(fs.readFileSync(gil))
  const payload = sourceBytes.slice(20, -4)

  if (args.sub === 'list') {
    runList(payload, gil, args.json)
    return
  }

  const sourceSha = sha256Bytes(sourceBytes)
  const result =
    args.sub === 'create'
      ? buildCreateGlobalTimer(payload, args.name!, args.duration!, !!args.countdown)
      : buildAttachGlobalTimer(payload, args.entityId!, args.name!)
  const header = {
    schema: readUint32BE(sourceBytes, 4),
    headTag: readUint32BE(sourceBytes, 8),
    fileType: readUint32BE(sourceBytes, 12),
    tailTag: readUint32BE(sourceBytes, sourceBytes.length - 4)
  }
  const newFile = buildFile(result, header)
  const candidateSha = sha256Bytes(newFile)
  // read-back sanity
  const newPayload = newFile.slice(20, -4)
  if (args.sub === 'create' && !root12Records(newPayload).some((r) => timerInfo(r.fields).name === args.name)) {
    throw new Error('[error] read-back: global timer record missing after create')
  }
  if (args.sub === 'attach' && !root5Record(newPayload, args.entityId!)) {
    throw new Error('[error] read-back: entity missing after attach')
  }

  if (args.write) {
    const nowSha = sha256Bytes(new Uint8Array(fs.readFileSync(gil)))
    if (nowSha !== sourceSha) throw new Error('[error] source GIL changed since read; aborting write')
    const backupDir = path.join(path.dirname(gil), '.gsts', 'backups')
    fs.mkdirSync(backupDir, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const backup = path.join(backupDir, `${path.basename(gil)}.${stamp}.global-timers.bak`)
    fs.copyFileSync(gil, backup)
    fs.writeFileSync(gil, newFile)
    try {
      syncGilToTemp(path.dirname(gil), path.basename(gil))
    } catch {
      // best-effort temp sync
    }
    console.log(`backup=${backup}`)
    console.log(`written=${gil}`)
  } else if (args.outputPath) {
    const absolute = path.resolve(args.outputPath)
    if (fs.existsSync(absolute)) throw new Error(`[error] output already exists: ${absolute}`)
    fs.mkdirSync(path.dirname(absolute), { recursive: true })
    fs.writeFileSync(absolute, newFile)
    console.log(`written=${absolute}`)
  } else {
    console.log(`preview=${gil}`)
  }
  console.log(
    `command=${args.sub} name=${args.name ?? '-'} duration=${args.duration ?? '-'} countdown=${args.countdown ?? '-'} ` +
      `entity=${args.entityId ?? '-'} sourceSha256=${sourceSha} candidateSha256=${candidateSha} size=${sourceBytes.length}->${newFile.length}`
  )
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const args = process.argv.slice(2)
  const cfgIdx = args.indexOf('--config')
  const cfgPath = cfgIdx >= 0 ? args[cfgIdx + 1] : undefined
  if (cfgIdx >= 0) args.splice(cfgIdx, 2)
  runAssetsGlobalTimers(args, cfgPath ? { projectConfigPath: cfgPath } : {}).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
