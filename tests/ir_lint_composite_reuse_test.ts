import assert from 'node:assert/strict'

import { lintCompositeOutputReuseInDocument } from '../src/compiler/ir_lint_composite_reuse.js'
import type { IRDocument, ServerNode } from '../src/runtime/IR.js'

/**
 * O-2026-08-27-02 回归：复合输出二次求值静态检出。
 *
 * 引擎对复合输出 conn 按消费点重新求值；同一输出 ≥2 消费点引用时，消费链之间
 * 夹写回复合输入变量会导致错值（足球实证：运动器速度翻倍，kickApply/physSlideTick）。
 * 本检测对该形态发 GSTS-COMPOSITE-OUTPUT-REUSE warning。
 */

function callNode(id: number): ServerNode {
  return {
    id,
    type: '__composite_call__',
    args: [{ type: 'int', value: 1610700000 }],
  } as unknown as ServerNode
}

function consumerNode(id: number, type: string, callId: number, outIndex: number): ServerNode {
  return {
    id,
    type,
    args: [{ type: 'conn', value: { node_id: callId, index: outIndex, type: 'int' } }],
  } as unknown as ServerNode
}

function docWith(nodes: ServerNode[]): IRDocument {
  return {
    ir_version: 1,
    ir_type: 'node_graph',
    graph: { type: 'server', sub_type: 'entity', mode: 'beyond', id: 1073742003, name: 'reuse-lint' },
    nodes,
  } as unknown as IRDocument
}

// ===== 场景 1：同一复合输出被 2 个消费点引用 → warning =====
{
  const doc = docWith([
    callNode(1),
    consumerNode(2, 'set_node_graph_variable', 1, 0),
    consumerNode(3, 'set_custom_variable', 1, 0),
  ])
  const diags = lintCompositeOutputReuseInDocument(doc)
  const reuse = diags.filter((d) => d.code === 'GSTS-COMPOSITE-OUTPUT-REUSE')
  assert.equal(reuse.length, 1, 'double consumption → one warning')
  assert.equal(reuse[0].nodeId, 1, 'warning targets the composite call')
  assert.match(reuse[0].message, /输出\[0\]被 2 个消费点/, 'message mentions consumption count')
  assert.match(reuse[0].message, /含写变量消费点/, 'write consumer flagged as higher risk')
}

// ===== 场景 2：单消费 → 无 warning =====
{
  const doc = docWith([
    callNode(1),
    consumerNode(2, 'set_node_graph_variable', 1, 0),
  ])
  const diags = lintCompositeOutputReuseInDocument(doc)
  assert.equal(diags.filter((d) => d.code === 'GSTS-COMPOSITE-OUTPUT-REUSE').length, 0, 'single consumption is fine')
}

// ===== 场景 3：不同输出各消费一次 → 无 warning =====
{
  const doc = docWith([
    callNode(1),
    consumerNode(2, 'set_node_graph_variable', 1, 0),
    consumerNode(3, 'set_node_graph_variable', 1, 1),
  ])
  const diags = lintCompositeOutputReuseInDocument(doc)
  assert.equal(diags.filter((d) => d.code === 'GSTS-COMPOSITE-OUTPUT-REUSE').length, 0, 'distinct outputs do not accumulate')
}

// ===== 场景 4：非复合调用节点的 conn 不误报 =====
{
  const doc = docWith([
    consumerNode(1, 'set_node_graph_variable', 99, 0),
    consumerNode(2, 'set_node_graph_variable', 99, 0),
  ])
  const diags = lintCompositeOutputReuseInDocument(doc)
  assert.equal(diags.filter((d) => d.code === 'GSTS-COMPOSITE-OUTPUT-REUSE').length, 0, 'non-composite-call conns are ignored')
}

console.log('ir_lint_composite_reuse_test: PASS (4 scenarios)')
