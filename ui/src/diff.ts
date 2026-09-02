/**
 * ui/src/diff.ts — 玩家改动识别 v1（diff --anchor）（票 04）
 *
 * 判定特征（ui/mappings.md §7）：
 * - 布局实例几何/属性直接变化 → 玩家细排（playerChanges）
 * - 未同步的实例侧变化 → playerChanges + 提示 sync
 * - ID 全量换新（同步/模板化）→ 按 path+kind 重锚，不算新增/删除
 * - 素材树孤儿/重复克隆 → 编辑器行为，仅报告（不标 playerChanges）
 */

import { canonicalJson } from '../../src/cli/static_assembly/json.js'
import type { UiSemanticNode } from './types.js'

export interface UiFieldDiff {
  field: string
  before: unknown
  after: unknown
}

export interface UiChangedNode {
  path: string
  id: number | string
  kind: string
  fields: UiFieldDiff[]
  playerChanges: boolean
  hints: string[]
}

export interface UiReanchored {
  fromId: number | string
  toId: number | string
  path: string
  kind: string
}

export interface UiDiffResult {
  schemaVersion: number
  kind: 'ui-diff'
  anchorLabel: string
  anchorFile?: string
  sourceSha256: string
  anchorSourceSha256: string
  recordSetChanged: boolean
  reanchored: UiReanchored[]
  added: UiSemanticNode[]
  removed: UiSemanticNode[]
  changed: UiChangedNode[]
  orphans: { added: UiSemanticNode[]; removed: UiSemanticNode[] }
  notes: string[]
}

const PLAYER_EDITABLE_FIELDS = new Set([
  'geometry',
  'name',
  'text',
  'color',
  'fontSize',
  'align',
  'states',
  'pages',
  'stateGroups',
  'styleGroups',
  'assetId',
  'staticResourceId',
  'maxItems',
  'timedShow',
  'insertAt',
  'defaultIndex',
  'serverEvent',
  'variables',
  'props',
  'refs'
])

function isOrphanKind(node: UiSemanticNode): boolean {
  return ['asset-group', 'material-group', 'style-group', 'asset'].includes(node.kind)
}

function isPlayerSurface(path: string): boolean {
  return path.startsWith('布局:') || (path.startsWith('控件组库:') && !path.startsWith('控件模板:'))
}

function isTemplateSide(node: UiSemanticNode): boolean {
  return node.role === 'template' || node.path.startsWith('控件模板:')
}

function fieldDiff(before: UiSemanticNode, after: UiSemanticNode): UiFieldDiff[] {
  const fields: UiFieldDiff[] = []
  const keys = new Set(['name', 'geometry', 'props', 'refs', 'unknown'])
  for (const key of keys) {
    const beforeValue = (before as unknown as Record<string, unknown>)[key]
    const afterValue = (after as unknown as Record<string, unknown>)[key]
    if (canonicalJson(beforeValue ?? null) !== canonicalJson(afterValue ?? null)) {
      fields.push({ field: key, before: beforeValue ?? null, after: afterValue ?? null })
    }
  }
  return fields
}

function deepEqual(a: unknown, b: unknown): boolean {
  return canonicalJson(a ?? null) === canonicalJson(b ?? null)
}

function samePathKind(a: UiSemanticNode, b: UiSemanticNode): boolean {
  return a.path === b.path && a.kind === b.kind
}

function countKind(nodes: readonly UiSemanticNode[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const node of nodes) map.set(node.kind, (map.get(node.kind) ?? 0) + 1)
  return map
}

export function computeDiff(
  anchorLabel: string,
  anchorFile: string | undefined,
  anchorNodes: readonly UiSemanticNode[],
  currentNodes: readonly UiSemanticNode[],
  currentSourceSha256: string,
  anchorSourceSha256: string,
  recordSetChanged: boolean
): UiDiffResult {
  const anchorById = new Map<number | string, UiSemanticNode>()
  const currentById = new Map<number | string, UiSemanticNode>()
  for (const node of anchorNodes) anchorById.set(node.id, node)
  for (const node of currentNodes) currentById.set(node.id, node)

  const anchorUnmatched = new Set(anchorById.keys())
  const currentUnmatched = new Set(currentById.keys())
  const reanchored: UiReanchored[] = []

  // 0) 同 ID 直接匹配：从 unmatched 中剔除（后续仅按字段 diff）
  for (const id of currentById.keys()) {
    if (anchorById.has(id)) {
      currentUnmatched.delete(id)
      anchorUnmatched.delete(id)
    }
  }

  // 1) 同 path+kind 重锚（ID 换新：同步/模板化）
  const anchorByPath = new Map<string, UiSemanticNode>()
  for (const node of anchorNodes) {
    if (!anchorById.get(node.id)) continue
    const key = `${node.kind}\0${node.path}`
    if (!anchorByPath.has(key)) anchorByPath.set(key, node)
  }
  for (const node of currentNodes) {
    if (!currentUnmatched.has(node.id)) continue
    const key = `${node.kind}\0${node.path}`
    const old = anchorByPath.get(key)
    if (old && anchorUnmatched.has(old.id)) {
      reanchored.push({ fromId: old.id, toId: node.id, path: node.path, kind: node.kind })
      currentUnmatched.delete(node.id)
      anchorUnmatched.delete(old.id)
    }
  }

  // 2) 剩余 added / removed
  const added = [...currentUnmatched]
    .map((id) => currentById.get(id)!)
    .sort((a, b) => a.path.localeCompare(b.path))
  const removed = [...anchorUnmatched]
    .map((id) => anchorById.get(id)!)
    .sort((a, b) => a.path.localeCompare(b.path))

  // 3) 同 ID 变更
  const changed: UiChangedNode[] = []
  for (const node of currentNodes) {
    const old = anchorById.get(node.id)
    if (!old) continue
    const fields = fieldDiff(old, node)
    if (fields.length === 0) continue
    const isPlayer = isPlayerSurface(node.path) && !isTemplateSide(node) && !isOrphanKind(node)
    const playerFields = fields.filter(
      (f) => PLAYER_EDITABLE_FIELDS.has(f.field) || f.field === 'props'
    )
    const hints: string[] = []
    if (isPlayer && playerFields.length > 0) {
      hints.push('玩家/创作者改动（布局实例或悬浮页实例侧）')
      const templateCounterpart = anchorNodes.find(
        (n) => n.kind === node.kind && n.name === node.name && n.path.startsWith('控件模板:')
      )
      if (templateCounterpart) {
        const tplFieldDiff = fieldDiff(templateCounterpart, node)
        if (
          tplFieldDiff.length > 0 &&
          !templateSideHasSameChange(anchorNodes, templateCounterpart, node)
        ) {
          hints.push('实例侧已改未同步; 提示 sync 广播')
        }
      }
    }
    changed.push({
      path: node.path,
      id: node.id,
      kind: node.kind,
      fields,
      playerChanges: isPlayer && playerFields.length > 0,
      hints
    })
  }

  // 4) 孤儿（编辑器行为）分离
  const addOrphan = added.filter(isOrphanKind)
  const removeOrphan = removed.filter(isOrphanKind)
  const addedRecords = added.filter((n) => !isOrphanKind(n))
  const removedRecords = removed.filter((n) => !isOrphanKind(n))

  const notes: string[] = []
  if (!recordSetChanged) notes.push('记录集 hash 未变：无记录级差异')
  else {
    notes.push(
      `记录集已变：added=${addedRecords.length} removed=${removedRecords.length} changed=${changed.length} reanchored=${reanchored.length}`
    )
    if (addOrphan.length > 0 || removeOrphan.length > 0) {
      notes.push(
        `编辑器残留（孤儿素材组）added=${addOrphan.length} removed=${removeOrphan.length}（不计玩家改动）`
      )
    }
  }

  return {
    schemaVersion: 1,
    kind: 'ui-diff',
    anchorLabel,
    anchorFile,
    sourceSha256: currentSourceSha256,
    anchorSourceSha256,
    recordSetChanged,
    reanchored,
    added: addedRecords,
    removed: removedRecords,
    changed,
    orphans: { added: addOrphan, removed: removeOrphan },
    notes
  }
}

function templateSideHasSameChange(
  allNodes: readonly UiSemanticNode[],
  templateNode: UiSemanticNode,
  instanceNode: UiSemanticNode
): boolean {
  // 简化：模板侧节点字段与实例侧是否一致（一致=已同步）
  return (
    deepEqual(templateNode.props, instanceNode.props) &&
    deepEqual(templateNode.geometry, instanceNode.geometry)
  )
}

export function orphanNodes(nodes: readonly UiSemanticNode[]): UiSemanticNode[] {
  return nodes.filter(isOrphanKind)
}

export function countByKind(nodes: readonly UiSemanticNode[]): Record<string, number> {
  return Object.fromEntries(countKind(nodes))
}
