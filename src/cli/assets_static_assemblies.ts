import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { loadGstsConfig } from '../compiler/config_loader.js'
import type {
  GstsConfig,
  GstsInjectConfig,
  GstsResolvedStaticAssembly,
  GstsStaticAssembly,
  GstsStaticPrefabCategory,
  GstsStaticPrefabUpdate,
  StaticAssemblySourceLocator
} from '../compiler/gsts_config.js'
import { t } from '../i18n/index.js'
import { resolveGilTarget, syncGilToTemp } from './gil_paths.js'
import { resyncMap } from './maps.js'
import { applyStaticAssembly } from './gil_static_assemblies.js'
import { applyStaticPrefabCategories } from './gil_static_prefab_categories.js'
import { applyStaticPrefabUpdate } from './gil_static_prefab_updates.js'
import { resolveStaticAssemblyStructure } from './static_assembly_structure.js'
import { inspectStaticAssemblyMap } from './static_assembly/inspection.js'
import { exportStaticAssemblies } from './static_assembly/export.js'
import { prettyStableJson, sha256Bytes } from './static_assembly/json.js'
import { createStaticAssemblyPlan } from './static_assembly/plan.js'

type Command = 'preview' | 'inspect' | 'plan' | 'export'
type Format = 'text' | 'json'
type RootContext = { projectConfigPath?: string; projectConfig?: GstsConfig }

function usage(exitCode = 1): never {
  const output = [
    t('staticAssembliesHelpSummary'),
    '',
    'Usage: gsts assets:static-assemblies [inspect|plan|export] [options]',
    '',
    '  --asset-config <file>  static assembly asset configuration',
    '  --config <file>        deprecated alias for --asset-config',
    '  --map-id <id>          target map ID (location only)',
    '  --gil <file>           explicit read-only GIL source',
    '  --format <text|json>   output format (default: text)',
    '  --output <file>        create output without overwriting',
    '  --assembly <index>     select one assembly in preview mode',
    '  --write                write in legacy preview mode only',
    '  -h, --help             show help',
    '',
    t('staticAssembliesHelpBoundary')
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
  let command: Command = 'preview'
  let assetConfigPath: string | undefined
  let legacyConfigPath: string | undefined
  let mapId: number | undefined
  let gilPath: string | undefined
  let outputPath: string | undefined
  let write = false
  let assembly: number | undefined
  let format: Format = 'text'
  let index = 0
  if (argv[0] === 'inspect' || argv[0] === 'plan' || argv[0] === 'export') {
    command = argv[0]
    index++
  }
  for (; index < argv.length; index++) {
    const arg = argv[index]
    if (arg === '--asset-config') assetConfigPath = value(argv, index++)
    else if (arg === '--config') legacyConfigPath = value(argv, index++)
    else if (arg === '--map-id') mapId = nonNegativeId(value(argv, index++), '--map-id')
    else if (arg === '--gil') gilPath = value(argv, index++)
    else if (arg === '--output') outputPath = value(argv, index++)
    else if (arg === '--assembly') assembly = nonNegativeId(value(argv, index++), '--assembly')
    else if (arg === '--format') {
      const raw = value(argv, index++)
      if (raw !== 'text' && raw !== 'json') throw new Error('[error] --format must be text or json')
      format = raw
    } else if (arg === '--write') write = true
    else if (arg === '--help' || arg === '-h') usage(0)
    else usage()
  }
  if (
    assetConfigPath &&
    legacyConfigPath &&
    path.resolve(assetConfigPath) !== path.resolve(legacyConfigPath)
  ) {
    throw new Error('[error] --asset-config and deprecated --config specify different files')
  }
  if (gilPath && mapId !== undefined)
    throw new Error('[error] --gil and --map-id are mutually exclusive')
  if (write && outputPath) throw new Error('[error] --write and --output are mutually exclusive')
  if (command !== 'preview' && write) throw new Error('[error] inspect and plan are read-only')
  if (command === 'plan' && !assetConfigPath && !legacyConfigPath) {
    throw new Error('[error] plan requires --asset-config <file>')
  }
  if (command === 'export' && !gilPath && mapId === undefined) {
    throw new Error('[error] export requires --gil <file> or --map-id')
  }
  return {
    command,
    assetConfigPath: assetConfigPath ?? legacyConfigPath,
    usedLegacyConfig: !assetConfigPath && !!legacyConfigPath,
    mapId,
    gilPath,
    outputPath,
    write,
    assembly,
    format
  }
}

function resolveGilPath(
  projectConfig: GstsConfig | undefined,
  args: ReturnType<typeof parseArgs>
): { path: string; locator: StaticAssemblySourceLocator } {
  if (args.gilPath) {
    const absolute = path.resolve(args.gilPath)
    return { path: absolute, locator: { kind: 'gilFile', displayName: path.basename(absolute) } }
  }
  const inject: GstsInjectConfig = { ...(projectConfig?.inject ?? {}) }
  if (args.mapId !== undefined) inject.mapId = args.mapId
  if (inject.mapId === undefined) {
    throw new Error(
      '[error] mapId is required; use --gil, or provide --map-id with a project config'
    )
  }
  const target = resolveGilTarget(inject)
  return { path: target.gilPath, locator: { kind: 'mapId', mapId: target.mapId } }
}

function backupPath(gilPath: string): string {
  const directory = path.join(path.dirname(gilPath), '.gsts', 'backups')
  fs.mkdirSync(directory, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  return path.join(directory, `${path.basename(gilPath)}.${stamp}.bak`)
}

function writeNew(outputPath: string, contents: string | Uint8Array): string {
  const absolute = path.resolve(outputPath)
  if (fs.existsSync(absolute)) throw new Error(`[error] output already exists: ${absolute}`)
  fs.mkdirSync(path.dirname(absolute), { recursive: true })
  fs.writeFileSync(absolute, contents)
  return absolute
}

async function loadAssetAssemblies(configPath: string) {
  const absolute = path.resolve(configPath)
  const config = await loadGstsConfig(absolute, { profile: 'static-assemblies' })
  const source = fs.readFileSync(absolute)
  const raw = [...(config.assets?.staticAssemblies ?? [])]
  const assemblies = raw.map((assembly) => resolveStaticAssemblyStructure(assembly, absolute))
  const updates = [...(config.assets?.staticPrefabUpdates ?? [])]
  const categories = [...(config.assets?.staticPrefabCategories ?? [])]
  return { absolute, source, raw, assemblies, updates, categories }
}

function structureInput(assembly: GstsStaticAssembly, configPath: string) {
  if (!('structureFile' in assembly) || !assembly.structureFile) return undefined
  const absolute = path.resolve(path.dirname(configPath), assembly.structureFile)
  return { displayName: path.basename(absolute), bytes: new Uint8Array(fs.readFileSync(absolute)) }
}

async function runInspect(
  args: ReturnType<typeof parseArgs>,
  projectConfig: GstsConfig | undefined
): Promise<void> {
  const source = resolveGilPath(projectConfig, args)
  const before = fs.statSync(source.path)
  const bytes = new Uint8Array(fs.readFileSync(source.path))
  const result = inspectStaticAssemblyMap({ bytes, locator: source.locator })
  const serialized = prettyStableJson(result)
  if (args.outputPath) writeNew(args.outputPath, serialized)
  if (args.format === 'json') process.stdout.write(serialized)
  else {
    console.log(
      `source=${result.source.locator.kind === 'gilFile' ? result.source.locator.displayName : result.source.locator.mapId}`
    )
    console.log(`sourceSha256=${result.source.sha256}`)
    console.log(`definitions=${result.definitions.length}`)
    console.log(`instances=${result.instances.length}`)
    console.log(`templateCandidates=${result.templateCandidates.length}`)
    for (const candidate of result.templateCandidates) {
      console.log(
        `template=${candidate.name ?? '<ambiguous>'} definition=${candidate.definitionId} ` +
          `instance=${candidate.instanceId} closure=${candidate.closureStatus}`
      )
    }
    console.log('compatibility=not-proven; editorOrGameValidation=not-performed')
  }
  const after = fs.statSync(source.path)
  if (before.mtimeMs !== after.mtimeMs || before.size !== after.size) {
    throw new Error('[error] inspect source changed during read-only operation')
  }
}

async function runPlan(
  args: ReturnType<typeof parseArgs>,
  projectConfig: GstsConfig | undefined
): Promise<void> {
  const asset = await loadAssetAssemblies(args.assetConfigPath!)
  const source = resolveGilPath(projectConfig, args)
  const before = fs.statSync(source.path)
  const bytes = new Uint8Array(fs.readFileSync(source.path))
  const result = createStaticAssemblyPlan({
    bytes,
    sourceLocator: source.locator,
    assetConfig: { displayName: path.basename(asset.absolute), bytes: asset.source },
    assemblies: asset.assemblies.map((resolved, index) => ({
      resolved,
      structure: structureInput(asset.raw[index], asset.absolute)
    }))
  })
  const serialized = prettyStableJson(result)
  if (args.outputPath) writeNew(args.outputPath, serialized)
  if (args.format === 'json' || !args.outputPath) process.stdout.write(serialized)
  else
    console.log(
      `plan=${path.resolve(args.outputPath)} status=${result.status} hash=${result.planHash}`
    )
  const after = fs.statSync(source.path)
  if (before.mtimeMs !== after.mtimeMs || before.size !== after.size) {
    throw new Error('[error] plan source changed during read-only operation')
  }
  if (result.status === 'blocked') {
    process.exitCode = 1
    const codes = (result.errors ?? []).map((e) => e.code ?? e.message)
    console.error(
      `[error] plan blocked${codes.length ? `: ${codes.join('; ')}` : ''} (details in stdout JSON)`
    )
  }
}

async function runPreview(
  args: ReturnType<typeof parseArgs>,
  projectConfig: GstsConfig | undefined
): Promise<void> {
  const assetPath = args.assetConfigPath ?? 'gsts.config.ts'
  const asset = await loadAssetAssemblies(assetPath)
  let selected: GstsResolvedStaticAssembly[]
  let updates: GstsStaticPrefabUpdate[]
  let categories: GstsStaticPrefabCategory[]
  if (args.assembly === undefined) {
    selected = asset.assemblies
    updates = asset.updates
    categories = asset.categories
  } else {
    const assembly = asset.assemblies[args.assembly]
    if (!assembly) throw new Error('[error] assembly index out of range')
    selected = [assembly]
    updates = []
    categories = []
  }
  const source = resolveGilPath(
    projectConfig ?? (await loadGstsConfig(asset.absolute, { profile: 'project' })),
    args
  )
  if (!fs.existsSync(source.path) || !fs.statSync(source.path).isFile())
    throw new Error(`[error] gil not found: ${source.path}`)
  const sourceBytes = fs.readFileSync(source.path)
  const temporary = path.join(
    os.tmpdir(),
    `gsts-static-assemblies-${process.pid}-${Date.now()}.gil`
  )
  fs.copyFileSync(source.path, temporary)
  try {
    const results = selected.map((assembly) => {
      const result = applyStaticAssembly({ gilPath: temporary, assembly })
      fs.writeFileSync(temporary, result.bytes)
      return result
    })
    const updateResults = updates.map((update) => {
      const result = applyStaticPrefabUpdate({ gilPath: temporary, update })
      fs.writeFileSync(temporary, result.bytes)
      return result
    })
    const categoryResult = categories.length
      ? applyStaticPrefabCategories({ gilPath: temporary, categories })
      : undefined
    if (categoryResult) fs.writeFileSync(temporary, categoryResult.bytes)
    const candidateBytes = fs.readFileSync(temporary)
    const mode = args.write ? 'write' : args.outputPath ? 'output' : 'preview'
    const jsonMode = args.format === 'json'
    // text 模式输出原有 key=value 日志；json 模式 stdout 只输出 JSON，日志改走 stderr
    const log = (line: string) => (jsonMode ? console.error(line) : console.log(line))
    const summary: {
      schemaVersion: number
      kind: string
      mode: string
      source: string
      sourceSha256: string
      assemblies: { name: string; prefabId: number }[]
      updates: { name: string; prefabId: number; instanceId: number }[]
      categories: { name: string; prefabIds: readonly number[] }[]
      touchedTopLevelFields: number[]
      field9: string
      candidateSha256: string
      write?: { backup: string; tempSync?: string; temp?: string; tempSyncSkipped?: string }
      writePerformed: boolean
    } = {
      schemaVersion: 1,
      kind: 'gsts.static-assembly.preview',
      mode,
      source: source.path,
      sourceSha256: sha256Bytes(sourceBytes),
      assemblies: [],
      updates: [],
      categories: [],
      touchedTopLevelFields: [],
      field9: 'unchanged-by-current-implementation',
      candidateSha256: '',
      writePerformed: args.write
    }
    log(`mode=${mode}`)
    log(`source=${source.path}`)
    log(`sourceSha256=${summary.sourceSha256}`)
    for (const [index, result] of results.entries()) {
      log(`assemblyName=${selected[index].name}`)
      log(`newPrefabId=${result.prefabId}`)
      summary.assemblies.push({ name: selected[index].name, prefabId: result.prefabId })
    }
    for (const [index, result] of updateResults.entries()) {
      log(`updatedPrefabName=${updates[index].expectedName}`)
      log(`updatedPrefabId=${result.prefabId}`)
      log(`updatedInstanceId=${result.instanceId}`)
      summary.updates.push({
        name: updates[index].expectedName,
        prefabId: result.prefabId,
        instanceId: result.instanceId
      })
    }
    for (const category of categoryResult?.categories ?? []) {
      log(`updatedPrefabCategory=${category.name}`)
      log(`categoryPrefabIds=${category.prefabIds.join(',')}`)
      summary.categories.push({ name: category.name, prefabIds: category.prefabIds })
    }
    const touched = new Set<number>()
    if (selected.length) [4, 6, 8, 27].forEach((field) => touched.add(field))
    if (updateResults.length) [4, 8].forEach((field) => touched.add(field))
    if (categoryResult) touched.add(6)
    const touchedFields = [...touched].sort((a, b) => a - b)
    summary.touchedTopLevelFields = touchedFields
    log(`touchedTopLevelFields=${touchedFields.join(',') || 'none'}`)
    log('field9=unchanged-by-current-implementation')
    summary.candidateSha256 = sha256Bytes(candidateBytes)
    log(`candidateSha256=${summary.candidateSha256}`)
    const resultPath = args.outputPath ? path.resolve(args.outputPath) : source.path
    if (args.write) {
      const backup = backupPath(source.path)
      fs.copyFileSync(source.path, backup)
      fs.copyFileSync(temporary, resultPath)
      const writeInfo: NonNullable<typeof summary.write> = { backup }
      log(`backup=${backup}`)
      const tempCopied = syncGilToTemp(path.dirname(source.path), path.basename(source.path))
      if (tempCopied) {
        writeInfo.tempSync = tempCopied
        log(`temp-sync=${tempCopied}`)
      }
      if (args.mapId !== undefined) {
        try {
          const result = resyncMap(path.dirname(source.path), args.mapId)
          if (result.tempPath) {
            writeInfo.temp = result.tempPath
            log(`temp=${result.tempPath}`)
          }
        } catch (error) {
          writeInfo.tempSyncSkipped = (error as Error).message
          log(`temp-sync-skipped=${(error as Error).message}`)
        }
      }
      summary.write = writeInfo
    } else if (args.outputPath) writeNew(args.outputPath, candidateBytes)
    log(`writePerformed=${args.write}`)
    if (jsonMode) process.stdout.write(prettyStableJson(summary))
  } finally {
    fs.rmSync(temporary, { force: true })
  }
}

async function runExport(
  args: ReturnType<typeof parseArgs>,
  projectConfig: GstsConfig | undefined
): Promise<void> {
  const source = resolveGilPath(projectConfig, args)
  const before = fs.statSync(source.path)
  const bytes = new Uint8Array(fs.readFileSync(source.path))
  const assemblies = exportStaticAssemblies(bytes)
  const serialized = prettyStableJson({ schemaVersion: 1, assemblies })
  if (args.outputPath) writeNew(args.outputPath, serialized)
  if (args.format === 'json' || !args.outputPath) process.stdout.write(serialized)
  else {
    console.log(`exportedAssemblies=${assemblies.length}`)
    for (const assembly of assemblies) {
      console.log(
        `assembly=${assembly.name} prefabId=${assembly.prefabId} ` +
          `templateResourceId=${assembly.templateResourceId} items=${assembly.items.length} ` +
          `components=${assembly.components.map((component) => component.type).join(',') || '-'}`
      )
    }
    console.log('compatibility=not-proven; editorOrGameValidation=not-performed')
  }
  const after = fs.statSync(source.path)
  if (before.mtimeMs !== after.mtimeMs || before.size !== after.size) {
    throw new Error('[error] export source changed during read-only operation')
  }
}

export async function runAssetsStaticAssemblies(
  argv: readonly string[] = process.argv.slice(2),
  rootContext: RootContext = {}
) {
  const args = parseArgs(argv)
  if (args.usedLegacyConfig) console.error('[deprecated] use --asset-config instead of --config')
  let projectConfig = rootContext.projectConfig
  if (!projectConfig && rootContext.projectConfigPath) {
    projectConfig = await loadGstsConfig(rootContext.projectConfigPath, { profile: 'project' })
  }
  if (args.command === 'inspect') return runInspect(args, projectConfig)
  if (args.command === 'plan') return runPlan(args, projectConfig)
  if (args.command === 'export') return runExport(args, projectConfig)
  return runPreview(args, projectConfig)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  runAssetsStaticAssemblies().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
