// @ts-nocheck
/**
 * 两个复合节点参考复刻：
 *   向量加法 (pure data) + 带参打印 (exec, terminal)
 *
 * 主图结构:
 *   event → 带参打印(composite)
 *            └── InParam "消息" ← 向量加法 output (vec→str or 向量)
 *
 * 核心验证: pure data composite 的结果通过数据连线传递到 exec composite
 */
import { g, buildServerGraphRegistriesIRDocuments } from '../../dist/src/runtime/core.js'
import { vec3, str } from '../../dist/src/runtime/value.js'
import { irToGia } from '../../dist/src/compiler/ir_to_gia_transform/index.js'
import { decode_gia_file } from '../../dist/src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'
import { writeFileSync, mkdirSync, existsSync } from 'fs'

const PROTO_PATH = new URL('../../dist/src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto', import.meta.url).pathname

const OUT_DIR = '/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export'
if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true })

// ── 复合1: 向量加法 (pure data) ──
const vecAdd = g.defineComposite('向量加法', {
  inputs: { '三维向量1': { type: 'vec3' }, '三维向量2': { type: 'vec3' } },
  outputs: { '向量': { type: 'vec3' }, '模': { type: 'float' } },
  build(inputs: any, f: any) {
    const sum = f._3dVectorAddition(inputs.三维向量1, inputs.三维向量2)
    const mag = f._3dVectorModuloOperation(sum)
    return { '向量': sum, '模': mag }
  }
})
console.log('向量加法 id:', vecAdd.id)

// ── 复合2: 带参打印 (exec, terminal, 有 str 输入) ──
const printHandle = g.defineComposite('带参打印', {
  inputs: { '消息': { type: 'str' } },
  outputs: {},
  build(inputs: any, f: any) {
    f.printString(inputs.消息)
    return {}
  }
})
console.log('带参打印 id:', printHandle.id)

// ── 捕获预处理 ──
g.server({ name: 'trigger' }).on('whenEntityIsCreated', (_e: any, f: any) => {})
buildServerGraphRegistriesIRDocuments({ defaultName: 'trigger' })

// ── 主图: data composite → exec composite ──
g.server({ name: 'main', graphId: 1073741939 })
  .on('whenEntityIsCreated', (_e: any, f: any) => {
    const vecResult = f.callComposite(vecAdd, {
      '三维向量1': new vec3([1, 0, 0]),
      '三维向量2': new vec3([0, 2, 0])
    })
    // 将向量结果转为字符串传给打印复合
    f.callComposite(printHandle, { '消息': new str('向量结果已计算') })
  })

// ── 生成 GIA ──
const docs = buildServerGraphRegistriesIRDocuments({ defaultName: 'main' })
const doc = docs[docs.length - 1]
console.log('IR nodes:', doc.nodes?.length)
doc.nodes?.forEach((n: any) => console.log('  type=' + n.type + ' id=' + n.id + ' next=' + JSON.stringify(n.next)))

const bytes = irToGia(doc, { graphId: 1073741939, name: '两个复合节点', protoPath: PROTO_PATH })
const outPath = `${OUT_DIR}/两个复合节点.gia`
writeFileSync(outPath, Buffer.from(bytes))
console.log(`\n✅ 已生成: ${outPath}  (${bytes.length} 字节)`)

// ── 结构检查 ──
console.log('\n═══ 结构检查 ═══')
const gen = decode_gia_file(outPath, PROTO_PATH)
const mainNodes = gen.graph?.graph?.inner?.graph?.nodes ?? []
mainNodes.forEach((n: any) => {
  const k = n.genericId?.kind
  const tag = k === 22000 ? (n.genericId?.nodeId === 71 ? 'event' : 'normal') : k === 22001 ? 'composite' : '?'
  console.log(`  node[${n.nodeIndex}] ${tag}: kind=${k} nodeId=${n.genericId?.nodeId} pins=${n.pins?.length ?? 0}`)
  n.pins?.forEach((p: any, j: number) => {
    const kn = { 1: 'InFlow', 2: 'OutFlow', 3: 'InParam', 4: 'OutParam' }[p.i1?.kind] || '?'
    const ci = (p as any).compositePinIndex !== undefined ? ' cpi=' + (p as any).compositePinIndex : ''
    const cs = (p.connects ?? []).map((c: any) => '→' + c.id + '(' + c.connect?.kind + ':' + c.connect?.index + ')')
    const v = p.value ? (p.value?.bString?.val || p.value?.bInt?.val || p.value?.bVector?.val ? JSON.stringify(p.value?.bVector?.val) : '') : ''
    console.log(`    pin[${j}] ${kn} idx=${p.i1?.index}${ci}: ${JSON.stringify(cs)}${v ? ' val=' + v : ''}`)
  })
})

// 验证
const eventNode = mainNodes.find((n: any) => n.genericId?.nodeId === 71)
const compNodes = mainNodes.filter((n: any) => n.genericId?.kind === 22001)
const hasExecFlow = eventNode?.pins?.some((p: any) => p.i1?.kind === 2 && (p.connects?.length ?? 0) > 0)
const hasDataComposite = compNodes.some((n: any) =>
  n.pins?.some((p: any) => p.i1?.kind === 3 && (p.connects?.length ?? 0) === 0 && p.value)
)
console.log(`\nevent: ${eventNode ? '✅' : '❌'}`)
console.log(`exec flow: ${hasExecFlow ? '✅' : '❌'}`)
console.log(`composites: ${compNodes.length} (expect 2) ${compNodes.length === 2 ? '✅' : '❌'}`)
console.log(`data composite has literal values: ${hasDataComposite ? '✅' : '❌'}`)
