// @ts-nocheck
/**
 * 复刻参考文件 节点图变量.gia
 *
 * 测试 GetNodeGraphVariable 节点在复合内部和主图两种上下文中的类型编码。
 * 复合"节点图变量打印"内部和主图均读取图变量"字符串列表" → ListIterationLoop → PrintString。
 *
 * 目标：精确匹配游戏编辑器产出的 GIA 编码。
 */
import { g, buildServerGraphRegistriesIRDocuments } from '../../dist/src/runtime/core.js'
import { list } from '../../dist/src/runtime/value.js'
import { irToGia } from '../../dist/src/compiler/ir_to_gia_transform/index.js'
import { decode_gia_file } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'
import { writeFileSync, mkdirSync, existsSync } from 'fs'

const PROTO_PATH = new URL('../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto', import.meta.url).pathname
const OUT_DIR = './tests/composite/output'
if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true })

// ═══════════════════════════════════════════════════════════════
// Composite 1: 节点图变量打印
// 内部：读取图变量"字符串列表" → listIterationLoop → printString
// ═══════════════════════════════════════════════════════════════
const GraphVarComposite = g.defineComposite('节点图变量打印', {
  inputs: {},
  outputs: {},
  variables: {
    '字符串列表': new list('str', ['asd']),
  },
  build(_inputs, f) {
    f.listIterationLoop(f.get('字符串列表'), (item) => {
      f.printString(item)
    })
    return {}
  }
})
console.log('✅ 节点图变量打印复合 id:', GraphVarComposite.id)

// ═══════════════════════════════════════════════════════════════
// 预处理：所有复合必须先捕获，再使用
// ═══════════════════════════════════════════════════════════════
g.server({ name: 'prep' }).on('whenEntityIsCreated', () => {})
buildServerGraphRegistriesIRDocuments({ defaultName: 'prep' })

// ═══════════════════════════════════════════════════════════════
// 主图：调用复合 + 主图直接使用图变量
// 在主图层级声明图变量"字符串列表"，使 f.get() 能解析到类型
// 事件源使用 whenEntityIsDestroyed 匹配参考文件
// ═══════════════════════════════════════════════════════════════
g.server({
  name: 'main',
  graphId: 1073741939,
  variables: {
    '字符串列表': new list('str', ['asd']),
  }
}).on('whenEntityIsDestroyed', (_e, f) => {
  f.fork(
    () => f.callComposite(GraphVarComposite, {}),
    () => f.listIterationLoop(f.get('字符串列表'), (item) => {
      f.printString(item)
    }),
  )
})

// ═══════════════════════════════════════════════════════════════
// 构建 IR + 生成 GIA
// ═══════════════════════════════════════════════════════════════
const docs = buildServerGraphRegistriesIRDocuments({ defaultName: 'main' })
const doc = docs[docs.length - 1]

console.log('\n═══ IR 节点 ═══')
doc.nodes?.forEach((n) => {
  console.log(`  type=${n.type} id=${n.id} next=${JSON.stringify(n.next)}`)
})

console.log(`\n═══ 复合定义 (${doc.compositeDefs?.length ?? 0}) ═══`)
doc.compositeDefs?.forEach((cd) => {
  const inputs = cd.inputs.map((i) => `${i.name}:${i.type}`).join(', ')
  console.log(`  ${cd.name} id=${cd.id} inputs=[${inputs}]`)
  console.log(`    implNodes=${cd.implNodes?.length ?? 0} compositePins=${cd.compositePins?.length ?? 0}`)
  if (cd.implVariables) {
    for (const v of cd.implVariables) {
      console.log(`    var: ${v.name} type=${v.type}`)
    }
  }
})

// 生成 GIA 文件
const bytes = irToGia(doc, { graphId: 1073741939, name: '节点图变量', protoPath: PROTO_PATH })
const outPath = `${OUT_DIR}/节点图变量.gia`
writeFileSync(outPath, Buffer.from(bytes))
console.log(`\n✅ 已生成: ${outPath}  (${bytes.length} 字节)`)

// ═══════════════════════════════════════════════════════════════
// 解码验证
// ═══════════════════════════════════════════════════════════════
console.log('\n═══ 解码验证 ═══')
const gen = decode_gia_file(outPath, PROTO_PATH)

const acc = gen.accessories ?? []
console.log(`accessories: ${acc.length}`)
for (let i = 0; i < acc.length; i++) {
  const a = acc[i]
  if (a.compositeDef?.inner?.def) {
    const d = a.compositeDef.inner.def
    console.log(`\n复合: ${d.name} (id=${d.id?.genericId?.id})`)
    console.log(`  inputs: ${d.inputs?.length ?? 0}`)
    for (let j = 0; j < (d.inputs?.length ?? 0); j++) {
      const inp = d.inputs[j]
      console.log(`  [${j}] '${inp.name}' type={class=${inp.type?.class}, type1=${inp.type?.type1}} pinIndex=${inp.pinIndex}`)
    }
    console.log(`  outputs: ${d.outputs?.length ?? 0}`)
    console.log(`  inflows: ${d.inflows?.length ?? 0}  outflows: ${d.outflows?.length ?? 0}`)
  }
  if (a.graph?.inner?.graph) {
    const g = a.graph.inner.graph
    console.log(`  impl nodes: ${g.nodes?.length ?? 0}`)
    for (const n of g.nodes ?? []) {
      const nid = n.genericId?.nodeId
      const pins = n.pins?.length ?? 0
      console.log(`    n${n.nodeIndex}: gid=${nid} pins=${pins}`)
    }
  }
}

// 主图节点
const mainGraph = gen.graph?.graph?.inner?.graph
if (mainGraph) {
  console.log('\n主图节点:')
  for (const n of mainGraph.nodes ?? []) {
    const nid = n.genericId?.nodeId
    const kind = n.genericId?.kind
    const pins = n.pins?.length ?? 0
    console.log(`  n${n.nodeIndex}: gid=${nid} kind=${kind} pins=${pins}`)
  }

  console.log('\n主图 graphValues:')
  for (const gv of mainGraph.graphValues ?? []) {
    console.log(`  '${gv.name}' type=${gv.type} keyType=${gv.keyType} valueType=${gv.valueType}`)
  }
}
