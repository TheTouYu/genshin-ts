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
import { resolveGilTarget } from './gil_paths.js'
import {
  applyCustomPrefabInitialCustomVariableDeclarations,
  syncPrefabCustomVariableDeclarations
} from './gil_custom_variables.js'

function usage(): never {
  console.error(
    [
      'Usage: npm run assets:custom-variables -- [--config <file>] [--map-id <id> | --gil <file>]',
      '       [--write | --output <file>] [--operation <index>]'
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
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--config') configPath = argv[++i] ?? usage()
    else if (arg === '--map-id') mapId = Number(argv[++i])
    else if (arg === '--gil') gilPath = argv[++i] ?? usage()
    else if (arg === '--output') outputPath = argv[++i] ?? usage()
    else if (arg === '--operation') operation = Number(argv[++i])
    else if (arg === '--write') write = true
    else if (arg === '--help' || arg === '-h') usage()
    else usage()
  }
  if (gilPath && mapId !== undefined) throw new Error('[error] --gil and --map-id are mutually exclusive')
  if (write && outputPath) throw new Error('[error] --write and --output are mutually exclusive')
  if (operation !== undefined && (!Number.isInteger(operation) || operation < 0)) {
    throw new Error('[error] --operation must be a non-negative integer')
  }
  return { configPath, mapId, gilPath, outputPath, write, operation }
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

export async function runAssetsCustomVariables(argv: readonly string[] = process.argv.slice(2)) {
  const args = parseArgs(argv)
  const config = await loadConfig(args.configPath)
  const operations = [...(config.assets?.customVariables ?? [])]
  const selected = args.operation === undefined ? operations : [operations[args.operation]]
  if (selected.some((operation) => !operation)) throw new Error('[error] operation index out of range')
  if (selected.length === 0) throw new Error('[error] assets.customVariables is empty')
  selected.forEach(validateOperation)

  const sourcePath = resolveGilPath(config, args)
  if (!fs.statSync(sourcePath).isFile()) throw new Error(`[error] gil not found: ${sourcePath}`)
  const temporary = path.join(os.tmpdir(), `gsts-assets-${process.pid}-${Date.now()}.gil`)
  fs.copyFileSync(sourcePath, temporary)
  try {
    let changed = 0
    let synchronized = 0
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
    console.log(`operations=${selected.length} changed=${changed} synchronizedInstances=${synchronized}`)
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
