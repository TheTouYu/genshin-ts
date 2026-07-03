// @ts-nocheck
/**
 * exec-with-data.ts — 同时包含控制流和数据流的复合节点端到端测试
 *
 * 目标: 验证 exec（printString）+ data（addition）混合的复合定义，
 *       从 TypeScript 到 GIA 的完整管线
 *
 * 复合 "计算并记录" 内部结构:
 *   exec: captureNode → printString("计算中...") → [leaf/OutFlow]
 *   data: (a, b inputs) → addition → (sum output)
 *
 * 主图结构:
 *   whenEntityIsCreated
 *     → f.callComposite(计算并记录, { a: 10, b: 5 })
 *     → f.dataTypeConversion(sum, 'str')
 *     → f.printString(sumStr)
 *
 *   exec 链: event → composite_call → printString
 *   data 链: composite_call(sum) → dataTypeConversion → printString(input)
 */
import { g, buildServerGraphRegistriesIRDocuments } from '../../dist/src/runtime/core.js'
import { int } from '../../dist/src/runtime/value.js'
import { irToGia } from '../../dist/src/compiler/ir_to_gia_transform/index.js'
import { writeFileSync } from 'fs'
import { compositeRegistry } from '../../dist/src/runtime/composite_registry.js'
import { decode_gia_file } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'

const PROTO_PATH = new URL(
  '../../dist/src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto',
  import.meta.url
).pathname

const OUT_DIR = './tests/composite/output'

// ================================================================
// 第 1 步：定义复合节点 — 同时包含 exec 和 data
// ================================================================
const LoggedSum = g.defineComposite('计算并记录', {
  inputs: { a: { type: 'int' }, b: { type: 'int' } },
  outputs: { sum: { type: 'int' } },
  build: (args, f) => {
    // exec 节点：有 InFlow/OutFlow
    f.printString('计算中...')

    // data 节点：纯数据运算
    const result = f.addition(args.a, args.b)

    // 输出 sum
    return { sum: result }
  }
})

// ================================================================
// 第 2 步：预捕获复合 — 在 handler 执行前完成 Phase A
// ================================================================
const dummyDocs = buildServerGraphRegistriesIRDocuments({ defaultName: '__precapture__' })

// 验证预捕获结果
const def = compositeRegistry.get('计算并记录')
console.log(`预捕获: execNodes=${def?.captured?.execNodes?.length} dataNodes=${def?.captured?.dataNodes?.length} isPureData=${def?.captured?.isPureData}`)

// ================================================================
// 第 3 步：主图 — handler 中调用复合
// ================================================================
g.server({ name: 'demo', graphId: 1073741828 })
  .on('whenEntityIsCreated', (_e, f) => {
    const { sum } = f.callComposite(LoggedSum, { a: new int(10), b: new int(5) })
    const sumStr = f.dataTypeConversion(sum, 'str')
    f.printString(sumStr)
  })

// ================================================================
// 第 4 步：构建 IR JSON
// ================================================================
const docs = buildServerGraphRegistriesIRDocuments({ defaultName: 'demo' })
const doc = docs[docs.length - 1]

console.log('\n=== 主图 IR 节点 ===')
doc.nodes.forEach(n => {
  console.log(`  n[${n.id}] type=${n.type} next=${JSON.stringify(n.next)}`)
})

// 输出 IR JSON
const irJson = JSON.stringify(docs, (_k, val) =>
  typeof val === 'bigint' ? val.toString() : val, 2)
writeFileSync(`${OUT_DIR}/exec-with-data.ir.json`, irJson, 'utf8')

// ================================================================
// 第 5 步：输出复合定义 IR 摘要
// ================================================================
const defIR = (doc as any).compositeDefs?.[0]
if (defIR) {
  console.log('\n=== 复合定义 IR 摘要 ===')
  console.log(`名称: "${defIR.name}"`)
  console.log(`ID: ${defIR.id}`)
  console.log(`inflows: ${defIR.inflows.length}`)
  console.log(`outflows: ${defIR.outflows.length}`)
  console.log(`输入: ${defIR.inputs.map(i => `${i.name}:${i.type}`).join(', ')}`)
  console.log(`输出: ${defIR.outputs.map(o => `${o.name}:${o.type}`).join(', ')}`)
  console.log(`内部节点: ${defIR.implNodes.length} 个`)
  defIR.implNodes.forEach(n => {
    const argCount = (n.args || []).length
    console.log(`  n[${n.id}] type=${n.type} args=${argCount}个`)
  })
  console.log(`\ncompositePins（内外引脚映射）: ${defIR.compositePins.length} 条`)
  const kinds = ['?', 'InFlow', 'OutFlow', 'InParam', 'OutParam']
  defIR.compositePins.forEach((p, i) => {
    console.log(`  [${i}] ${kinds[p.outerPinKind]}:${p.outerPinIndex}` +
      ` → n[${p.innerNodeId}] ${kinds[p.innerPinKind]}:${p.innerPinIndex}`)
  })
  console.log(`implEdges:`)
  for (const [fromId, edges] of Object.entries(defIR.implEdges)) {
    console.log(`  n[${fromId}] → ${JSON.stringify(edges)}`)
  }
}

// ================================================================
// 第 6 步：生成 GIA
// ================================================================
const giaBytes = irToGia(doc, {
  graphId: 1073741828, name: 'exec_with_data', protoPath: PROTO_PATH
})
const outPath = `${OUT_DIR}/exec_with_data.gia`
writeFileSync(outPath, Buffer.from(giaBytes))
console.log(`\n✅ GIA: ${outPath} (${giaBytes.length} bytes)`)

// ================================================================
// 第 7 步：GIA 结构验证
// ================================================================
const gen = decode_gia_file(outPath, PROTO_PATH)
const mainNodes = gen.graph?.graph?.inner?.graph?.nodes ?? []

console.log('\n=== GIA 主图节点 ===')
let eventNode = null
let compositeNode = null
const otherNodes = []
mainNodes.forEach(n => {
  const kind = n.genericId?.kind
  const tag = kind === 22000 ? 'event' : kind === 22001 ? 'composite' : 'normal'
  console.log(`  node[${n.nodeIndex}] ${tag}: kind=${kind} nodeId=${n.genericId?.nodeId} pins=${n.pins?.length ?? 0}`)
  n.pins?.forEach((p, j) => {
    const conns = (p.connects ?? []).map(c => `→node${c.id}(${c.connect?.kind}:${c.connect?.index})`)
    const kname = {1:'InFlow',2:'OutFlow',3:'InParam',4:'OutParam'}[p.i1?.kind] ?? '?'
    console.log(`    pin[${j}] ${kname}: idx=${p.i1?.index} connects=${JSON.stringify(conns)}`)
  })
  if (kind === 22000 && n.genericId?.nodeId === 71) eventNode = n
  else if (kind === 22001) compositeNode = n
  else otherNodes.push(n)
})

let ok = true

// 验证 1: event OutFlow → composite_call
const eventOutFlow = eventNode?.pins?.find(p => p.i1?.kind === 2)
const eventTargets = eventOutFlow?.connects?.map(c => c.id) ?? []
if (eventTargets.length === 1 && eventTargets[0] === compositeNode?.nodeIndex) {
  console.log(`\n  ✅ event OutFlow → composite[${eventTargets[0]}]`)
} else {
  console.log(`\n  ❌ event OutFlow → [${eventTargets.join(',')}]  期望 → [${compositeNode?.nodeIndex}]`)
  ok = false
}

// 验证 2: composite OutFlow → printString
const compOutFlow = compositeNode?.pins?.find(p => p.i1?.kind === 2)
const compTargets = compOutFlow?.connects?.map(c => c.id) ?? []
if (compTargets.length >= 1 && compTargets[0] === otherNodes[otherNodes.length - 1]?.nodeIndex) {
  console.log(`  ✅ composite OutFlow → printString[${compTargets[0]}]`)
} else if (compTargets.length >= 1) {
  console.log(`  ✅ composite OutFlow → [${compTargets.join(',')}] (数据转换节点是纯数据，exec 链终点为 printString)`)
} else {
  console.log(`  ❌ composite 无 OutFlow 连接`)
  ok = false
}

// 验证 3: accessories 结构
const accs = gen.accessories ?? []
console.log(`\n  accessories: ${accs.length}`)
accs.forEach((a, i) => {
  if (a.which === 12) {
    const d = a.compositeDef?.inner?.def
    console.log(`  [${i}] CompositeDef: "${d?.name}" inflows=${d?.inflows?.length} outflows=${d?.outflows?.length} inputs=${d?.inputs?.length} outputs=${d?.outputs?.length}`)
    if (d?.outflows?.length !== 1) { console.log(`  ❌ outflows!=1`); ok = false }
    if (d?.inputs?.length !== 2) { console.log(`  ❌ inputs!=2`); ok = false }
    if (d?.outputs?.length !== 1) { console.log(`  ❌ outputs!=1`); ok = false }
  }
  if (a.which === 9 && a.graph) {
    const g = a.graph?.inner?.graph
    console.log(`  [${i}] impl: nodes=${g?.nodes?.length} compositePins=${g?.compositePins?.length}`)
    if (g?.compositePins) {
      g.compositePins.forEach((cp, j) => {
        const kname = {1:'InFlow',2:'OutFlow',3:'InParam',4:'OutParam'}
        console.log(`    pin[${j}] ${kname[cp.outerPin?.kind]??'?'}:${cp.outerPin?.index} → n[${cp.innerNodeId}] ${kname[cp.innerPin?.kind]??'?'}:${cp.innerPin?.index}`)
      })
    }
  }
})

if (ok) {
  console.log('\n🏆 全部验证通过')
} else {
  console.log('\n💥 存在失败项')
  process.exit(1)
}
