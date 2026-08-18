import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import type { GstsConfig } from '../compiler/gsts_config.js'
import type { GstsInjectConfig } from '../compiler/gsts_config.js'
import { resolveGilTarget } from './gil_paths.js'
import { resyncMap } from './maps.js'
import {
  cloneTemplate,
  cloneUiControl,
  createUiControl,
  listTemplates,
  listUiControls,
  updateUiControl,
  type UiCreateType,
  type UiUpdateOptions
} from './gil_ui.js'
import { prettyStableJson } from './static_assembly/json.js'

type Command = 'list' | 'clone' | 'update' | 'template' | 'create'
type TemplateSub = 'list' | 'clone'
type Format = 'text' | 'json'
type Vector2 = readonly [number, number]

function usage(exitCode = 1): never {
  const output = [
    'List, clone (create) or update screen UI controls and templates (root 9).',
    '',
    'Usage: gsts assets:ui [list|clone|create|update|template] [options]',
    '',
    '  list: gsts assets:ui list [--gil <file>] [--format json]',
    '  clone: gsts assets:ui clone <source-id> --id <new-id> [options]',
    '  create: gsts assets:ui create --type textbox|interactive-button|custom-button --id <new-id> [options]',
    '  update: gsts assets:ui update <control-id> [options]',
    '  template list: gsts assets:ui template list [--gil <file>] [--format json]',
    '  template clone: gsts assets:ui template clone <source-id> --id <new-id> [--name <name>]',
    '',
    'Options:',
    '  --gil <file>            explicit GIL source',
    '  --donor-gil <file>      donor GIL containing the source control (clone only)',
    '  --output <file>         create output without overwriting',
    '  --write                 atomically write source GIL after backup',
    '  --name <name>           set control name',
    '  --content <text>        set display content (textbox path)',
    '  --position <x,y>        set position (screen-center offset)',
    '  --size <w,h>            set size (width,height)',
    '  --format <text|json>    output format (default: text)',
    '  -h, --help              show help',
    '',
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

function parseVector2(raw: string, option: string): Vector2 {
  const parts = raw.split(',')
  if (parts.length !== 2) throw new Error(`[error] ${option} must be x,y or w,h`)
  const values = parts.map((part) => Number(part))
  if (values.some((value) => !Number.isFinite(value)))
    throw new Error(`[error] ${option} must contain numbers`)
  return [values[0], values[1]]
}

function parseArgs(argv: readonly string[]) {
  let command: Command = 'list'
  let templateSub: TemplateSub = 'list'
  let gilPath: string | undefined
  let donorGilPath: string | undefined
  let outputPath: string | undefined
  let write = false
  let format: Format = 'text'
  let targetId: number | undefined
  let newId: number | undefined
  let name: string | undefined
  let content: string | undefined
  let position: Vector2 | undefined
  let size: Vector2 | undefined
  let createType: UiCreateType | undefined
  let index = 0
  if (
    argv[0] === 'list' ||
    argv[0] === 'clone' ||
    argv[0] === 'create' ||
    argv[0] === 'update' ||
    argv[0] === 'template'
  ) {
    command = argv[0]
    index++
    if (command === 'template') {
      if (argv[1] === 'list' || argv[1] === 'clone') {
        templateSub = argv[1]
        index++
      } else {
        usage()
      }
    }
  }
  for (; index < argv.length; index++) {
    const arg = argv[index]
    if (arg === '--gil') gilPath = value(argv, index++)
    else if (arg === '--donor-gil') donorGilPath = value(argv, index++)
    else if (arg === '--output') outputPath = value(argv, index++)
    else if (arg === '--write') write = true
    else if (arg === '--format') {
      const raw = value(argv, index++)
      if (raw !== 'text' && raw !== 'json') throw new Error('[error] --format must be text or json')
      format = raw
    } else if (arg === '--id') newId = nonNegativeId(value(argv, index++), '--id')
    else if (arg === '--name') name = value(argv, index++)
    else if (arg === '--content') content = value(argv, index++)
    else if (arg === '--position') position = parseVector2(value(argv, index++), '--position')
    else if (arg === '--size') size = parseVector2(value(argv, index++), '--size')
    else if (arg === '--type') {
      const raw = value(argv, index++)
      if (raw !== 'textbox' && raw !== 'interactive-button' && raw !== 'custom-button') {
        throw new Error('[error] --type must be textbox, interactive-button or custom-button')
      }
      createType = raw
    } else if (arg === '--help' || arg === '-h') usage(0)
    else if (command !== 'list' && targetId === undefined) {
      targetId = nonNegativeId(arg, 'control-id')
    } else usage()
  }
  if (command === 'clone' && targetId === undefined) throw new Error('[error] clone requires <source-id>')
  if (command === 'clone' && newId === undefined) throw new Error('[error] clone requires --id <new-id>')
  if (command === 'create' && createType === undefined)
    throw new Error('[error] create requires --type <textbox|interactive-button|custom-button>')
  if (command === 'create' && newId === undefined) throw new Error('[error] create requires --id <new-id>')
  if (command === 'update' && targetId === undefined) throw new Error('[error] update requires <control-id>')
  if (command === 'update' && name === undefined && content === undefined && position === undefined && size === undefined) {
    throw new Error('[error] update requires at least one of --name/--content/--position/--size')
  }
  if (write && outputPath) throw new Error('[error] --write and --output are mutually exclusive')
  return { command, templateSub, gilPath, donorGilPath, outputPath, write, format, targetId, newId, name, content, position, size, createType }
}

function resolveGilPath(args: ReturnType<typeof parseArgs>, projectConfig: GstsConfig | undefined): string {
  if (args.gilPath) return path.resolve(args.gilPath)
  const inject: GstsInjectConfig = { ...(projectConfig?.inject ?? {}) }
  if (inject.mapId === undefined) {
    throw new Error('[error] mapId is required; use --gil, or provide a project config with inject.mapId')
  }
  return resolveGilTarget(inject).gilPath
}

function writeNew(outputPath: string, contents: Uint8Array): string {
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

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(Buffer.from(bytes)).digest('hex')
}

function writeBack(gilPath: string, candidate: Uint8Array, sourceHash: string, mapId?: number): string {
  const currentHash = sha256(new Uint8Array(fs.readFileSync(gilPath)))
  if (currentHash !== sourceHash) {
    throw new Error(`[error] source changed during operation: expected ${sourceHash}, got ${currentHash}`)
  }
  const backup = backupPath(gilPath)
  fs.copyFileSync(gilPath, backup)
  fs.writeFileSync(gilPath, candidate)
  if (mapId !== undefined) {
    try {
      resyncMap(path.dirname(gilPath), mapId)
    } catch {
      // best-effort temp sync
    }
  }
  return backup
}

async function execute(argv: readonly string[], projectConfig: GstsConfig | undefined) {
  const args = parseArgs(argv)
  const gilPath = resolveGilPath(args, projectConfig)
  if (!fs.existsSync(gilPath) || !fs.statSync(gilPath).isFile()) {
    throw new Error(`[error] gil not found: ${gilPath}`)
  }
  const sourceBytes = new Uint8Array(fs.readFileSync(gilPath))
  const sourceHash = sha256(sourceBytes)
  const jsonMode = args.format === 'json'
  const log = (line: string) => (jsonMode ? console.error(line) : console.log(line))

  if (args.command === 'list') {
    const controls = listUiControls(sourceBytes)
    if (jsonMode) {
      process.stdout.write(prettyStableJson({ schemaVersion: 1, kind: 'ui-list', controls }))
    } else {
      for (const c of controls)
        log(`id=${c.id} name=${c.name} category=${c.category} layout=${c.layoutId}`)
    }
    return
  }

  if (args.command === 'template') {
    if (args.templateSub === 'list') {
      const templates = listTemplates(sourceBytes)
      if (jsonMode) {
        process.stdout.write(prettyStableJson({ schemaVersion: 1, kind: 'ui-template-list', templates }))
      } else {
        for (const t of templates) log(`id=${t.id} name=${t.name} category=${t.category}`)
      }
    } else {
      // template clone
      const donorBytes = args.donorGilPath
        ? new Uint8Array(fs.readFileSync(path.resolve(args.donorGilPath)))
        : undefined
      const result = cloneTemplate(
        sourceBytes,
        args.targetId!,
        {
          id: args.newId!,
          ...(args.name !== undefined ? { name: args.name } : {})
        },
        donorBytes
      )
      const summary: Record<string, unknown> = {
        schemaVersion: 1,
        kind: 'ui-template-clone',
        sourceSha256: sourceHash,
        newId: result.id
      }
      const log2 = (line: string) => (jsonMode ? console.error(line) : console.log(line))
      log2(`newId=${result.id}`)
      summary.candidateSha256 = sha256(result.bytes)
      log2(`candidateSha256=${sha256(result.bytes)}`)
      if (args.outputPath) {
        summary.candidate = writeNew(args.outputPath, result.bytes)
        log2(`candidate=${summary.candidate}`)
      } else if (args.write) {
        const mapId = projectConfig?.inject?.mapId
        summary.backup = writeBack(gilPath, result.bytes, sourceHash, mapId)
        summary.writePerformed = true
        log2(`backup=${summary.backup}`)
        log2('writePerformed=true')
      } else {
        summary.previewOnly = true
        log2('preview only; use --write to apply after backup, or --output for a candidate')
      }
      if (jsonMode) process.stdout.write(prettyStableJson(summary))
    }
    return
  }

  if (args.command === 'create') {
    const result = createUiControl(sourceBytes, {
      type: args.createType!,
      id: args.newId!,
      ...(args.name !== undefined ? { name: args.name } : {}),
      ...(args.content !== undefined ? { content: args.content } : {}),
      ...(args.position !== undefined ? { position: args.position } : {}),
      ...(args.size !== undefined ? { size: args.size } : {})
    })
    const summary: Record<string, unknown> = {
      schemaVersion: 1,
      kind: 'ui-create',
      sourceSha256: sourceHash,
      newId: result.id
    }
    const log2 = (line: string) => (jsonMode ? console.error(line) : console.log(line))
    log2(`newId=${result.id}`)
    summary.candidateSha256 = sha256(result.bytes)
    log2(`candidateSha256=${sha256(result.bytes)}`)
    if (args.outputPath) {
      summary.candidate = writeNew(args.outputPath, result.bytes)
      log2(`candidate=${summary.candidate}`)
    } else if (args.write) {
      const mapId = projectConfig?.inject?.mapId
      summary.backup = writeBack(gilPath, result.bytes, sourceHash, mapId)
      summary.writePerformed = true
      log2(`backup=${summary.backup}`)
      log2('writePerformed=true')
    } else {
      summary.previewOnly = true
      log2('preview only; use --write to apply after backup, or --output for a candidate')
    }
    if (jsonMode) process.stdout.write(prettyStableJson(summary))
    return
  }

  let candidate: Uint8Array
  const summary: Record<string, unknown> = { schemaVersion: 1, kind: `ui-${args.command}`, sourceSha256: sourceHash }

  if (args.command === 'clone') {
    const donorBytes = args.donorGilPath
      ? new Uint8Array(fs.readFileSync(path.resolve(args.donorGilPath)))
      : undefined
    const result = cloneUiControl(
      sourceBytes,
      args.targetId!,
      {
        id: args.newId!,
        ...(args.name !== undefined ? { name: args.name } : {}),
        ...(args.content !== undefined ? { content: args.content } : {}),
        ...(args.position !== undefined ? { position: args.position } : {}),
        ...(args.size !== undefined ? { size: args.size } : {})
      },
      donorBytes
    )
    candidate = result.bytes
    summary.newId = result.id
    if (donorBytes) summary.donorGil = args.donorGilPath
    log(`newId=${result.id}`)
  } else {
    const options: UiUpdateOptions = {
      ...(args.name !== undefined ? { name: args.name } : {}),
      ...(args.content !== undefined ? { content: args.content } : {}),
      ...(args.position !== undefined ? { position: args.position } : {}),
      ...(args.size !== undefined ? { size: args.size } : {})
    }
    const result = updateUiControl(sourceBytes, args.targetId!, options)
    candidate = result.bytes
    summary.changed = result.changed
    log(`changed=${result.changed.join(',')}`)
  }

  summary.candidateSha256 = sha256(candidate)
  log(`candidateSha256=${sha256(candidate)}`)

  if (args.outputPath) {
    summary.candidate = writeNew(args.outputPath, candidate)
    log(`candidate=${summary.candidate}`)
  } else if (args.write) {
    const mapId = projectConfig?.inject?.mapId
    summary.backup = writeBack(gilPath, candidate, sourceHash, mapId)
    summary.writePerformed = true
    log(`backup=${summary.backup}`)
    log('writePerformed=true')
  } else {
    summary.previewOnly = true
    log('preview only; use --write to apply after backup, or --output for a candidate')
  }
  log('editorOrGameValidation=not-performed; editor memory ignores disk writes, reload map before saving')
  if (jsonMode) process.stdout.write(prettyStableJson(summary))
}

export async function runAssetsUi(
  argv: readonly string[] = process.argv.slice(2),
  projectConfig?: GstsConfig
): Promise<void> {
  await execute(argv, projectConfig)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  runAssetsUi().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
