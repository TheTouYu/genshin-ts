/**
 * ui/src/tree.ts — 概念树/平面视图构建（票 04 list 语义层）
 *
 * 树模型 = Surface 模型（ui/DESIGN.md 1.2）：
 *   layout（布局，含官方克隆与控制）→ 控件（按 schema 递归）
 *   library（控件组库 1840）→ 悬浮页实体/模板实例 → 容器 → 控件
 *   template（模板侧，同步对照）→ 容器 → 控件
 *   orphan（未引用残留，编辑器行为，仅报告）
 * 判别器按「组件签名 + parent 上下文 + kind 常量」工作（轮 64 补丁：member vs 独立控件）。
 */

import { createHash } from 'node:crypto'

import { listPageVariables } from '../../src/cli/gil_ui.js'
import { canonicalJson, sha256Bytes } from '../../src/cli/static_assembly/json.js'
import {
  collectWireVarints,
  emitWireMessage,
  parseWireMessage,
  type WireField
} from '../../src/cli/static_assembly/wire.js'
import {
  argbToHex,
  collectCompTypes,
  extractContainerRefs,
  extractGeometry,
  extractMemberIds,
  extractMessageEntries,
  extractQueueProps,
  extractStyleEntries,
  extractTabPages,
  extractTextConfig,
  findComponent,
  firstMessage,
  firstVarint,
  FLOATING_PAGE_KIND,
  FLOATING_PAGE_RICH_KIND,
  kindLabel,
  LIBRARY_CONTAINER_ID,
  parseRoot9,
  readButtonStates,
  recordFamilyRole,
  recordNameOf,
  TAB_KIND
} from './record.js'
import type {
  UiGeometry,
  UiKind,
  UiRecordMeta,
  UiSemanticNode,
  UiSemanticOptions,
  UiSemanticView
} from './types.js'

const KNOWN_COMP_TYPES = new Set([
  7,
  4,
  3,
  5,
  6,
  55, // 层记录
  11,
  43,
  12,
  15,
  23,
  25,
  38,
  44,
  45,
  46,
  47,
  48,
  49,
  58,
  61,
  76,
  77,
  78,
  79,
  50,
  52,
  54,
  37,
  62,
  63,
  64,
  40,
  41
])
const KNOWN_OG_COMP_TYPES = new Set([
  15, 23, 12, 25, 38, 45, 50, 52, 54, 46, 47, 48, 49, 58, 37, 76, 77, 78, 79, 44, 42, 40, 41, 11,
  43, 61
])

export function recordSetHash(records: readonly UiRecordMeta[]): string {
  const digest = createHash('sha256')
  for (const record of [...records].sort((a, b) => a.id - b.id)) {
    digest.update(String(record.id)).update('\0')
    digest.update(record.raw)
    digest.update('\0')
  }
  return digest.digest('hex')
}

export function buildSemanticView(
  bytes: Uint8Array,
  options: UiSemanticOptions = {}
): UiSemanticView {
  const parsed = parseRoot9(bytes)
  const { recordsById } = parsed

  // parent 上下文 map（记录 ID → 孩子归属 kind）
  const parentKindById = new Map<number, string>()
  const noteParents = (owner: UiRecordMeta, children: number[], kind: string) => {
    for (const id of children) parentKindById.set(id, kind)
  }
  for (const rec of parsed.records) {
    if (rec.kind === 'layout' || rec.kind === 'container' || rec.kind === 'asset-group') {
      noteParents(rec, extractMemberIds(rec.fields), rec.kind)
    }
    if (rec.kind === 'floating-page') {
      noteParents(rec, extractContainerRefs(rec.fields), 'floating-page')
    }
  }

  // 被父/引用携带的记录 ID 集合（孤儿判定依据：不在索引且无引用 = 残留）
  const referencedIds = new Set<number>()
  for (const rec of parsed.records) {
    if (rec.kind === 'layout' || rec.kind === 'container' || rec.kind === 'asset-group') {
      for (const id of extractMemberIds(rec.fields)) referencedIds.add(id)
    }
    if (rec.kind === 'floating-page') {
      for (const id of extractContainerRefs(rec.fields)) referencedIds.add(id)
    }
    if (
      rec.kind === 'custom-button' ||
      rec.kind === 'interactive-button' ||
      rec.kind === 'custom-switch' ||
      rec.kind === 'close-button'
    ) {
      try {
        for (const state of readButtonStates(bytes, rec.id)) {
          if (state.materialGroupId !== null) referencedIds.add(state.materialGroupId)
        }
      } catch {
        // 只读容错
      }
    }
    if (rec.kind === 'message-queue') {
      for (const id of extractQueueStyleRefs(rec.fields, recordsById)) referencedIds.add(id)
    }
  }

  const effectiveKind = (meta: UiRecordMeta, parentKind?: string): UiKind => {
    if (parentKind === 'group' && (meta.compTypes.includes(25) || meta.compTypes.includes(38))) {
      return 'material-member'
    }
    if (parentKind === 'floating-page' && meta.kind === 'container') return 'container'
    return meta.kind
  }

  const isLibrary = (meta: UiRecordMeta) => meta.id === LIBRARY_CONTAINER_ID

  const visited = new Set<number>()
  const nodeCache = new Map<number, UiSemanticNode>()

  /** 某记录被同一父引用多次时仍给独立路径；记录本身缓存复用（避免重复解析） */
  const buildNode = (
    id: number,
    parentPath: string,
    parentKind: string,
    ordinal: number,
    roleHint?: 'group' | 'member'
  ): UiSemanticNode | undefined => {
    const meta = recordsById.get(id)
    if (!meta) return undefined
    const baseKind = roleHint === 'member' ? 'material-member' : effectiveKind(meta, parentKind)
    const kind = id === LIBRARY_CONTAINER_ID ? 'library' : baseKind
    const role =
      id === LIBRARY_CONTAINER_ID
        ? 'library'
        : kind === 'material-member'
          ? 'member'
          : kind === 'container' ||
              kind === 'asset-group' ||
              kind === 'material-group' ||
              kind === 'style-group'
            ? 'group'
            : kind === 'layout'
              ? 'layout'
              : recordFamilyRole(meta.fields) === 'unknown'
                ? 'unknown'
                : recordFamilyRole(meta.fields)
    const name =
      kind === 'material-member'
        ? meta.name || `${kindLabel(kind)}_${ordinal}`
        : meta.name || kindLabel(kind)
    const path =
      parentKind === 'none'
        ? `${kindLabel(kind)}:${name}`
        : kind === 'container' && name
          ? `${parentPath}:${name}#${ordinal}`
          : `${parentPath}:${kindLabel(kind)}#${ordinal}`
    const node: UiSemanticNode = {
      id,
      path: id === LIBRARY_CONTAINER_ID ? '控件组库' : path,
      role,
      kind,
      name: id === LIBRARY_CONTAINER_ID ? '控件组库' : name,
      children: [],
      refs: {},
      props: {},
      unknown: []
    }
    const unknownComp = meta.compTypes.filter((t) => !KNOWN_COMP_TYPES.has(t))
    if (unknownComp.length > 0) node.unknown.push(`compTypes:${unknownComp.join('/')}`)
    parsePropsAndRefs(node, meta, bytes, recordsById, effectiveKind, parentKind, roleHint)
    return node
  }

  const buildGroupNode = (
    groupId: number,
    parentPath: string,
    ordinal: number
  ): UiSemanticNode | undefined => {
    const meta = recordsById.get(groupId)
    if (!meta) return undefined
    const kind: UiKind =
      meta.kind === 'asset-group'
        ? 'material-group'
        : meta.kind === 'asset'
          ? 'material-group'
          : meta.kind
    const node: UiSemanticNode = {
      id: groupId,
      path: `${parentPath}:素材组#${ordinal}`,
      role: 'group',
      kind,
      name: meta.name || `素材组_${ordinal}`,
      children: [],
      refs: {},
      props: {},
      unknown: []
    }
    parsePropsAndRefs(node, meta, bytes, recordsById, effectiveKind, 'group')
    // 成员
    const members = extractMemberIds(meta.fields)
    const counters = new Map<string, number>()
    for (const member of members) {
      const memberMeta = recordsById.get(member)
      if (!memberMeta) continue
      const ord = (counters.get('member') ?? 0) + 1
      counters.set('member', ord)
      const child = buildNode(member, node.path, 'group', ord, 'member')
      if (child) node.children.push(child)
    }
    return node
  }

  const buildTreeNode = (
    id: number,
    parentPath: string,
    parentKind: string,
    ordinal: number
  ): UiSemanticNode | undefined => {
    const meta = recordsById.get(id)
    if (!meta) return undefined
    if (visited.has(id)) return undefined
    visited.add(id)
    const node = buildNode(id, parentPath, parentKind, ordinal)!
    // 按 kind 填充 children
    if (
      node.kind === 'layout' ||
      node.kind === 'container' ||
      effectiveKind(meta, parentKind) === 'asset-group'
    ) {
      const members = extractMemberIds(meta.fields)
      const counters = new Map<string, number>()
      for (const member of members) {
        const memberMeta = recordsById.get(member)
        if (!memberMeta) continue
        const ord = (counters.get(stringOf(effectiveKind(memberMeta, node.kind))) ?? 0) + 1
        counters.set(stringOf(effectiveKind(memberMeta, node.kind)), ord)
        const child = buildTreeNode(member, node.path, node.kind, ord)
        if (child) node.children.push(child)
      }
    } else if (node.kind === 'floating-page') {
      const containers = extractContainerRefs(meta.fields)
      const counters = new Map<string, number>()
      for (const containerId of containers) {
        const ord = (counters.get('container') ?? 0) + 1
        counters.set('container', ord)
        const child = buildTreeNode(containerId, node.path, 'floating-page', ord)
        if (child) node.children.push(child)
      }
    } else if (node.kind === 'message-queue') {
      // 样式素材组（type77 引用）
      const styleRefs = (node.refs['styleGroups'] ?? []) as number[]
      const counters = new Map<string, number>()
      for (const ref of styleRefs) {
        const ord = (counters.get('style') ?? 0) + 1
        counters.set('style', ord)
        const child = buildGroupNode(ref, node.path, ord)
        if (child) node.children.push(child)
      }
    } else if (
      node.kind === 'custom-button' ||
      node.kind === 'interactive-button' ||
      node.kind === 'custom-switch' ||
      node.kind === 'close-button'
    ) {
      const refs = node.refs['stateGroups'] ?? []
      if (Array.isArray(refs) && refs.length > 0) {
        const ordinalById = new Map<string, number>()
        refs.forEach((ref) => {
          const refId = typeof ref === 'number' ? ref : undefined
          if (refId === undefined) return
          const ord = (ordinalById.get(`g${refId}`) ?? 0) + 1
          ordinalById.set(`g${refId}`, ord)
          const child = buildGroupNode(refId, node.path, ord)
          if (child) node.children.push(child)
        })
      }
    } else if (node.kind === 'tab') {
      const pages = (node.props['pages'] ?? []) as Array<Record<string, unknown>>
      if (Array.isArray(pages) && pages.length > 0) {
        for (const page of pages) {
          const index = (page['index'] as number) ?? node.children.length + 1
          node.children.push({
            id: `${node.id}:page#${index}`,
            path: `${node.path}:页面#${index}`,
            role: 'internal',
            kind: 'tab-page',
            name: (page['name'] as string) ?? `页面${index}`,
            children: [],
            refs: {},
            props: { page },
            unknown: []
          })
        }
      }
    }
    return node
  }

  // ---- roots ----
  const layouts = parsed.records.filter((r) => r.kind === 'layout').sort((a, b) => a.id - b.id)
  const library = parsed.records.find((r) => isLibrary(r))
  const tree: UiSemanticNode[] = []
  const flat: UiSemanticNode[] = []
  const pushFlat = (node: UiSemanticNode) => {
    if (!options.flatOnly) flat.push(node)
    else flat.push(node)
    for (const child of node.children) pushFlat(child)
  }

  // 布局面
  const layoutCounters = new Map<string, number>()
  for (const layout of layouts) {
    const ord = (layoutCounters.get('layout') ?? 0) + 1
    layoutCounters.set('layout', ord)
    visited.add(layout.id)
    const root = buildNode(layout.id, 'none', 'none', ord)!
    const members = extractMemberIds(layout.fields)
    const counters = new Map<string, number>()
    for (const member of members) {
      const memberMeta = recordsById.get(member)
      if (!memberMeta) continue
      const mkind = effectiveKind(memberMeta, layout.kind)
      const ord2 = (counters.get(stringOf(mkind)) ?? 0) + 1
      counters.set(stringOf(mkind), ord2)
      const child = buildTreeNode(member, root.path, layout.kind, ord2)
      if (child) root.children.push(child)
    }
    tree.push(root)
    pushFlat(root)
  }

  // 控件组库
  if (library) {
    visited.add(library.id)
    const root = buildNode(library.id, 'none', 'none', 1)!
    const members = extractMemberIds(library.fields)
    const counters = new Map<string, number>()
    for (const member of members) {
      const memberMeta = recordsById.get(member)
      if (!memberMeta) continue
      const mkind = effectiveKind(memberMeta, 'library')
      const ord = (counters.get(stringOf(mkind)) ?? 0) + 1
      counters.set(stringOf(mkind), ord)
      const child = buildTreeNode(member, root.path, 'library', ord)
      if (child) root.children.push(child)
    }
    tree.push(root)
    pushFlat(root)
  }

  // 模板侧与孤儿
  const reachable = new Set<number>(visited)
  // 收集模板/孤儿根
  const templateRoots = parsed.records.filter(
    (r) =>
      !reachable.has(r.id) &&
      (r.kind === 'template' || r.kind === 'floating-page') &&
      !recordsById.get(r.id)?.parentId
  )
  const orphanRoots = parsed.records.filter(
    (r) =>
      !reachable.has(r.id) &&
      !referencedIds.has(r.id) &&
      !r.indexed &&
      (r.kind === 'asset-group' ||
        r.kind === 'material-group' ||
        r.kind === 'asset' ||
        r.kind === 'unknown')
  )
  const templateCounters = new Map<string, number>()
  for (const tpl of templateRoots) {
    const ord = (templateCounters.get('template') ?? 0) + 1
    templateCounters.set('template', ord)
    visited.add(tpl.id)
    const root = buildNode(tpl.id, 'none', 'none', ord)!
    // 模板侧容器（模板 floating-page 的 t42）
    if (root.kind === 'floating-page') {
      const containers = extractContainerRefs(tpl.fields)
      const counters = new Map<string, number>()
      for (const containerId of containers) {
        const ord2 = (counters.get('container') ?? 0) + 1
        counters.set('container', ord2)
        const child = buildTreeNode(containerId, root.path, 'floating-page', ord2)
        if (child) root.children.push(child)
      }
    }
    tree.push(root)
    pushFlat(root)
  }
  const orphanCounters = new Map<string, number>()
  for (const orphan of orphanRoots) {
    const ord = (orphanCounters.get('orphan') ?? 0) + 1
    orphanCounters.set('orphan', ord)
    visited.add(orphan.id)
    const root =
      buildGroupNode(orphan.id, '未归属残留', ord) ?? buildNode(orphan.id, 'none', 'none', ord)!
    tree.push(root)
    pushFlat(root)
  }

  const allRecords = parsed.records
  const hash = recordSetHash(allRecords)
  const sourceSha256 = sha256Bytes(bytes)

  const filterKind = (node: UiSemanticNode): boolean =>
    options.kind !== undefined ? node.kind === options.kind : true
  const filterPath = (node: UiSemanticNode): boolean =>
    options.path !== undefined ? node.path.includes(options.path) : true

  const filterNodes = (nodes: UiSemanticNode[]): UiSemanticNode[] => {
    const out: UiSemanticNode[] = []
    for (const node of nodes) {
      if (!filterKind(node) || !filterPath(node)) continue
      const clone = { ...node, children: filterNodes(node.children) }
      out.push(clone)
    }
    return out
  }

  const flatList = flat.filter(filterKind).filter(filterPath)
  const treeList = options.flatOnly ? [] : filterNodes(tree)

  return {
    schemaVersion: 1,
    kind: 'ui-semantic-view',
    sourceSha256,
    recordSetHash: hash,
    tree: treeList,
    flat: flatList
  }
}

function stringOf(value: unknown): string {
  return String(value)
}

function parsePropsAndRefs(
  node: UiSemanticNode,
  meta: UiRecordMeta,
  bytes: Uint8Array,
  recordsById: Map<number, UiRecordMeta>,
  effectiveKind: (meta: UiRecordMeta, parentKind?: string) => UiKind,
  parentKind: string,
  roleHint?: 'group' | 'member'
): void {
  const { fields, compTypes } = meta
  const unknown = node.unknown
  // 几何
  const geometry: UiGeometry | undefined = extractGeometry(fields, unknown)
  if (geometry) node.geometry = geometry

  if (node.kind === 'input-box') {
    node.props = { ...node.props, ...extractTextConfig(findComponent(fields, 45), unknown) }
  } else if (node.kind === 'textbox') {
    node.props = { ...node.props, ...extractTextConfig(findComponent(fields, 25), unknown) }
  } else if (node.kind === 'image') {
    node.props = { ...node.props, ...extractImageProps(findComponent(fields, 38), unknown) }
  } else if (node.kind === 'message-queue') {
    node.props = { ...node.props, ...extractQueueProps(fields, compTypes, unknown) }
    const styleRefs = extractQueueStyleRefs(fields, recordsById)
    node.refs['styleGroups'] = styleRefs
  } else if (
    node.kind === 'custom-button' ||
    node.kind === 'interactive-button' ||
    node.kind === 'custom-switch' ||
    node.kind === 'close-button'
  ) {
    const states = readButtonStates(bytes, meta.id)
    const refs: Record<string, number> = {}
    const stateInfos: Array<Record<string, unknown>> = []
    for (const state of states) {
      if (state.materialGroupId !== null) refs[state.stateName] = state.materialGroupId
      stateInfos.push({
        stateName: state.stateName,
        hasMaterial: state.hasMaterial,
        materialGroupId: state.materialGroupId
      })
    }
    node.props['states'] = stateInfos
    node.refs['stateGroups'] = Object.entries(refs)
      .filter((entry): entry is [string, number] => typeof entry[1] === 'number')
      .map(([stateName, groupId]) => groupId)
    node.unknown.push(...(states.length === 0 ? [] : []))
    // 状态文本聚合：由 tree 构建时成员文本回填（此处先占位）
  } else if (node.kind === 'tab') {
    const tabProps = extractTabPages(fields, unknown)
    node.props = { ...node.props, ...tabProps }
    const kindNumber = extractTabKindNumber(fields)
    if (kindNumber !== undefined) node.props['kindNumber'] = kindNumber
  } else if (node.kind === 'floating-page') {
    node.refs['containers'] = extractContainerRefs(fields)
    const kindNumber = extractFloatingPageKindNumber(fields)
    if (kindNumber !== undefined) node.props['kindNumber'] = kindNumber
    const vars = countVariables(bytes, meta.id)
    if (vars.length > 0) node.props['variables'] = vars
  } else if (node.kind === 'container') {
    const texts = collectWireTextsFromRecord(meta)
    if (!node.name) {
      const known = texts.find((t) => t === '固有容器' || t === '页面容器' || t.includes('容器'))
      if (known) {
        node.name = known
        node.path = node.path.replace(/#\d+$/, '')
        if (!node.path.endsWith(known)) node.path = `${node.path}:${known}`
      }
    }
  }
  if (node.kind === 'material-member') {
    if (compTypes.includes(25)) {
      node.props = { ...node.props, ...extractTextConfig(findComponent(fields, 25), unknown) }
    } else if (compTypes.includes(38)) {
      node.props = { ...node.props, ...extractImageProps(findComponent(fields, 38), unknown) }
    }
  }
  // 素材组/样式组：无额外语义（成员在 children）
  if (node.kind === 'material-group' || node.kind === 'style-group') {
    if (!node.name) node.name = '素材组'
  }
  // 未识别的组件类型
  const ogComp = compTypes.filter((t) => !KNOWN_OG_COMP_TYPES.has(t))
  if (ogComp.length > 0) unknown.push(`ogCompTypes:${ogComp.join('/')}`)
  // 仅组成员/未知记录的报告
  if (roleHint === 'member' && compTypes.some((t) => ![15, 23, 12, 25, 38].includes(t))) {
    unknown.push(`memberCompTypes:${compTypes.join('/')}`)
  }
}

function countVariables(bytes: Uint8Array, id: number): Array<Record<string, unknown>> {
  const pages = listPageVariablesSafe(bytes, id)
  return pages.flatMap((page) =>
    (page.variables ?? []).map((v) => ({ name: v.name, type: v.typeName, index: v.index }))
  )
}

function listPageVariablesSafe(
  bytes: Uint8Array,
  id: number
): Array<{ variables?: Array<{ name: string; typeName: string; index: number }> }> {
  try {
    return listPageVariables(bytes, id) as never
  } catch {
    return []
  }
}

function extractImageProps(
  comp38: WireField[] | undefined,
  unknown: string[]
): Record<string, unknown> {
  if (!comp38) return {}
  const props: Record<string, unknown> = {}
  const f503 = comp38.find((x) => x.number === 503 && x.wire === 2)
  const f503m = f503 ? parseWireMessage(f503.value as Uint8Array) : undefined
  const f31 = f503m?.find((x) => x.number === 31 && x.wire === 2)
  const f31m = f31 ? parseWireMessage(f31.value as Uint8Array) : undefined
  const f6 = f31m?.find((x) => x.number === 6 && x.wire === 2)
  const f6m = f6 ? parseWireMessage(f6.value as Uint8Array) : undefined
  const assetId = f6m?.find((x) => x.number === 4 && x.wire === 0)?.value
  if (typeof assetId === 'number') props.assetId = assetId
  const f2 = f31m?.find((x) => x.number === 2 && x.wire === 0)?.value
  if (typeof f2 === 'number') props.staticResourceId = f2
  if (!props.assetId && !props.staticResourceId) unknown.push('image.source.undecoded')
  return props
}

function extractQueueStyleRefs(
  fields: readonly WireField[],
  recordsById: Map<number, UiRecordMeta>
): number[] {
  const comp77 = findComponent(fields, 77)
  if (!comp77) return []
  const styleEntries = extractStyleEntries(comp77, [])
  const refs: number[] = []
  for (const entry of styleEntries) {
    const styled = entry as { groupId?: number; refs?: number[] }
    const rawRefs = styled.groupId !== undefined ? [styled.groupId] : (styled.refs ?? [])
    for (const ref of rawRefs) {
      const meta = recordsById.get(ref)
      if (meta && (meta.kind === 'asset-group' || meta.kind === 'asset')) {
        if (!refs.includes(ref)) refs.push(ref)
      }
    }
  }
  return refs
}

function extractTabKindNumber(fields: readonly WireField[]): number | undefined {
  const comp49 = findComponent(fields, 49)
  if (!comp49) return undefined
  const varints = collectWireVarints(emitWireMessage(comp49))
  return varints.includes(TAB_KIND) ? TAB_KIND : undefined
}

function extractFloatingPageKindNumber(fields: readonly WireField[]): number | undefined {
  const comp44 = findComponent(fields, 44)
  if (!comp44) return undefined
  const varints = collectWireVarints(emitWireMessage(comp44))
  if (varints.includes(FLOATING_PAGE_RICH_KIND)) return FLOATING_PAGE_RICH_KIND
  if (varints.includes(FLOATING_PAGE_KIND)) return FLOATING_PAGE_KIND
  return undefined
}

function collectWireTextsFromRecord(meta: UiRecordMeta): string[] {
  const m = parseWireMessage(meta.raw)
  if (!m) return []
  const texts: string[] = []
  const walk = (fields: readonly WireField[]) => {
    for (const f of fields) {
      if (f.wire !== 2) continue
      const value = f.value as Uint8Array
      try {
        const text = new TextDecoder().decode(value)
        if (/^[\u4e00-\u9fa5A-Za-z0-9_ ]+$/.test(text) && text.length >= 2) texts.push(text)
      } catch {
        // ignore binary
      }
      const sub = parseWireMessage(value)
      if (sub) walk(sub)
    }
  }
  walk(m)
  return texts
}
