/**
 * Dict node smoke: 构建含全部 5 个字典反射节点 + 2 个字典构造节点的
 * character_skill 图，IR -> GIA -> decode 后逐引脚断言 cid / type /
 * indexOfConcrete 与语料一致（键槽/值槽 ioc 表见 client_graph.ts
 * DICT_KEY_IOC_BY_IR / DICT_VALUE_IOC_BY_IR）。
 */
import assert from 'node:assert'
import fs from 'node:fs'

import { irToGia } from '../../src/compiler/ir_to_gia_transform/index.js'
import { buildClientGraphRegistriesIRDocuments, g } from '../../src/runtime/core.js'
import { vec3 } from '../../src/runtime/value.js'
import { decode_gia_file } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'

const PROTO_PATH =
  'src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto'
const OUT_FILE = 'tests/client_generated/smoke_dict_reflect_nodes.gia'

g.characterSkill({ id: 1082130440, name: 'DictNodes' }).on('start', (_evt, f) => {
  const self = f.getSelfEntity()
  // guid -> vec3：连线键 + 查询值
  const d1 = f.getCustomVariable(self, 'd1').asDict('guid', 'vec3')
  const posOfSelf = f.queryDictionaryValueByKey(d1, f.queryGuidByEntity(self))
  // int -> int_list：字面量键 + 列表值出参
  const d2 = f.getCustomVariable(self, 'd2').asDict('int', 'int_list')
  const scores = f.queryDictionaryValueByKey(d2, 5n)
  const first = f.getCorrespondingValueFromList(0n, scores)
  // entity -> int：值列表 / 键列表 / 包含键 / 包含值
  const d3 = f.getCustomVariable(self, 'd3').asDict('entity', 'int')
  const values = f.getListOfValuesFromDictionary(d3)
  const keys = f.getListOfKeysFromDictionary(d3)
  const hasKey = f.queryIfDictionaryContainsSpecificKey(d3, self)
  const hasValue = f.queryIfDictionaryContainsSpecificValue(d3, 7n)
  // 拼装字典：int 键 + vec3 值字面量（语料 字典_Integer到Vector_连线 同形；
  // vec3 标量重载与服务器一致要求类实例，裸 [x,y,z] 会命中 float_list）
  const d4 = f.assemblyDictionary([
    { k: 5n, v: new vec3([1, 2, 3]) },
    { k: 6n, v: new vec3([4, 5, 6]) }
  ])
  const posFromD4 = f.queryDictionaryValueByKey(d4, 5n)
  // 建立字典：连线 entity 键列表 + int 值列表（语料 建立字典_连线 同形）
  const d5 = f.createDictionary(keys, scores)
  const valueFromD5 = f.queryDictionaryValueByKey(d5, self)
  f.doubleBranch(
    hasKey,
    () => f.forceExitAimingState(),
    () =>
      f.doubleBranch(
        hasValue,
        () => f.forceExitAimingState(),
        () => {
          const sum = f.addition(first, f.getListLength(values))
          f.doubleBranch(
            f.equal(f.addition(sum, valueFromD5), 1n),
            () => f.forceExitAimingState(),
            () =>
              f.doubleBranch(
                f.equal(posOfSelf, [0, 0, 0]),
                () => f.forceExitAimingState(),
                () =>
                  f.doubleBranch(
                    f.equal(posFromD4, [0, 0, 0]),
                    () => f.forceExitAimingState(),
                    () => f.traverseEntityList(keys, () => f.forceExitAimingState())
                  )
              )
          )
        }
      )
  )
})

const doc = buildClientGraphRegistriesIRDocuments().find((d) =>
  d.graph.name?.includes('DictNodes')
)!
const bytes = irToGia(doc, { protoPath: PROTO_PATH })
fs.writeFileSync(OUT_FILE, bytes)
const decoded = decode_gia_file(OUT_FILE, undefined, true)
const nodes = decoded.graph.graph?.inner.graph?.nodes ?? []

type PinExpect = {
  kind: number
  index: number
  type: number
  /** ConcreteBase 包装引脚的 indexOfConcrete（与 plainInt 二选一） */
  ioc?: number
  innerSet?: boolean
  /** 非包装 int 引脚（如拼装节点 count）的 bInt 载荷 */
  plainInt?: number
}

function checkNode(label: string, gid: number, cid: number, pins: PinExpect[], nth = 0) {
  const matches = nodes.filter((n: any) => Number(n.genericId?.nodeId) === gid)
  const node = matches[nth]
  assert.ok(node, `${label}: node gid=${gid}#${nth} missing`)
  assert.strictEqual(Number(node.concreteId?.nodeId), cid, `${label}: concreteId`)
  for (const exp of pins) {
    const pin = (node.pins ?? []).find(
      (p: any) => Number(p.i1?.kind) === exp.kind && Number(p.i1?.index) === exp.index
    )
    assert.ok(pin, `${label}: pin k${exp.kind}#${exp.index} missing`)
    assert.strictEqual(Number(pin.type ?? 0), exp.type, `${label}: pin k${exp.kind}#${exp.index} type`)
    if (exp.plainInt !== undefined) {
      assert.strictEqual(
        Number(pin.value?.bInt?.val),
        exp.plainInt,
        `${label}: pin k${exp.kind}#${exp.index} plain int payload`
      )
      continue
    }
    assert.strictEqual(
      Number(pin.value?.bConcreteValue?.indexOfConcrete),
      exp.ioc,
      `${label}: pin k${exp.kind}#${exp.index} ioc`
    )
    if (exp.innerSet !== undefined) {
      assert.strictEqual(
        Boolean(pin.value?.bConcreteValue?.value?.alreadySetVal),
        exp.innerSet,
        `${label}: pin k${exp.kind}#${exp.index} innerSet`
      )
    }
  }
  console.log(`[ok] ${label}: cid=${cid}, ${pins.length} pins verified`)
}

// query gid=200154 cid=1050；两实例按 IR 声明顺序：d1(guid->vec3) 先、d2(int->int_list) 后
checkNode('query d1 guid->vec3', 200154, 1050, [
  { kind: 3, index: 0, type: 24, ioc: 0 },
  { kind: 3, index: 1, type: 14, ioc: 1, innerSet: false },
  { kind: 4, index: 0, type: 11, ioc: 7 }
])
checkNode(
  'query d2 int(literal 5)->int_list',
  200154,
  1050,
  [
    { kind: 3, index: 0, type: 24, ioc: 0 },
    { kind: 3, index: 1, type: 3, ioc: 2, innerSet: true },
    { kind: 4, index: 0, type: 4, ioc: 13 }
  ],
  1
)
// values gid=200158 cid=1055：int 值 -> out t4 ioc2
checkNode('values_list entity->int', 200158, 1055, [
  { kind: 3, index: 0, type: 24, ioc: 0 },
  { kind: 4, index: 0, type: 4, ioc: 2 }
])
// keys gid=200159 cid=1054：entity 键 -> out t2 ioc0
checkNode('keys_list entity->int', 200159, 1054, [
  { kind: 3, index: 0, type: 24, ioc: 0 },
  { kind: 4, index: 0, type: 2, ioc: 0 }
])
// contains_key gid=200155 cid=1051：entity 键连线 -> t1 ioc0
checkNode('contains_key entity', 200155, 1051, [
  { kind: 3, index: 0, type: 24, ioc: 0 },
  { kind: 3, index: 1, type: 1, ioc: 0 }
])
// contains_value gid=200156 cid=1052：int 字面量值 -> t3 ioc2
checkNode('contains_value int(literal 7)', 200156, 1052, [
  { kind: 3, index: 0, type: 24, ioc: 0 },
  { kind: 3, index: 1, type: 3, ioc: 2, innerSet: true }
])
// query d4 int(literal 5)->vec3（拼装字典产物）
checkNode(
  'query d4 int(literal 5)->vec3',
  200154,
  1050,
  [
    { kind: 3, index: 0, type: 24, ioc: 0 },
    { kind: 3, index: 1, type: 3, ioc: 2, innerSet: true },
    { kind: 4, index: 0, type: 11, ioc: 7 }
  ],
  2
)
// query d5 entity(连线)->int（建立字典产物）：标量 int 出参 t3 ioc2
checkNode(
  'query d5 entity->int',
  200154,
  1050,
  [
    { kind: 3, index: 0, type: 24, ioc: 0 },
    { kind: 3, index: 1, type: 1, ioc: 0, innerSet: false },
    { kind: 4, index: 0, type: 3, ioc: 2 }
  ],
  3
)
// assembly gid=200152 cid=1048：count = kv 参数总数（plain int，语料 拼装字典_连线 同形），
// 奇槽键 t3 ioc2 / 偶槽值 t11 ioc7，已填槽 innerSet=true，未用槽保持定型 unset
checkNode('assembly int->vec3 (2 pairs)', 200152, 1048, [
  { kind: 3, index: 0, type: 3, plainInt: 4 },
  { kind: 3, index: 1, type: 3, ioc: 2, innerSet: true },
  { kind: 3, index: 2, type: 11, ioc: 7, innerSet: true },
  { kind: 3, index: 3, type: 3, ioc: 2, innerSet: true },
  { kind: 3, index: 4, type: 11, ioc: 7, innerSet: true },
  { kind: 3, index: 5, type: 3, ioc: 2, innerSet: false },
  { kind: 3, index: 99, type: 3, ioc: 2, innerSet: false },
  { kind: 3, index: 100, type: 11, ioc: 7, innerSet: false },
  { kind: 4, index: 0, type: 24, ioc: 0 }
])
// create gid=200153 cid=1049：entity 键列表 t2 ioc0 + int 值列表 t4 ioc2（语料 建立字典_连线 同形）
checkNode('create entity_list+int_list', 200153, 1049, [
  { kind: 3, index: 0, type: 2, ioc: 0, innerSet: false },
  { kind: 3, index: 1, type: 4, ioc: 2, innerSet: false },
  { kind: 4, index: 0, type: 24, ioc: 0 }
])

fs.rmSync(OUT_FILE, { force: true })
console.log('[ok] dict node encoding verified (5 reflect + 2 build)')
