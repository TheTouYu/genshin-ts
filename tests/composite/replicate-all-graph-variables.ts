// @ts-nocheck
/**
 * 全类型图变量测试
 *
 * 验证复合节点内 get_node_graph_variable 支持所有标量和列表类型。
 */
import { g, buildServerGraphRegistriesIRDocuments } from '../../dist/src/runtime/core.js'
import { int, list, listLiteral, vec3, guid, entity, entityLiteral, prefabId, configId, faction } from '../../dist/src/runtime/value.js'
import { irToGia } from '../../dist/src/compiler/ir_to_gia_transform/index.js'
import { decode_gia_file } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'
import { writeFileSync, mkdirSync, existsSync } from 'fs'

const PROTO_PATH = new URL('../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto', import.meta.url).pathname
const OUT_DIR = './tests/composite/output'
if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true })

// ═══════════════════════════════════════════════════════════════
// Composite: 全类型图变量测试
// ═══════════════════════════════════════════════════════════════
const AllTypesComposite = g.defineComposite('全类型图变量测试', {
  inputs: {},
  outputs: {},
  variables: {
    '布尔': false,
    '整数': new int(0),
    '浮点': 0.0,
    '字符串': '',
    '向量': new vec3([0, 0, 0]),
    'GUID': new guid(0),
    '实体': new entityLiteral(0),
    '配置ID': new configId(0),
    '预制体ID': new prefabId(0),
    '阵营': new faction(0),
    '布尔列表': new listLiteral('bool', []),
    '整数列表': new listLiteral('int', []),
    '浮点列表': new listLiteral('float', []),
    '字符串列表': new listLiteral('str', []),
    'GUID列表': new listLiteral('guid', []),
    '实体列表': new listLiteral('entity', []),
    '向量列表': new listLiteral('vec3', []),
    '配置列表': new listLiteral('config_id', []),
    '预制体列表': new listLiteral('prefab_id', []),
    '阵营列表': new listLiteral('faction', []),
  },
  build(_inputs, f) {
    // 标量
    void f.get('布尔')
    void f.get('整数')
    void f.get('浮点')
    void f.get('字符串')
    void f.get('向量')
    void f.get('GUID')
    void f.get('实体')
    void f.get('配置ID')
    void f.get('预制体ID')
    void f.get('阵营')
    // 列表
    void f.get('布尔列表')
    void f.get('整数列表')
    void f.get('浮点列表')
    void f.get('字符串列表')
    void f.get('GUID列表')
    void f.get('实体列表')
    void f.get('向量列表')
    void f.get('配置列表')
    void f.get('预制体列表')
    void f.get('阵营列表')
    return {}
  }
})
console.log('✅ 全类型图变量测试复合 id:', AllTypesComposite.id)

// ═══════════════════════════════════════════════════════════════
// 预处理
// ═══════════════════════════════════════════════════════════════
g.server({ name: 'prep' }).on('whenEntityIsCreated', () => {})
buildServerGraphRegistriesIRDocuments({ defaultName: 'prep' })

// ═══════════════════════════════════════════════════════════════
// 主图
// ═══════════════════════════════════════════════════════════════
g.server({
  name: 'main',
  graphId: 1073741940,
  variables: {
    '布尔': false,
    '整数': new int(0),
    '浮点': 0.0,
    '字符串': '',
    '向量': new vec3([0, 0, 0]),
    'GUID': new guid(0),
    '实体': new entityLiteral(0),
    '配置ID': new configId(0),
    '预制体ID': new prefabId(0),
    '阵营': new faction(0),
    '布尔列表': new listLiteral('bool', []),
    '整数列表': new listLiteral('int', []),
    '浮点列表': new listLiteral('float', []),
    '字符串列表': new listLiteral('str', []),
    'GUID列表': new listLiteral('guid', []),
    '实体列表': new listLiteral('entity', []),
    '向量列表': new listLiteral('vec3', []),
    '配置列表': new listLiteral('config_id', []),
    '预制体列表': new listLiteral('prefab_id', []),
    '阵营列表': new listLiteral('faction', []),
  }
}).on('whenEntityIsDestroyed', (_e, f) => {
  f.callComposite(AllTypesComposite, {})
})

// ═══════════════════════════════════════════════════════════════
// 构建 IR + 生成 GIA
// ═══════════════════════════════════════════════════════════════
const docs = buildServerGraphRegistriesIRDocuments({ defaultName: 'main' })
const doc = docs[docs.length - 1]

// 生成 GIA 文件
const bytes = irToGia(doc, { graphId: 1073741940, name: '全类型图变量', protoPath: PROTO_PATH })
const outPath = `${OUT_DIR}/全类型图变量.gia`
writeFileSync(outPath, Buffer.from(bytes))
console.log(`\n✅ 已生成: ${outPath}  (${bytes.length} 字节)`)

// ═══════════════════════════════════════════════════════════════
// 解码验证：检查复合内部 get_node_graph_variable 节点的 concreteId
// ═══════════════════════════════════════════════════════════════
console.log('\n═══ 复合内部 get_node_graph_variable 节点 ═══')
const gen = decode_gia_file(outPath, PROTO_PATH)
const acc = gen.accessories ?? []
for (const a of acc) {
  if (a.graph?.inner?.graph) {
    const g = a.graph.inner.graph
    for (const n of g.nodes ?? []) {
      if (n.genericId?.nodeId === 337) { // get_node_graph_variable generic
        const cid = n.concreteId?.nodeId
        const pins = n.pins ?? []
        const outParam = pins.find(p => p.i1?.kind === 4)
        console.log(`  nodeIndex=${n.nodeIndex} cid=${cid} pins=${pins.length} outParam.type=${outParam?.type}`)
      }
    }
  }
}
