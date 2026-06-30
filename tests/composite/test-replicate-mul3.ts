// @ts-nocheck
/**
 * 精确复制参考文件 物理运动.gia 中的 mul3 复合节点
 *
 * 参考结构:
 *   CompositeDef: 0 InFlow, 0 OutFlow, 3 float InParams, 1 float OutParam
 *   Impl (2 nodes):
 *     n[19] nodeId=204 (multiplication):
 *       InParam:0 (bConcrete, no connects)  ← 从 compositePins 接收 InParam:1
 *       InParam:1 (bConcrete, no connects)  ← 从 compositePins 接收 InParam:2
 *       OutParam:0 (bConcrete, no connects)
 *     n[21] nodeId=204 (multiplication):
 *       InParam:0 (bConcrete, →[19:OutParam:0])  ← 中间结果连线!
 *       InParam:1 (bConcrete, no connects)        ← 从 compositePins 接收 InParam:0
 *       OutParam:0 (bConcrete, no connects)
 *   compositePins:
 *     InParam:0 → n[21] InParam:1
 *     InParam:1 → n[19] InParam:0
 *     InParam:2 → n[19] InParam:1
 *     OutParam:0 → n[21] OutParam:0
 *
 * 语义: result = (A × B) × C
 *       n[19] = A × B, n[21] = (A×B) × C
 */
import { g, buildServerGraphRegistriesIRDocuments } from '../../dist/src/runtime/core.js'
import { int, float } from '../../dist/src/runtime/value.js'
import { irToGia } from '../../dist/src/compiler/ir_to_gia_transform/index.js'
import { decode_gia_file } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'
import { writeFileSync, readFileSync, existsSync } from 'fs'

const PROTO_PATH = new URL('../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto', import.meta.url).pathname
const OUT_DIR = './tests/composite/output'

let passed = 0, failed = 0
function check(cond: boolean, msg: string) {
  if (cond) { passed++; console.log(`  ✅ ${msg}`) }
  else { failed++; console.log(`  ❌ ${msg}`) }
}

// ═══════════════════════════════════════════════
// 复制 mul3 复合
// ═══════════════════════════════════════════════

const mul3 = g.defineComposite('mul3', {
  inputs: { A: { type: 'float' }, B: { type: 'float' }, C: { type: 'float' } },
  outputs: { 结果: { type: 'float' } },
  build(inputs: any, f: any) {
    // n[19] = A × B
    const ab = f.multiplication(inputs['A'], inputs['B'])
    // n[21] = (A×B) × C
    const result = f.multiplication(ab, inputs['C'])
    return { 结果: result }
  }
})
console.log('mul3 id:', mul3.id)

// ═══════════════════════════════════════════════
// 预捕获
// ═══════════════════════════════════════════════

g.server({ name: 'trigger' }).on('whenEntityIsCreated', (_e: any, f: any) => {})
buildServerGraphRegistriesIRDocuments({ defaultName: 'trigger' })

// ═══════════════════════════════════════════════
// 主图
// ═══════════════════════════════════════════════

g.server({ name: 'main', graphId: 1073741914 })
  .on('whenEntityIsCreated', (_e: any, f: any) => {
    const r = f.callComposite(mul3, {
      A: new float(2), B: new float(3), C: new float(4)
    })
  })

const docs = buildServerGraphRegistriesIRDocuments({ defaultName: 'main' })
const doc = docs[docs.length - 1]

const outName = 'replicate_mul3'
const bytes = irToGia(doc, { graphId: 1073741914, name: outName, protoPath: PROTO_PATH })
const outPath = `${OUT_DIR}/${outName}.gia`
writeFileSync(outPath, Buffer.from(bytes))
console.log(`✅ 已生成: ${outPath}  (${bytes.length} 字节)`)

// ═══════════════════════════════════════════════
// 验证 — 与参考对比
// ═══════════════════════════════════════════════

const gen = decode_gia_file(outPath, PROTO_PATH)
const accs = gen.accessories ?? []

// 找 mul3 的 CompositeDef 和 impl
const mul3Def = accs.find((a: any) =>
  a.which === 12 && a.compositeDef?.inner?.def?.name === 'mul3'
)
const mul3Impl = accs.find((a: any) =>
  a.which === 9 && a.id?.id === mul3Def?.compositeDef?.inner?.def?.id?.graphId?.id
)

console.log('\n=== 参考对照: mul3 ===')
console.log('参考: 0 inflows, 0 outflows, 3 inputs(float), 1 output(结果, float)')
console.log('参考 impl: 2 nodes (both multiplication, nodeId=204)')
console.log('参考 compositePins: InParam×3 + OutParam×1 = 4')

// 1. 检查 CompositeDef 接口
if (mul3Def) {
  const d = mul3Def.compositeDef.inner.def
  console.log(`\n接口: inflows=${d.inflows?.length} outflows=${d.outflows?.length} inputs=${d.inputs?.length} outputs=${d.outputs?.length}`)
  check(d.inflows?.length === 0, `inflows=0 (ref:0)`)
  check(d.outflows?.length === 0, `outflows=0 (ref:0)`)
  check(d.inputs?.length === 3, `inputs=3 (ref:3)`)
  check(d.outputs?.length === 1, `outputs=1 (ref:1)`)
  if (d.inputs?.length >= 3) {
    check(d.inputs[0].type?.class === 4, `input[0] class=4(float) (ref:4) got:${d.inputs[0].type?.class}`)
    check(d.inputs[0].type?.type1 === 5, `input[0] type1=5(float) (ref:5) got:${d.inputs[0].type?.type1}`)
  }
  if (d.outputs?.length >= 1) {
    check(d.outputs[0].type?.class === 4, `output[0] class=4(float) (ref:4) got:${d.outputs[0].type?.class}`)
  }
}

// 2. 检查 impl 图
if (mul3Impl) {
  const ig = mul3Impl.graph.inner.graph
  console.log(`\nimpl: ${ig.nodes?.length} nodes, ${ig.compositePins?.length} compositePins`)
  check(ig.nodes?.length === 2, `nodes=2 (ref:2) got:${ig.nodes?.length}`)
  check(ig.compositePins?.length === 4, `compositePins=4 (ref:4) got:${ig.compositePins?.length}`)

  // 显示节点详情
  const kname: Record<number,string> = {1:'InFlow',2:'OutFlow',3:'InParam',4:'OutParam'}
  for (const n of ig.nodes) {
    const nid = n.genericId?.nodeId ?? n.concreteId?.nodeId ?? '?'
    console.log(`\n  n[${n.nodeIndex}] nodeId=${nid} pins(${n.pins?.length}):`)
    for (const p of n.pins) {
      const k = kname[p.i1?.kind] ?? '?'
      const idx = p.i1?.index
      let val = '', conn = ''
      if (p.value?.bConcreteValue) val = ' bConcrete'
      else if (p.value?.bInt) val = ` bInt=${p.value.bInt.val}`
      else if (p.value?.bFloat) val = ` bFloat=${p.value.bFloat.val}`
      if (p.connects?.length) {
        conn = ' →[' + p.connects.map((c: any) => `n${c.id}:${kname[c.connect?.kind]}:${c.connect?.index}`).join(',') + ']'
      }
      console.log(`    pin[${k}:${idx}]${val}${conn}`)
    }
  }

  // 检查 compositePins
  console.log(`\n  compositePins:`)
  for (const cp of ig.compositePins) {
    console.log(`    ${kname[cp.outerPin?.kind]??'?'}[${cp.outerPin?.index}] → n[${cp.innerNodeId}] ${kname[cp.innerPin?.kind]??'?'}:${cp.innerPin?.index}`)
  }

  // 3. 关键逐字段对比
  const node194 = ig.nodes.find((n: any) =>
    (n.genericId?.nodeId ?? n.concreteId?.nodeId) === 204
  )
  const nodes204 = ig.nodes.filter((n: any) =>
    (n.genericId?.nodeId ?? n.concreteId?.nodeId) === 204
  )

  check(nodes204.length === 2, `有 2 个 multiplication (nodeId=204) (got ${nodes204.length})`)

  // 参考: n[19] = first mul, 3 pins (InParam:0 + InParam:1 + OutParam:0)
  if (nodes204.length >= 1) {
    const n = nodes204[0]
    check(n.pins?.length === 3, `first mul: pins=3 (ref:3) got:${n.pins?.length}`)
    const hasIP0 = n.pins?.some((p: any) => p.i1?.kind === 3 && p.i1?.index === 0)
    const hasIP1 = n.pins?.some((p: any) => p.i1?.kind === 3 && p.i1?.index === 1)
    const hasOP0 = n.pins?.some((p: any) => p.i1?.kind === 4 && p.i1?.index === 0)
    check(hasIP0, `first mul: has InParam:0 (ref:✅)`)
    check(hasIP1, `first mul: has InParam:1 (ref:✅)`)
    check(hasOP0, `first mul: has OutParam:0 (ref:✅)`)
  }

  // 参考: n[21] = second mul, 3 pins, InParam:0 有 connects → n[19] OutParam:0
  if (nodes204.length >= 2) {
    const n = nodes204[1]
    check(n.pins?.length === 3, `second mul: pins=3 (ref:3) got:${n.pins?.length}`)
    const ip0 = n.pins?.find((p: any) => p.i1?.kind === 3 && p.i1?.index === 0)
    const hasIP1 = n.pins?.some((p: any) => p.i1?.kind === 3 && p.i1?.index === 1)
    check(ip0 != null, `second mul: has InParam:0 (ref:✅ for data conn)`)
    check(hasIP1, `second mul: has InParam:1 (ref:✅)`)

    // 关键: InParam:0 是否有 connects 指向上游节点?
    const conns = ip0?.connects ?? []
    if (conns.length > 0) {
      check(true, `second mul InParam:0 has connects → upstream (ref:✅)`)
      console.log(`    connects: →${conns.map((c: any) => `n${c.id}`).join(',')}`)
    } else {
      console.log(`    ⚠️ InParam:0 无 connects — 参考有 →[19:OutParam:0]`)
      check(false, `second mul InParam:0 has connects → upstream (ref:✅) MISSING!`)
    }
  }

  // 4. compositePins 映射验证
  const ipPins = ig.compositePins.filter((cp: any) => cp.outerPin?.kind === 3)
  const opPins = ig.compositePins.filter((cp: any) => cp.outerPin?.kind === 4)
  check(ipPins.length === 3, `compositePins InParam=3 (ref:3) got:${ipPins.length}`)
  check(opPins.length === 1, `compositePins OutParam=1 (ref:1) got:${opPins.length}`)
}

console.log(`\n${'='.repeat(40)}`)
console.log(`通过: ${passed}  失败: ${failed}`)
if (failed > 0) { console.log('💥 存在差异，需要修复') }
else { console.log('🏆 与参考完全一致') }
