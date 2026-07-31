import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { loadGstsConfig } from '../compiler/config_loader.js'
import type { GstsConfig, GstsInjectConfig } from '../compiler/gsts_config.js'
import type { SignalParamType } from '../runtime/core.js'
import { resolveGilTarget } from './gil_paths.js'
import { DEFAULT_SIGNALS_PATH, extractSignalsFromGil, readRegisteredSignalsFromGil } from './gil_signals.js'
import {
  PARAM_TYPE_CODES,
  registerSignalInGil,
  type SignalRegistrationParam
} from './gil_signal_registrations.js'
import { sha256Bytes } from './static_assembly/json.js'

type Command = 'inspect' | 'register'
type RootContext = { projectConfigPath?: string; projectConfig?: GstsConfig }

const MAX_PARAMS = 9
const PARAM_TYPES = new Set<string>(Object.keys(PARAM_TYPE_CODES))

function usage(exitCode = 1): never {
  const output = [
    'Usage: gsts assets:signals [inspect] [options]',
    '',
    '  --config <file>          project config (for --map-id resolution)',
    '  --map-id <id>            target map ID (location only)',
    '  --gil <file>             explicit read-only GIL source',
    '  --output <file>          create output without overwriting',
    '  --write                  write source GIL after backup',
    '  --template-signal <name> existing signal to clone parameter entries from',
    '  --name <name>            new signal name',
    '  --param <name:type>      new signal parameter (repeatable, <=9, one per type)',
    '  --send-id <id>           new signal send node ID (auto when omitted)',
    '  --monitor-id <id>        new signal monitor node ID (auto when omitted)',
    '  --server-id <id>         new signal server identity node ID (auto when omitted)',
    '  -h, --help               show help'
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
  if (!Number.isSafeInteger(result) || result < 0) {
    throw new Error(`[error] ${option} must be non-negative safe integer`)
  }
  return result
}

function parseParam(raw: string): SignalRegistrationParam {
  const separator = raw.lastIndexOf(':')
  if (separator <= 0 || separator === raw.length - 1) {
    throw new Error(`[error] --param must be <name:type>, got: ${raw}`)
  }
  const name = raw.slice(0, separator)
  const type = raw.slice(separator + 1)
  if (!PARAM_TYPES.has(type)) {
    throw new Error(`[error] unknown parameter type: ${type}; valid: ${[...PARAM_TYPES].join(', ')}`)
  }
  return { name, type: type as SignalParamType }
}

export function parseArgs(argv: readonly string[]) {
  let command: Command = 'register'
  let gilPath: string | undefined
  let mapId: number | undefined
  let outputPath: string | undefined
  let write = false
  let templateSignalName: string | undefined
  let name: string | undefined
  let sendId: number | undefined
  let monitorId: number | undefined
  let serverId: number | undefined
  const params: SignalRegistrationParam[] = []
  if (argv[0] === 'inspect') {
    command = 'inspect'
    argv = argv.slice(1)
  }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--gil') gilPath = value(argv, i++)
    else if (arg === '--map-id') mapId = nonNegativeId(value(argv, i++), '--map-id')
    else if (arg === '--output') outputPath = value(argv, i++)
    else if (arg === '--write') write = true
    else if (arg === '--template-signal') templateSignalName = value(argv, i++)
    else if (arg === '--name') name = value(argv, i++)
    else if (arg === '--param') params.push(parseParam(value(argv, i++)))
    else if (arg === '--send-id') sendId = nonNegativeId(value(argv, i++), '--send-id')
    else if (arg === '--monitor-id') monitorId = nonNegativeId(value(argv, i++), '--monitor-id')
    else if (arg === '--server-id') serverId = nonNegativeId(value(argv, i++), '--server-id')
    else if (arg === '--help' || arg === '-h') usage(0)
    else usage()
  }
  if (gilPath && mapId !== undefined) throw new Error('[error] --gil and --map-id are mutually exclusive')
  if (write && outputPath) throw new Error('[error] --write and --output are mutually exclusive')
  if (command === 'register') {
    if (!templateSignalName) throw new Error('[error] --template-signal is required')
    if (!name) throw new Error('[error] --name is required')
    const providedIds = [sendId, monitorId, serverId].filter((id) => id !== undefined)
    if (providedIds.length > 0 && providedIds.length < 3) {
      throw new Error(
        '[error] provide all of --send-id/--monitor-id/--server-id or none (auto-assigned)'
      )
    }
    if (params.length > MAX_PARAMS) {
      throw new Error(`[error] at most ${MAX_PARAMS} parameters per signal`)
    }
  }
  return { command, gilPath, mapId, outputPath, write, templateSignalName, name, sendId, monitorId, serverId, params }
}

function resolveGilPath(
  projectConfig: GstsConfig | undefined,
  args: ReturnType<typeof parseArgs>
): string {
  if (args.gilPath) return path.resolve(args.gilPath)
  const inject: GstsInjectConfig = { ...(projectConfig?.inject ?? {}) }
  if (args.mapId !== undefined) inject.mapId = args.mapId
  if (inject.mapId === undefined) {
    throw new Error('[error] mapId is required; use --gil, or provide --map-id with a project config')
  }
  return resolveGilTarget(inject).gilPath
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

function resolveSignalsPath(projectConfigPath: string | undefined, injectCfg: GstsInjectConfig | undefined): string {
  const raw = injectCfg?.signalsPath ?? DEFAULT_SIGNALS_PATH
  if (path.isAbsolute(raw)) return raw
  const base = projectConfigPath ? path.dirname(projectConfigPath) : process.cwd()
  return path.resolve(base, raw)
}

function runInspect(
  args: ReturnType<typeof parseArgs>,
  projectConfig: GstsConfig | undefined
): void {
  const sourcePath = resolveGilPath(projectConfig, args)
  const entries = readRegisteredSignalsFromGil(sourcePath)
  console.log(`source=${sourcePath}`)
  console.log(`signals=${entries.length}`)
  for (const entry of entries) {
    const params = entry.params.map((param) => `${param.name}:${param.type}`).join(' ') || '(none)'
    console.log(
      `  ${entry.name} send=${entry.sendId} monitor=${entry.monitorId} server=${entry.serverId} params=[${params}]`
    )
  }
}

async function runRegister(
  args: ReturnType<typeof parseArgs>,
  projectConfig: GstsConfig | undefined,
  projectConfigPath: string | undefined
): Promise<void> {
  const sourcePath = resolveGilPath(projectConfig, args)
  if (!fs.statSync(sourcePath).isFile()) throw new Error(`[error] gil not found: ${sourcePath}`)
  const sourceBytes = new Uint8Array(fs.readFileSync(sourcePath))
  const sourceSha = sha256Bytes(sourceBytes)
  const result = registerSignalInGil({
    bytes: sourceBytes,
    templateSignalName: args.templateSignalName!,
    signal: {
      name: args.name!,
      params: args.params,
      sendId: args.sendId,
      monitorId: args.monitorId,
      serverId: args.serverId
    }
  })
  const candidateSha = sha256Bytes(result.bytes)

  // Structural read-back through the shared extractor before any write.
  const temporary = path.join(os.tmpdir(), `gsts-signals-${process.pid}-${Date.now()}.gil`)
  fs.writeFileSync(temporary, result.bytes)
  try {
    const readBack = readRegisteredSignalsFromGil(temporary).find(
      (entry) => entry.name === args.name
    )
    if (!readBack) throw new Error('[error] candidate failed structural read-back')
    if (
      readBack.sendId !== result.signal.sendId ||
      readBack.monitorId !== result.signal.monitorId ||
      readBack.serverId !== result.signal.serverId
    ) {
      throw new Error('[error] candidate read-back identity mismatch')
    }
  } finally {
    fs.rmSync(temporary, { force: true })
  }

  if (args.write || args.outputPath) {
    const resultPath = args.outputPath ? path.resolve(args.outputPath) : sourcePath
    if (args.write) {
      const nowSha = sha256Bytes(new Uint8Array(fs.readFileSync(sourcePath)))
      if (nowSha !== sourceSha) {
        throw new Error('[error] source GIL changed since read; aborting write')
      }
      const backup = backupPath(sourcePath)
      fs.copyFileSync(sourcePath, backup)
      console.log(`backup=${backup}`)
      fs.writeFileSync(resultPath, result.bytes)
      // Keep the generated signal source in sync with the map, mirroring the
      // inject flow (maybeExtractResources). Only a real map write triggers it.
      const outPath = resolveSignalsPath(projectConfigPath, projectConfig?.inject)
      const extract = extractSignalsFromGil({ gilPath: resultPath, outPath })
      if (extract.status === 'ok') {
        console.log(`extracted=${outPath} count=${extract.count}`)
      } else if (extract.status === 'skipped-existing') {
        console.log(`extract=skipped-existing out=${outPath} (no @gsts:signals header)`)
      } else {
        console.log(`extract=failed out=${outPath} error=${extract.error}`)
      }
    } else {
      writeNew(resultPath, result.bytes)
    }
    console.log(`written=${resultPath}`)
  } else {
    console.log(`preview=${sourcePath}`)
  }
  console.log(
    `signal=${args.name} template=${result.templateSignalName} params=${args.params.length} ` +
      `sendId=${result.signal.sendId} monitorId=${result.signal.monitorId} ` +
      `serverId=${result.signal.serverId} candidateSha256=${candidateSha}`
  )
}

export async function runAssetsSignals(
  argv: readonly string[] = process.argv.slice(2),
  rootContext: RootContext = {}
): Promise<void> {
  const args = parseArgs(argv)
  let projectConfig = rootContext.projectConfig
  if (!projectConfig && rootContext.projectConfigPath) {
    projectConfig = await loadGstsConfig(rootContext.projectConfigPath, { profile: 'project' })
  }
  if (args.command === 'inspect') return runInspect(args, projectConfig)
  return runRegister(args, projectConfig, rootContext.projectConfigPath)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  runAssetsSignals().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
