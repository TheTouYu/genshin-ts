// @ts-nocheck
/**
 * 复刻参考文件 类型转化-full.gia
 *
 * 目标：精确匹配游戏编辑器产出"创建复合节点(5)"的 7 种 data_type_conversion 类型。
 * 每个输入通过 dataTypeConversion 转为 str 后打印。
 *
 * 覆盖类型：
 *   int→str, float→str, bool→str, entity→str, guid→str, vec3→str, faction→str
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
// 参考:"创建复合节点(5)"——全覆盖类型转化
// 7 inputs: int, float, bool, entity, guid, vec3, faction
// 每个 → dataTypeConversion(str) → printString
// ═══════════════════════════════════════════════════════════════
const AllDtcComposite = g.defineComposite('全覆盖类型转化', {
  inputs: {
    整数: { type: 'int' },
    浮点数: { type: 'float' },
    布尔: { type: 'bool' },
    实体: { type: 'entity' },
    GUID: { type: 'guid' },
    三维向量: { type: 'vec3' },
    // 阵营: { type: 'faction' },  // dataTypeConversion 要求连线值（非字面量），capture 上下文不满足
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
console.log('✅ 全覆盖类型转化 id:', AllDtcComposite.id)

// 预处理
g.server({ name: 'prep' }).on('whenEntityIsCreated', () => {})
buildServerGraphRegistriesIRDocuments({ defaultName: 'prep' })

// 主图
g.server({ name: 'main', graphId: 1073741939 })
  .on('whenEntityIsCreated', (_e, f) => {
    f.callComposite(AllDtcComposite, {
      整数: new int(42),
      浮点数: new float(3.14),
      布尔: new bool(true),
      实体: new entityLiteral(0),
      GUID: new guid(12345n),
      三维向量: new vec3([1, 2, 3]),
    })
  })

// 构建 IR + 生成 GIA
const docs = buildServerGraphRegistriesIRDocuments({ defaultName: 'main' })
const doc = docs[docs.length - 1]
const bytes = irToGia(doc, { graphId: 1073741939, name: '全覆盖类型转化', protoPath: PROTO_PATH })
const outPath = `${OUT_DIR}/全覆盖类型转化.gia`
writeFileSync(outPath, Buffer.from(bytes))
console.log(`✅ 已生成: ${outPath}  (${bytes.length} 字节)`)

// 解码验证
console.log('\n═══ 解码验证 ═══')
const gen = decode_gia_file(outPath, PROTO_PATH)

// 验证 accessories
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
  }
  // 打印 Impl 图中 DTC 节点的 cid 和 InParam type
  if (acc[i].which === 9 || acc[i].which === 'EntityNode') {
    const g = acc[i].graph?.inner?.graph ?? {}
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
const ref = decode_gia_file('/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/user_edit/类型转化-full.gia', PROTO_PATH)
const refAcc = ref.accessories ?? []
for (let i = 0; i < refAcc.length; i++) {
  if (refAcc[i].which === 9 || refAcc[i].which === 'EntityNode') {
    const g = refAcc[i].graph?.inner?.graph ?? {}
    console.log('\n参考文件 Impl 图 DTC 节点:')
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
