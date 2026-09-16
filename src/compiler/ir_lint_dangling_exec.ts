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

/** 事件/信号/引导流入口节点（作为执行来源时其出边是广播/分发性质） */
function isEntryNodeType(nodeType: string | undefined): boolean {
  return !!nodeType && (ENTRY_NODE_TYPES.has(nodeType) || nodeType.startsWith(EVENT_ENTRY_PREFIX))
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

  // 所有入边目标集合（出现在任何边的 value 中的节点 = 有人指向它）。
  // 入口来源（when_*/monitor_signal 等）的出边也代表目标有入边（事件→dispatch 是真实执行流），
  // 必须计入 incoming——否则事件入口后的 double_branch 被误报悬空（render.ts 2026-09-01 实证）。
  const incoming = new Set<number>()
  // 入边明细（非入口来源）：target → { from, sourceIndex }[]，用于分支 join 豁免判定
  const inEdgeByTarget = new Map<number, Array<{ from: number; sourceIndex: number }>>()
  for (const [fromStr, connections] of Object.entries(edges)) {
    const from = Number(fromStr)
    const fromType = nodeTypeById.get(from)
    const isEntry = isEntryNodeType(fromType)
    for (const conn of connections) {
      const target = typeof conn === 'number' ? conn : conn.node_id
      incoming.add(target)
      if (isEntry) continue // 入口来源不计入 join 判定（广播性质）
      const sourceIndex = typeof conn === 'number' ? 0 : (conn.source_index ?? 0)
      let list = inEdgeByTarget.get(target)
      if (!list) {
        list = []
        inEdgeByTarget.set(target, list)
      }
      list.push({ from, sourceIndex })
    }
  }

  const graphName = opts.graphName ?? '<unnamed>'
  for (const [fromStr, connections] of Object.entries(edges)) {
    const from = Number(fromStr)
    const nodeType = nodeTypeById.get(from)
    if (incoming.has(from)) continue
    if (entryIds.has(from)) continue
    if (isInFlowTarget(pins, from)) continue
    if (isEntryNodeType(nodeType)) continue

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

  // —— 重复入边检测（O-2026-08-21-5）——
  // 同一 target 收到 ≥2 条「相同 source_index 且不同非入口来源」的 exec 边 = 执行链冲突：
  // auto-chain（f.registerExecNode 从当前 tail 串一条）与显式 f.connect 同时接线时，
  // 同一节点被执行两次（实证：2×2 gstsDoWhole start_timer 同节点两帧）。
  // 豁免（合法汇聚形态，不告警）：
  //   ① 来源是入口节点（when_*/monitor_signal/__bootstrap__/node_graph_begins）——
  //      多事件汇聚到同一 dispatch 是合法聚合（如 optimize_timer_dispatch 的 mergeGroups）；
  //   ② 同一 from 的多条边（分支 join / outflow 汇聚，引擎按 source_index 区分）；
  //   ③ target 是复合 inflow 引脚（外部流入 + impl 内部互连合法）；
  //   ④ 分支 join：多个来源 from 各自唯一入边来自同一分支节点（double_branch /
  //      multiple_branches 等），是 true/false 分支汇聚（互斥触发，实测测试图大量存在）。
  // target → source_index → 来源明细（含重复边：同一 from+source_index 出现两次 =
  // auto-chain 与显式 connect 双写，2026-09-01 足球 applyRefl 实证 n18 两入边）
  const inputSources = new Map<number, Map<string, Map<number, number>>>() // target → source_index → from → 边数
  for (const [fromStr, connections] of Object.entries(edges)) {
    const from = Number(fromStr)
    const fromType = nodeTypeById.get(from)
    if (isEntryNodeType(fromType)) continue
    for (const conn of connections) {
      const target = typeof conn === 'number' ? conn : conn.node_id
      if (isInFlowTarget(pins, target)) continue
      const sourceIndex = typeof conn === 'number' ? 0 : (conn.source_index ?? 0)
      const key = String(sourceIndex)
      let byIndex = inputSources.get(target)
      if (!byIndex) {
        byIndex = new Map()
        inputSources.set(target, byIndex)
      }
      let sources = byIndex.get(key)
      if (!sources) {
        sources = new Map()
        byIndex.set(key, sources)
      }
      sources.set(from, (sources.get(from) ?? 0) + 1)
    }
  }
  // 收集节点到根的所有分支祖先（递归向上，途经的分支节点集合）：
  // 所有来源共享同一分支祖先 = 互斥汇聚（多级嵌套分支合法 join，引擎按分支互斥执行不重复。
  // 2026-09-01 增强：ball_state_transition 的 35/38 分别来自 toMotion 真/假分支（经 34/37），
  //   公共分支祖先是 toMotion 的 double_branch(30)——原实现只查「最近分支」漏掉多级）
  const branchAncestors = (nodeId: number, depth = 0, seen = new Set<number>()): Set<number> => {
    const acc = new Set<number>()
    if (depth > 12 || seen.has(nodeId)) return acc
    seen.add(nodeId)
    const ins = inEdgeByTarget.get(nodeId)
    if (!ins || ins.length === 0) return acc
    if (ins.length > 1) return acc // 多入边节点不能唯一归因
    const from = ins[0].from
    const fromType = nodeTypeById.get(from)
    if (fromType === 'double_branch' || fromType === 'multiple_branches') acc.add(from)
    for (const anc of branchAncestors(from, depth + 1, seen)) acc.add(anc)
    return acc
  }
  const isBranchJoin = (sources: Map<number, number>): boolean => {
    if (sources.size < 2) return false
    let common: Set<number> | undefined
    for (const from of sources.keys()) {
      const ancs = branchAncestors(from)
      if (ancs.size === 0) return false
      if (common === undefined) common = ancs
      else common = new Set([...common].filter((x) => ancs.has(x)))
      if (common.size === 0) return false
    }
    return common !== undefined && common.size > 0
  }
  for (const [target, byIndex] of inputSources) {
    for (const [index, sources] of byIndex) {
      // ① 同一 from + 同 source_index 出现 >=2 条边 = auto-chain + connect 双写
      //   （2026-09-01 足球 applyRefl 实证：registerExecNode 自动串联 + f.connect
      //   各写一条边 -> 引擎两条路径都执行 -> netHit=false 也跑 x0.25）
      for (const [from, count] of sources) {
        if (count < 2) continue
        diagnostics.push({
          code: 'GSTS-DUPLICATE-EXEC-INPUT',
          severity: 'warning',
          source: 'user',
          message:
            'exec 节点 ' + target + '（' + (nodeTypeById.get(target) ?? 'unknown') + '）收到 ' +
            count + ' 条同来源同出口入边（from=' + from + ', source_index=' + index + '）：' +
            'f.registerExecNode() auto-chain 与显式 f.connect() 双写会让该节点重复执行',
          suggestion:
            '检查分支/链尾的 f.registerExecNode() 是否又显式 f.connect(前置,0,该节点,0)；' +
            'registerExecNode 已自动串联当前 tail，删掉重复的显式 connect（保留单条入口）',
          graphId: opts.graphId,
          graphName,
          nodeId: target,
          nodeType: nodeTypeById.get(target),
          originKind: 'user',
        })
      }
      // ② 多来源同出口（原检测，保留）
      if (sources.size < 2) continue
      if (isBranchJoin(sources)) continue
      diagnostics.push({
        code: 'GSTS-DUPLICATE-EXEC-INPUT',
        severity: 'warning',
        source: 'user',
        message:
          'exec 节点 ' + target + '（' + (nodeTypeById.get(target) ?? 'unknown') + '）收到 ' +
          sources.size + ' 条同出口(source_index=' + index + ')入边（来源：' + [...sources.keys()].join(', ') + '）：' +
          'auto-chain 与显式 connect 冲突会让该节点重复执行',
        suggestion:
          '检查 f.registerExecNode() auto-chain 与 f.connect()/f.link() 是否同时接线；' +
          '保留单条入口（推荐 f.registerExecNode 自动串联，显式 connect 改为高层 API）',
        graphId: opts.graphId,
        graphName,
        nodeId: target,
        nodeType: nodeTypeById.get(target),
        originKind: 'user',
      })
    }
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