import { reportDiagnostic, type Diagnostic } from '../diagnostics.js'
import type {
  CompositeDefIR,
  CompositePinEntry,
  IRDocument,
  NextConnection,
  ServerNode,
} from '../runtime/IR.js'

/**
 * 悬空 exec 节点静态检出（2026-08-21 方案 A）
 *
 * 定义：一个 exec 节点如果「有出边」（它被编入执行链、会把执行流转给后续节点）
 * 但「没有任何入边」（没有任何前置节点把执行流转给它），则该节点所在的整个执行段
 * 永远无法被触发——死代码，且常伴随真实功能 bug。
 *
 * 实证背景（Bug 2「自动打乱不自动」）：flowScramble 内三个 f.node() 创建的
 * setAuto/setIdx/setLock 只有内部互连、入口悬空（f.node 是 detached 注册，
 * 不自动串联当前 tail），导致 rec167 无任何设置帧、autoMode 永远 false、
 * 20 步队列只执行第 1 步。修复 = 改 f.registerExecNode() 自动串接 loop done 出口。
 *
 * 合法无入边的例外：
 * - 根图事件入口节点（when_* 类型：when_entity_is_created / when_timer_* 等）
 * - monitor_signal（f.onSignal() 信号监听入口，runHandler('monitorSignal')）
 * - client 图入口 node_graph_begins（start）
 * - __bootstrap__ 引导流事件节点（调试模式保留时）
 * - 复合 impl 的 __composite_capture__（固定入口）
 * - 复合 inflow 引脚（outerPinKind === 1）映射到的 impl 内部节点（执行从外部流入）
 *
 * 挂载点：writeGiaFromIrJsonFile（IR→GIA 必经点）。默认 warning，
 * 可用 --strict-warnings 提升为编译失败，--warnings-json 输出结构化诊断。
 */

/** 事件/信号入口统一前缀：全部 ServerEventMetadata 事件（when* → when_*） */
const EVENT_ENTRY_PREFIX = 'when_'
/** 精确匹配的入口节点类型（非 when_ 前缀的合法无入边节点） */
const ENTRY_NODE_TYPES = new Set([
  '__composite_capture__', // 复合 impl 固定入口
  'monitor_signal', // f.onSignal() 信号监听入口（runHandler('monitorSignal')）
  '__bootstrap__', // 引导流事件节点（removeUnusedNodes=false 调试模式保留时）
  'node_graph_begins' // client 图 start 入口
])

function collectTargetIds(connections: NextConnection[]): Set<number> {
  const ids = new Set<number>()
  for (const conn of connections) {
    ids.add(typeof conn === 'number' ? conn : conn.node_id)
  }
  return ids
}

function isInFlowTarget(pins: CompositePinEntry[], nodeId: number): boolean {
  return pins.some((pin) => pin.outerPinKind === 1 && pin.innerNodeId === nodeId)
}

/**
 * 扫描一组 exec 节点 + 执行边，检出「有出边但无入边」的悬空节点。
 *
 * @param nodes 节点列表（根图 nodes 或复合 implNodes）
 * @param edges 执行边：{ fromNodeId: NextConnection[] }
 * @param opts 上下文信息（用于诊断输出）与合法入口集合
 */
export function lintExecGraphForDangling(
  nodes: ServerNode[],
  edges: Record<number, NextConnection[]>,
  opts: {
    graphName?: string
    graphId?: number
    entryNodeIds?: Set<number>
    compositePins?: CompositePinEntry[]
  } = {}
): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  if (!nodes || nodes.length === 0) return diagnostics

  const nodeTypeById = new Map(nodes.map((node) => [node.id, node.type]))
  const entryIds = opts.entryNodeIds ?? new Set<number>()
  const pins = opts.compositePins ?? []

  // 所有入边目标集合（出现在任何边的 value 中的节点 = 有人指向它）
  const incoming = new Set<number>()
  for (const connections of Object.values(edges)) {
    for (const id of collectTargetIds(connections)) incoming.add(id)
  }

  const graphName = opts.graphName ?? '<unnamed>'
  for (const [fromStr, connections] of Object.entries(edges)) {
    const from = Number(fromStr)
    const nodeType = nodeTypeById.get(from)
    if (incoming.has(from)) continue
    if (entryIds.has(from)) continue
    if (isInFlowTarget(pins, from)) continue
    if (nodeType && (ENTRY_NODE_TYPES.has(nodeType) || nodeType.startsWith(EVENT_ENTRY_PREFIX)))
      continue

    diagnostics.push({
      code: 'GSTS-DANGLING-EXEC-NODE',
      severity: 'warning',
      source: 'user',
      message:
        `exec 节点 ${from}（${nodeType ?? 'unknown'}）有出边但无入边：` +
        `该执行段悬空，永远不会被触发（死代码，常伴随功能 bug）`,
      suggestion:
        '用 f.registerExecNode() 注册（自动串联当前 tail），' +
        '或用 f.link()/f.connect()/f.connectOutFlow() 显式接入执行链',
      graphId: opts.graphId,
      graphName,
      nodeId: from,
      nodeType,
      originKind: 'user',
    })
  }

  return diagnostics
}

/** 扫描根图的 nodes[].next 执行链 */
function lintRootGraph(ir: IRDocument & { nodes?: ServerNode[] }): Diagnostic[] {
  const nodes = ir.nodes
  if (!nodes || nodes.length === 0) return []

  // 根图执行边 = nodes[].next（去空）
  const edges: Record<number, NextConnection[]> = {}
  for (const node of nodes) {
    if (node.next && node.next.length > 0) edges[node.id] = node.next
  }
  return lintExecGraphForDangling(nodes, edges, {
    graphName: ir.graph?.name,
    graphId: ir.graph?.id,
  })
}

/** 扫描复合 def 的 implNodes + implEdges */
function lintCompositeDef(def: CompositeDefIR): Diagnostic[] {
  const edges = def.implEdges ?? {}
  return lintExecGraphForDangling(def.implNodes, edges, {
    graphName: def.name,
    graphId: def.id,
    compositePins: def.compositePins,
  })
}

/**
 * 对整份 IR 文档执行悬空 exec 静态检出，并将诊断写入全局 diagnostics。
 * 根图 + 每个复合 def 独立扫描。
 */
export function lintDanglingExecNodes(ir: IRDocument): Diagnostic[] {
  const diagnostics: Diagnostic[] = []

  diagnostics.push(...lintRootGraph(ir as IRDocument & { nodes?: ServerNode[] }))

  // compositeDefs 仅存在于 ServerIRDocument；用 in 守卫收窄避免 ClientIRDocument 误报
  if ('compositeDefs' in ir && ir.compositeDefs) {
    for (const def of ir.compositeDefs) {
      diagnostics.push(...lintCompositeDef(def))
    }
  }

  for (const diagnostic of diagnostics) {
    reportDiagnostic(diagnostic)
  }
  return diagnostics
}
