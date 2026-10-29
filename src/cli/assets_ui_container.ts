/**
 * src/cli/assets_ui_container.ts — `gsts assets:ui container …`（容器子树一条龙命令面）
 *
 * 三条子命令（全部默认 dry-run；写回须 `--write --yes`，由 assets_ui.ts 的 writeBack 统一过门）：
 *   discover      从**已导入**的地图里自动发现客户端控件容器模板（组→节点→全部子控件）与其子控件树
 *   instantiate   把选中的容器模板整棵子树复制成布局实例（布局 f503 追加 + 模板 f14 实例列表追加 +
 *                 脚本挂载随记录复制到布局节点）
 *   save-template 把库/布局实例复制成容器模板（实例 f13 改指新模板、同名去重；旧模板实例列表摘除）
 *
 * 设计约束（用户令）：禁止写死模板 ID / 容器 ID / GIA 名 / 子控件数量或名字；
 * 一律从 root9 记录与父子关系推导（判别与装配在 ui/src/container-subtree.ts）。
 */

import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import {
  clientUiRootStatus,
  ensureClientUiHierarchyRoots,
  inventoryContainers,
  layoutInstancesOf,
  newTemplatesSince,
  resolveLayout,
  saveInstanceAsTemplate,
  selectContainers,
  instantiateContainerTemplate,
  subtreeSignature,
  type ContainerInventory,
  type ContainerRecordInfo
} from '../../ui/src/container-subtree.js'
import { parseRoot9 } from '../../ui/src/record.js'

export interface ContainerCliContext {
  gilPath: string
  sourceBytes: Uint8Array
  sourceHash: string
  /** SHA 锁定 + 自动备份 + Temp 同步（assets_ui.ts 单一实现） */
  writeBack: (candidate: Uint8Array) => string
  mapId?: number
}

export const CONTAINER_SUBCOMMANDS = new Set(['discover', 'instantiate', 'save-template'])

export function isContainerSubcommand(first: string | undefined): boolean {
  return first !== undefined && CONTAINER_SUBCOMMANDS.has(first)
}

export function containerUsage(): string {
  return [
    'gsts assets:ui container <discover|instantiate|save-template> [options]',
    '',
    '  discover       发现已导入地图里的客户端控件容器模板子树（组→节点→全部子控件）',
    '                 gsts assets:ui container discover --gil <file> [--baseline <before.gil>]',
    '                 [--container <ID|名字|all>] [--format text|json]',
    '  instantiate    把容器模板整棵子树复制成布局实例（脚本挂载随记录复制到布局节点）',
    '                 gsts assets:ui container instantiate --gil <file> [--baseline <before.gil>]',
    '                 [--container <ID|名字|all>] [--layout <ID|名字>] [--id <实例组ID>] [--force]',
    '                 [--placeholder-name <占位子控件名>] [--system-donor <含87/88根的.gil>]',
    '                 [--output <file> | --write --yes] [--format text|json]',
    '  save-template  把实例复制成容器模板（实例改指新模板 + 同名去重；源实例保留）',
    '                 gsts assets:ui container save-template --instance <ID|名字> [--gil <file>]',
    '                 [--name <新模板名>] [--id <模板组ID>] [--output <file> | --write --yes]',
    '',
    '  判别与装配全部由记录推导（族描述符 4=模板 / 3=实例、f503 成员表、f504 父引用、f74 挂载槽）；',
    '  前置：地图必须已有 ClientUI 层级根（fam 87/88），否则编辑器打开会自建并丢弃容器子树',
    '  不接受 donor 常量，也不读 GIA 文件名。--format json 时机器可读摘要走 stdout。',
    '  --write 须附 --yes：写回前自动备份并把候选同步到编辑器 Temp 目录。'
  ].join('\n')
}

interface ParsedContainerArgs {
  sub: string
  gilPath?: string
  baseline?: string
  container?: string
  layout?: string
  instance?: string
  name?: string
  placeholderName?: string
  systemDonor?: string
  allowMissingRoots?: boolean
  id?: number
  outputPath?: string
  write: boolean
  yes: boolean
  force: boolean
  format: 'text' | 'json'
  positional?: string
}

function parseContainerArgs(argv: readonly string[]): ParsedContainerArgs {
  const args: ParsedContainerArgs = {
    sub: argv[0],
    write: false,
    yes: false,
    force: false,
    format: 'text'
  }
  const readValue = (index: number, option: string): string => {
    const value = argv[index]
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`[error] ${option} requires a value`)
    }
    return value
  }
  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i]
    switch (arg) {
      case '--gil':
        args.gilPath = readValue(++i, '--gil')
        break
      case '--baseline':
        args.baseline = readValue(++i, '--baseline')
        break
      case '--container':
        args.container = readValue(++i, '--container')
        break
      case '--layout':
        args.layout = readValue(++i, '--layout')
        break
      case '--instance':
        args.instance = readValue(++i, '--instance')
        break
      case '--name':
        args.name = readValue(++i, '--name')
        break
      case '--placeholder-name':
        args.placeholderName = readValue(++i, '--placeholder-name')
        break
      case '--system-donor':
        args.systemDonor = readValue(++i, '--system-donor')
        break
      case '--allow-missing-roots':
        args.allowMissingRoots = true
        break
      case '--id': {
        const raw = readValue(++i, '--id')
        const value = Number(raw)
        if (!Number.isSafeInteger(value) || value < 0) {
          throw new Error('[error] --id must be a non-negative safe integer')
        }
        args.id = value
        break
      }
      case '--output':
        args.outputPath = readValue(++i, '--output')
        break
      case '--write':
        args.write = true
        break
      case '--yes':
        args.yes = true
        break
      case '--force':
        args.force = true
        break
      case '--format': {
        const raw = readValue(++i, '--format')
        if (raw !== 'text' && raw !== 'json') throw new Error('[error] --format must be text or json')
        args.format = raw
        break
      }
      case '-h':
      case '--help':
        console.log(containerUsage())
        process.exit(0)
        break
      default:
        if (arg.startsWith('--')) throw new Error(`[error] unknown option: ${arg}`)
        if (args.positional !== undefined) throw new Error(`[error] unexpected argument: ${arg}`)
        args.positional = arg
    }
  }
  if (args.write && args.outputPath) {
    throw new Error('[error] --write and --output are mutually exclusive')
  }
  if (args.write && !args.yes) {
    throw new Error('[error] --write 是写游戏文件：须附 --yes 确认（先不带 --write 预览）')
  }
  return args
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(Buffer.from(bytes)).digest('hex')
}

function readFileBytes(filePath: string): Uint8Array {
  const absolute = path.resolve(filePath)
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) {
    throw new Error(`[error] file not found: ${absolute}`)
  }
  return new Uint8Array(fs.readFileSync(absolute))
}

function text(value: string): string {
  return value.length > 0 ? value : '(未命名)'
}

function describeTemplate(template: ContainerRecordInfo): string {
  const kinds = Object.entries(template.childKinds)
    .map(([kind, count]) => `${kind}:${count}`)
    .join(',')
  const mounts = template.mounts
    .map((mount) => `${mount.hostId}->${mount.scriptGuids.join('+')}`)
    .join(',')
  return (
    `template=${template.groupId} name=${text(template.name)} ` +
    `node=[${template.nodeIds.join(',')}] children=${template.childCount}` +
    ` subtree=${template.subtreeIds.length} kinds={${kinds || '空'}}` +
    ` mounts={${mounts || '无'}} instances=[${template.instanceIds.join(',')}]`
  )
}

function selectionOf(
  inventory: ContainerInventory,
  args: ParsedContainerArgs,
  baselineIds: number[] | undefined
): ContainerRecordInfo[] {
  const selector = args.container ?? (baselineIds ? 'baseline' : 'all')
  if (selector === 'baseline') {
    const ids = new Set(baselineIds ?? [])
    return inventory.templates.filter((template) => ids.has(template.groupId))
  }
  const selected = selectContainers(inventory, selector, 'template')
  if (selected.length === 0) {
    throw new Error(
      `[error] 未匹配到容器模板: ${selector}` +
        `（可选: ${inventory.templates.map((t) => `${t.groupId}:${t.name}`).join(', ') || '无'}）`
    )
  }
  return selected
}

export function runContainerCommand(argv: readonly string[], context: ContainerCliContext): void {
  const args = parseContainerArgs(argv)
  const jsonMode = args.format === 'json'
  const log = (line: string): void => {
    if (jsonMode) console.error(line)
    else console.log(line)
  }
  const inventory = inventoryContainers(context.sourceBytes)
  const baselineIds = args.baseline ? newTemplatesSince(readFileBytes(args.baseline), inventory) : undefined

  if (args.sub === 'discover') {
    const selected = args.container || baselineIds ? selectionOf(inventory, args, baselineIds) : inventory.templates
    log(`templates=${inventory.templates.length} instances=${inventory.instances.length}`)
    if (baselineIds) log(`newSinceBaseline=[${baselineIds.join(',')}]`)
    for (const template of selected) log(describeTemplate(template))
    for (const instance of inventory.instances) {
      log(
        `instance=${instance.groupId} name=${text(instance.name)} parent=${instance.parentId ?? '-'} ` +
          `template=${instance.templateGroupId ?? '(无)'} node=[${instance.nodeIds.join(',')}] ` +
          `children=${instance.childCount}`
      )
    }
    for (const node of inventory.standaloneTemplateNodes) {
      log(
        `standaloneTemplateNode=${node.id} name=${text(node.name)} children=${node.childCount}` +
          '（无容器组：GIA 的独立节点模板，本命令不实例化）'
      )
    }
    if (jsonMode) {
      process.stdout.write(
        JSON.stringify(
          {
            schemaVersion: 1,
            kind: 'ui-container-discover',
            gilPath: context.gilPath,
            sourceSha256: context.sourceHash,
            templateCount: inventory.templates.length,
            instanceCount: inventory.instances.length,
            newSinceBaseline: baselineIds ?? null,
            templates: selected.map((template) => ({
              groupId: template.groupId,
              name: template.name,
              nodeIds: template.nodeIds,
              childCount: template.childCount,
              childKinds: template.childKinds,
              subtreeIds: template.subtreeIds,
              instanceIds: template.instanceIds,
              mounts: template.mounts,
              signature: subtreeSignature(template.tree),
              tree: template.tree
            })),
            instances: inventory.instances.map((instance) => ({
              groupId: instance.groupId,
              name: instance.name,
              parentId: instance.parentId ?? null,
              templateGroupId: instance.templateGroupId ?? null,
              nodeIds: instance.nodeIds,
              childCount: instance.childCount,
              mounts: instance.mounts
            })),
            standaloneTemplateNodes: inventory.standaloneTemplateNodes
          },
          null,
          2
        ) + '\n'
      )
    }
    return
  }

  if (args.sub === 'instantiate') {
    const parsed = parseRoot9(context.sourceBytes)
    const layoutId = resolveLayout(parsed, args.layout)
    const selected = selectionOf(inventory, args, baselineIds)
    let bytes = context.sourceBytes
    // ClientUI 层级根（fam 87/88）预检：缺了编辑器会自建并丢弃容器子树（2026-10-29 事故）
    let rootInfo: Record<string, unknown> = { present: clientUiRootStatus(bytes) }
    if (rootInfo.present && (rootInfo.present as { missing: number[] }).missing.length > 0) {
      if (args.systemDonor !== undefined) {
        const donorBytes = readFileBytes(args.systemDonor)
        const ensured = ensureClientUiHierarchyRoots(bytes, { donor: donorBytes })
        bytes = ensured.bytes
        rootInfo = { donor: path.resolve(args.systemDonor), added: ensured.added, present: ensured.status }
        log(
          `system-roots added=[${ensured.added.map((item) => `${item.id}:${item.name}`).join(',')}] ` +
            `from ${path.resolve(args.systemDonor)}`
        )
      } else if (args.allowMissingRoots) {
        rootInfo = { ...rootInfo, allowed: true }
        log(
          'WARN: 地图缺 ClientUI 层级根（fam 87/88）——编辑器打开时会自建并丢弃容器子树；' +
            '已按 --allow-missing-roots 继续'
        )
      } else {
        throw new Error(
          '[error] 地图缺 ClientUI 层级根（fam 87/88：ClientUIRootHierarchyRoot / ' +
            'ClientUIPrototypeHierarchyRoot）。编辑器打开这种图会自建两条根并丢弃/重编号' +
            '客户端容器子树（挂载随之丢失，2026-10-29 事故）。\n' +
            '  修法：给 --system-donor <一条已含层级根的地图.gil>（只读，复制这两条根，' +
            '例：Save_Level/1073741844.gil 或 1073741834/1073741834.gil）；' +
            '确知后果时可用 --allow-missing-roots 强制继续。'
        )
      }
    }
    const created: Array<Record<string, unknown>> = []
    for (const [index, template] of selected.entries()) {
      const existing = layoutInstancesOf(inventoryContainers(bytes), template.groupId, layoutId)
      if (existing.length > 0 && !args.force) {
        log(`skip template=${template.groupId} reason=already-instantiated instance=${existing.join(',')}`)
        created.push({
          templateGroupId: template.groupId,
          skipped: 'already-instantiated',
          instanceGroupId: existing[0]
        })
        continue
      }
      const result = instantiateContainerTemplate(bytes, {
        templateGroupId: template.groupId,
        layoutId,
        ...(args.id !== undefined && selected.length === 1 ? { id: args.id + index } : {}),
        ...(args.placeholderName !== undefined ? { placeholderName: args.placeholderName } : {})
      })
      bytes = result.bytes
      created.push({
        templateGroupId: result.templateGroupId,
        instanceGroupId: result.instanceGroupId,
        instanceNodeId: result.instanceNodeId,
        recordIds: result.recordIds,
        copiedRecords: result.copiedRecords,
        childCount: result.childCount,
        transferredMounts: result.transferredMounts,
        placeholders: result.placeholders,
        selfCheck: result.selfCheck
      })
      log(
        `instance template=${result.templateGroupId} -> group=${result.instanceGroupId} ` +
          `node=${result.instanceNodeId} records=${result.copiedRecords} children=${result.childCount} ` +
          `mounts={${result.transferredMounts.map((m) => `${m.hostId}->${m.scriptGuids.join('+')}`).join(',') || '无'}} ` +
          `placeholders={${result.placeholders.map((p) => `${p.nodeId}->${p.childId}`).join(',') || '已有'}} ` +
          'selfCheck=pass(nodes/placeholders/mounts/birefs/index)'
      )
    }
    const summary: Record<string, unknown> = {
      schemaVersion: 1,
      kind: 'ui-container-instantiate',
      gilPath: context.gilPath,
      sourceSha256: context.sourceHash,
      layoutId,
      systemRoots: rootInfo,
      created
    }
    summary.candidateSha256 = sha256(bytes)
    log(`layout=${layoutId} candidateSha256=${summary.candidateSha256}`)
    if (args.outputPath) {
      const absolute = path.resolve(args.outputPath)
      if (fs.existsSync(absolute)) throw new Error(`[error] output already exists: ${absolute}`)
      fs.mkdirSync(path.dirname(absolute), { recursive: true })
      fs.writeFileSync(absolute, bytes)
      summary.candidate = absolute
      log(`candidate=${absolute}`)
    } else if (args.write) {
      summary.backup = context.writeBack(bytes)
      summary.writePerformed = true
      log(`backup=${String(summary.backup)}`)
      log('writePerformed=true')
    } else {
      summary.previewOnly = true
      log('preview only; 使用 --output 落盘候选，或 --write --yes 写回源图')
    }
    if (jsonMode) process.stdout.write(JSON.stringify(summary, null, 2) + '\n')
    return
  }

  if (args.sub === 'save-template') {
    const selector = args.instance ?? args.positional
    if (selector === undefined) {
      throw new Error('[error] save-template requires --instance <ID|名字>')
    }
    const matches = selectContainers(inventory, selector, 'instance')
    if (matches.length === 0) {
      throw new Error(
        `[error] 未匹配到容器实例: ${selector}` +
          `（可选: ${inventory.instances.map((i) => `${i.groupId}:${i.name}`).join(', ') || '无'}）`
      )
    }
    if (matches.length > 1) {
      throw new Error(
        `[error] ${selector} 命中多个实例，请用 ID 指定: ${matches.map((m) => m.groupId).join(', ')}`
      )
    }
    const result = saveInstanceAsTemplate(context.sourceBytes, {
      instanceGroupId: matches[0].groupId,
      ...(args.name !== undefined ? { name: args.name } : {}),
      ...(args.id !== undefined ? { id: args.id } : {})
    })
    const summary: Record<string, unknown> = {
      schemaVersion: 1,
      kind: 'ui-container-save-template',
      gilPath: context.gilPath,
      sourceSha256: context.sourceHash,
      instanceGroupId: result.instanceGroupId,
      previousTemplateGroupId: result.previousTemplateGroupId ?? null,
      newTemplateGroupId: result.newTemplateGroupId,
      newTemplateNodeId: result.newTemplateNodeId,
      newName: result.newName,
      recordIds: result.recordIds,
      copiedRecords: result.copiedRecords,
      childCount: result.childCount,
      selfCheck: result.selfCheck
    }
    summary.candidateSha256 = sha256(result.bytes)
    log(
      `template group=${result.newTemplateGroupId} node=${result.newTemplateNodeId} name=${result.newName} ` +
        `records=${result.copiedRecords} children=${result.childCount} ` +
        `instance=${result.instanceGroupId} previousTemplate=${result.previousTemplateGroupId ?? '(无)'} selfCheck=pass`
    )
    log(`candidateSha256=${summary.candidateSha256}`)
    if (args.outputPath) {
      const absolute = path.resolve(args.outputPath)
      if (fs.existsSync(absolute)) throw new Error(`[error] output already exists: ${absolute}`)
      fs.mkdirSync(path.dirname(absolute), { recursive: true })
      fs.writeFileSync(absolute, result.bytes)
      summary.candidate = absolute
      log(`candidate=${absolute}`)
    } else if (args.write) {
      summary.backup = context.writeBack(result.bytes)
      summary.writePerformed = true
      log(`backup=${String(summary.backup)}`)
      log('writePerformed=true')
    } else {
      summary.previewOnly = true
      log('preview only; 使用 --output 落盘候选，或 --write --yes 写回源图')
    }
    if (jsonMode) process.stdout.write(JSON.stringify(summary, null, 2) + '\n')
    return
  }

  throw new Error(`[error] unknown container subcommand: ${args.sub}`)
}
