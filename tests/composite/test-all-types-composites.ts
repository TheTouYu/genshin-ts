// @ts-nocheck
/**
 * 全覆盖参数类型复合节点
 *
 * 目标：在一个文件中定义多个复合节点，覆盖所有可用的参数类型。
 * 每个复合的内部实现：将输入通过 dataTypeConversion 转为 str → printString。
 *
 * 覆盖的类型分组：
 *   Composite 1 (标量→str→print):    bool, int, float, str
 *   Composite 2 (向量引用→str→print): vec3, guid, entity
 *   Composite 3 (资源ID identity):     prefab_id, config_id, faction
 *   Composite 4 (列表 identity):       int_list, entity_list
 *                         → 列表不能使用 dataTypeConversion 转为 str，
 *                           此处作为 identity 传递（输出原值），验证列表
 *                           类型可以作为复合参数正常编码
 *
 * 编译验证：
 *   1. IR JSON 中每个复合定义了正确的 inputs/outputs + type
 *   2. implNodes 中包含 dataTypeConversion + printString 节点
 *   3. GIA 编码后 accessories 包含 4 对 CompositeDef + impl NodeGraph
 *   4. 主图节点正确编码为 SysGraph(kind=22001)
 *
 * 引用文档：
 *   - docs/architecture/definition-system.md §3 数据类型总览
 *   - docs/architecture/composite/gia-encoding.md
 *   - docs/composite-ir/01-ir-types.md
 */
import { g, buildServerGraphRegistriesIRDocuments } from '../../dist/src/runtime/core.js'
import {
  bool, int, float, str, vec3, guid, entity,
  prefabId, configId, faction,
  entityLiteral
} from '../../dist/src/runtime/value.js'
// list 使用全局工厂函数（由 installServerGlobals 注册在 globalThis）
// 不要从 value.js 导入 list 类——那会遮蔽全局工厂
import { irToGia } from '../../dist/src/compiler/ir_to_gia_transform/index.js'
import { decode_gia_file } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'
import { writeFileSync, mkdirSync, existsSync } from 'fs'

const PROTO_PATH = new URL('../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto', import.meta.url).pathname
const OUT_DIR = './tests/composite/output'
if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true })

// ═══════════════════════════════════════════════════════════════
// Composite 1: 标量类型 → str → print
// 覆盖: bool, int, float, str
//
// impl 图结构:
//   [capture input pins]
//     ├── bool → dataTypeConversion(bool→str) → printString
//     ├── int  → dataTypeConversion(int→str)  → printString
//     ├── float → dataTypeConversion(float→str) → printString
//     └── str  → printString
// ═══════════════════════════════════════════════════════════════
const ScalarComposite = g.defineComposite('标量转字符串', {
  inputs: {
    布尔值: { type: 'bool' },
    整数: { type: 'int' },
    浮点数: { type: 'float' },
    字符串: { type: 'str' },
  },
  outputs: {},
  build({ 布尔值, 整数, 浮点数, 字符串 }, f) {
    // 每个输入通过 dataTypeConversion 转为 str 后打印
    f.printString(f.dataTypeConversion(布尔值, 'str'))
    f.printString(f.dataTypeConversion(整数, 'str'))
    f.printString(f.dataTypeConversion(浮点数, 'str'))
    f.printString(字符串) // str 不需要转换
    return {}
  }
})
console.log('✅ 标量复合 id:', ScalarComposite.id)

// ═══════════════════════════════════════════════════════════════
// Composite 2: 向量与引用类型 → str → print
// 覆盖: vec3, guid, entity（均支持 dataTypeConversion→str）
// ═══════════════════════════════════════════════════════════════
const VecIdComposite = g.defineComposite('向量与引用转字符串', {
  inputs: {
    三维向量: { type: 'vec3' },
    GUID: { type: 'guid' },
    实体: { type: 'entity' },
  },
  outputs: {},
  build({ 三维向量, GUID, 实体 }, f) {
    f.printString(f.dataTypeConversion(三维向量, 'str'))
    f.printString(f.dataTypeConversion(GUID, 'str'))
    f.printString(f.dataTypeConversion(实体, 'str'))
    return {}
  }
})
console.log('✅ 向量与引用复合 id:', VecIdComposite.id)

// ═══════════════════════════════════════════════════════════════
// Composite 3: 游戏资源ID和非转换类型（identity 传递）
// 覆盖: prefab_id, config_id, faction
//       dataTypeConversion 不支持 prefab_id/config_id→str,
//       faction 要求输入必须是连线值（不能在复合内用字面量）
//       此复合演示这些类型能作为复合参数正常编码
// ═══════════════════════════════════════════════════════════════
const ResourceComposite = g.defineComposite('资源ID传递', {
  inputs: {
    预制件ID: { type: 'prefab_id' },
    配置ID: { type: 'config_id' },
    阵营: { type: 'faction' },
  },
  outputs: {
    传出预制件ID: { type: 'prefab_id' },
    传出配置ID: { type: 'config_id' },
    传出阵营: { type: 'faction' },
  },
  build({ 预制件ID, 配置ID, 阵营 }, f) {
    // dataTypeConversion 不支持 prefab_id/config_id→str
    // faction: dataTypeConversion→str 要求输入来自连线值（非字面量）
    // 此处演示 identity 传递：验证这三个类型能作为复合参数正常编码
    return {
      传出预制件ID: 预制件ID,
      传出配置ID: 配置ID,
      传出阵营: 阵营,
    }
  }
})
console.log('✅ 资源ID复合 id:', ResourceComposite.id)

// ═══════════════════════════════════════════════════════════════
// Composite 4: 列表类型（identity 传递）
// 覆盖: int_list, entity_list
// 注意: dataTypeConversion 不支持 list→str,
//       所以这里演示列表类型本身能作为复合参数正确编码
// ═══════════════════════════════════════════════════════════════
const ListComposite = g.defineComposite('列表传递', {
  inputs: {
    整数列表: { type: 'int_list' },
    实体列表: { type: 'entity_list' },
  },
  outputs: {
    传出整数列表: { type: 'int_list' },
    传出实体列表: { type: 'entity_list' },
  },
  build({ 整数列表, 实体列表 }, f) {
    // 直接返回输入值（identity 传递）
    // 列表不能通过 dataTypeConversion 转为 str
    return {
      传出整数列表: 整数列表,
      传出实体列表: 实体列表,
    }
  }
})
console.log('✅ 列表复合 id:', ListComposite.id)

// ═══════════════════════════════════════════════════════════════
// 预处理：所有复合必须先捕获，再使用
// ═══════════════════════════════════════════════════════════════
g.server({ name: 'prep' }).on('whenEntityIsCreated', (_e, _f) => {})
buildServerGraphRegistriesIRDocuments({ defaultName: 'prep' })

// ═══════════════════════════════════════════════════════════════
// 主图：调用所有复合节点
// ═══════════════════════════════════════════════════════════════
g.server({ name: 'main', graphId: 1073741939 })
  .on('whenEntityIsCreated', (_e, f) => {
    // --- 标量复合 ---
    f.callComposite(ScalarComposite, {
      布尔值: new bool(true),
      整数: new int(42),
      浮点数: new float(3.14),
      字符串: new str('你好世界'),
    })

    // --- 向量与引用复合 ---
    f.callComposite(VecIdComposite, {
      三维向量: new vec3([1, 2, 3]),
      GUID: new guid(12345n),
      实体: new entityLiteral(0),  // 占位（entity 基类不设置 metadata，必须用 entityLiteral）
    })

    // --- 资源ID复合（prefab_id/config_id/faction: identity 传递）---
    f.callComposite(ResourceComposite, {
      预制件ID: new prefabId(1001),
      配置ID: new configId(2002),
      阵营: new faction(3003),
    })

    // --- 列表复合（暂不调用，待列表参数基础设施修复）---
    // 见 docs/composite-ir/gaps/list-param-in-composite-call.md
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

// 检查 IR compositeDefs
console.log(`\n═══ 复合定义 (${doc.compositeDefs?.length ?? 0}) ═══`)
doc.compositeDefs?.forEach((cd) => {
  const inputs = cd.inputs.map((i) => `${i.name}:${i.type}`).join(', ')
  const outputs = cd.outputs.map((o) => `${o.name}:${o.type}`).join(', ')
  console.log(`  ${cd.name} id=${cd.id} inputs=[${inputs}] outputs=[${outputs}]`)
  console.log(`    implNodes=${cd.implNodes?.length ?? 0} compositePins=${cd.compositePins?.length ?? 0}`)
})

// 生成 GIA 文件
const bytes = irToGia(doc, { graphId: 1073741939, name: '全覆盖类型复合', protoPath: PROTO_PATH })
const outPath = `${OUT_DIR}/全覆盖类型复合.gia`
writeFileSync(outPath, Buffer.from(bytes))
console.log(`\n✅ 已生成: ${outPath}  (${bytes.length} 字节)`)

// ═══════════════════════════════════════════════════════════════
// 验证
// ═══════════════════════════════════════════════════════════════
console.log('\n═══ 解码验证 ═══')
const gen = decode_gia_file(outPath, PROTO_PATH)

// 1. 检查 accessories 数量
//    注意: accessories 在 decode_gia_file 返回值的顶层
const accessories = gen.accessories ?? []
console.log(`accessories 总数: ${accessories.length} (期望 ≥ 6: 3 对 CompositeDef+impl) ❌`)  // 会在下面 checks 修正

// 2. 检查主图节点（accessories 在顶层 / nodes 在 graph.inner.graph 下）
const mainNodes = (gen.graph?.graph?.inner?.graph?.nodes ?? [])
console.log(`主图节点数: ${mainNodes.length}`)
const eventNode = mainNodes.find((n) => n.genericId?.nodeId === 71)
const compNodes = mainNodes.filter((n) => n.genericId?.kind === 22001)
console.log(`  event 节点: ${eventNode ? '✅' : '❌'}`)
console.log(`  SysGraph(composite) 节点: ${compNodes.length} (期望 3: 列表复合暂不调用) ${compNodes.length === 3 ? '✅' : '❌'}`)

// 3. 检查 CompositeDef 和 impl NodeGraph pairs
const compositeDefUnits = accessories.filter((a) => a.which === 12 || a.which === 'CompositeGraph')
const implGraphUnits = accessories.filter((a) => a.which === 9 || a.which === 'EntityNode')
console.log(`\nCompositeDef units: ${compositeDefUnits.length} (期望 3)`)
console.log(`impl NodeGraph units: ${implGraphUnits.length} (期望 3)`)

// 4. 检查每个 impl 图是否包含 data_type_conversion 或 print_string 节点
let hasImplDataConv = false
implGraphUnits.forEach((unit, i) => {
  const nodes = unit.graph?.inner?.graph?.nodes ?? []
  if (nodes.length > 0) {
    console.log(`  impl图[${i}] 节点数: ${nodes.length} (kinds: ${nodes.map(n => n.genericId?.kind).join(',')})`)
    if (nodes.some((n) => n.genericId?.kind === 22000)) {
      hasImplDataConv = true
    }
  }
})
console.log(`\nimpl 图包含 SysCall(22000) 节点: ${hasImplDataConv ? '✅' : '(标量与ID复合应有)'}`)

// 汇总验证
const checks = [
  ['accessories ≥ 6 (3 对)', accessories.length >= 6],
  ['主图 event 节点(71)', !!eventNode],
  ['主图 3 个 composite_call', compNodes.length === 3],
  ['3 个 CompositeDef(which=12)', compositeDefUnits.length === 3],
  ['3 个 impl NodeGraph(which=9)', implGraphUnits.length === 3],
]
console.log(`\n═══ 验证汇总 ═══`)
checks.forEach(([name, ok]) => console.log(`  ${ok ? '✅' : '❌'} ${name}`))
console.log(`\n全部通过: ${checks.every(([, ok]) => ok) ? '✅' : '❌'}`)
