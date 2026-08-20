import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import type { GstsConfig, GstsInjectConfig } from '../compiler/gsts_config.js'
import { resolveGilTarget } from './gil_paths.js'
import { convertPrefabStatic, createCustomPrefab, createStaticPrefabInstance } from './gil_prefabs.js'
import { prettyStableJson } from './static_assembly/json.js'

function usage(exitCode = 1): never {
  const output = [
    'Create or convert prefabs (元件).',
    '',
    'Usage: gsts assets:prefabs create --base <officialResourceId> --id <newId> [--name <name>] [--static]',
    '       gsts assets:prefabs convert <id> --static|--dynamic',
    '',
    'Options:',
    '  --base <id>             official prefab resource id (e.g. 10009002 球体, 10009005 五棱柱)',
    '  --id <newId>            new custom prefab id (>= 1077936129)',
    '  --name <name>           custom prefab name (default: official name)',
    '  --static                create a STATIC element instance (root8, type400 registry;',
    '                          no components/variables support) instead of a root4 definition',
    '  --position x,y,z        scene position (default 0,0,0)',
    '  convert:',
    '  --static / --dynamic    target type to convert the existing prefab to (one required)',
    '  --gil <file>            explicit GIL source',
    '  --output <file>         create output without overwriting',
    '  --write                 atomically write source GIL after backup',
    '  --format <text|json>    output format (default: text)',
    '  -h, --help              show help'
  ].join('\n')
  console[exitCode === 0 ? 'log' : 'error'](output)
  process.exit(exitCode)
}

function value(argv: readonly string[], i: number): string {
  const r = argv[i + 1]
  if (!r || r.startsWith('--')) usage()
  return r
}

function num(raw: string, opt: string): number {
  const n = Number(raw)
  if (!Number.isSafeInteger(n) || n < 0) throw new Error(`[error] ${opt} must be a non-negative safe integer`)
  return n
}

function parseArgs(argv: readonly string[]) {
  let command: 'create' | 'convert' = 'create'
  let baseId: number | undefined
  let newId: number | undefined
  let name: string | undefined
  let gilPath: string | undefined
  let outputPath: string | undefined
  let write = false
  let isStatic = false
  let convertStatic: boolean | undefined
  let format: 'text' | 'json' = 'text'
  let position: number[] = [0, 0, 0]
  let i = 0
  if (argv[0] === 'convert') {
    command = 'convert'
    i++
  } else if (argv[0] === 'create') {
    i++
  }
  for (; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--base') baseId = num(value(argv, i++), '--base')
    else if (a === '--id') newId = num(value(argv, i++), '--id')
    else if (a === '--name') name = value(argv, i++)
    else if (a === '--static') {
      if (command === 'convert') convertStatic = true
      else isStatic = true
    } else if (a === '--dynamic') {
      if (command === 'convert') convertStatic = false
      else usage()
    } else if (a === '--position') position = value(argv, i++).split(',').map(Number)
    else if (a === '--gil') gilPath = value(argv, i++)
    else if (a === '--output') outputPath = value(argv, i++)
    else if (a === '--write') write = true
    else if (a === '--format') {
      const r = value(argv, i++)
      if (r !== 'text' && r !== 'json') throw new Error('[error] --format must be text or json')
      format = r
    } else if (a === '--help' || a === '-h') usage(0)
    else usage()
  }
  if (command === 'create') {
    if (baseId === undefined) throw new Error('[error] create requires --base <officialResourceId>')
    if (newId === undefined) throw new Error('[error] create requires --id <newId>')
  } else {
    if (newId === undefined) throw new Error('[error] convert requires --id <prefabId>')
    if (convertStatic === undefined)
      throw new Error('[error] convert requires --static or --dynamic')
  }
  if (write && outputPath) throw new Error('[error] --write and --output are mutually exclusive')
  return { command, baseId, newId, name, gilPath, outputPath, write, format, position, isStatic, convertStatic }
}

function resolveGilPath(args: ReturnType<typeof parseArgs>, cfg: GstsConfig | undefined): string {
  if (args.gilPath) return path.resolve(args.gilPath)
  const inject: GstsInjectConfig = { ...(cfg?.inject ?? {}) }
  if (inject.mapId === undefined) throw new Error('[error] mapId required; use --gil or inject.mapId')
  return resolveGilTarget(inject).gilPath
}

function sha256(b: Uint8Array): string {
  return createHash('sha256').update(Buffer.from(b)).digest('hex')
}

async function execute(argv: readonly string[], cfg: GstsConfig | undefined) {
  const args = parseArgs(argv)
  const gilPath = resolveGilPath(args, cfg)
  if (!fs.existsSync(gilPath) || !fs.statSync(gilPath).isFile()) throw new Error(`[error] gil not found: ${gilPath}`)
  const src = new Uint8Array(fs.readFileSync(gilPath))
  const sourceHash = sha256(src)
  const json = args.format === 'json'
  const log = (s: string) => (json ? console.error(s) : console.log(s))
  if (args.command === 'convert') {
    const toStatic = args.convertStatic!
    const result = convertPrefabStatic(src, { id: args.newId!, toStatic })
    const kind = toStatic ? 'prefabs-convert-static' : 'prefabs-convert-dynamic'
    const summary: Record<string, unknown> = {
      schemaVersion: 1,
      kind,
      sourceSha256: sourceHash,
      prefabId: result.id,
      toStatic,
      ...(result.definitionId !== undefined ? { definitionId: result.definitionId } : {}),
      entitiesUpdated: result.entitiesUpdated
    }
    log(
      `prefabId=${result.id} ${toStatic ? 'static=true' : 'static=false'} entitiesUpdated=${result.entitiesUpdated}`
    )
    summary.candidateSha256 = sha256(result.bytes)
    log(`candidateSha256=${sha256(result.bytes)}`)
    if (args.outputPath) {
      const abs = path.resolve(args.outputPath)
      fs.writeFileSync(abs, result.bytes)
      summary.candidate = abs
      log(`candidate=${abs}`)
    } else if (args.write) {
      const backupDir = path.join(path.dirname(gilPath), '.gsts', 'backups')
      fs.mkdirSync(backupDir, { recursive: true })
      const bak = path.join(backupDir, `${path.basename(gilPath)}.${new Date().toISOString().replace(/[:.]/g, '-')}.bak`)
      fs.copyFileSync(gilPath, bak)
      fs.writeFileSync(gilPath, result.bytes)
      summary.backup = bak
      summary.writePerformed = true
      log(`backup=${bak}`)
      log('writePerformed=true')
    } else {
      summary.previewOnly = true
      log('preview only; use --write to apply after backup, or --output for a candidate')
    }
    if (json) process.stdout.write(prettyStableJson(summary))
    return
  }
  const result = args.isStatic
    ? createStaticPrefabInstance(src, { id: args.newId!, resourceId: args.baseId!, name: args.name, position: args.position })
    : createCustomPrefab(src, { id: args.newId!, resourceId: args.baseId!, name: args.name, position: args.position })
  const kind = args.isStatic ? 'prefabs-create-static' : 'prefabs-create'
  const summary: Record<string, unknown> = { schemaVersion: 1, kind, sourceSha256: sourceHash, prefabId: result.id, name: result.name, static: args.isStatic }
  log(`prefabId=${result.id} name=${result.name}${args.isStatic ? ' static=true' : ''}`)
  summary.candidateSha256 = sha256(result.bytes)
  log(`candidateSha256=${sha256(result.bytes)}`)
  if (args.outputPath) {
    const abs = path.resolve(args.outputPath)
    fs.writeFileSync(abs, result.bytes)
    summary.candidate = abs
    log(`candidate=${abs}`)
  } else if (args.write) {
    const backupDir = path.join(path.dirname(gilPath), '.gsts', 'backups')
    fs.mkdirSync(backupDir, { recursive: true })
    const bak = path.join(backupDir, `${path.basename(gilPath)}.${new Date().toISOString().replace(/[:.]/g, '-')}.bak`)
    fs.copyFileSync(gilPath, bak)
    fs.writeFileSync(gilPath, result.bytes)
    summary.backup = bak
    summary.writePerformed = true
    log(`backup=${bak}`)
    log('writePerformed=true')
  } else {
    summary.previewOnly = true
    log('preview only; use --write to apply after backup, or --output for a candidate')
  }
  if (json) process.stdout.write(prettyStableJson(summary))
}

export async function runAssetsPrefabs(argv: readonly string[] = process.argv.slice(2), cfg?: GstsConfig) {
  await execute(argv, cfg)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  runAssetsPrefabs().catch((e) => { console.error(e instanceof Error ? e.message : String(e)); process.exitCode = 1 })
}
