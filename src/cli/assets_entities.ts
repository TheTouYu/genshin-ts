import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import type { GstsConfig } from '../compiler/gsts_config.js'
import type { GstsInjectConfig } from '../compiler/gsts_config.js'
import { loadGstsConfig } from '../compiler/config_loader.js'
import { t } from '../i18n/index.js'
import { resolveGilTarget } from './gil_paths.js'
import { applyEntities, exportEntities, type EntityImport } from './gil_entities.js'
import {
  emitWireMessage,
  parseWireMessage,
  wireRecords,
  wireRecordId
} from './static_assembly/wire.js'
import { prettyStableJson } from './static_assembly/json.js'

type Command = 'export' | 'import'
type Format = 'text' | 'json'
type RootContext = { projectConfigPath?: string; projectConfig?: GstsConfig }

type EntitiesFile = {
  schemaVersion: number
  entities: EntityImport[]
}

function usage(exitCode = 1): never {
  const output = [
    'Export or import scene entities (root 5) of a GIL map.',
    '',
    'Usage: gsts assets:entities [export|import] [options]',
    '',
    '  --entities <file>      entity import JSON (import only)',
    '  --definitions-gil <file>  donor GIL for definition records (import only)',
    '  --map-id <id>          target map ID (location only)',
    '  --gil <file>           explicit GIL source',
    '  --format <text|json>   output format (default: text)',
    '  --output <file>        create output without overwriting',
    '  --write                write source GIL after backup (import only)',
    '  -h, --help             show help',
    '',
    'Import entities are created from their component definition record;',
    'components are inherited byte-for-byte. This command modifies .gil asset',
    'structures. It is not GIA NodeGraph injection, runtime createPrefab, or',
    'editor/game verification.'
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

function parseArgs(argv: readonly string[]) {
  let command: Command = 'export'
  let mapId: number | undefined
  let gilPath: string | undefined
  let outputPath: string | undefined
  let entitiesPath: string | undefined
  let definitionsGilPath: string | undefined
  let write = false
  let format: Format = 'text'
  let index = 0
  if (argv[0] === 'import' || argv[0] === 'export') {
    command = argv[0]
    index++
  }
  for (; index < argv.length; index++) {
    const arg = argv[index]
    if (arg === '--map-id') mapId = nonNegativeId(value(argv, index++), '--map-id')
    else if (arg === '--gil') gilPath = value(argv, index++)
    else if (arg === '--output') outputPath = value(argv, index++)
    else if (arg === '--entities') entitiesPath = value(argv, index++)
    else if (arg === '--definitions-gil') definitionsGilPath = value(argv, index++)
    else if (arg === '--format') {
      const raw = value(argv, index++)
      if (raw !== 'text' && raw !== 'json') throw new Error('[error] --format must be text or json')
      format = raw
    } else if (arg === '--write') write = true
    else if (arg === '--help' || arg === '-h') usage(0)
    else usage()
  }
  if (gilPath && mapId !== undefined)
    throw new Error('[error] --gil and --map-id are mutually exclusive')
  if (command === 'import' && !entitiesPath)
    throw new Error('[error] import requires --entities <file>')
  if (write && outputPath) throw new Error('[error] --write and --output are mutually exclusive')
  return { command, mapId, gilPath, outputPath, entitiesPath, definitionsGilPath, write, format }
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
    return {
      name: item.name,
      id: item.id as number,
      definitionId: item.definitionId as number,
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
  const bytes = new Uint8Array(fs.readFileSync(source.path))
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
  }
  const after = fs.statSync(source.path)
  if (before.mtimeMs !== after.mtimeMs || before.size !== after.size) {
    throw new Error('[error] export source changed during read-only operation')
  }
}

async function runImport(
  args: ReturnType<typeof parseArgs>,
  projectConfig: GstsConfig | undefined
): Promise<void> {
  const entities = loadEntitiesFile(args.entitiesPath!)
  const source = resolveGilPath(projectConfig, args)
  if (!fs.existsSync(source.path) || !fs.statSync(source.path).isFile())
    throw new Error(`[error] gil not found: ${source.path}`)
  const sourceBytes = new Uint8Array(fs.readFileSync(source.path))
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
  const missing = entities.entities.filter(
    (entity) =>
      !definitions.some((record) => wireRecordId(record) === entity.definitionId)
  )
  if (missing.length) {
    throw new Error(
      `[error] definition IDs not found in map: ${[...new Set(missing.map((entity) => entity.definitionId))].join(', ')}`
    )
  }
  const candidate = applyEntities({ bytes: sourceBytes, definitions, entities: entities.entities })
  if (args.outputPath) {
    writeNew(args.outputPath, candidate)
    console.log(`candidate=${path.resolve(args.outputPath)}`)
  } else if (args.write) {
    const backup = backupPath(source.path)
    fs.copyFileSync(source.path, backup)
    fs.writeFileSync(source.path, candidate)
    console.log(`backup=${backup}`)
    console.log(`writePerformed=true`)
  } else {
    console.log(`entities=${entities.entities.length}`)
    console.log('preview only; use --write to apply after backup, or --output for a candidate')
  }
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
  return runExport(args, projectConfig)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  runAssetsEntities().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
