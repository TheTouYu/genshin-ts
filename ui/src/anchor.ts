/**
 * ui/src/anchor.ts — 状态锚点（anchor save/list）副作用文件管理（票 04）
 *
 * 设计：锚点 = semantic view + 记录集 hash，不存 wire 副本（.gil 即真相）。
 * 文件布局：.gsts/ui-anchors/<mapId>.json
 *   { schemaVersion, kind:'ui-anchor', mapId, anchors: { label: {...} } }
 */

import fs from 'node:fs'
import path from 'node:path'

import { prettyStableJson } from '../../src/cli/static_assembly/json.js'
import type { UiAnchorFile, UiSemanticNode, UiSemanticView } from './types.js'

export interface AnchorMeta {
  label: string
  createdAt: string
  sourceSha256: string
  recordSetHash: string
  nodes: UiSemanticNode[]
  tree: UiSemanticNode[]
}

export interface UiAnchorInput {
  label: string
  mapId: string
  sourceSha256: string
  recordSetHash: string
  nodes: UiSemanticNode[]
  tree: UiSemanticNode[]
}

export function defaultAnchorRoot(): string {
  return path.resolve('.gsts', 'ui-anchors')
}

export function mapIdFromGil(gilPath: string): string {
  const base = path.basename(gilPath)
  const leading = base.match(/^(\d+)/)
  if (leading) return leading[1]
  return base.replace(/\.gil$/i, '')
}

export function anchorFilePath(anchorRoot: string, mapId: string): string {
  return path.join(anchorRoot, `${mapId}.json`)
}

function readAnchorFile(file: string): UiAnchorFile {
  const parsed: unknown = JSON.parse(fs.readFileSync(file, 'utf8'))
  if (!isAnchorFile(parsed)) throw new Error(`[error] not a ui-anchor file: ${file}`)
  return parsed
}

function isAnchorFile(value: unknown): value is UiAnchorFile {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return (
    record.kind === 'ui-anchor' &&
    typeof record.mapId === 'string' &&
    typeof record.anchors === 'object'
  )
}

/** anchor save：把当前语义视图写入 <mapId>.json（同 label 覆盖，保持单文件多历史） */
export function saveAnchor(
  anchorRoot: string,
  input: UiAnchorInput
): { file: string; label: string; recordSetHash: string } {
  const file = anchorFilePath(anchorRoot, input.mapId)
  let existing: UiAnchorFile = {
    schemaVersion: 1,
    kind: 'ui-anchor',
    mapId: input.mapId,
    anchors: {}
  }
  if (fs.existsSync(file)) {
    try {
      existing = readAnchorFile(file)
    } catch {
      existing = { schemaVersion: 1, kind: 'ui-anchor', mapId: input.mapId, anchors: {} }
    }
  }
  existing.schemaVersion = 1
  existing.kind = 'ui-anchor'
  existing.mapId = input.mapId
  existing.anchors[input.label] = {
    label: input.label,
    createdAt: new Date().toISOString(),
    sourceSha256: input.sourceSha256,
    recordSetHash: input.recordSetHash,
    nodes: input.nodes,
    tree: input.tree
  }
  fs.mkdirSync(anchorRoot, { recursive: true })
  fs.writeFileSync(file, prettyStableJson(existing))
  return { file, label: input.label, recordSetHash: input.recordSetHash }
}

/** anchor list：列出所有地图的所有锚点 */
export function listAnchors(
  anchorRoot: string
): Array<{ mapId: string; file: string; anchors: AnchorMeta[] }> {
  if (!fs.existsSync(anchorRoot)) return []
  const out: Array<{ mapId: string; file: string; anchors: AnchorMeta[] }> = []
  for (const name of fs.readdirSync(anchorRoot).sort()) {
    if (!name.endsWith('.json')) continue
    const file = path.join(anchorRoot, name)
    try {
      const parsed = readAnchorFile(file)
      out.push({
        mapId: parsed.mapId,
        file,
        anchors: Object.values(parsed.anchors).sort((a, b) => a.label.localeCompare(b.label))
      })
    } catch {
      // 跳过坏文件（fail-closed 报告由调用方处理）
    }
  }
  return out
}

/** diff 用：anchor 引用 = label（map 文件内）或 锚点文件路径 */
export function loadAnchor(
  anchorRoot: string,
  mapId: string,
  labelOrFile: string
): { file: string; anchor: AnchorMeta } {
  const asFile = path.resolve(labelOrFile)
  if (fs.existsSync(asFile) && asFile.endsWith('.json')) {
    const parsed = readAnchorFile(asFile)
    const single = Object.values(parsed.anchors)[0]
    if (single) return { file: asFile, anchor: single }
    return {
      file: asFile,
      anchor: {
        label: 'unnamed',
        createdAt: '',
        sourceSha256: '',
        recordSetHash: '',
        nodes: [],
        tree: []
      }
    }
  }
  const file = anchorFilePath(anchorRoot, mapId)
  const parsed = readAnchorFile(file)
  const anchor = parsed.anchors[labelOrFile]
  if (!anchor) {
    const labels = Object.keys(parsed.anchors)
    throw new Error(
      `[error] anchor label not found: ${labelOrFile} (available: ${labels.join(', ') || 'none'})`
    )
  }
  return { file, anchor }
}

/** 用当前语义视图与锚点节点做字节级快查：记录集 hash 相同 → 无变化 */
export function recordSetUnchanged(view: UiSemanticView, anchor: AnchorMeta): boolean {
  return view.recordSetHash === anchor.recordSetHash
}

export function semanticNodesOf(view: UiSemanticView): UiSemanticNode[] {
  return view.flat
}
