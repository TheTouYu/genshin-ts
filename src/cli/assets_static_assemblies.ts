import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import type { GstsConfig, GstsInjectConfig } from '../compiler/gsts_config.js'
import { resolveGilTarget } from './gil_paths.js'
import { applyStaticAssembly, type GstsStaticAssembly } from './gil_static_assemblies.js'

type StaticAssemblyConfig = GstsConfig & {
  assets?: { staticAssemblies?: readonly GstsStaticAssembly[] }
}

function usage(): never {
  console.error(
    [
      'Usage: gsts assets:static-assemblies [--config <file>] [--map-id <id> | --gil <file>]',
      '       [--write | --output <file>] [--assembly <index>]'
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
  let assembly: number | undefined
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]
    if (arg === '--config') configPath = argv[++index] ?? usage()
    else if (arg === '--map-id') mapId = Number(argv[++index])
    else if (arg === '--gil') gilPath = argv[++index] ?? usage()
    else if (arg === '--output') outputPath = argv[++index] ?? usage()
    else if (arg === '--assembly') assembly = Number(argv[++index])
    else if (arg === '--write') write = true
    else if (arg === '--help' || arg === '-h') usage()
    else usage()
  }
  if (gilPath && mapId !== undefined)
    throw new Error('[error] --gil and --map-id are mutually exclusive')
  if (write && outputPath) throw new Error('[error] --write and --output are mutually exclusive')
  if (assembly !== undefined && (!Number.isInteger(assembly) || assembly < 0)) {
    throw new Error('[error] --assembly must be a non-negative integer')
  }
  return { configPath, mapId, gilPath, outputPath, write, assembly }
}

async function loadConfig(configPath: string): Promise<StaticAssemblyConfig> {
  const module = (await import(pathToFileURL(path.resolve(configPath)).href)) as {
    default?: StaticAssemblyConfig
  }
  if (!module.default || typeof module.default !== 'object')
    throw new Error('[error] invalid gsts config')
  return module.default
}

function resolveGilPath(config: StaticAssemblyConfig, args: ReturnType<typeof parseArgs>): string {
  if (args.gilPath) return path.resolve(args.gilPath)
  const inject: GstsInjectConfig = { ...(config.inject ?? {}) }
  if (args.mapId !== undefined) inject.mapId = args.mapId
  if (inject.mapId === undefined)
    throw new Error('[error] mapId is required; use --map-id or configure inject.mapId')
  return resolveGilTarget(inject).gilPath
}

function backupPath(gilPath: string): string {
  const directory = path.join(path.dirname(gilPath), '.gsts', 'backups')
  fs.mkdirSync(directory, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  return path.join(directory, `${path.basename(gilPath)}.${stamp}.bak`)
}

export async function runAssetsStaticAssemblies(argv: readonly string[] = process.argv.slice(2)) {
  const args = parseArgs(argv)
  const config = await loadConfig(args.configPath)
  const assemblies = [...(config.assets?.staticAssemblies ?? [])]
  const selected = args.assembly === undefined ? assemblies : [assemblies[args.assembly]]
  if (selected.some((assembly) => !assembly)) throw new Error('[error] assembly index out of range')
  if (!selected.length) throw new Error('[error] assets.staticAssemblies is empty')

  const sourcePath = resolveGilPath(config, args)
  if (!fs.statSync(sourcePath).isFile()) throw new Error(`[error] gil not found: ${sourcePath}`)
  const temporary = path.join(
    os.tmpdir(),
    `gsts-static-assemblies-${process.pid}-${Date.now()}.gil`
  )
  fs.copyFileSync(sourcePath, temporary)
  try {
    const results = selected.map((assembly) => {
      const result = applyStaticAssembly({
        gilPath: temporary,
        assembly: assembly as GstsStaticAssembly
      })
      fs.writeFileSync(temporary, result.bytes)
      return result
    })
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
    for (const result of results) {
      console.log(
        `assembly=${result.prefabId} definitionAuxiliaryIds=${result.definitionAuxiliaryIds.join(',')} ` +
          `instanceAuxiliaryIds=${result.instanceAuxiliaryIds.join(',')}`
      )
    }
  } finally {
    fs.rmSync(temporary, { force: true })
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  runAssetsStaticAssemblies().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
