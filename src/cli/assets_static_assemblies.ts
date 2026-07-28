import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import type { GstsConfig, GstsInjectConfig, GstsStaticAssembly } from '../compiler/gsts_config.js'
import { t } from '../i18n/index.js'
import { resolveGilTarget } from './gil_paths.js'
import { applyStaticAssembly } from './gil_static_assemblies.js'

function usage(exitCode = 1): never {
  const output = [
    t('staticAssembliesHelpSummary'),
    '',
    'Usage: gsts assets:static-assemblies [--config <file>] [--map-id <id> | --gil <file>]',
    '       [--write | --output <file>] [--assembly <index>]',
    '',
    t('staticAssembliesHelpOptions'),
    '  --config <file>    ' + t('staticAssembliesOptConfig'),
    '  --map-id <id>      ' + t('staticAssembliesOptMapId'),
    '  --gil <file>       ' + t('staticAssembliesOptGil'),
    '  --assembly <index> ' + t('staticAssembliesOptAssembly'),
    '  --output <file>    ' + t('staticAssembliesOptOutput'),
    '  --write            ' + t('staticAssembliesOptWrite'),
    '  -h, --help         ' + t('staticAssembliesOptHelp'),
    '',
    t('staticAssembliesHelpModes'),
    t('staticAssembliesHelpBoundary')
  ].join('\n')
  console[exitCode === 0 ? 'log' : 'error'](output)
  process.exit(exitCode)
}

function sha256(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex')
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
    else if (arg === '--help' || arg === '-h') usage(0)
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

async function loadConfig(configPath: string): Promise<GstsConfig> {
  const module = (await import(pathToFileURL(path.resolve(configPath)).href)) as {
    default?: GstsConfig
  }
  if (!module.default || typeof module.default !== 'object')
    throw new Error('[error] invalid gsts config')
  return module.default
}

function resolveGilPath(config: GstsConfig, args: ReturnType<typeof parseArgs>): string {
  if (args.gilPath) return path.resolve(args.gilPath)
  const inject: GstsInjectConfig = { ...(config.inject ?? {}) }
  if (args.mapId !== undefined) inject.mapId = args.mapId
  if (inject.mapId === undefined)
    throw new Error(
      '[error] mapId is required; run `gsts maps`, then use --map-id or configure inject.mapId'
    )
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
  let selected: GstsStaticAssembly[]
  if (args.assembly === undefined) selected = assemblies
  else {
    const assembly = assemblies[args.assembly]
    if (!assembly) throw new Error('[error] assembly index out of range')
    selected = [assembly]
  }
  if (!selected.length)
    throw new Error(
      '[error] assets.staticAssemblies is empty; configure name, prefabId, templatePrefabId, ' +
        'templateInstanceId, templateName, position, items, definitionAuxiliaryIds and ' +
        'instanceAuxiliaryIds'
    )

  const sourcePath = resolveGilPath(config, args)
  if (!fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isFile())
    throw new Error(`[error] gil not found: ${sourcePath}`)
  const sourceBytes = fs.readFileSync(sourcePath)
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
    const candidateBytes = fs.readFileSync(temporary)
    const mode = args.write ? 'write' : args.outputPath ? 'output' : 'preview'
    console.log(`mode=${mode}`)
    console.log(`source=${sourcePath}`)
    console.log(`sourceSha256=${sha256(sourceBytes)}`)
    const effectiveMapId = args.mapId ?? config.inject?.mapId
    if (effectiveMapId !== undefined) console.log(`mapId=${effectiveMapId}`)
    for (const [index, result] of results.entries()) {
      const assembly = selected[index]
      console.log(`assemblyName=${assembly.name}`)
      console.log(`templatePrefabId=${assembly.templatePrefabId}`)
      console.log(`templateInstanceId=${assembly.templateInstanceId}`)
      console.log(`newPrefabId=${result.prefabId}`)
      console.log(`itemCount=${assembly.items.length}`)
      console.log(`resources=${assembly.items.map((item) => item.resourceId).join(',')}`)
      console.log(`definitionAuxiliaryIds=${result.definitionAuxiliaryIds.join(',')}`)
      console.log(`instanceAuxiliaryIds=${result.instanceAuxiliaryIds.join(',')}`)
    }
    console.log('touchedTopLevelFields=4,6,8,27')
    console.log('field9=unchanged-by-current-implementation')
    console.log(`candidateSha256=${sha256(candidateBytes)}`)
    console.log(`candidateSize=${candidateBytes.length}`)

    const resultPath = args.outputPath ? path.resolve(args.outputPath) : sourcePath
    let backup: string | undefined
    if (args.write || args.outputPath) {
      if (args.write) {
        backup = backupPath(sourcePath)
        fs.copyFileSync(sourcePath, backup)
        console.log(`backup=${backup}`)
      } else if (fs.existsSync(resultPath)) {
        throw new Error(`[error] output already exists: ${resultPath}`)
      }
      fs.mkdirSync(path.dirname(resultPath), { recursive: true })
      fs.copyFileSync(temporary, resultPath)
      console.log(`written=${resultPath}`)
      console.log(`targetSha256=${sha256(fs.readFileSync(resultPath))}`)
    }
    console.log(`writePerformed=${args.write}`)
    if (args.write) {
      console.log(
        `next=write succeeded; backup=${backup}; editor loading and game behavior are not verified`
      )
    } else if (args.outputPath) {
      console.log('next=review and validate the offline candidate; the source map was not modified')
    } else {
      console.log('next=use --output to save candidate, or review and explicitly use --write')
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
