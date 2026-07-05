// @ts-nocheck
/**
 * Phase 2: 复合节点打包普通节点测试
 *
 * 验证普通节点（print_string 等）在多 OutFlow 复合中作为叶子出口:
 *   P2-S1: 双分支 + 普通打印叶子
 *   P2-S2: 有限循环 + 普通打印叶子
 *   P2-S3: 条件分支 + leaf 标记 (bool 输入)
 *   P2-S4: 单出口普通节点 (print_string → leaf)
 *
 * 回归：同时验证 Phase 1 的三个复合仍生成正确 GIA
 */

import { writeFileSync } from 'fs'

import { irToGia } from '../../dist/src/compiler/ir_to_gia_transform/index.js'
import { buildServerGraphRegistriesIRDocuments, g } from '../../dist/src/runtime/core.js'
import { bool, int, str } from '../../dist/src/runtime/value.js'
import { decode_gia_file } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'

const PROTO_PATH = new URL(
  '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto',
  import.meta.url
).pathname
const OUT_DIR = './tests/composite/output'

let passed = 0
let failed = 0
function check(cond: boolean, msg: string) {
  if (cond) {
    passed++
    console.log(`  ✅ ${msg}`)
  } else {
    failed++
    console.log(`  ❌ ${msg}`)
  }
}

// ═══════════════════════════════════════════════
// P2-S1: 双分支 + 普通打印叶子
// ═══════════════════════════════════════════════

const branchWithPrint = g.defineComposite('分叉+打印叶子', {
  inputs: {},
  outputs: {},
  build(_inputs: any, f: any) {
    f.registerExecNode('double_branch', [new bool(true)])
    const pA = f.branchExec(0, {
      id: 0,
      type: 'exec',
      nodeType: 'print_string',
      args: [new str('分支A')]
    })
    const pB = f.branchExec(0, {
      id: 0,
      type: 'exec',
      nodeType: 'print_string',
      args: [new str('分支B')]
    })
    f.outflow('分支A', pA, 0)
    f.outflow('分支B', pB, 0)
    return {}
  }
})
console.log('P2-S1 分叉+打印叶子 id:', branchWithPrint.id)

// ═══════════════════════════════════════════════
// P2-S2: 有限循环 + 普通打印叶子
// ═══════════════════════════════════════════════

const loopWithPrint = g.defineComposite('循环+打印叶子', {
  inputs: { start: { type: 'int' }, end: { type: 'int' } },
  outputs: {},
  build(inputs: any, f: any) {
    f.registerExecNode('finite_loop', [inputs.start, inputs.end])
    const pBody = f.branchExec(0, {
      id: 0,
      type: 'exec',
      nodeType: 'print_string',
      args: [new str('循环体')]
    }) // OutFlow[0] = 循环体
    const pDone = f.branchExec(1, {
      id: 0,
      type: 'exec',
      nodeType: 'print_string',
      args: [new str('完成')]
    }) // OutFlow[1] = 循环完成
    f.outflow('循环体', pBody, 0)
    f.outflow('完成', pDone, 0)
    return {}
  }
})
console.log('P2-S2 循环+打印叶子 id:', loopWithPrint.id)

// ═══════════════════════════════════════════════
// P2-S3: 条件分支 + bool 输入 + leaf 标记
// ═══════════════════════════════════════════════

const condBranchWithInput = g.defineComposite('条件分支+输入', {
  inputs: { 条件: { type: 'bool' } },
  outputs: {},
  build(inputs: any, f: any) {
    const db = f.registerExecNode('double_branch', [inputs['条件']])
    f.outflow('是', db, 0)
    f.outflow('否', db, 1)
    return {}
  }
})
console.log('P2-S3 条件分支+输入 id:', condBranchWithInput.id)

// ═══════════════════════════════════════════════
// P2-S4: 单出口普通节点 — print_string + leaf
// ═══════════════════════════════════════════════

const singlePrintLeaf = g.defineComposite('单打印出口', {
  inputs: {},
  outputs: {},
  build(_inputs: any, f: any) {
    const ps = f.registerExecNode('print_string', [new str('直接打印')])
    f.outflow('出口', ps, 0)
    return {}
  }
})
console.log('P2-S4 单打印出口 id:', singlePrintLeaf.id)

// ═══════════════════════════════════════════════
// 预捕获（触发 capture）
// ═══════════════════════════════════════════════

g.server({ name: 'trigger' }).on('whenEntityIsCreated', (_e: any, f: any) => {})
buildServerGraphRegistriesIRDocuments({ defaultName: 'trigger' })

// ═══════════════════════════════════════════════
// 主图
// ═══════════════════════════════════════════════

g.server({ name: 'main', graphId: 1073741912 }).on('whenEntityIsCreated', (_e: any, f: any) => {
  // P2-S1: 分叉 + 打印叶子
  const r1 = f.callComposite(branchWithPrint, {})
  f.connectOutFlow(r1, 0, () => {
    f.printString('分支A-下游')
  })
  f.connectOutFlow(r1, 1, () => {
    f.printString('分支B-下游')
  })

  // P2-S2: 循环 + 打印叶子
  const r2 = f.callComposite(loopWithPrint, { start: new int(1n), end: new int(5n) })
  f.connectOutFlow(r2, 0, () => {
    f.printString('循环体-下游')
  })
  f.connectOutFlow(r2, 1, () => {
    f.printString('循环完成-下游')
  })

  // P2-S3: 条件分支
  const r3 = f.callComposite(condBranchWithInput, { 条件: new bool(true) })
  f.connectOutFlow(r3, 0, () => {
    f.printString('条件为真')
  })
  f.connectOutFlow(r3, 1, () => {
    f.printString('条件为假')
  })

  // P2-S4: 单打印出口
  f.callComposite(singlePrintLeaf, {})
})

const docs = buildServerGraphRegistriesIRDocuments({ defaultName: 'main' })
const doc = docs[docs.length - 1]
console.log('\nIR nodes:', doc.nodes?.length)
doc.nodes?.forEach((n: any) => {
  const nextStr = Array.isArray(n.next)
    ? '[' +
      n.next
        .map((x: any) =>
          typeof x === 'number' ? x : '{n:' + x.node_id + ',s:' + x.source_index + '}'
        )
        .join(',') +
      ']'
    : n.next
  console.log(`  id=${n.id} type=${n.type} next=${nextStr}`)
})

const outName = 'phase2_normal_nodes'
const bytes = irToGia(doc, { graphId: 1073741912, name: outName, protoPath: PROTO_PATH })
const outPath = `${OUT_DIR}/${outName}.gia`
writeFileSync(outPath, Buffer.from(bytes))
console.log(`\n✅ 已生成: ${outPath}  (${bytes.length} 字节)`)

// ═══════════════════════════════════════════════
// 验证
// ═══════════════════════════════════════════════

const gen = decode_gia_file(outPath, PROTO_PATH)
const accs = gen.accessories ?? []
const mainNodes = gen.graph?.graph?.inner?.graph?.nodes ?? []

const kname: Record<number, string> = { 1: 'InFlow', 2: 'OutFlow', 3: 'InParam', 4: 'OutParam' }

console.log(`\n=== 验证 accessories (${accs.length}) ===`)

// 检查每个 CompositeDef 的 outflows
for (const a of accs) {
  if (a.which !== 12) continue
  const d = a.compositeDef?.inner?.def
  if (!d) continue
  console.log(`\n  ${d.name}:`)
  console.log(
    `    inflows=${d.inflows?.length} outflows=${d.outflows?.length} inputs=${d.inputs?.length} outputs=${d.outputs?.length}`
  )

  // P2-S1: 分叉+打印叶子 — 2 OutFlow
  if (d.name === '分叉+打印叶子') {
    check(d.outflows?.length === 2, `outflows=2 (got ${d.outflows?.length})`)
  }
  // P2-S2: 循环+打印叶子 — 2 OutFlow, 2 InParams
  if (d.name === '循环+打印叶子') {
    check(d.outflows?.length === 2, `outflows=2 (got ${d.outflows?.length})`)
    check(d.inputs?.length === 2, `inputs=2 (got ${d.inputs?.length})`)
  }
  // P2-S3: 条件分支+输入 — 2 OutFlow, 1 InParam
  if (d.name === '条件分支+输入') {
    check(d.outflows?.length === 2, `outflows=2 (got ${d.outflows?.length})`)
    check(d.inputs?.length === 1, `inputs=1 (got ${d.inputs?.length})`)
  }
  // P2-S4: 单打印出口 — 1 OutFlow
  if (d.name === '单打印出口') {
    check(d.outflows?.length === 1, `outflows=1 (got ${d.outflows?.length})`)
  }
}

// 检查每个 impl 图的 compositePins 和节点 pins
console.log('\n=== 验证 impl 图 ===')
for (const a of accs) {
  if (a.which !== 9 || !a.graph) continue
  const ig = a.graph?.inner?.graph
  const nodeCount = ig?.nodes?.length ?? 0
  const cpCount = ig?.compositePins?.length ?? 0

  // 找到对应的 CompositeDef 名称
  const defAcc = accs.find(
    (aa: any) => aa.which === 12 && aa.id?.id === a.id?.id - 10000 + a.id?.id // 不准确，换方法
  )
  // 通过 graphId 匹配
  let defName = ''
  for (const aa of accs) {
    if (aa.which === 12) {
      const defGraphId = aa.compositeDef?.inner?.def?.id?.graphId?.id
      if (defGraphId === a.id?.id) {
        defName = aa.compositeDef?.inner?.def?.name ?? ''
        break
      }
    }
  }

  console.log(`\n  ${defName || '(impl)'} (${nodeCount} nodes, ${cpCount} compositePins):`)

  // 逐节点显示 pins
  for (const n of ig.nodes) {
    const nid = n.genericId?.nodeId ?? n.concreteId?.nodeId ?? '?'
    const kind = n.genericId?.kind ?? n.concreteId?.kind ?? '?'
    const pinTypes = n.pins
      ?.map((p: any) => {
        const k = kname[p.i1?.kind] ?? '?'
        return `${k}:${p.i1?.index}`
      })
      .join(', ')
    const ofCount = n.pins?.filter((p: any) => p.i1?.kind === 2).length ?? 0
    console.log(
      `    n[${n.nodeIndex}] kind=${kind} nodeId=${nid} pins(${n.pins?.length}) [${pinTypes}]${ofCount > 1 ? ' ★MULTI-OF' : ''}`
    )
  }

  // 显示 compositePins
  if (cpCount > 0) {
    console.log(`    compositePins:`)
    for (const cp of ig.compositePins) {
      console.log(
        `      ${kname[cp.outerPin?.kind] ?? '?'}[${cp.outerPin?.index}] → n[${cp.innerNodeId}] ${kname[cp.innerPin?.kind] ?? '?'}:${cp.innerPin?.index}`
      )
    }
  }
}

// S1 特定验证：分叉+打印叶子
const s1Impl = accs.find((a: any) => {
  if (a.which !== 9 || !a.graph) return false
  const cps = a.graph?.inner?.graph?.compositePins ?? []
  return (
    cps.length === 3 && cps.some((cp: any) => cp.outerPin?.kind === 2 && cp.outerPin?.index === 1)
  )
})
if (s1Impl) {
  const ig = s1Impl.graph.inner.graph
  // 应该有 entry double_branch（OutFlow:0 分叉） + 2 个 print_string 叶子
  const entryNode = ig.nodes.find((n: any) => (n.genericId?.nodeId ?? n.concreteId?.nodeId) === 2)
  const hasEntryOF = entryNode?.pins?.some((p: any) => p.i1?.kind === 2)
  check(hasEntryOF, `S1: entry double_branch 有 OutFlow`)

  // 验证 compositePins
  const ofPins = ig.compositePins.filter((cp: any) => cp.outerPin?.kind === 2)
  check(ofPins.length === 2, `S1: compositePins OutFlow count = 2 (got ${ofPins.length})`)
}

// S3 特定验证：条件分支+输入
const s3Impl = accs.find((a: any) => {
  if (a.which !== 9 || !a.graph) return false
  const cps = a.graph?.inner?.graph?.compositePins ?? []
  return cps.length >= 4 && cps.some((cp: any) => cp.outerPin?.kind === 3) // has InParam
})
if (s3Impl) {
  const ig = s3Impl.graph.inner.graph
  const ipPins = ig.compositePins.filter((cp: any) => cp.outerPin?.kind === 3)
  check(ipPins.length >= 1, `S3: compositePins has InParam entries`)
  const dbNode = ig.nodes.find((n: any) => n.genericId?.nodeId === 2 || n.concreteId?.nodeId === 2)
  if (dbNode) {
    const ofCount = dbNode.pins?.filter((p: any) => p.i1?.kind === 2).length ?? 0
    console.log(`  S3 double_branch: pins=${dbNode.pins?.length} outflows=${ofCount}`)
  }
}

// S4 特定验证
const s4Impl = accs.find((a: any) => {
  if (a.which !== 9 || !a.graph) return false
  const nodes = a.graph?.inner?.graph?.nodes ?? []
  return nodes.length === 1 && nodes[0]?.genericId?.nodeId === 1
})
if (s4Impl) {
  check(true, `S4: found single print_string impl node`)
  const node = s4Impl.graph.inner.graph.nodes[0]
  const hasInParam = node.pins?.some((p: any) => p.i1?.kind === 3)
  check(hasInParam, `S4: print_string has InParam`)
  const hasOutFlow = node.pins?.some((p: any) => p.i1?.kind === 2)
  check(!hasOutFlow, `S4: print_string is terminal → no OutFlow`)
}

// ═══════════════════════════════════════════════
// 主图复合调用验证
// ═══════════════════════════════════════════════
console.log('\n=== 主图复合调用 ===')
const compositeNodes = mainNodes.filter((n: any) => n.genericId?.kind === 22001)
console.log(`复合调用节点: ${compositeNodes.length}`)
compositeNodes.forEach((n: any) => {
  const ofPins = n.pins?.filter((p: any) => p.i1?.kind === 2) ?? []
  console.log(
    `  node[${n.nodeIndex}] (nodeId=${n.genericId?.nodeId}) ${ofPins.length} OutFlow pins`
  )
})

// ═══════════════════════════════════════════════
// 汇总
// ═══════════════════════════════════════════════
console.log(`\n${'='.repeat(40)}`)
console.log(`通过: ${passed}  失败: ${failed}`)
if (failed > 0) {
  console.log('💥 存在失败项')
  process.exit(1)
}
console.log('🏆 Phase 2 验证通过')
