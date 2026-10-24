import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import type { GstsConfig, GstsInjectConfig } from '../compiler/gsts_config.js'
import { resolveGilTarget, saveLevelDirOf, syncGilToTemp } from './gil_paths.js'
import {
  LEVEL_FACTION_ROOT,
  listFactionAssignments,
  readFaction,
  readFactionTable,
  writeFaction,
  type FactionLayer
} from './gil_factions.js'
import { prettyStableJson } from './static_assembly/json.js'

/**
 * 阵营（Faction）资产命令。
 *
 *   gsts assets:factions list [--gil <map>|--map-id <id>] [--format json]
 *   gsts assets:factions get --target <记录id> [--layer entity|instance] [...]
 *   gsts assets:factions set --target <记录id> --faction <0|阵营id|阵营名> [--layer ...]
 *                            [--output <file>|--write] [...]
 *
 * 规则与 wire 见 `src/cli/gil_factions.ts` 顶部注释 / `docs/game-engine-knowledge/gil-static-scene-semantics.md`
 * 「场景实体『基础信息区块』= f6 命名空间」节。阵营值 0 = 默认（写空 message）。
 */

type Command = 'list' | 'get' | 'set'

type Args = {
  command: Command
  gilPath?: string
  mapId?: number
  targetId?: number
  faction?: number
  factionText?: string
  layer?: FactionLayer
  outputPath?: string
  write: boolean
  format: 'text' | 'json'
}

function usage(code = 1): never {
  const text = [
    'usage:',
    '  gsts assets:factions list [--gil <map>|--map-id <id>] [--format json]',
    '  gsts assets:factions get --target <recordId> [--layer entity|instance] [--gil <map>]',
    '  gsts assets:factions set --target <recordId> --faction <0|id|name> [--layer entity|instance]',
    '                            [--output <file>|--write] [--gil <map>|--map-id <id>]',
    '',
    '关于 layer：root5 场景实体 = entity；root8 元件页面实例 = instance（元件定义页里改的阵营落在这里）。',
    '          元件定义本体 root4 不保存阵营；关卡实体（1094713345）等系统实体没有阵营槽。',
    '关于值：  0 = 默认阵营（wire = 空 message，与编辑器一致）；其余取关卡阵营表的阵营 id。',
    '',
    'common: --gil <file> | --map-id <id>; --output <file> 出候选; --write 备份后写回并同步 Temp;',
    '        --format text|json'
  ].join('\n')
  if (code === 0) {
    console.log(text)
    process.exit(0)
  }
  console.error(text)
  process.exit(code)
}

function parseArgs(argv: readonly string[]): Args {
  let command: Command | undefined
  let gilPath: string | undefined
  let mapId: number | undefined
  let targetId: number | undefined
  let factionText: string | undefined
  let layer: FactionLayer | undefined
  let outputPath: string | undefined
  let write = false
  let format: 'text' | 'json' = 'text'

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === 'list' || a === 'get' || a === 'set') {
      if (command) usage()
      command = a
    } else if (a === '--gil') gilPath = argv[++i]
    else if (a === '--map-id') mapId = Number(argv[++i])
    else if (a === '--target') targetId = Number(argv[++i])
    else if (a === '--faction') factionText = argv[++i]
    else if (a === '--layer') {
      const v = argv[++i]
      if (v !== 'entity' && v !== 'instance') usage()
      layer = v
    } else if (a === '--output') outputPath = argv[++i]
    else if (a === '--write') write = true
    else if (a === '--format') {
      const v = argv[++i]
      if (v !== 'text' && v !== 'json') usage()
      format = v
    } else if (a === '--help' || a === '-h') usage(0)
    else usage()
  }

  const cmd = command ?? 'list'
  if (cmd === 'get' || cmd === 'set') {
    if (!Number.isFinite(targetId)) usage()
  }
  if (cmd === 'set') {
    if (factionText === undefined) usage()
    if (write && outputPath) throw new Error('[error] --write and --output are mutually exclusive')
  }
  return {
    command: cmd,
    gilPath,
    mapId: Number.isFinite(mapId) ? mapId : undefined,
    targetId: Number.isFinite(targetId) ? targetId : undefined,
    factionText,
    layer,
    outputPath,
    write,
    format
  }
}

function resolveGilPath(args: Args, cfg: GstsConfig | undefined): string {
  if (args.gilPath) return path.resolve(args.gilPath)
  const inject: GstsInjectConfig = { ...(cfg?.inject ?? {}) }
  const mapId = args.mapId ?? inject.mapId
  if (mapId === undefined) throw new Error('[error] mapId required; use --gil or --map-id')
  return resolveGilTarget({ ...inject, mapId }).gilPath
}

function sha256(b: Uint8Array): string {
  return createHash('sha256').update(Buffer.from(b)).digest('hex')
}

function resolveFactionValue(args: Args, table: ReturnType<typeof readFactionTable>): number {
  const raw = (args.factionText ?? '').trim()
  if (raw === 'default' || raw === '默认') return 0
  if (/^-?\d+$/.test(raw)) return Number(raw)
  const hit = table.find((f) => f.name === raw)
  if (!hit) {
    const known = table.map((f) => `${f.id}=${f.name}`).join(' / ') || '(空)'
    throw new Error(`[error] 阵营名 "${raw}" 不在关卡阵营表里（可用：0=默认 / ${known}）`)
  }
  return hit.id
}

async function execute(argv: readonly string[], cfg: GstsConfig | undefined): Promise<void> {
  const args = parseArgs(argv)
  const gilPath = resolveGilPath(args, cfg)
  if (!fs.existsSync(gilPath) || !fs.statSync(gilPath).isFile()) {
    throw new Error(`[error] gil not found: ${gilPath}`)
  }
  const src = new Uint8Array(fs.readFileSync(gilPath))
  const sourceHash = sha256(src)
  const json = args.format === 'json'
  const log = (s: string) => (json ? console.error(s) : console.log(s))

  if (args.command === 'list') {
    const table = readFactionTable(src)
    const assignments = listFactionAssignments(src)
    log(`gil=${gilPath}`)
    log(`sourceSha256=${sourceHash}`)
    log(`阵营表（root${LEVEL_FACTION_ROOT}）：${table.length} 个`)
    for (const entry of table) {
      const defType = entry.defaultObjectType === undefined ? '-' : ['玩家', '物件', '造物'][entry.defaultObjectType] ?? `#${entry.defaultObjectType}`
      log(
        `  #${entry.id} ${entry.name} icon=${entry.icon || '-'} 玩家=[${entry.players.join(',')}] ` +
          `默认对象=${defType}(候选) 敌对=[${entry.hostileTo.join(',')}](候选) ${entry.bytes}B`
      )
    }
    const byFaction = new Map<number, number>()
    for (const a of assignments) byFaction.set(a.faction, (byFaction.get(a.faction) ?? 0) + 1)
    log(`带阵营槽的记录：${assignments.length} 条（entity ${assignments.filter((a) => a.layer === 'entity').length} / instance ${assignments.filter((a) => a.layer === 'instance').length}）`)
    log(
      `阵营分布：` +
        [...byFaction.entries()]
          .sort((x, y) => x[0] - y[0])
          .map(([v, n]) => `${v === 0 ? '默认' : (table.find((f) => f.id === v)?.name ?? `#${v}`)}=${n}`)
          .join(' / ')
    )
    for (const a of assignments) {
      if (a.faction === 0) continue
      log(`  非默认：${a.layer} ${a.recordId} ${a.name} → #${a.faction} ${a.factionName ?? '?'}`)
    }
    if (json) {
      process.stdout.write(
        prettyStableJson({
          schemaVersion: 1,
          kind: 'factions-list',
          gil: gilPath,
          sourceSha256: sourceHash,
          table,
          assignments
        })
      )
    }
    return
  }

  if (args.command === 'get') {
    const view = readFaction(src, { targetId: args.targetId!, layer: args.layer })
    log(
      `record=${view.recordId} layer=${view.layer} name=${view.name || '-'} def=${view.defId ?? '-'} ` +
        `faction=${view.faction}${view.faction === 0 ? '(默认)' : `(${view.factionName ?? '?'})`} slot=${view.slotBytesHex}`
    )
    if (json) {
      process.stdout.write(
        prettyStableJson({ schemaVersion: 1, kind: 'factions-get', sourceSha256: sourceHash, ...view })
      )
    }
    return
  }

  const table = readFactionTable(src)
  const faction = resolveFactionValue(args, table)
  const result = writeFaction(src, { targetId: args.targetId!, faction, layer: args.layer })
  // 写后自检：从候选字节重新读回，值必须等于目标（防"静默零改动"）。
  const verify = readFaction(result.bytes, { targetId: result.recordId, layer: result.layer })
  if (verify.faction !== faction) {
    throw new Error(
      `[error] 写后自检失败：期望 ${faction}，回读 ${verify.faction}（记录 ${result.recordId}）`
    )
  }
  const summary: Record<string, unknown> = {
    schemaVersion: 1,
    kind: 'factions-set',
    gil: gilPath,
    sourceSha256: sourceHash,
    candidateSha256: sha256(result.bytes),
    recordId: result.recordId,
    layer: result.layer,
    name: result.name,
    previous: result.previous,
    faction,
    verified: true
  }
  log(
    `record=${result.recordId} layer=${result.layer} name=${result.name || '-'} ` +
      `faction ${result.previous} → ${faction} (回读校验 PASS)`
  )
  log(`candidateSha256=${sha256(result.bytes)}`)
  if (args.outputPath) {
    const abs = path.resolve(args.outputPath)
    fs.writeFileSync(abs, result.bytes)
    summary.candidate = abs
    log(`candidate=${abs}`)
  } else if (args.write) {
    const backupDir = path.join(saveLevelDirOf(gilPath), '.gsts', 'backups')
    fs.mkdirSync(backupDir, { recursive: true })
    const bak = path.join(
      backupDir,
      `${path.basename(gilPath)}.${new Date().toISOString().replace(/[:.]/g, '-')}.bak`
    )
    fs.copyFileSync(gilPath, bak)
    fs.writeFileSync(gilPath, result.bytes)
    const tempPath = syncGilToTemp(saveLevelDirOf(gilPath), path.basename(gilPath))
    summary.backup = bak
    summary.writePerformed = true
    if (tempPath) summary.temp = tempPath
    log(`backup=${bak}`)
    log('writePerformed=true')
    log(tempPath ? `temp=${tempPath}` : 'temp=null (Temp 目录不存在，未同步)')
  } else {
    summary.previewOnly = true
    log('preview only; use --write to apply after backup, or --output for a candidate')
  }
  if (json) process.stdout.write(prettyStableJson(summary))
}

export async function runAssetsFactions(
  argv: readonly string[] = process.argv.slice(2),
  cfg?: GstsConfig
): Promise<void> {
  try {
    await execute(argv, cfg)
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e))
    process.exitCode = 1
  }
}
