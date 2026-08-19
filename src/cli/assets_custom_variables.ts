import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import type {
  GstsConfig,
  GstsCustomVariableDeclaration,
  GstsCustomVariableOperation,
  GstsInjectConfig
} from '../compiler/gsts_config.js'
import type { UiDictPair, UiVarType } from './gil_level_variables.js'
import { resolveGilTarget } from './gil_paths.js'
import {
  applyCustomPrefabInitialCustomVariableDeclarations,
  applyEntityCustomVariableDeclarations,
  decodeCustomVariableValue,
  readEntityCustomVariables,
  syncPrefabCustomVariableDeclarations,
  type CustomVariableDeclaration,
  type CustomVariableInitialValue
} from './gil_custom_variables.js'
import { prettyStableJson } from './static_assembly/json.js'

function usage(): never {
  console.error(
    [
      'Usage: npm run assets:custom-variables -- [--config <file>] [--map-id <id> | --gil <file>]',
      '       [--write | --output <file>] [--operation <index>]',
      '       [--entity <id> --vars "a=1;b=[x,y];d:dict=k1=[a,b]&k2=3"] [--list] [--format json]'
    ].join('\n')
  )
  process.exit(1)
}

function parseArgs(argv: readonly string[]) {
  let configPath = 'gsts.config.ts'
  let mapId: number | undefined
  let gilPath: string | undefined
  let outputPath: string | undefined
  let write = false
  let operation: number | undefined
  let entityId: number | undefined
  let varsSpec: string | undefined
  let list = false
  let format: 'text' | 'json' = 'text'
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--config') configPath = argv[++i] ?? usage()
    else if (arg === '--map-id') mapId = Number(argv[++i])
    else if (arg === '--gil') gilPath = argv[++i] ?? usage()
    else if (arg === '--output') outputPath = argv[++i] ?? usage()
    else if (arg === '--operation') operation = Number(argv[++i])
    else if (arg === '--write') write = true
    else if (arg === '--entity') {
      entityId = Number(argv[++i])
      if (!Number.isSafeInteger(entityId) || entityId < 0) {
        throw new Error('[error] --entity must be a non-negative safe integer')
      }
    } else if (arg === '--vars') varsSpec = argv[++i] ?? usage()
    else if (arg === '--list') list = true
    else if (arg === '--format') {
      const raw = argv[++i]
      if (raw !== 'text' && raw !== 'json') throw new Error('[error] --format must be text or json')
      format = raw
    } else if (arg === '--help' || arg === '-h') usage()
    else usage()
  }
  if (gilPath && mapId !== undefined) throw new Error('[error] --gil and --map-id are mutually exclusive')
  if (write && outputPath) throw new Error('[error] --write and --output are mutually exclusive')
  if (operation !== undefined && (!Number.isInteger(operation) || operation < 0)) {
    throw new Error('[error] --operation must be a non-negative integer')
  }
  if (entityId !== undefined && (varsSpec !== undefined) === list) {
    throw new Error('[error] --entity requires exactly one of --vars or --list')
  }
  if (entityId === undefined && (varsSpec !== undefined || list)) {
    throw new Error('[error] --vars/--list require --entity <id>')
  }
  return { configPath, mapId, gilPath, outputPath, write, operation, entityId, varsSpec, list, format }
}

async function loadConfig(configPath: string): Promise<GstsConfig> {
  const absolute = path.resolve(configPath)
  const module = (await import(pathToFileURL(absolute).href)) as { default?: GstsConfig }
  const config = module.default
  if (!config || typeof config !== 'object') throw new Error('[error] invalid gsts config')
  return config
}

function resolveGilPath(config: GstsConfig, args: ReturnType<typeof parseArgs>): string {
  if (args.gilPath) return path.resolve(args.gilPath)
  const inject: GstsInjectConfig = { ...(config.inject ?? {}) }
  if (args.mapId !== undefined) inject.mapId = args.mapId
  if (inject.mapId === undefined) throw new Error('[error] mapId is required; use --map-id or configure inject.mapId')
  return resolveGilTarget(inject).gilPath
}

function validateOperation(operation: GstsCustomVariableOperation): void {
  if (!Number.isSafeInteger(operation.prefabId) || operation.prefabId < 0) {
    throw new Error(`[error] invalid prefabId: ${operation.prefabId}`)
  }
  if (operation.target === 'prefab' && operation.syncInstances) {
    throw new Error('[error] prefab operations cannot set syncInstances=true')
  }
  const names = new Set<string>()
  for (const declaration of operation.declarations) {
    if (!declaration.name || names.has(declaration.name)) {
      throw new Error(`[error] duplicate custom variable name: ${declaration.name}`)
    }
    names.add(declaration.name)
  }
}

function backupPath(gilPath: string): string {
  const directory = path.join(path.dirname(gilPath), '.gsts', 'backups')
  fs.mkdirSync(directory, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  return path.join(directory, `${path.basename(gilPath)}.${stamp}.bak`)
}

const SCALAR_IDS = new Set<UiVarType>(['entity', 'guid', 'faction', 'config_id', 'prefab_id'])
const NUMERIC_LIST_TYPES = new Set<UiVarType>([
  'guid_list',
  'int_list',
  'float_list',
  'entity_list',
  'config_id_list',
  'prefab_id_list',
  'faction_list'
])

const TYPE_NAMES: Record<string, UiVarType> = {
  entity: 'entity',
  guid: 'guid',
  int: 'int',
  bool: 'bool',
  float: 'float',
  str: 'str',
  vec3: 'vec3',
  guid_list: 'guid_list',
  int_list: 'int_list',
  bool_list: 'bool_list',
  float_list: 'float_list',
  str_list: 'str_list',
  entity_list: 'entity_list',
  vec3_list: 'vec3_list',
  faction: 'faction',
  config_id: 'config_id',
  prefab_id: 'prefab_id',
  config_id_list: 'config_id_list',
  prefab_id_list: 'prefab_id_list',
  faction_list: 'faction_list',
  dict: 'dict'
}

function parseListItems(raw: string): string[] {
  return raw
    .replace(/^\[(.*)\]$/, '$1')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s !== '')
}

function inferScalar(raw: string): { type: 'int' | 'bool' | 'float' | 'str'; value: boolean | bigint | number | string } {
  if (raw === 'true' || raw === 'false') return { type: 'bool', value: raw === 'true' }
  if (/^-?\d+$/.test(raw)) return { type: 'int', value: BigInt(raw) }
  if (/^-?\d+(\.\d+)?$/.test(raw)) return { type: 'float', value: Number(raw) }
  return { type: 'str', value: raw }
}

function inferList(raw: string): { type: 'int_list' | 'float_list' | 'str_list'; value: readonly bigint[] | readonly number[] | readonly string[] } {
  const items = parseListItems(raw)
  if (items.length > 0 && items.every((s) => /^-?\d+$/.test(s))) {
    return { type: 'int_list', value: items.map((s) => BigInt(s)) }
  }
  if (items.length > 0 && items.every((s) => /^-?\d+(\.\d+)?$/.test(s))) {
    return { type: 'float_list', value: items.map((s) => Number(s)) }
  }
  return { type: 'str_list', value: items }
}

function parseTypedValue(type: UiVarType, raw: string): CustomVariableInitialValue {
  if (type === 'bool') return raw === 'true' || raw === '1'
  if (type === 'int') return BigInt(raw)
  if (SCALAR_IDS.has(type)) return Number(raw)
  if (type === 'float') return Number(raw)
  if (type === 'str') return raw
  if (type === 'vec3') {
    const parts = raw.replace(/^\[(.*)\]$/, '$1').split(',').map((s) => Number(s.trim()))
    if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) {
      throw new Error(`[error] vec3 value must be three numbers: ${raw}`)
    }
    return [parts[0], parts[1], parts[2]]
  }
  if (type === 'bool_list') {
    return parseListItems(raw).map((s) => s === 'true' || s === '1')
  }
  if (type === 'str_list') return parseListItems(raw)
  if (type === 'vec3_list') {
    return raw
      .split('|')
      .map((triple) => {
        const parts = triple.split(',').map((s) => Number(s.trim()))
        if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) {
          throw new Error(`[error] vec3_list element must be three numbers: ${triple}`)
        }
        return [parts[0], parts[1], parts[2]] as [number, number, number]
      })
  }
  if (NUMERIC_LIST_TYPES.has(type)) {
    if (type === 'int_list' || type === 'float_list') {
      return parseListItems(raw).map((s) => (type === 'float_list' ? Number(s) : BigInt(s)))
    }
    return parseListItems(raw).map((s) => Number(s))
  }
  if (type === 'dict') {
    return parseDictValue(raw)
  }
  throw new Error(`[error] unsupported --vars type: ${type}`)
}

function parseDictValue(raw: string): UiDictPair[] {
  const pairs: UiDictPair[] = []
  for (const part of raw.split('&')) {
    const eq = part.indexOf('=')
    if (eq <= 0) throw new Error(`[error] invalid dict pair: ${part}`)
    const key = part.slice(0, eq).trim()
    const value = part.slice(eq + 1).trim()
    if (value.includes('|')) {
      // vec3_list：triples 以 | 分隔（与 --vars vec3_list 语法一致）
      const triples = value.split('|').map((t) => {
        const cleaned = t.replace(/^\[(.*)\]$/, '$1')
        const parts = cleaned.split(',').map((s) => Number(s.trim()))
        if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) {
          throw new Error(`[error] invalid vec3_list dict element: ${t}`)
        }
        return parts
      })
      pairs.push({ key, keyType: 'str', value: triples, valueType: 'vec3_list' })
    } else if (value.startsWith('[') && value.endsWith(']')) {
      const items = parseListItems(value)
      const bools = items.length > 0 && items.every((s) => s === 'true' || s === 'false')
      const ints = items.length > 0 && items.every((s) => /^-?\d+$/.test(s))
      const floats = items.length > 0 && items.every((s) => /^-?\d+(\.\d+)?$/.test(s))
      if (bools) {
        pairs.push({ key, keyType: 'str', value: items.map((s) => s === 'true'), valueType: 'bool_list' })
      } else if (ints) {
        pairs.push({ key, keyType: 'str', value: items.map((s) => Number(s)), valueType: 'int_list' })
      } else if (floats) {
        pairs.push({ key, keyType: 'str', value: items.map((s) => Number(s)), valueType: 'float_list' })
      } else {
        pairs.push({ key, keyType: 'str', value: items, valueType: 'str_list' })
      }
    } else if (/^-?\d+$/.test(value)) {
      pairs.push({ key, keyType: 'str', value: Number(value), valueType: 'int' })
    } else if (/^-?\d+(\.\d+)?$/.test(value)) {
      pairs.push({ key, keyType: 'str', value: Number(value), valueType: 'float' })
    } else {
      pairs.push({ key, keyType: 'str', value, valueType: 'str' })
    }
  }
  return pairs
}

/** 解析 --vars "name:type=value;name=value"，type 缺省时按值推断。 */
function parseVarsSpec(spec: string): CustomVariableDeclaration[] {
  const declarations: CustomVariableDeclaration[] = []
  const names = new Set<string>()
  for (const part of spec.split(';')) {
    const trimmed = part.trim()
    if (!trimmed) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) throw new Error(`[error] invalid --vars entry: ${part}`)
    const head = trimmed.slice(0, eq).trim()
    const rawValue = trimmed.slice(eq + 1).trim()
    const colon = head.indexOf(':')
    let name: string
    let type: UiVarType | undefined
    if (colon > 0) {
      name = head.slice(0, colon).trim()
      const typeName = head.slice(colon + 1).trim()
      if (!(typeName in TYPE_NAMES)) {
        throw new Error(`[error] unknown variable type: ${typeName}`)
      }
      type = TYPE_NAMES[typeName]
    } else {
      name = head
    }
    if (!name || names.has(name)) {
      throw new Error(`[error] duplicate or empty custom variable name: ${name || part}`)
    }
    names.add(name)
    if (type === undefined) {
      if (rawValue.startsWith('[') && rawValue.endsWith(']')) {
        const inferred = inferList(rawValue)
        declarations.push({ name, type: inferred.type, initialValue: inferred.value })
      } else {
        const inferred = inferScalar(rawValue)
        declarations.push({ name, type: inferred.type, initialValue: inferred.value })
      }
    } else {
      declarations.push({ name, type, initialValue: parseTypedValue(type, rawValue) })
    }
  }
  if (declarations.length === 0) throw new Error('[error] --vars must declare at least one variable')
  return declarations
}

export async function runAssetsCustomVariables(argv: readonly string[] = process.argv.slice(2)) {
  const args = parseArgs(argv)
  const config = await loadConfig(args.configPath)
  const sourcePath = resolveGilPath(config, args)
  if (!fs.statSync(sourcePath).isFile()) throw new Error(`[error] gil not found: ${sourcePath}`)

  if (args.entityId !== undefined && args.list) {
    const variables = readEntityCustomVariables({
      gilPath: sourcePath,
      entityId: args.entityId
    }).variables
    const rows = variables.map((definition) => ({
      name: definition.name,
      type: definition.type,
      value: decodeCustomVariableValue(definition)
    }))
    if (args.format === 'json') {
      process.stdout.write(
        prettyStableJson({ schemaVersion: 1, kind: 'entity-custom-variables-list', entityId: args.entityId, variables: rows })
      )
    } else {
      for (const row of rows) {
        console.log(`name=${row.name} type=${row.type} value=${JSON.stringify(row.value)}`)
      }
    }
    return
  }

  const temporary = path.join(os.tmpdir(), `gsts-assets-${process.pid}-${Date.now()}.gil`)
  fs.copyFileSync(sourcePath, temporary)
  try {
    let changed = 0
    let synchronized = 0
    let operations = 0
    if (args.entityId !== undefined && args.varsSpec !== undefined) {
      const declarations = parseVarsSpec(args.varsSpec)
      const result = applyEntityCustomVariableDeclarations({
        gilPath: temporary,
        entityId: args.entityId,
        declarations
      })
      fs.writeFileSync(temporary, result.bytes)
      changed += result.changed.length
      operations = 1
    } else {
      const operationsList = [...(config.assets?.customVariables ?? [])]
      const selected = args.operation === undefined ? operationsList : [operationsList[args.operation]]
      if (selected.some((operation) => !operation)) throw new Error('[error] operation index out of range')
      if (selected.length === 0) throw new Error('[error] assets.customVariables is empty')
      selected.forEach(validateOperation)
      for (const operation of selected) {
        const declarations = operation.declarations as readonly GstsCustomVariableDeclaration[]
        const result = applyCustomPrefabInitialCustomVariableDeclarations({
          gilPath: temporary,
          prefabId: operation.prefabId,
          declarations
        })
        fs.writeFileSync(temporary, result.bytes)
        changed += result.changed.length
        if (operation.syncInstances) {
          const sync = syncPrefabCustomVariableDeclarations({
            gilPath: temporary,
            prefabId: operation.prefabId,
            declarations
          })
          fs.writeFileSync(temporary, sync.bytes)
          synchronized += sync.synchronizedInstanceCount
          changed += sync.changed.length
        }
      }
      operations = selected.length
    }
    const resultPath = args.outputPath ? path.resolve(args.outputPath) : sourcePath
    if (args.write || args.outputPath) {
      if (args.write) {
        const backup = backupPath(sourcePath)
        fs.copyFileSync(sourcePath, backup)
        console.log(`backup=${backup}`)
      } else if (fs.existsSync(resultPath)) {
        throw new Error(`[error] output already exists: ${resultPath}`)
      }
      fs.mkdirSync(path.dirname(resultPath), { recursive: true })
      fs.copyFileSync(temporary, resultPath)
      console.log(`written=${resultPath}`)
    } else {
      console.log(`preview=${sourcePath}`)
    }
    console.log(`operations=${operations} changed=${changed} synchronizedInstances=${synchronized}`)
  } finally {
    fs.rmSync(temporary, { force: true })
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  runAssetsCustomVariables().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
