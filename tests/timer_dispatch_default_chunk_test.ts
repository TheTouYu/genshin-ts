import assert from 'node:assert/strict'

import { optimizeTimerDispatchAggregate } from '../src/compiler/ir_to_gia_transform/optimize_timer_dispatch.js'

/**
 * O-2026-08-27-01 回归：multiple_branches dispatch 有 default 分支（next source_index=0）时，
 * parseMultipleBranchesDispatch 曾直接返回 null → 跳过 chunking → >10 case 被引擎 Multiple
 * Branches 节点（上限 10 命名 case + 1 default）静默截断（日志 2927 实锤 orbit22/23 变孤立链）。
 *
 * 修复语义：
 *  1) default 分支（source_index=0）允许解析（至多一条），chunking 时 default 保留在首 chunk；
 *  2) 有 default 的 dispatch 不参与多 dispatch 合并（default 语义唯一，合并会丢 default 分支）；
 *  3) 无 default 的既有 chunking/合并行为不变。
 */

const EVENT_ID = 1
const DISPATCH_ID = 2

function makeTimerNameConn(eventId: number) {
  return { type: 'conn', value: { node_id: eventId, index: 2, type: 'str' } }
}

/** 构造 when_timer_is_triggered → multiple_branches(caseCount 个 case) 的 IR */
function buildSingleDispatchIr(caseCount: number, withDefault: boolean) {
  const nodes: any[] = [
    {
      id: EVENT_ID,
      type: 'when_timer_is_triggered',
      next: [{ node_id: DISPATCH_ID, source_index: 0 }]
    }
  ]
  const caseNames = Array.from({ length: caseCount }, (_, i) => `timer_${i + 1}`)
  const next: any[] = []
  if (withDefault) next.push({ node_id: 1000, source_index: 0 })
  caseNames.forEach((name, i) => {
    const headId = 2000 + i
    nodes.push({ id: headId, type: 'print_string', args: [{ type: 'str', value: name }] })
    next.push({ node_id: headId, source_index: i + 1 })
  })
  nodes.push({
    id: DISPATCH_ID,
    type: 'multiple_branches',
    args: [makeTimerNameConn(EVENT_ID), ...caseNames.map((n) => ({ type: 'str', value: n }))],
    next
  })
  return {
    ir_version: 1,
    ir_type: 'node_graph',
    graph: { type: 'server', sub_type: 'entity', mode: 'beyond', id: 1073741825 },
    nodes
  } as any
}

/** 构造两个独立 event→dispatch（timer 名唯一） */
function buildTwoDispatchIr(withDefault: boolean) {
  const nodes: any[] = []
  for (let d = 0; d < 2; d++) {
    const eventId = 10 + d
    const dispatchId = 20 + d
    const caseNames = [`g${d}_a`, `g${d}_b`, `g${d}_c`]
    nodes.push({
      id: eventId,
      type: 'when_timer_is_triggered',
      next: [{ node_id: dispatchId, source_index: 0 }]
    })
    const edges: any[] = []
    if (withDefault) edges.push({ node_id: 100 + d, source_index: 0 })
    caseNames.forEach((name, i) => {
      const headId = 200 + d * 10 + i
      nodes.push({ id: headId, type: 'print_string', args: [{ type: 'str', value: name }] })
      edges.push({ node_id: headId, source_index: i + 1 })
    })
    nodes.push({
      id: dispatchId,
      type: 'multiple_branches',
      args: [makeTimerNameConn(eventId), ...caseNames.map((n) => ({ type: 'str', value: n }))],
      next: edges
    })
  }
  return {
    ir_version: 1,
    ir_type: 'node_graph',
    graph: { type: 'server', sub_type: 'entity', mode: 'beyond', id: 1073741825 },
    nodes
  } as any
}

// ===== 场景 1：12 case + default → chunking 保留 default 在首 chunk，无截断 =====
{
  const out = optimizeTimerDispatchAggregate(buildSingleDispatchIr(12, true), true) as any
  const dispatches = out.nodes.filter((n: any) => n.type === 'multiple_branches')
  assert.equal(dispatches.length, 2, '12 cases + default → 2 chunks')
  const first = dispatches.find((n: any) => n.id === DISPATCH_ID)
  const second = dispatches.find((n: any) => n.id !== DISPATCH_ID)
  assert.ok(first && second, 'both chunks exist')
  assert.equal(first.args.length, 11, 'first chunk: control conn + 10 case names')
  assert.equal(first.next.length, 11, 'first chunk: default + 10 heads')
  assert.equal(
    first.next.filter((n: any) => n.source_index === 0).length,
    1,
    'default branch stays in first chunk (source_index=0)'
  )
  assert.equal(second.args.length, 3, 'second chunk: control conn + 2 case names')
  assert.equal(second.next.length, 2, 'second chunk: 2 heads only')
  assert.ok(
    second.next.every((n: any) => n.source_index !== 0),
    'second chunk must not carry default'
  )
  const namedHeads = [...first.next, ...second.next].filter((n: any) => n.source_index !== 0)
  assert.equal(namedHeads.length, 12, 'all 12 named cases keep their head edges (no silent truncation)')
}

// ===== 场景 2：两个有 default 的 dispatch 不参与合并（default 语义唯一） =====
{
  const out = optimizeTimerDispatchAggregate(buildTwoDispatchIr(true), true) as any
  const dispatches = out.nodes.filter((n: any) => n.type === 'multiple_branches')
  assert.equal(dispatches.length, 2, 'with-default dispatches must not merge')
  assert.deepEqual(
    dispatches.map((n: any) => n.id).sort((a: number, b: number) => a - b),
    [20, 21],
    'original dispatch ids preserved'
  )
  for (const d of dispatches) {
    assert.equal(
      d.next.filter((n: any) => n.source_index === 0).length,
      1,
      `dispatch ${d.id} keeps its default branch`
    )
    assert.equal(d.next.length, 4, `dispatch ${d.id}: default + 3 heads`)
  }
}

// ===== 场景 3：无 default 的多个 dispatch 仍可合并（回归既有行为） =====
{
  const out = optimizeTimerDispatchAggregate(buildTwoDispatchIr(false), true) as any
  const dispatches = out.nodes.filter((n: any) => n.type === 'multiple_branches')
  assert.equal(dispatches.length, 1, 'no-default dispatches merge as before')
  const merged = dispatches[0]
  assert.equal(merged.args.length, 7, 'merged: control + 6 case names')
  assert.ok(
    merged.next.every((n: any) => n.source_index !== 0),
    'merged dispatch has no default'
  )
  assert.equal(merged.next.length, 6, 'merged: 6 heads')
}

// ===== 场景 4：11 case 无 default → 仍 chunking（既有行为） =====
{
  const out = optimizeTimerDispatchAggregate(buildSingleDispatchIr(11, false), true) as any
  const dispatches = out.nodes.filter((n: any) => n.type === 'multiple_branches')
  assert.equal(dispatches.length, 2, '11 cases without default → 2 chunks')
  const namedHeads = dispatches.flatMap((d: any) =>
    d.next.filter((n: any) => n.source_index !== 0)
  )
  assert.equal(namedHeads.length, 11, 'all 11 heads kept')
}

console.log('timer_dispatch_default_chunk_test: PASS (4 scenarios)')
