#!/usr/bin/env npx tsx
/**
 * lookup-node: 节点/定义一键检索工具（只读）
 *
 * 输入：中文名 / 英文名 / 方法名 / genericId
 * 输出：四态结论
 *   一态 dsl_available      —— DSL 可用（server/client/both），给文件行号 + 签名摘要
 *   二态 editor_only        —— 编辑器/官方教程有，但 DSL 未暴露
 *   三态 not_found          —— 本地语料均未解析到
 *   四态 semantic_resource  —— 非节点（状态效果配置名等），禁止硬凑节点 ID
 *
 * 运行方式（仓库根）：
 *   npx tsx .agents/skills/dsl-nodegraph-development/scripts/lookup-node.ts "添加单位状态"
 *   npx tsx .agents/skills/dsl-nodegraph-development/scripts/lookup-node.ts "addUnitStatus" --json
 *   npx tsx .agents/skills/dsl-nodegraph-development/scripts/lookup-node.ts --samples
 *   npx tsx .agents/skills/dsl-nodegraph-development/scripts/lookup-node.ts --matrix
 *
 * 铁律：只读 resources/* / src/definitions/* / src/thirdparty/*；
 *       查不到就报“不存在/未解析”，不臆造 DSL 函数名。
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

import {
  SERVER_EVENT_EN_TO_ZH,
  SERVER_EVENT_ZH_TO_EN,
  SERVER_F_EN_TO_ZH,
  SERVER_F_ZH_TO_EN
} from '../../../../src/definitions/zh_aliases.js'
import { CLIENT_F_ZH_TO_EN_BY_SUB_TYPE } from '../../../../src/definitions/client_zh_aliases.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..', '..', '..', '..')

const PATHS = {
  editorNames: path.join(ROOT, 'resources/mihoyo_editor_names.json'),
  nodeDefinitions: path.join(ROOT, 'resources/node_definitions.json'),
  serverStatic: path.join(ROOT, 'resources/server_node_static_metadata.json'),
  clientMetadata: path.join(ROOT, 'resources/client_node_metadata.json'),
  serverNodes: path.join(ROOT, 'src/definitions/nodes.ts'),
  clientNodes: path.join(ROOT, 'src/definitions/client_nodes.ts'),
  serverAliases: path.join(ROOT, 'src/definitions/zh_aliases.ts'),
  clientAliases: path.join(ROOT, 'src/definitions/client_zh_aliases.ts')
} as const

/** 已知非节点语义资源：状态效果配置名/目录尚未机器可读解析（见 .scratch/beyond-semantic-resources/ 票 01）。 */
const NON_NODE_SEMANTIC_RESOURCES = [
  '移动速率调整率（动态）',
  '移动速率调整率(动态)',
  '移动速率调整率',
  '定时触发技能',
  '造物不可见',
  '1720001',
  '2110001',
  '2010001'
] as const

type EditorNode = {
  genericId: number
  nameZh?: string
  nameEn?: string
  pins?: Array<{ kind: string; index: number; nameZh?: string; nameEn?: string }>
}

type MethodInfo = {
  file: string
  className: string
  line: number
  signature: string
  kind: 'server' | 'client'
}

type LookupResult = {
  query: string
  state: 'dsl_available' | 'editor_only' | 'not_found' | 'semantic_resource'
  summary: string
  side?: 'server' | 'client' | 'both' | 'unknown'
  hint?: string
  dsl: {
    server: MethodInfo[]
    client: MethodInfo[]
    events: Array<{ eventName: string; aliasFile: string; aliasLine: number }>
  }
  editor: EditorNode[]
  docs: Array<{
    slug: string
    title: string
    category: string
    language: string
    section: string
    nodeName: string
  }>
  metadata: Array<{
    source: string
    genericId?: number
    subType?: string
    nodeType?: string
    displayName?: string
  }>
}

let editorNamesCache: { nodes: EditorNode[]; enums: unknown[] } | undefined
function editorNames() {
  if (!editorNamesCache) {
    const raw = JSON.parse(fs.readFileSync(PATHS.editorNames, 'utf8')) as {
      nodes: EditorNode[]
      enums: unknown[]
    }
    editorNamesCache = raw
  }
  return editorNamesCache
}

let nodeDefinitionsCache: Record<string, any> | undefined
function nodeDefinitions() {
  if (!nodeDefinitionsCache) {
    nodeDefinitionsCache = JSON.parse(fs.readFileSync(PATHS.nodeDefinitions, 'utf8')) as Record<
      string,
      any
    >
  }
  return nodeDefinitionsCache
}

let serverStaticCache: { nodes: Array<{ genericId: number }> } | undefined
function serverStatic() {
  if (!serverStaticCache) {
    serverStaticCache = JSON.parse(fs.readFileSync(PATHS.serverStatic, 'utf8'))
  }
  return serverStaticCache
}

let clientMetadataCache: Array<Record<string, any>> | undefined
function clientMetadata() {
  if (!clientMetadataCache) {
    clientMetadataCache = JSON.parse(fs.readFileSync(PATHS.clientMetadata, 'utf8')) as Array<
      Record<string, any>
    >
  }
  return clientMetadataCache
}

function normalizedIdentifier(value: string) {
  return String(value)
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '')
}

function lineOfKey(file: string, key: string): number | undefined {
  const text = fs.readFileSync(file, 'utf8')
  const lines = text.split(/\r?\n/)
  const target = key
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(target)) return i + 1
  }
  return undefined
}

/** 英文编辑器名 -> DSL 方法名（与 scripts/client-nodegraph/client_nodes_codegen.ts 同规则）。 */
function editorNameToMethodName(name: string): string {
  const nodeType = name
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()
  if (!nodeType) return ''
  const camel = nodeType.replace(/_([a-z0-9])/g, (_, c: string, offset: number) =>
    offset === 0 ? `_${c}` : c.toUpperCase()
  )
  return /^\d/.test(nodeType) ? `_${camel}` : camel
}

const methodCache = new Map<string, Map<string, MethodInfo[]>>()

function parseMethodMap(file: string, kind: 'server' | 'client'): Map<string, MethodInfo[]> {
  const cached = methodCache.get(file)
  if (cached) return cached

  const sourceText = fs.readFileSync(file, 'utf8')
  const sourceFile = ts.createSourceFile(file, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const result = new Map<string, MethodInfo[]>()

  function visit(node: ts.Node) {
    if (ts.isClassDeclaration(node) && node.name) {
      const className = node.name.text
      for (const member of node.members) {
        if (!ts.isMethodDeclaration(member) || !member.name || !ts.isIdentifier(member.name)) continue
        const methodName = member.name.text
        const line = sourceFile.getLineAndCharacterOfPosition(member.getStart()).line + 1
        const params = member.parameters
          .map((p) => {
            const name = p.name.getText(sourceFile)
            const type = p.type ? p.type.getText(sourceFile) : 'unknown'
            return `${name}: ${type}`
          })
          .join(', ')
        const signature = `${methodName}(${params})`
        const info: MethodInfo = { file, className, line, signature, kind }
        const arr = result.get(methodName) ?? []
        arr.push(info)
        result.set(methodName, arr)
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  methodCache.set(file, result)
  return result
}

function serverMethodMap() {
  return parseMethodMap(PATHS.serverNodes, 'server')
}

function clientMethodMap() {
  return parseMethodMap(PATHS.clientNodes, 'client')
}

function findEditorNodes(query: string, limit = 8): EditorNode[] {
  const q = normalizedIdentifier(query)
  if (!q) return []
  const nodes = editorNames().nodes
  const scored: Array<{ score: number; node: EditorNode }> = []
  for (const node of nodes) {
    const zh = normalizedIdentifier(node.nameZh ?? '')
    const en = normalizedIdentifier(node.nameEn ?? '')
    const id = String(node.genericId)
    let score = -1
    if (id === query.trim() || zh === q || en === q) score = 2
    else if (zh.startsWith(q) || en.startsWith(q)) score = 1
    else if (zh.includes(q) || en.includes(q)) score = 0
    if (score >= 0) scored.push({ score, node })
  }
  scored.sort((a, b) => b.score - a.score || a.node.genericId - b.node.genericId)
  return scored.slice(0, limit).map((s) => s.node)
}

function findDocs(query: string, limit = 5) {
  const q = normalizedIdentifier(query)
  const docs = nodeDefinitions()
  const hits: LookupResult['docs'] = []
  const seen = new Set<string>()
  for (const [slug, doc] of Object.entries(docs)) {
    if (!doc || typeof doc !== 'object' || !Array.isArray(doc.sections)) continue
    const language = slug.endsWith('zh-cn') ? 'zh-cn' : 'en-us'
    for (const section of doc.sections) {
      if (!section || !Array.isArray(section.nodes)) continue
      for (const node of section.nodes) {
        if (!node || typeof node.name !== 'string') continue
        const name = normalizedIdentifier(node.name)
        if (name === q || name.includes(q)) {
          const key = `${slug}:${section.title ?? ''}:${node.name}`
          if (seen.has(key)) continue
          seen.add(key)
          hits.push({
            slug,
            title: doc.title ?? doc.category ?? slug,
            category: doc.category ?? '',
            language,
            section: section.title ?? '',
            nodeName: node.name
          })
          if (hits.length >= limit) return hits
        }
      }
    }
  }
  return hits
}

function findMetadata(query: string, editorHits: EditorNode[]) {
  const hits: LookupResult['metadata'] = []
  const q = normalizedIdentifier(query)

  for (const node of serverStatic().nodes) {
    if (String(node.genericId) === query.trim()) {
      hits.push({ source: 'resources/server_node_static_metadata.json', genericId: node.genericId })
    }
  }
  if (q && /^\d+$/.test(query.trim())) {
    for (const node of clientMetadata()) {
      if (String(node.genericId) === query.trim()) {
        hits.push({
          source: 'resources/client_node_metadata.json',
          genericId: node.genericId,
          subType: node.subType,
          nodeType: node.nodeType,
          displayName: node.displayName
        })
      }
    }
  } else {
    for (const node of clientMetadata()) {
      const zh = normalizedIdentifier(node.displayName ?? '')
      const snake = normalizedIdentifier(node.nodeType ?? '')
      const camel = editorNameToMethodName(node.nodeType ?? '')
      if (zh === q || snake === q || normalizedIdentifier(camel) === q) {
        hits.push({
          source: 'resources/client_node_metadata.json',
          genericId: node.genericId,
          subType: node.subType,
          nodeType: node.nodeType,
          displayName: node.displayName
        })
        if (hits.length >= 10) break
      }
    }
  }
  // If we already have editor hits, attach matching server static / client metadata rows for context.
  for (const editor of editorHits) {
    if (editor.genericId < 200000 && !hits.some((h) => h.genericId === editor.genericId)) {
      if (serverStatic().nodes.some((n) => n.genericId === editor.genericId)) {
        hits.push({
          source: 'resources/server_node_static_metadata.json',
          genericId: editor.genericId
        })
      }
    } else if (editor.genericId >= 200000) {
      const clientRows = clientMetadata().filter((n) => n.genericId === editor.genericId)
      for (const row of clientRows) {
        if (!hits.some((h) => h.genericId === row.genericId && h.nodeType === row.nodeType)) {
          hits.push({
            source: 'resources/client_node_metadata.json',
            genericId: row.genericId,
            subType: row.subType,
            nodeType: row.nodeType,
            displayName: row.displayName
          })
        }
      }
    }
  }
  return hits.slice(0, 20)
}

function findServerAliases(query: string) {
  const fByZh = SERVER_F_ZH_TO_EN[query as keyof typeof SERVER_F_ZH_TO_EN]
  const fByEn = SERVER_F_EN_TO_ZH[query as keyof typeof SERVER_F_EN_TO_ZH]
  const eventByZh = SERVER_EVENT_ZH_TO_EN[query as keyof typeof SERVER_EVENT_ZH_TO_EN]
  const eventByEn = SERVER_EVENT_EN_TO_ZH[query as keyof typeof SERVER_EVENT_EN_TO_ZH]
  return { fByZh, fByEn, eventByZh, eventByEn }
}

function findClientAliasSubtypes(query: string) {
  const subtypes: string[] = []
  const methodNames = new Set<string>()
  for (const [subtype, map] of Object.entries(CLIENT_F_ZH_TO_EN_BY_SUB_TYPE)) {
    const mapRecord = map as Record<string, string>
    if (Object.prototype.hasOwnProperty.call(mapRecord, query)) {
      subtypes.push(subtype)
      methodNames.add(mapRecord[query])
    }
    for (const [zh, method] of Object.entries(mapRecord)) {
      if (method === query) {
        subtypes.push(subtype)
        methodNames.add(method)
      }
    }
  }
  return { subtypes: [...new Set(subtypes)], methodNames: [...methodNames] }
}

function semanticResourceHint(query: string) {
  const trimmed = query.trim()
  if (!trimmed) return undefined
  if (NON_NODE_SEMANTIC_RESOURCES.includes(trimmed as (typeof NON_NODE_SEMANTIC_RESOURCES)[number])) {
    return (
      '这不是节点，属状态效果配置名/语义资源；本地目录尚未解析，见 ' +
      '.scratch/beyond-semantic-resources/ 票 01。禁止臆造 1720001 等 ID。'
    )
  }
  // 数字 ID 只做精确匹配，避免 “1” 被 1720001 误伤。
  if (/^\d+$/.test(trimmed)) return undefined
  if (
    trimmed.length >= 2 &&
    NON_NODE_SEMANTIC_RESOURCES.some((name) => trimmed.includes(name) || name.includes(trimmed))
  ) {
    return (
      '这不是节点，属状态效果配置名/语义资源；本地目录尚未解析，见 ' +
      '.scratch/beyond-semantic-resources/ 票 01。禁止臆造 1720001 等 ID。'
    )
  }
  return undefined
}

function resolve(query: string): LookupResult {
  const hint = semanticResourceHint(query)
  if (hint) {
    return {
      query,
      state: 'semantic_resource',
      summary: '四态：非节点语义资源（状态效果配置名/未解析目录），不做节点检索',
      hint,
      dsl: { server: [], client: [], events: [] },
      editor: [],
      docs: [],
      metadata: []
    }
  }

  const editorHits = findEditorNodes(query)
  const docsHits = findDocs(query)
  const metadataHits = findMetadata(query, editorHits)
  const serverMethods = serverMethodMap()
  const clientMethods = clientMethodMap()

  const serverAlias = findServerAliases(query)
  const clientAlias = findClientAliasSubtypes(query)

  // Collect method-name candidates from direct query, aliases, and editor hits.
  const serverMethodCandidates = new Set<string>()
  const clientMethodCandidates = new Set<string>()
  const serverEvents = new Set<string>()

  if (serverAlias.fByZh) serverMethodCandidates.add(serverAlias.fByZh)
  if (serverAlias.fByEn) {
    // SERVER_F_EN_TO_ZH key is already the method name; value is Chinese label.
    serverMethodCandidates.add(query)
  }
  if (serverAlias.eventByZh) serverEvents.add(serverAlias.eventByZh)
  if (serverAlias.eventByEn) serverEvents.add(query)

  const directServerMethods = serverMethods.get(query)
  if (directServerMethods) for (const m of directServerMethods) serverMethodCandidates.add(query)

  for (const method of clientAlias.methodNames) clientMethodCandidates.add(method)
  const directClientMethods = clientMethods.get(query)
  if (directClientMethods) {
    for (const m of directClientMethods) clientMethodCandidates.add(query)
    clientMethodCandidates.add(query)
  }

  // Derive candidates from editor labels (also covers genericId lookup).
  // 侧别隔离：server 编辑器条目只推导 server DSL，client 编辑器条目只推导 client DSL，
  // 避免用同名的 client 节点（如 200057）误标 server genericId 查询为 both。
  for (const editor of editorHits) {
    if (editor.genericId < 200000) {
      if (editor.nameZh && SERVER_F_ZH_TO_EN[editor.nameZh as keyof typeof SERVER_F_ZH_TO_EN]) {
        serverMethodCandidates.add(
          SERVER_F_ZH_TO_EN[editor.nameZh as keyof typeof SERVER_F_ZH_TO_EN]
        )
      }
      if (editor.nameZh && SERVER_EVENT_ZH_TO_EN[editor.nameZh as keyof typeof SERVER_EVENT_ZH_TO_EN]) {
        serverEvents.add(SERVER_EVENT_ZH_TO_EN[editor.nameZh as keyof typeof SERVER_EVENT_ZH_TO_EN])
      }
      if (editor.nameEn) {
        const candidate = editorNameToMethodName(editor.nameEn)
        if (candidate) serverMethodCandidates.add(candidate)
      }
    } else {
      if (editor.nameZh) {
        for (const [subtype, map] of Object.entries(CLIENT_F_ZH_TO_EN_BY_SUB_TYPE)) {
          const mapRecord = map as Record<string, string>
          if (Object.prototype.hasOwnProperty.call(mapRecord, editor.nameZh)) {
            clientMethodCandidates.add(mapRecord[editor.nameZh])
          }
        }
      }
    }
  }

  const dslServerMethods: MethodInfo[] = []
  for (const method of serverMethodCandidates) {
    for (const info of serverMethods.get(method) ?? []) {
      if (!dslServerMethods.some((x) => x.file === info.file && x.line === info.line)) {
        dslServerMethods.push(info)
      }
    }
  }

  const dslClientMethods: MethodInfo[] = []
  for (const method of clientMethodCandidates) {
    for (const info of clientMethods.get(method) ?? []) {
      if (!dslClientMethods.some((x) => x.file === info.file && x.line === info.line)) {
        dslClientMethods.push(info)
      }
    }
  }

  const eventHits: LookupResult['dsl']['events'] = []
  for (const eventName of serverEvents) {
    const aliasFile = PATHS.serverAliases
    const aliasLine = lineOfKey(aliasFile, eventName) ?? 0
    eventHits.push({ eventName, aliasFile, aliasLine })
  }

  const hasServerDsl = dslServerMethods.length > 0 || eventHits.length > 0
  const hasClientDsl = dslClientMethods.length > 0
  const side =
    hasServerDsl && hasClientDsl
      ? 'both'
      : hasServerDsl
        ? 'server'
        : hasClientDsl
          ? 'client'
          : editorHits.length
            ? editorHits.some((n) => n.genericId >= 200000)
              ? editorHits.some((n) => n.genericId < 200000)
                ? 'both'
                : 'client'
              : 'server'
            : undefined

  if (hasServerDsl || hasClientDsl) {
    const serverPart =
      dslServerMethods.length > 0
        ? `server(${dslServerMethods.map((m) => `${path.relative(ROOT, m.file)}:${m.line}`).join(', ')})`
        : eventHits.length > 0
          ? `server event(${eventHits.map((e) => e.eventName).join(', ')})`
          : ''
    const clientPart = dslClientMethods.length > 0
      ? `client(${dslClientMethods.map((m) => `${path.relative(ROOT, m.file)}:${m.line}`).join(', ')})`
      : ''
    return {
      query,
      state: 'dsl_available',
      summary: `一态：DSL 可用（${side}）`,
      side,
      dsl: { server: dslServerMethods, client: dslClientMethods, events: eventHits },
      editor: editorHits,
      docs: docsHits,
      metadata: metadataHits
    }
  }

  if (editorHits.length > 0 || docsHits.length > 0 || metadataHits.length > 0) {
    const sourceNames = [
      editorHits.length ? '编辑器语料' : '',
      docsHits.length ? '官方教程' : '',
      metadataHits.length ? '元数据' : ''
    ].filter(Boolean)
    return {
      query,
      state: 'editor_only',
      summary: `二态：仅${sourceNames.join('/')}有，DSL 未暴露`,
      side,
      dsl: { server: [], client: [], events: [] },
      editor: editorHits,
      docs: docsHits,
      metadata: metadataHits
    }
  }

  return {
    query,
    state: 'not_found',
    summary: '三态：不存在/未解析（本地语料均无命中）',
    side: undefined,
    dsl: { server: [], client: [], events: [] },
    editor: [],
    docs: [],
    metadata: []
  }
}

function formatMethod(m: MethodInfo) {
  return `  ${path.relative(ROOT, m.file)}:${m.line}  ${m.className}.${m.signature}`
}

function formatResult(r: LookupResult) {
  const lines: string[] = []
  lines.push(`QUERY: ${r.query}`)
  lines.push(`STATE: ${r.state} — ${r.summary}`)
  if (r.side) lines.push(`SIDE:  ${r.side}`)
  if (r.hint) lines.push(`HINT:  ${r.hint}`)

  if (r.dsl.server.length) {
    lines.push('SERVER DSL:')
    for (const m of r.dsl.server) lines.push(formatMethod(m))
  }
  if (r.dsl.client.length) {
    lines.push('CLIENT DSL:')
    for (const m of r.dsl.client) lines.push(formatMethod(m))
  }
  if (r.dsl.events.length) {
    lines.push('SERVER EVENTS (on() API):')
    for (const e of r.dsl.events) {
      lines.push(`  ${e.eventName}  (${path.relative(ROOT, e.aliasFile)}:${e.aliasLine || '?'})`)
    }
  }
  if (r.editor.length) {
    lines.push('EDITOR NAMES:')
    for (const n of r.editor) {
      lines.push(
        `  genericId=${n.genericId}  zh=${n.nameZh ?? ''}  en=${n.nameEn ?? ''}  pins=${n.pins?.length ?? 0}`
      )
    }
  }
  if (r.docs.length) {
    lines.push('OFFICIAL DOCS:')
    for (const d of r.docs) {
      lines.push(`  [${d.language}] ${d.title}/${d.section}/${d.nodeName}  (${d.slug})`)
    }
  }
  if (r.metadata.length) {
    lines.push('METADATA:')
    for (const m of r.metadata) {
      lines.push(
        `  ${m.source}  genericId=${m.genericId ?? '-'}${m.subType ? ` subType=${m.subType}` : ''}${
          m.nodeType ? ` nodeType=${m.nodeType}` : ''
        }${m.displayName ? ` displayName=${m.displayName}` : ''}`
      )
    }
  }
  return lines.join('\n')
}

function samples() {
  const queries = [
    ['添加单位状态', '期望一态：DSL 可用（server）'],
    ['Add Unit Status', '期望一态：DSL 可用（server/client 均有编辑器条目）'],
    ['addUnitStatus', '期望一态：DSL 可用（server 方法名直达）'],
    ['打印字符串', '期望一态或二态：server DSL printString'],
    ['设置实体阵营', '期望二态：编辑器有但 DSL 未暴露（server 侧）'],
    ['移动速率调整率（动态）', '期望四态：非节点状态效果配置名'],
    ['定时触发技能', '期望四态：非节点状态效果配置名'],
    ['abcdefghijklm', '期望三态：不存在']
  ]
  return queries.map(([q, expect]) => `# ${q}\n期望：${expect}\n${formatResult(resolve(q))}\n`).join('\n')
}

function matrix() {
  const nodes = editorNames().nodes
  const serverMethods = serverMethodMap()
  const clientMethods = clientMethodMap()

  let serverDsl = 0
  let serverOnly = 0
  let clientDsl = 0
  let clientOnly = 0
  const serverOnlyExamples: Array<{ id: number; zh: string; en: string }> = []
  const clientOnlyExamples: Array<{ id: number; zh: string; en: string }> = []

  for (const node of nodes) {
    const editorZh = node.nameZh ?? ''
    const editorEn = node.nameEn ?? ''
    const candidate = editorNameToMethodName(editorEn)
    const isServer = node.genericId < 200000
    const isClient = node.genericId >= 200000

    const serverHit =
      Boolean(editorZh && SERVER_F_ZH_TO_EN[editorZh as keyof typeof SERVER_F_ZH_TO_EN]) ||
      Boolean(editorZh && SERVER_EVENT_ZH_TO_EN[editorZh as keyof typeof SERVER_EVENT_ZH_TO_EN]) ||
      Boolean(candidate && SERVER_F_EN_TO_ZH[candidate as keyof typeof SERVER_F_EN_TO_ZH]) ||
      Boolean(candidate && SERVER_EVENT_EN_TO_ZH[candidate as keyof typeof SERVER_EVENT_EN_TO_ZH]) ||
      serverMethods.has(candidate) ||
      serverMethods.has(editorZh)
    const clientHit =
      Object.values(CLIENT_F_ZH_TO_EN_BY_SUB_TYPE).some(
        (map) => (map as Record<string, string>)[editorZh] !== undefined
      ) || clientMethods.has(candidate)

    if (isServer) {
      if (serverHit) serverDsl++
      else {
        serverOnly++
        serverOnlyExamples.push({ id: node.genericId, zh: editorZh, en: editorEn })
      }
    }
    if (isClient) {
      if (clientHit) clientDsl++
      else {
        clientOnly++
        clientOnlyExamples.push({ id: node.genericId, zh: editorZh, en: editorEn })
      }
    }
  }

  const lines: string[] = []
  lines.push('# 编辑器节点 vs DSL 暴露能力矩阵（轻量）')
  lines.push('')
  lines.push('> 自动生成：`npx tsx .agents/skills/dsl-nodegraph-development/scripts/lookup-node.ts --matrix`')
  lines.push('> 口径：`resources/mihoyo_editor_names.json` 的 799 个编辑器节点；server < 200000，client >= 200000。')
  lines.push('> DSL 已暴露 = 命中 `src/definitions/nodes.ts` / `src/definitions/client_nodes.ts` / `src/definitions/zh_aliases.ts` 对应方法或事件别名。')
  lines.push('')
  lines.push('| 侧 | 编辑器节点数 | DSL 已暴露 | 仅编辑器/未暴露 | 缺失率 |')
  lines.push('| --- | ---: | ---: | ---: | ---: |')
  lines.push(`| server | ${nodes.filter((n) => n.genericId < 200000).length} | ${serverDsl} | ${serverOnly} | ${(serverOnly / Math.max(1, nodes.filter((n) => n.genericId < 200000).length) * 100).toFixed(1)}% |`)
  lines.push(`| client | ${nodes.filter((n) => n.genericId >= 200000).length} | ${clientDsl} | ${clientOnly} | ${(clientOnly / Math.max(1, nodes.filter((n) => n.genericId >= 200000).length) * 100).toFixed(1)}% |`)
  lines.push('')
  lines.push('## Server 未暴露清单（二态候选）')
  lines.push('')
  for (const e of serverOnlyExamples) {
    lines.push(`- genericId=${e.id} ${e.zh} / ${e.en}`)
  }
  lines.push('')
  lines.push('## Client 未暴露清单（二态候选）')
  lines.push('')
  for (const e of clientOnlyExamples) {
    lines.push(`- genericId=${e.id} ${e.zh} / ${e.en}`)
  }
  lines.push('')
  lines.push('## 使用')
  lines.push('')
  lines.push('写 DSL 前对拿不准的节点/术语先跑：')
  lines.push('```bash')
  lines.push('npx tsx .agents/skills/dsl-nodegraph-development/scripts/lookup-node.ts "<中文名/英文名/方法名/genericId>"')
  lines.push('```')
  lines.push('')
  return lines.join('\n')
}

function main() {
  const args = process.argv.slice(2)
  if (args.includes('--samples')) {
    console.log(samples())
    return
  }
  if (args.includes('--matrix')) {
    console.log(matrix())
    return
  }
  const query = args.find((a) => !a.startsWith('--'))
  if (!query) {
    console.error('Usage: npx tsx lookup-node.ts "<query>" [--json]')
    console.error('       npx tsx lookup-node.ts --samples')
    console.error('       npx tsx lookup-node.ts --matrix')
    process.exit(1)
  }
  const result = resolve(query)
  if (args.includes('--json')) {
    console.log(JSON.stringify(result, null, 2))
  } else {
    console.log(formatResult(result))
  }
}

main()
