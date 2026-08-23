import fs from 'node:fs'
import path from 'node:path'

import { t } from '../i18n/index.js'
import { resolveGraphIdForGraph } from '../runtime/graph_defaults.js'
import type {
  Argument,
  ClientIRDocument,
  ClientNode,
  CompositeCallMeta,
  CompositeDefIR,
  ConnectionArgument,
  IRDocument,
  NextConnection,
  ServerIRDocument,
  ServerNode,
  Variable
} from '../runtime/IR.js'

type IrSource = {
  doc: IRDocument
  sourceJsonPath: string
  sourceIndex: number
}

type AnyIRDocument = ServerIRDocument | ClientIRDocument
type AnyIRNode = ServerNode | ClientNode
type AnyGraphInfo = IRDocument['graph']

type GstsMergeMeta = {
  merged: true
  graphId: number
  sources: string[]
}

type IrWithGstsMeta = IRDocument & { __gsts?: GstsMergeMeta }

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

function isMergedMarker(v: unknown): boolean {
  if (!isRecord(v)) return false
  const meta = v.__gsts
  if (!isRecord(meta)) return false
  return meta.merged === true
}

function sanitizeFileName(name: string): string {
  return name.trim().replace(/[<>:"/\\|?*]+/g, '_')
}

function isExplicitGraphNameForSource(name: unknown, sourceJsonPath: string): name is string {
  if (typeof name !== 'string') return false
  const s = name
  if (!s.length) return false
  // runner 默认 name 通常为 `_GSTS_<entryBaseName>`，这里用 json 文件名反推默认名，区分“默认命名”与“显式命名”
  const base = path.basename(sourceJsonPath, '.json')
  let stripped = s
  if (stripped.startsWith('_GSTS_')) stripped = stripped.slice('_GSTS_'.length)
  if (stripped.toLowerCase() === base.toLowerCase()) return false
  return true
}

function isIrDocumentLike(doc: unknown): doc is IRDocument {
  if (!isRecord(doc)) return false
  if (doc.ir_version !== 1 || doc.ir_type !== 'node_graph') return false
  if (!isRecord(doc.graph)) return false
  const gt = doc.graph.type
  if (gt !== 'server' && gt !== 'client') return false
  return true
}

function isInternalGstsVarName(name: string): boolean {
  return /^_gsts/i.test(name)
}

function buildSourceTag(outDirAbs: string, sourceJsonPath: string, sourceIndex: number): string {
  const rel = path.relative(outDirAbs, sourceJsonPath)
  const noExt = rel.replace(/\.json$/i, '')
  const flattened = noExt.replace(/[\\/]/g, '_')
  return sanitizeFileName(`${flattened}_${sourceIndex}`)
}

function getNodes(doc: AnyIRDocument): AnyIRNode[] {
  const nodes = doc.nodes
  return Array.isArray(nodes) ? (nodes as AnyIRNode[]) : []
}

function rewriteNodeGraphVariableRefsInPlace(doc: AnyIRDocument, rename: Map<string, string>) {
  for (const n of getNodes(doc)) {
    const type = n.type
    if (type !== 'get_node_graph_variable' && type !== 'set_node_graph_variable') continue
    const a0 = n.args?.[0]
    if (!a0 || a0.type !== 'str') continue
    const next = rename.get(a0.value)
    if (next) a0.value = next
  }
}

function rewriteVariablesInPlace(doc: AnyIRDocument, rename: Map<string, string>) {
  const vars = doc.variables
  if (!Array.isArray(vars)) return
  for (const v of vars) {
    const next = rename.get(v.name)
    if (next) v.name = next
  }
}

function collectInternalVarNames(doc: AnyIRDocument): Set<string> {
  const out = new Set<string>()
  for (const v of doc.variables ?? []) {
    if (isInternalGstsVarName(v.name)) out.add(v.name)
  }
  for (const n of getNodes(doc)) {
    const type = n.type
    if (type !== 'get_node_graph_variable' && type !== 'set_node_graph_variable') continue
    const a0 = n.args?.[0]
    if (!a0 || a0.type !== 'str') continue
    if (isInternalGstsVarName(a0.value)) out.add(a0.value)
  }
  return out
}

function deepClone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T
}

function pickTopmostDir(outDirAbs: string, paths: string[]): string {
  const scored = paths
    .map((p) => {
      const rel = path.relative(outDirAbs, p)
      const segs = rel.split(path.sep).filter(Boolean)
      const depth = Math.max(0, segs.length - 1) // dir depth
      return { p, depth, rel }
    })
    .sort((a, b) => a.depth - b.depth || a.rel.localeCompare(b.rel))
  return path.dirname(scored[0]?.p ?? outDirAbs)
}

function mergeVariablesOrThrowByName(
  items: { source: string; vars: Variable[] | undefined }[]
): Variable[] | undefined {
  const all = items.flatMap((x) => x.vars ?? [])
  if (!all.length) return undefined

  const byName = new Map<string, Set<string>>()
  for (const it of items) {
    for (const v of it.vars ?? []) {
      const s = byName.get(v.name) ?? new Set<string>()
      s.add(it.source)
      byName.set(v.name, s)
    }
  }

  const duplicates: { name: string; sources: string[] }[] = []
  for (const [name, sources] of byName) {
    if (sources.size > 1) {
      duplicates.push({ name, sources: [...sources].sort((a, b) => a.localeCompare(b)) })
    }
  }
  if (duplicates.length) {
    const lines = duplicates
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 50)
      .map((d) => `- ${d.name}: ${d.sources.join(', ')}`)
      .join('\n')
    throw new Error(
      t('err_mergeDuplicateVarsByName', {
        count: duplicates.length,
        lines,
        truncated: duplicates.length > 50 ? t('err_mergeTruncated') : '',
        hint: t('err_mergeDuplicateVarsHint')
      })
    )
  }

  return all
}

function remapNextConn(conn: NextConnection, map: Map<number, number>): NextConnection {
  if (typeof conn === 'number') {
    return map.get(conn) ?? conn
  }
  return { ...conn, node_id: map.get(conn.node_id) ?? conn.node_id }
}

function remapArg(arg: Argument, map: Map<number, number>): Argument {
  if (!arg || arg.type !== 'conn') return arg
  const conn = arg
  return {
    ...conn,
    value: { ...conn.value, node_id: map.get(conn.value.node_id) ?? conn.value.node_id }
  } satisfies ConnectionArgument
}

function remapNodeIdsInNode(node: AnyIRNode, map: Map<number, number>) {
  node.id = map.get(node.id) ?? node.id
  if (node.args?.length) node.args = node.args.map((a) => remapArg(a, map))
  if (node.next?.length) node.next = node.next.map((n) => remapNextConn(n, map))
}

function compositeDefinitionSignature(def: CompositeDefIR): string {
  const { id: _id, ...withoutId } = def
  return JSON.stringify(withoutId)
}

function rewriteCompositeIdInNode(node: ServerNode, ids: Map<number, number>) {
  if (node.type !== '__composite_call__') return
  const arg = node.args?.[0]
  if (arg && arg.type !== 'conn' && typeof arg.value === 'number') {
    arg.value = ids.get(arg.value) ?? arg.value
  }
}

function remapCompositeIds(doc: IRDocument, ids: Map<number, number>) {
  if (doc.graph.type !== 'server') return
  const serverDoc = doc as ServerIRDocument
  for (const node of serverDoc.nodes ?? []) rewriteCompositeIdInNode(node, ids)
  for (const def of serverDoc.compositeDefs ?? []) {
    def.id = ids.get(def.id) ?? def.id
    for (const node of def.implNodes) rewriteCompositeIdInNode(node, ids)
  }
  for (const call of (serverDoc.compositeCalls ?? []) as CompositeCallMeta[]) {
    call.compositeId = ids.get(call.compositeId) ?? call.compositeId
  }
}

function allocateCompositeIds(docs: { doc: IRDocument; source: string }[]): Set<string> {
  const changedSources = new Set<string>()
  const used = new Map<number, { signature: string; source: string; stub: boolean }>()
  let nextId = 2000000000
  for (const { doc, source } of docs) {
    if (doc.graph.type !== 'server') continue
    const ids = new Map<number, number>()
    for (const def of (doc as ServerIRDocument).compositeDefs ?? []) {
      const signature = compositeDefinitionSignature(def)
      const isStub = (def.implNodes?.length ?? 0) === 0
      const previous = used.get(def.id)
      if (!previous) {
        used.set(def.id, { signature, source, stub: isStub })
        continue
      }
      if (previous.signature === signature) {
        // 同签名：full 优先于 stub，保留 full
        if (!previous.stub && isStub) continue
        if (previous.stub && !isStub) used.set(def.id, { signature, source, stub: false })
        continue
      }
      // 签名不同：stub 不参与重命名，full 覆盖 stub，两个 full 才需要新 ID
      if (isStub || previous.stub) {
        if (!previous.stub && isStub) continue
        if (previous.stub && !isStub) used.set(def.id, { signature, source, stub: false })
        continue
      }
      while (used.has(nextId)) nextId++
      ids.set(def.id, nextId)
      used.set(nextId, { signature, source, stub: false })
      nextId++
    }
    if (ids.size) {
      remapCompositeIds(doc, ids)
      changedSources.add(source)
    }
  }
  return changedSources
}

function normalizeGraphModeCompatibility(a: AnyGraphInfo, b: AnyGraphInfo) {
  const ma = a.mode
  const mb = b.mode
  if (ma && mb && ma !== mb) {
    throw new Error(
      t(a.type === 'server' ? 'err_mergeServerModeMismatch' : 'err_mergeClientModeMismatch', {
        id: String(a.id),
        a: String(ma),
        b: String(mb)
      })
    )
  }
  if (!ma && mb) {
    a.mode = mb
  }
}

function normalizeGraphCompatibility(base: IRDocument, next: IRDocument, _sourceJsonPath: string) {
  const a = base.graph
  const b = next.graph
  if (a.type !== b.type) {
    throw new Error(
      t('err_mergeGraphIdTypeCollision', {
        id: String(resolveGraphIdForGraph(a)),
        a: String(a.type),
        b: String(b.type)
      })
    )
  }
  // server/client 都遵守同一条 mode 规则：
  // - 双方都有 mode 时必须一致
  // - 只有一方有 mode 时，用显式填写的一方补齐合并结果
  normalizeGraphModeCompatibility(a, b)

  if (a.type === 'server' && b.type === 'server') {
    // 规则：
    // - 若只有一个显式填写 sub_type：用填写的那个
    // - 若多个显式填写且不一致：报错
    const sa = a.sub_type
    const sb = b.sub_type
    if (sa && sb && sa !== sb) {
      throw new Error(
        t('err_mergeServerSubTypeMismatch', {
          id: String(a.id),
          a: String(sa),
          b: String(sb)
        })
      )
    }
    if (!sa && sb) {
      a.sub_type = sb
    }
    return
  }
  if (a.type === 'client' && b.type === 'client') {
    const sa = a.sub_type
    const sb = b.sub_type
    if (sa !== sb) {
      throw new Error(
        t('err_mergeClientSubTypeMismatch', {
          id: String(a.id),
          a: String(sa),
          b: String(sb)
        })
      )
    }
  }
}

export type MergeGroupResult = {
  graphId: number
  outJsonPath: string
  merged: IRDocument
  sourceJsonPaths: string[]
}

export function mergeIrJsonFilesByGraphId(params: {
  outDirAbs: string
  irJsonPaths: string[]
}): MergeGroupResult[] {
  const items: IrSource[] = []
  const sourcePayloads = new Map<string, unknown>()
  for (const p of params.irJsonPaths) {
    const raw: unknown = JSON.parse(fs.readFileSync(p, 'utf8'))
    sourcePayloads.set(p, raw)
    if (isMergedMarker(raw)) continue
    const list = Array.isArray(raw) ? raw : [raw]
    list.forEach((doc, idx) => {
      if (isMergedMarker(doc)) return
      if (!isIrDocumentLike(doc)) return
      items.push({ doc, sourceJsonPath: p, sourceIndex: idx })
    })
  }

  const remappedSources = allocateCompositeIds(
    items.map((it) => ({ doc: it.doc, source: it.sourceJsonPath }))
  )
  for (const sourcePath of remappedSources) {
    const payload = sourcePayloads.get(sourcePath)
    if (payload === undefined) continue
    fs.writeFileSync(sourcePath, JSON.stringify(payload, null, 2) + '\n', 'utf8')
  }

  const groups = new Map<number, IrSource[]>()
  for (const it of items) {
    // 用户未指定 id 时，按节点图类型使用默认 id；合并也按同样规则分组。
    const gid = resolveGraphIdForGraph(it.doc.graph)
    const arr = groups.get(gid) ?? []
    arr.push(it)
    groups.set(gid, arr)
  }

  const results: MergeGroupResult[] = []

  for (const [graphId, list] of groups) {
    if (!list.length) continue
    const ordered = [...list].sort(
      (a, b) => a.sourceJsonPath.localeCompare(b.sourceJsonPath) || a.sourceIndex - b.sourceIndex
    )

    // 若 graphId 不重复，则不生成合并文件，直接沿用原 json
    if (ordered.length === 1) {
      results.push({
        graphId,
        outJsonPath: ordered[0].sourceJsonPath,
        merged: ordered[0].doc,
        sourceJsonPaths: [ordered[0].sourceJsonPath]
      })
      continue
    }

    const base = deepClone(ordered[0].doc) as AnyIRDocument
    for (const it of ordered.slice(1)) {
      normalizeGraphCompatibility(base, it.doc, it.sourceJsonPath)
    }
    if (base.graph.type === 'client') {
      throw new Error(
        t('err_mergeDuplicateClientGraphId', {
          id: String(graphId)
        })
      )
    }

    const topDir = pickTopmostDir(
      params.outDirAbs,
      ordered.map((x) => x.sourceJsonPath)
    )
    const dirName = path.basename(topDir)
    let explicitName: string | undefined
    for (const it of ordered) {
      const name = it.doc.graph.name
      if (isExplicitGraphNameForSource(name, it.sourceJsonPath)) {
        explicitName = name
        break
      }
    }

    const nameForFile = (() => {
      if (explicitName) {
        return explicitName.startsWith('_GSTS_')
          ? explicitName.slice('_GSTS_'.length)
          : explicitName
      }
      return dirName
    })()
    const fileBaseName = sanitizeFileName(`${nameForFile}_${graphId}`)
    base.graph.id = graphId
    base.graph.name = explicitName ?? `_GSTS_${dirName}`

    const mergedNodes: AnyIRNode[] = []
    let nextId = 1
    const varsAfterRename: { source: string; vars: Variable[] | undefined }[] = []
    for (const it of ordered) {
      const cloned = deepClone(it.doc) as AnyIRDocument

      // 变量重命名：把所有 _gsts* 变量按源文件打 tag，避免合并后同名互相覆盖
      const tag = buildSourceTag(params.outDirAbs, it.sourceJsonPath, it.sourceIndex)
      const internalNames = collectInternalVarNames(cloned)
      const rename = new Map<string, string>()
      for (const name of internalNames) {
        rename.set(name, `${name}__${tag}`)
      }
      if (rename.size) {
        rewriteVariablesInPlace(cloned, rename)
        rewriteNodeGraphVariableRefsInPlace(cloned, rename)
      }

      varsAfterRename.push({ source: it.sourceJsonPath, vars: cloned.variables })

      const nodes = getNodes(cloned)
      if (!nodes.length) continue

      const map = new Map<number, number>()
      for (const n of nodes) {
        map.set(n.id, nextId++)
      }

      nodes.forEach((n) => remapNodeIdsInNode(n, map))
      mergedNodes.push(...nodes)
    }

    const mergedVars = mergeVariablesOrThrowByName(varsAfterRename)
    if (mergedVars?.length) base.variables = mergedVars
    base.nodes = mergedNodes

    const mergedCompositeDefs = new Map<number, CompositeDefIR>()
    for (const it of ordered) {
      for (const def of (it.doc as ServerIRDocument).compositeDefs ?? []) {
        mergedCompositeDefs.set(def.id, deepClone(def))
      }
    }
    if (mergedCompositeDefs.size) {
      ;(base as ServerIRDocument).compositeDefs = [...mergedCompositeDefs.values()]
    }

    const outJsonPath = path.join(topDir, `${fileBaseName}.json`)
    const sourceJsonPaths = [...new Set(ordered.map((x) => x.sourceJsonPath))]
    ;(base as IrWithGstsMeta).__gsts = { merged: true, graphId, sources: sourceJsonPaths }
    fs.mkdirSync(path.dirname(outJsonPath), { recursive: true })
    fs.writeFileSync(outJsonPath, JSON.stringify(base, null, 2) + '\n', 'utf8')

    results.push({
      graphId,
      outJsonPath,
      merged: base,
      sourceJsonPaths
    })
  }

  return results.sort((a, b) => a.graphId - b.graphId)
}
