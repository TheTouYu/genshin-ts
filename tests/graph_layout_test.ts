import assert from 'node:assert'
import { autoLayout, checkLayout, planFlowUpgrade, type LayoutResult } from '../src/cli/static_assembly/graph_layout.js'
import type { NodeView } from '../src/cli/static_assembly/graph_edit.js'

function node(index: number, pins: NodeView['pins'], x = 0, y = 0): NodeView {
  return { index, genericId: index, x, y, pins }
}
function outFlow(...dst: number[]): NodeView['pins'][number] {
  return { kind: 2, index: 0, valueText: '', connects: dst.map((id) => ({ id, kind: 1, index: 0 })) }
}
function inFlow(): NodeView['pins'][number] {
  return { kind: 1, index: 0, valueText: '', connects: [] }
}
function inParam(...src: number[]): NodeView['pins'][number] {
  return { kind: 3, index: 0, valueText: '', connects: src.map((id) => ({ id, kind: 4, index: 0 })) }
}
function outParam(): NodeView['pins'][number] {
  return { kind: 4, index: 0, valueText: '', connects: [] }
}

function flowDst(n: NodeView): number[] {
  const out: number[] = []
  for (const p of n.pins) if (p.kind === 2) for (const c of p.connects) out.push(c.id)
  return out
}

// 28 节点长链（main 图结构：1 起点 + 27 个后续）
function longChain(n: number): NodeView[] {
  const nodes: NodeView[] = []
  for (let i = 1; i <= n; i++) {
    const pins: NodeView['pins'] = [inFlow()]
    if (i < n) pins.push(outFlow(i + 1))
    nodes.push(node(i, pins))
  }
  return nodes
}

function test(name: string, fn: () => void, out: Array<[string, boolean]>) {
  try {
    fn()
    out.push([name, true])
  } catch (e) {
    out.push([name, false])
    console.error(`  FAIL ${name}:`, (e as Error).message)
  }
}

const results: Array<[string, boolean]> = []

// 1. 线性链横向：n1→n2→n3 从左到右（x 递增、y 相同）
test(
  '线性链横向',
  () => {
    const nodes = [node(1, [outFlow(2)]), node(2, [inFlow(), outFlow(3)]), node(3, [inFlow()])]
    const r = autoLayout(nodes)
    const a = r.get(1)!
    const b = r.get(2)!
    const c = r.get(3)!
    assert.ok(b.x > a.x && c.x > b.x, `线性链应横向递增: ${a.x},${b.x},${c.x}`)
    assert.ok(Math.abs(b.y - a.y) < 10 && Math.abs(c.y - b.y) < 10, '线性链应同行')
  },
  results
)

// 2. 超长链折行：11 个节点分两行，第二行 y 更大、x 回行首
test(
  '超长链折行',
  () => {
    const nodes = []
    for (let i = 1; i <= 11; i++) {
      const pins: NodeView['pins'] = [inFlow()]
      if (i < 11) pins.push(outFlow(i + 1))
      nodes.push(node(i, pins))
    }
    const r = autoLayout(nodes)
    const n10 = r.get(10)!
    const n11 = r.get(11)!
    assert.ok(n11.y > n10.y + 100, `超长链应折行: n10 y=${n10.y}, n11 y=${n11.y}`)
    assert.ok(n11.x < n10.x, '折行后 x 应回到行首')
  },
  results
)

// 3. 数据源跟随：单节点贴消费者左边（同行左侧）
test(
  '数据源跟随',
  () => {
    const nodes = [node(1, [outFlow(2)]), node(2, [inFlow(), inParam(3)]), node(3, [outParam()])]
    const r = autoLayout(nodes)
    const c = r.get(2)!
    const d = r.get(3)!
    assert.ok(d.x < c.x && Math.abs(d.y - c.y) < 300, `数据源应贴消费者左侧: d=(${d.x},${d.y}) c=(${c.x},${c.y})`)
  },
  results
)

// 4. 数据运算链横排：d1→d2→d3→consumer 排成一条横向长线
test(
  '数据运算链横排',
  () => {
    const nodes = [
      node(1, [outFlow(5)]),
      node(5, [inFlow(), inParam(4)]),
      node(2, [outParam()]), // 纯数据源 d1
      node(3, [inParam(2), outParam()]), // d2：消费 d1，输出给 d3
      node(4, [inParam(3), outParam()]) // d3：链尾，输出给消费者 n5
    ]
    const r = autoLayout(nodes)
    const d1 = r.get(2)!
    const d2 = r.get(3)!
    const d3 = r.get(4)!
    const c = r.get(5)!
    assert.ok(d1.x < d2.x && d2.x < d3.x && d3.x < c.x, `数据链应横向递增: ${d1.x},${d2.x},${d3.x},${c.x}`)
    assert.ok(Math.abs(d1.y - c.y) < 500, `数据链应与消费者同行或上方: d1.y=${d1.y} c.y=${c.y}`)
  },
  results
)

// 5. 事件块纵向堆叠：两个入口块从上到下
test(
  '事件块纵向堆叠',
  () => {
    const nodes = [node(1, [outFlow(2)]), node(2, [inFlow()]), node(3, [outFlow(4)]), node(4, [inFlow()])]
    const r = autoLayout(nodes)
    const b1 = r.get(1)!
    const b2 = r.get(3)!
    assert.ok(b2.y > b1.y + 500, `事件块应从上到下: 块1 y=${b1.y}, 块2 y=${b2.y}`)
  },
  results
)

// 6. 叉子分支：分支留在当前行（与上游水平对齐），out[0] 同行，其余出口同列垂直排列
// （2026-08-11 tab-input 用户修正闭合）
test(
  '叉子分支',
  () => {
    const nodes = [
      node(1, [outFlow(2)]),
      node(2, [inFlow(), outFlow(3, 4)]),
      node(3, [inFlow()]),
      node(4, [inFlow()])
    ]
    const r = autoLayout(nodes)
    const br = r.get(2)!
    const o1 = r.get(3)!
    const o2 = r.get(4)!
    assert.ok(Math.abs(o1.y - br.y) < 10, `out[0] 应与分支同行: br=${br.y}, o1=${o1.y}`)
    assert.ok(o2.y > o1.y, `out[1] 应在下一行: o1=${o1.y}, o2=${o2.y}`)
    assert.ok(o1.x > br.x && Math.abs(o2.x - o1.x) < 10, `出口同列在分支右侧: br.x=${br.x}, o1.x=${o1.x}, o2.x=${o2.x}`)
  },
  results
)

// 7. lint 检出错排：竖排链 + 同行向左
test(
  'lint 检出错排',
  () => {
    const nodes = [
      node(1, [outFlow(2)], 0, 0),
      node(2, [inFlow(), outFlow(3)], 0, 600),
      node(3, [inFlow(), outFlow(4)], 0, 1200), // 竖排链
      node(4, [inFlow(), outFlow(5)], 800, 1200),
      node(5, [inFlow()], 400, 1200) // 同行向左
    ]
    const vs = checkLayout(nodes)
    const kinds = vs.map((v) => v.kind)
    assert.ok(kinds.includes('chain-vertical'), `应有竖排链违规: ${kinds}`)
    assert.ok(kinds.includes('flow-backward'), `应有同行向左违规: ${kinds}`)
  },
  results
)

// 8. lint 规范布局零违规（横向 + 从上到下 + 数据源贴着）
test(
  'lint 规范布局零违规',
  () => {
    const nodes = [
      node(1, [outFlow(2)], 0, 0),
      node(2, [inFlow(), outFlow(3)], 800, 0),
      node(3, [inFlow(), outFlow(4)], 1600, 0),
      node(4, [inFlow(), outFlow(5)], 2400, 0),
      node(5, [inFlow()], 3200, 0),
      node(6, [outParam()], 2600, 300), // 数据源贴着 n4
      node(7, [inFlow(), inParam(6)], 2400, 0)
    ]
    const vs = checkLayout(nodes)
    const bad = vs.filter((v) => !['island', 'overlap'].includes(v.kind))
    assert.deepStrictEqual(bad, [], `规范布局应零违规: ${JSON.stringify(vs)}`)
  },
  results
)

test(
  '长线自动升级为分叉线',
  () => {
    const nodes = longChain(28)
    const edits = planFlowUpgrade(nodes)
    assert.deepStrictEqual(edits, [
      { op: 'remove', node: 10, dst: 11 },
      { op: 'append', node: 1, dst: 11 },
      { op: 'remove', node: 20, dst: 21 },
      { op: 'append', node: 1, dst: 21 }
    ], `连接编辑应断开支叉: ${JSON.stringify(edits)}`)
    assert.deepStrictEqual(flowDst(nodes[0]), [2, 11, 21], '入口应分叉注册 3 条线')
    assert.deepStrictEqual(flowDst(nodes[9]), [], 'n10 应断开')
    assert.deepStrictEqual(flowDst(nodes[19]), [], 'n20 应断开')
    assert.deepStrictEqual(planFlowUpgrade(nodes), [], '幂等：二次升级无编辑')
  },
  results
)

// 10. 入口分叉布局：入口留行首，out[0] 同行（第一条线），其余出口各开新行（行首）
test(
  '入口分叉布局',
  () => {
    const nodes = [
      node(1, [outFlow(2, 11)]),
      node(2, [inFlow(), outFlow(3)]),
      node(3, [inFlow()]),
      node(11, [inFlow(), outFlow(12)]),
      node(12, [inFlow()])
    ]
    const r = autoLayout(nodes)
    const p1 = r.get(1)!
    const p2 = r.get(2)!
    const p11 = r.get(11)!
    assert.ok(p2.x > p1.x && Math.abs(p2.y - p1.y) < 10, `首线与入口同行: p1=(${p1.x},${p1.y}) p2=(${p2.x},${p2.y})`)
    assert.ok(Math.abs(p11.x - p1.x) < 10, `后续线行首与入口对齐: p11.x=${p11.x}`)
    assert.ok(p11.y > p1.y + 500, `后续线在下一行: p1.y=${p1.y}, p11.y=${p11.y}`)
    const p12 = r.get(12)!
    assert.ok(p12.x > p11.x && Math.abs(p12.y - p11.y) < 10, '第二线应横向展开')
  },
  results
)

// 11. 完整链路：超长链 → 升级分叉 → 三行布局（main 图 2026-08-11 用户坐标模式）
test(
  '超长链升级后三行布局',
  () => {
    const nodes = longChain(28)
    planFlowUpgrade(nodes)
    const r = autoLayout(nodes)
    const at = (i: number) => r.get(i)!
    const p1 = at(1)
    assert.deepStrictEqual([p1.x, p1.y], [0, 0], '入口在行首')
    assert.deepStrictEqual([at(2).x, at(2).y], [800, 0], '线A 同行')
    assert.deepStrictEqual([at(10).x, at(10).y], [7200, 0], '线A 尾')
    assert.deepStrictEqual([at(11).x, at(11).y], [0, 900], '线B 行首')
    assert.deepStrictEqual([at(20).x, at(20).y], [7200, 900], '线B 尾')
    assert.deepStrictEqual([at(21).x, at(21).y], [0, 1800], '线C 行首')
    assert.deepStrictEqual([at(28).x, at(28).y], [5600, 1800], '线C 尾')
  },
  results
)

// 12. line-align lint：入口分叉线行首对齐时零违规；不对齐报 line-align
test(
  'line-align 检查',
  () => {
    // 正例：线B 行首 x 与入口对齐（0），零违规
    const ok = [
      node(1, [outFlow(2, 11)], 0, 0),
      node(2, [inFlow()], 800, 0),
      node(11, [inFlow()], 0, 900)
    ]
    assert.deepStrictEqual(
      checkLayout(ok).filter((v) => v.kind === 'line-align'),
      [],
      '对齐时不应报 line-align'
    )
    // 负例：线B 行首 x=500 与入口 x=0 不对齐
    const bad = [
      node(1, [outFlow(2, 11)], 0, 0),
      node(2, [inFlow()], 800, 0),
      node(11, [inFlow()], 500, 900)
    ]
    const vs = checkLayout(bad)
    assert.ok(vs.some((v) => v.kind === 'line-align'), `应报 line-align: ${JSON.stringify(vs.map((v) => v.kind))}`)
  },
  results
)

const failed = results.filter(([, ok]) => !ok).length
console.log(`graph_layout_test: ${results.length - failed}/${results.length} passed`)
process.exit(failed > 0 ? 1 : 0)
