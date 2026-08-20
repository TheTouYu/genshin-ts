import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import type { GstsConfig, GstsInjectConfig } from '../compiler/gsts_config.js'
import { resolveGilTarget } from './gil_paths.js'
import { attachAuxiliary } from './gil_aux.js'
import { prettyStableJson } from './static_assembly/json.js'

function usage(exitCode = 1): never {
  const output = [
    'Attach an auxiliary decoration (装饰物, root 27 aux) to a host.',
    '',
    'Usage: gsts assets:aux attach --host <entityId|prefabId> --resource <decoResourceId>',
    '       [--name <name>]',
    '',
    'Options:',
    '  --host <id>            host id: root5 scene entity / root4 prefab definition / root8 model',
    '  --resource <id>        decoration resource id (e.g. 10009001 长方体, 20001008)',
    '  --name <name>          decoration name (default: 装饰物_<resourceId>)',
    '  --gil <file>           explicit GIL source',
    '  --output <file>        create output without overwriting',
    '  --write                atomically write source GIL after backup',
    '  --format <text|json>   output format (default: text)',
    '  -h, --help             show help'
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
  let command = 'attach'
  let hostId: number | undefined
  let resourceId: number | undefined
  let name: string | undefined
  let gilPath: string | undefined
  let outputPath: string | undefined
  let write = false
  let format: 'text' | 'json' = 'text'
  let i = 0
  if (argv[0] === 'attach') i++
  for (; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--host') hostId = num(value(argv, i++), '--host')
    else if (a === '--resource') resourceId = num(value(argv, i++), '--resource')
    else if (a === '--name') name = value(argv, i++)
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
  if (hostId === undefined) throw new Error('[error] attach requires --host <id>')
  if (resourceId === undefined) throw new Error('[error] attach requires --resource <decoResourceId>')
  if (write && outputPath) throw new Error('[error] --write and --output are mutually exclusive')
  return { command, hostId, resourceId, name, gilPath, outputPath, write, format }
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
  if (!fs.existsSync(gilPath) || !fs.statSync(gilPath).isFile())
    throw new Error(`[error] gil not found: ${gilPath}`)
  const src = new Uint8Array(fs.readFileSync(gilPath))
  const sourceHash = sha256(src)
  const result = attachAuxiliary(src, {
    hostId: args.hostId!,
    resourceId: args.resourceId!,
    name: args.name
  })
  const json = args.format === 'json'
  const log = (s: string) => (json ? console.error(s) : console.log(s))
  const summary: Record<string, unknown> = {
    schemaVersion: 1,
    kind: 'aux-attach',
    sourceSha256: sourceHash,
    hostId: result.hostId,
    auxIds: result.auxIds
  }
  log(`hostId=${result.hostId} auxIds=${result.auxIds.join(',')}`)
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
    const bak = path.join(
      backupDir,
      `${path.basename(gilPath)}.${new Date().toISOString().replace(/[:.]/g, '-')}.bak`
    )
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

export async function runAssetsAux(
  argv: readonly string[] = process.argv.slice(2),
  cfg?: GstsConfig
) {
  await execute(argv, cfg)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  runAssetsAux().catch((e) => {
    console.error(e instanceof Error ? e.message : String(e))
    process.exitCode = 1
  })
}
