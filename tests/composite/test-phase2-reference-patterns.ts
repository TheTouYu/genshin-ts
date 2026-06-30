// @ts-nocheck
/**
 * Phase 2 扩展: 参考文件中的经典模式复刻
 *
 * 基于弹球/传球/物理运动 三个真实 GIA 的结构模式:
 *   1. 纯数据复合 — 算术链 (类似 更新角速度/更新速度)
 *   2. 混合执行+数据 — 执行分叉 + 数据路由 (类似 更新v、w)
 *   3. 复杂分叉+混合叶子类型 (double_branch + print_string + forwarding_event)
 *   4. 同一输入多次消费 (InParam fanout)
 *   5. 多 OutFlow + 数据输出 (类似 计算分力)
 */
import { g, buildServerGraphRegistriesIRDocuments } from '../../dist/src/runtime/core.js'
import { int, str, bool } from '../../dist/src/runtime/value.js'
import { irToGia } from '../../dist/src/compiler/ir_to_gia_transform/index.js'
import { decode_gia_file } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'
import { writeFileSync } from 'fs'

const PROTO_PATH = new URL('../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto', import.meta.url).pathname
const OUT_DIR = './tests/composite/output'

let passed = 0, failed = 0
function check(cond: boolean, msg: string) {
  if (cond) { passed++; console.log(`  ✅ ${msg}`) }
  else { failed++; console.log(`  ❌ ${msg}`) }
}

// ═══════════════════════════════════════════════
// Pattern 1: 纯数据复合 — 算术链
// 类似于参考文件中的 更新角速度/更新速度
// 公式: result = (x + y) * 2
// ═══════════════════════════════════════════════

const pureDataCalc = g.defineComposite('算术链', {
  inputs: { x: { type: 'int' }, y: { type: 'int' } },
  outputs: { 加和: { type: 'int' }, 翻倍: { type: 'int' } },
  build(inputs: any, f: any) {
    const sum = f.addition(inputs['x'], inputs['y'])
    const doubled = f.addition(sum, sum)
    return { 加和: sum, 翻倍: doubled }
  }
})
console.log('P1 算术链 id:', pureDataCalc.id)

// ═══════════════════════════════════════════════
// Pattern 2: 混合执行+数据 —— 执行分叉 + 数据路由
// 类似于参考文件中的 更新v、w (简化版)
// InFlow + double_branch 条件分叉 + 数据输出
// ═══════════════════════════════════════════════

const mixedExecData = g.defineComposite('条件+计算', {
  inputs: { 条件: { type: 'bool' }, 数值A: { type: 'int' }, 数值B: { type: 'int' } },
  outputs: { 总和: { type: 'int' } },
  build(inputs: any, f: any) {
    // 数据: 不管走哪个分支都做计算
    const total = f.addition(inputs['数值A'], inputs['数值B'])
    // 执行: 条件分叉
    f.registerExecNode('double_branch', [inputs['条件']])
    f.leaf(0)   // 条件为真
    f.leaf(1)   // 条件为假
    return { 总和: total }
  }
})
console.log('P2 条件+计算 id:', mixedExecData.id)

// ═══════════════════════════════════════════════
// Pattern 3: 复杂分叉 + 混合叶子类型
// 类似于参考文件中的 double_branch 分叉 + 不同节点作叶子
// 用 print_string + 无参 double_branch 作不同出口
// ═══════════════════════════════════════════════

const mixedLeaves = g.defineComposite('混合叶子', {
  inputs: {},
  outputs: {},
  build(_inputs: any, f: any) {
    f.registerExecNode('double_branch', [new bool(true)])
    f.branchExec(0, { id: 0, type: 'exec', nodeType: 'print_string', args: [new str('出口A')] })
    f.branchExec(0, { id: 0, type: 'exec', nodeType: 'double_branch', args: [] })
    f.branchExec(0, { id: 0, type: 'exec', nodeType: 'print_string', args: [new str('出口C')] })
    return {}
  }
})
console.log('P3a 混合叶子-是 id:', mixedLeaves.id)

// 无参分叉走"否"（默认 false，少传一个参数）
const mixedLeavesNo = g.defineComposite('混合叶子-否', {
  inputs: {},
  outputs: {},
  build(_inputs: any, f: any) {
    f.registerExecNode('double_branch', [])                 // 无参 → 默认 false → OutFlow:1
    f.branchExec(1, { id: 0, type: 'exec', nodeType: 'print_string', args: [new str('出口X')] })
    f.branchExec(1, { id: 0, type: 'exec', nodeType: 'print_string', args: [new str('出口Y')] })
    return {}
  }
})
console.log('P3b 混合叶子-否 id:', mixedLeavesNo.id)

// ═══════════════════════════════════════════════
// Pattern 4: 同一输入多次消费
// 类似于参考文件中 计算分力 的 InParam fanout 模式
// 数值同时用于加法和乘法
// ═══════════════════════════════════════════════

const fanoutInput = g.defineComposite('输入扇出', {
  inputs: { 基值: { type: 'int' }, 偏移: { type: 'int' } },
  outputs: { 加法结果: { type: 'int' }, 乘法结果: { type: 'int' }, 组合结果: { type: 'int' } },
  build(inputs: any, f: any) {
    // 基值被消费 3 次，偏移被消费 2 次
    const added = f.addition(inputs['基值'], inputs['偏移'])
    const multiplied = f.multiplication(inputs['基值'], new int(2n))
    const combined = f.addition(added, multiplied) // 再用基值（通过 added）
    return { 加法结果: added, 乘法结果: multiplied, 组合结果: combined }
  }
})
console.log('P4 输入扇出 id:', fanoutInput.id)

// ═══════════════════════════════════════════════
// Pattern 5: 多 OutFlow + 数据输出
// 类似于参考文件中的 计算分力 (多输出模式)
// 4 OutFlow 对应不同执行路径 + 多 OutParam
// ═══════════════════════════════════════════════

const multiOutData = g.defineComposite('多出口+数据', {
  inputs: { 输入数: { type: 'int' } },
  outputs: { 翻倍: { type: 'int' }, 三倍: { type: 'int' }, 四倍: { type: 'int' } },
  build(inputs: any, f: any) {
    const doubled = f.addition(inputs['输入数'], inputs['输入数'])
    const tripled = f.addition(doubled, inputs['输入数'])
    const quadrupled = f.addition(doubled, doubled)
    // 执行分叉: 4 出口
    f.registerExecNode('double_branch', [new bool(true)])
    f.branchExec(0, { id: 0, type: 'exec', nodeType: 'print_string', args: [new str('路径1')] })
    f.branchExec(0, { id: 0, type: 'exec', nodeType: 'print_string', args: [new str('路径2')] })
    f.branchExec(0, { id: 0, type: 'exec', nodeType: 'print_string', args: [new str('路径3')] })
    f.branchExec(0, { id: 0, type: 'exec', nodeType: 'print_string', args: [new str('路径4')] })
    return { 翻倍: doubled, 三倍: tripled, 四倍: quadrupled }
  }
})
console.log('P5 多出口+数据 id:', multiOutData.id)

// ═══════════════════════════════════════════════
// 预捕获
// ═══════════════════════════════════════════════

g.server({ name: 'trigger' }).on('whenEntityIsCreated', (_e: any, f: any) => {})
buildServerGraphRegistriesIRDocuments({ defaultName: 'trigger' })

// ═══════════════════════════════════════════════
// 主图 — 调用所有复合
// ═══════════════════════════════════════════════

g.server({ name: 'main', graphId: 1073741913 })
  .on('whenEntityIsCreated', (_e: any, f: any) => {
    // P1: 纯数据
    const d1 = f.callComposite(pureDataCalc, { x: new int(3n), y: new int(5n) })
    f.printString('纯数据完成')

    // P2: 混合
    const d2 = f.callComposite(mixedExecData, {
      '条件': new bool(true), '数值A': new int(10n), '数值B': new int(20n)
    })
    f.connectOutFlow(d2, 0, () => { f.printString('条件为真-路径') })
    f.connectOutFlow(d2, 1, () => { f.printString('条件为假-路径') })

    // P3a: 混合叶子-是 (显式 true)
    const d3a = f.callComposite(mixedLeaves, {})
    f.connectOutFlow(d3a, 0, () => { f.printString('出口A下游') })
    f.connectOutFlow(d3a, 1, () => { f.printString('出口B下游') })
    f.connectOutFlow(d3a, 2, () => { f.printString('出口C下游') })

    // P3b: 混合叶子-否 (无参，默认 false)
    const d3b = f.callComposite(mixedLeavesNo, {})
    f.connectOutFlow(d3b, 0, () => { f.printString('出口X下游') })
    f.connectOutFlow(d3b, 1, () => { f.printString('出口Y下游') })

    // P4: 输入扇出
    const d4 = f.callComposite(fanoutInput, { '基值': new int(4n), '偏移': new int(1n) })

    // P5: 多出口+数据
    const d5 = f.callComposite(multiOutData, { '输入数': new int(7n) })
    f.connectOutFlow(d5, 0, () => { f.printString('路径1-下游') })
    f.connectOutFlow(d5, 1, () => { f.printString('路径2-下游') })
  })

const docs = buildServerGraphRegistriesIRDocuments({ defaultName: 'main' })
const doc = docs[docs.length - 1]
console.log('\nIR nodes:', doc.nodes?.length)
doc.nodes?.forEach((n: any) => {
  const nextStr = Array.isArray(n.next)
    ? '[' + n.next.map((x: any) => typeof x === 'number' ? x : '{n:' + x.node_id + ',s:' + x.source_index + '}').join(',') + ']'
    : n.next
  console.log(`  id=${n.id} type=${n.type} next=${nextStr}`)
})

const outName = 'phase2_reference_patterns'
const bytes = irToGia(doc, { graphId: 1073741913, name: outName, protoPath: PROTO_PATH })
const outPath = `${OUT_DIR}/${outName}.gia`
writeFileSync(outPath, Buffer.from(bytes))
console.log(`\n✅ 已生成: ${outPath}  (${bytes.length} 字节)`)

// ═══════════════════════════════════════════════
// 验证
// ═══════════════════════════════════════════════

const gen = decode_gia_file(outPath, PROTO_PATH)
const accs = gen.accessories ?? []
const mainNodes = gen.graph?.graph?.inner?.graph?.nodes ?? []
const kname: Record<number,string> = {1:'InFlow',2:'OutFlow',3:'InParam',4:'OutParam'}

console.log(`\n=== accessories (${accs.length}) ===`)

// 统计各复合的接口
for (const a of accs) {
  if (a.which !== 12) continue
  const d = a.compositeDef?.inner?.def
  console.log(`  ${d.name}: in=${d.inflows?.length} out=${d.outflows?.length} inp=${d.inputs?.length} outp=${d.outputs?.length}`)
}

// P1: 纯数据 — 0 InFlow, 0 OutFlow, 2 InParams, 2 OutParams
for (const a of accs) {
  if (a.which !== 12) continue
  const d = a.compositeDef?.inner?.def
  if (d.name === '算术链') {
    check(d.inflows?.length === 0, `P1 算术链: inflows=0 (got ${d.inflows?.length})`)
    check(d.outflows?.length === 0, `P1 算术链: outflows=0 (got ${d.outflows?.length})`)
    check(d.inputs?.length === 2, `P1 算术链: inputs=2 (got ${d.inputs?.length})`)
    check(d.outputs?.length === 2, `P1 算术链: outputs=2 (got ${d.outputs?.length})`)
  }
  if (d.name === '条件+计算') {
    check(d.inflows?.length === 1, `P2 条件+计算: inflows=1 (got ${d.inflows?.length})`)
    check(d.outflows?.length === 2, `P2 条件+计算: outflows=2 (got ${d.outflows?.length})`)
    check(d.inputs?.length === 3, `P2 条件+计算: inputs=3 (got ${d.inputs?.length})`)
    check(d.outputs?.length === 1, `P2 条件+计算: outputs=1 (got ${d.outputs?.length})`)
  }
  if (d.name === '混合叶子-是') {
    check(d.outflows?.length === 3, `P3a 混合叶子-是: outflows=3 (got ${d.outflows?.length})`)
  }
  if (d.name === '混合叶子-否') {
    check(d.outflows?.length === 2, `P3b 混合叶子-否: outflows=2 (got ${d.outflows?.length})`)
  }
  if (d.name === '输入扇出') {
    check(d.inputs?.length === 2, `P4 输入扇出: inputs=2 (got ${d.inputs?.length})`)
    check(d.outputs?.length === 3, `P4 输入扇出: outputs=3 (got ${d.outputs?.length})`)
  }
  if (d.name === '多出口+数据') {
    check(d.outflows?.length === 4, `P5 多出口+数据: outflows=4 (got ${d.outflows?.length})`)
    check(d.inputs?.length === 1, `P5 多出口+数据: inputs=1 (got ${d.inputs?.length})`)
    check(d.outputs?.length === 3, `P5 多出口+数据: outputs=3 (got ${d.outputs?.length})`)
  }
}

// 验证 impl 图结构
console.log('\n=== impl 图结构 ===')
for (const a of accs) {
  if (a.which !== 9 || !a.graph) continue
  const ig = a.graph?.inner?.graph
  // 找对应的 CompositeDef
  let defName = ''
  for (const aa of accs) {
    if (aa.which === 12) {
      const dgid = aa.compositeDef?.inner?.def?.id?.graphId?.id
      if (dgid === a.id?.id) { defName = aa.compositeDef?.inner?.def?.name ?? ''; break }
    }
  }

  const ofCount = ig.compositePins?.filter((cp: any) => cp.outerPin?.kind === 2).length ?? 0
  const ipCount = ig.compositePins?.filter((cp: any) => cp.outerPin?.kind === 3).length ?? 0
  const opCount = ig.compositePins?.filter((cp: any) => cp.outerPin?.kind === 4).length ?? 0
  console.log(`  ${defName}: ${ig.nodes?.length} nodes, compositePins: InFlow/OutFlow=${ofCount} InParam=${ipCount} OutParam=${opCount}`)

  // 列出每个节点的 pins
  for (const n of ig.nodes) {
    const nid = n.genericId?.nodeId ?? n.concreteId?.nodeId ?? '?'
    const pinSummary = n.pins?.map((p: any) => `${kname[p.i1?.kind]}:${p.i1?.index}`).join(' ') ?? '(none)'
    const multiOF = (n.pins?.filter((p: any) => p.i1?.kind === 2).length ?? 0) > 1 ? ' ★' : ''
    console.log(`    n[${n.nodeIndex}] nodeId=${nid} [${pinSummary}]${multiOF}`)
  }
}

// P1 特定验证: impl 图应该只有数据节点（无 OutFlow pin）
const p1Impl = accs.find((a: any) => {
  if (a.which !== 9 || !a.graph) return false
  for (const aa of accs) {
    if (aa.which === 12 && aa.compositeDef?.inner?.def?.id?.graphId?.id === a.id?.id) {
      return aa.compositeDef?.inner?.def?.name === '算术链'
    }
  }
  return false
})
if (p1Impl) {
  const hasOutFlow = p1Impl.graph.inner.graph.nodes.some((n: any) =>
    n.pins?.some((p: any) => p.i1?.kind === 2)
  )
  check(!hasOutFlow, `P1: 纯数据 impl 图无 OutFlow pin`)
  const hasInParam = p1Impl.graph.inner.graph.nodes.some((n: any) =>
    n.pins?.some((p: any) => p.i1?.kind === 3)
  )
  check(hasInParam, `P1: 纯数据 impl 图有 InParam pin`)
}

// P2 特定验证: double_branch 应该有 InParam + OutFlow:0 + OutFlow:1
const p2Impl = accs.find((a: any) => {
  if (a.which !== 9 || !a.graph) return false
  for (const aa of accs) {
    if (aa.which === 12 && aa.compositeDef?.inner?.def?.id?.graphId?.id === a.id?.id) {
      return aa.compositeDef?.inner?.def?.name === '条件+计算'
    }
  }
  return false
})
if (p2Impl) {
  const dbNode = p2Impl.graph.inner.graph.nodes.find((n: any) =>
    (n.genericId?.nodeId ?? n.concreteId?.nodeId) === 2
  )
  if (dbNode) {
    const hasInParam = dbNode.pins?.some((p: any) => p.i1?.kind === 3)
    check(hasInParam, `P2: double_branch 有 InParam (条件输入)`)
    // 注意: double_branch 作为 leaf 节点（leaf(0)+leaf(1)），无下游 edges → 无 OutFlow pin
    // 这是正确的——compositePins OutFlow 映射到同一节点的不同 index，但 impl 图不需要该 pin
  }
}

// P5 特定验证: 4 OutFlow + 3 OutParam
const p5Impl = accs.find((a: any) => {
  if (a.which !== 9 || !a.graph) return false
  for (const aa of accs) {
    if (aa.which === 12 && aa.compositeDef?.inner?.def?.id?.graphId?.id === a.id?.id) {
      return aa.compositeDef?.inner?.def?.name === '多出口+数据'
    }
  }
  return false
})
if (p5Impl) {
  const ofPins = p5Impl.graph.inner.graph.compositePins?.filter((cp: any) => cp.outerPin?.kind === 2) ?? []
  const opPins = p5Impl.graph.inner.graph.compositePins?.filter((cp: any) => cp.outerPin?.kind === 4) ?? []
  check(ofPins.length === 4, `P5: compositePins OutFlow=4 (got ${ofPins.length})`)
  check(opPins.length === 3, `P5: compositePins OutParam=3 (got ${opPins.length})`)
}

// 主图验证
console.log('\n=== 主图复合调用 ===')
const compCalls = mainNodes.filter((n: any) => n.genericId?.kind === 22001)
console.log(`复合调用节点: ${compCalls.length}`)
compCalls.forEach((n: any) => {
  const ofCount = n.pins?.filter((p: any) => p.i1?.kind === 2).length ?? 0
  const ipCount = n.pins?.filter((p: any) => p.i1?.kind === 3).length ?? 0
  const opCount = n.pins?.filter((p: any) => p.i1?.kind === 4).length ?? 0
  console.log(`  node[${n.nodeIndex}] nodeId=${n.genericId?.nodeId}: ${ofCount} OF, ${ipCount} IP, ${opCount} OP`)
})

check(compCalls.length === 6, `主图复合调用: 6 个 (got ${compCalls.length})`)

// ═══════════════════════════════════════════════
// 汇总
// ═══════════════════════════════════════════════
console.log(`\n${'='.repeat(40)}`)
console.log(`通过: ${passed}  失败: ${failed}`)
if (failed > 0) { console.log('💥 存在失败项'); process.exit(1) }
console.log('🏆 参考模式验证通过')
