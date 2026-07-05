// @ts-nocheck
/**
 * 复刻参考文件 类型转化-full-v2.gia
 *
 * v2 在 v1（全覆盖 DTC 类型转化）基础上增加了"列表操作"复合：
 *   2 个 int 输入 → assemblyList（组装 100 元素列表）
 *   → listIterationLoop（逐元素 DTC int→str → printString）
 *   → getNodeGraphVariable（读取图变量"字符串列表"）
 *   → listIterationLoop → printString
 *
 * 目标：精确匹配游戏编辑器产出的 GIA 编码。
 */
import { g, buildServerGraphRegistriesIRDocuments } from '../../dist/src/runtime/core.js'
import {
  bool, int, float, str, vec3, guid, entity,
  prefabId, configId, faction,
  entityLiteral
} from '../../dist/src/runtime/value.js'
import { irToGia } from '../../dist/src/compiler/ir_to_gia_transform/index.js'
import { decode_gia_file } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'
import { writeFileSync, mkdirSync, existsSync } from 'fs'

const PROTO_PATH = new URL('../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto', import.meta.url).pathname
const OUT_DIR = './tests/composite/output'
if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true })

// ═══════════════════════════════════════════════════════════════
// Composite 1: 全覆盖类型转化（复刻"创建复合节点(5)"）
// 7 inputs: int, float, bool, entity, guid, vec3, faction
// 每个 → dataTypeConversion(str) → printString
// ═══════════════════════════════════════════════════════════════
const AllDtcComposite = g.defineComposite('创建复合节点(5)', {
  inputs: {
    整数: { type: 'int' },
    浮点数: { type: 'float' },
    布尔: { type: 'bool' },
    实体: { type: 'entity' },
    GUID: { type: 'guid' },
    三维向量: { type: 'vec3' },
    // 阵营: { type: 'faction' },  // dataTypeConversion 要求连线值，capture 上下文不满足
  },
  outputs: {},
  build({ 整数, 浮点数, 布尔, 实体, GUID, 三维向量 }, f) {
    f.printString(f.dataTypeConversion(整数, 'str'))
    f.printString(f.dataTypeConversion(浮点数, 'str'))
    f.printString(f.dataTypeConversion(布尔, 'str'))
    f.printString(f.dataTypeConversion(实体, 'str'))
    f.printString(f.dataTypeConversion(GUID, 'str'))
    f.printString(f.dataTypeConversion(三维向量, 'str'))
    return {}
  }
})
console.log('✅ DTC 复合 id:', AllDtcComposite.id)

// ═══════════════════════════════════════════════════════════════
// Composite 2: 列表操作（复刻"列表操作"）
// 2 个 int 输入 → 组装列表 → 迭代 → DTC → 打印
// 复合内部读取图变量"字符串列表" → 迭代 → 打印
const ListComposite = g.defineComposite('列表操作', {
  inputs: {
    输入0: { type: 'int' },
    输入1: { type: 'int' },
  },
  outputs: {},
  variables: {
    '字符串列表': list('str', ['asd']),
  },
  build({ 输入0, 输入1 }, f) {
    // Flow 1: 组装 2 元素列表（两个 int 输入）→ 迭代 → DTC → print
    const assembledList = f.assemblyList([输入0 as int, 输入1 as int], 'int')
    f.listIterationLoop(assembledList, (item) => {
      f.printString(f.dataTypeConversion(item, 'str'))
    })

    // Flow 2: 读取图变量"字符串列表" → 逐元素 print
    f.listIterationLoop(f.get('字符串列表') as any, (item: any) => {
      f.printString(item)
    })

    return {}
  }
})
console.log('✅ 列表复合 id:', ListComposite.id)

// ═══════════════════════════════════════════════════════════════
// 预处理：所有复合必须先捕获，再使用
// ═══════════════════════════════════════════════════════════════
g.server({ name: 'prep' }).on('whenEntityIsCreated', () => {})
buildServerGraphRegistriesIRDocuments({ defaultName: 'prep' })

// ═══════════════════════════════════════════════════════════════
// 主图：调用所有复合节点（使用 fork 实现 Event 并行分支）
// ═══════════════════════════════════════════════════════════════
g.server({ name: 'main', graphId: 1073741939 })
  .on('whenEntityIsCreated', (_e, f) => {
    f.fork(
      () => f.callComposite(AllDtcComposite, {
        整数: new int(42),
        浮点数: new float(3.14),
        布尔: new bool(true),
        实体: new entityLiteral(0),
        GUID: new guid(12345n),
        三维向量: new vec3([1, 2, 3]),
      }),
      () => f.callComposite(ListComposite, {
        输入0: new int(12),
        输入1: new int(23),
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

// 检查 IR compositeDefs
console.log(`\n═══ 复合定义 (${doc.compositeDefs?.length ?? 0}) ═══`)
doc.compositeDefs?.forEach((cd) => {
  const inputs = cd.inputs.map((i) => `${i.name}:${i.type}`).join(', ')
  console.log(`  ${cd.name} id=${cd.id} inputs=[${inputs}]`)
  console.log(`    implNodes=${cd.implNodes?.length ?? 0} compositePins=${cd.compositePins?.length ?? 0}`)
})

// 生成 GIA 文件
const bytes = irToGia(doc, { graphId: 1073741939, name: '类型转化-full-v2', protoPath: PROTO_PATH })
const outPath = `${OUT_DIR}/类型转化-full-v2.gia`
writeFileSync(outPath, Buffer.from(bytes))
console.log(`\n✅ 已生成: ${outPath}  (${bytes.length} 字节)`)

// ═══════════════════════════════════════════════════════════════
// 解码验证
// ═══════════════════════════════════════════════════════════════
console.log('\n═══ 解码验证 ═══')
const gen = decode_gia_file(outPath, PROTO_PATH)

// 1. 验证 accessories
const acc = gen.accessories ?? []
console.log(`accessories: ${acc.length}`)

// 打印 CompositeDef
for (let i = 0; i < acc.length; i++) {
  if (acc[i].which === 12 || acc[i].which === 'CompositeGraph') {
    const cd = acc[i].compositeDef?.inner?.def ?? {}
    console.log(`\n复合: ${cd.name} (id=${cd.id?.genericId?.id})`)
    console.log(`  inputs: ${cd.inputs?.length ?? 0}`)
    for (const inp of cd.inputs ?? []) {
      console.log(`    [${inp.index?.index}] '${inp.name}' type={class=${inp.type?.class}, type1=${inp.type?.type1}} pinIndex=${inp.pinIndex}`)
    }
    console.log(`  outputs: ${cd.outputs?.length ?? 0}`)
    console.log(`  inflows: ${cd.inflows?.length ?? 0}  outflows: ${cd.outflows?.length ?? 0}`)
  }
}

// 打印 Impl 图 DTC 节点（与参考对比）
console.log('\n═══ 生成 Impl 图 DTC 节点 ═══')
for (const a of acc) {
  if (a.which === 9 || a.which === 'EntityNode') {
    const g = a.graph?.inner?.graph ?? {}
    for (const n of g.nodes ?? []) {
      const gid = n.genericId?.nodeId
      const cid = n.concreteId?.nodeId
      if (gid === 180) {
        const inp = n.pins?.find(p => p.i1?.kind === 3)
        const outp = n.pins?.find(p => p.i1?.kind === 4)
        const idx = inp?.value?.bConcreteValue?.indexOfConcrete
        const oidx = outp?.value?.bConcreteValue?.indexOfConcrete
        const typeName = {3:'Int',1:'Ety',2:'Gid',4:'Bol',5:'Flt',12:'Vec',17:'Fct'}[inp?.type] || inp?.type
        console.log(`  n${n.nodeIndex}: gid=${gid} cid=${cid} In(type=${typeName} idx=${idx}) Out(idx=${oidx})`)
      }
    }
  }
}

// 与参考文件对比
console.log('\n═══ 参考文件对比 ═══')
const ref = decode_gia_file('/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/user_edit/类型转化-full-v2.gia', PROTO_PATH)
const refAcc = ref.accessories ?? []
console.log('\n参考文件 CompositeDef:')
for (const a of refAcc) {
  if (a.which === 12 || a.which === 'CompositeGraph') {
    const cd = a.compositeDef?.inner?.def ?? {}
    console.log(`\n  复合: ${cd.name}`)
    console.log(`  inputs: ${cd.inputs?.length ?? 0}`)
    for (const inp of cd.inputs ?? []) {
      console.log(`    [${inp.index?.index}] '${inp.name}' type={class=${inp.type?.class}, type1=${inp.type?.type1}} pinIndex=${inp.pinIndex}`)
    }
  }
}
console.log('\n参考文件 Impl 图 DTC 节点:')
for (const a of refAcc) {
  if (a.which === 9 || a.which === 'EntityNode') {
    const g = a.graph?.inner?.graph ?? {}
    for (const n of g.nodes ?? []) {
      const gid = n.genericId?.nodeId
      const cid = n.concreteId?.nodeId
      if (gid === 180) {
        const inp = n.pins?.find(p => p.i1?.kind === 3)
        const outp = n.pins?.find(p => p.i1?.kind === 4)
        const idx = inp?.value?.bConcreteValue?.indexOfConcrete
        const oidx = outp?.value?.bConcreteValue?.indexOfConcrete
        const typeName = {3:'Int',1:'Ety',2:'Gid',4:'Bol',5:'Flt',12:'Vec',17:'Fct'}[inp?.type] || inp?.type
        console.log(`  n${n.nodeIndex}: gid=${gid} cid=${cid} In(type=${typeName} idx=${idx}) Out(idx=${oidx})`)
      }
    }
  }
}

// 验证结论
const ourDtcNodes = []
for (const a of acc) {
  if (a.which === 9 || a.which === 'EntityNode') {
    for (const n of a.graph?.inner?.graph?.nodes ?? []) {
      if (n.genericId?.nodeId === 180) {
        const inp = n.pins?.find(p => p.i1?.kind === 3)
        ourDtcNodes.push({ nid: n.concreteId?.nodeId, inType: inp?.type, inIdx: inp?.value?.bConcreteValue?.indexOfConcrete })
      }
    }
  }
}
console.log(`\n✅ 共 ${ourDtcNodes.length} 个 DTC 节点`)
const allOk = ourDtcNodes.every(n => n.nid !== 180 && n.nid !== undefined)
console.log(`所有 DTC 节点都有具体 concreteId: ${allOk ? '✅' : '❌'}`)
console.log(`\n生成 accessories: ${acc.length}  | 参考 accessories: ${refAcc.length}`)
