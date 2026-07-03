// @ts-nocheck
/**
 * demo_addsub2.ts — 复合节点入门示例
 * ================================
 *
 * 目标: 用最简代码展示复合节点从 TS 定义到 GIA 产物的完整管线。
 * 对应真实参考: ts_g_define_加减运算2.gia（来自游戏导出）
 *
 *         ┌──────────┐    ┌───────────┐    ┌──────────┐
 *  TS 定义 │ Stage 1  │    │ Stage 2   │    │ Stage 3  │
 *   ↓      │ tsc 编译  │    │ 运行时捕获 │    │ GIA 编码 │
 *  .gs.ts  │ (本脚本  │    │ build()   │    │ irToGia()│
 *  文件    │  预构建)  │    │ 执行→IR   │    │ → .gia   │
 *         └──────────┘    └───────────┘    └──────────┘
 *                              ↑ 核心创新
 *                      独立 MetaCallRegistry
 *                      捕获 build() 内的节点
 *
 * 运行: npx tsx tests/composite/demo_addsub2.ts
 * 输出: dist/tests/demo_addsub2.json / .gia
 */

// ================================================================
// 运行时导入（等效于 .gs.ts 被 import() 后的执行环境）
// ================================================================
import { g, buildServerGraphRegistriesIRDocuments } from '../../dist/src/runtime/core.js'
import { int } from '../../dist/src/runtime/value.js'
import { irToGia } from '../../dist/src/compiler/ir_to_gia_transform/index.js'
import { writeFileSync } from 'fs'

const PROTO_PATH = new URL(
  '../../dist/src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto',
  import.meta.url
).pathname

// ================================================================
// 第 1 步：定义复合节点
// ================================================================
// g.defineComposite() 注册到 CompositeRegistry（ID 从 1610700000 起），
// 但 build 回调此时并不执行——执行推迟到 Stage 2 捕获阶段。
//
// 这里的 f 是 ServerExecutionFlowFunctions 实例，build 回调内
// f.addition() / f.subtraction() 会通过 ir_builder 注册节点和连线。
// ================================================================
const AddSub2 = g.defineComposite('加减运算2', {
  inputs: { a: { type: 'int' }, b: { type: 'int' } },
  outputs: { 和: { type: 'int' }, 差: { type: 'int' } },
  build: (args, f) => {
    // addition 节点（GIA nodeId=200）
    const sum = f.addition(args.a, args.b)
    // subtraction 节点（GIA nodeId=202）
    const diff = f.subtraction(args.a, args.b)
    return { 和: sum, 差: diff }
  }
})

// ================================================================
// 第 2 步：主图——使用复合节点
// ================================================================
// g.server().on() 注册事件处理器。当调用 f.callComposite() 时：
//   1. 注册 __composite_call__ 标记节点到主线图
//   2. 创建独立的 MetaCallRegistry 执行 build（捕获内部节点）
//   3. 返回代理输出值（引用标记节点的 OutParam pins）
// ================================================================
g.server({ name: 'demo', graphId: 1073741828 })
  .on('whenEntityIsCreated', (_e, f) => {
    const { 和, 差 } = f.callComposite(AddSub2, { a: new int(10), b: new int(3) })
    f.printString(f.dataTypeConversion(和, 'str'))
    f.printString(f.dataTypeConversion(差, 'str'))
  })

// ================================================================
// 第 3 步：构建 IR JSON（等效 Stage 2 产物）
// ================================================================
// buildServerGraphRegistriesIRDocuments() 内部：
//   Phase A: 遍历 compositeRegistry，捕获所有复合定义
//            （首次调用 build() → CompositeCapture → CompositeDefIR）
//   Phase B: 构建主线图 IR（含 __composite_call__ → compositeCalls）
//   Phase C: 按 calledIds 过滤 compositeDefs
//            （只嵌入主图实际调用的复合定义）
//   Phase D: 收集 compositeDataEdges（跨复合数据连线）
// ================================================================
const docs = buildServerGraphRegistriesIRDocuments({ defaultName: 'demo' })
const doc = docs[docs.length - 1]

// ── 输出 IR JSON ──
const irJson = JSON.stringify(docs, (_k, val) =>
  typeof val === 'bigint' ? val.toString() : val, 2)
writeFileSync('./dist/tests/demo_addsub2.json', irJson, 'utf8')

console.log('====== IR JSON ======')
console.log(irJson)

// ================================================================
// 第 4 步：解码复合定义 IR（查看捕获结果）
// ================================================================
const defIR = (doc as any).compositeDefs?.[0]
if (defIR) {
  console.log('\n====== 复合定义 IR 摘要 ======')
  console.log(`名称: "${defIR.name}"`)
  console.log(`ID: ${defIR.id}`)
  console.log(`纯数据: ${defIR.inflows.length === 0}（无 exec 节点）`)
  console.log(`输入: ${defIR.inputs.map(i => `${i.name}:${i.type}`).join(', ')}`)
  console.log(`输出: ${defIR.outputs.map(o => `${o.name}:${o.type}`).join(', ')}`)
  console.log(`内部节点: ${defIR.implNodes.length} 个`)
  defIR.implNodes.forEach(n => {
    // null args = 来自外部的 __captureInputName 占位值
    const argCount = (n.args || []).length
    console.log(`  n[${n.id}] type=${n.type} args=${argCount}个`)
  })
  console.log(`\ncompositePins（内外引脚映射）: ${defIR.compositePins.length} 条`)
  const kinds = ['?', 'InFlow', 'OutFlow', 'InParam', 'OutParam']
  defIR.compositePins.forEach((p, i) => {
    console.log(`  [${i}] ${kinds[p.outerPinKind]}:${p.outerPinIndex}` +
      ` → n[${p.innerNodeId}] ${kinds[p.innerPinKind]}:${p.innerPinIndex}`)
  })
}

// ================================================================
// 第 5 步：编码为 .gia（等效 Stage 3 产物）
// ================================================================
const giaBytes = irToGia(doc, {
  graphId: 1073741828, name: 'demo_addsub2', protoPath: PROTO_PATH
})
writeFileSync('./dist/tests/demo_addsub2.gia', Buffer.from(giaBytes))
console.log(`\n✅ GIA: dist/tests/demo_addsub2.gia (${giaBytes.length} bytes)`)

// ================================================================
// 第 6 步：解码 GIA 验证结构（确认 Producer 正确性）
// ================================================================
import { decode_gia_file } from '../../dist/src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'
const decoded = decode_gia_file('./dist/tests/demo_addsub2.gia', PROTO_PATH)

console.log('\n====== GIA 结构验证 ======')
console.log(`accessories: ${decoded.accessories?.length}`)
decoded.accessories?.forEach((a, i) => {
  const def = a.compositeDef?.inner?.def
  const ig = a.graph?.inner?.graph
  if (def) {
    console.log(`  Acc[${i}] CompositeDef "${def.name}"` +
      ` in=${def.inputs?.length} out=${def.outputs?.length}`)
  }
  if (ig) {
    console.log(`  Acc[${i}] ImplGraph nodes=${ig.nodes?.length}` +
      ` compositePins=${ig.compositePins?.length}`)
    ig.nodes?.forEach(n => {
      const nid = n.genericId?.nodeId ?? n.concreteId?.nodeId ?? '?'
      console.log(`    n[${n.nodeIndex}] nodeId=${nid} pins=${n.pins?.length}`)
    })
  }
})
