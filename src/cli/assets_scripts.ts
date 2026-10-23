// gsts assets:scripts —— Lua 脚本资产命令层（登记表 f50 + 外部 lua 文件直写）。
// 背景（2026-10-14，D260）：编辑器「导入脚本 GIA」的本质 = 顶层 f50 加一条登记 +
// 提取外部文件到 <槽目录>/external_lua_file/<default_import_file/…>；CLI 直写两者即可
// 让编辑器重开地图后在 lua 页看到脚本，全程绕开笔头（WPF 文件选择器死锁，D237 案）。
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import type { GstsConfig, GstsInjectConfig } from '../compiler/gsts_config.js'
import { buildFile, readUint32BE } from '../injector/binary.js'
import { resolveGilTarget, saveLevelDirOf, syncGilToTemp } from './gil_paths.js'
import {
  mountScriptInPayload,
  parseScriptMounts,
  parseScriptRegistry,
  registerScriptInPayload,
  unmountScriptInPayload,
  updateScriptInPayload,
  SCRIPT_PATH_PREFIX,
  type ScriptRegistryEntry
} from './gil_scripts.js'

const UTF8_BOM = '\uFEFF'

type Args = {
  command?: string
  gilPath?: string
  mapId?: number
  name?: string
  scriptPath?: string
  source?: string
  sourceFile?: string
  guid?: number
  host?: number
  script?: number
  output?: string
  write?: boolean
  format?: string
  yes?: boolean
}

const USAGE = [
  'usage: gsts assets:scripts <list|register|update|mounts|mount|unmount> [options]',
  '  list     列出地图的脚本登记表（f50）与外部文件状态',
  '  register 登记一条 lua 脚本（f50 条目 + external_lua_file 提取 + Temp 同步）',
  '  update   更新已登记脚本的源码（f5 替换 + external_lua_file 同步 + Temp 同步）',
  '  mounts   列出脚本挂载（host 控件 guid/name ↔ script guid）',
  '  mount    把已登记脚本挂到 host 控件的挂载槽（f74，11B 挂载条目）',
  '  unmount  从 host 控件解挂指定脚本',
  '',
  '  --gil <file>        显式指定 .gil（缺省用 --map-id / 项目配置 inject.mapId 定位）',
  '  --map-id <id>       地图槽 ID（如 1073741829）',
  '  --name <name>       脚本名（register 必填；update 定位用，撞名时改用 --guid）',
  '  --path <p>          lua 路径（register 必填；自动补 default_import_file/ 前缀）',
  '  --source <code>     脚本源码（与 --source-file 二选一）',
  '  --source-file <f>   从文件读源码',
  '  --guid <id>         显式登记 guid（缺省自动分配）；update 按 guid 定位',
  '  --host <guid>       mount/unmount 的宿主控件 guid（f9 树节点）',
  '  --script <guid>     mount/unmount 的脚本 guid（须已在 f50 登记）',
  '  --output <file>     只写候选文件，不覆盖源',
  '  --write             备份后写回源 .gil 并同步 Temp',
  '  --format <format>   text 或 json (list/register/update 摘要)'
]

function parseArgs(argv: readonly string[]): Args {
  const args: Args = {}
  args.command = argv[0]
  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i]
    const next = (): string => {
      const value = argv[++i]
      if (value === undefined) throw new Error(`[error] ${arg} requires a value`)
      return value
    }
    switch (arg) {
      case '--gil':
        args.gilPath = next()
        break
      case '--map-id':
        args.mapId = Number(next())
        break
      case '--name':
        args.name = next()
        break
      case '--path':
        args.scriptPath = next()
        break
      case '--source':
        args.source = next()
        break
      case '--source-file':
        args.sourceFile = next()
        break
      case '--guid':
        args.guid = Number(next())
        break
      case '--host':
        args.host = Number(next())
        break
      case '--script':
        args.script = Number(next())
        break
      case '--output':
        args.output = next()
        break
      case '--format':
        args.format = next()
        break
      case '--write':
        args.write = true
        break
      case '--yes':
        args.yes = true
        break
      case '--help':
      case '-h':
        console.log(USAGE.join('\n'))
        process.exit(0)
        break
      default:
        throw new Error(`[error] unknown option: ${arg}`)
    }
  }
  return args
}

function resolveGilPath(args: Args, projectConfig?: GstsConfig): string {
  if (args.gilPath) return path.resolve(args.gilPath)
  const inject: GstsInjectConfig = { ...(projectConfig?.inject ?? {}) }
  const mapId = args.mapId ?? inject.mapId
  if (mapId === undefined) {
    throw new Error('[error] mapId is required; use --gil or --map-id')
  }
  inject.mapId = mapId
  return resolveGilTarget(inject).gilPath
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(Buffer.from(bytes)).digest('hex')
}

function backupPath(gilPath: string): string {
  const directory = path.join(saveLevelDirOf(gilPath), '.gsts', 'backups')
  fs.mkdirSync(directory, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  return path.join(directory, `${path.basename(gilPath)}.${stamp}.bak`)
}

// 外部 lua 落点：<槽目录>/external_lua_file/<filePath 含 default_import_file/ 前缀>
// 槽目录两种形态（D257）：平面 .gil（Save_Level/<id>.gil，编辑器首存后目录化）与
// 目录形（Save_Level/<id>/<id>.gil）。目录化前也统一落 Save_Level/<id>/external_lua_file/，
// 与编辑器首存后的运行时加载路径（D253 实证）一致。
function externalLuaDest(gilPath: string, filePath: string): string {
  const dir = path.dirname(gilPath)
  const base = path.basename(gilPath, '.gil')
  const slotDir = path.basename(dir) === base ? dir : path.join(dir, base)
  return path.join(slotDir, 'external_lua_file', ...filePath.split('/'))
}

function externalFileStatus(gilPath: string, entry: ScriptRegistryEntry): {
  externalPath: string
  exists: boolean
  size: number | null
} {
  const externalPath = externalLuaDest(gilPath, entry.filePath)
  let size: number | null = null
  let exists = false
  try {
    const stat = fs.statSync(externalPath)
    exists = true
    size = stat.size
  } catch {
    exists = false
  }
  return { externalPath, exists, size }
}

function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, v) => v, 2)
}

function sourceOf(args: Args): string {
  if (args.source !== undefined && args.sourceFile !== undefined) {
    throw new Error('[error] --source 与 --source-file 只能二选一')
  }
  if (args.sourceFile !== undefined) {
    const raw = fs.readFileSync(path.resolve(args.sourceFile), 'utf8')
    return raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw
  }
  if (args.source !== undefined) return args.source
  throw new Error('[error] --source or --source-file is required')
}

async function execute(argv: readonly string[], projectConfig?: GstsConfig): Promise<void> {
  const args = parseArgs(argv)
  const jsonMode = args.format === 'json'
  const log = (message: string): void => {
    if (!jsonMode) console.log(message)
  }
  const knownCommands = ['list', 'register', 'update', 'mounts', 'mount', 'unmount'] as const
  if (!knownCommands.includes(args.command as (typeof knownCommands)[number])) {
    console.log(USAGE.join('\n'))
    if (!args.command) return
    throw new Error(`[error] unknown command: ${args.command}`)
  }
  const gilPath = resolveGilPath(args, projectConfig)
  const sourceBytes = new Uint8Array(fs.readFileSync(gilPath))
  const payload = sourceBytes.slice(20, sourceBytes.length - 4)

  if (args.command === 'mounts') {
    const mounts = parseScriptMounts(payload)
    const registry = parseScriptRegistry(payload)
    const nameOf = new Map(registry.map((entry) => [entry.guid, entry.name]))
    const summary = {
      schemaVersion: 1,
      kind: 'gsts.assets-scripts-mounts',
      gilPath,
      count: mounts.length,
      mounts: mounts.map((mount) => ({
        hostGuid: mount.hostGuid,
        hostName: mount.hostName,
        scriptGuid: mount.scriptGuid,
        scriptName: nameOf.get(mount.scriptGuid) ?? null
      }))
    }
    log(`gil=${gilPath}`)
    log(`mounts=${mounts.length}`)
    for (const mount of mounts) {
      log(
        `  host=${mount.hostGuid}${mount.hostName === null ? '' : ` (${mount.hostName})`}` +
          ` script=${mount.scriptGuid}${nameOf.has(mount.scriptGuid) ? ` (${nameOf.get(mount.scriptGuid)})` : ''}`
      )
    }
    if (jsonMode) process.stdout.write(stableJson(summary))
    return
  }

  if (args.command === 'mount' || args.command === 'unmount') {
    if (args.host === undefined) throw new Error(`[error] ${args.command} requires --host <guid>`)
    if (args.script === undefined) throw new Error(`[error] ${args.command} requires --script <guid>`)
    const result =
      args.command === 'mount'
        ? mountScriptInPayload(payload, { hostGuid: args.host, scriptGuid: args.script })
        : unmountScriptInPayload(payload, { hostGuid: args.host, scriptGuid: args.script })
    const candidate = buildFile(result.payload, {
      schema: readUint32BE(sourceBytes, 4),
      headTag: readUint32BE(sourceBytes, 8),
      fileType: readUint32BE(sourceBytes, 12),
      tailTag: readUint32BE(sourceBytes, sourceBytes.length - 4)
    })
    const summary: Record<string, unknown> = {
      schemaVersion: 1,
      kind: `gsts.assets-scripts-${args.command}`,
      gilPath,
      hostGuid: args.host,
      scriptGuid: args.script,
      sourceSha256: sha256(sourceBytes),
      candidateSha256: sha256(candidate),
      candidateBytes: candidate.length
    }
    log(`gil=${gilPath}`)
    log(`host=${args.host} script=${args.script} ${args.command}ed`)
    log(`candidateBytes=${candidate.length} (source=${sourceBytes.length})`)
    if (args.output) {
      const absolute = path.resolve(args.output)
      fs.mkdirSync(path.dirname(absolute), { recursive: true })
      fs.writeFileSync(absolute, candidate)
      summary.output = absolute
      log(`output=${absolute}`)
    } else if (args.write) {
      const currentHash = sha256(new Uint8Array(fs.readFileSync(gilPath)))
      if (currentHash !== summary.sourceSha256) {
        throw new Error(
          `[error] source changed during operation: expected ${summary.sourceSha256}, got ${currentHash}`
        )
      }
      const backup = backupPath(gilPath)
      fs.copyFileSync(gilPath, backup)
      fs.writeFileSync(gilPath, candidate)
      summary.backup = backup
      summary.writePerformed = true
      log(`backup=${backup}`)
      log(`writePerformed=true gil`)
      const mapId = args.mapId ?? projectConfig?.inject?.mapId
      if (mapId !== undefined) {
        const tempPath = syncGilToTemp(saveLevelDirOf(gilPath), `${mapId}.gil`)
        if (tempPath) {
          summary.tempSync = tempPath
          log(`temp-sync=${tempPath}`)
        }
      } else {
        log('temp-sync=skipped (no --map-id)')
      }
      log('editorOrGameValidation=not-performed; 编辑器需重开地图才会读到盘外写入')
    } else {
      summary.previewOnly = true
      log('preview only; use --write to apply after backup, or --output for a candidate')
    }
    if (jsonMode) process.stdout.write(stableJson(summary))
    return
  }

  if (args.command === 'list') {
    const entries = parseScriptRegistry(payload)
    const summary = {
      schemaVersion: 1,
      kind: 'gsts.assets-scripts-list',
      gilPath,
      count: entries.length,
      entries: entries.map((entry) => ({
        guid: entry.guid,
        name: entry.name,
        filePath: entry.filePath,
        sourceHead: entry.source === null ? null : entry.source.slice(0, 80),
        external: externalFileStatus(gilPath, entry)
      }))
    }
    log(`gil=${gilPath}`)
    log(`registryEntries=${entries.length}`)
    for (const entry of entries) {
      const external = externalFileStatus(gilPath, entry)
      log(
        `  guid=${entry.guid} name=${entry.name} path=${entry.filePath}` +
          ` external=${external.exists ? `${external.size}B` : 'MISSING'}`
      )
    }
    if (jsonMode) process.stdout.write(stableJson(summary))
    return
  }

  // update
  if (args.command === 'update') {
    if (args.name === undefined && args.guid === undefined) {
      throw new Error('[error] update requires --name or --guid')
    }
    const source = sourceOf(args)
    const result = updateScriptInPayload(payload, {
      ...(args.name !== undefined ? { name: args.name } : {}),
      ...(args.guid !== undefined ? { guid: args.guid } : {}),
      source
    })
    const candidate = buildFile(result.payload, {
      schema: readUint32BE(sourceBytes, 4),
      headTag: readUint32BE(sourceBytes, 8),
      fileType: readUint32BE(sourceBytes, 12),
      tailTag: readUint32BE(sourceBytes, sourceBytes.length - 4)
    })
    const externalPath = externalLuaDest(gilPath, result.entry.filePath)
    const summary: Record<string, unknown> = {
      schemaVersion: 1,
      kind: 'gsts.assets-scripts-update',
      gilPath,
      sourceSha256: sha256(sourceBytes),
      candidateSha256: sha256(candidate),
      entry: {
        guid: result.entry.guid,
        name: result.entry.name,
        filePath: result.entry.filePath,
        sourceBytes: Buffer.from(source, 'utf8').length
      },
      externalPath
    }
    log(`gil=${gilPath}`)
    log(
      `entry=guid:${result.entry.guid} name:${result.entry.name} path:${result.entry.filePath}` +
        ` sourceBytes:${Buffer.from(source, 'utf8').length}`
    )
    log(`externalLua=${externalPath}`)
    if (args.output) {
      const absolute = path.resolve(args.output)
      fs.mkdirSync(path.dirname(absolute), { recursive: true })
      fs.writeFileSync(absolute, candidate)
      summary.output = absolute
      log(`output=${absolute}`)
    } else if (args.write) {
      const currentHash = sha256(new Uint8Array(fs.readFileSync(gilPath)))
      if (currentHash !== summary.sourceSha256) {
        throw new Error(
          `[error] source changed during operation: expected ${summary.sourceSha256}, got ${currentHash}`
        )
      }
      const backup = backupPath(gilPath)
      fs.copyFileSync(gilPath, backup)
      fs.writeFileSync(gilPath, candidate)
      fs.mkdirSync(path.dirname(externalPath), { recursive: true })
      fs.writeFileSync(externalPath, UTF8_BOM + source)
      summary.backup = backup
      summary.writePerformed = true
      log(`backup=${backup}`)
      log('writePerformed=true gil+externalLua')
      const mapId = args.mapId ?? projectConfig?.inject?.mapId
      if (mapId !== undefined) {
        const tempPath = syncGilToTemp(saveLevelDirOf(gilPath), `${mapId}.gil`)
        if (tempPath) {
          summary.tempSync = tempPath
          log(`temp-sync=${tempPath}`)
        }
      } else {
        log('temp-sync=skipped (no --map-id)')
      }
      log('editorOrGameValidation=not-performed; 编辑器需重开地图才会读到盘外写入')
    } else {
      summary.previewOnly = true
      log('preview only; use --write to apply after backup, or --output for a candidate')
    }
    if (jsonMode) process.stdout.write(stableJson(summary))
    return
  }

  // register
  if (!args.name) throw new Error('[error] --name is required')
  if (!args.scriptPath) throw new Error('[error] --path is required')
  const source = sourceOf(args)
  if (args.guid !== undefined && (!Number.isSafeInteger(args.guid) || args.guid <= 0)) {
    throw new Error(`[error] invalid --guid: ${args.guid}`)
  }
  const result = registerScriptInPayload(payload, {
    name: args.name,
    filePath: args.scriptPath,
    source,
    ...(args.guid !== undefined ? { guid: args.guid } : {})
  })
  const candidate = buildFile(result.payload, {
    schema: readUint32BE(sourceBytes, 4),
    headTag: readUint32BE(sourceBytes, 8),
    fileType: readUint32BE(sourceBytes, 12),
    tailTag: readUint32BE(sourceBytes, sourceBytes.length - 4)
  })
  const externalPath = externalLuaDest(gilPath, result.entry.filePath)
  const summary: Record<string, unknown> = {
    schemaVersion: 1,
    kind: 'gsts.assets-scripts-register',
    gilPath,
    sourceSha256: sha256(sourceBytes),
    candidateSha256: sha256(candidate),
    entry: {
      guid: result.entry.guid,
      name: result.entry.name,
      filePath: result.entry.filePath,
      sourceBytes: Buffer.from(source, 'utf8').length
    },
    dedupApplied: result.dedupApplied,
    externalPath,
    prefix: SCRIPT_PATH_PREFIX
  }

  log(`gil=${gilPath}`)
  log(
    `entry=guid:${result.entry.guid} name:${result.entry.name} path:${result.entry.filePath}` +
      ` sourceBytes:${Buffer.from(source, 'utf8').length}`
  )
  if (result.dedupApplied) log('dedupApplied=true (撞既有条目，按编辑器规则加尾)')
  log(`externalLua=${externalPath}`)

  if (args.output) {
    const absolute = path.resolve(args.output)
    fs.mkdirSync(path.dirname(absolute), { recursive: true })
    fs.writeFileSync(absolute, candidate)
    summary.output = absolute
    log(`output=${absolute}`)
  } else if (args.write) {
    const currentHash = sha256(new Uint8Array(fs.readFileSync(gilPath)))
    if (currentHash !== summary.sourceSha256) {
      throw new Error(
        `[error] source changed during operation: expected ${summary.sourceSha256}, got ${currentHash}`
      )
    }
    const backup = backupPath(gilPath)
    fs.copyFileSync(gilPath, backup)
    fs.writeFileSync(gilPath, candidate)
    fs.mkdirSync(path.dirname(externalPath), { recursive: true })
    fs.writeFileSync(externalPath, UTF8_BOM + source)
    summary.backup = backup
    summary.writePerformed = true
    log(`backup=${backup}`)
    log(`writePerformed=true gil+externalLua`)
    const mapId = args.mapId ?? projectConfig?.inject?.mapId
    if (mapId !== undefined) {
      const tempPath = syncGilToTemp(saveLevelDirOf(gilPath), `${mapId}.gil`)
      if (tempPath) {
        summary.tempSync = tempPath
        log(`temp-sync=${tempPath}`)
      }
    } else {
      log('temp-sync=skipped (no --map-id)')
    }
    log('editorOrGameValidation=not-performed; 编辑器需重开地图才会读到盘外写入')
  } else {
    summary.previewOnly = true
    log('preview only; use --write to apply after backup, or --output for a candidate')
  }
  if (jsonMode) process.stdout.write(stableJson(summary))
}

export async function runAssetsScripts(
  argv: readonly string[] = process.argv.slice(2),
  projectConfig?: GstsConfig
): Promise<void> {
  await execute(argv, projectConfig)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  runAssetsScripts().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
