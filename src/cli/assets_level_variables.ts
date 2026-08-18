import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import type { GstsConfig } from '../compiler/gsts_config.js'
import type { GstsInjectConfig } from '../compiler/gsts_config.js'
import { resolveGilTarget } from './gil_paths.js'
import {
  createLevelVariable,
  listLevelVariables,
  updateLevelVariable
} from './gil_level_variables.js'
import { prettyStableJson } from './static_assembly/json.js'

type Command = 'list' | 'create' | 'update'
type Format = 'text' | 'json'

function usage(exitCode = 1): never {
  const output = [
    'List or create level variables (关卡变量, root5 level entity f7[11].11).',
    '',
    'Usage: gsts assets:level-variables [list|create|update] [options]',
    '',
    '  list: gsts assets:level-variables list [--gil <file>] [--format json]',
    '  create: gsts assets:level-variables create --name <name> --type bool|int [--value <0|1|number|true|false>]',
    '  update: gsts assets:level-variables update --name <current> [--value <v>] [--new-name <n>]',
    '',
    'Options:',
    '  --gil <file>            explicit GIL source',
    '  --name <name>           variable name (current for update)',
    '  --new-name <name>       rename variable (update only)',
    '  --type <bool|int>       variable type',
    '  --value <v>             default value',
    '  --output <file>         create output without overwriting',
    '  --write                 atomically write source GIL after backup',
    '  --format <text|json>    output format (default: text)',
    '  -h, --help              show help'
  ].join('\n')
  console[exitCode === 0 ? 'log' : 'error'](output)
  process.exit(exitCode)
}

function value(argv: readonly string[], index: number): string {
  const result = argv[index + 1]
  if (!result || result.startsWith('--')) usage()
  return result
}

function parseArgs(argv: readonly string[]) {
  let command: Command = 'list'
  let gilPath: string | undefined
  let outputPath: string | undefined
  let write = false
  let format: Format = 'text'
  let name: string | undefined
  let type: 'bool' | 'int' | undefined
  let rawValue: string | undefined
  let newName: string | undefined
  let index = 0
  if (argv[0] === 'list' || argv[0] === 'create' || argv[0] === 'update') {
    command = argv[0]
    index++
  }
  for (; index < argv.length; index++) {
    const arg = argv[index]
    if (arg === '--gil') gilPath = value(argv, index++)
    else if (arg === '--output') outputPath = value(argv, index++)
    else if (arg === '--write') write = true
    else if (arg === '--format') {
      const raw = value(argv, index++)
      if (raw !== 'text' && raw !== 'json') throw new Error('[error] --format must be text or json')
      format = raw
    } else if (arg === '--name') name = value(argv, index++)
    else if (arg === '--new-name') newName = value(argv, index++)
    else if (arg === '--type') {
      const raw = value(argv, index++)
      if (raw !== 'bool' && raw !== 'int') throw new Error('[error] --type must be bool or int')
      type = raw
    } else if (arg === '--value') rawValue = value(argv, index++)
    else if (arg === '--help' || arg === '-h') usage(0)
    else usage()
  }
  if (command === 'create') {
    if (!name) throw new Error('[error] create requires --name <name>')
    if (!type) throw new Error('[error] create requires --type <bool|int>')
  }
  if (command === 'update') {
    if (!name) throw new Error('[error] update requires --name <current>')
    if (rawValue === undefined && newName === undefined)
      throw new Error('[error] update requires --value or --new-name')
  }
  if (write && outputPath) throw new Error('[error] --write and --output are mutually exclusive')
  return { command, gilPath, outputPath, write, format, name, type, rawValue, newName }
}

function resolveGilPath(args: ReturnType<typeof parseArgs>, projectConfig: GstsConfig | undefined): string {
  if (args.gilPath) return path.resolve(args.gilPath)
  const inject: GstsInjectConfig = { ...(projectConfig?.inject ?? {}) }
  if (inject.mapId === undefined) {
    throw new Error('[error] mapId is required; use --gil or configure inject.mapId')
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

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(Buffer.from(bytes)).digest('hex')
}

function backupPath(gilPath: string): string {
  const directory = path.join(path.dirname(gilPath), '.gsts', 'backups')
  fs.mkdirSync(directory, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  return path.join(directory, `${path.basename(gilPath)}.${stamp}.bak`)
}

function writeBack(gilPath: string, candidate: Uint8Array, sourceHash: string): string {
  const currentHash = sha256(new Uint8Array(fs.readFileSync(gilPath)))
  if (currentHash !== sourceHash) {
    throw new Error(`[error] source changed during operation: expected ${sourceHash}, got ${currentHash}`)
  }
  const backup = backupPath(gilPath)
  fs.copyFileSync(gilPath, backup)
  fs.writeFileSync(gilPath, candidate)
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
    const vars = listLevelVariables(sourceBytes)
    if (jsonMode) {
      process.stdout.write(prettyStableJson({ schemaVersion: 1, kind: 'level-variables-list', variables: vars }))
    } else {
      for (const v of vars) log(`name=${v.name} type=${v.type} value=${v.value}`)
    }
    return
  }

  let value: number | boolean | undefined
  if (args.rawValue !== undefined) {
    if (args.type === 'bool') value = args.rawValue === 'true' || args.rawValue === '1'
    else if (args.type === 'int') value = Number(args.rawValue)
    else if (args.rawValue === 'true' || args.rawValue === 'false') value = args.rawValue === 'true'
    else value = Number(args.rawValue)
  }
  const result =
    args.command === 'update'
      ? updateLevelVariable(sourceBytes, args.name!, {
          ...(value !== undefined ? { value } : {}),
          ...(args.newName !== undefined ? { newName: args.newName } : {})
        })
      : createLevelVariable(sourceBytes, args.name!, args.type!, value)
  const summary: Record<string, unknown> = {
    schemaVersion: 1,
    kind: `level-variables-${args.command}`,
    sourceSha256: sourceHash,
    name: result.name
  }
  log(`name=${result.name}`)
  summary.candidateSha256 = sha256(result.bytes)
  log(`candidateSha256=${sha256(result.bytes)}`)
  if (args.outputPath) {
    summary.candidate = writeNew(args.outputPath, result.bytes)
    log(`candidate=${summary.candidate}`)
  } else if (args.write) {
    summary.backup = writeBack(gilPath, result.bytes, sourceHash)
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

export async function runAssetsLevelVariables(
  argv: readonly string[] = process.argv.slice(2),
  projectConfig?: GstsConfig
): Promise<void> {
  await execute(argv, projectConfig)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  runAssetsLevelVariables().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
