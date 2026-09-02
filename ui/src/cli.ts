/**
 * ui/src/cli.ts — 票 04 语义命令（list / anchor / diff）的本地执行层
 *
 * assets:ui 旧命令（clone/create/update/template/variables/states/delete）仍在
 * src/cli/assets_ui.ts；本文件承接新 L1 命令面，全部只读。
 */

import path from 'node:path'

import { prettyStableJson } from '../../src/cli/static_assembly/json.js'
import { defaultAnchorRoot, listAnchors, loadAnchor, mapIdFromGil, saveAnchor } from './anchor.js'
import { computeDiff } from './diff.js'
import { buildSemanticView } from './tree.js'
import type { UiKind, UiSemanticNode } from './types.js'

export interface UiSemanticCliContext {
  gilPath: string
  mapId?: string
  sourceBytes: Uint8Array
  sourceSha256: string
  anchorRoot?: string
}

export type UiSemanticCommand =
  | { name: 'list'; format: 'text' | 'json'; tree: boolean; kind?: string; path?: string }
  | { name: 'anchor-save'; format: 'text' | 'json'; label: string }
  | { name: 'anchor-list'; format: 'text' | 'json' }
  | { name: 'diff'; format: 'text' | 'json'; anchor: string }

export function parseUiSemanticCommand(argv: readonly string[]): UiSemanticCommand {
  const first = argv[0]
  if (first === 'list') {
    let format: 'text' | 'json' = 'text'
    let tree = true
    let kind: string | undefined
    let pathFilter: string | undefined
    for (let i = 1; i < argv.length; i++) {
      const arg = argv[i]
      if (arg === '--format') format = nextValue(argv, i++, '--format') as 'text' | 'json'
      else if (arg === '--tree') tree = true
      else if (arg === '--flat') tree = false
      else if (arg === '--kind') kind = nextValue(argv, i++, '--kind')
      else if (arg === '--path') pathFilter = nextValue(argv, i++, '--path')
      else if (arg === '--gil') i++
      else if (arg.startsWith('--')) continue
      else throw new Error(`[error] unknown list option: ${arg}`)
    }
    if (format !== 'text' && format !== 'json')
      throw new Error('[error] --format must be text or json')
    return { name: 'list', format, tree, kind, path: pathFilter }
  }
  if (first === 'anchor') {
    const sub = argv[1]
    let format: 'text' | 'json' = 'text'
    let label: string | undefined
    for (let i = 2; i < argv.length; i++) {
      const arg = argv[i]
      if (arg === '--format') format = nextValue(argv, i++, '--format') as 'text' | 'json'
      else if (arg === '--label') label = nextValue(argv, i++, '--label')
      else if (arg === '--gil') i++
      else if (arg.startsWith('--')) continue
      else throw new Error(`[error] unknown anchor option: ${arg}`)
    }
    if (sub === 'save') {
      if (!label) throw new Error('[error] anchor save requires --label <名>')
      return { name: 'anchor-save', format, label }
    }
    if (sub === 'list') return { name: 'anchor-list', format }
    throw new Error('[error] anchor subcommand must be save|list')
  }
  if (first === 'diff') {
    let format: 'text' | 'json' = 'text'
    let anchor: string | undefined
    for (let i = 1; i < argv.length; i++) {
      const arg = argv[i]
      if (arg === '--format') format = nextValue(argv, i++, '--format') as 'text' | 'json'
      else if (arg === '--anchor') anchor = nextValue(argv, i++, '--anchor')
      else if (arg === '--gil') i++
      else if (arg.startsWith('--')) continue
      else throw new Error(`[error] unknown diff option: ${arg}`)
    }
    if (!anchor) throw new Error('[error] diff requires --anchor <label|file>')
    return { name: 'diff', format, anchor }
  }
  throw new Error(`[error] unknown ui semantic command: ${argv[0] ?? '(empty)'}`)
}

function nextValue(argv: readonly string[], index: number, option: string): string {
  const value = argv[index + 1]
  if (!value || value.startsWith('--')) throw new Error(`[error] ${option} requires a value`)
  return value
}

export async function runUiSemanticCommand(
  command: UiSemanticCommand,
  context: UiSemanticCliContext
): Promise<void> {
  const jsonMode = command.format === 'json'
  const mapId = context.mapId ?? mapIdFromGil(context.gilPath)
  const anchorRoot = context.anchorRoot ?? defaultAnchorRoot()

  if (command.name === 'list') {
    const view = buildSemanticView(context.sourceBytes, {
      flatOnly: !command.tree,
      kind: command.kind as UiKind | undefined,
      path: command.path
    })
    if (jsonMode) {
      process.stdout.write(prettyStableJson(view))
    } else {
      const lines: string[] = []
      if (command.tree) {
        renderTree(view.tree, lines)
      } else {
        for (const node of view.flat) lines.push(renderFlatLine(node))
      }
      process.stdout.write(lines.join('\n') + (lines.length ? '\n' : ''))
    }
    return
  }

  if (command.name === 'anchor-save') {
    const view = buildSemanticView(context.sourceBytes)
    const result = saveAnchor(anchorRoot, {
      label: command.label,
      mapId,
      sourceSha256: context.sourceSha256,
      recordSetHash: view.recordSetHash,
      nodes: view.flat,
      tree: view.tree
    })
    if (jsonMode) {
      process.stdout.write(prettyStableJson({ kind: 'ui-anchor-save', ...result }))
    } else {
      process.stdout.write(
        `anchor saved: ${result.label} (${mapId}) hash=${result.recordSetHash}\nfile=${result.file}\n`
      )
    }
    return
  }

  if (command.name === 'anchor-list') {
    const anchors = listAnchors(anchorRoot)
    if (jsonMode) {
      process.stdout.write(prettyStableJson({ kind: 'ui-anchor-list', anchors }))
    } else {
      const lines: string[] = []
      for (const entry of anchors) {
        for (const anchor of entry.anchors) {
          lines.push(
            `${anchor.label}\t${entry.mapId}\t${anchor.createdAt}\t${anchor.recordSetHash}`
          )
        }
      }
      process.stdout.write(lines.join('\n') + (lines.length ? '\n' : ''))
    }
    return
  }

  // diff
  const loaded = loadAnchor(anchorRoot, mapId, command.anchor)
  const view = buildSemanticView(context.sourceBytes)
  const result = computeDiff(
    loaded.anchor.label,
    loaded.file,
    loaded.anchor.nodes,
    view.flat,
    context.sourceSha256,
    loaded.anchor.sourceSha256,
    loaded.anchor.recordSetHash !== view.recordSetHash
  )
  if (jsonMode) {
    process.stdout.write(prettyStableJson(result))
  } else {
    const lines: string[] = []
    lines.push(`diff vs anchor "${result.anchorLabel}"`)
    for (const note of result.notes) lines.push(`# ${note}`)
    for (const item of result.reanchored) {
      lines.push(`重锚 [${item.kind}] ${item.path} ${item.fromId} -> ${item.toId}`)
    }
    for (const node of result.removed) lines.push(`删除 [${node.kind}] ${renderFlatLine(node)}`)
    for (const node of result.added) lines.push(`新增 [${node.kind}] ${renderFlatLine(node)}`)
    for (const item of result.changed) {
      const mark = item.playerChanges ? 'PLAYER' : 'CHANGED'
      const fields = item.fields.map((f) => f.field).join(',')
      lines.push(`${mark} [${item.kind}] ${item.path} (${item.id}) fields=${fields}`)
      for (const hint of item.hints) lines.push(`  提示: ${hint}`)
    }
    if (result.orphans.added.length || result.orphans.removed.length) {
      lines.push(
        `孤儿素材组（编辑器行为）: added=${result.orphans.added.length} removed=${result.orphans.removed.length}`
      )
    }
    process.stdout.write(lines.join('\n') + (lines.length ? '\n' : ''))
  }
}

function renderTree(nodes: readonly UiSemanticNode[], lines: string[], depth = 0): void {
  for (const node of nodes) {
    lines.push(`${'  '.repeat(depth)}${renderFlatLine(node)}`)
    renderTree(node.children, lines, depth + 1)
  }
}

function renderFlatLine(node: UiSemanticNode): string {
  const g = node.geometry
  const geom = g
    ? ` pos=${g.position?.[0]?.toFixed(1)},${g.position?.[1]?.toFixed(1)} size=${g.size?.[0]?.toFixed(1)}x${g.size?.[1]?.toFixed(1)}`
    : ''
  const props = summarizeProps(node)
  return `[${node.kind}] ${node.name || '(无名)'} id=${node.id} path=${node.path}${geom}${props}`
}

function summarizeProps(node: UiSemanticNode): string {
  const parts: string[] = []
  const props = node.props as Record<string, unknown>
  if (typeof props.text === 'string') parts.push(`text=${props.text}`)
  if (typeof props.color === 'string') parts.push(`color=${props.color}`)
  if (typeof props.fontSize === 'number') parts.push(`fontSize=${props.fontSize}`)
  if (typeof props.align === 'string') parts.push(`align=${props.align}`)
  if (typeof props.maxItems === 'number') parts.push(`maxItems=${props.maxItems}`)
  const pages = props.pages as Array<Record<string, unknown>> | undefined
  if (Array.isArray(pages)) parts.push(`pages=${pages.length}`)
  const states = props.states as Array<Record<string, unknown>> | undefined
  if (Array.isArray(states)) parts.push(`states=${states.map((s) => s.stateName ?? '?').join('/')}`)
  return parts.length ? ` ${parts.join(' ')}` : ''
}
