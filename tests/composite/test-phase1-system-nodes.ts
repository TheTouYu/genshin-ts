// @ts-nocheck
/**
 * Phase 1: 复合节点包装系统节点测试
 *
 * 覆盖参考文件中所有模式的系统节点封装:
 *   1. 双分支 (double_branch)      — 1 InFlow, 2 OutFlow, 1 InParam
 *   2. 有限循环 (finite_loop)       — 1 InFlow, 2 OutFlow, 2 InParam
 *   3. 顺序执行 (multiple_branches) — 1 InFlow, 4 OutFlow
 *
 */
import { g, buildServerGraphRegistriesIRDocuments } from '../../dist/src/runtime/core.js'
import { int, str, bool } from '../../dist/src/runtime/value.js'
import { irToGia } from '../../dist/src/compiler/ir_to_gia_transform/index.js'
import { decode_gia_file } from '../../dist/src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'
import { writeFileSync } from 'fs'

const PROTO_PATH = new URL('../../dist/src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto', import.meta.url).pathname
const OUT_DIR = './tests/composite/output'

// ═══════════════════════════════════════════════
// 模式 1: 双分支 — 条件判定
// ═══════════════════════════════════════════════

const doubleBranch = g.defineComposite('双分支', {
  inputs: { 条件: { type: 'bool' } },
  outputs: {},
  build(inputs: any, f: any) {
    f.registerExecNode('double_branch', [inputs['条件']])
    f.leaf(0)   // OutFlow[0] = "是"
    f.leaf(1)   // OutFlow[1] = "否"
    return {}
  }
})
console.log('双分支 id:', doubleBranch.id)

// ═══════════════════════════════════════════════
// 模式 2: 有限循环
// ═══════════════════════════════════════════════

const finiteLoop = g.defineComposite('有限循环', {
  inputs: { 循环起始值: { type: 'int' }, 循环终止值: { type: 'int' } },
  outputs: { 当前循环值: { type: 'int' } },
  build(inputs: any, f: any) {
    const ref = f.registerExecNode('finite_loop', [inputs['循环起始值'], inputs['循环终止值']])
    const loopValue = f.createOutParamValue('int', ref, 0)
    f.leaf(0)   // OutFlow[0] = 循环体
    f.leaf(1)   // OutFlow[1] = 循环完成
    return { 当前循环值: loopValue }
  }
})
console.log('有限循环 id:', finiteLoop.id)

// ═══════════════════════════════════════════════
// 模式 3: 顺序执行 — 1 入口 4 出口（multiple_branches 分叉）
// ═══════════════════════════════════════════════

const sequentialExec = g.defineComposite('顺序执行', {
  inputs: {},
  outputs: {},
  build(_inputs: any, f: any) {
    // 入口节点 — 作为分叉源
    f.registerExecNode('double_branch', [new bool(true)])

    // 4 个出口分支
    f.branchExec(0, { id: 0, type: 'exec', nodeType: 'double_branch', args: [] })
    f.branchExec(0, { id: 0, type: 'exec', nodeType: 'double_branch', args: [] })
    f.branchExec(0, { id: 0, type: 'exec', nodeType: 'double_branch', args: [] })
    f.branchExec(0, { id: 0, type: 'exec', nodeType: 'double_branch', args: [] })

    return {}
  }
})
console.log('顺序执行 id:', sequentialExec.id)

// ═══════════════════════════════════════════════
// 预捕获
// ═══════════════════════════════════════════════

g.server({ name: 'trigger' }).on('whenEntityIsCreated', (_e: any, f: any) => {})
buildServerGraphRegistriesIRDocuments({ defaultName: 'trigger' })

// ═══════════════════════════════════════════════
// 主图 — 调用所有三个复合，展示多分支连接
// ═══════════════════════════════════════════════

g.server({ name: 'main', graphId: 1073741911 })
  .on('whenEntityIsCreated', (_e: any, f: any) => {
    // 先调双分支 — 条件判定
    const br = f.callComposite(doubleBranch, { '条件': new bool(true) })
    f.connectOutFlow(br, 0, () => { f.printString('分支-是') })
    f.connectOutFlow(br, 1, () => { f.printString('分支-否') })

    // 调循环
    const lr = f.callComposite(finiteLoop, { '循环起始值': new int(1n), '循环终止值': new int(10n) })
    f.connectOutFlow(lr, 0, () => { f.printString('循环体执行') })
    f.connectOutFlow(lr, 1, () => { f.printString('循环完成') })

    // 调顺序执行
    const sr = f.callComposite(sequentialExec, {})
    f.connectOutFlow(sr, 0, () => { f.printString('步骤1结果') })
    f.connectOutFlow(sr, 1, () => { f.printString('步骤2结果') })
    // OutFlow[2] 和 OutFlow[3] 不用
  })

const docs = buildServerGraphRegistriesIRDocuments({ defaultName: 'main' })
const doc = docs[docs.length - 1]
console.log('IR nodes:', doc.nodes?.length)
doc.nodes?.forEach((n: any) => {
  const nextStr = Array.isArray(n.next)
    ? '[' + n.next.map((x: any) => typeof x === 'number' ? x : '{n:' + x.node_id + ',s:' + x.source_index + '}').join(',') + ']'
    : n.next
  console.log(`  id=${n.id} type=${n.type} next=${nextStr}`)
})

const outName = 'phase1_system_nodes'
const bytes = irToGia(doc, { graphId: 1073741911, name: outName, protoPath: PROTO_PATH })
const outPath = `${OUT_DIR}/${outName}.gia`
writeFileSync(outPath, Buffer.from(bytes))
console.log(`\n✅ 已生成: ${outPath}  (${bytes.length} 字节)`)

// ═══════════════════════════════════════════════
// 验证
// ═══════════════════════════════════════════════

const gen = decode_gia_file(outPath, PROTO_PATH)
const mainNodes = gen.graph?.graph?.inner?.graph?.nodes ?? []
const accs = gen.accessories ?? []

let ok = true

// 检查 accessories — 应该有三个 CompositeDef
console.log(`\naccessories: ${accs.length}, compositeDefs: ${accs.filter((a: any) => a.which === 12).length}`)

for (const a of accs) {
  if (a.which !== 12) continue
  const d = a.compositeDef?.inner?.def
  console.log(`\n  ${d?.name}:`)
  console.log(`    inflows=${d?.inflows?.length} outflows=${d?.outflows?.length} inputs=${d?.inputs?.length}`)
  console.log(`    inflows: ${(d?.inflows||[]).map((f: any) => `pinIndex=${f.pinIndex}`).join(', ')}`)
  console.log(`    outflows: ${(d?.outflows||[]).map((f: any) => `idx=${f.index?.index} pinIndex=${f.pinIndex}`).join(', ')}`)
  if (d?.name === '双分支' && d?.outflows?.length !== 2) { console.log('    ❌ 双分支应有 2 OutFlows'); ok = false }
  if (d?.name === '有限循环' && d?.outflows?.length !== 2) { console.log('    ❌ 有限循环应有 2 OutFlows'); ok = false }
  if (d?.name === '顺序执行' && d?.outflows?.length !== 4) { console.log('    ❌ 顺序执行应有 4 OutFlows'); ok = false }
}

// 检查 impl 图 compositePins
for (const a of accs) {
  if (a.which !== 9 || !a.graph) continue
  const ig = a.graph?.inner?.graph
  const kname: Record<number,string> = {1:'InFlow',2:'OutFlow',3:'InParam',4:'OutParam'}
  console.log(`\n  impl (${ig?.nodes?.length} nodes, ${ig?.compositePins?.length} pins):`)
  ig?.compositePins?.forEach((cp: any) => {
    console.log(`    ${kname[cp.outerPin?.kind] || '?'}[${cp.outerPin?.index}] -> nodeId=${cp.innerNodeId}`)
  })
}

// 检查主图复合调用节点
console.log('\n主图复合调用:')
mainNodes.forEach((n: any) => {
  if (n.genericId?.kind !== 22001) return
  const op = (n.pins || []).filter((p: any) => p.i1?.kind === 2)
  console.log(`  node[${n.nodeIndex}] (nodeId=${n.genericId?.nodeId}): ${op.length} OutFlow pins`)
  op.forEach((p: any) => {
    const targets = (p.connects||[]).map((c: any) => '→node'+c.id).join(', ')
    console.log(`    OutFlow[${p.i1?.index}] cpi=${p.compositePinIndex} → ${targets || '(none)'}`)
  })
})

if (ok) console.log('\n🏆 Phase 1 验证通过')
else { console.log('\n💥 存在失败项'); process.exit(1) }
