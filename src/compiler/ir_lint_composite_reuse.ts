import { reportDiagnostic, type Diagnostic } from '../diagnostics.js'
import type { CompositeDefIR, IRDocument, ServerNode } from '../runtime/IR.js'

/**
 * 复合输出二次求值静态检出（O-2026-08-27-02）
 *
 * 引擎对 conn 引用的复合输出按消费点重新求值（惰性）；同一输出被 ≥2 个消费点引用时，
 * 若消费链之间夹写回图变量/自定义变量（且该变量是复合输入），第二次求值会用新输入 →
 * 结果翻倍/错值（足球实证：kickApply/physSlideTick 运动器速度 ×2，日志 2026-08-27_16-43-43；
 * DSL 层已沉淀「手动物化 tmp* 快照」纪律）。
 *
 * 本检测：同一 __composite_call__ 输出（OutParam index）被 ≥2 个消费点引用 → warning，
 * 提示复合作者物化快照。不做自动物化（插入物化改变语义风险高）。
 * 挂载点：writeGiaFromIrJsonFile（IR→GIA 必经点，与 dangling 检测同链）。
 */

const WRITE_NODE_TYPES = new Set(['set_node_graph_variable', 'set_custom_variable'])

type OutputUse = {
  consumerId: number
  consumerType?: string
}

function collectUses(nodes: ServerNode[]): Map<string, OutputUse[]> {
  const callIds = new Set(nodes.filter((n) => n.type === '__composite_call__').map((n) => n.id))
  const uses = new Map<string, OutputUse[]>()
  for (const node of nodes) {
    for (const arg of node.args ?? []) {
      if (arg?.type !== 'conn') continue
      const conn = arg.value
      if (!callIds.has(conn.node_id)) continue
      const key = `${conn.node_id}:${conn.index ?? 0}`
      let list = uses.get(key)
      if (!list) {
        list = []
        uses.set(key, list)
      }
      list.push({ consumerId: node.id, consumerType: node.type })
    }
  }
  return uses
}

export function lintCompositeOutputReuse(
  ir: IRDocument,
  nodes: ServerNode[],
  opts: { graphName?: string; graphId?: number } = {}
): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  const uses = collectUses(nodes)
  for (const [key, consumers] of uses) {
    if (consumers.length < 2) continue
    const [callIdStr, indexStr] = key.split(':')
    const callId = Number(callIdStr)
    const index = Number(indexStr)
    const consumerDescs = consumers
      .map((c) => `${c.consumerId}（${c.consumerType ?? 'unknown'}）`)
      .join(', ')
    const hasWriteConsumer = consumers.some((c) => WRITE_NODE_TYPES.has(c.consumerType ?? ''))
    diagnostics.push({
      code: 'GSTS-COMPOSITE-OUTPUT-REUSE',
      severity: 'warning',
      source: 'user',
      message:
        `复合调用 ${callId} 的输出[${index}]被 ${consumers.length} 个消费点引用（${consumerDescs}）：` +
        `引擎按消费点重新求值——若消费链之间夹写回复合输入变量，第二次求值会用新输入导致错值` +
        `（O-2026-08-27-02 实证：运动器速度翻倍）${hasWriteConsumer ? '；本组含写变量消费点，风险更高' : ''}`,
      suggestion:
        '在复合内把输出物化为独立图变量快照（tmp*），消费点读快照而非复合输出 conn；' +
        '或把多次消费改为一次消费后变量传递',
      graphId: opts.graphId,
      graphName: opts.graphName ?? '<unnamed>',
      nodeId: callId,
      nodeType: '__composite_call__',
      originKind: 'user',
    })
  }
  return diagnostics
}

/**
 * 对整份 IR 文档执行复合输出复用检出（根图 + 每个复合 def 的 implNodes）。
 */
export function lintCompositeOutputReuseInDocument(ir: IRDocument): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  const rootNodes = (ir as IRDocument & { nodes?: ServerNode[] }).nodes
  if (rootNodes && rootNodes.length > 0) {
    diagnostics.push(
      ...lintCompositeOutputReuse(ir, rootNodes, {
        graphName: ir.graph?.name,
        graphId: ir.graph?.id,
      })
    )
  }
  if ('compositeDefs' in ir && ir.compositeDefs) {
    for (const def of ir.compositeDefs as CompositeDefIR[]) {
      diagnostics.push(
        ...lintCompositeOutputReuse(ir, def.implNodes, {
          graphName: def.name,
          graphId: def.id,
        })
      )
    }
  }
  for (const diagnostic of diagnostics) {
    reportDiagnostic(diagnostic)
  }
  return diagnostics
}
