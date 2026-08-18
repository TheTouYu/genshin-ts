import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import type { GstsConfig } from '../compiler/gsts_config.js'
import type { GstsInjectConfig } from '../compiler/gsts_config.js'
import { resolveGilTarget } from './gil_paths.js'
import {
  createLevelVariable,
  createLevelVariableTyped,
  listLevelVariables,
  uiVarTypeFromCode,
  updateLevelVariable,
  type UiDictPair,
  type UiVarType
} from './gil_level_variables.js'
import { prettyStableJson } from './static_assembly/json.js'

type Command = 'list' | 'create' | 'update'
type Format = 'text' | 'json'

const TYPE_CODES: Record<string, UiVarType> = {
  entity: 'entity',
  guid: 'guid',
  bool: 'bool',
  int: 'int',
  str: 'str',
  float: 'float',
  vec3: 'vec3',
  faction: 'faction',
  config_id: 'config_id',
  prefab_id: 'prefab_id',
  guid_list: 'guid_list',
  int_list: 'int_list',
  bool_list: 'bool_list',
  str_list: 'str_list',
  float_list: 'float_list',
  entity_list: 'entity_list',
  vec3_list: 'vec3_list',
  config_id_list: 'config_id_list',
  prefab_id_list: 'prefab_id_list',
  faction_list: 'faction_list',
  dict: 'dict'
}

const ALL_TYPE_NAMES = Object.keys(TYPE_CODES).join('|')

function usage(exitCode = 1): never {
  const output = [
    'List, create or update entity custom variables (关卡变量 = 关卡实体变量, root5 f7[11].11).',
    '',
    'Usage: gsts assets:level-variables [list|create|update] [options]',
    '',
    '  list: gsts assets:level-variables list [--entity <id>] [--gil <file>] [--format json]',
    '  create: gsts assets:level-variables create --name <name> --type <type> [--value <v>] [--entity <id>]',
    '  update: gsts assets:level-variables update --name <current> [--value <v>] [--new-name <n>] [--entity <id>]',
    '',
    'Options:',
    '  --entity <id>           scene entity id (default 1094713345 = 关卡实体)',
    '  --gil <file>            explicit GIL source',
    '  --name <name>           variable name (current for update)',
    '  --new-name <name>       rename variable (update only)',
    `  --type <type>           ${ALL_TYPE_NAMES}`,
    '  --value <v>             scalar "1"/"true"/"1.5"/"str"/vec3 "x,y,z";',
    '                          list "a,b,c"; dict "k=v;k2=v2" or "k1=[a,b]&k2=3";',
    '                          update parses --value by the variable\'s existing type',
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
  let type: UiVarType | undefined
  let rawValue: string | undefined
  let newName: string | undefined
  let entityId: number | undefined
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
    else if (arg === '--entity') {
      entityId = Number(value(argv, index++))
      if (!Number.isSafeInteger(entityId) || entityId < 0)
        throw new Error('[error] --entity must be a non-negative safe integer')
    } else if (arg === '--type') {
      const raw = value(argv, index++)
      if (!(raw in TYPE_CODES)) {
        throw new Error(`[error] --type must be one of: ${ALL_TYPE_NAMES}`)
      }
      type = TYPE_CODES[raw]
    } else if (arg === '--value') rawValue = value(argv, index++)
    else if (arg === '--help' || arg === '-h') usage(0)
    else usage()
  }
  if (command === 'create') {
    if (!name) throw new Error('[error] create requires --name <name>')
    if (!type) throw new Error('[error] create requires --type')
  }
  if (command === 'update') {
    if (!name) throw new Error('[error] update requires --name <current>')
    if (rawValue === undefined && newName === undefined)
      throw new Error('[error] update requires --value or --new-name')
  }
  if (write && outputPath) throw new Error('[error] --write and --output are mutually exclusive')
  return { command, gilPath, outputPath, write, format, name, type, rawValue, newName, entityId }
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

function parseCreateValue(type: UiVarType, raw: string | undefined): unknown {
  if (raw === undefined) return undefined
  if (type === 'int' || type === 'float' || type === 'entity' || type === 'guid' || type === 'faction' || type === 'config_id' || type === 'prefab_id')
    return Number(raw)
  if (type === 'bool') return raw === 'true' || raw === '1'
  if (type === 'str') return raw
  if (type === 'vec3') return raw.split(',').map((s) => Number(s.trim())).filter((n) => Number.isFinite(n))
  if (type === 'int_list' || type === 'bool_list' || type === 'float_list' || type === 'guid_list' || type === 'entity_list' || type === 'config_id_list' || type === 'prefab_id_list' || type === 'faction_list')
    return raw
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s !== '')
      .map((s) => (type === 'bool_list' ? s === 'true' || s === '1' : Number(s)))
      .filter((v) => typeof v === 'boolean' || Number.isFinite(v))
  if (type === 'str_list') return raw.split(',').map((s) => s.trim()).filter((s) => s !== '')
  if (type === 'vec3_list')
    return raw
      .split('|')
      .map((triple) => triple.split(',').map((s) => Number(s.trim())).filter((n) => Number.isFinite(n)))
  if (type === 'dict') {
    const pairs: UiDictPair[] = []
    // 分隔符兼容 assets:custom-variables 的 "k1=[a,b]&k2=3" 与历史 "k=v;k2=v2"
    for (const part of raw.split(/[;&]/)) {
      const trimmed = part.trim()
      if (!trimmed) continue
      const eq = trimmed.indexOf('=')
      if (eq <= 0) throw new Error(`[error] invalid dict pair: ${part}`)
      const k = trimmed.slice(0, eq).trim()
      const v = trimmed.slice(eq + 1).trim()
      // 列表值用 [a,b,c] 包裹；数值列表 → int_list，否则 str_list
      if (v.startsWith('[') && v.endsWith(']')) {
        const items = v.slice(1, -1).split(',').map((s) => s.trim()).filter((s) => s !== '')
        const numeric = items.every((s) => /^-?\d+$/.test(s))
        pairs.push({
          key: k,
          keyType: 'str',
          value: numeric ? items.map((s) => Number(s)) : items,
          valueType: numeric ? 'int_list' : 'str_list'
        })
      } else {
        const numeric = /^-?\d+$/.test(v)
        pairs.push({
          key: k,
          keyType: 'str',
          value: numeric ? Number(v) : v,
          valueType: numeric ? 'int' : 'str'
        })
      }
    }
    return pairs
  }
  return raw
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
    const vars = listLevelVariables(sourceBytes, args.entityId)
    if (jsonMode) {
      process.stdout.write(prettyStableJson({ schemaVersion: 1, kind: 'level-variables-list', variables: vars }))
    } else {
      for (const v of vars) log(`name=${v.name} type=${v.type} value=${JSON.stringify(v.value)}`)
    }
    return
  }

  let result: { bytes: Uint8Array; name: string }
  if (args.command === 'create') {
    const type = args.type!
    const value = parseCreateValue(type, args.rawValue)
    if (type === 'bool' || type === 'int') {
      result = createLevelVariable(sourceBytes, args.name!, type, value as number | boolean, args.entityId)
    } else {
      result = createLevelVariableTyped(sourceBytes, args.name!, type, value, args.entityId)
    }
  } else {
    // update：先按变量现有类型解析 --value，保证全类型值更新
    let value: unknown
    if (args.rawValue !== undefined) {
      const existing = listLevelVariables(sourceBytes, args.entityId)
      const variable = existing.find((v) => v.name === args.name)
      if (!variable) throw new Error(`[error] level variable not found: ${args.name}`)
      const uiType = uiVarTypeFromCode(variable.typeCode)
      if (!uiType) throw new Error(`[error] unknown level variable type code: ${variable.typeCode}`)
      value = parseCreateValue(uiType, args.rawValue)
    }
    result = updateLevelVariable(
      sourceBytes,
      args.name!,
      {
        ...(value !== undefined ? { value } : {}),
        ...(args.newName !== undefined ? { newName: args.newName } : {})
      },
      args.entityId
    )
  }
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
