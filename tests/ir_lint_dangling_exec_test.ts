import assert from 'node:assert/strict'

import { lintExecGraphForDangling } from '../src/compiler/ir_lint_dangling_exec.js'
import type { NextConnection } from '../src/runtime/IR.js'

/**
 * O-2026-08-21-5 回归：悬空 exec 检测器「重复入边」增强。
 *
 * 旧检测器只抓「有出边无入边」；抓不到同一 exec 节点多条 exec 入边
 * （auto-chain + 显式 connect 冲突，实证：2×2 gstsDoWhole start_timer
 * 同节点执行两次，日志特征：Start Timer 同节点两帧）。
 *
 * 新检测（GSTS-DUPLICATE-EXEC-INPUT）：同一 target 收到 ≥2 条「相同
 * source_index 且不同非入口来源」的 exec 边即告警。豁免合法汇聚形态：
 * ①事件入口来源（多事件聚合 dispatch）②同 from 多边（分支 join）
 * ③复合 inflow 目标。
 */

function edgesOf(pairs: Array<[number, Array<number | { node_id: number; source_index?: number }>]>): Record<number, NextConnection[]> {
  const edges: Record<number, NextConnection[]> = {}
  for (const [from, nexts] of pairs) edges[from] = nexts as NextConnection[]
  return edges
}

// 用函数声明而非箭头函数：箭头函数表达式后紧跟顶层块 `{ ... }` 会被 TS 解析器
// 误判为函数体（实测 TS1005 '=>' expected），函数声明是完整语句不受影响。
function node(id: number, type = 'print_string'): any {
  return { id, type }
}

// ===== 场景 1：两非入口节点同 source_index 指向同一 target → 告警 =====
{
  const nodes = [node(1, 'set_node_graph_variable'), node(2, 'start_timer'), node(3, 'print_string')]
  const edges = edgesOf([
    [1, [{ node_id: 3, source_index: 0 }]],
    [2, [{ node_id: 3, source_index: 0 }]]
  ])
  const diags = lintExecGraphForDangling(nodes, edges, { graphName: 'dup-test' })
  const dup = diags.filter((d) => d.code === 'GSTS-DUPLICATE-EXEC-INPUT')
  assert.equal(dup.length, 1, 'two non-entry sources with same source_index → one duplicate warning')
  assert.equal(dup[0].nodeId, 3, 'warning targets the shared exec node')
  assert.match(dup[0].message, /source_index=0/, 'message mentions the conflicting source index')
}

// ===== 场景 2：多个事件入口汇聚到同一 dispatch → 不告警（合法聚合） =====
{
  const nodes = [node(1, 'when_timer_is_triggered'), node(2, 'when_entity_is_created'), node(3, 'multiple_branches')]
  const edges = edgesOf([
    [1, [{ node_id: 3, source_index: 0 }]],
    [2, [{ node_id: 3, source_index: 0 }]]
  ])
  const diags = lintExecGraphForDangling(nodes, edges, { graphName: 'merge-test' })
  assert.equal(diags.filter((d) => d.code === 'GSTS-DUPLICATE-EXEC-INPUT').length, 0, 'event-entry fan-in is legal')
}

// ===== 场景 3：同一 from 多边（分支 join）→ 不告警 =====
{
  const nodes = [node(1, 'double_branch'), node(2, 'print_string')]
  const edges = edgesOf([
    [1, [
      { node_id: 2, source_index: 0 },
      { node_id: 2, source_index: 1 }
    ]]
  ])
  const diags = lintExecGraphForDangling(nodes, edges, { graphName: 'join-test' })
  assert.equal(diags.filter((d) => d.code === 'GSTS-DUPLICATE-EXEC-INPUT').length, 0, 'same-from multi-edge join is legal')
}

// ===== 场景 4：不同 source_index 多来源 → 不告警（分支汇聚） =====
{
  const nodes = [node(1, 'print_string'), node(2, 'print_string'), node(3, 'print_string')]
  const edges = edgesOf([
    [1, [{ node_id: 3, source_index: 0 }]],
    [2, [{ node_id: 3, source_index: 1 }]]
  ])
  const diags = lintExecGraphForDangling(nodes, edges, { graphName: 'branch-merge-test' })
  assert.equal(diags.filter((d) => d.code === 'GSTS-DUPLICATE-EXEC-INPUT').length, 0, 'different source_index merge is legal')
}

// ===== 场景 5：复合 inflow 目标 + impl 内部来源 → 不告警 =====
{
  const nodes = [node(1, 'print_string'), node(2, 'print_string')]
  const edges = edgesOf([
    [1, [{ node_id: 2, source_index: 0 }]],
    [99, [{ node_id: 2, source_index: 0 }]]
  ])
  const diags = lintExecGraphForDangling(nodes, edges, {
    graphName: 'inflow-test',
    compositePins: [{ outerPinKind: 1, innerNodeId: 2, outerPinIndex: 0, innerPinIndex: 0 }] as any
  })
  assert.equal(diags.filter((d) => d.code === 'GSTS-DUPLICATE-EXEC-INPUT').length, 0, 'composite inflow target is exempt')
}

// ===== 场景 6：既有 dangling 检测不回归（有出边无入边仍告警） =====
{
  const nodes = [node(1, 'set_node_graph_variable'), node(2, 'print_string')]
  const edges = edgesOf([
    [1, [{ node_id: 2, source_index: 0 }]]
  ])
  const diags = lintExecGraphForDangling(nodes, edges, { graphName: 'dangling-test' })
  assert.equal(diags.filter((d) => d.code === 'GSTS-DANGLING-EXEC-NODE').length, 1, 'dangling detection still works')
}

console.log('ir_lint_dangling_exec_test: PASS (6 scenarios)')
