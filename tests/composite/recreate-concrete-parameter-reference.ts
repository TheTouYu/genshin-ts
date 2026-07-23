// @ts-nocheck
/**
 * 按 user_edit/复合节点/复合节点需要具体参数类型.gia 的主图和 Composite impl
 * 做同构复刻。此脚本只用于生成 A/B 对比样本，不修改参考文件。
 */
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'

import { g, buildServerGraphRegistriesIRDocuments } from '../../dist/src/runtime/core.js'
import { irToGia } from '../../dist/src/compiler/ir_to_gia_transform/index.js'
import { decode_gia_file } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'
import { int } from '../../dist/src/runtime/value.js'

const PROTO_PATH = new URL(
  '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto',
  import.meta.url
).pathname
const OUT_PATH = 'tests/composite/output/复合节点需要具体参数类型-复刻.gia'

const concreteParamComposite = g.defineComposite('复合节点需要具体类型参数', {
  inputs: {
    目标实体: { type: 'entity' },
    左值: { type: 'int', name: '' },
    比较左值: { type: 'int', name: '' },
    右值: { type: 'int', name: '右值' }
  },
  build({ 目标实体, 左值, 比较左值, 右值 }, f) {
    const sum = f.addition(左值, 比较左值)
    const result = f.greaterThanOrEqualTo(sum, 右值)
    目标实体.set('测试', result)
  }
})

g.server({ name: '新建节点图', id: 1073741829 }).on(
  'whenEntityIsCreated',
  (event, f) => {
    const target = event.eventSourceEntity
    const sum = f.addition(new int(1), new int(2))
    const result = f.greaterThanOrEqualTo(sum, new int(3))
    target.set('测试', result)

    // 参考文件中的 Composite 调用位于主图尾部，避免把后续节点误识别为
    // Composite OutFlow continuation；参考文件本身没有声明 OutFlow。
    f.callComposite(concreteParamComposite, {
      目标实体: target,
      左值: new int(10),
      比较左值: new int(20),
      右值: new int(30)
    })
  }
)

const doc = buildServerGraphRegistriesIRDocuments({ defaultName: '新建节点图' }).at(-1)
assert.ok(doc)
mkdirSync('tests/composite/output', { recursive: true })
const bytes = irToGia(doc, {
  graphId: 1073741829,
  name: '新建节点图',
  protoPath: PROTO_PATH
})
writeFileSync(OUT_PATH, Buffer.from(bytes))

const decoded = decode_gia_file(OUT_PATH, PROTO_PATH)
console.log(`输出: ${OUT_PATH}`)
console.log(`大小: ${bytes.length} 字节`)
console.log(JSON.stringify(summarize(decoded), null, 2))

function summarize(gia: any) {
  const accessories = gia.accessories ?? []
  return {
    defs: accessories.filter((x: any) => x.which === 12).map((x: any) => {
      const def = x.compositeDef?.inner?.def
      return {
        name: def?.name,
        inflows: def?.inflows,
        inputs: def?.inputs?.map((p: any) => ({ name: p.name, index: p.index, type: p.type, pinIndex: p.pinIndex })),
        outputs: def?.outputs
      }
    }),
    impls: accessories.filter((x: any) => x.which === 9).map((x: any) => {
      const graph = x.graph?.inner?.graph
      return {
        id: x.id?.id,
        nodes: graph?.nodes?.map((n: any) => ({
          nodeIndex: n.nodeIndex,
          genericId: n.genericId?.nodeId,
          concreteId: n.concreteId?.nodeId,
          pins: n.pins?.map((p: any) => ({
            kind: p.i1?.kind,
            index: p.i1?.index,
            type: p.type,
            valueClass: p.value?.class,
            concreteIndex: p.value?.bConcreteValue?.indexOfConcrete,
            innerValueClass: p.value?.bConcreteValue?.value?.class,
            connects: p.connects
          }))
        })),
        compositePins: graph?.compositePins
      }
    }),
    main: gia.graph?.graph?.inner?.graph?.nodes?.map((n: any) => ({
      nodeIndex: n.nodeIndex,
      genericId: n.genericId?.nodeId,
      concreteId: n.concreteId?.nodeId,
      pins: n.pins?.map((p: any) => ({
        kind: p.i1?.kind,
        index: p.i1?.index,
        type: p.type,
        compositePinIndex: p.compositePinIndex,
        concreteIndex: p.value?.bConcreteValue?.indexOfConcrete,
        connects: p.connects
      }))
    }))
  }
}
