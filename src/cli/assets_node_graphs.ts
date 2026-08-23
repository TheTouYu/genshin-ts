import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { loadGstsConfig } from '../compiler/config_loader.js'
import type { GstsConfig, GstsInjectConfig } from '../compiler/gsts_config.js'
import { buildFile, readUint32BE } from '../injector/binary.js'
import { resolveGilTarget } from './gil_paths.js'
import { sha256Bytes } from './static_assembly/json.js'
import {
  emitWireMessage,
  parseWireMessage,
  printableWireText,
  type WireField
} from './static_assembly/wire.js'
import {
  addCompositePin,
  addGraphNode,
  addOutParam,
  addGraphVariable,
  addInflowFlow,
  addOutFlow,
  appendOutFlow,
  addParamFlow,
  compositeImplGraphId,
  buildVarValue,
  chooseMovedIndex,
  chooseRebuildIndex,
  clearGraphNodes,
  copyGraphNode,
  copyGraphNodesFromBlob,
  createComposite,
  deleteCompositeDef,
  delCompositePin,
  delGraphNode,
  delInstanceCompositePin,
  delParamFlow,
  flowMetas,
  isCompositeInstance,
  linkInParam,
  listCompositeDefs,
  listCompositeCategories,
  compositeCategoryName,
  setCompositeCategory,
  clearCompositeCategory,
  compositeNodeBudget,
  listGraphs,
  locateBlobField,
  validateNodeGraphs,
  locateGraphField,
  nodeInputConcreteType,
  nodeInputType,
  nodeInputTypeName,
  nodeName,
  nodeOutputTypeName,
  PIN_KIND,
  parseGraphNodes,
  parseNodeRecord,
  parseTypedValue,
  patchGraphNode,
  patchRecord,
  removeOutFlow,
  renameCompositeDef,
  renameParamFlow,
  renumberGraphNode,
  hasReflectMap,
  reflectConcreteIndex,
  resolveDefId,
  resolveGraphId,
  setNodePos,
  setCasesList,
  setParam,
  swapCompositePinInners,
  swapInstancePins,
  swapParamFlows,
  unlinkInParam,
  VAR_TYPE_NAME,
  wrapConcreteValue,
  type NodeView,
  type PinView
} from './static_assembly/graph_edit.js'
import { autoLayout, checkLayout, planFlowUpgrade } from './static_assembly/graph_layout.js'

const KIND_NAMES: Record<number, string> = { 1: 'InFlow', 2: 'OutFlow', 3: 'InParam', 4: 'OutParam', 5: 'ClientExec', 6: 'ClientSignal' }
const VAR_TYPE_NAME_REV: Record<string, number> = Object.fromEntries(
  Object.entries(VAR_TYPE_NAME).map(([k, v]) => [v.toLowerCase(), Number(k)])
)

/** 提取图 blob（供 composite 操作扫描实例）。 */
function graphBlob(bytes: Uint8Array, graphId: number): Uint8Array {
  const payload = bytes.slice(20, -4)
  const { field } = locateGraphField(payload, graphId)
  return payload.subarray(field.dataStart, field.dataEnd)
}

/** 提取 CompositeDef blob（供 del-input 查 pinIndex）。 */
function defBlob(bytes: Uint8Array, defId: number): Uint8Array {
  const payload = bytes.slice(20, -4)
  const field = locateBlobField(payload, 2, defId)
  return payload.subarray(field.dataStart, field.dataEnd)
}

// 依据（编辑器真实证据，见 docs/game-engine-knowledge/gil-structure-semantics.md）：
//   - root 10 追加一条 field 1 wrapper：{id:{class:10000,type:20000,kind:21001,nodeId}, name}
//   - root 6 的 "未分类页签" 聚合 record（顶层 #1=4）追加 #5 {typeValue:800, id:图ID}
//   - root 46 等长变化语义 INSUFFICIENT，不模拟
const DEFAULT_GRAPH_ID = 1073741825
const GRAPH_CLASS = 10000
const GRAPH_TYPE = 20000
const GRAPH_KIND = 21001
const FOLDER_TYPE_SERVER_GRAPH = 800 // DEFAULT_GRAPH_TYPE_VALUES: 20000 -> 800

// 最小 root 6：编辑器新图首次保存才有完整 records（33 条模板/元件目录）；
// 占位节点图只需“未分类页签”聚合 record（#1=4，tab 含“未分类页签”），
// folder entry 挂载点；编辑器打开保存后自会补全其余 records（与 maps:create 同构）
export function minimalFolderRoot6(): Uint8Array {
  const rootTab = emitWireMessage([
    { number: 1, wire: 2, value: new TextEncoder().encode('root') },
    { number: 3, wire: 0, value: 1 }
  ])
  const tab = emitWireMessage([
    { number: 1, wire: 2, value: new TextEncoder().encode('未分类页签') },
    { number: 3, wire: 0, value: 2 }
  ])
  const record = emitWireMessage([
    { number: 1, wire: 0, value: 4 },
    { number: 2, wire: 2, value: rootTab },
    { number: 3, wire: 2, value: tab }
  ])
  return emitWireMessage([{ number: 1, wire: 2, value: record }])
}

type RootContext = { projectConfigPath?: string; projectConfig?: GstsConfig }

type Args = {
  sub: 'create' | 'read' | 'patch' | 'layout' | 'validate' | 'nodes' | 'def-clean'
  gilPath: string | undefined
  mapId: number | undefined
  name: string
  outputPath: string | undefined
  write: boolean
  json: boolean
  graph: string | undefined
  node: number | undefined
  composite: string | undefined
  category: string | undefined
  srcGil: string | undefined
  ops: string[]
  layoutCheck: boolean
  defs: string[]
  allUnused: boolean
  includeSystem: boolean
  force: boolean
  dryRun: boolean
}

function usage(exitCode = 0): never {
  const output = [
    'Usage: gsts assets:node-graphs <sub> [options]',
    '',
    '  create                       create an empty NodeGraph (root 10 wrapper + root 6 folder)',
    '  read                         inspect graphs / nodes / pins / connections / composite defs',
    '  patch                        apply precise node-graph edits (preview by default)',
  '  layout                       auto-layout / lint a graph (--check = lint only)',
  '  validate                     check R<T> concreteId/pin consistency, variable names, skill-graph node guard',
  '  def-clean                    remove unused composite definitions (dry-run by default)',
    '',
    'Options:',
    '  --config <file>   project config (for --map-id resolution)',
    '  --gil <file>      explicit GIL source',
    '  --map-id <id>     target map ID (location only; requires project config)',
    '  --name <string>   create: new NodeGraph name (default: 新建节点图)',
    '  --graph <id|name> read/patch: target node graph (default: first graph)',
    '  --src-gil <file>   patch: source GIL for node-copy-from (cross-graph copy)',
    '  --node <n>        read: single node detail',
    '  --composite <id|name>  read: composite def detail (含分类)',
    '  --category <name>    read: 仅列出指定分类下的复合',
    '  nodes                  节点预算：复合调用递归展开计数（游戏限制 3000）',
    '  --json            read: machine-readable output',
    '  --output <file>   patch/def-clean: write result to a new file (no overwrite)',
    '  --write           patch/def-clean: write source GIL after backup',
    '  --dry-run         def-clean: show what would be removed without writing (default)',
    '  --all-unused      def-clean: remove every composite definition with no callers',
    '  --include-system  def-clean: include built-in signal composite defs in --all-unused',
    '  --force           def-clean: allow explicit defs even if they still have callers (dangerous)',
    '  -h, --help        show help',
    '',
    'patch ops (order matters, applied sequentially):',
    '  node <idx> pos <x> <y>                 set node position',
    '  node <idx> cases <v1,v2,...>       set MultiBranch cases list (IntegerList, full replace)',
    '  node <idx> param <shell> <typed>       set InParam value (int:1 flt:1.5 str:abc bool:true vec:1,2,3 gid:1 pfb:1 cfg:1)',
    '  node <idx> link <shell> <src-idx> [src-shell]   data connection to InParam shell',
    '  node <idx> unlink <shell>              remove data connection (Fixed: remove pin / Variant: clear connects)',
    '  node-add <generic-id> [concrete-id] <x> <y>   add node (Variant when concrete-id given; min free index)',
    '  node-copy <src-idx> <x> <y>             copy node with all pins/values (editor paste semantics)',
    '  node-copy-from <src-gid> <idx1,idx2,...> <x> <y>   copy nodes from another graph in --src-gil',
    '                                      (keeps relative layout, remaps intra-list links;',
    '                                      links to nodes outside the list fail closed)',
    '  node-del <idx>                          remove node record (def stays)',
    '  graph-clear                             remove ALL nodes (graph record/variables kept)',
    '  graph-var-add <name> <type>              register graph variable (only Str=6 closed)',
    '  node <idx> flow <shell> <dst-idx> [dst-shell]   control-flow connection from OutFlow shell',
    '  node <idx> flow-rm <shell> <target>    disconnect control-flow from OutFlow shell to target node',
    '  composite <def-id> rename <name>       rename composite definition',
    '  composite <def-id> category <名称|clear>  set/clear composite category (名称可含路径 复合节点/xxx)',
    '  composite <def-id> param <kind> <shell> rename <name>   kind=input|output|inflow|outflow',
    '  composite <def-id> add-input <shell> <name> <type> <inner-node> <inner-shell>  add input param from impl pin (type=int|flt|str|bool|gid|ety; renumbers instance unless already at min free)',
    '  composite <def-id> add-inflow <shell> <name> <inner-node> <inner-shell>  add InFlow entry (def flow + impl compositePin; instance untouched)',
    '  composite create <name> <anchor-idx> <node-idx...>  wrap selected nodes into a new composite',
    '      (anchor stays in place as the instance, other nodes move into the impl graph;',
    '      control-flow OutFlows auto-lift to composite outflows; data inputs stay inside)',
    '  composite <def-id> del-input <shell>                remove composite input (def flow + compositePin + instance pin; instance renumbered)',
    '  composite <def-id> swap-input <a> <b>               swap two composite inputs (def flows + compositePins + instance pins; instance renumbered)',
    '      (del/swap renumber = min free excluding current slot; cross-round tombstones without session history may differ from editor)',
    '',
    'Examples:',
    '  gsts assets:node-graphs read --gil map.gil --graph 1073741836',
    '  gsts assets:node-graphs read --gil map.gil --graph 样本-01 --node 24 --json',
    '  gsts assets:node-graphs patch --gil map.gil --graph 1073741836 node 24 link 1 12',
    '  gsts assets:node-graphs patch --gil map.gil --graph 1073741836 node 4 param 0 pfb:1234 --write',
    '  gsts assets:node-graphs patch --gil map.gil composite 1610612744 rename 我的复合 --write',
    '  gsts assets:node-graphs patch --gil map.gil --graph 1073741836 composite create 我的复合 1 1 11',
    '  gsts assets:node-graphs patch --gil map.gil composite 1610612744 del-input 2',
    '  gsts assets:node-graphs patch --gil map.gil composite 1610612744 swap-input 0 1',
    '  gsts assets:node-graphs def-clean --gil map.gil --all-unused --dry-run',
    '  gsts assets:node-graphs def-clean --gil map.gil --all-unused --write',
    '  gsts assets:node-graphs def-clean --gil map.gil 1610700029 --dry-run'
  ].join('\n')
  console[exitCode === 0 ? 'log' : 'error'](output)
  process.exit(exitCode)
}

function value(argv: readonly string[], index: number): string {
  const result = argv[index + 1]
  if (!result || result.startsWith('--')) usage()
  return result
}

function parseArgs(argv: readonly string[]): Args {
  let sub: Args['sub'] = 'create'
  let gilPath: string | undefined
  let mapId: number | undefined
  let name = '新建节点图'
  let outputPath: string | undefined
  let write = false
  let json = false
  let graph: string | undefined
  let node: number | undefined
  let composite: string | undefined
  let category: string | undefined
  let srcGil: string | undefined
  let layoutCheck = false
  const ops: string[] = []
  const defs: string[] = []
  let allUnused = false
  let includeSystem = false
  let force = false
  let dryRun = false
  let index = 0
  if (argv[0] === 'create' || argv[0] === 'read' || argv[0] === 'patch' || argv[0] === 'layout' || argv[0] === 'validate' || argv[0] === 'nodes' || argv[0] === 'def-clean')
    sub = argv[0] as Args['sub'], index++
  for (; index < argv.length; index++) {
    const arg = argv[index]
    if (arg === '--gil') gilPath = value(argv, index++)
    else if (arg === '--map-id') mapId = Number(value(argv, index++))
    else if (arg === '--name') name = value(argv, index++)
    else if (arg === '--output') outputPath = value(argv, index++)
    else if (arg === '--write') write = true
    else if (arg === '--json') json = true
    else if (arg === '--graph') graph = value(argv, index++)
    else if (arg === '--src-gil') srcGil = value(argv, index++)
    else if (arg === '--check') layoutCheck = true
    else if (arg === '--node') node = Number(value(argv, index++))
    else if (arg === '--composite') composite = value(argv, index++)
    else if (arg === '--category') category = value(argv, index++)
    else if (arg === '--all-unused') allUnused = true
    else if (arg === '--include-system') includeSystem = true
    else if (arg === '--force') force = true
    else if (arg === '--dry-run') dryRun = true
    else if (arg === '--help' || arg === '-h') usage(0)
    else if (sub === 'patch') ops.push(arg)
    else if (sub === 'def-clean' && !arg.startsWith('--')) defs.push(arg)
    else usage()
  }
  if (sub === 'create' && ops.length) usage()
  if (sub === 'nodes' && ops.length) usage()
  if (sub === 'patch' && !ops.length) usage()
  if (sub === 'layout' && !graph) usage()
  if (gilPath && mapId !== undefined)
    throw new Error('[error] --gil and --map-id are mutually exclusive')
  if (write && outputPath) throw new Error('[error] --write and --output are mutually exclusive')
  if (sub === 'create' && (graph || node || composite || json))
    throw new Error('[error] create does not accept --graph/--node/--composite/--json')
  if (sub === 'layout' && (node || composite || srcGil || ops.length))
    throw new Error('[error] layout does not accept --node/--composite/--src-gil/ops')
  if (sub === 'def-clean' && defs.length === 0 && !allUnused)
    throw new Error('[error] def-clean needs at least one <id|name> or --all-unused')
  if (sub === 'def-clean' && defs.length > 0 && allUnused)
    throw new Error('[error] def-clean cannot combine explicit defs with --all-unused')
  if (sub === 'def-clean' && (graph || node || composite || category || srcGil || ops.length))
    throw new Error('[error] def-clean does not accept --graph/--node/--composite/--category/--src-gil/ops')
  return { sub, gilPath, mapId, name, outputPath, write, json, graph, node, composite, category, srcGil, ops, layoutCheck, defs, allUnused, includeSystem, force, dryRun }
}

// 自动分配下一个节点图 ID：扫描地图已有图 ID，取 max+1；一个都没有时用固定起始值
// （真实编辑器证据：10+ 张地图最小图 ID 均为 1073741825；1840 的 1825→1836→1856→1870
//  与 1845 删 1825 后新建从 1826 起，均为 max+1 不复用空洞）
export function nextGraphId(payload: Uint8Array): number {
  const root = readRoot(payload)
  const top10 = root.find((f) => f.number === 10 && f.wire === 2)
  if (!top10) return DEFAULT_GRAPH_ID
  const root10 = parseWireMessage(top10.value as Uint8Array)!
  const ids = root10
    .filter((f) => f.number === 1 && f.wire === 2)
    .map((f) => graphIdOf(f.value as Uint8Array))
    .filter((id): id is number => typeof id === 'number')
  return ids.length ? Math.max(...ids) + 1 : DEFAULT_GRAPH_ID
}

function readRoot(payload: Uint8Array): WireField[] {
  const root = parseWireMessage(payload)
  if (!root) throw new Error('[error] malformed GIL payload')
  return root
}

function textOf(fields: readonly WireField[], number: number): string | undefined {
  const f = fields.find((x) => x.number === number && x.wire === 2)
  return f ? printableWireText(f.value as Uint8Array) : undefined
}

function varintOf(fields: readonly WireField[], number: number): number | undefined {
  const f = fields.find((x) => x.number === number && x.wire === 0)
  return typeof f?.value === 'number' ? f.value : undefined
}

function graphIdOf(record: Uint8Array): number | undefined {
  const inner = parseWireMessage(record)
  const nodeGraph = inner?.find((f) => f.number === 1 && f.wire === 2)
  if (!nodeGraph) return undefined
  const ng = parseWireMessage(nodeGraph.value as Uint8Array)
  const id = ng?.find((f) => f.number === 1 && f.wire === 2)
  if (!id) return undefined
  const idMsg = parseWireMessage(id.value as Uint8Array)
  const nodeId = idMsg?.find((f) => f.number === 5 && f.wire === 0)
  return typeof nodeId?.value === 'number' ? nodeId.value : undefined
}

function appendGraphWrapper(root10: WireField[], graphId: number, name: string): WireField[] {
  const idMsg: WireField[] = [
    { number: 1, wire: 0, value: GRAPH_CLASS },
    { number: 2, wire: 0, value: GRAPH_TYPE },
    { number: 3, wire: 0, value: GRAPH_KIND },
    { number: 5, wire: 0, value: graphId }
  ]
  const nodeGraph = emitWireMessage([
    { number: 1, wire: 2, value: emitWireMessage(idMsg) },
    { number: 2, wire: 2, value: new TextEncoder().encode(name) }
  ])
  // root10.1 记录 = {1: NodeGraph}，NodeGraph = {1: Id, 2: name}
  return [
    ...root10,
    { number: 1, wire: 2, value: emitWireMessage([{ number: 1, wire: 2, value: nodeGraph }]) }
  ]
}

function appendFolderEntry(root6: WireField[], graphId: number): WireField[] {
  const records = root6.filter((f) => f.number === 1 && f.wire === 2)
  let folderRecord: WireField | undefined
  for (const rec of records) {
    const inner = parseWireMessage(rec.value as Uint8Array)
    if (!inner || varintOf(inner, 1) !== 4) continue
    const tab = inner.find((f) => f.number === 3 && f.wire === 2)
    const tabFields = tab ? parseWireMessage(tab.value as Uint8Array) : undefined
    if (tabFields && textOf(tabFields, 1) === '未分类页签') {
      folderRecord = rec
      break
    }
  }
  if (!folderRecord) {
    throw new Error('[error] root6 record #1=4 with "未分类页签" not found in this map')
  }
  const inner = parseWireMessage(folderRecord.value as Uint8Array)!
  const rebuilt = inner.map((f) => {
    if (f.number !== 3 || f.wire !== 2) return f
    const tab = parseWireMessage(f.value as Uint8Array)!
    const entry: WireField[] = [
      { number: 1, wire: 0, value: FOLDER_TYPE_SERVER_GRAPH },
      { number: 2, wire: 0, value: graphId }
    ]
    const nextTab = [...tab, { number: 5, wire: 2, value: emitWireMessage(entry) }]
    return { ...f, value: emitWireMessage(nextTab) }
  })
  const rebuiltBytes = emitWireMessage(rebuilt)
  return root6.map((f) => (f === folderRecord ? { ...f, value: rebuiltBytes } : f))
}

// 补最小 root 6/10 挂载容器（全新骨架地图没有这两层，游戏会加载失败——round4 事故）；
// 与 buildEmptyNodeGraph 同构，编辑器打开保存后自会补全其余 records
// root 6 = minimalFolderRoot6()（“未分类页签”聚合 record，暂无图条目）；root 10 = {7:1}
export function ensureMinimalContainers(payload: Uint8Array): Uint8Array {
  const root = readRoot(payload)
  if (
    root.some((f) => f.number === 6 && f.wire === 2) &&
    root.some((f) => f.number === 10 && f.wire === 2)
  ) {
    return payload
  }
  const next = [...root]
  if (!next.some((f) => f.number === 6 && f.wire === 2)) {
    next.push({ number: 6, wire: 2, value: minimalFolderRoot6() })
  }
  if (!next.some((f) => f.number === 10 && f.wire === 2)) {
    next.push({ number: 10, wire: 2, value: emitWireMessage([{ number: 7, wire: 0, value: 1 }]) })
  }
  return emitWireMessage(next)
}

export function buildEmptyNodeGraph(
  payload: Uint8Array,
  graphId: number,
  name: string
): Uint8Array {
  const root = readRoot(ensureMinimalContainers(payload))
  const nextRoot = root.map((field) => {
    if (field.wire !== 2) return field
    if (field.number === 10) {
      const root10 = parseWireMessage(field.value as Uint8Array)!
      const hasId = root10.some(
        (f) => f.number === 1 && f.wire === 2 && graphIdOf(f.value as Uint8Array) === graphId
      )
      if (hasId) throw new Error(`[error] graph ${graphId} already exists in root 10`)
      return { ...field, value: emitWireMessage(appendGraphWrapper(root10, graphId, name)) }
    }
    if (field.number === 6) {
      const root6 = parseWireMessage(field.value as Uint8Array)!
      return { ...field, value: emitWireMessage(appendFolderEntry(root6, graphId)) }
    }
    return field
  })
  return emitWireMessage(nextRoot)
}

function verifyNodeGraphReadBack(bytes: Uint8Array, graphId: number): void {
  const root = readRoot(bytes.slice(20, -4))
  const top10Field = root.find((f) => f.number === 10 && f.wire === 2)
  if (!top10Field) throw new Error('[error] read-back: root 10 missing after create')
  const top10 = parseWireMessage(top10Field.value as Uint8Array)!
  const found = top10
    .filter((f) => f.number === 1 && f.wire === 2)
    .some((f) => graphIdOf(f.value as Uint8Array) === graphId)
  if (!found) throw new Error('[error] read-back: graph wrapper missing in root 10')
  const top6Field = root.find((f) => f.number === 6 && f.wire === 2)
  if (!top6Field) throw new Error('[error] read-back: root 6 missing after create')
  const top6 = parseWireMessage(top6Field.value as Uint8Array)!
  const hasFolder = top6
    .filter((f) => f.number === 1 && f.wire === 2)
    .some((f) => {
      const inner = parseWireMessage(f.value as Uint8Array)
      if (varintOf(inner ?? [], 1) !== 4) return false
      const tab = inner?.find((g) => g.number === 3 && g.wire === 2)
      const tabMsg = tab ? parseWireMessage(tab.value as Uint8Array) : undefined
      return tabMsg?.some(
        (g) =>
          g.number === 5 &&
          g.wire === 2 &&
          parseWireMessage(g.value as Uint8Array)?.some(
            (e) => e.number === 2 && e.wire === 0 && e.value === graphId
          )
      )
    })
  if (!hasFolder) throw new Error('[error] read-back: folder entry missing in root 6')
}

function resolveGilPath(
  projectConfig: GstsConfig | undefined,
  args: Args
): { path: string; mapId: number } {
  if (args.gilPath) {
    const absolute = path.resolve(args.gilPath)
    return { path: absolute, mapId: args.mapId ?? Number(path.basename(absolute, '.gil')) }
  }
  const inject: GstsInjectConfig = { ...(projectConfig?.inject ?? {}) }
  if (args.mapId !== undefined) inject.mapId = args.mapId
  if (inject.mapId === undefined) {
    throw new Error(
      '[error] mapId is required; use --gil, or provide --map-id with a project config'
    )
  }
  const target = resolveGilTarget(inject)
  return { path: target.gilPath, mapId: target.mapId }
}

export async function runAssetsNodeGraphs(
  argv: readonly string[] = process.argv.slice(2),
  rootContext: RootContext = {}
): Promise<void> {
  const args = parseArgs(argv)
  let projectConfig = rootContext.projectConfig
  if (!projectConfig && rootContext.projectConfigPath) {
    projectConfig = await loadGstsConfig(rootContext.projectConfigPath, { profile: 'project' })
  }
  const source = resolveGilPath(projectConfig, args)
  const gil = source.path
  const sourceBytes = new Uint8Array(fs.readFileSync(gil))
  if (args.sub === 'read') {
    runRead(sourceBytes, gil, args)
    return
  }
  if (args.sub === 'nodes') {
    runNodes(sourceBytes, gil, args)
    return
  }
  if (args.sub === 'patch') {
    runPatch(sourceBytes, gil, args)
    return
  }
  if (args.sub === 'layout') {
    runLayout(sourceBytes, gil, args)
    return
  }
  if (args.sub === 'validate') {
    const issues = validateNodeGraphs(sourceBytes)
    const errors = issues.filter((it) => !it.warn)
    if (errors.length === 0) console.log('validate: OK（R<T> concreteId 与 pin indexOfConcrete 全部一致）')
    for (const it of issues) {
      console.log(`${it.warn ? '[warn]' : '[error]'} graph ${it.graphId} node ${it.node}: ${it.message}`)
    }
    if (issues.length > 0) console.log(`validate: ${errors.length} error(s), ${issues.length - errors.length} warning(s)`)
    if (errors.length > 0) process.exitCode = 1
    return
  }
  if (args.sub === 'def-clean') {
    runDefClean(sourceBytes, gil, args)
    return
  }
  const sourceSha = sha256Bytes(sourceBytes)
  const payload = sourceBytes.slice(20, -4)
  const graphId = nextGraphId(payload)
  const result = buildEmptyNodeGraph(payload, graphId, args.name)
  const header = {
    schema: readUint32BE(sourceBytes, 4),
    headTag: readUint32BE(sourceBytes, 8),
    fileType: readUint32BE(sourceBytes, 12),
    tailTag: readUint32BE(sourceBytes, sourceBytes.length - 4)
  }
  const newFile = buildFile(result, header)
  const candidateSha = sha256Bytes(newFile)
  verifyNodeGraphReadBack(newFile, graphId)

  if (args.write) {
    const nowSha = sha256Bytes(new Uint8Array(fs.readFileSync(gil)))
    if (nowSha !== sourceSha) throw new Error('[error] source GIL changed since read; aborting write')
    const backupDir = path.join(path.dirname(gil), '.gsts', 'backups')
    fs.mkdirSync(backupDir, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const backup = path.join(backupDir, `${path.basename(gil)}.${stamp}.new-graph.bak`)
    fs.copyFileSync(gil, backup)
    fs.writeFileSync(gil, newFile)
    console.log(`backup=${backup}`)
    console.log(`written=${gil}`)
  } else if (args.outputPath) {
    const absolute = path.resolve(args.outputPath)
    if (fs.existsSync(absolute)) throw new Error(`[error] output already exists: ${absolute}`)
    fs.mkdirSync(path.dirname(absolute), { recursive: true })
    fs.writeFileSync(absolute, newFile)
    console.log(`written=${absolute}`)
  } else {
    console.log(`preview=${gil}`)
  }
  console.log(
    `graphId=${graphId} name=${args.name} sourceSha256=${sourceSha} ` +
      `candidateSha256=${candidateSha} size=${sourceBytes.length}->${newFile.length}`
  )
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  runAssetsNodeGraphs().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}

// ==================== read / patch 子命令 ====================

function pinText(pin: PinView): string {
  const parts = [`${KIND_NAMES[pin.kind] ?? pin.kind}[${pin.index}]`]
  if (pin.type !== undefined) parts.push(VAR_TYPE_NAME[pin.type] ?? `T${pin.type}`)
  if (pin.valueText && pin.valueText !== '未设置') parts.push(`= ${pin.valueText}`)
  if (pin.compositePinIndex !== undefined) parts.push(`cpi=${pin.compositePinIndex}`)
  for (const c of pin.connects) {
    parts.push(`→ n${c.id} ${KIND_NAMES[c.kind] ?? c.kind}[${c.index ?? 0}]`)
  }
  return parts.join(' ')
}

function nodeText(n: NodeView, bytes: Uint8Array): string {
  const defName = listCompositeDefs(bytes).find((d) => d.id === n.genericId)?.name
  const name = defName ? `复合:${defName}` : (nodeName(n.genericId) ?? `API#${n.genericId}`)
  const cid = n.concreteId !== undefined && n.concreteId !== n.genericId ? ` cid=${n.concreteId}` : ''
  return `n=${n.index} ${name} (${n.genericId}${cid}) pos=(${n.x},${n.y})`
}

function runRead(bytes: Uint8Array, gil: string, args: Args): void {
  if (args.composite !== undefined) {
    const defId = resolveDefId(bytes, args.composite)
    const payload = bytes.slice(20, -4)
    const field = locateBlobField(payload, 2, defId)
    const blob = payload.subarray(field.dataStart, field.dataEnd)
    const metas = flowMetas(blob)
    // 2026-08-19 优化：--composite 直接带出 impl 图节点详情（读复合内部 wire 免二次 --graph 找空名 impl 图）
    let implGraph: number | undefined
    let implNodes: NodeView[] = []
    try {
      implGraph = compositeImplGraphId(payload, defId)
      const { field: implField } = locateGraphField(payload, implGraph)
      const implBlob = payload.subarray(implField.dataStart, implField.dataEnd)
      implNodes = parseGraphNodes(implBlob)
    } catch {
      // def 无 impl 图（异常/占位）时保持旧输出，不破坏既有用法
    }
    if (args.json) {
      console.log(
        JSON.stringify(
          {
            gil,
            compositeDef: defId,
            category: compositeCategoryName(bytes, defId),
            flows: metas,
            implGraph,
            implNodes
          },
          null,
          2
        )
      )
      return
    }
    console.log(`composite def ${defId} [分类: ${compositeCategoryName(bytes, defId)}]`)
    for (const m of metas) {
      const type = m.type !== undefined ? (VAR_TYPE_NAME[m.type] ?? `T${m.type}`) : ''
      console.log(`  ${KIND_NAMES[m.kind] ?? m.kind}[${m.shell}] ${m.name ?? '(无名)'}${type ? ' ' + type : ''} pinIndex=${m.pinIndex ?? '?'}`)
    }
    if (implGraph !== undefined) {
      console.log(`impl graph ${implGraph} (${implNodes.length} nodes)`)
      for (const n of implNodes) {
        console.log(nodeText(n, bytes))
        for (const pin of n.pins) console.log(`    ${pinText(pin)}`)
      }
    }
    return
  }
  if (args.graph === undefined) {
    const graphs = listGraphs(bytes)
    const defs = listCompositeDefs(bytes)
    if (args.json) {
      console.log(
        JSON.stringify(
          {
            gil,
            graphs,
            composites: defs.map((d) => ({ id: d.id, name: d.name, category: compositeCategoryName(bytes, d.id) }))
          },
          null,
          2
        )
      )
      return
    }
    for (const g of graphs) console.log(`graph ${g.id} ${g.name ?? '(无名)'} nodes=${g.nodeCount}${g.id >= 1073741825 && g.id < 1073741825 + 100 ? '' : ' (impl)'}`)
    console.log(`composites: ${defs.length}${args.category ? ` (按分类 "${args.category}" 过滤)` : ''}`)
    for (const d of defs) {
      const cat = compositeCategoryName(bytes, d.id)
      if (args.category !== undefined && cat !== args.category && cat !== `复合节点/${args.category}`) continue
      console.log(`  def ${d.id} ${d.name ?? '(无名)'} [${cat}]`)
    }
    return
  }
  const graphId = resolveGraphId(bytes, args.graph)
  const payload = bytes.slice(20, -4)
  const { field } = locateGraphField(payload, graphId)
  const blob = payload.subarray(field.dataStart, field.dataEnd)
  const nodes = parseGraphNodes(blob)
  const want = args.node
  const selected = want !== undefined ? nodes.filter((n) => n.index === want) : nodes
  if (args.json) {
    console.log(JSON.stringify({ gil, graphId, nodes: selected }, null, 2))
    return
  }
  for (const n of selected) {
    console.log(nodeText(n, bytes))
    for (const pin of n.pins) console.log(`    ${pinText(pin)}`)
  }
}

function runNodes(bytes: Uint8Array, gil: string, args: Args): void {
  const root = args.graph ? Number(args.graph) : 1073741825
  const budget = compositeNodeBudget(bytes, root)
  const LIMIT = 3000
  if (args.json) {
    console.log(JSON.stringify({ gil, rootGraphId: root, limit: LIMIT, ...budget }, null, 2))
    return
  }
  const gameCount = Math.round(budget.gameNodeCount)
  const gameOk = gameCount <= LIMIT
  console.log(`节点预算（游戏“节点图数量”公式，限制 ${LIMIT}，rootGraphId=${root}）`)
  console.log(`  游戏节点图数量(预测): ${budget.gameNodeCount.toFixed(2)} → round=${gameCount}  ${gameOk ? '✅ 可进游戏' : '❌ 游戏拒载'}`)
  console.log(`  根图展开(mainExpanded): ${budget.mainExpanded}`)
  console.log(`  可达 impl 展开之和(implTotal): ${budget.implTotal}`)
  console.log(`  根图直接节点: ${budget.direct}`)
  console.log(`  根图复合实例数: ${budget.compositeInstances}`)
  console.log(`  根图未连线复合节点数: ${budget.unconnectedCompositeNodes}`)
  console.log(`  根图 MB case 数: ${budget.mbCases}`)
  console.log(`  根图控制流节点: ${budget.controlNodes} / 数据流节点: ${budget.dataFlowNodes}（被消费 ${budget.dataFlowConsumed} / 未消费 ${budget.dataFlowUnconsumed}）`)
  console.log(`  根图控制流边: ${budget.flowEdges} / 数据流边: ${budget.dataFlowEdges}`)
  console.log(`  主图可达展开总量(engineExpanded): ${budget.engineExpanded}`)
  console.log(`  全部图展开总量(含死代码): ${budget.engineExpandedAll}`)
  console.log(`  所有 impl 展开之和(旧口径): ${budget.implTotal}（即上面的可达 impl 展开之和）`)
  console.log('  展开最大贡献者（>20，仅主图可达）:')
  for (const g of budget.graphs.filter((x) => x.reachable !== false && x.expanded > 20).slice(0, 8)) {
    console.log(`    ${g.name ?? ('graph ' + g.id)}: 直接${g.direct} → 展开${g.expanded}`)
  }
}

const SYSTEM_COMPOSITE_NAMES = new Set(['发送信号', '监听信号', '向服务器节点图发送信号'])

function compositeCallerMap(bytes: Uint8Array): Map<number, Array<{ graphId: number; node: number }>> {
  const defIds = new Set(listCompositeDefs(bytes).map((d) => d.id))
  const callers = new Map<number, Array<{ graphId: number; node: number }>>()
  const payload = bytes.slice(20, -4)
  for (const g of listGraphs(bytes)) {
    const { field } = locateGraphField(payload, g.id)
    for (const n of parseGraphNodes(payload.subarray(field.dataStart, field.dataEnd))) {
      if (!defIds.has(n.genericId)) continue
      const list = callers.get(n.genericId) ?? []
      list.push({ graphId: g.id, node: n.index })
      callers.set(n.genericId, list)
    }
  }
  return callers
}

function runDefClean(bytes: Uint8Array, gil: string, args: Args): void {
  const defs = listCompositeDefs(bytes)
  const defById = new Map(defs.map((d) => [d.id, d]))
  const callers = compositeCallerMap(bytes)
  const targets: Array<{ id: number; name?: string }> = []
  if (args.allUnused) {
    for (const d of defs) {
      if (!args.includeSystem && SYSTEM_COMPOSITE_NAMES.has(d.name ?? '')) continue
      if ((callers.get(d.id)?.length ?? 0) === 0) targets.push({ id: d.id, name: d.name })
    }
  } else {
    for (const ref of args.defs) {
      const id = resolveDefId(bytes, ref)
      targets.push({ id, name: defById.get(id)?.name })
    }
  }
  if (targets.length === 0) {
    console.log('def-clean: no unused composite definitions to remove')
    return
  }

  let result = bytes
  const removed: Array<{ id: number; name?: string }> = []
  for (const t of targets) {
    const refs = callers.get(t.id) ?? []
    if (refs.length > 0 && !args.force) {
      const sample = refs.slice(0, 5).map((c) => `graph ${c.graphId} n${c.node}`).join(', ')
      throw new Error(
        `[error] def ${t.id} ${t.name ?? ''} still referenced by ${refs.length} node(s): ${sample}; remove callers first or use --force`
      )
    }
    if (refs.length > 0) {
      console.log(`[warn] def ${t.id} ${t.name ?? ''} still has ${refs.length} caller(s); --force will leave dangling nodes`)
    }
    result = deleteCompositeDef(result, t.id)
    removed.push(t)
  }

  const sourceSha = sha256Bytes(bytes)
  const candidateSha = sha256Bytes(result)
  if (args.write) {
    const nowSha = sha256Bytes(new Uint8Array(fs.readFileSync(gil)))
    if (nowSha !== sourceSha) throw new Error('[error] source GIL changed since read; aborting write')
    const backupDir = path.join(path.dirname(gil), '.gsts', 'backups')
    fs.mkdirSync(backupDir, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const backup = path.join(backupDir, `${path.basename(gil)}.${stamp}.def-clean.bak`)
    fs.copyFileSync(gil, backup)
    fs.writeFileSync(gil, result)
    console.log(`backup=${backup}`)
    console.log(`written=${gil}`)
  } else if (args.outputPath) {
    const absolute = path.resolve(args.outputPath)
    if (fs.existsSync(absolute)) throw new Error(`[error] output already exists: ${absolute}`)
    fs.mkdirSync(path.dirname(absolute), { recursive: true })
    fs.writeFileSync(absolute, result)
    console.log(`written=${absolute}`)
  } else {
    console.log(`preview=${gil}${args.dryRun ? ' (dry-run)' : ''}`)
  }
  for (const r of removed) {
    console.log(`def-clean: ${r.id} ${r.name ?? '(无名)'}`)
  }
  console.log(
    `defs=${removed.length} sourceSha256=${sourceSha} candidateSha256=${candidateSha} ` +
      `size=${bytes.length}->${result.length}`
  )
}

type InstanceMeta = { defId: number; pinIndex?: number; type?: number }

function instanceMeta(bytes: Uint8Array, node: Uint8Array, shell: number, kind: number): InstanceMeta | undefined {
  if (!isCompositeInstance(node)) return undefined
  const payload = bytes.slice(20, -4)
  const view = parseNodeRecord(node)
  const field = locateBlobField(payload, 2, view.genericId)
  const metas = flowMetas(payload.subarray(field.dataStart, field.dataEnd))
  const meta = metas.find((m) => m.kind === kind && m.shell === shell)
  return { defId: view.genericId, pinIndex: meta?.pinIndex, type: meta?.type }
}

function applyOps(
  bytes: Uint8Array,
  graphId: number,
  section: 1 | 4,
  ops: string[],
  tombstoned: Set<number>,
  src?: { payload: Uint8Array }
): Uint8Array {
  let current = bytes
  let i = 0
  const summary: string[] = []
  while (i < ops.length) {
    const op = ops[i]
    if (op === 'composite') {
      if (ops[i + 1] === 'create') {
        const name = ops[i + 2]
        const anchor = Number(ops[i + 3])
        const nodes = ops.slice(i + 4).map(Number)
        if (name === undefined || !Number.isFinite(anchor) || nodes.length === 0 || nodes.some((n) => !Number.isFinite(n))) {
          throw new Error('[error] composite create <name> <anchor-idx> <node-idx...>')
        }
        current = createComposite(current, graphId, name, nodes, anchor)
        summary.push(`composite create "${name}" anchor=n${anchor} nodes=[${nodes.join(',')}] → def 自动分配`)
        i += 4 + nodes.length
        continue
      }
      const defId = resolveDefId(current, ops[i + 1])
      const verb = ops[i + 2]
      if (verb === 'rename') {
        const name = ops[i + 3]
        if (name === undefined) throw new Error('[error] composite rename needs <name>')
        current = patchRecord(current, 2, defId, (b) => renameCompositeDef(b, name))
        summary.push(`composite ${defId} rename → ${name}`)
        i += 4
        continue
      }
      if (verb === 'category') {
        const target = ops[i + 3]
        if (target === undefined) throw new Error('[error] composite category needs <名称|clear>')
        if (target === 'clear') {
          current = clearCompositeCategory(current, defId)
          summary.push(`composite ${defId} 移回默认分类`)
        } else {
          // 名称支持 "复合节点/复合节点实验" 或只给子名 "复合节点实验"
          const path = target.includes('/') ? target.split('/').filter(Boolean) : ['复合节点', target]
          current = setCompositeCategory(current, defId, path)
          summary.push(`composite ${defId} → 分类 "${path.join('/')}"`)
        }
        i += 4
        continue
      }
      if (verb === 'param') {
        const kindName = ops[i + 3]
        const shell = Number(ops[i + 4])
        if (ops[i + 5] !== 'rename') throw new Error('[error] composite param <kind> <shell> rename <name>')
        const name = ops[i + 6]
        const kind = kindName === 'input' ? 3 : kindName === 'output' ? 4 : kindName === 'inflow' ? 1 : kindName === 'outflow' ? 2 : undefined
        if (kind === undefined) throw new Error('[error] param kind must be input|output|inflow|outflow')
        if (name === undefined) throw new Error('[error] composite param rename needs <name>')
        current = patchRecord(current, 2, defId, (b) => renameParamFlow(b, kind, shell, name))
        summary.push(`composite ${defId} ${kindName}[${shell}] rename → ${name}`)
        i += 7
        continue
      }
      if (verb === 'add-input') {        const shell = Number(ops[i + 3])
        const name = ops[i + 4]
        const typeName = ops[i + 5]
        const innerNode = ops[i + 6] !== undefined ? Number(ops[i + 6]) : undefined
        const innerShell = ops[i + 7] !== undefined ? Number(ops[i + 7]) : undefined
        if (name === undefined || typeName === undefined || innerNode === undefined || innerShell === undefined) {
          throw new Error('[error] composite add-input <shell> <name> <type> <inner-node> <inner-shell>')
        }
        const varType = VAR_TYPE_NAME_REV[typeName]
        if (varType === undefined) throw new Error(`[error] unknown type ${typeName}`)
        // 找图中实例（必须唯一），重编号选择器（原位判定 + 未闭合 fail closed）
        const instances = parseGraphNodes(graphBlob(current, graphId)).filter((n) => n.genericId === defId)
        if (instances.length !== 1) throw new Error(`[error] 复合实例数 ${instances.length}（非 1）未闭合，拒绝`)
        const oldIndex = instances[0].index
        const newIndex = chooseRebuildIndex(graphBlob(current, graphId), oldIndex, innerNode)
        current = patchRecord(current, 2, defId, (b) => addParamFlow(b, 3, shell, name, varType))
        current = patchRecord(current, 4, compositeImplGraphId(current.slice(20, -4), defId), (b) =>
          addCompositePin(b, 3, shell, innerNode, innerShell)
        )
        if (newIndex !== undefined) {
          current = patchRecord(current, section, graphId, (b) => renumberGraphNode(b, oldIndex, newIndex))
        }
        summary.push(`composite ${defId} add-input[${shell}] ${name} ${typeName} inner=n${innerNode}[${innerShell}]（实例 n${oldIndex}${newIndex !== undefined ? `→n${newIndex}` : ' 原位'}）`)
        i += 8
        continue
      }
      if (verb === 'add-inflow') {
        const shell = Number(ops[i + 3])
        const name = ops[i + 4]
        const innerNode = ops[i + 5] !== undefined ? Number(ops[i + 5]) : undefined
        const innerShell = ops[i + 6] !== undefined ? Number(ops[i + 6]) : undefined
        if (!Number.isFinite(shell) || name === undefined || innerNode === undefined || innerShell === undefined) {
          throw new Error('[error] composite add-inflow <shell> <name> <inner-node> <inner-shell>')
        }
        // 实例不落 InFlow pin（真实复合实例无 InFlow pin：控制流连线挂源侧 connects，
        // 实例侧惰性）→ 只 patch def + impl，实例零变化
        current = patchRecord(current, 2, defId, (b) => addInflowFlow(b, shell))
        current = patchRecord(current, 4, compositeImplGraphId(current.slice(20, -4), defId), (b) =>
          addCompositePin(b, 1, shell, innerNode, innerShell, PIN_KIND.IN_FLOW)
        )
        summary.push(`composite ${defId} add-inflow[${shell}] ${name} inner=n${innerNode}[${innerShell}]（实例不落 pin）`)
        i += 7
        continue
      }
      if (verb === 'del-input') {
        const shell = Number(ops[i + 3])
        if (!Number.isFinite(shell)) throw new Error('[error] composite del-input <shell>')
        const instances = parseGraphNodes(graphBlob(current, graphId)).filter((n) => n.genericId === defId)
        if (instances.length !== 1) throw new Error(`[error] 复合实例数 ${instances.length}（非 1）未闭合，拒绝`)
        const oldIndex = instances[0].index
        const metas = flowMetas(defBlob(current, defId))
        const target = metas.find((m) => m.kind === 3 && m.shell === shell)
        if (!target) throw new Error(`[error] def ${defId} 无 input shell ${shell}`)
        const newIndex = chooseMovedIndex(graphBlob(current, graphId), oldIndex)
        current = patchRecord(current, 2, defId, (b) => delParamFlow(b, 3, shell))
        current = patchRecord(current, 4, compositeImplGraphId(current.slice(20, -4), defId), (b) =>
          delCompositePin(b, 3, shell)
        )
        current = patchGraphNode(current, graphId, oldIndex, (n) => delInstanceCompositePin(n, 3, shell, target.pinIndex!), section)
        current = patchRecord(current, section, graphId, (b) => renumberGraphNode(b, oldIndex, newIndex))
        summary.push(`composite ${defId} del-input[${shell}]（实例 n${oldIndex}→n${newIndex}；跨轮墓碑无会话史可能低于编辑器）`)
        i += 4
        continue
      }
      if (verb === 'swap-input') {
        const a = Number(ops[i + 3])
        const b = Number(ops[i + 4])
        if (!Number.isFinite(a) || !Number.isFinite(b)) throw new Error('[error] composite swap-input <a> <b>')
        const instances = parseGraphNodes(graphBlob(current, graphId)).filter((n) => n.genericId === defId)
        if (instances.length !== 1) throw new Error(`[error] 复合实例数 ${instances.length}（非 1）未闭合，拒绝`)
        const oldIndex = instances[0].index
        const newIndex = chooseMovedIndex(graphBlob(current, graphId), oldIndex)
        current = patchRecord(current, 2, defId, (bl) => swapParamFlows(bl, 3, a, b))
        current = patchRecord(current, 4, compositeImplGraphId(current.slice(20, -4), defId), (bl) =>
          swapCompositePinInners(bl, 3, a, b)
        )
        current = patchGraphNode(current, graphId, oldIndex, (n) => swapInstancePins(n, 3, a, b), section)
        current = patchRecord(current, section, graphId, (bl) => renumberGraphNode(bl, oldIndex, newIndex))
        summary.push(`composite ${defId} swap-input ${a}↔${b}（实例 n${oldIndex}→n${newIndex}；跨轮墓碑无会话史可能低于编辑器）`)
        i += 5
        continue
      }
      throw new Error(`[error] unknown composite op ${verb}`)
    }
    if (op === 'node-add') {
      // 4 个数字 token = <generic-id> [concrete-id] <x> <y>（Variant 显式 concrete；
      // 3 个 = 旧形式 <generic-id> <x> <y> 向后兼容）。旧 CLI 4 数字 token 必为
      // unknown-op 错误，无历史调用，无歧义。concrete 合法性：reflectMap 必须含之。
      const genericId = Number(ops[i + 1])
      const four = Number.isFinite(Number(ops[i + 3])) && Number.isFinite(Number(ops[i + 4]))
      const concreteId = four ? Number(ops[i + 2]) : undefined
      const x = Number(ops[i + (four ? 3 : 2)])
      const y = Number(ops[i + (four ? 4 : 3)])
      if (![genericId, x, y].every(Number.isFinite))
        throw new Error('[error] node-add needs <generic-id> [concrete-id] <x> <y>')
      if (
        concreteId !== undefined &&
        hasReflectMap(genericId) &&
        reflectConcreteIndex(genericId, concreteId) === undefined
      ) {
        throw new Error(`[error] generic ${genericId} reflectMap 不含 concrete ${concreteId}（Variant 校验失败）`)
      }
      current = patchRecord(current, section, graphId, (blob) => addGraphNode(blob, genericId, x, y, tombstoned, concreteId))
      summary.push(`add node generic=${genericId}${concreteId !== undefined ? ` concrete=${concreteId}` : ''} pos=(${x},${y})`)
      i += four ? 5 : 4
      continue
    }
    if (op === 'node-copy') {
      const src = Number(ops[i + 1])
      const x = Number(ops[i + 2])
      const y = Number(ops[i + 3])
      if (![src, x, y].every(Number.isFinite)) throw new Error('[error] node-copy needs <src-idx> <x> <y>')
      current = patchRecord(current, section, graphId, (blob) => copyGraphNode(blob, src, x, y, tombstoned))
      summary.push(`copy node ${src} pos=(${x},${y})`)
      i += 4
      continue
    }
    if (op === 'node-copy-from') {
      if (!src) throw new Error('[error] node-copy-from needs --src-gil <file>')
      const srcGid = Number(ops[i + 1])
      const idxList = ops[i + 2].split(',').map((s) => Number(s.trim()))
      const x = Number(ops[i + 3])
      const y = Number(ops[i + 4])
      if (![srcGid, x, y].every(Number.isFinite) || !idxList.length || !idxList.every(Number.isFinite))
        throw new Error('[error] node-copy-from needs <src-gid> <idx1,idx2,...> <x> <y>')
      const srcField = locateBlobField(src.payload, 1, srcGid)
      const srcBlob = src.payload.subarray(srcField.dataStart, srcField.dataEnd)
      current = patchRecord(current, section, graphId, (blob) =>
        copyGraphNodesFromBlob(blob, srcBlob, idxList, x, y)
      )
      summary.push(`copy ${idxList.length} nodes from graph ${srcGid} at (${x},${y})`)
      i += 5
      continue
    }
    if (op === 'node-del') {
      const target = Number(ops[i + 1])
      if (!Number.isFinite(target)) throw new Error('[error] node-del needs <idx>')
      tombstoned.add(target)
      current = patchRecord(current, section, graphId, (blob) => delGraphNode(blob, target))
      summary.push(`del node ${target}`)
      i += 2
      continue
    }
    if (op === 'graph-clear') {
      current = patchRecord(current, section, graphId, (blob) => clearGraphNodes(blob))
      summary.push('clear all nodes (graph record/variables/mount kept)')
      i += 1
      continue
    }
    if (op === 'graph-var-add') {
      const name = ops[i + 1]
      const type = ops[i + 2]
      if (name === undefined || type === undefined) throw new Error('[error] graph-var-add needs <name> <type>')
      const t = Number(type)
      if (Number.isNaN(t)) throw new Error('[error] graph-var-add type must be numeric (6=Str)')
      current = patchRecord(current, section, graphId, (blob) => addGraphVariable(blob, name, t))
      summary.push(`graph-var-add ${name} type=${t}`)
      i += 3
      continue
    }
    if (op !== 'node') throw new Error(`[error] unknown op ${op}`)
    const nodeIndex = Number(ops[i + 1])
    const action = ops[i + 2]
    const nodeOp = (mutate: (n: Uint8Array, meta: InstanceMeta | undefined) => Uint8Array, label: string) => {
      const before = current
      current = patchGraphNode(current, graphId, nodeIndex, (n) => {
        const meta = instanceMeta(before, n, Number(ops[i + 3]), 3)
        return mutate(n, meta)
      }, section)
      summary.push(`node ${nodeIndex} ${label}`)
    }
    if (action === 'pos') {
      const x = Number(ops[i + 3])
      const y = Number(ops[i + 4])
      if (Number.isNaN(x) || Number.isNaN(y)) throw new Error('[error] pos needs <x> <y>')
      current = patchGraphNode(current, graphId, nodeIndex, (n) => setNodePos(n, x, y), section)
      summary.push(`node ${nodeIndex} pos (${x},${y})`)
      i += 5
    } else if (action === 'cases') {
      const raw = (ops[i + 3] ?? '').split(',').map((s) => s.trim())
      if (raw.length === 0 || raw.some((v) => v === ''))
        throw new Error('[error] cases needs <v1,v2,...>')
      const values: Array<string | number> = raw.every((v) => /^-?\d+$/.test(v))
        ? raw.map(Number)
        : raw
      current = patchGraphNode(current, graphId, nodeIndex, (n) => setCasesList(n, values), section)
      summary.push(`node ${nodeIndex} cases=[${values.join(',')}]`)
      i += 4
    } else if (action === 'param') {
      const shell = Number(ops[i + 3])
      const typed = parseTypedValue(ops[i + 4])
      nodeOp((n, meta) => {
        const view = parseNodeRecord(n)
        // R<T> 泛型 pin：固定值需 ConcreteBase 包装（indexOfConcrete = reflectMap 位置）
        if (nodeInputTypeName(view.genericId, shell) === 'R<T>') {
          const idx = reflectConcreteIndex(view.genericId, view.concreteId)
          if (idx === undefined) {
            throw new Error('[error] R<T> param 需要 concreteId/reflectMap（Variant 节点），无法确定 indexOfConcrete')
          }
          return setParam(n, shell, { ...typed, bytes: wrapConcreteValue(typed.bytes, idx) }, meta?.pinIndex)
        }
        return setParam(n, shell, typed, meta?.pinIndex)
      }, `param[${shell}] ${ops[i + 4]}`)
      i += 5
    } else if (action === 'link') {
      const shell = Number(ops[i + 3])
      const srcNode = Number(ops[i + 4])
      const hasSrcShell = ops[i + 5] !== undefined && Number.isFinite(Number(ops[i + 5]))
      const srcShell = hasSrcShell ? Number(ops[i + 5]) : 0
      let type: number | undefined
      let pinIndex: number | undefined
      current = patchGraphNode(current, graphId, nodeIndex, (n) => {
        const view = parseNodeRecord(n)
        const meta = instanceMeta(current, n, shell, 3)
        if (meta) {
          type = meta.type
          pinIndex = meta.pinIndex
        } else {
          type = nodeInputType(view.genericId, shell)
          // R<T> 泛型 pin（Set/Get Node Graph Variable 等）：concreteId 经 reflectMap
          // 条目名 'S<T:...>' 解析具体类型；非 R<T> 的未知名不猜测
          if (type === undefined && nodeInputTypeName(view.genericId, shell) === 'R<T>') {
            type = nodeInputConcreteType(view.genericId, view.concreteId)
          }
        }
        if (type === undefined) {
          throw new Error(`[error] 无法确定 node ${nodeIndex} InParam[${shell}] 的类型（定义缺失），link 需要目标 pin 类型`)
        }
        return linkInParam(n, shell, srcNode, srcShell, type, pinIndex)
      }, section)
      summary.push(`node ${nodeIndex} link[${shell}] ← n${srcNode}[${srcShell}] type=${type}`)
      // 源侧 OutParam pin 补全（2026-08-12 闭合，Str 变体 bug 修复）：
      // 真实数据源节点中 **仅 R<T> 族输出**（'R<T>'，如 GetVar/GetLocal/Subtraction/
      // GetCustomVar）落默认值 pin（n41/n69/n43/n71 + 证据 case1 GetCustomVar 54）；
      // 固定类型输出不落 pin（n5 3D VecAdd Vec、n6-20 CreatePrefab Ety、v21 Equal Bol、
      // n43 GetLocal E<1016> 虚拟 pin——真实样本全部无记录，编辑器同样容忍缺 pin）。
      // 缺 pin / 编码错 → 编辑器加载失败 → 保存丢弃节点 → 连线断开（用户实测）。
      // 规则（对照真实样本）：
      //  - 源输出名 'R<T>' → concreteId 经 reflectMap 解析（含 generic==concrete 的基础变体）
      //  - 其余输出名（Vec/Ety/Bol/'L<R<T>>'/'E<1016>' 等）→ 不落 pin（编辑器行为）
      //  - 复合实例无 OutParam pin（真实 n3/n39 实例）→ 不补
      //  - 默认值编码未闭合的类型（Fct/L<Ety>/L<Vec> 等）→ fail closed 跳过并告警
      const srcRec = parseGraphNodes(graphBlob(current, graphId)).find((n) => n.index === srcNode)
      if (srcRec && srcRec.genericId < 1610000000 && !srcRec.pins.some((p) => p.kind === PIN_KIND.OUT_PARAM && p.index === srcShell)) {
        const srcOutName = nodeOutputTypeName(srcRec.genericId, srcShell)
        const srcOutType = srcOutName === 'R<T>' ? nodeInputConcreteType(srcRec.genericId, srcRec.concreteId) : undefined
        if (srcOutType === undefined) {
          summary.push(`node ${srcNode} out-param[${srcShell}] ${srcOutName ?? '?'} 输出不落 pin（编辑器行为/未闭合）`)
        } else {
          try {
            const srcIdx = reflectConcreteIndex(srcRec.genericId, srcRec.concreteId)
            current = patchGraphNode(current, graphId, srcNode, (n) => addOutParam(n, srcShell, srcOutType, srcIdx), section)
            summary.push(`node ${srcNode} out-param[${srcShell}] type=${srcOutType}${srcIdx !== undefined ? ` idx=${srcIdx}` : ''}`)
          } catch (e) {
            summary.push(`node ${srcNode} out-param[${srcShell}] 默认值未闭合（${String(e).slice(0, 80)}），未补 pin（fail closed）`)
          }
        }
      }
      i += hasSrcShell ? 6 : 5
    } else if (action === 'unlink') {
      const shell = Number(ops[i + 3])
      current = patchGraphNode(current, graphId, nodeIndex, (n) => unlinkInParam(n, shell), section)
      summary.push(`node ${nodeIndex} unlink[${shell}]`)
      i += 4
    } else if (action === 'flow') {
      const shell = Number(ops[i + 3])
      const dstNode = Number(ops[i + 4])
      const hasDstShell = ops[i + 5] !== undefined && Number.isFinite(Number(ops[i + 5]))
      const dstShell = hasDstShell ? Number(ops[i + 5]) : 0
      let pinIndex: number | undefined
      current = patchGraphNode(current, graphId, nodeIndex, (n) => {
        const meta = instanceMeta(current, n, shell, 2)
        pinIndex = meta?.pinIndex
        return addOutFlow(n, shell, dstNode, dstShell, pinIndex)
      }, section)
      summary.push(`node ${nodeIndex} flow[${shell}] → n${dstNode}[${dstShell}]`)
      i += hasDstShell ? 6 : 5
    } else if (action === 'flow-rm') {
      const shell = Number(ops[i + 3])
      const targetNode = Number(ops[i + 4])
      if (!Number.isFinite(targetNode)) throw new Error('[error] flow-rm needs target node: node <idx> flow-rm <shell> <target>')
      current = patchGraphNode(current, graphId, nodeIndex, (n) => removeOutFlow(n, shell, targetNode), section)
      summary.push(`node ${nodeIndex} flow-rm[${shell}] → n${targetNode}`)
      i += 5
    } else {
      throw new Error(`[error] unknown node op ${action}`)
    }
  }
  console.log(summary.map((s) => `applied: ${s}`).join('\n'))
  return current
}

function runLayout(bytes: Uint8Array, gil: string, args: Args): void {
  const graphId = resolveGraphId(bytes, args.graph ?? '')
  const payload = bytes.slice(20, -4)
  const { field, section } = locateGraphField(payload, graphId)
  const blob = payload.subarray(field.dataStart, field.dataEnd)
  const nodes = parseGraphNodes(blob)

  // lint 模式：只检查不修改
  const violations = checkLayout(nodes)
  if (args.layoutCheck) {
    if (violations.length === 0) {
      console.log(`layout-ok graph=${graphId} nodes=${nodes.length}`)
      return
    }
    console.log(`layout-violations graph=${graphId} nodes=${nodes.length} count=${violations.length}`)
    for (const v of violations) console.log(`  [${v.kind}] n${v.node} ${v.detail}`)
    return
  }

  // 长线自动升级为分叉线（2026-08-11 规则：超限线注册为新线，而非折行）
  const flowEdits = planFlowUpgrade(nodes)

  // 自动布局：生成新坐标 → 逐节点写 pos
  const layout = autoLayout(nodes)
  if (layout.size === 0) {
    console.log(`layout-empty graph=${graphId} (0 nodes)`)
    return
  }
  let result = bytes
  // 先应用连接编辑（plan 顺序保证 remove 在 append 前）
  for (const e of flowEdits) {
    result = patchGraphNode(
      result,
      graphId,
      e.node,
      (n) => (e.op === 'remove' ? removeOutFlow(n, 0, e.dst) : appendOutFlow(n, 0, e.dst, 0)),
      section
    )
  }
  let changed = 0
  for (const [idx, pos] of layout) {
    const before = nodes.find((n) => n.index === idx)
    if (!before) continue
    const dx = Math.abs(before.x - pos.x)
    const dy = Math.abs(before.y - pos.y)
    if (dx < 0.5 && dy < 0.5) continue
    result = patchGraphNode(result, graphId, idx, (n) => setNodePos(n, pos.x, pos.y), section)
    changed++
  }
  if (changed === 0 && flowEdits.length === 0) {
    console.log(`layout-noop graph=${graphId} nodes=${nodes.length} (already conformant)`)
    return
  }

  const sourceSha = sha256Bytes(bytes)
  const candidateSha = sha256Bytes(result)
  if (args.write) {
    const nowSha = sha256Bytes(new Uint8Array(fs.readFileSync(gil)))
    if (nowSha !== sourceSha) throw new Error('[error] source GIL changed since read; aborting write')
    const backupDir = path.join(path.dirname(gil), '.gsts', 'backups')
    fs.mkdirSync(backupDir, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const backup = path.join(backupDir, `${path.basename(gil)}.${stamp}.layout.bak`)
    fs.copyFileSync(gil, backup)
    fs.writeFileSync(gil, result)
    console.log(`backup=${backup}`)
    console.log(`written=${gil}`)
  } else if (args.outputPath) {
    const absolute = path.resolve(args.outputPath)
    if (fs.existsSync(absolute)) throw new Error(`[error] output already exists: ${absolute}`)
    fs.mkdirSync(path.dirname(absolute), { recursive: true })
    fs.writeFileSync(absolute, result)
    console.log(`written=${absolute}`)
  } else {
    console.log(`preview=${gil}`)
  }
  console.log(
    `graphId=${graphId} flow=${flowEdits.length} moved=${changed}/${nodes.length} sourceSha256=${sourceSha} candidateSha256=${candidateSha} ` +
      `size=${bytes.length}->${result.length}`
  )
}

function runPatch(bytes: Uint8Array, gil: string, args: Args): void {
  const sourceSha = sha256Bytes(bytes)
  // composite create/del-input/swap-input/add-input 需要宿主图定位实例；rename/param 不需要图（用 0 安全）
  const hasNodeOps = args.ops.some((op) =>
    ['node', 'node-add', 'node-copy', 'node-copy-from', 'node-del', 'graph-clear', 'graph-var-add'].includes(op)
  )
  const hasComposite = args.ops.some(
    (op, i) =>
      op === 'composite' &&
      (args.ops[i + 1] === 'create' || ['add-input', 'add-inflow', 'del-input', 'swap-input'].includes(args.ops[i + 2]))
  )
  const graphId =
    hasNodeOps || hasComposite
      ? resolveGraphId(bytes, args.graph ?? String(listGraphs(bytes)[0]?.id ?? ''))
      : 0
  // impl 图（复合实例体）patch：resolveGraphId 只认主图，这里探测 section 4 回退
  let section: 1 | 4 = 1
  if (hasNodeOps && graphId !== 0) {
    try {
      locateBlobField(bytes.slice(20, -4), 1, graphId)
    } catch {
      locateBlobField(bytes.slice(20, -4), 4, graphId)
      section = 4
    }
  }
  const tombstoned = new Set<number>()
  const result = applyOps(bytes, graphId, section, args.ops, tombstoned, args.srcGil ? { payload: new Uint8Array(fs.readFileSync(args.srcGil)).slice(20, -4) } : undefined)
  const candidateSha = sha256Bytes(result)
  if (args.write) {
    const nowSha = sha256Bytes(new Uint8Array(fs.readFileSync(gil)))
    if (nowSha !== sourceSha) throw new Error('[error] source GIL changed since read; aborting write')
    const backupDir = path.join(path.dirname(gil), '.gsts', 'backups')
    fs.mkdirSync(backupDir, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const backup = path.join(backupDir, `${path.basename(gil)}.${stamp}.node-graph-patch.bak`)
    fs.copyFileSync(gil, backup)
    fs.writeFileSync(gil, result)
    console.log(`backup=${backup}`)
    console.log(`written=${gil}`)
  } else if (args.outputPath) {
    const absolute = path.resolve(args.outputPath)
    if (fs.existsSync(absolute)) throw new Error(`[error] output already exists: ${absolute}`)
    fs.mkdirSync(path.dirname(absolute), { recursive: true })
    fs.writeFileSync(absolute, result)
    console.log(`written=${absolute}`)
  } else {
    console.log(`preview=${gil}`)
  }
  console.log(
    `graphId=${graphId} sourceSha256=${sourceSha} candidateSha256=${candidateSha} ` +
      `size=${bytes.length}->${result.length}`
  )
}
