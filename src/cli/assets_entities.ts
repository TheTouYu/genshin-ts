import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import type { GstsConfig } from '../compiler/gsts_config.js'
import type { GstsInjectConfig } from '../compiler/gsts_config.js'
import { loadGstsConfig } from '../compiler/config_loader.js'
import { t } from '../i18n/index.js'
import { resolveGilTarget, syncGilToTemp } from './gil_paths.js'
import { resyncMap } from './maps.js'
import { applyEntities, exportEntities, type EntityImport } from './gil_entities.js'
import { isOfficialResourceId } from './official_prefabs.js'
import {
  attachAux,
  detachAux,
  patchAuxColor,
  patchAuxTransform,
  patchEntityColor,
  patchEntityTransform,
  readAuxTransform
} from './static_assembly/patch.js'
import {
  emitWireMessage,
  parseWireMessage,
  wireRecords,
  wireRecordId
} from './static_assembly/wire.js'
import { prettyStableJson } from './static_assembly/json.js'

type Command = 'export' | 'import' | 'patch' | 'apply-candidate'
type Format = 'text' | 'json'
type RootContext = { projectConfigPath?: string; projectConfig?: GstsConfig }
type Vector3 = readonly [number, number, number]

type EntitiesFile = {
  schemaVersion: number
  entities: EntityImport[]
}

function usage(exitCode = 1): never {
  const output = [
    'Export, import or patch scene entities (root 5) of a GIL map.',
    '',
    'Usage: gsts assets:entities [export|import|patch|apply-candidate] [options]',
    '',
    '  --entities <file>      entity import JSON (import only)',
    '  --definitions-gil <file>  donor GIL for definition records (import only)',
    '  --candidate <file>     candidate GIL to apply (apply-candidate only)',
    '  --expect-source-hash <sha256>  reject a source that changed since planning',
    '  --map-id <id>          target map ID (location only)',
    '  --gil <file>           explicit GIL source',
    '  --format <text|json>   output format (default: text)',
    '  --output <file>        create output without overwriting',
    '  --write                atomically write source GIL after backup',
    '  -h, --help             show help',
    '',
    'patch: gsts assets:entities patch <entity-id> [options]',
    '  --color <#RRGGBB>      set custom color (0xAARRGGBB accepted)',
    '  --position <x,y,z>     set transform position (sparse-encoded)',
    '  --rotation <x,y,z>     set transform rotation in degrees (sparse-encoded)',
    '  --scale <x,y,z>        set transform scale (dense three-axis)',
    '  --attach-aux <aux-id>  attach an existing aux decoration (bidirectional refs)',
    '  --detach-aux <aux-id>  detach an aux decoration',
    '  --aux <aux-id>         target an aux decoration instead of the entity for',
    '                         --color/--position/--rotation/--scale',
    '',
    'Import entities are created from their component definition record;',
    'sourceDefinitionId optionally selects a donor record without changing',
    'the definitionId written to the entity. Components are inherited byte-for-byte.',
    'patch performs a record-level local replacement (only the target record bytes change).',
    'apply-candidate: gsts assets:entities apply-candidate [options]',
    '  Hash-gated writeback of a pre-built candidate file: the source must match',
    '  --expect-source-hash exactly, then the candidate replaces it atomically',
    '  after an automatic backup (same semantics as import --write).',
    'These commands modify .gil asset structures. They are not GIA NodeGraph injection,',
    'runtime createPrefab, or editor/game verification.'
  ].join('\n')
  console[exitCode === 0 ? 'log' : 'error'](output)
  process.exit(exitCode)
}

function value(argv: readonly string[], index: number): string {
  const result = argv[index + 1]
  if (!result || result.startsWith('--')) usage()
  return result
}

function nonNegativeId(raw: string, option: string): number {
  const result = Number(raw)
  if (!Number.isSafeInteger(result) || result < 0)
    throw new Error(`[error] ${option} must be a non-negative safe integer`)
  return result
}

function parseColor(raw: string, option: string): number {
  const m = /^(#|0x)?([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.exec(raw.trim())
  if (!m) throw new Error(`[error] ${option} must be #RRGGBB or 0xAARRGGBB`)
  const value = Number.parseInt(m[2], 16)
  return m[2].length === 6 ? 0xff000000 | value : value
}

function parseVector3(raw: string, option: string): Vector3 {
  const parts = raw.split(',')
  if (parts.length !== 3) throw new Error(`[error] ${option} must be x,y,z`)
  const values = parts.map((part) => Number(part))
  if (values.some((value) => !Number.isFinite(value)))
    throw new Error(`[error] ${option} must contain numbers`)
  return [values[0], values[1], values[2]]
}

function parseArgs(argv: readonly string[]) {
  let command: Command = 'export'
  let mapId: number | undefined
  let gilPath: string | undefined
  let outputPath: string | undefined
  let entitiesPath: string | undefined
  let candidatePath: string | undefined
  let definitionsGilPath: string | undefined
  let expectedSourceHash: string | undefined
  let write = false
  let format: Format = 'text'
  let entityId: number | undefined
  let color: number | undefined
  let position: Vector3 | undefined
  let rotation: Vector3 | undefined
  let scale: Vector3 | undefined
  let auxId: number | undefined
  let attachAuxId: number | undefined
  let detachAuxId: number | undefined
  let index = 0
  if (argv[0] === 'import' || argv[0] === 'export' || argv[0] === 'patch' || argv[0] === 'apply-candidate') {
    command = argv[0]
    index++
  }
  for (; index < argv.length; index++) {
    const arg = argv[index]
    if (arg === '--map-id') mapId = nonNegativeId(value(argv, index++), '--map-id')
    else if (arg === '--gil') gilPath = value(argv, index++)
    else if (arg === '--output') outputPath = value(argv, index++)
    else if (arg === '--entities') entitiesPath = value(argv, index++)
    else if (arg === '--candidate') candidatePath = value(argv, index++)
    else if (arg === '--definitions-gil') definitionsGilPath = value(argv, index++)
    else if (arg === '--expect-source-hash') {
      const raw = value(argv, index++).toLowerCase()
      if (!/^[0-9a-f]{64}$/.test(raw))
        throw new Error('[error] --expect-source-hash must be a 64-character SHA-256')
      expectedSourceHash = raw
    } else if (arg === '--format') {
      const raw = value(argv, index++)
      if (raw !== 'text' && raw !== 'json') throw new Error('[error] --format must be text or json')
      format = raw
    } else if (arg === '--write') write = true
    else if (arg === '--color') color = parseColor(value(argv, index++), '--color')
    else if (arg === '--position') position = parseVector3(value(argv, index++), '--position')
    else if (arg === '--rotation') rotation = parseVector3(value(argv, index++), '--rotation')
    else if (arg === '--scale') scale = parseVector3(value(argv, index++), '--scale')
    else if (arg === '--aux') auxId = nonNegativeId(value(argv, index++), '--aux')
    else if (arg === '--attach-aux') attachAuxId = nonNegativeId(value(argv, index++), '--attach-aux')
    else if (arg === '--detach-aux') detachAuxId = nonNegativeId(value(argv, index++), '--detach-aux')
    else if (arg === '--help' || arg === '-h') usage(0)
    else if (command === 'patch' && entityId === undefined) {
      entityId = nonNegativeId(arg, 'entity-id')
    } else usage()
  }
  if (gilPath && mapId !== undefined)
    throw new Error('[error] --gil and --map-id are mutually exclusive')
  if (command === 'import' && !entitiesPath)
    throw new Error('[error] import requires --entities <file>')
  if (command === 'apply-candidate') {
    if (!candidatePath) throw new Error('[error] apply-candidate requires --candidate <file>')
    if (expectedSourceHash === undefined)
      throw new Error('[error] apply-candidate requires --expect-source-hash <sha256>')
  }
  if (command === 'patch') {
    if (entityId === undefined) throw new Error('[error] patch requires <entity-id>')
    if (auxId !== undefined) {
      if (attachAuxId !== undefined || detachAuxId !== undefined)
        throw new Error('[error] --aux cannot be combined with --attach-aux/--detach-aux')
      if (color === undefined && position === undefined && rotation === undefined && scale === undefined)
        throw new Error('[error] --aux requires at least one of --color/--position/--rotation/--scale')
    } else if (attachAuxId !== undefined && detachAuxId !== undefined) {
      throw new Error('[error] --attach-aux and --detach-aux are mutually exclusive')
    } else if (
      attachAuxId === undefined &&
      detachAuxId === undefined &&
      color === undefined &&
      position === undefined &&
      rotation === undefined &&
      scale === undefined
    ) {
      throw new Error(
        '[error] patch requires at least one of --color/--position/--rotation/--scale/--attach-aux/--detach-aux'
      )
    }
  }
  if (write && outputPath) throw new Error('[error] --write and --output are mutually exclusive')
  return {
    command,
    mapId,
    gilPath,
    outputPath,
    entitiesPath,
    candidatePath,
    definitionsGilPath,
    expectedSourceHash,
    write,
    format,
    entityId,
    color,
    position,
    rotation,
    scale,
    auxId,
    attachAuxId,
    detachAuxId
  }
}

function resolveGilPath(
  projectConfig: GstsConfig | undefined,
  args: ReturnType<typeof parseArgs>
): { path: string; locator: string } {
  if (args.gilPath) {
    const absolute = path.resolve(args.gilPath)
    return { path: absolute, locator: path.basename(absolute) }
  }
  const inject: GstsInjectConfig = { ...(projectConfig?.inject ?? {}) }
  if (args.mapId !== undefined) inject.mapId = args.mapId
  if (inject.mapId === undefined) {
    throw new Error(
      '[error] mapId is required; use --gil, or provide --map-id with a project config'
    )
  }
  const target = resolveGilTarget(inject)
  return { path: target.gilPath, locator: String(target.mapId) }
}

function writeNew(outputPath: string, contents: string | Uint8Array): string {
  const absolute = path.resolve(outputPath)
  if (fs.existsSync(absolute)) throw new Error(`[error] output already exists: ${absolute}`)
  fs.mkdirSync(path.dirname(absolute), { recursive: true })
  fs.writeFileSync(absolute, contents)
  return absolute
}

function backupPath(gilPath: string): string {
  const directory = path.join(path.dirname(gilPath), '.gsts', 'backups')
  fs.mkdirSync(directory, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  return path.join(directory, `${path.basename(gilPath)}.${stamp}.bak`)
}

// 写回 Save_Level 后同步编辑器 Temp + gip 注册（2026-08-09：漏同步则编辑器列表/内容滞后）。
// 幂等：gip 已有链接跳过、Temp 不存在时静默跳过；失败只告警不阻断写回结果。
function syncEditorTemp(gilPath: string, mapId: number | undefined): void {
  if (mapId === undefined) return
  try {
    const result = resyncMap(path.dirname(gilPath), mapId)
    if (result.tempPath) console.log(`temp=${result.tempPath}`)
  } catch (error) {
    console.log(`temp-sync-skipped=${(error as Error).message}`)
  }
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

function readSource(filePath: string, expectedHash?: string): { bytes: Uint8Array; hash: string } {
  const bytes = new Uint8Array(fs.readFileSync(filePath))
  const hash = sha256(bytes)
  if (expectedHash && hash !== expectedHash) {
    throw new Error(`[error] source SHA-256 mismatch: expected ${expectedHash}, got ${hash}`)
  }
  return { bytes, hash }
}

function assertSourceUnchanged(filePath: string, expectedHash: string): void {
  const currentHash = sha256(new Uint8Array(fs.readFileSync(filePath)))
  if (currentHash !== expectedHash) {
    throw new Error(
      `[error] source changed during operation: expected ${expectedHash}, got ${currentHash}`
    )
  }
}

function writeBack(gilPath: string, candidate: Uint8Array, sourceHash: string): string {
  assertSourceUnchanged(gilPath, sourceHash)
  const backup = backupPath(gilPath)
  const temporary = path.join(
    path.dirname(gilPath),
    `.${path.basename(gilPath)}.${process.pid}.${Date.now()}.tmp`
  )
  fs.copyFileSync(gilPath, backup)
  try {
    fs.writeFileSync(temporary, candidate, { flag: 'wx' })
    fs.renameSync(temporary, gilPath)
  } finally {
    fs.rmSync(temporary, { force: true })
  }
  // 编辑器活动目录 Temp 同步（编辑器列表/内容以 Temp 为准，2026-08-09 实测）
  syncGilToTemp(path.dirname(gilPath), path.basename(gilPath))
  return backup
}

function loadEntitiesFile(filePath: string): EntitiesFile {
  const absolute = path.resolve(filePath)
  let parsed: unknown
  try {
    parsed = JSON.parse(fs.readFileSync(absolute, 'utf-8'))
  } catch (error) {
    throw new Error(`[error] cannot parse entities file ${absolute}: ${String(error)}`)
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('[error] entities file must be an object')
  }
  const source = parsed as Record<string, unknown>
  if (source.schemaVersion !== 1) throw new Error('[error] entities file schemaVersion must be 1')
  if (!Array.isArray(source.entities)) throw new Error('[error] entities file must contain entities')
  const entities = source.entities.map((entry, index) => {
    const field = `entities[${index}]`
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error(`[error] ${field} must be an object`)
    }
    const item = entry as Record<string, unknown>
    const vector = (name: string): [number, number, number] | undefined => {
      const raw = item[name]
      if (raw === undefined) return undefined
      if (!Array.isArray(raw) || raw.length !== 3 || raw.some((v) => typeof v !== 'number')) {
        throw new Error(`[error] ${field}.${name} must contain exactly three numbers`)
      }
      return raw as [number, number, number]
    }
    if (typeof item.name !== 'string' || !item.name)
      throw new Error(`[error] ${field}.name must be a non-empty string`)
    if (!Number.isSafeInteger(item.id) || (item.id as number) < 0)
      throw new Error(`[error] ${field}.id must be a non-negative safe integer`)
    if (!Number.isSafeInteger(item.definitionId) || (item.definitionId as number) < 0)
      throw new Error(`[error] ${field}.definitionId must be a non-negative safe integer`)
    if (
      item.sourceDefinitionId !== undefined &&
      (!Number.isSafeInteger(item.sourceDefinitionId) || (item.sourceDefinitionId as number) < 0)
    ) {
      throw new Error(`[error] ${field}.sourceDefinitionId must be a non-negative safe integer`)
    }
    return {
      name: item.name,
      id: item.id as number,
      definitionId: item.definitionId as number,
      ...(item.sourceDefinitionId === undefined
        ? {}
        : { sourceDefinitionId: item.sourceDefinitionId as number }),
      ...(vector('position') ? { position: vector('position')! } : {}),
      ...(vector('rotation') ? { rotation: vector('rotation')! } : {}),
      ...(vector('scale') ? { scale: vector('scale')! } : {}),
      ...(item.color !== undefined
        ? (() => {
            if (
              typeof item.color !== 'string' ||
              !/^#[0-9a-fA-F]{6}$/.test(item.color)
            )
              throw new Error(`[error] ${field}.color must be '#RRGGBB'`)
            return { color: 0xff000000 | parseInt(item.color.slice(1), 16) }
          })()
        : {})
    }
  })
  return { schemaVersion: 1, entities }
}

async function runExport(
  args: ReturnType<typeof parseArgs>,
  projectConfig: GstsConfig | undefined
): Promise<void> {
  const source = resolveGilPath(projectConfig, args)
  const before = fs.statSync(source.path)
  const { bytes, hash } = readSource(source.path, args.expectedSourceHash)
  const entities = exportEntities(bytes)
  const serialized = prettyStableJson({ schemaVersion: 1, entities })
  if (args.outputPath) writeNew(args.outputPath, serialized)
  if (args.format === 'json' || !args.outputPath) process.stdout.write(serialized)
  else {
    console.log(`source=${source.locator}`)
    console.log(`entities=${entities.length}`)
    for (const entity of entities) {
      console.log(
        `entity=${entity.id} name=${entity.name} definitionId=${entity.definitionId} ` +
          `components=${entity.components.map((component) => component.type).join(',') || '-'}`
      )
    }
    console.log('compatibility=not-proven; editorOrGameValidation=not-performed')
    console.log(`sourceSha256=${hash}`)
  }
  const after = fs.statSync(source.path)
  if (before.mtimeMs !== after.mtimeMs || before.size !== after.size) {
    throw new Error('[error] export source changed during read-only operation')
  }
}

async function runApplyCandidate(
  args: ReturnType<typeof parseArgs>,
  projectConfig: GstsConfig | undefined
): Promise<void> {
  // hash-gated 候选写回：源必须逐字匹配 --expect-source-hash，随后候选原子替换
  // （自动备份 + 同目录临时文件 rename，语义与 import --write 一致）。
  const source = resolveGilPath(projectConfig, args)
  if (!fs.existsSync(source.path) || !fs.statSync(source.path).isFile())
    throw new Error(`[error] gil not found: ${source.path}`)
  const { bytes: sourceBytes, hash: sourceHash } = readSource(source.path, args.expectedSourceHash)
  const candidate = new Uint8Array(fs.readFileSync(path.resolve(args.candidatePath!)))
  if (candidate.length < 24) throw new Error('[error] candidate is not a valid GIL file')
  const payload = parseWireMessage(candidate.slice(20, -4))
  if (!payload) throw new Error('[error] candidate GIL payload is malformed')
  const backup = writeBack(source.path, candidate, sourceHash)
  console.log(`sourceSha256=${sourceHash}`)
  console.log(`candidateSha256=${sha256(candidate)}`)
  console.log(`backup=${backup}`)
  console.log(`writePerformed=true`)
  syncEditorTemp(source.path, args.mapId)
}

async function runImport(
  args: ReturnType<typeof parseArgs>,
  projectConfig: GstsConfig | undefined
): Promise<void> {
  const entities = loadEntitiesFile(args.entitiesPath!)
  const source = resolveGilPath(projectConfig, args)
  if (!fs.existsSync(source.path) || !fs.statSync(source.path).isFile())
    throw new Error(`[error] gil not found: ${source.path}`)
  const { bytes: sourceBytes, hash: sourceHash } = readSource(source.path, args.expectedSourceHash)
  const payload = parseWireMessage(sourceBytes.slice(20, -4))
  if (!payload) throw new Error('[error] malformed GIL payload')
  const definitions = payload.some((f) => f.number === 4 && f.wire === 2)
    ? wireRecords(payload, 4, 1)
    : []
  if (args.definitionsGilPath) {
    // donor 地图的 definition records 补充到目标（目标已有优先，donor 只补缺失 ID）
    const donorBytes = new Uint8Array(fs.readFileSync(path.resolve(args.definitionsGilPath)))
    const donorRoot = parseWireMessage(donorBytes.slice(20, -4))
    if (!donorRoot) throw new Error('[error] malformed donor GIL payload')
    const donorIds = new Set(definitions.map((record) => wireRecordId(record)))
    for (const record of wireRecords(donorRoot, 4, 1)) {
      if (!donorIds.has(wireRecordId(record))) definitions.push(record)
    }
  }
  const missing = entities.entities.filter((entity) => {
    const sourceDefinitionId = entity.sourceDefinitionId ?? entity.definitionId
    // 官方基础元件直引（resID 在 [1e7,1e9)）不需要目标地图 root 4 本地定义。
    if (isOfficialResourceId(sourceDefinitionId)) return false
    return !definitions.some((record) => wireRecordId(record) === sourceDefinitionId)
  })
  if (missing.length) {
    throw new Error(
      `[error] source definition IDs not found: ${[
        ...new Set(missing.map((entity) => entity.sourceDefinitionId ?? entity.definitionId))
      ].join(', ')}`
    )
  }
  const candidate = applyEntities({ bytes: sourceBytes, definitions, entities: entities.entities })
  console.log(`sourceSha256=${sourceHash}`)
  console.log(`candidateSha256=${sha256(candidate)}`)
  if (args.outputPath) {
    writeNew(args.outputPath, candidate)
    console.log(`candidate=${path.resolve(args.outputPath)}`)
  } else if (args.write) {
    const backup = writeBack(source.path, candidate, sourceHash)
    console.log(`backup=${backup}`)
    console.log(`writePerformed=true`)
    syncEditorTemp(source.path, args.mapId)
  } else {
    console.log(`entities=${entities.entities.length}`)
    console.log('preview only; use --write to apply after backup, or --output for a candidate')
  }
}

async function runPatch(
  args: ReturnType<typeof parseArgs>,
  projectConfig: GstsConfig | undefined
): Promise<void> {
  const source = resolveGilPath(projectConfig, args)
  if (!fs.existsSync(source.path) || !fs.statSync(source.path).isFile())
    throw new Error(`[error] gil not found: ${source.path}`)
  let { bytes, hash: sourceHash } = readSource(source.path, args.expectedSourceHash)
  const entityId = args.entityId!
  if (args.attachAuxId !== undefined) bytes = attachAux(bytes, entityId, args.attachAuxId)
  if (args.detachAuxId !== undefined) bytes = detachAux(bytes, entityId, args.detachAuxId)
  if (args.auxId !== undefined) {
    if (args.color !== undefined) bytes = patchAuxColor(bytes, args.auxId, args.color)
    if (args.position !== undefined || args.rotation !== undefined || args.scale !== undefined) {
      const current = readAuxTransform(bytes, args.auxId)
      bytes = patchAuxTransform(bytes, args.auxId, {
        position: args.position ?? current.position,
        rotation: args.rotation ?? current.rotation,
        scale: args.scale ?? current.scale
      })
    }
  } else {
    if (args.color !== undefined) bytes = patchEntityColor(bytes, entityId, args.color)
    if (args.position !== undefined || args.rotation !== undefined || args.scale !== undefined) {
      const current = exportEntities(bytes).find((entity) => entity.id === entityId)
      if (!current) throw new Error(`[error] entity not found: ${entityId}`)
      bytes = patchEntityTransform(bytes, entityId, {
        position: args.position ?? current.position,
        rotation: args.rotation ?? current.rotation,
        scale: args.scale ?? current.scale
      })
    }
  }
  const changed = exportEntities(bytes).find((entity) => entity.id === entityId)
  console.log(`sourceSha256=${sourceHash}`)
  console.log(`candidateSha256=${sha256(bytes)}`)
  if (args.outputPath) {
    writeNew(args.outputPath, bytes)
    console.log(`candidate=${path.resolve(args.outputPath)}`)
  } else if (args.write) {
    const backup = writeBack(source.path, bytes, sourceHash)
    console.log(`backup=${backup}`)
    console.log(`writePerformed=true`)
    syncEditorTemp(source.path, args.mapId)
  } else {
    console.log('preview only; use --write to apply after backup, or --output for a candidate')
  }
  if (args.auxId !== undefined) {
    const t = readAuxTransform(bytes, args.auxId)
    console.log(
      `aux=${args.auxId} position=${t.position.join(',')} rotation=${t.rotation.join(',')} ` +
        `scale=${t.scale.join(',')}`
    )
  } else if (changed) {
    console.log(
      `entity=${changed.id} name=${changed.name} ` +
        `position=${changed.position.join(',')} rotation=${changed.rotation.join(',')} ` +
        `scale=${changed.scale.join(',')}${changed.color !== undefined && changed.color.enabled ? ` color=#${(changed.color.rgb & 0xffffff).toString(16).padStart(6, '0')}` : ''}`
    )
  }
  if (args.attachAuxId !== undefined) console.log(`attached aux=${args.attachAuxId} -> entity=${entityId}`)
  if (args.detachAuxId !== undefined) console.log(`detached aux=${args.detachAuxId} from entity=${entityId}`)
  console.log('editorOrGameValidation=not-performed; editor memory ignores disk writes, reload map before saving')
}

export async function runAssetsEntities(
  argv: readonly string[] = process.argv.slice(2),
  rootContext: RootContext = {}
) {
  const args = parseArgs(argv)
  let projectConfig = rootContext.projectConfig
  if (!projectConfig && rootContext.projectConfigPath) {
    projectConfig = await loadGstsConfig(rootContext.projectConfigPath, { profile: 'project' })
  }
  if (args.command === 'import') return runImport(args, projectConfig)
  if (args.command === 'apply-candidate') return runApplyCandidate(args, projectConfig)
  if (args.command === 'patch') return runPatch(args, projectConfig)
  return runExport(args, projectConfig)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  runAssetsEntities().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
