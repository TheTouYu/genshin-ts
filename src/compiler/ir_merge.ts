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
  // 跨图复合 def ID 全局归一（2026-08-31 v5 多图注入重复 def 修复，两遍式）：
  //
  // 背景：多张图 import 同一复合文件时，各图 IR 的 def.id 按各自注册序分配——同一
  // 复合跨图不同 ID，注入后地图复合目录出现同名重复条目（引擎校验目录内全部复合，
  // 重复条目引发加载报错/编辑器可见重复节点）。各图 ID 从同一基数递增，ID 空间高度
  // 重叠但语义互不相同——流式逐 def 处理无法正确消解，必须全局两遍：
  //
  // Pass 1 按复合名选权威（full 优先于 stub、先到优先）；
  // Pass 2 计算每个 def 的期望 ID（同名且签名一致或本条为 stub → 权威 ID；否则保持原 ID）；
  // Pass 3 全局唯一性消解（归一优先落位、保持型撞车让路）：期望 ID 未占用 → 占用；
  // 被同签名占用 → 共享（这正是归一目标；同 ID 同签名不同名也安全——内容一致）；
  // 被不同签名占用 → 本条挪 2000000000 隔离段。同名双 full 签名不同 = 版本冲突，
  // 不归一（防不同项目同名复合互相踩踏），同样走隔离段。
  interface Entry {
    doc: IRDocument
    source: string
    def: CompositeDefIR
    desired: number
    remap: number | null
    signature: string
    stub: boolean
    unify: boolean
  }
  const authoritative = new Map<string, { id: number; signature: string; stub: boolean }>()
  const entries: Entry[] = []
  for (const { doc, source } of docs) {
    if (doc.graph.type !== 'server') continue
    for (const def of (doc as ServerIRDocument).compositeDefs ?? []) {
      const signature = compositeDefinitionSignature(def)
      const stub = (def.implNodes?.length ?? 0) === 0
      const prev = authoritative.get(def.name)
      if (!prev || (prev.stub && !stub)) {
        authoritative.set(def.name, { id: def.id, signature, stub })
      }
      entries.push({ doc, source, def, desired: def.id, remap: null, signature, stub, unify: false })
    }
  }
  for (const e of entries) {
    const auth = authoritative.get(e.def.name)
    if (auth && auth.id !== e.def.id) {
      // 同名即归一（复合名是项目内唯一键；签名含进程内递增节点 id，跨进程不可比，
      // 不能作为同名冲突判据）。真版本冲突（同项目同名不同内容）在单次编译中不存在
      // （同一源文件）；签名差异仅告警留痕，不阻断。
      if (auth.signature !== e.signature && !e.stub && !auth.stub) {
        console.warn(
          `[warn] composite "${e.def.name}" signature differs across graphs ` +
            '(likely per-process node id bases); unifying by name'
        )
      }
      e.desired = auth.id
      e.unify = true
    }
  }
  const used = new Map<number, { signature: string; stub: boolean; name: string }>()
  let nextId = 2000000000
  const resolve = (e: Entry) => {
    const prev = used.get(e.desired)
    if (!prev) {
      used.set(e.desired, { signature: e.signature, stub: e.stub, name: e.def.name })
      if (e.desired !== e.def.id) e.remap = e.desired
      return
    }
    // 同名一律共享（单项目内同名=同源文件；签名含进程内节点 id 基数噪声不可比——
    // 同 id 同名却因签名噪声挪隔离段会把共享复合再次拆成两份，正是要修的 bug）
    if (prev.name === e.def.name || prev.signature === e.signature || e.stub || e.unify) {
      // 同 ID 同签名（或本条为 stub——stub 无内容跟随权威；或本条已经 Pass2 同名
      // 归一校验——unify 目标即权威，直接共享）：
      // 共享（跨图同一复合自然单份；同签名不同名共享也安全）
      if (e.desired !== e.def.id) e.remap = e.desired
      if (prev.stub && !e.stub) used.set(e.desired, { signature: e.signature, stub: false, name: e.def.name })
      return
    }
    // 期望 ID 被不同名且不同签名的占用者持有：真正的 ID 冲突——本条挪隔离段
    while (used.has(nextId)) nextId++
    e.remap = nextId
    used.set(nextId, { signature: e.signature, stub: e.stub, name: e.def.name })
    nextId++
  }
  // 消解顺序：非归一条目（原位 desired==def.id）先落位占住 ID，归一条目后到共享
  //（否则 stub 先占位会把 full 正主挤到隔离段）；两类内部均按出现顺序，保持原流式语义
  for (const e of entries) if (!e.unify) resolve(e)
  // 权威链修正：保持型消解可能把权威 def 自己挪到隔离段（其原 ID 被更早的不同名
  // 复合占用）——跟随者必须取权威的最终 ID，否则会 remap 到别人的 ID 上（占位者
  // 语义错位，比重复更糟）。e.def.id 在本轮未被改写（remap 记在 e.remap），据此
  // 识别"权威被挪"并更新权威表。
  for (const e of entries) {
    if (e.remap === null || e.unify) continue
    const auth = authoritative.get(e.def.name)
    if (auth && auth.id === e.def.id) {
      authoritative.set(e.def.name, { ...auth, id: e.remap })
    }
  }
  for (const e of entries) {
    if (!e.unify) continue
    const auth = authoritative.get(e.def.name)
    if (auth) e.desired = auth.id
    resolve(e)
  }
  // 汇总 per-doc 重映射（一个 doc 多个 def 的 old→new 一次应用）
  const perDoc = new Map<IRDocument, { ids: Map<number, number>; source: string }>()
  for (const e of entries) {
    if (e.remap === null) continue
    let rec = perDoc.get(e.doc)
    if (!rec) {
      rec = { ids: new Map(), source: e.source }
      perDoc.set(e.doc, rec)
    }
    rec.ids.set(e.def.id, e.remap)
  }
  for (const [doc, { ids, source }] of perDoc) {
    remapCompositeIds(doc, ids)
    changedSources.add(source)
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
