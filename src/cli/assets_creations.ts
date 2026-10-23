import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import type { GstsConfig, GstsInjectConfig } from '../compiler/gsts_config.js'
import { resolveGilTarget, saveLevelDirOf, syncGilToTemp } from './gil_paths.js'
import {
  CREATION_BASE_DEFAULT,
  createCreation,
  loadCreationTemplate,
  nextCreationIds,
  readCreationConfig,
  readCreationTemplate,
  updateCreationConfig,
  writeCreationTemplate,
  type CreationConfigUpdate,
  type CreationTemplate
} from './gil_creations.js'
import { prettyStableJson } from './static_assembly/json.js'

/**
 * 复杂造物（造物元件）资产命令。
 *
 *   gsts assets:creations create [--name <名>] [--id <defId>] [--instance-id <instId>]
 *                                [--template <file>] [--gil <map>] [--output <f>|--write]
 *   gsts assets:creations export-template [--def <id>|--base <resID>] [--out <file>] [--gil <map>]
 *   gsts assets:creations inspect --target <id> [--layer def|instance|entity] [--gil <map>]
 *   gsts assets:creations skill add --target <id> [--name 技能_N] [--skill-config <cfgId>]
 *                                   [--cd 0] [--ignore-public-cd]
 *   gsts assets:creations skill bind --target <id> --index <n> --skill-config <cfgId>
 *                                    [--cd 0] [--ignore-public-cd]
 *   gsts assets:creations decision bind --target <id> --graph <graphId>
 *
 * 路线=字节透传克隆（见 gil_creations.ts 头注）：CLI 组件白名单不含造物特化槽，
 * 任何字段级重建都会丢槽，所以模板必须来自编辑器产出的干净造物。
 */

function usage(code = 1): never {
  const text = [
    '复杂造物（造物元件）创建/模板导出（字节透传克隆路线）',
    '',
    'Usage: gsts assets:creations <create|export-template|inspect|skill|decision> [options]',
    '',
    'create（缺省子命令）：',
    '  --name <名>           造物名字（缺省沿用模板名）',
    '  --id <defId>          def ID（缺省自动取造物段下一个空闲 ID）',
    '  --instance-id <id>    元件页面实例 ID（缺省自动分配）',
    '  --template <file>     模板 JSON（缺省 resources/creations/creation-<base>.json）',
    '  --base <resId>        造物基板 resID（仅用于定位缺省模板文件，默认 30007001）',
    '  --gil <file> | --map-id <id>   目标地图',
    '  --output <file>       写候选（不碰源图）',
    '  --write               写回（自动备份 + Temp 同步）',
    '  --format <text|json>',
    '',
    'export-template：',
    '  --def <id> | --base <resId>    从地图里取哪个造物作模板（默认按 --base 找）',
    '  --out <file>                   模板输出路径（默认 resources/creations/creation-<base>.json）',
    '  --gil <file> | --map-id <id>',
    '',
    'inspect（只读）：读造物配置态（决策图 / 技能条目 / CD / 公共冷却）',
    '  --target <id>                  造物记录 id（实体 / 页面实例 / 定义）',
    '  --layer def|instance|entity    显式指定层（缺省按 entity→instance→def 顺序找）',
    '',
    'skill add（新增一个技能条目；实测 +44 B，编辑器默认名 技能_<n>）：',
    '  --target <id> --name <名> --skill-config <cfgId> --cd 0 --ignore-public-cd',
    '',
    'skill bind（把某条技能绑定到技能配置；实测绑定位 = 条目 f2.f2）：',
    '  --target <id> --index <n> --skill-config <cfgId> [--cd 0] [--ignore-public-cd]',
    '    注意：绑定的旗标是 --skill-config（--config 是全局配置文件选项，会冲突）',
    '',
    'decision bind（绑定 20007 决策图；实测 +6 B，写 f79.f1.f2）：',
    '  --target <id> --graph <graphId>',
    '',
    '公共：--gil <file> | --map-id <id>；--output <file> 出候选；--write 备份后写回并同步 Temp；--format json',
    ''
  ].join('\n')
  if (code === 0) {
    console.log(text)
    process.exit(0)
  }
  console.error(text)
  process.exit(code)
}

type Args = {
  command: 'create' | 'export-template' | 'inspect' | 'skill-add' | 'skill-bind' | 'decision-bind'
  targetId?: number
  layer?: 'def' | 'instance' | 'entity'
  index?: number
  configId?: number
  graphId?: number
  cdSeconds?: number
  ignorePublicCd: boolean
  name?: string
  defId?: number
  instanceId?: number
  base: number
  templatePath?: string
  outPath?: string
  gilPath?: string
  mapId?: number
  outputPath?: string
  write: boolean
  format: 'text' | 'json'
}

function parseArgs(argv: readonly string[]): Args {
  let command: Args['command'] = 'create'
  let commandSet = false
  let name: string | undefined
  let defId: number | undefined
  let instanceId: number | undefined
  let base = CREATION_BASE_DEFAULT
  let templatePath: string | undefined
  let outPath: string | undefined
  let gilPath: string | undefined
  let mapId: number | undefined
  let outputPath: string | undefined
  let targetId: number | undefined
  let layer: 'def' | 'instance' | 'entity' | undefined
  let index: number | undefined
  let configId: number | undefined
  let graphId: number | undefined
  let cdSeconds: number | undefined
  let ignorePublicCd = false
  let write = false
  let format: Args['format'] = 'text'
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    const next = (): string => {
      const v = argv[i + 1]
      if (v === undefined) throw new Error(`[error] ${a} requires a value`)
      i += 1
      return v
    }
    if (a === 'create' || a === 'export-template' || a === 'inspect') {
      command = a
      commandSet = true
    } else if (a === 'skill') {
      const sub = argv[i + 1]
      if (sub === 'add' || sub === 'bind') {
        command = sub === 'add' ? 'skill-add' : 'skill-bind'
        commandSet = true
        i += 1
      } else usage()
    } else if (a === 'decision') {
      const sub = argv[i + 1]
      if (sub === 'bind') {
        command = 'decision-bind'
        commandSet = true
        i += 1
      } else usage()
    } else if (a === '--target') targetId = Number(next())
    else if (a === '--layer') {
      const v = next()
      if (v !== 'def' && v !== 'instance' && v !== 'entity') throw new Error(`[error] unknown layer: ${v}`)
      layer = v
    } else if (a === '--index') index = Number(next())
    else if (a === '--skill-config' || a === '--cfg') configId = Number(next())
    else if (a === '--graph') graphId = Number(next())
    else if (a === '--cd') cdSeconds = Number(next())
    else if (a === '--ignore-public-cd') ignorePublicCd = true
    else if (a === '--name') name = next()
    else if (a === '--id') defId = Number(next())
    else if (a === '--instance-id') instanceId = Number(next())
    else if (a === '--base') base = Number(next())
    else if (a === '--template') templatePath = next()
    else if (a === '--out') outPath = next()
    else if (a === '--gil') gilPath = next()
    else if (a === '--map-id') mapId = Number(next())
    else if (a === '--output') outputPath = next()
    else if (a === '--write') write = true
    else if (a === '--format') {
      const r = next()
      if (r !== 'text' && r !== 'json') throw new Error(`[error] unknown format: ${r}`)
      format = r
    } else if (a === '--help' || a === '-h') usage(0)
    else if (a === '--def') defId = Number(next())
    else usage()
  }
  if (!commandSet && (defId !== undefined || outPath !== undefined) && !name && !write && !outputPath) {
    // `--def X` 单独出现时按 export-template 理解（省一次子命令）
    const hasDef = argv.includes('--def')
    if (hasDef) command = 'export-template'
  }
  if (command === 'export-template' && defId === undefined && base === CREATION_BASE_DEFAULT && argv.includes('--def')) {
    throw new Error('[error] export-template requires a valid --def <id>')
  }
  if (write && outputPath) throw new Error('[error] --write and --output are mutually exclusive')
  if (command === 'inspect' || command === 'skill-add' || command === 'skill-bind' || command === 'decision-bind') {
    if (targetId === undefined) throw new Error('[error] --target <造物记录 id> is required')
  }
  if (command === 'skill-bind' && (index === undefined || configId === undefined)) {
    throw new Error('[error] skill bind requires --index <n> and --skill-config <cfgId>')
  }
  if (command === 'decision-bind' && graphId === undefined) {
    throw new Error('[error] decision bind requires --graph <graphId>')
  }
  return {
    command,
    targetId,
    layer,
    index,
    configId,
    graphId,
    cdSeconds,
    ignorePublicCd,
    name,
    defId,
    instanceId,
    base,
    templatePath,
    outPath,
    gilPath,
    mapId,
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

function defaultTemplatePath(base: number): string {
  return path.resolve('resources', 'creations', `creation-${base}.json`)
}

async function execute(argv: readonly string[], cfg: GstsConfig | undefined): Promise<void> {
  const args = parseArgs(argv)
  const gilPath = resolveGilPath(args, cfg)
  if (!fs.existsSync(gilPath) || !fs.statSync(gilPath).isFile()) throw new Error(`[error] gil not found: ${gilPath}`)
  const src = new Uint8Array(fs.readFileSync(gilPath))
  const sourceHash = sha256(src)
  const json = args.format === 'json'
  const log = (s: string) => (json ? console.error(s) : console.log(s))

  if (args.command === 'inspect') {
    const view = readCreationConfig(src, { targetId: args.targetId!, layer: args.layer })
    log(
      `record=${view.recordId} layer=${view.layer} name=${view.name} base=${view.base} ` +
        `decision=${view.decisionGraphId ?? '-'}(mark ${view.decisionTypeMark ?? '-'}) ` +
        `skills=${view.skills.length} publicCd=${view.publicCooldown ?? '-'}`
    )
    for (const skill of view.skills) {
      log(
        `  #${skill.index} ${skill.name} config=${skill.configId ?? '-'} ` +
          `cd=[${skill.cd.join(',')}] ignorePublicCd=${skill.ignorePublicCd}`
      )
    }
    if (json) {
      process.stdout.write(
        prettyStableJson({ schemaVersion: 1, kind: 'creations-inspect', sourceSha256: sourceHash, ...view })
      )
    }
    return
  }

  if (args.command === 'skill-add' || args.command === 'skill-bind' || args.command === 'decision-bind') {
    const update: CreationConfigUpdate =
      args.command === 'decision-bind'
        ? { kind: 'bind-decision', graphId: args.graphId! }
        : args.command === 'skill-add'
          ? {
              kind: 'add-skill',
              name: args.name,
              configId: args.configId,
              cdSeconds: args.cdSeconds,
              ignorePublicCd: args.ignorePublicCd
            }
          : {
              kind: 'bind-skill',
              index: args.index!,
              configId: args.configId!,
              cdSeconds: args.cdSeconds,
              ignorePublicCd: args.ignorePublicCd
            }
    const result = updateCreationConfig(src, { targetId: args.targetId!, layer: args.layer, update })
    const summary: Record<string, unknown> = {
      schemaVersion: 1,
      kind: `creations-${args.command}`,
      sourceSha256: sourceHash,
      candidateSha256: sha256(result.bytes),
      recordId: result.recordId,
      layer: result.layer,
      detail: result.detail
    }
    log(`record=${result.recordId} layer=${result.layer} ${result.detail}`)
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
    return
  }

  if (args.command === 'export-template') {
    const template = readCreationTemplate(src, { defId: args.defId, base: args.base })
    const out = args.outPath ?? defaultTemplatePath(template.base)
    const abs = writeCreationTemplate(out, template)
    const summary = {
      schemaVersion: 1,
      kind: 'creations-export-template',
      sourceSha256: sourceHash,
      template: abs,
      base: template.base,
      defId: template.defId,
      instanceId: template.instanceId,
      registry: template.registry
    }
    log(`template=${abs}`)
    log(`base=${template.base} defId=${template.defId} instanceId=${template.instanceId}`)
    log(
      `registry=${template.registry.map((r) => `{${r.groupType},${r.entryType},${r.target}}`).join(' ')}`
    )
    if (json) process.stdout.write(prettyStableJson(summary))
    return
  }

  const templatePath = args.templatePath ?? defaultTemplatePath(args.base)
  if (!fs.existsSync(path.resolve(templatePath))) {
    throw new Error(
      `[error] 模板不存在: ${path.resolve(templatePath)}\n` +
        '  先在同一张（或任意）地图里用编辑器建一个干净造物，然后：\n' +
        `  gsts assets:creations export-template --gil <map> --def <造物defID> --out ${templatePath}`
    )
  }
  const template: CreationTemplate = loadCreationTemplate(templatePath)
  const auto = args.defId === undefined || args.instanceId === undefined ? nextCreationIds(src) : undefined
  const defId = args.defId ?? auto!.defId
  const instanceId = args.instanceId ?? auto!.instanceId
  const result = createCreation(src, { template, defId, instanceId, name: args.name })
  const summary: Record<string, unknown> = {
    schemaVersion: 1,
    kind: 'creations-create',
    sourceSha256: sourceHash,
    template: path.resolve(templatePath),
    base: result.base,
    defId: result.defId,
    instanceId: result.instanceId,
    name: result.name
  }
  log(`defId=${result.defId} instanceId=${result.instanceId} name=${result.name} base=${result.base}`)
  summary.candidateSha256 = sha256(result.bytes)
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

export async function runAssetsCreations(
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

if (process.argv[1] && /assets_creations\.(ts|js)$/.test(process.argv[1])) {
  void runAssetsCreations()
}
