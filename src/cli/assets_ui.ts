import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { mapIdFromGil } from '../../ui/src/anchor.js'
import {
  createLayoutCandidate,
  createUiCandidate,
  defaultCreateSurface,
  resolveSurfaceTarget
} from '../../ui/src/create.js'
import { parseRoot9 } from '../../ui/src/record.js'
import {
  parseUiSemanticCommand,
  runUiSemanticCommand,
  type UiSemanticCliContext
} from '../../ui/src/cli.js'
import type { GstsConfig, GstsInjectConfig } from '../compiler/gsts_config.js'
import { resolveGilTarget, syncGilToTemp } from './gil_paths.js'
import {
  cloneTemplate,
  cloneUiControl,
  createFloatingPage,
  createFloatingPageRich,
  createUiControl,
  createUiImageControl,
  createUiTemplate,
  deleteUiRecord,
  listButtonStates,
  listPageVariables,
  listTemplates,
  listUiControls,
  listUiRecords,
  setAssetColor,
  updateUiAssetReference,
  updateUiControl,
  type UiCreateType,
  type UiUpdateOptions
} from './gil_ui.js'
import { resyncMap } from './maps.js'
import { prettyStableJson } from './static_assembly/json.js'
import { cssColorToArgb } from './static_assembly/library_css.js'

type Command =
  | 'list'
  | 'clone'
  | 'update'
  | 'template'
  | 'create'
  | 'delete'
  | 'variables'
  | 'states'
type TemplateSub = 'list' | 'clone' | 'create'
type Format = 'text' | 'json'
type Vector2 = readonly [number, number]

/** create --type 可接受 token（legacy + 票05 L2 语义 kind + 布局创建） */
type CreateCliType = UiCreateType | 'image' | 'input-box' | 'message-queue' | 'layout'
/** L2 语义 create 路由 kind（donor 支持矩阵见 ui/src/create.ts）；其余走 legacy 旧契约 */
const SEMANTIC_CREATE_KINDS = new Set<CreateCliType>([
  'custom-button',
  'textbox',
  'image',
  'input-box',
  'message-queue',
  'layout'
])

function usage(exitCode = 1): never {
  const output = [
    'List, clone (create) or update screen UI controls and templates (root 9).',
    '',
    'Usage: gsts assets:ui [list|anchor|diff|clone|create|update|template] [options]',
    '',
    '  list: gsts assets:ui list [--tree|--flat] [--kind <kind>] [--path <path>] [--gil <file>] [--format text|json]',
    '  anchor save: gsts assets:ui anchor save --label <名> [--gil <file>] [--format text|json]',
    '  anchor list: gsts assets:ui anchor list [--format text|json]',
    '  diff: gsts assets:ui diff --anchor <label|file> [--gil <file>] [--format text|json]',
    '  legacy list: gsts assets:ui list --gil <file> --format json (records 级列表，语义视图见 --tree/--flat)',
    '  clone: gsts assets:ui clone <source-id> --id <new-id> [options]',
    '  create: gsts assets:ui create --type textbox|interactive-button|custom-button|image|floating-page --id <new-id> [options]',
    '  create (L2, 票05): gsts assets:ui create --type custom-button|textbox|image|input-box|message-queue',
    '                     --on layout:<ID|名称>|container:<容器ID>|悬浮页:<页ID|名>:<容器ID>',
    '                     [--id <new-id>] [--name <n>] [--position <x,y>] [--size <w,h>] [--output <file>]',
    '  create layout:    gsts assets:ui create --type layout [--name <布局名>] [--id <起始ID>] [--output <file>]',
    '                     # 新建布局=克隆默认布局官方预置全集（轮1/2）；名字重名自动 _1/_2',
    '                     # donor 支持矩阵=真实编辑器样本：按钮 轮4/26；输入框 轮19/64；文本框/图片 轮64；队列 轮51(仅布局)',
    '                     # --id 缺省=避让扫描分配（禁 max+1）；--text/--color/--font-size 本轮 fail-closed',
    '  update: gsts assets:ui update <control-id> [--name|--content|--position|--size|--asset <素材ID>]',
    '  delete: gsts assets:ui delete <control-id> [--output <file>|--write]',
    '  template list: gsts assets:ui template list [--gil <file>] [--format json]',
    '  template clone: gsts assets:ui template clone <source-id> --id <new-id> [--name <name>]',
    '  template create: gsts assets:ui template create --id <模板ID> --asset <素材索引ID> [--name <n>] [--position <x,y>] [--size <w,h>]',
    '  variables list: gsts assets:ui variables list [--gil <file>] [--page <悬浮交互页ID>] [--format json]',
    '  states: gsts assets:ui states --id <自定义按钮ID> [--gil <file>] [--format json]',
    '  variables list: gsts assets:ui variables list [--page <悬浮交互页ID>] [--gil <file>] [--format json]',
    '',
    'Options:',
    '  --gil <file>            explicit GIL source',
    '  --donor-gil <file>      donor GIL containing the source control (clone only)',
    '  --output <file>         create output without overwriting',
    '  --write                 atomically write source GIL after backup',
    '  --name <name>           set control name',
    '  --content <text>        set display content (textbox path)',
    '  --text <text>           L2 create: button display text (fail-closed this round)',
    '  --asset <id>            image control: 素材索引 ID (= 素材库容器 ID)',
    '  --layout <id>           image control: 目标布局 ID (default 1073741825 默认布局)',
    '  --position <x,y>        set position (screen-center offset)',
    '  --size <w,h>            set size (width,height)',
    '  --format <text|json>    output format (default: text)',
    '  -h, --help              show help',
    '',
    'These commands modify .gil asset structures. They are not GIA NodeGraph injection,',
    'runtime createPrefab, or editor/game verification.'
  ].join('\n')
  console[exitCode === 0 ? 'log' : 'error'](output)
  process.exit(exitCode)
}

function value(argv: readonly string[], index: number): string {
  const result = argv[index + 1]
  if (!result || result.startsWith('--')) usage()
  return result
}

function argvValue(argv: readonly string[], option: string): string | undefined {
  const index = argv.indexOf(option)
  if (index < 0) return undefined
  const result = argv[index + 1]
  return result && !result.startsWith('--') ? result : undefined
}

function nonNegativeId(raw: string, option: string): number {
  const result = Number(raw)
  if (!Number.isSafeInteger(result) || result < 0)
    throw new Error(`[error] ${option} must be a non-negative safe integer`)
  return result
}

function parseVector2(raw: string, option: string): Vector2 {
  const parts = raw.split(',')
  if (parts.length !== 2) throw new Error(`[error] ${option} must be x,y or w,h`)
  const values = parts.map((part) => Number(part))
  if (values.some((value) => !Number.isFinite(value)))
    throw new Error(`[error] ${option} must contain numbers`)
  return [values[0], values[1]]
}

function parseArgs(argv: readonly string[]) {
  let command: Command = 'list'
  let templateSub: TemplateSub = 'list'
  let gilPath: string | undefined
  let donorGilPath: string | undefined
  let outputPath: string | undefined
  let write = false
  let format: Format = 'text'
  let targetId: number | undefined
  let newId: number | undefined
  let pageId: number | undefined
  let name: string | undefined
  let content: string | undefined
  let position: Vector2 | undefined
  let size: Vector2 | undefined
  let createType: CreateCliType | undefined
  let rich = false
  let variables: Array<{ name: string; type: number }> | undefined
  let assetId: number | undefined
  let layoutId: number | undefined
  let color: string | undefined
  let onRaw: string | undefined
  let text: string | undefined
  let fontSize: number | undefined
  let index = 0
  if (
    argv[0] === 'list' ||
    argv[0] === 'clone' ||
    argv[0] === 'create' ||
    argv[0] === 'update' ||
    argv[0] === 'template' ||
    argv[0] === 'delete' ||
    argv[0] === 'variables' ||
    argv[0] === 'states'
  ) {
    command = argv[0]
    index++
    if (command === 'template') {
      if (argv[1] === 'list' || argv[1] === 'clone' || argv[1] === 'create') {
        templateSub = argv[1]
        index++
      } else {
        usage()
      }
    } else if (command === 'variables') {
      if (argv[1] === 'list') {
        index++
      } else {
        usage()
      }
    }
  }
  for (; index < argv.length; index++) {
    const arg = argv[index]
    if (arg === '--gil') gilPath = value(argv, index++)
    else if (arg === '--donor-gil') donorGilPath = value(argv, index++)
    else if (arg === '--output') outputPath = value(argv, index++)
    else if (arg === '--write') write = true
    else if (arg === '--format') {
      const raw = value(argv, index++)
      if (raw !== 'text' && raw !== 'json') throw new Error('[error] --format must be text or json')
      format = raw
    } else if (arg === '--id') {
      const v = nonNegativeId(value(argv, index++), '--id')
      newId = v
      if (command === 'states') targetId = v
    } else if (arg === '--page') pageId = nonNegativeId(value(argv, index++), '--page')
    else if (arg === '--rich') rich = true
    else if (arg === '--variable') {
      const raw = value(argv, index++)
      const [vname, vtype] = raw.split(':')
      const typeMap: Record<string, number> = { int: 0, float: 1, str: 2, text: 3 }
      const vtypeNum = typeMap[vtype ?? '']
      if (!vname || vtypeNum === undefined)
        throw new Error(`[error] --variable 格式: 名:int|float|str|text`)
      ;(variables ??= []).push({ name: vname, type: vtypeNum })
    } else if (arg === '--name') name = value(argv, index++)
    else if (arg === '--content') content = value(argv, index++)
    else if (arg === '--position') position = parseVector2(value(argv, index++), '--position')
    else if (arg === '--size') size = parseVector2(value(argv, index++), '--size')
    else if (arg === '--type') {
      const raw = value(argv, index++)
      if (
        raw !== 'textbox' &&
        raw !== 'interactive-button' &&
        raw !== 'custom-button' &&
        raw !== 'image' &&
        raw !== 'floating-page' &&
        raw !== 'input-box' &&
        raw !== 'message-queue' &&
        raw !== 'layout'
      ) {
        throw new Error(
          '[error] --type must be textbox, interactive-button, custom-button, image, ' +
            'floating-page, input-box, message-queue or layout'
        )
      }
      createType = raw
    } else if (arg === '--asset') assetId = nonNegativeId(value(argv, index++), '--asset')
    else if (arg === '--color') color = value(argv, index++)
    else if (arg === '--layout') layoutId = nonNegativeId(value(argv, index++), '--layout')
    else if (arg === '--on') onRaw = value(argv, index++)
    else if (arg === '--text') text = value(argv, index++)
    else if (arg === '--font-size') {
      const raw = value(argv, index++)
      const parsed = Number(raw)
      if (!Number.isFinite(parsed) || parsed <= 0 || !Number.isInteger(parsed))
        throw new Error('[error] --font-size 须为正整数')
      fontSize = parsed
    } else if (arg === '--help' || arg === '-h') usage(0)
    else if (
      command !== 'list' &&
      command !== 'variables' &&
      command !== 'states' &&
      targetId === undefined
    ) {
      targetId = nonNegativeId(arg, 'control-id')
    } else usage()
  }
  if (command === 'clone' && targetId === undefined)
    throw new Error('[error] clone requires <source-id>')
  if (command === 'clone' && newId === undefined)
    throw new Error('[error] clone requires --id <new-id>')
  if (command === 'create' && createType === undefined)
    throw new Error(
      '[error] create requires --type <textbox|interactive-button|custom-button|image|' +
        'floating-page|input-box|message-queue>'
    )
  // 旧契约：image（legacy，无 --on）需要 --asset；语义路径（--on）用编辑器默认图片形态
  if (command === 'create' && createType === 'image' && assetId === undefined && onRaw === undefined)
    throw new Error('[error] create --type image requires --asset <素材索引ID>（或使用 --on 走语义路径）')
  // 票05 L2：语义 kind 允许不指定 --id（候选分配器避让扫描）；
  // custom-button/input-box/message-queue 默认布局直达；textbox/image 需显式 --on 才走语义路径
  const semanticAutoId =
    createType === 'custom-button' ||
    createType === 'input-box' ||
    createType === 'message-queue' ||
    createType === 'layout'
  const semanticViaOn =
    onRaw !== undefined && (createType === 'textbox' || createType === 'image')
  if (command === 'create' && newId === undefined && !(semanticAutoId || semanticViaOn)) {
    throw new Error('[error] create requires --id <new-id>')
  }
  if (command === 'states' && targetId === undefined)
    throw new Error('[error] states requires --id <自定义按钮ID>')
  if (command === 'update' && targetId === undefined)
    throw new Error('[error] update requires <control-id>')
  if (command === 'delete' && targetId === undefined)
    throw new Error('[error] delete requires <control-id>')
  if (command === 'template' && templateSub === 'create' && newId === undefined)
    throw new Error('[error] template create requires --id <模板ID>')
  if (command === 'template' && templateSub === 'create' && assetId === undefined)
    throw new Error('[error] template create requires --asset <素材索引ID>')
  if (
    command === 'update' &&
    name === undefined &&
    content === undefined &&
    position === undefined &&
    size === undefined &&
    assetId === undefined &&
    color === undefined
  ) {
    throw new Error(
      '[error] update requires at least one of --name/--content/--position/--size/--asset/--color'
    )
  }
  if (write && outputPath) throw new Error('[error] --write and --output are mutually exclusive')
  return {
    command,
    templateSub,
    gilPath,
    donorGilPath,
    outputPath,
    write,
    format,
    targetId,
    newId,
    pageId,
    name,
    content,
    position,
    size,
    createType,
    rich,
    variables,
    assetId,
    layoutId,
    color,
    on: onRaw,
    text,
    fontSize
  }
}

function resolveGilPath(args: { gilPath?: string }, projectConfig: GstsConfig | undefined): string {
  if (args.gilPath) return path.resolve(args.gilPath)
  const inject: GstsInjectConfig = { ...(projectConfig?.inject ?? {}) }
  if (inject.mapId === undefined) {
    throw new Error(
      '[error] mapId is required; use --gil, or provide a project config with inject.mapId'
    )
  }
  return resolveGilTarget(inject).gilPath
}

function writeNew(outputPath: string, contents: Uint8Array): string {
  const absolute = path.resolve(outputPath)
  if (fs.existsSync(absolute)) throw new Error(`[error] output already exists: ${absolute}`)
  fs.mkdirSync(path.dirname(absolute), { recursive: true })
  fs.writeFileSync(absolute, contents)
  return absolute
}

function backupPath(gilPath: string): string {
  const directory = path.join(path.dirname(gilPath), '.gsts', 'backups')
  fs.mkdirSync(directory, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  return path.join(directory, `${path.basename(gilPath)}.${stamp}.bak`)
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(Buffer.from(bytes)).digest('hex')
}

function writeBack(
  gilPath: string,
  candidate: Uint8Array,
  sourceHash: string,
  mapId?: number
): string {
  const currentHash = sha256(new Uint8Array(fs.readFileSync(gilPath)))
  if (currentHash !== sourceHash) {
    throw new Error(
      `[error] source changed during operation: expected ${sourceHash}, got ${currentHash}`
    )
  }
  const backup = backupPath(gilPath)
  fs.copyFileSync(gilPath, backup)
  fs.writeFileSync(gilPath, candidate)
  try {
    if (mapId !== undefined) {
      resyncMap(path.dirname(gilPath), mapId)
    } else {
      // --gil 直接指定路径时无 mapId，仍同步 Temp 文件（编辑器活动目录）
      syncGilToTemp(path.dirname(gilPath), path.basename(gilPath))
    }
  } catch {
    // best-effort temp sync
  }
  return backup
}

async function execute(argv: readonly string[], projectConfig: GstsConfig | undefined) {
  // 票 04 语义命令面（list/anchor/diff）：先于旧命令解析，只读
  if (argv[0] === 'list' || argv[0] === 'anchor' || argv[0] === 'diff') {
    const command = parseUiSemanticCommand(argv)
    // anchor list 不需要 GIL 文件（只读本地锚点目录）
    if (command.name === 'anchor-list') {
      await runUiSemanticCommand(command, {
        gilPath: '',
        sourceBytes: new Uint8Array(),
        sourceSha256: ''
      })
      return
    }
    const gilArg = argvValue(argv, '--gil')
    const gilPath = gilArg
      ? path.resolve(gilArg)
      : resolveGilPath({ gilPath: undefined }, projectConfig)
    if (!fs.existsSync(gilPath) || !fs.statSync(gilPath).isFile()) {
      throw new Error(`[error] gil not found: ${gilPath}`)
    }
    const sourceBytes = new Uint8Array(fs.readFileSync(gilPath))
    const sourceSha256 = sha256(sourceBytes)
    const context: UiSemanticCliContext = {
      gilPath,
      mapId:
        projectConfig?.inject?.mapId !== undefined
          ? String(projectConfig.inject.mapId)
          : mapIdFromGil(gilPath),
      sourceBytes,
      sourceSha256
    }
    await runUiSemanticCommand(command, context)
    return
  }
  const args = parseArgs(argv)
  const gilPath = resolveGilPath(args, projectConfig)
  if (!fs.existsSync(gilPath) || !fs.statSync(gilPath).isFile()) {
    throw new Error(`[error] gil not found: ${gilPath}`)
  }
  const sourceBytes = new Uint8Array(fs.readFileSync(gilPath))
  const sourceHash = sha256(sourceBytes)
  const jsonMode = args.format === 'json'
  const log = (line: string) => (jsonMode ? console.error(line) : console.log(line))

  if (args.command === 'list') {
    const records = listUiRecords(sourceBytes)
    if (jsonMode) {
      process.stdout.write(prettyStableJson({ schemaVersion: 1, kind: 'ui-list', records }))
    } else {
      const kindOrder: Record<string, string> = {
        layout: '布局',
        asset: '素材',
        'asset-group': '素材组',
        template: '控件模板',
        instance: '控件实例',
        official: '官方预制控件',
        unknown: '其他'
      }
      for (const r of records)
        log(
          `${r.id} [${kindOrder[r.kind] ?? r.kind}] name=${r.name || '(空)'} parent=${r.parentId ?? '-'}`
        )
    }
    return
  }

  if (args.command === 'delete') {
    const result = deleteUiRecord(sourceBytes, args.targetId!)
    const summary: Record<string, unknown> = {
      schemaVersion: 1,
      kind: 'ui-delete',
      sourceSha256: sourceHash,
      removedIds: result.removedIds,
      removedKind: result.kind
    }
    const log2 = (line: string) => (jsonMode ? console.error(line) : console.log(line))
    log2(`removedKind=${result.kind}`)
    log2(`removedIds=${result.removedIds.join(',')}`)
    summary.candidateSha256 = sha256(result.bytes)
    log2(`candidateSha256=${summary.candidateSha256}`)
    if (args.outputPath) {
      summary.candidate = writeNew(args.outputPath, result.bytes)
      log2(`candidate=${summary.candidate}`)
    } else if (args.write) {
      const mapId = projectConfig?.inject?.mapId
      summary.backup = writeBack(gilPath, result.bytes, sourceHash, mapId)
      summary.writePerformed = true
      log2(`backup=${summary.backup}`)
      log2('writePerformed=true')
    } else {
      summary.previewOnly = true
      log2('preview only; use --write to apply after backup, or --output for a candidate')
    }
    if (jsonMode) process.stdout.write(prettyStableJson(summary))
    return
  }

  if (args.command === 'template') {
    if (args.templateSub === 'list') {
      const templates = listTemplates(sourceBytes)
      if (jsonMode) {
        process.stdout.write(
          prettyStableJson({ schemaVersion: 1, kind: 'ui-template-list', templates })
        )
      } else {
        for (const t of templates) log(`id=${t.id} name=${t.name} category=${t.category}`)
      }
    } else if (args.templateSub === 'create') {
      const result = createUiTemplate(sourceBytes, {
        id: args.newId!,
        assetId: args.assetId!,
        ...(args.name !== undefined ? { name: args.name } : {}),
        ...(args.position !== undefined ? { position: args.position } : {}),
        ...(args.size !== undefined ? { size: args.size } : {})
      })
      const summary: Record<string, unknown> = {
        schemaVersion: 1,
        kind: 'ui-template-create',
        sourceSha256: sourceHash,
        templateId: result.templateId,
        instanceId: result.instanceId
      }
      const log2 = (line: string) => (jsonMode ? console.error(line) : console.log(line))
      log2(`templateId=${result.templateId}`)
      log2(`instanceId=${result.instanceId}`)
      summary.candidateSha256 = sha256(result.bytes)
      log2(`candidateSha256=${sha256(result.bytes)}`)
      if (args.outputPath) {
        summary.candidate = writeNew(args.outputPath, result.bytes)
        log2(`candidate=${summary.candidate}`)
      } else if (args.write) {
        const mapId = projectConfig?.inject?.mapId
        summary.backup = writeBack(gilPath, result.bytes, sourceHash, mapId)
        summary.writePerformed = true
        log2(`backup=${summary.backup}`)
        log2('writePerformed=true')
      } else {
        summary.previewOnly = true
        log2('preview only; use --write to apply after backup, or --output for a candidate')
      }
      if (jsonMode) process.stdout.write(prettyStableJson(summary))
      return
    } else {
      // template clone
      const donorBytes = args.donorGilPath
        ? new Uint8Array(fs.readFileSync(path.resolve(args.donorGilPath)))
        : undefined
      const result = cloneTemplate(
        sourceBytes,
        args.targetId!,
        {
          id: args.newId!,
          ...(args.name !== undefined ? { name: args.name } : {})
        },
        donorBytes
      )
      const summary: Record<string, unknown> = {
        schemaVersion: 1,
        kind: 'ui-template-clone',
        sourceSha256: sourceHash,
        newId: result.id
      }
      const log2 = (line: string) => (jsonMode ? console.error(line) : console.log(line))
      log2(`newId=${result.id}`)
      summary.candidateSha256 = sha256(result.bytes)
      log2(`candidateSha256=${sha256(result.bytes)}`)
      if (args.outputPath) {
        summary.candidate = writeNew(args.outputPath, result.bytes)
        log2(`candidate=${summary.candidate}`)
      } else if (args.write) {
        const mapId = projectConfig?.inject?.mapId
        summary.backup = writeBack(gilPath, result.bytes, sourceHash, mapId)
        summary.writePerformed = true
        log2(`backup=${summary.backup}`)
        log2('writePerformed=true')
      } else {
        summary.previewOnly = true
        log2('preview only; use --write to apply after backup, or --output for a candidate')
      }
      if (jsonMode) process.stdout.write(prettyStableJson(summary))
    }
    return
  }

  if (args.command === 'variables') {
    const pages = listPageVariables(sourceBytes, args.pageId)
    if (jsonMode) {
      process.stdout.write(prettyStableJson({ schemaVersion: 1, kind: 'ui-variables-list', pages }))
    } else {
      for (const p of pages) {
        log(`悬浮交互页 ${p.recordId}「${p.pageName}」: ${p.variables.length} 个形式变量`)
        for (const v of p.variables) {
          log(`  [${v.index}] ${v.name} (${v.typeName})`)
        }
      }
      if (pages.length === 0) log('（无形式变量）')
    }
    return
  }

  if (args.command === 'states') {
    const states = listButtonStates(sourceBytes, args.targetId!)
    if (jsonMode) {
      process.stdout.write(
        prettyStableJson({
          schemaVersion: 1,
          kind: 'ui-button-states',
          buttonId: args.targetId,
          states
        })
      )
    } else {
      log(`按钮 ${args.targetId} 状态:`)
      for (const s of states) {
        log(`  ${s.stateName}: ${s.hasMaterial ? `素材组 ${s.materialGroupId}` : '未配置'}`)
      }
      if (states.length === 0) log('  （无 t50 状态块）')
    }
    return
  }

  if (args.command === 'create') {
    const createKind = args.createType
    const semanticAuto =
      createKind === 'custom-button' ||
      createKind === 'input-box' ||
      createKind === 'message-queue' ||
      createKind === 'layout'
    const semanticOn =
      createKind !== undefined &&
      (createKind === 'textbox' || createKind === 'image') &&
      args.on !== undefined &&
      args.assetId === undefined
    if (createKind !== undefined && (semanticAuto || semanticOn)) {
      if (createKind === 'layout') {
        // 新建布局：克隆默认布局官方预置全集（轮1/2 双样本）；不落放置面
        if (args.on !== undefined || args.position !== undefined || args.size !== undefined) {
          throw new Error('[error] create --type layout 不接受 --on/--position/--size（布局非放置面控件）')
        }
        const result = createLayoutCandidate(sourceBytes, {
          ...(args.name !== undefined ? { name: args.name } : {}),
          ...(args.newId !== undefined ? { id: args.newId } : {})
        })
        const summary: Record<string, unknown> = {
          schemaVersion: 1,
          kind: 'ui-create-layout-candidate',
          sourceSha256: sourceHash,
          name: result.name,
          layoutId: result.layoutId,
          memberIds: result.memberIds,
          officialsCount: result.officialsCount
        }
        const log2 = (line: string) => (jsonMode ? console.error(line) : console.log(line))
        log2(`name=${result.name}`)
        log2(`layoutId=${result.layoutId}`)
        log2(`officialsCount=${result.officialsCount}`)
        log2(`memberIds=${result.memberIds.join(',')}`)
        summary.candidateSha256 = sha256(result.bytes)
        log2(`candidateSha256=${summary.candidateSha256}`)
        if (args.outputPath) {
          summary.candidate = writeNew(args.outputPath, result.bytes)
          log2(`candidate=${summary.candidate}`)
        } else if (args.write) {
          // 真实写回只允许在用户确认目标/环境后执行（票05 安全门：SHA→候选→确认→写回→回读）
          summary.writeRequiresUserConfirm = true
          log2('writeRequiresUserConfirm=true (未执行：需用户确认目标地图后单独授权)')
        } else {
          summary.previewOnly = true
          log2('preview only; 使用 --output <file> 落盘候选（本轮只读，不写游戏文件）')
        }
        log2('editorOrGameValidation=not-performed')
        if (jsonMode) process.stdout.write(prettyStableJson(summary))
        return
      }
      // 票05 L2 语义面：官方单条 donor 装配（--on 放置面；--id 缺省=避让分配）
      const parsed = parseRoot9(sourceBytes)
      const surface =
        args.on !== undefined ? resolveSurfaceTarget(parsed, args.on) : defaultCreateSurface()
      if (
        args.text !== undefined ||
        args.fontSize !== undefined ||
        args.color !== undefined ||
        args.content !== undefined
      ) {
        throw new Error(
          '[error] create 本轮候选=编辑器默认形态（--text/--color/--font-size/' +
            '--content 需素材/内容载体 donor，尚未差分闭合，见 ' +
            '.scratch/ui-command-layer/issues/05 open-items）；' +
            '请先 create 默认控件，再用后续 edit/state/material 命令配置'
        )
      }
      const result = createUiCandidate(sourceBytes, {
        kind: createKind,
        surface,
        ...(args.newId !== undefined ? { id: args.newId } : {}),
        ...(args.name !== undefined ? { name: args.name } : {}),
        ...(args.position !== undefined ? { position: args.position } : {}),
        ...(args.size !== undefined ? { size: args.size } : {})
      })
      const summary: Record<string, unknown> = {
        schemaVersion: 1,
        kind: 'ui-create-candidate',
        sourceSha256: sourceHash,
        kindOf: result.kind,
        surface: result.surface,
        parentId: result.parentId,
        newId: result.newId,
        donorSource: result.donorSource,
        donorKind: result.donorKind,
        donorSelfId: result.donorSelfId,
        donorParentId: result.donorParentId,
        donorSurface: result.donorSurface,
        ...(result.donorFallback === true ? { donorFallback: true } : {}),
        ...(result.insertAfterId !== undefined ? { insertAfterId: result.insertAfterId } : {})
      }
      const log2 = (line: string) => (jsonMode ? console.error(line) : console.log(line))
      log2(`kind=${result.kind}`)
      log2(`surface=${JSON.stringify(result.surface)}`)
      log2(`parentId=${result.parentId}`)
      log2(`newId=${result.newId}`)
      log2(
        `donor=${result.donorSource} (${result.donorKind} ${result.donorSelfId}->${result.newId}` +
          `${result.donorFallback === true ? ', 容器donor跨面回退' : ''})`
      )
      summary.candidateSha256 = sha256(result.bytes)
      log2(`candidateSha256=${summary.candidateSha256}`)
      if (args.outputPath) {
        summary.candidate = writeNew(args.outputPath, result.bytes)
        log2(`candidate=${summary.candidate}`)
      } else if (args.write) {
        // 真实写回只允许在用户确认目标/环境后执行（票05 安全门：SHA→候选→确认→写回→回读）
        summary.writeRequiresUserConfirm = true
        log2('writeRequiresUserConfirm=true (未执行：需用户确认目标地图/容器后单独授权)')
      } else {
        summary.previewOnly = true
        log2('preview only; 使用 --output <file> 落盘候选（本轮只读，不写游戏文件）')
      }
      log2('editorOrGameValidation=not-performed')
      if (jsonMode) process.stdout.write(prettyStableJson(summary))
      return
    }
    if (args.createType === 'floating-page') {
      const result = args.rich
        ? createFloatingPageRich(sourceBytes, {
            id: args.newId!,
            ...(args.name !== undefined ? { name: args.name } : {}),
            ...(args.variables ? { variables: args.variables } : {})
          })
        : createFloatingPage(sourceBytes, {
            id: args.newId!,
            ...(args.name !== undefined ? { name: args.name } : {})
          })
      const summary: Record<string, unknown> = {
        schemaVersion: 1,
        kind: 'ui-create-floating-page',
        sourceSha256: sourceHash,
        templateId: result.templateId,
        instanceId: result.instanceId,
        groupTemplateId: result.groupTemplateId,
        groupInstanceId: result.groupInstanceId
      }
      const log2 = (line: string) => (jsonMode ? console.error(line) : console.log(line))
      log2(`templateId=${result.templateId}`)
      log2(`instanceId=${result.instanceId}`)
      log2(`groupTemplateId=${result.groupTemplateId}`)
      log2(`groupInstanceId=${result.groupInstanceId}`)
      summary.candidateSha256 = sha256(result.bytes)
      log2(`candidateSha256=${sha256(result.bytes)}`)
      if (args.rich) {
        const rich = result as import('./gil_ui.js').RichFloatingPageCreateResult
        summary.kind = 'ui-create-floating-page-rich'
        summary.pageGroupIds = rich.pageGroupIds
        summary.tabContainerId = rich.tabContainerId
        summary.tabId = rich.tabId
        summary.stateGroupIds = rich.stateGroupIds
        log2(`pageGroupIds=${rich.pageGroupIds.join(',')}`)
        log2(`tabContainerId=${rich.tabContainerId}`)
        log2(`tabId=${rich.tabId}`)
        log2(`stateGroupIds=${rich.stateGroupIds.join(',')}`)
      }
      if (args.outputPath) {
        summary.candidate = writeNew(args.outputPath, result.bytes)
        log2(`candidate=${summary.candidate}`)
      } else if (args.write) {
        const mapId = projectConfig?.inject?.mapId
        summary.backup = writeBack(gilPath, result.bytes, sourceHash, mapId)
        summary.writePerformed = true
        log2(`backup=${summary.backup}`)
        log2('writePerformed=true')
      } else {
        summary.previewOnly = true
        log2('preview only; use --write to apply after backup, or --output for a candidate')
      }
      if (jsonMode) process.stdout.write(prettyStableJson(summary))
      return
    }
    // 剩余可到达 = legacy image（带 --asset 且无 --on）或 legacy textbox/interactive-button
    if (
      args.createType !== 'image' &&
      args.createType !== 'textbox' &&
      args.createType !== 'interactive-button'
    ) {
      throw new Error(`[error] create kind 未支持（无 legacy/语义路径）: ${String(args.createType)}`)
    }
    const legacyType = args.createType
    const result =
      legacyType === 'image'
        ? createUiImageControl(sourceBytes, {
            id: args.newId!,
            assetId: args.assetId!,
            ...(args.layoutId !== undefined ? { layoutId: args.layoutId } : {}),
            ...(args.name !== undefined ? { name: args.name } : {}),
            ...(args.position !== undefined ? { position: args.position } : {}),
            ...(args.size !== undefined ? { size: args.size } : {})
          })
        : createUiControl(sourceBytes, {
            type: legacyType,
            id: args.newId!,
            ...(args.name !== undefined ? { name: args.name } : {}),
            ...(args.content !== undefined ? { content: args.content } : {}),
            ...(args.position !== undefined ? { position: args.position } : {}),
            ...(args.size !== undefined ? { size: args.size } : {})
          })
    const summary: Record<string, unknown> = {
      schemaVersion: 1,
      kind: 'ui-create',
      sourceSha256: sourceHash,
      newId: result.id
    }
    const log2 = (line: string) => (jsonMode ? console.error(line) : console.log(line))
    log2(`newId=${result.id}`)
    summary.candidateSha256 = sha256(result.bytes)
    log2(`candidateSha256=${sha256(result.bytes)}`)
    if (args.outputPath) {
      summary.candidate = writeNew(args.outputPath, result.bytes)
      log2(`candidate=${summary.candidate}`)
    } else if (args.write) {
      const mapId = projectConfig?.inject?.mapId
      summary.backup = writeBack(gilPath, result.bytes, sourceHash, mapId)
      summary.writePerformed = true
      log2(`backup=${summary.backup}`)
      log2('writePerformed=true')
    } else {
      summary.previewOnly = true
      log2('preview only; use --write to apply after backup, or --output for a candidate')
    }
    if (jsonMode) process.stdout.write(prettyStableJson(summary))
    return
  }

  let candidate: Uint8Array
  const summary: Record<string, unknown> = {
    schemaVersion: 1,
    kind: `ui-${args.command}`,
    sourceSha256: sourceHash
  }

  if (args.command === 'clone') {
    const donorBytes = args.donorGilPath
      ? new Uint8Array(fs.readFileSync(path.resolve(args.donorGilPath)))
      : undefined
    const result = cloneUiControl(
      sourceBytes,
      args.targetId!,
      {
        id: args.newId!,
        ...(args.name !== undefined ? { name: args.name } : {}),
        ...(args.content !== undefined ? { content: args.content } : {}),
        ...(args.position !== undefined ? { position: args.position } : {}),
        ...(args.size !== undefined ? { size: args.size } : {})
      },
      donorBytes
    )
    candidate = result.bytes
    summary.newId = result.id
    if (donorBytes) summary.donorGil = args.donorGilPath
    log(`newId=${result.id}`)
  } else if (args.color !== undefined) {
    // 改素材颜色（含分类副本的所有图元组）
    const argb = cssColorToArgb(args.color, 1)
    const result = setAssetColor(sourceBytes, args.targetId!, argb)
    candidate = result.bytes
    summary.changedIds = result.changedIds
    log(`changedIds=${result.changedIds.join(',')}`)
  } else if (args.assetId !== undefined) {
    // 改素材引用（模板会同步所有实例）
    const result = updateUiAssetReference(sourceBytes, args.targetId!, args.assetId)
    candidate = result.bytes
    summary.changedIds = result.changedIds
    log(`changedIds=${result.changedIds.join(',')}`)
  } else {
    const options: UiUpdateOptions = {
      ...(args.name !== undefined ? { name: args.name } : {}),
      ...(args.content !== undefined ? { content: args.content } : {}),
      ...(args.position !== undefined ? { position: args.position } : {}),
      ...(args.size !== undefined ? { size: args.size } : {})
    }
    const result = updateUiControl(sourceBytes, args.targetId!, options)
    candidate = result.bytes
    summary.changed = result.changed
    log(`changed=${result.changed.join(',')}`)
  }

  summary.candidateSha256 = sha256(candidate)
  log(`candidateSha256=${sha256(candidate)}`)

  if (args.outputPath) {
    summary.candidate = writeNew(args.outputPath, candidate)
    log(`candidate=${summary.candidate}`)
  } else if (args.write) {
    const mapId = projectConfig?.inject?.mapId
    summary.backup = writeBack(gilPath, candidate, sourceHash, mapId)
    summary.writePerformed = true
    log(`backup=${summary.backup}`)
    log('writePerformed=true')
  } else {
    summary.previewOnly = true
    log('preview only; use --write to apply after backup, or --output for a candidate')
  }
  log(
    'editorOrGameValidation=not-performed; editor memory ignores disk writes, reload map before saving'
  )
  if (jsonMode) process.stdout.write(prettyStableJson(summary))
}

export async function runAssetsUi(
  argv: readonly string[] = process.argv.slice(2),
  projectConfig?: GstsConfig
): Promise<void> {
  await execute(argv, projectConfig)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  runAssetsUi().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
